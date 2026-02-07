/**
 * Agent Nervous System Orchestrator
 * The control plane bridging Claude's reasoning with Monty's execution.
 */

import { aiClient } from '../utils/ai-client';
import { Monty, MontySnapshot, MontyComplete, MontyException } from '@pydantic/monty';
import { externalFunctions } from './external-functions';
import { SnapshotManager } from './snapshot-manager';
import { PendingApproval } from './errors';
import { logger } from '../utils/logger';
import { config } from '../config';
import { MemoryManager } from './memory-manager';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Function schema defines positional argument order for kwargs mapping.
 */
const FUNCTION_SCHEMA: Record<string, string[]> = {
    calculate_ytd: ['user_id'],
    get_thresholds: ['user_id'],
    query_tax_law: ['question'],
    get_active_facts: ['user_id', 'layer'],
    store_atomic_fact: ['user_id', 'layer', 'entity_name', 'fact_content'], // confidence optional
    create_optimization_hint: ['user_id', 'hint_type', 'details'],
    auto_tag_transaction: ['user_id', 'transaction_id', 'suggested_category'],
    reclassify_transaction: ['user_id', 'transaction_id', 'new_category', 'reason'],
    create_project_draft: ['user_id', 'project_name', 'estimated_revenue'],
    file_vat_registration: ['user_id', 'business_details'],
    submit_tax_return: ['user_id', 'year', 'return_data']
};

export interface ExecutionResult {
    status: 'completed' | 'paused' | 'failed';
    output?: any;
    snapshot_id?: string;
    error?: string;
}

export class Orchestrator {
    private personality: string;
    private soul: string;
    private typeStubs: string;

    constructor() {
        // Load stubs and personality for prompt injection
        this.personality = fs.readFileSync(
            path.join(__dirname, '../../PRISM_PERSONALITY.md'),
            'utf-8'
        );
        this.soul = fs.readFileSync(
            path.join(__dirname, '../../../openclaw/workspace/SOUL.md'),
            'utf-8'
        );
        this.typeStubs = fs.readFileSync(
            path.join(__dirname, './type-stubs.py'),
            'utf-8'
        );
    }

