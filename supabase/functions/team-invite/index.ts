import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteRequest {
    email: string;
    role: 'admin' | 'member' | 'accountant';
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get user from token
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get user record
        const { data: userData } = await supabase
            .from('users')
            .select('id, full_name, email')
            .eq('auth_id', user.id)
            .single();

        if (!userData) {
            return new Response(
                JSON.stringify({ error: 'User not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { email, role }: InviteRequest = await req.json();

        if (!email || !role) {
            return new Response(
                JSON.stringify({ error: 'Email and role are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Generate invite token
        const inviteToken = crypto.randomUUID();

        // Check if already invited
        const { data: existing } = await supabase
            .from('team_members')
            .select('id, status')
            .eq('user_id', userData.id)
            .eq('member_email', email.toLowerCase())
            .single();

        if (existing) {
            if (existing.status === 'active') {
                return new Response(
                    JSON.stringify({ error: 'This person is already on your team' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            } else if (existing.status === 'pending') {
                // Resend invite
                await supabase
                    .from('team_members')
                    .update({ invite_token: inviteToken, invited_at: new Date().toISOString() })
                    .eq('id', existing.id);
            } else {
                // Revoked - create new
                await supabase
                    .from('team_members')
                    .update({
                        status: 'pending',
                        invite_token: inviteToken,
                        invited_at: new Date().toISOString(),
                        role
                    })
                    .eq('id', existing.id);
            }
        } else {
            // Create new invite
            const { error: insertError } = await supabase.from('team_members').insert({
                user_id: userData.id,
                member_email: email.toLowerCase(),
                role,
                status: 'pending',
                invite_token: inviteToken,
            });

            if (insertError) {
                console.error('Insert error:', insertError);
                return new Response(
                    JSON.stringify({ error: 'Failed to create invite' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // Generate invite link
        const baseUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://prism.ng';
        const inviteLink = `${baseUrl}/invite/${inviteToken}`;

        // Send email via Resend (if configured)
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        let emailSent = false;

        if (resendApiKey) {
            try {
                const emailResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${resendApiKey}`,
                    },
                    body: JSON.stringify({
                        from: 'PRISM <noreply@prism.ng>',
                        to: [email],
                        subject: `${userData.full_name || 'Someone'} invited you to PRISM`,
                        html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">You're invited to PRISM!</h2>
                <p>${userData.full_name || 'A PRISM user'} has invited you to join their tax management team as a <strong>${role}</strong>.</p>
                <p>PRISM is an AI-powered tax automation platform for Nigerian individuals and businesses.</p>
                <a href="${inviteLink}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">Accept Invitation</a>
                <p style="color: #666; font-size: 14px;">Or copy this link: ${inviteLink}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #999; font-size: 12px;">If you didn't expect this invitation, you can ignore this email.</p>
              </div>
            `,
                    }),
                });

                emailSent = emailResponse.ok;
                console.log('[team-invite] Email sent:', emailSent);
            } catch (emailError) {
                console.error('[team-invite] Email error:', emailError);
            }
        }

        // Log activity
        await supabase.from('team_activity').insert({
            user_id: userData.id,
            actor_id: userData.id,
            action: 'team_invite_sent',
            resource_type: 'team_member',
            metadata: { email, role, emailSent },
        });

        console.log('[team-invite] Invite created for:', email);

        return new Response(
            JSON.stringify({
                success: true,
                inviteLink,
                emailSent,
                message: emailSent
                    ? 'Invitation email sent'
                    : 'Invite created. Share the link manually.',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[team-invite] Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
