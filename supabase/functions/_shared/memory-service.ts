/**
 * Memory Service - V11 Structured Memory Layer
 * 
 * Central service for user profile access and learning.
 * Replaces scattered profile updates with unified, logged updates.
 */

import { getSupabaseAdmin } from './supabase.ts';

// ============= Types =============

export interface UserProfile {
    entityType: 'individual' | 'self_employed' | 'sme' | 'company' | null;
    industry: string | null;
    businessName: string | null;
    annualIncome: number | null;
    registeredTaxes: string[];
    tin: string | null;
    vatNumber: string | null;
    lastFilingDate: Date | null;
    riskLevel: 'low' | 'medium' | 'high' | 'unknown';
    filingFrequency: 'monthly' | 'quarterly' | 'annually' | null;
    preferredName: string | null;
    facts: string[];  // Free-form facts that don't fit structure
}

export type ProfileSource = 'chat' | 'onboarding' | 'transaction' | 'ocr' | 'correction' | 'manual' | 'admin';
export type Channel = 'web' | 'telegram' | 'whatsapp' | 'api';

// ============= Profile Access =============

/**
 * Get structured user profile
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const supabase = getSupabaseAdmin();

    // Resolve auth_user_id to internal users.id if needed
    let internalUserId = userId;
    const { data: userByAuthId } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', userId)
        .single();

    if (userByAuthId) {
        internalUserId = userByAuthId.id;
    }

    const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', internalUserId)
        .single();

    if (error || !data) {
        console.log(`[memory-service] No profile found for user ${internalUserId}`);
        return null;
    }

    return {
        entityType: data.entity_type,
        industry: data.industry,
        businessName: data.business_name,
        annualIncome: data.annual_income,
        registeredTaxes: data.registered_taxes || [],
        tin: data.tin,
        vatNumber: data.vat_number,
        lastFilingDate: data.last_filing_date ? new Date(data.last_filing_date) : null,
        riskLevel: data.risk_level || 'unknown',
        filingFrequency: data.filing_frequency,
        preferredName: data.preferred_name,
        facts: data.remembered_facts || [],
    };
}

/**
 * Update a single profile field with logging
 */
export async function updateProfileField(
    userId: string,
    field: string,
    value: string | number | string[] | null,
    source: ProfileSource = 'chat',
    channel?: Channel,
    confidence: number = 1.0
): Promise<void> {
    const supabase = getSupabaseAdmin();

    // Resolve user ID
    let internalUserId = userId;
    const { data: userByAuthId } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', userId)
        .single();

    if (userByAuthId) {
        internalUserId = userByAuthId.id;
    }

    // Convert value to string for the RPC function
    const stringValue = value === null ? null :
        Array.isArray(value) ? JSON.stringify(value) :
            String(value);

    // Use RPC function which handles logging
    const { error } = await supabase.rpc('update_user_profile', {
        p_user_id: internalUserId,
        p_field: field,
        p_value: stringValue,
        p_source: source,
        p_channel: channel || null,
        p_confidence: confidence,
    });

    if (error) {
        console.error(`[memory-service] Failed to update ${field}:`, error);
        throw error;
    }

    console.log(`[memory-service] Updated ${field} for user ${internalUserId} via ${source}`);
}

/**
 * Add a free-form fact to remembered_facts array (for facts that don't fit structure)
 */
export async function addRememberedFact(
    userId: string,
    fact: string,
    source: ProfileSource = 'chat',
    channel?: Channel
): Promise<void> {
    const supabase = getSupabaseAdmin();

    // Resolve user ID
    let internalUserId = userId;
    const { data: userByAuthId } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', userId)
        .single();

    if (userByAuthId) {
        internalUserId = userByAuthId.id;
    }

    // Get existing facts
    const { data: existing } = await supabase
        .from('user_preferences')
        .select('remembered_facts')
        .eq('user_id', internalUserId)
        .single();

    const existingFacts: string[] = existing?.remembered_facts || [];

    // Avoid duplicates
    if (existingFacts.includes(fact)) {
        return;
    }

    const newFacts = [...existingFacts, fact];

    // Upsert
    await supabase
        .from('user_preferences')
        .upsert({
            user_id: internalUserId,
            remembered_facts: newFacts,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

    // Log the learning
    await supabase
        .from('profile_learning_log')
        .insert({
            user_id: internalUserId,
            field_name: 'remembered_facts',
            old_value: JSON.stringify(existingFacts),
            new_value: JSON.stringify(newFacts),
            source,
            channel,
            confidence: 1.0,
        });

    console.log(`[memory-service] Added fact for user ${internalUserId}: "${fact}"`);
}

/**
 * Get profile learning history for a user
 */
export async function getProfileLearningHistory(
    userId: string,
    limit: number = 20
): Promise<Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
    source: ProfileSource;
    channel: Channel | null;
    timestamp: Date;
}>> {
    const supabase = getSupabaseAdmin();

    // Resolve user ID
    let internalUserId = userId;
    const { data: userByAuthId } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', userId)
        .single();

    if (userByAuthId) {
        internalUserId = userByAuthId.id;
    }

    const { data, error } = await supabase
        .from('profile_learning_log')
        .select('*')
        .eq('user_id', internalUserId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error || !data) {
        return [];
    }

    return data.map(row => ({
        field: row.field_name,
        oldValue: row.old_value,
        newValue: row.new_value,
        source: row.source as ProfileSource,
        channel: row.channel as Channel | null,
        timestamp: new Date(row.created_at),
    }));
}

/**
 * Build a summary string of the user's profile for AI context
 */
export async function buildProfileSummary(userId: string): Promise<string> {
    const profile = await getUserProfile(userId);

    if (!profile) {
        return "No profile information available.";
    }

    const parts: string[] = [];

    if (profile.preferredName) {
        parts.push(`Name: ${profile.preferredName}`);
    }

    if (profile.entityType) {
        const entityLabels: Record<string, string> = {
            individual: 'Individual (PAYE employee)',
            self_employed: 'Self-employed / Freelancer',
            sme: 'Small/Medium Enterprise',
            company: 'Registered Company',
        };
        parts.push(`Type: ${entityLabels[profile.entityType] || profile.entityType}`);
    }

    if (profile.industry) {
        parts.push(`Industry: ${profile.industry}`);
    }

    if (profile.annualIncome) {
        parts.push(`Annual Income: ₦${profile.annualIncome.toLocaleString()}`);
    }

    if (profile.registeredTaxes.length > 0) {
        parts.push(`Registered for: ${profile.registeredTaxes.join(', ')}`);
    }

    if (profile.filingFrequency) {
        parts.push(`Files: ${profile.filingFrequency}`);
    }

    if (profile.riskLevel !== 'unknown') {
        parts.push(`Risk: ${profile.riskLevel}`);
    }

    // Add free-form facts
    if (profile.facts.length > 0) {
        parts.push(`Other facts: ${profile.facts.join('; ')}`);
    }

    return parts.length > 0 ? parts.join('\n') : "No profile information available.";
}
