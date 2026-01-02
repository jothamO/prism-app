import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Test classification cases from AdminVATTesting
const CLASSIFICATION_TEST_CASES = [
  { description: "Rice (50kg bag)", aiCategory: "food_standard", correctCategory: "food_zero_rated", amount: 45000, correctionType: "full_override" },
  { description: "Laptop computer", aiCategory: "electronics", correctCategory: "electronics", amount: 850000, correctionType: "confirmation" },
  { description: "Medical equipment", aiCategory: "equipment", correctCategory: "medical_zero_rated", amount: 1200000, correctionType: "full_override" },
  { description: "Office rent payment", aiCategory: "rent_standard", correctCategory: "rent_exempt", amount: 500000, correctionType: "partial_edit" },
  { description: "Consulting services", aiCategory: "services", correctCategory: "services", amount: 350000, correctionType: "confirmation" },
  { description: "Textbooks for school", aiCategory: "books", correctCategory: "education_zero_rated", amount: 25000, correctionType: "full_override" },
  { description: "Bank transfer charges", aiCategory: "fees", correctCategory: "financial_exempt", amount: 50, correctionType: "partial_edit" },
  { description: "Cement and building blocks", aiCategory: "materials", correctCategory: "materials", amount: 180000, correctionType: "confirmation" },
  { description: "Labor payment - construction", aiCategory: "services", correctCategory: "labor_services", amount: 75000, correctionType: "partial_edit" },
  { description: "Fuel purchase - generator", aiCategory: "fuel", correctCategory: "fuel", amount: 35000, correctionType: "confirmation" },
  { description: "Export goods to UK", aiCategory: "sales", correctCategory: "export_zero_rated", amount: 2500000, correctionType: "full_override" },
  { description: "Website development", aiCategory: "technology", correctCategory: "professional_services", amount: 450000, correctionType: "partial_edit" },
  { description: "Wheat flour (bulk)", aiCategory: "food_standard", correctCategory: "food_zero_rated", amount: 120000, correctionType: "full_override" },
  { description: "Pharmaceutical supplies", aiCategory: "medical", correctCategory: "medical_zero_rated", amount: 89000, correctionType: "confirmation" },
  { description: "Office furniture", aiCategory: "furniture", correctCategory: "furniture", amount: 280000, correctionType: "confirmation" },
  { description: "Legal consultation fees", aiCategory: "services", correctCategory: "professional_services", amount: 200000, correctionType: "partial_edit" },
  { description: "Imported machinery", aiCategory: "equipment", correctCategory: "capital_equipment", amount: 5500000, correctionType: "confirmation" },
  { description: "Yam tubers (wholesale)", aiCategory: "food", correctCategory: "food_zero_rated", amount: 95000, correctionType: "full_override" },
  { description: "Insurance premium", aiCategory: "insurance", correctCategory: "insurance_exempt", amount: 150000, correctionType: "partial_edit" },
  { description: "Diesel for transport", aiCategory: "fuel", correctCategory: "transport_fuel", amount: 48000, correctionType: "confirmation" },
  { description: "Printing services", aiCategory: "services", correctCategory: "services", amount: 35000, correctionType: "confirmation" },
  { description: "Baby formula", aiCategory: "food", correctCategory: "baby_products_zero_rated", amount: 18500, correctionType: "full_override" },
  { description: "Agricultural fertilizer", aiCategory: "supplies", correctCategory: "agricultural_zero_rated", amount: 220000, correctionType: "full_override" },
  { description: "Generator purchase", aiCategory: "equipment", correctCategory: "equipment", amount: 750000, correctionType: "confirmation" },
  { description: "Staff uniforms", aiCategory: "clothing", correctCategory: "uniforms", amount: 45000, correctionType: "partial_edit" },
  { description: "Electricity bill", aiCategory: "utilities", correctCategory: "utilities", amount: 85000, correctionType: "confirmation" },
  { description: "Training workshop", aiCategory: "services", correctCategory: "education_services", amount: 120000, correctionType: "partial_edit" },
  { description: "Plumbing repairs", aiCategory: "maintenance", correctCategory: "maintenance_services", amount: 35000, correctionType: "confirmation" },
  { description: "Cleaning supplies", aiCategory: "supplies", correctCategory: "supplies", amount: 12000, correctionType: "confirmation" },
  { description: "Internet subscription", aiCategory: "services", correctCategory: "telecommunications", amount: 25000, correctionType: "partial_edit" },
  { description: "Cattle feed (bulk)", aiCategory: "livestock", correctCategory: "agricultural_zero_rated", amount: 180000, correctionType: "full_override" },
  { description: "Maize grains", aiCategory: "food", correctCategory: "food_zero_rated", amount: 65000, correctionType: "full_override" },
  { description: "Accounting software", aiCategory: "software", correctCategory: "software", amount: 95000, correctionType: "confirmation" },
  { description: "Security services", aiCategory: "services", correctCategory: "security_services", amount: 150000, correctionType: "confirmation" },
  { description: "Marketing campaign", aiCategory: "advertising", correctCategory: "advertising", amount: 300000, correctionType: "confirmation" },
  { description: "Vehicle maintenance", aiCategory: "transport", correctCategory: "vehicle_maintenance", amount: 85000, correctionType: "partial_edit" },
  { description: "Palm oil (drums)", aiCategory: "food", correctCategory: "food_zero_rated", amount: 78000, correctionType: "full_override" },
  { description: "Stationery supplies", aiCategory: "office", correctCategory: "office_supplies", amount: 15000, correctionType: "confirmation" },
  { description: "Courier services", aiCategory: "logistics", correctCategory: "logistics", amount: 8500, correctionType: "confirmation" },
  { description: "Equipment rental", aiCategory: "rental", correctCategory: "equipment_rental", amount: 200000, correctionType: "partial_edit" },
  { description: "Frozen fish (bulk)", aiCategory: "food", correctCategory: "food_zero_rated", amount: 145000, correctionType: "full_override" },
  { description: "Audit services", aiCategory: "professional", correctCategory: "professional_services", amount: 500000, correctionType: "confirmation" },
  { description: "Building materials", aiCategory: "construction", correctCategory: "materials", amount: 420000, correctionType: "confirmation" },
  { description: "Water treatment chemicals", aiCategory: "chemicals", correctCategory: "water_treatment", amount: 55000, correctionType: "partial_edit" },
  { description: "Salary advance repayment", aiCategory: "other", correctCategory: "non_taxable", amount: 100000, correctionType: "full_override" },
  { description: "Office renovation", aiCategory: "construction", correctCategory: "capital_improvement", amount: 1500000, correctionType: "partial_edit" },
  { description: "Cassava flour", aiCategory: "food", correctCategory: "food_zero_rated", amount: 35000, correctionType: "full_override" },
  { description: "Mobile phone airtime", aiCategory: "telecoms", correctCategory: "telecommunications", amount: 50000, correctionType: "confirmation" },
  { description: "Packaging materials", aiCategory: "supplies", correctCategory: "packaging", amount: 28000, correctionType: "confirmation" },
  { description: "Travel expenses", aiCategory: "transport", correctCategory: "travel", amount: 120000, correctionType: "confirmation" },
];

