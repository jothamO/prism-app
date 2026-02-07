/**
 * PARA Memory Manager
 * Manages atomic facts following the Projects, Areas, Resources, Archives structure.
 * Supports supersession for a durable audit trail.
 */

import { supabase } from '../config';
import { logger } from '../utils/logger';

export type PARALayer = 'project' | 'area' | 'resource' | 'archive';

export interface AtomicFact {
    id?: string;
    user_id: string;
    layer: PARALayer;
    entity_name: string;
    fact_content: any;
    source_metadata?: any;
    confidence?: number;
    is_superseded?: boolean;
    superseded_by_id?: string;
    created_at?: string;
}

export class MemoryManager {
    /**
     * Fetch all active (non-superseded) facts for a user.
     */
    static async getActiveFacts(user_id: string, layer?: PARALayer): Promise<AtomicFact[]> {
        logger.info('[MemoryManager] Fetching active facts', { user_id, layer });

        let query = supabase
            .from('atomic_facts')
            .select('*')
            .eq('user_id', user_id)
            .eq('is_superseded', false);

        if (layer) {
            query = query.eq('layer', layer);
        }

        const { data, error } = await query;

        if (error) {
            logger.error('[MemoryManager] Failed to fetch facts', { code: error.code, message: error.message });
            throw new Error(`MemoryManager: ${error.message}`);
        }

        return data as AtomicFact[];
    }

    /**
     * Store a new fact. If a fact with the same entity_name exists in the same layer, 
     * it supersedes the old one.
     */
    static async storeFact(fact: Omit<AtomicFact, 'id' | 'is_superseded' | 'superseded_by_id'>): Promise<string> {
        logger.info('[MemoryManager] Storing fact', {
            user_id: fact.user_id,
            entity: fact.entity_name,
            layer: fact.layer
        });

        // 1. Find existing active fact to supersede
        const { data: existing } = await supabase
            .from('atomic_facts')
            .select('id')
            .eq('user_id', fact.user_id)
            .eq('layer', fact.layer)
            .eq('entity_name', fact.entity_name)
            .eq('is_superseded', false)
            .single();

        // 2. Insert new fact
        const { data: newFact, error: insertError } = await supabase
            .from('atomic_facts')
            .insert({
                ...fact,
                is_superseded: false
            })
            .select()
            .single();

        if (insertError || !newFact) {
            logger.error('[MemoryManager] Failed to insert fact', { error: insertError });
            throw new Error(`Failed to store fact: ${insertError?.message}`);
        }

        // 3. Supersede old fact if it existed
        if (existing) {
            await supabase
                .from('atomic_facts')
                .update({
                    is_superseded: true,
                    superseded_by_id: newFact.id
                })
                .eq('id', existing.id);

            logger.info('[MemoryManager] Superseded old fact', { old_id: existing.id, new_id: newFact.id });
        }

        return newFact.id;
    }

    /**
     * Archive an active fact.
     */
    static async archiveFact(user_id: string, entity_name: string): Promise<boolean> {
        logger.info('[MemoryManager] Archiving fact', { user_id, entity_name });

        const { data: existing } = await supabase
            .from('atomic_facts')
            .select('*')
            .eq('user_id', user_id)
            .eq('entity_name', entity_name)
            .eq('is_superseded', false)
            .single();

        if (!existing) return false;

        // Create a new archive entry to supersede the current one
        await this.storeFact({
            user_id,
            layer: 'archive',
            entity_name: existing.entity_name,
            fact_content: existing.fact_content,
            source_metadata: { ...existing.source_metadata, archive_reason: 'manual_archive' },
            confidence: existing.confidence
        });

        return true;
    }
}
