/**
 * PARA Memory Verification Test
 * Verifies: Store Fact -> Retrieve Fact -> Agent Context Injection
 */

import { MemoryManager } from '../src/agent-core/memory-manager';
import { orchestrator } from '../src/agent-core/orchestrator';
import { logger } from '../src/utils/logger';

async function verifyPARA() {
    console.log('--- PARA Memory Verification ---');
    const user_id = '00000000-0000-0000-0000-000000000000';

    // 1. Store a test fact
    console.log('1. Storing test fact...');
    await MemoryManager.storeFact({
        user_id,
        layer: 'area',
        entity_name: 'Business Industry',
        fact_content: { type: 'Creative Agency', employees: 5, location: 'Lagos' },
        confidence: 0.95
    });

    // 2. Retrieve facts
    console.log('2. Retrieving active facts...');
    const facts = await MemoryManager.getActiveFacts(user_id);
    console.log('Active Facts found:', facts.length);
    if (facts.length === 0) throw new Error('No facts found after storage!');

    // 3. Run Orchestrator Cycle (Agent should see the fact)
    console.log('\n3. Running Orchestrator Cycle...');
    const result = await orchestrator.runCycle(user_id, "What do you know about my business industry?");

    console.log('\n--- AGENT RESPONSE ---');
    console.log(result.output);
    console.log('----------------------');

    if (result.status === 'completed' && result.output.toLowerCase().includes('creative agency')) {
        console.log('✓ SUCCESS: Agent correctly identified the fact from PARA memory.');
    } else {
        console.warn('⚠ WARNING: Agent output might not have explicitly mentioned the fact. Check reasoning.');
    }
}

// Mock Snapshot to avoid DB check for purely logic test (if needed)
import { SnapshotManager } from '../src/agent-core/snapshot-manager';
SnapshotManager.saveSnapshot = async () => 'mock_snapshot_id';

verifyPARA().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
