import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tax Act 2025 Section 56 - Business Classification Thresholds
const SMALL_COMPANY_TURNOVER_THRESHOLD = 50_000_000; // ₦50 million
const SMALL_COMPANY_ASSETS_THRESHOLD = 250_000_000; // ₦250 million
const SMALL_COMPANY_TAX_RATE = 0; // 0%
const STANDARD_TAX_RATE = 0.30; // 30%

// Professional services excluded from small company status
const PROFESSIONAL_SERVICES_TYPES = [
  'legal', 'law firm', 'attorney', 'solicitor', 'barrister',
  'accounting', 'audit', 'tax advisory',
  'consulting', 'management consulting',
  'architecture', 'engineering',
  'medical', 'healthcare', 'hospital', 'clinic',
  'real estate', 'property',
  'financial services', 'investment', 'banking'
];

interface ClassificationResult {
  businessId: string;
  businessName: string;
  classification: 'small' | 'medium' | 'large';
  taxRate: number;
  reason: string;
  thresholds: {
    turnover: { value: number; limit: number; passes: boolean };
    assets: { value: number; limit: number; passes: boolean };
    professionalServices: { is: boolean; passes: boolean };
  };
  savingsVsStandardRate: number;
  actReference: string;
}

interface TestBusiness {
  name: string;
  turnover: number;
  assets: number;
  isProfessionalServices: boolean;
  expectedClassification: 'small' | 'medium' | 'large';
}

// Test businesses for seeding
const TEST_BUSINESSES: TestBusiness[] = [
  {
    name: 'Small Retail Store',
    turnover: 25_000_000,
    assets: 50_000_000,
    isProfessionalServices: false,
    expectedClassification: 'small'
  },
  {
    name: 'Growing SME Trading',
    turnover: 80_000_000,
    assets: 100_000_000,
    isProfessionalServices: false,
    expectedClassification: 'medium'
  },
  {
    name: 'Lagos Law Firm LLP',
    turnover: 30_000_000,
    assets: 40_000_000,
    isProfessionalServices: true,
    expectedClassification: 'medium'
  },
  {
    name: 'Enterprise Manufacturing Ltd',
    turnover: 500_000_000,
    assets: 1_000_000_000,
    isProfessionalServices: false,
    expectedClassification: 'large'
  },
  {
    name: 'Borderline Micro Business',
    turnover: 50_000_000,
    assets: 250_000_000,
    isProfessionalServices: false,
    expectedClassification: 'small'
  }
];

function classifyBusiness(
  businessId: string,
  businessName: string,
  turnover: number,
  assets: number,
  isProfessionalServices: boolean
): ClassificationResult {
  const turnoverPasses = turnover <= SMALL_COMPANY_TURNOVER_THRESHOLD;
  const assetsPasses = assets <= SMALL_COMPANY_ASSETS_THRESHOLD;
  const notProfessionalServices = !isProfessionalServices;

  const qualifiesAsSmall = turnoverPasses && assetsPasses && notProfessionalServices;

  let classification: 'small' | 'medium' | 'large';
  let reason: string;
  let taxRate: number;

  if (qualifiesAsSmall) {
    classification = 'small';
    taxRate = SMALL_COMPANY_TAX_RATE;
    reason = 'Qualifies as Small Company: turnover ≤ ₦50M, assets ≤ ₦250M, not professional services';
  } else {
    // Determine if medium or large based on turnover
    if (turnover > 100_000_000) {
      classification = 'large';
      reason = 'Large Company: turnover exceeds ₦100M';
    } else {
      classification = 'medium';
      if (isProfessionalServices) {
        reason = 'Professional services excluded from Small Company status per Section 56(2)';
      } else if (!turnoverPasses) {
        reason = `Turnover ₦${(turnover / 1_000_000).toFixed(1)}M exceeds ₦50M threshold`;
      } else {
        reason = `Assets ₦${(assets / 1_000_000).toFixed(1)}M exceeds ₦250M threshold`;
      }
    }
    taxRate = STANDARD_TAX_RATE;
  }

  const savingsVsStandardRate = qualifiesAsSmall ? turnover * STANDARD_TAX_RATE : 0;

  return {
    businessId,
    businessName,
    classification,
    taxRate,
    reason,
    thresholds: {
      turnover: { value: turnover, limit: SMALL_COMPANY_TURNOVER_THRESHOLD, passes: turnoverPasses },
      assets: { value: assets, limit: SMALL_COMPANY_ASSETS_THRESHOLD, passes: assetsPasses },
      professionalServices: { is: isProfessionalServices, passes: notProfessionalServices }
    },
    savingsVsStandardRate,
    actReference: 'Tax Act 2025, Section 56'
  };
}

