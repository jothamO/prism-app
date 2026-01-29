/**
 * Action Service - V23 Action Layer
 * 
 * Enables AI to take actions on behalf of the user during chat.
 * Actions are structured commands that the AI can propose and execute.
 * 
 * Supported Actions:
 * - action.drafts.create: Create invoice/filing drafts
 * - action.memory.remember: Store facts (delegates to memory-service)
 * - action.deadline.remind: Set reminder for deadline
 */

import { getSupabaseAdmin } from './supabase.ts';
import { addRememberedFact, type Channel } from './memory-service.ts';

// ============= Types =============

export interface ActionRequest {
    action: string;
    params: Record<string, unknown>;
    userId: string;
    channel: Channel;
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
}

export interface InvoiceDraftParams {
    customerName: string;
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
    }>;
    notes?: string;
}

export interface RememberParams {
    fact: string;
}

export interface ReminderParams {
    deadlineId: string;
    reminderDays: number; // Days before deadline to remind
}

// ============= Action Registry =============

const ACTION_HANDLERS: Record<string, (req: ActionRequest) => Promise<ActionResult>> = {
    'action.drafts.create': handleCreateDraft,
    'action.memory.remember': handleRemember,
    'action.deadline.remind': handleSetReminder,
};

// ============= Main Entry Point =============

/**
 * Execute an action requested by the AI
 */
export async function executeAction(request: ActionRequest): Promise<ActionResult> {
    console.log(`[action-service] Executing action: ${request.action}`);

    const handler = ACTION_HANDLERS[request.action];
    if (!handler) {
        return {
            success: false,
            message: `Unknown action: ${request.action}. Available actions: ${Object.keys(ACTION_HANDLERS).join(', ')}`
        };
    }

    try {
        const result = await handler(request);
        console.log(`[action-service] Action ${request.action} completed: ${result.success}`);
        return result;
    } catch (error) {
        console.error(`[action-service] Action ${request.action} failed:`, error);
        return {
            success: false,
            message: `Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

// ============= Action Handlers =============

/**
 * Create an invoice draft
 */
async function handleCreateDraft(request: ActionRequest): Promise<ActionResult> {
    const params = request.params as unknown as InvoiceDraftParams;

    if (!params.customerName || !params.items?.length) {
        return {
            success: false,
            message: 'Invoice draft requires customerName and at least one item'
        };
    }

    const supabase = getSupabaseAdmin();

    // Calculate totals
    const subtotal = params.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const vatAmount = subtotal * 0.075; // 7.5% VAT
    const total = subtotal + vatAmount;

    // Create draft invoice
    const { data, error } = await supabase
        .from('invoices')
        .insert({
            user_id: request.userId,
            customer_name: params.customerName,
            items: params.items,
            subtotal,
            vat_amount: vatAmount,
            total,
            date: new Date().toISOString().split('T')[0],
            period: new Date().toISOString().slice(0, 7),
            status: 'draft',
            source: 'ai_generated',
            needs_review: true,
            review_reasons: ['AI-generated draft - please review before sending']
        })
        .select('id, invoice_number')
        .single();

    if (error) {
        return {
            success: false,
            message: `Failed to create draft: ${error.message}`
        };
    }

    return {
        success: true,
        message: `Invoice draft created for ${params.customerName}. Total: ₦${total.toLocaleString()}. Please review in your dashboard.`,
        data: {
            invoiceId: data.id,
            invoiceNumber: data.invoice_number,
            total,
            status: 'draft'
        }
    };
}

/**
 * Remember a fact about the user
 */
async function handleRemember(request: ActionRequest): Promise<ActionResult> {
    const params = request.params as unknown as RememberParams;

    if (!params.fact) {
        return {
            success: false,
            message: 'No fact provided to remember'
        };
    }

    await addRememberedFact(request.userId, params.fact, 'chat', request.channel);

    return {
        success: true,
        message: `Got it! I'll remember: "${params.fact}"`
    };
}

/**
 * Set a reminder for an upcoming deadline
 */
async function handleSetReminder(request: ActionRequest): Promise<ActionResult> {
    const params = request.params as unknown as ReminderParams;

    if (!params.deadlineId) {
        return {
            success: false,
            message: 'No deadline specified for reminder'
        };
    }

    const supabase = getSupabaseAdmin();

    // Check if deadline exists
    const { data: deadline, error: deadlineError } = await supabase
        .from('tax_deadlines')
        .select('id, title')
        .eq('id', params.deadlineId)
        .single();

    if (deadlineError || !deadline) {
        return {
            success: false,
            message: 'Deadline not found'
        };
    }

    // Store reminder preference
    const { error } = await supabase
        .from('user_preferences')
        .upsert({
            user_id: request.userId,
            deadline_reminders: supabase.sql`
                COALESCE(deadline_reminders, '{}'::jsonb) || 
                jsonb_build_object(${params.deadlineId}::text, ${params.reminderDays || 3})
            `
        }, {
            onConflict: 'user_id'
        });

    if (error) {
        return {
            success: false,
            message: `Failed to set reminder: ${error.message}`
        };
    }

    return {
        success: true,
        message: `Reminder set for "${deadline.title}" - I'll notify you ${params.reminderDays || 3} days before.`
    };
}

// ============= Action Extraction =============

/**
 * Extract action intents from AI response
 * The AI can embed action commands in a structured format
 */
export function extractActionsFromResponse(response: string): ActionRequest[] {
    const actionPattern = /\[ACTION:(\w+\.\w+\.\w+)\s+({[^}]+})\]/g;
    const actions: ActionRequest[] = [];

    let match;
    while ((match = actionPattern.exec(response)) !== null) {
        try {
            const action = match[1];
            const params = JSON.parse(match[2]);
            actions.push({
                action,
                params,
                userId: '', // Will be filled by caller
                channel: 'web'
            });
        } catch {
            console.warn('[action-service] Failed to parse action:', match[0]);
        }
    }

    return actions;
}

/**
 * Clean action markers from response before sending to user
 */
export function cleanResponseActions(response: string): string {
    return response.replace(/\[ACTION:\w+\.\w+\.\w+\s+{[^}]+}\]/g, '').trim();
}
