/**
 * Orchestrator End-to-End Verification
 * Verifies: Claude -> Monty -> External Func -> Paging/Pausing
 */

import { orchestrator } from '../src/agent-core/orchestrator';
import { SnapshotManager } from '../src/agent-core/snapshot-manager';
import { externalFunctions } from '../src/agent-core/external-functions';
import { logger } from '../src/utils/logger';

async function verifyNervousSystem() {
    console.log('--- Orchestrator E2E Verification ---');

    // Mock DB functions to stay in "Pure Logic" mode
    (externalFunctions as any).calculate_ytd = async () => ({
        revenue: 2_500_000,
        expenses: 500_000,
        vat_paid: 187_500,
        pit_paid: 0
    });

    SnapshotManager.saveSnapshot = async () => "mock_snapshot_uuid";

    const user_id = '00000000-0000-0000-0000-000000000000'; // Mock user
    const user_msg = "Please check my YTD revenue. Also, I noticed a transaction 'tx_shopify_001' that should be 'Marketing' - please reclassify it if my revenue is above ₦1M.";

    console.log('1. Dispatching user request to Orchestrator...');
    const result = await orchestrator.runCycle(user_id, user_msg, {
        current_year: 2026,
        business_type: 'Creative Agency'
    });

    console.log('\n2. Processing Result:');
    console.log('Status:', result.status);

    if (result.status === 'paused') {
        console.log('✓ SUCCESS: Execution paused at Tier 3 gate.');
        console.log('Snapshot ID:', result.snapshot_id);
        console.log('Agent Response:', result.output);

        // Verify Snapshot persistence
        const pending = await SnapshotManager.listPending(user_id);
        if (pending.length > 0) {
            console.log('✓ SUCCESS: Snapshot confirmed in Database.');
        } else {
            console.error('✘ FAILURE: Snapshot not found in Database!');
        }
    } else if (result.status === 'completed') {
        console.log('Agent completed without pausing. Output:', result.output);
    } else {
        console.error('✘ FAILURE: Orchestrator failed:', result.error);
    }
}

verifyNervousSystem().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
