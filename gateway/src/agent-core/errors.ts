/**
 * Agent Core Errors
 * Custom error types for Monty-powered agentic core
 */

export type AutonomyTier = 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4';

export interface PendingApprovalDetails {
    function_name: string;
    user_id: string;
    args: Record<string, any>;
    requires_secure_handover: boolean;
}

/**
 * Thrown when an agent attempts an action that requires user approval (Tier 3/4)
 */
export class PendingApproval extends Error {
    tier: 'tier_3' | 'tier_4';
    details: PendingApprovalDetails;

    constructor(tier: 'tier_3' | 'tier_4', details: PendingApprovalDetails) {
        super(`Pending ${tier} approval: ${details.function_name}`);
        this.name = 'PendingApproval';
        this.tier = tier;
        this.details = details;

        // Ensure stack trace is correctly captured
        Error.captureStackTrace(this, this.constructor);
    }
}
