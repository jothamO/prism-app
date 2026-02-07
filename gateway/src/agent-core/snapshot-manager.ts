/**
 * Snapshot Manager
 * Standardized logic for saving/loading Monty snapshots to Supabase.
 * Enables durable agent execution across async approval cycles.
 */

import { supabase } from '../config';
import { Monty, MontySnapshot } from '@pydantic/monty';
import { logger } from '../utils/logger';

export interface SnapshotMetadata {
    user_id: string;
    pending_function_name: string;
    pending_args: any;
    autonomy_tier: number;
}

export class SnapshotManager {
    /**
     * Persist a Monty snapshot to the database.
     * Called when an external function throws PendingApproval.
     */
    static async saveSnapshot(
        snapshot: MontySnapshot,
        metadata: SnapshotMetadata
    ): Promise<string> {
        const snapshotData = snapshot.dump();

        logger.info('[SnapshotManager] saving snapshot', {
            user_id: metadata.user_id,
            function: metadata.pending_function_name,
            size: snapshotData.length
        });

        const { data, error } = await supabase
            .from('agent_snapshots')
            .insert({
                user_id: metadata.user_id,
                snapshot_data: snapshotData,
                pending_function_name: metadata.pending_function_name,
                pending_args: metadata.pending_args,
                autonomy_tier: metadata.autonomy_tier,
                status: 'pending_approval'
            })
            .select('id')
            .single();

        if (error) {
            logger.error('[SnapshotManager] fail to save snapshot', error);
            throw error;
        }

        return data.id;
    }

    /**
     * List all pending snapshots for a user.
     */
    static async listPending(user_id: string) {
        const { data, error } = await supabase
            .from('agent_snapshots')
            .select('*')
            .eq('user_id', user_id)
            .eq('status', 'pending_approval');

        if (error) throw error;
        return data;
    }

    /**
     * Load and resume a snapshot.
     * Returns a MontySnapshot instance ready for resume().
     */
    static async loadSnapshot(snapshot_id: string): Promise<{
        snapshot: MontySnapshot;
        user_id: string;
        function_name: string;
        args: any;
    }> {
        logger.info('[SnapshotManager] loading snapshot', { snapshot_id });

        const { data, error } = await supabase
            .from('agent_snapshots')
            .select('*')
            .eq('id', snapshot_id)
            .single();

        if (error) throw error;
        if (!data) throw new Error('Snapshot not found');

        // Restore from binary
        const snapshot = MontySnapshot.load(data.snapshot_data);

        return {
            snapshot,
            user_id: data.user_id,
            function_name: data.pending_function_name,
            args: data.pending_args
        };
    }

    /**
     * Mark a snapshot as resumed/completed.
     */
    static async markResumed(snapshot_id: string): Promise<void> {
        await supabase
            .from('agent_snapshots')
            .update({ status: 'resumed', updated_at: new Date().toISOString() })
            .eq('id', snapshot_id);
    }
}
