import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


const TOKEN_EXPIRY_MINUTES = 15;
const DAILY_TOKEN_LIMIT = 3;

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // Get the authorization header from the request
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing authorization' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get the authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser(
            authHeader.replace('Bearer ', '')
        );

        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[generate-telegram-token] Request from user:', user.id);

        // Find the user in our users table
        let { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, telegram_id')
            .eq('auth_user_id', user.id)
            .single();

        // If user profile not found, create one for legacy auth users
        if (userError || !userData) {
            console.log('[generate-telegram-token] User profile not found, creating for legacy user:', user.id);
            
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    auth_user_id: user.id,
                    email: user.email,
                    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                    onboarding_completed: true,
                })
                .select('id, telegram_id')
                .single();

            if (createError) {
                console.error('[generate-telegram-token] Failed to create user profile:', createError);
                return new Response(
                    JSON.stringify({ success: false, error: 'Failed to create user profile' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            
            userData = newUser;
            console.log('[generate-telegram-token] Created user profile:', userData.id);
        }

        // Check if already connected
        if (userData.telegram_id) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Telegram already connected',
                    alreadyConnected: true
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check rate limit - count tokens generated today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { count } = await supabase
            .from('telegram_auth_tokens')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userData.id)
            .gte('created_at', todayStart.toISOString());

        if ((count || 0) >= DAILY_TOKEN_LIMIT) {
            console.log('[generate-telegram-token] Rate limit exceeded for user:', userData.id);

            // Calculate when they can try again
            const tomorrow = new Date(todayStart);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const retryAfter = Math.ceil((tomorrow.getTime() - Date.now()) / 1000);

            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Daily limit reached',
                    rateLimited: true,
                    retryAfter
                }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Invalidate any existing unused tokens
        await supabase
            .from('telegram_auth_tokens')
            .update({ used: true })
            .eq('user_id', userData.id)
            .eq('used', false);

        // Generate new token
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

        const { error: insertError } = await supabase
            .from('telegram_auth_tokens')
            .insert({
                user_id: userData.id,
                token: token,
                expires_at: expiresAt.toISOString(),
                used: false,
            });

        if (insertError) {
            console.error('[generate-telegram-token] Insert error:', insertError);
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to generate token' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[generate-telegram-token] Token generated, expires:', expiresAt.toISOString());

        return new Response(
            JSON.stringify({
                success: true,
                token,
                expiresAt: expiresAt.toISOString(),
                expiresIn: TOKEN_EXPIRY_MINUTES * 60,
                tokensRemaining: DAILY_TOKEN_LIMIT - (count || 0) - 1,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[generate-telegram-token] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
