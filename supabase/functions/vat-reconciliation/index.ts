import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ===== AUTHENTICATION CHECK =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[vat-reconciliation] Missing authorization header');
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create client with user's token for auth check
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.log('[vat-reconciliation] Invalid token:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[vat-reconciliation] User authenticated:', user.id);
    // ===== END AUTHENTICATION CHECK =====

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, userId, businessId, period } = await req.json();

    // Validate that user can only access their own data (or admin can access all)
    const { data: isAdmin } = await supabaseAuth.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    const targetUserId = userId || user.id;
    if (!isAdmin && targetUserId !== user.id) {
      console.log('[vat-reconciliation] User trying to access other user data');
      return new Response(JSON.stringify({ error: 'Forbidden - Cannot access other user data' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    switch (action) {
      case 'calculate': {
        // Get output VAT from invoices
        let invoiceQuery = supabase
          .from('invoices')
          .select('id, vat_amount, total, subtotal')
          .eq('period', period);
        
        if (targetUserId) invoiceQuery = invoiceQuery.eq('user_id', targetUserId);
        if (businessId) invoiceQuery = invoiceQuery.eq('business_id', businessId);

        const { data: invoices, error: invError } = await invoiceQuery;
        if (invError) throw invError;

        // Get input VAT from expenses
        let expenseQuery = supabase
          .from('expenses')
          .select('id, vat_amount, amount, can_claim_input_vat')
          .eq('period', period)
          .eq('can_claim_input_vat', true);

        if (targetUserId) expenseQuery = expenseQuery.eq('user_id', targetUserId);
        if (businessId) expenseQuery = expenseQuery.eq('business_id', businessId);

        const { data: expenses, error: expError } = await expenseQuery;
        if (expError) throw expError;

        // Get previous period's credit carry-forward
        const prevPeriod = getPrevMonth(period);
        let prevReconQuery = supabase
          .from('vat_reconciliations')
          .select('credit_carried_forward')
          .eq('period', prevPeriod);

        if (targetUserId) prevReconQuery = prevReconQuery.eq('user_id', targetUserId);
        if (businessId) prevReconQuery = prevReconQuery.eq('business_id', businessId);

        const { data: prevRecon } = await prevReconQuery.single();
        const creditBroughtForward = prevRecon?.credit_carried_forward || 0;

        // Calculate totals
        const outputVAT = invoices?.reduce((sum, inv) => sum + (inv.vat_amount || 0), 0) || 0;
        const inputVAT = expenses?.reduce((sum, exp) => sum + (exp.vat_amount || 0), 0) || 0;
        const grossPosition = outputVAT - inputVAT - creditBroughtForward;
        const netVAT = Math.max(0, grossPosition);
        const creditCarriedForward = grossPosition < 0 ? Math.abs(grossPosition) : 0;
        const status = netVAT > 0 ? 'remit' : 'credit';

        const reconciliation = {
          period,
          userId: targetUserId,
          businessId,
          outputVAT: Math.round(outputVAT * 100) / 100,
          outputVATInvoicesCount: invoices?.length || 0,
          inputVAT: Math.round(inputVAT * 100) / 100,
          inputVATExpensesCount: expenses?.length || 0,
          creditBroughtForward: Math.round(creditBroughtForward * 100) / 100,
          netVAT: Math.round(netVAT * 100) / 100,
          creditCarriedForward: Math.round(creditCarriedForward * 100) / 100,
          status,
          invoices: invoices?.map(i => ({ id: i.id, vatAmount: i.vat_amount, total: i.total })),
          expenses: expenses?.map(e => ({ id: e.id, vatAmount: e.vat_amount, amount: e.amount }))
        };

        console.log('VAT Reconciliation:', reconciliation);

        return new Response(JSON.stringify(reconciliation), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'save': {
        const body = await req.json();
        const { reconciliation } = body;
        
        const { data, error } = await supabase
          .from('vat_reconciliations')
          .upsert({
            user_id: reconciliation.userId,
            business_id: reconciliation.businessId,
            period: reconciliation.period,
            output_vat: reconciliation.outputVAT,
            output_vat_invoices_count: reconciliation.outputVATInvoicesCount,
            input_vat: reconciliation.inputVAT,
            input_vat_expenses_count: reconciliation.inputVATExpensesCount,
            credit_brought_forward: reconciliation.creditBroughtForward,
            net_vat: reconciliation.netVAT,
            credit_carried_forward: reconciliation.creditCarriedForward,
            status: reconciliation.status
          }, {
            onConflict: 'user_id,business_id,period'
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'history': {
        let query = supabase
          .from('vat_reconciliations')
          .select('*')
          .order('period', { ascending: false })
          .limit(12);

        if (targetUserId) query = query.eq('user_id', targetUserId);
        if (businessId) query = query.eq('business_id', businessId);

        const { data, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ history: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('VAT Reconciliation Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function getPrevMonth(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}