Deno.serve(async (req) => {
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
      console.log('[business-classifier] Missing authorization header');
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
      console.log('[business-classifier] Invalid token:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[business-classifier] User authenticated:', user.id);
    // ===== END AUTHENTICATION CHECK =====

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, businessId, year } = await req.json();
    const classificationYear = year || new Date().getFullYear();

    console.log(`[business-classifier] Action: ${action}, Year: ${classificationYear}`);

    // Check admin role for admin-only actions
    const { data: isAdmin } = await supabaseAuth.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    // ACTION: Classify single business
    if (action === 'classify') {
      if (!businessId) {
        return new Response(
          JSON.stringify({ error: 'businessId is required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Verify user owns this business or is admin
      const { data: business, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .single();

      if (error || !business) {
        return new Response(
          JSON.stringify({ error: 'Business not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      if (!isAdmin && business.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Forbidden - Cannot classify other user business' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const result = classifyBusiness(
        business.id,
        business.name,
        business.annual_turnover || 0,
        business.total_fixed_assets || 0,
        business.is_professional_services || false
      );

      // Update business with classification
      await supabase
        .from('businesses')
        .update({
          classification: result.classification,
          tax_rate: result.taxRate,
          last_classified_at: new Date().toISOString(),
          classification_year: classificationYear
        })
        .eq('id', businessId);

      console.log(`[business-classifier] Classified ${business.name}: ${result.classification}`);

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Classify all businesses (admin-only)
    if (action === 'classify-all') {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Forbidden - Admin access required for classify-all' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { data: businesses, error } = await supabase
        .from('businesses')
        .select('*');

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch businesses' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const results: ClassificationResult[] = [];
      const notifications: { businessId: string; businessName: string; message: string }[] = [];
      let smallCount = 0;
      let mediumCount = 0;
      let largeCount = 0;

      for (const business of businesses || []) {
        const result = classifyBusiness(
          business.id,
          business.name,
          business.annual_turnover || 0,
          business.total_fixed_assets || 0,
          business.is_professional_services || false
        );

        results.push(result);

        if (result.classification === 'small') smallCount++;
        else if (result.classification === 'medium') mediumCount++;
        else largeCount++;

        // Update business record
        await supabase
          .from('businesses')
          .update({
            classification: result.classification,
            tax_rate: result.taxRate,
            last_classified_at: new Date().toISOString(),
            classification_year: classificationYear
          })
          .eq('id', business.id);

        // Generate notification for small companies
        if (result.classification === 'small') {
          const formatCurrency = (n: number) => 
            new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

          const notification = `🎉 GOOD NEWS! Small Company Status

Your business "${business.name}" qualifies as a SMALL COMPANY under Section 56!

✅ Tax Rate: 0% (previously 30%)
💰 Estimated Savings: ${formatCurrency(result.savingsVsStandardRate)}/year

Qualification:
├─ Turnover: ${formatCurrency(result.thresholds.turnover.value)} ✓ (limit: ${formatCurrency(result.thresholds.turnover.limit)})
├─ Assets: ${formatCurrency(result.thresholds.assets.value)} ✓ (limit: ${formatCurrency(result.thresholds.assets.limit)})
└─ Not Professional Services ✓`;

          notifications.push({
            businessId: business.id,
            businessName: business.name,
            message: notification
          });

          // Create reminder/notification in database
          if (business.user_id) {
            await supabase.from('reminders').insert({
              user_id: business.user_id,
              reminder_type: 'classification_result',
              message: notification,
              due_date: new Date().toISOString().split('T')[0],
              send_at: new Date().toISOString()
            });
          }
        }
      }

      console.log(`[business-classifier] Classified ${results.length} businesses: ${smallCount} small, ${mediumCount} medium, ${largeCount} large`);

      return new Response(
        JSON.stringify({
          success: true,
          year: classificationYear,
          summary: {
            total: results.length,
            small: smallCount,
            medium: mediumCount,
            large: largeCount
          },
          results,
          notifications
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Seed test businesses (admin-only)
    if (action === 'seed-businesses') {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Forbidden - Admin access required for seed-businesses' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      // First, get or create a test user
      let userId: string;
      
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('whatsapp_number', '+2349999999999')
        .single();

      if (existingUser) {
        userId = existingUser.id;
        // Clear existing test businesses for this user
        await supabase.from('businesses').delete().eq('user_id', userId);
      } else {
        const { data: newUser, error } = await supabase
          .from('users')
          .insert({
            whatsapp_number: '+2349999999999',
            business_name: 'Classification Test Account',
            tin: '9999999999',
            onboarding_completed: true
          })
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to create test user' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
        userId = newUser.id;
      }

      // Create test businesses
      const createdBusinesses: { id: string; name: string; expected: string }[] = [];
      
      for (const testBiz of TEST_BUSINESSES) {
        const { data: business, error } = await supabase
          .from('businesses')
          .insert({
            user_id: userId,
            name: testBiz.name,
            annual_turnover: testBiz.turnover,
            total_fixed_assets: testBiz.assets,
            is_professional_services: testBiz.isProfessionalServices,
            classification: 'unclassified',
            tax_rate: 0.30,
            registration_number: `RC${Date.now().toString().slice(-6)}`
          })
          .select()
          .single();

        if (!error && business) {
          createdBusinesses.push({
            id: business.id,
            name: business.name,
            expected: testBiz.expectedClassification
          });
        }
      }

      console.log(`[business-classifier] Seeded ${createdBusinesses.length} test businesses`);

      return new Response(
        JSON.stringify({
          success: true,
          userId,
          businesses: createdBusinesses,
          testCases: TEST_BUSINESSES.map(b => ({
            name: b.name,
            turnover: b.turnover,
            assets: b.assets,
            isProfessionalServices: b.isProfessionalServices,
            expectedClassification: b.expectedClassification
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: classify, classify-all, or seed-businesses' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('[business-classifier] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});