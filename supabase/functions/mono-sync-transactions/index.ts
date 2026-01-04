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
    const monoSecretKey = Deno.env.get('MONO_SECRET_KEY');

    if (!monoSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Mono API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { accountId, userId, startDate, endDate } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'accountId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[mono-sync] Syncing transactions for account:', accountId);

    // Calculate date range (default: last 90 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Fetch transactions from Mono
    const monoResponse = await fetch(
      `https://api.withmono.com/v2/accounts/${accountId}/transactions?` +
      `start=${start.toISOString().split('T')[0]}&` +
      `end=${end.toISOString().split('T')[0]}&` +
      `paginate=false`,
      {
        headers: {
          'mono-sec-key': monoSecretKey
        }
      }
    );

    if (!monoResponse.ok) {
      const errorText = await monoResponse.text();
      console.error('[mono-sync] Mono API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch transactions from Mono' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const monoData = await monoResponse.json();
    const transactions = monoData.data || [];

    console.log(`[mono-sync] Fetched ${transactions.length} transactions`);

    // Get user_id from connected_accounts if not provided
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data: account } = await supabase
        .from('connected_accounts')
        .select('user_id')
        .eq('mono_account_id', accountId)
        .single();
      resolvedUserId = account?.user_id;
    }

    if (!resolvedUserId) {
      return new Response(
        JSON.stringify({ error: 'Could not resolve user for account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert transactions into bank_transactions table
    let insertedCount = 0;
    let skippedCount = 0;

    for (const txn of transactions) {
      // Check if transaction already exists
      const { data: existing } = await supabase
        .from('bank_transactions')
        .select('id')
        .eq('reference', txn.id)
        .eq('user_id', resolvedUserId)
        .single();

      if (existing) {
        skippedCount++;
        continue;
      }

      const isCredit = txn.type === 'credit';
      
      const { error: insertError } = await supabase
        .from('bank_transactions')
        .insert({
          user_id: resolvedUserId,
          reference: txn.id,
          description: txn.narration || txn.description || 'No description',
          credit: isCredit ? txn.amount / 100 : null, // Mono amounts are in kobo
          debit: !isCredit ? txn.amount / 100 : null,
          balance: txn.balance ? txn.balance / 100 : null,
          transaction_date: txn.date,
          metadata: {
            source: 'mono',
            mono_account_id: accountId,
            category: txn.category,
            raw: txn
          }
        });

      if (insertError) {
        console.error('[mono-sync] Insert error:', insertError);
      } else {
        insertedCount++;
      }
    }

    // Update last synced timestamp
    await supabase
      .from('connected_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('mono_account_id', accountId);

    console.log(`[mono-sync] Complete: ${insertedCount} inserted, ${skippedCount} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedCount,
        skipped: skippedCount,
        total: transactions.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[mono-sync] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