    /**
     * Start a new agent execution cycle.
     */
    async runCycle(user_id: string, user_message: string, context: any = {}): Promise<ExecutionResult> {
        logger.info('[Orchestrator] Starting cycle', { user_id });

        // 0. Perception Phase: Fetch active PARA facts (capped to 10 to manage prompt size)
        const facts = (await MemoryManager.getActiveFacts(user_id)).slice(0, 10);
        const enrichedContext = {
            ...context,
            atomic_facts: facts.map(f => ({
                layer: f.layer,
                entity: f.entity_name,
                content: f.fact_content
            }))
        };

        // 1. Construct System Prompt
        const systemPrompt = this.buildSystemPrompt(enrichedContext, user_id);

        // 2. Call Claude (Reasoning Tier) to generate Python code
        const response = await aiClient.chat({
            tier: 'reasoning',
            maxTokens: config.ai.maxTokens,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: user_message }
            ]
        });

        // 3. Extract Python code from Claude's response
        const pythonCode = this.extractPythonCode(response);
        if (!pythonCode) {
            return { status: 'completed', output: response }; // Regular conversational response
        }

        // 4. Execute in Monty
        return await this.executeInMonty(user_id, pythonCode);
    }

    /**
     * Resume a paused execution from a snapshot.
     */
    async resumeCycle(snapshot_id: string, returnValue?: any): Promise<ExecutionResult> {
        const { snapshot, user_id, function_name, args } = await SnapshotManager.loadSnapshot(snapshot_id);

        logger.info('[Orchestrator] Resuming cycle', { snapshot_id, function_name });

        try {
            const nextState = snapshot.resume({ returnValue });
            await SnapshotManager.markResumed(snapshot_id);
            return await this.handleMontyState(user_id, nextState);
        } catch (error) {
            return { status: 'failed', error: (error as Error).message };
        }
    }

    private buildSystemPrompt(context: any, user_id: string): string {
        return `
${this.soul}

${this.personality}

You are the PRISM Agentic Core. You think in Python.
When a user asks you to do something complex (tax calcs, research, transactions), you MUST generate a Python script to perform the task.

### AVAILABLE EXTERNAL FUNCTIONS
To interact with the PRISM ecosystem, use the following functions. They are already imported in your environment.

\`\`\`python
${this.typeStubs}
\`\`\`

### RULES FOR CODE GENERATION
1. **Do NOT use await**: All external functions pause execution automatically.
2. **User Context**: The variable 'user_id' is already provided in your environment as "${user_id}".
3. **No host access**: You cannot use 'os', 'sys', or 'fs'. Use only the provided external functions.
4. **Think before you act**: Explanin your reasoning step-by-step.
5. **Output**: The last expression in your script is the final result.

### CURRENT CONTEXT
- User ID: ${user_id}
- Business Context: ${JSON.stringify(context)}

Wrap your Python code in \`\`\`python code blocks.
`.trim();
    }

    private extractPythonCode(text: string): string | null {
        const match = text.match(/```python\n([\s\S]*?)\n```/);
        return match ? match[1] : null;
    }

    private async executeInMonty(user_id: string, code: string): Promise<ExecutionResult> {
        logger.info('[Orchestrator] Executing Monty script', { user_id, codeSize: code.length });

        const monty = Monty.create(code, {
            scriptName: 'agent_task.py',
            inputs: ['user_id'],
            externalFunctions: Object.keys(externalFunctions)
        });

        if (!(monty instanceof Monty)) {
            return { status: 'failed', error: 'Code validation failed (e.g. syntax error)' };
        }

        const state = monty.start({
            inputs: { user_id }
        });

        return await this.handleMontyState(user_id, state);
    }

    private async handleMontyState(user_id: string, state: any): Promise<ExecutionResult> {
        // Base case: Execution completed
        if (state instanceof MontyComplete) {
            return { status: 'completed', output: state.output };
        }

        // Base case: Execution failed
        if (state instanceof MontyException) {
            return { status: 'failed', error: state.message };
        }

        // Recursive case: Paused at External Function call
        if (state instanceof MontySnapshot) {
            const funcName = state.functionName;
            const args = state.args;
            const kwargs = state.kwargs;

            logger.info('[Orchestrator] External function call', { funcName, args, kwargs });

            try {
                // Call the actual TypeScript implementation
                const implementation = (externalFunctions as any)[funcName];
                if (!implementation) throw new Error(`External function ${funcName} not found`);

                // Map kwargs to positional args using schema
                let result;
                if (args.length > 0) {
                    result = await implementation(...args);
                } else if (Object.keys(kwargs).length > 0) {
                    const schema = FUNCTION_SCHEMA[funcName];
                    if (schema) {
                        const orderedArgs = schema.map(key => (kwargs as Record<string, any>)[key]);
                        result = await implementation(...orderedArgs);
                    } else {
                        // Fallback: pass as single object if no schema
                        result = await implementation(kwargs);
                    }
                } else {
                    result = await implementation();
                }

                // Resume Monty with the result
                const nextState = state.resume({ returnValue: result });
                return await this.handleMontyState(user_id, nextState);

            } catch (error) {
                // Handle special PendingApproval gate
                if (error instanceof PendingApproval) {
                    const snapshot_id = await SnapshotManager.saveSnapshot(state, {
                        user_id,
                        pending_function_name: error.details.function_name,
                        pending_args: error.details.args,
                        autonomy_tier: error.tier === 'tier_3' ? 3 : 4
                    });

                    return {
                        status: 'paused',
                        snapshot_id,
                        output: `Action ${funcName} requires your approval. I've saved my state.`
                    };
                }

                // Regular error: Pass back to Monty as a Python exception
                const nextState = state.resume({
                    exception: { type: 'RuntimeError', message: (error as Error).message }
                });
                return await this.handleMontyState(user_id, nextState);
            }
        }

        return { status: 'failed', error: 'Unknown Monty state' };
    }
}

export const orchestrator = new Orchestrator();
