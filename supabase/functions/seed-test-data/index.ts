import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


const STANDARD_RATE = 0.075;

// Test scenarios
interface InvoiceItem {
  description: string;
  amount: number;
  isZeroRated?: boolean;
  isExempt?: boolean;
}

interface ExpenseItem {
  description: string;
  amount: number;
  isZeroRated?: boolean;
}

interface ScenarioWithItems {
  name: string;
  invoices: InvoiceItem[];
  expenses: ExpenseItem[];
  expectedNetVAT: number;
}

interface ScenarioWithCounts {
  name: string;
  invoiceCount: number;
  expenseCount: number;
  invoiceAmountRange: [number, number];
  expenseAmountRange: [number, number];
}

type Scenario = ScenarioWithItems | ScenarioWithCounts;

const SCENARIOS: Record<string, Scenario> = {
  'standard-retail': {
    name: 'Standard Retail Business',
    invoices: [
      { description: 'Electronics Sale', amount: 100000 },
      { description: 'Office Equipment', amount: 75000 },
      { description: 'Computer Accessories', amount: 50000 },
      { description: 'Furniture', amount: 120000 },
      { description: 'Appliances', amount: 85000 }
    ],
    expenses: [
      { description: 'Office Supplies', amount: 25000 },
      { description: 'Utility Bills', amount: 15000 }
    ],
    expectedNetVAT: 29250
  },
  'zero-rated-exports': {
    name: 'Export Business',
    invoices: [
      { description: 'Export goods to UK', amount: 200000, isZeroRated: true },
      { description: 'Export electronics to USA', amount: 150000, isZeroRated: true },
      { description: 'Export textiles to Germany', amount: 180000, isZeroRated: true }
    ],
    expenses: [
      { description: 'Packaging materials', amount: 50000 },
      { description: 'Logistics services', amount: 75000 }
    ],
    expectedNetVAT: -9375
  },
  'mixed-classification': {
    name: 'Mixed Classification Business',
    invoices: [
      { description: 'Electronics Sale', amount: 80000 },
      { description: 'Computer parts', amount: 60000 },
      { description: 'Rice supply (export)', amount: 100000, isZeroRated: true },
      { description: 'Medical equipment sale', amount: 50000, isZeroRated: true },
      { description: 'Building rent', amount: 40000, isExempt: true }
    ],
    expenses: [
      { description: 'Office supplies', amount: 20000 },
      { description: 'Medicine purchase', amount: 15000, isZeroRated: true },
      { description: 'Equipment maintenance', amount: 25000 }
    ],
    expectedNetVAT: 7125
  },
  'high-volume': {
    name: 'High Volume Business',
    invoiceCount: 50,
    expenseCount: 25,
    invoiceAmountRange: [10000, 100000] as [number, number],
    expenseAmountRange: [5000, 30000] as [number, number]
  }
};

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
      console.log('[seed-test-data] Missing authorization header');
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
      console.log('[seed-test-data] Invalid token:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check admin role - seed-test-data is admin-only
    const { data: hasAdminRole } = await supabaseAuth.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!hasAdminRole) {
      console.log('[seed-test-data] User is not admin:', user.id);
      return new Response(JSON.stringify({ error: 'Forbidden - Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[seed-test-data] Admin authenticated:', user.id);
    // ===== END AUTHENTICATION CHECK =====

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, scenario, period } = await req.json();

    switch (action) {
      case 'seed': {
        const testPeriod = period || new Date().toISOString().substring(0, 7);
        const scenarioData = SCENARIOS[scenario as keyof typeof SCENARIOS];
        
        if (!scenarioData) {
          return new Response(JSON.stringify({ error: 'Invalid scenario' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Create test user
        const testUserId = crypto.randomUUID();
        const { data: testUser, error: userError } = await supabase
          .from('users')
          .insert({
            id: testUserId,
            whatsapp_number: `+234800${Date.now().toString().slice(-7)}`,
            business_name: `Test - ${scenarioData.name}`,
            tin: `TIN${Date.now().toString().slice(-8)}`,
            onboarding_completed: true,
            subscription_status: 'active'
          })
          .select()
          .single();

        if (userError) throw userError;

        // Create test business
        const testBusinessId = crypto.randomUUID();
        const { data: business, error: bizError } = await supabase
          .from('businesses')
          .insert({
            id: testBusinessId,
            user_id: testUserId,
            name: scenarioData.name,
            is_primary: true,
            vat_registered: true,
            vat_enabled: true,
            registration_number: `RC${Date.now().toString().slice(-6)}`,
            registration_type: 'RC'
          })
          .select()
          .single();

        if (bizError) throw bizError;

        // Generate invoices
        let invoices: any[] = [];
        if ('invoices' in scenarioData) {
          invoices = scenarioData.invoices.map((inv, idx) => {
            const vatRate = inv.isZeroRated || inv.isExempt ? 0 : STANDARD_RATE;
            const vatAmount = inv.amount * vatRate;
            return {
              user_id: testUserId,
              business_id: testBusinessId,
              invoice_number: `INV-TEST-${idx + 1}`,
              date: `${testPeriod}-${String(Math.min(28, idx + 5)).padStart(2, '0')}`,
              customer_name: `Test Customer ${idx + 1}`,
              items: [{ description: inv.description, quantity: 1, unitPrice: inv.amount, amount: inv.amount }],
              subtotal: inv.amount,
              vat_amount: Math.round(vatAmount * 100) / 100,
              total: inv.amount + vatAmount,
              period: testPeriod,
              source: 'test_seed',
              status: 'pending_remittance'
            };
          });
        } else if ('invoiceCount' in scenarioData) {
          const [minAmt, maxAmt] = scenarioData.invoiceAmountRange;
          for (let i = 0; i < scenarioData.invoiceCount; i++) {
            const amount = Math.floor(Math.random() * (maxAmt - minAmt) + minAmt);
            const vatAmount = amount * STANDARD_RATE;
            invoices.push({
              user_id: testUserId,
              business_id: testBusinessId,
              invoice_number: `INV-BULK-${i + 1}`,
              date: `${testPeriod}-${String(Math.min(28, (i % 28) + 1)).padStart(2, '0')}`,
              customer_name: `Customer ${i + 1}`,
              items: [{ description: `Product ${i + 1}`, quantity: 1, unitPrice: amount, amount }],
              subtotal: amount,
              vat_amount: Math.round(vatAmount * 100) / 100,
              total: amount + vatAmount,
              period: testPeriod,
              source: 'test_seed',
              status: 'pending_remittance'
            });
          }
        }

        if (invoices.length > 0) {
          const { error: invError } = await supabase.from('invoices').insert(invoices);
          if (invError) throw invError;
        }

        // Generate expenses
        let expenses: any[] = [];
        if ('expenses' in scenarioData) {
          expenses = scenarioData.expenses.map((exp, idx) => {
            const vatRate = exp.isZeroRated ? 0 : STANDARD_RATE;
            const vatAmount = exp.amount * vatRate;
            return {
              user_id: testUserId,
              business_id: testBusinessId,
              description: exp.description,
              amount: exp.amount,
              vat_amount: Math.round(vatAmount * 100) / 100,
              vat_rate: vatRate,
              can_claim_input_vat: !exp.isZeroRated,
              date: `${testPeriod}-${String(Math.min(28, idx + 3)).padStart(2, '0')}`,
              period: testPeriod,
              category: 'operating'
            };
          });
        } else if ('expenseCount' in scenarioData) {
          const [minAmt, maxAmt] = scenarioData.expenseAmountRange;
          for (let i = 0; i < scenarioData.expenseCount; i++) {
            const amount = Math.floor(Math.random() * (maxAmt - minAmt) + minAmt);
            const vatAmount = amount * STANDARD_RATE;
            expenses.push({
              user_id: testUserId,
              business_id: testBusinessId,
              description: `Expense ${i + 1}`,
              amount,
              vat_amount: Math.round(vatAmount * 100) / 100,
              vat_rate: STANDARD_RATE,
              can_claim_input_vat: true,
              date: `${testPeriod}-${String(Math.min(28, (i % 28) + 1)).padStart(2, '0')}`,
              period: testPeriod,
              category: 'operating'
            });
          }
        }

        if (expenses.length > 0) {
          const { error: expError } = await supabase.from('expenses').insert(expenses);
          if (expError) throw expError;
        }

        // Calculate summary
        const totalInvoiceVAT = invoices.reduce((sum, inv) => sum + inv.vat_amount, 0);
        const totalExpenseVAT = expenses.reduce((sum, exp) => sum + (exp.can_claim_input_vat ? exp.vat_amount : 0), 0);

        const result = {
          success: true,
          scenario,
          period: testPeriod,
          user: { id: testUserId, businessName: testUser.business_name },
          business: { id: testBusinessId, name: business.name },
          created: {
            invoices: invoices.length,
            expenses: expenses.length
          },
          summary: {
            totalSales: invoices.reduce((sum, inv) => sum + inv.subtotal, 0),
            outputVAT: Math.round(totalInvoiceVAT * 100) / 100,
            totalExpenses: expenses.reduce((sum, exp) => sum + exp.amount, 0),
            inputVAT: Math.round(totalExpenseVAT * 100) / 100,
            netVAT: Math.round((totalInvoiceVAT - totalExpenseVAT) * 100) / 100
          }
        };

        console.log('Test Data Seeded:', result);

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'clear': {
        // Delete test data (only data with source = 'test_seed' or 'test_simulator')
        await supabase.from('invoices').delete().in('source', ['test_seed', 'test_simulator']);
        await supabase.from('expenses').delete().like('description', 'Test%');
        await supabase.from('vat_reconciliations').delete().like('filed_by', 'test%');
        
        // Delete test users
        const { data: testUsers } = await supabase
          .from('users')
          .select('id')
          .like('business_name', 'Test -%');
        
        if (testUsers && testUsers.length > 0) {
          const testUserIds = testUsers.map(u => u.id);
          await supabase.from('businesses').delete().in('user_id', testUserIds);
          await supabase.from('users').delete().in('id', testUserIds);
        }

        return new Response(JSON.stringify({ success: true, message: 'Test data cleared' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'list-scenarios': {
        const scenarios = Object.entries(SCENARIOS).map(([key, value]) => ({
          id: key,
          name: value.name,
          description: 'invoices' in value 
            ? `${value.invoices.length} invoices, ${value.expenses.length} expenses`
            : `${value.invoiceCount} invoices, ${value.expenseCount} expenses`
        }));

        return new Response(JSON.stringify({ scenarios }), {
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
    console.error('Seed Test Data Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});