// Business pattern templates
const PATTERN_TEMPLATES = [
  { pattern: "rice", category: "food_zero_rated" },
  { pattern: "laptop", category: "electronics" },
  { pattern: "medical", category: "medical_zero_rated" },
  { pattern: "consulting", category: "professional_services" },
  { pattern: "fuel", category: "transport_fuel" },
  { pattern: "electricity", category: "utilities" },
  { pattern: "cement", category: "materials" },
  { pattern: "bank charge", category: "financial_exempt" },
  { pattern: "textbook", category: "education_zero_rated" },
  { pattern: "export", category: "export_zero_rated" },
  { pattern: "fertilizer", category: "agricultural_zero_rated" },
  { pattern: "insurance", category: "insurance_exempt" },
  { pattern: "office rent", category: "rent_exempt" },
  { pattern: "legal fees", category: "professional_services" },
  { pattern: "diesel", category: "fuel" },
  { pattern: "wheat flour", category: "food_zero_rated" },
  { pattern: "yam", category: "food_zero_rated" },
  { pattern: "internet", category: "telecommunications" },
  { pattern: "generator", category: "equipment" },
  { pattern: "maintenance", category: "maintenance_services" },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🌱 Starting ML data seeding...');

    // Step 1: Get or create test users
    const { data: existingUsers, error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(5);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    let userIds = existingUsers?.map(u => u.id) || [];

    // Create test users if none exist
    if (userIds.length === 0) {
      const testUsers = [
        { telegram_id: 'test_user_1', full_name: 'Test User 1', entity_type: 'individual', platform: 'telegram' },
        { telegram_id: 'test_user_2', full_name: 'Test User 2', entity_type: 'company', platform: 'telegram' },
        { telegram_id: 'test_user_3', full_name: 'Test User 3', entity_type: 'individual', platform: 'telegram' },
      ];

      const { data: createdUsers, error: createError } = await supabase
        .from('users')
        .insert(testUsers)
        .select('id');

      if (createError) {
        throw new Error(`Failed to create test users: ${createError.message}`);
      }

      userIds = createdUsers?.map(u => u.id) || [];
    }

    console.log(`📊 Using ${userIds.length} users for seeding`);

    // Step 2: Get or create test businesses
    const { data: existingBusinesses, error: bizError } = await supabase
      .from('businesses')
      .select('id, user_id')
      .limit(3);

    if (bizError) {
      throw new Error(`Failed to fetch businesses: ${bizError.message}`);
    }

    let businessIds: { id: string; user_id: string }[] = existingBusinesses || [];

    if (businessIds.length === 0 && userIds.length > 0) {
      const testBusinesses = [
        { user_id: userIds[0], name: 'Alhaji Kabir Farms', registration_number: 'BN1234567', classification: 'sme' },
        { user_id: userIds[1 % userIds.length], name: 'Blessing Tech Solutions', registration_number: 'RC7654321', classification: 'large' },
        { user_id: userIds[2 % userIds.length], name: 'Tunde Import Export', registration_number: 'RC1122334', classification: 'sme' },
      ];

      const { data: createdBiz, error: createBizError } = await supabase
        .from('businesses')
        .insert(testBusinesses)
        .select('id, user_id');

      if (createBizError) {
        throw new Error(`Failed to create test businesses: ${createBizError.message}`);
      }

      businessIds = createdBiz || [];
    }

    console.log(`🏢 Using ${businessIds.length} businesses for seeding`);

    // Step 3: Seed AI Feedback data
    const feedbackRecords = CLASSIFICATION_TEST_CASES.map((testCase, index) => {
      const userId = userIds[index % userIds.length];
      const business = businessIds[index % Math.max(1, businessIds.length)];
      const daysAgo = Math.floor(Math.random() * 30);
      const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

      return {
        user_id: userId,
        business_id: business?.id || null,
        entity_type: 'invoice_item' as const,
        item_description: testCase.description,
        amount: testCase.amount,
        ai_prediction: { category: testCase.aiCategory, confidence: 0.7 + Math.random() * 0.25 },
        user_correction: { category: testCase.correctCategory },
        correction_type: testCase.correctionType,
        ai_model_version: 'v1.0',
        used_in_training: false,
        created_at: createdAt,
      };
    });

    const { data: feedbackData, error: feedbackError } = await supabase
      .from('ai_feedback')
      .insert(feedbackRecords)
      .select('id');

    if (feedbackError) {
      throw new Error(`Failed to insert feedback: ${feedbackError.message}`);
    }

    console.log(`✅ Inserted ${feedbackData?.length || 0} feedback records`);

    // Step 4: Seed Business Classification Patterns
    const patternRecords: any[] = [];
    
    businessIds.forEach((business, bizIndex) => {
      // Each business gets 8-12 patterns
      const patternsForBiz = PATTERN_TEMPLATES.slice(bizIndex * 7, (bizIndex + 1) * 7 + 5);
      
      patternsForBiz.forEach(template => {
        const occurrenceCount = Math.floor(Math.random() * 20) + 3;
        const correctPredictions = Math.floor(occurrenceCount * (0.7 + Math.random() * 0.3));
        const totalAmount = template.pattern.includes('export') || template.pattern.includes('generator')
          ? Math.floor(Math.random() * 5000000) + 500000
          : Math.floor(Math.random() * 200000) + 10000;

        patternRecords.push({
          business_id: business.id,
          item_pattern: template.pattern,
          category: template.category,
          occurrence_count: occurrenceCount,
          correct_predictions: correctPredictions,
          total_amount: totalAmount,
          confidence: correctPredictions / occurrenceCount,
          last_used_at: new Date(Date.now() - Math.floor(Math.random() * 7) * 24 * 60 * 60 * 1000).toISOString(),
        });
      });
    });

    if (patternRecords.length > 0) {
      const { data: patternData, error: patternError } = await supabase
        .from('business_classification_patterns')
        .insert(patternRecords)
        .select('id');

      if (patternError) {
        throw new Error(`Failed to insert patterns: ${patternError.message}`);
      }

      console.log(`✅ Inserted ${patternData?.length || 0} pattern records`);
    }

    // Step 5: Create a test ML model record
    const { error: modelError } = await supabase
      .from('ml_models')
      .upsert({
        model_name: 'prism-classifier',
        version: 'v1.0-seed',
        model_type: 'classification',
        status: 'deployed',
        is_active: true,
        accuracy: 0.78,
        precision_score: 0.82,
        recall_score: 0.75,
        f1_score: 0.78,
        training_data_count: feedbackRecords.length,
        trained_at: new Date().toISOString(),
        deployed_at: new Date().toISOString(),
      });

    if (modelError) {
      console.warn(`Warning: Failed to create model record: ${modelError.message}`);
    } else {
      console.log('✅ Created ML model record');
    }

    const summary = {
      success: true,
      seeded: {
        users: userIds.length,
        businesses: businessIds.length,
        feedbackRecords: feedbackData?.length || 0,
        patternRecords: patternRecords.length,
        modelCreated: !modelError,
      },
      message: 'ML data seeded successfully! The ML pipeline can now process this training data.',
    };

    console.log('🎉 ML data seeding complete:', summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Seeding error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
