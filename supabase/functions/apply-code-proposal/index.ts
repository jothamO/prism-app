/**
 * Apply Code Proposal
 * 
 * Automatically applies approved low-risk proposals
 * For DB-only changes, updates the database directly
 * For code changes, marks as ready for manual implementation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";

interface ApplyRequest {
    proposal_id: string;
    force?: boolean;  // Override auto_apply_eligible check
}

interface Proposal {
    id: string;
    title: string;
    description: string;
    code_diff: Record<string, unknown>;
    affected_files: string[];
    status: string;
    risk_level: string;
    auto_apply_eligible: boolean;
    change_type: string;
    rule_id: string;
}

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get user from authorization header for audit
        const authHeader = req.headers.get('authorization');
        let userId: string | null = null;
        if (authHeader) {
            const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
            userId = user?.id || null;
        }

        const { proposal_id, force = false }: ApplyRequest = await req.json();

        if (!proposal_id) {
            return jsonResponse({ error: "proposal_id is required" }, 400);
        }

        // Get the proposal
        const { data: proposal, error: fetchError } = await supabase
            .from("code_change_proposals")
            .select("*")
            .eq("id", proposal_id)
            .single();

        if (fetchError || !proposal) {
            return jsonResponse({ error: "Proposal not found" }, 404);
        }

        const typedProposal = proposal as Proposal;

        // Validate proposal can be applied
        if (typedProposal.status !== 'pending' && typedProposal.status !== 'approved') {
            return jsonResponse({
                error: `Cannot apply proposal with status: ${typedProposal.status}`
            }, 400);
        }

        if (!typedProposal.auto_apply_eligible && !force) {
            return jsonResponse({
                error: "This proposal requires manual review. Set force=true to override.",
                risk_level: typedProposal.risk_level,
                change_type: typedProposal.change_type
            }, 400);
        }

        console.log(`[apply-code-proposal] Applying proposal ${proposal_id}, type: ${typedProposal.change_type}`);

        let applyResult: Record<string, unknown> = {};

        switch (typedProposal.change_type) {
            case 'db_only':
                // DB-only changes are already applied when rules are inserted/updated
                // This just confirms and marks as implemented
                applyResult = {
                    type: 'db_only',
                    message: 'Database changes are already applied. Rules are read at runtime via rules-client.ts.',
                    verification: 'Call tax-calculate to verify new values are being used.',
                    auto_applied: true
                };
                break;

            case 'prompt_only':
                // For prompt changes, we would update prompt-generator.ts
                // This requires more sophisticated file editing - mark for manual
                applyResult = {
                    type: 'prompt_only',
                    message: 'Prompt updates may be needed. Review prompt-generator.ts.',
                    affected_files: typedProposal.affected_files,
                    action_required: 'manual_review'
                };
                break;

            case 'code_and_db':
                // Complex changes - mark for manual implementation
                applyResult = {
                    type: 'code_and_db',
                    message: 'Code changes required. Review the suggested changes.',
                    affected_files: typedProposal.affected_files,
                    action_required: 'manual_implementation',
                    code_diff: typedProposal.code_diff
                };
                break;

            default:
                applyResult = {
                    type: 'unknown',
                    message: 'Unknown change type',
                    action_required: 'manual_review'
                };
        }

        // Update proposal status
        const { error: updateError } = await supabase
            .from("code_change_proposals")
            .update({
                status: typedProposal.change_type === 'db_only' ? 'implemented' : 'approved',
                applied_at: new Date().toISOString(),
                applied_by: userId,
                notes: `Auto-applied on ${new Date().toISOString()}. ${applyResult.message}`
            })
            .eq("id", proposal_id);

        if (updateError) throw updateError;

        // Log the action
        await supabase.from("compliance_change_log").insert({
            entity_type: 'code_proposal',
            entity_id: proposal_id,
            change_type: 'applied',
            new_values: {
                status: typedProposal.change_type === 'db_only' ? 'implemented' : 'approved',
                apply_result: applyResult
            },
            change_reason: `Proposal applied via apply-code-proposal`,
            changed_by: userId
        });

        return jsonResponse({
            success: true,
            proposal_id,
            new_status: typedProposal.change_type === 'db_only' ? 'implemented' : 'approved',
            result: applyResult
        });

    } catch (error) {
        console.error("[apply-code-proposal] Error:", error);
        return jsonResponse(
            { error: error instanceof Error ? error.message : "Unknown error" },
            500
        );
    }
});
