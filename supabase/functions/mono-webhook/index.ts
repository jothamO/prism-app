import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const monoWebhookSecret = Deno.env.get('MONO_WEBHOOK_SECRET');

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const event = body.event;

    console.log('[mono-webhook] Received event:', event);

    // Verify webhook signature if secret is set
    const signature = req.headers.get('mono-webhook-secret');
    if (monoWebhookSecret && signature !== monoWebhookSecret) {
      console.warn('[mono-webhook] Invalid webhook signature');
      return new Response('Unauthorized', { status: 401 });
    }

    switch (event) {
      case 'mono.events.account_linked': {
        const { meta, account } = body.data;
        const userId = meta?.ref;

        if (!userId || !account) {
          console.error('[mono-webhook] Missing userId or account data');
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log('[mono-webhook] Linking account for user:', userId);

        // Store connected account
        const { error: insertError } = await supabase
          .from('connected_accounts')
          .insert({
            user_id: userId,
            mono_account_id: account.id,
            account_name: account.name,
            account_number: account.accountNumber,
            bank_name: account.institution?.name,
            account_type: account.type,
            status: 'active',
            last_synced_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('[mono-webhook] Failed to store account:', insertError);
        } else {
          console.log('[mono-webhook] Account stored successfully');
        }

        // Get user's Telegram ID to send notification
        const { data: userData } = await supabase
          .from('users')
          .select('telegram_id')
          .eq('id', userId)
          .single();

        if (userData?.telegram_id) {
          // Send Telegram notification
          const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
          if (telegramBotToken) {
            await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: userData.telegram_id,
                text: `🎉 <b>Bank account connected!</b>\n\n` +
                      `✅ ${account.institution?.name || 'Bank'}\n` +
                      `📋 Account: ****${account.accountNumber?.slice(-4) || '****'}\n\n` +
                      `I'll start syncing your transactions automatically. ` +
                      `You can now send me bank statements for analysis!`,
                parse_mode: 'HTML'
              })
            });
          }
        }

        // Trigger initial sync
        await supabase.functions.invoke('mono-sync-transactions', {
          body: { accountId: account.id, userId }
        });

        break;
      }

      case 'mono.events.account_updated': {
        const { account } = body.data;
        
        if (account?.id) {
          await supabase
            .from('connected_accounts')
            .update({ 
              status: 'active',
              last_synced_at: new Date().toISOString()
            })
            .eq('mono_account_id', account.id);
        }
        break;
      }

      case 'mono.events.reauthorisation_required': {
        const { meta, account } = body.data;
        const userId = meta?.ref;

        if (userId) {
          // Get user's Telegram ID
          const { data: userData } = await supabase
            .from('users')
            .select('telegram_id')
            .eq('id', userId)
            .single();

          if (userData?.telegram_id) {
            const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
            if (telegramBotToken) {
              await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: userData.telegram_id,
                  text: `⚠️ <b>Bank connection needs attention</b>\n\n` +
                        `Your ${account?.institution?.name || 'bank'} account needs to be re-authorized.\n\n` +
                        `Tap below to reconnect:`,
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: [[
                      { text: '🔗 Reconnect Bank', callback_data: 'connect_bank' }
                    ]]
                  }
                })
              });
            }
          }

          // Update account status
          await supabase
            .from('connected_accounts')
            .update({ status: 'reauth_required' })
            .eq('mono_account_id', account?.id);
        }
        break;
      }

      default:
        console.log('[mono-webhook] Unhandled event:', event);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[mono-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
