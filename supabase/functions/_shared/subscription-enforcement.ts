/**
 * Subscription Enforcement Utilities
 * 
 * Functions to check user subscription limits before allowing actions.
 * Use these in edge functions and gateway skills.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface LimitCheckResult {
    allowed: boolean;
    currentCount: number;
    maxAllowed: number;
    upgradeMessage: string | null;
}

export interface UserTier {
    tier_name: string;
    max_banks: number;
    max_team: number;
    max_ocr: number;
    max_chats: number | null;
    banks_used: number;
    team_used: number;
    ocr_used: number;
    chats_used: number;
}

/**
 * Get user's current subscription tier and usage
 */
export async function getUserTier(supabase: SupabaseClient, userId: string): Promise<UserTier | null> {
    const { data, error } = await supabase
        .rpc('get_user_tier', { p_user_id: userId })
        .single();

    if (error || !data) {
        console.error('Error fetching user tier:', error);
        return null;
    }

    return {
        tier_name: data.tier_name,
        max_banks: data.max_banks,
        max_team: data.max_team,
        max_ocr: data.max_ocr,
        max_chats: data.max_chats,
        banks_used: data.banks_used,
        team_used: data.team_used,
        ocr_used: data.ocr_used,
        chats_used: data.chats_used
    };
}

/**
 * Check if user can perform a specific action
 */
export async function checkUserLimit(
    supabase: SupabaseClient,
    userId: string,
    action: 'bank' | 'team' | 'ocr' | 'chat'
): Promise<LimitCheckResult> {
    const { data, error } = await supabase
        .rpc('check_user_limit', { p_user_id: userId, p_action: action })
        .single();

    if (error || !data) {
        console.error('Error checking user limit:', error);
        return {
            allowed: false,
            currentCount: 0,
            maxAllowed: 0,
            upgradeMessage: 'Unable to verify subscription limits'
        };
    }

    return {
        allowed: data.allowed,
        currentCount: data.current_count,
        maxAllowed: data.max_allowed,
        upgradeMessage: data.upgrade_message
    };
}

/**
 * Increment usage counter after successful action
 */
export async function incrementUsage(
    supabase: SupabaseClient,
    userId: string,
    type: 'ocr' | 'chat'
): Promise<void> {
    const { error } = await supabase
        .rpc('increment_usage', { p_user_id: userId, p_type: type });

    if (error) {
        console.error('Error incrementing usage:', error);
    }
}

/**
 * Check bank linking limit
 */
export async function canLinkBank(supabase: SupabaseClient, userId: string): Promise<LimitCheckResult> {
    return checkUserLimit(supabase, userId, 'bank');
}

/**
 * Check team member invite limit
 */
export async function canInviteTeamMember(supabase: SupabaseClient, userId: string): Promise<LimitCheckResult> {
    return checkUserLimit(supabase, userId, 'team');
}

/**
 * Check OCR document processing limit
 */
export async function canProcessOCR(supabase: SupabaseClient, userId: string): Promise<LimitCheckResult> {
    return checkUserLimit(supabase, userId, 'ocr');
}

/**
 * Check daily chat limit
 */
export async function canSendChat(supabase: SupabaseClient, userId: string): Promise<LimitCheckResult> {
    return checkUserLimit(supabase, userId, 'chat');
}

/**
 * Format upgrade prompt for bots (Telegram/WhatsApp)
 */
export function formatUpgradePrompt(result: LimitCheckResult, action: string): string {
    if (result.allowed) return '';

    return `⚠️ **Limit Reached**

You've used ${result.currentCount}/${result.maxAllowed} ${action}.

${result.upgradeMessage || 'Upgrade your plan for more.'}

👉 Visit prismtaxassistant.lovable.app/pricing to upgrade`;
}
