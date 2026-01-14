/**
 * System Settings Utilities
 * 
 * Fetch and check system-wide settings from system_settings table.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface SystemSettings {
    test_mode_enabled: boolean;
    gateway_enabled: boolean;
    processing_mode: 'gateway' | 'edge_functions';
    onboarding_mode: 'strict' | 'ai';
    default_tax_year: number;
}

/**
 * Get all system settings
 */
export async function getSystemSettings(supabase: SupabaseClient): Promise<SystemSettings | null> {
    const { data, error } = await supabase
        .from('system_settings')
        .select('test_mode_enabled, gateway_enabled, processing_mode, onboarding_mode, default_tax_year')
        .single();

    if (error || !data) {
        console.error('Error fetching system settings:', error);
        return null;
    }

    return {
        test_mode_enabled: data.test_mode_enabled ?? false,
        gateway_enabled: data.gateway_enabled ?? true,
        processing_mode: data.processing_mode ?? 'gateway',
        onboarding_mode: data.onboarding_mode ?? 'strict',
        default_tax_year: data.default_tax_year ?? 2025
    };
}

/**
 * Check if test mode is enabled
 */
export async function isTestModeEnabled(supabase: SupabaseClient): Promise<boolean> {
    const settings = await getSystemSettings(supabase);
    return settings?.test_mode_enabled ?? false;
}

/**
 * Check if gateway is enabled
 */
export async function isGatewayEnabled(supabase: SupabaseClient): Promise<boolean> {
    const settings = await getSystemSettings(supabase);
    return settings?.gateway_enabled ?? true;
}
