import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CodeProposal {
    id: string;
    rule_id: string | null;
    change_log_id: string | null;
    title: string;
    description: string | null;
    affected_files: string[];
    code_diff: Record<string, { before?: string; after?: string } | unknown>;
    status: 'pending' | 'approved' | 'rejected' | 'implemented';
    priority: 'low' | 'medium' | 'high' | 'critical';
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    auto_apply_eligible: boolean;
    change_type: 'db_only' | 'prompt_only' | 'code_and_db';
    generated_by: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    implemented_at: string | null;
    applied_at: string | null;
    applied_by: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export function useCodeProposals(status?: string) {
    return useQuery({
        queryKey: ['code-proposals', status],
        queryFn: async () => {
            let query = supabase
                .from('code_change_proposals')
                .select('*')
                .order('created_at', { ascending: false });

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as CodeProposal[];
        },
    });
}

export function useUpdateProposalStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            status,
            notes,
        }: {
            id: string;
            status: 'approved' | 'rejected' | 'implemented';
            notes?: string;
        }) => {
            const updates: Record<string, unknown> = {
                status,
                reviewed_at: new Date().toISOString(),
            };

            if (notes) updates.notes = notes;
            if (status === 'implemented') {
                updates.implemented_at = new Date().toISOString();
            }

            const { data, error } = await supabase
                .from('code_change_proposals')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['code-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['code-proposals-stats'] });
        },
    });
}

export function useApplyProposal() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            proposalId,
            force = false,
        }: {
            proposalId: string;
            force?: boolean;
        }) => {
            const { data, error } = await supabase.functions.invoke('apply-code-proposal', {
                body: { proposal_id: proposalId, force },
            });

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['code-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['code-proposals-stats'] });
        },
    });
}

export function useGenerateProposals() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke('generate-code-proposals', {});
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['code-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['code-proposals-stats'] });
        },
    });
}

export function useProposalStats() {
    return useQuery({
        queryKey: ['code-proposals-stats'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('code_change_proposals')
                .select('status, risk_level, auto_apply_eligible');

            if (error) throw error;

            const stats = {
                pending: 0,
                approved: 0,
                rejected: 0,
                implemented: 0,
                total: data?.length || 0,
                autoApplyEligible: 0,
                byRisk: { low: 0, medium: 0, high: 0, critical: 0 },
            };

            data?.forEach((p) => {
                if (p.status in stats) {
                    stats[p.status as keyof typeof stats]++;
                }
                if (p.auto_apply_eligible && p.status === 'pending') {
                    stats.autoApplyEligible++;
                }
                if (p.risk_level && p.risk_level in stats.byRisk) {
                    stats.byRisk[p.risk_level as keyof typeof stats.byRisk]++;
                }
            });

            return stats;
        },
    });
}

export function useQueueStats() {
    return useQuery({
        queryKey: ['code-proposal-queue-stats'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('code_proposal_queue')
                .select('status')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
            data?.forEach((item) => {
                if (item.status in stats) {
                    stats[item.status as keyof typeof stats]++;
                }
            });

            return stats;
        },
    });
}
