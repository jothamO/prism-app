import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProjectData {
  name: string;
  description?: string;
  source_person: string;
  source_relationship: string;
  budget: number;
  business_id?: string;
}

interface ExpenseData {
  project_id: string;
  amount: number;
  description: string;
  category?: string;
  date?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, ...data } = await req.json();
    console.log(`[project-funds] Action: ${action}, User: ${user.id}`);

    switch (action) {
      case 'create': {
        const projectData = data as ProjectData;
        
        const { data: project, error } = await supabase
          .from('projects')
          .insert({
            user_id: user.id,
            name: projectData.name,
            description: projectData.description,
            source_person: projectData.source_person,
            source_relationship: projectData.source_relationship,
            budget: projectData.budget,
            business_id: projectData.business_id,
            is_agency_fund: true,
            tax_treatment: 'non_taxable',
            exclude_from_vat: true,
            status: 'active',
          })
          .select()
          .single();

        if (error) {
          console.error('[project-funds] Create error:', error);
          throw error;
        }

        console.log(`[project-funds] Created project: ${project.id}`);
        return new Response(
          JSON.stringify({ success: true, project }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'expense': {
        const expenseData = data as ExpenseData;
        
        // Validate project ownership
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', expenseData.project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found or access denied' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check budget
        const newSpent = (project.spent || 0) + expenseData.amount;
        const isOverBudget = newSpent > project.budget;

        // Create expense linked to project
        const period = new Date().toISOString().slice(0, 7); // YYYY-MM format
        const { data: expense, error: expenseError } = await supabase
          .from('expenses')
          .insert({
            user_id: user.id,
            business_id: project.business_id,
            project_id: expenseData.project_id,
            is_project_expense: true,
            amount: expenseData.amount,
            description: expenseData.description,
            category: expenseData.category || 'project_expense',
            date: expenseData.date || new Date().toISOString().split('T')[0],
            period,
            can_claim_input_vat: false, // Project expenses are not VAT claimable
          })
          .select()
          .single();

        if (expenseError) {
          console.error('[project-funds] Expense error:', expenseError);
          throw expenseError;
        }

        // Get updated project balance
        const { data: updatedProject } = await supabase
          .from('projects')
          .select('*')
          .eq('id', expenseData.project_id)
          .single();

        console.log(`[project-funds] Recorded expense: ${expense.id} for project: ${expenseData.project_id}`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            expense,
            project: updatedProject,
            warning: isOverBudget ? 'Project is now over budget!' : null
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'summary': {
        const { project_id } = data;

        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get expenses for this project
        const { data: expenses } = await supabase
          .from('expenses')
          .select('*')
          .eq('project_id', project_id)
          .eq('is_project_expense', true)
          .order('date', { ascending: false });

        // Get receipts
        const { data: receipts } = await supabase
          .from('project_receipts')
          .select('*')
          .eq('project_id', project_id);

        const balance = project.budget - (project.spent || 0);
        const verifiedReceipts = receipts?.filter(r => r.is_verified).length || 0;

        return new Response(
          JSON.stringify({
            success: true,
            summary: {
              project,
              budget: project.budget,
              spent: project.spent || 0,
              balance,
              balancePercentage: ((balance / project.budget) * 100).toFixed(1),
              expenseCount: expenses?.length || 0,
              expenses: expenses || [],
              receiptCount: receipts?.length || 0,
              verifiedReceiptCount: verifiedReceipts,
              taxTreatment: project.tax_treatment,
              isAgencyFund: project.is_agency_fund,
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'complete': {
        const { project_id } = data;

        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const excess = project.budget - (project.spent || 0);
        const hasTaxableExcess = excess > 0;

        // Calculate PIT on excess (simplified progressive rate)
        let estimatedTax = 0;
        if (hasTaxableExcess) {
          // Simplified: apply 15% rate for demonstration
          // In reality, this would be added to annual income and taxed progressively
          estimatedTax = excess * 0.15;
        }

        // Update project status
        const { data: updatedProject, error: updateError } = await supabase
          .from('projects')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            tax_treatment: hasTaxableExcess ? 'taxable_excess' : 'non_taxable',
          })
          .eq('id', project_id)
          .select()
          .single();

        if (updateError) throw updateError;

        // Get expense count
        const { count: expenseCount } = await supabase
          .from('expenses')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project_id);

        // Get verified receipts count
        const { count: verifiedReceipts } = await supabase
          .from('project_receipts')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project_id)
          .eq('is_verified', true);

        console.log(`[project-funds] Completed project: ${project_id}, excess: ${excess}`);
        return new Response(
          JSON.stringify({
            success: true,
            completion: {
              project: updatedProject,
              budget: project.budget,
              totalSpent: project.spent || 0,
              excess,
              hasTaxableExcess,
              estimatedTax,
              expenseCount,
              verifiedReceipts,
              message: hasTaxableExcess 
                ? `Project completed with ₦${excess.toLocaleString()} excess. This is taxable income under Section 4(1)(k).`
                : 'Project completed with no taxable excess.',
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list': {
        const { status } = data;
        
        let query = supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (status) {
          query = query.eq('status', status);
        }

        const { data: projects, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, projects }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'receipt': {
        const { project_id, expense_id, receipt_url, amount, date, vendor_name } = data;

        // Validate project ownership
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: receipt, error: receiptError } = await supabase
          .from('project_receipts')
          .insert({
            project_id,
            expense_id,
            receipt_url,
            amount,
            date: date || new Date().toISOString().split('T')[0],
            vendor_name,
            is_verified: false,
          })
          .select()
          .single();

        if (receiptError) throw receiptError;

        console.log(`[project-funds] Added receipt: ${receipt.id} for project: ${project_id}`);
        return new Response(
          JSON.stringify({ success: true, receipt }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[project-funds] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
