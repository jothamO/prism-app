/**
 * Shared Supabase Client
 * Singleton client for all edge functions
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let supabaseClient: SupabaseClient | null = null;
let supabaseServiceClient: SupabaseClient | null = null;

/**
 * Get Supabase client with anon key (for user-authenticated requests)
 */
export function getSupabase(): SupabaseClient {
    if (!supabaseClient) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
        }

        supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
    return supabaseClient;
}

/**
 * Get Supabase client with service role key (for admin operations)
 */
export function getSupabaseAdmin(): SupabaseClient {
    if (!supabaseServiceClient) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceKey) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        }

        supabaseServiceClient = createClient(supabaseUrl, serviceKey);
    }
    return supabaseServiceClient;
}

/**
 * Create a Supabase client with a specific auth token
 */
export function getSupabaseWithAuth(authToken: string): SupabaseClient {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    }

    return createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        }
    });
}

/**
 * Get user from auth header
 */
export async function getUserFromAuth(req: Request): Promise<{ userId: string; user: any } | null> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return null;

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAdmin();

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    return { userId: user.id, user };
}
