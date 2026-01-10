import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simplified categories - ML only classifies WHAT it is, VAT treatment is rule-based
// Categories: food, medical, education, agriculture, export, rent, financial, insurance, 
//             transport, services, equipment, materials, utilities, supplies, other
const CLASSIFICATION_TEST_CASES = [
  // Food items (VAT treatment determined by SupplyClassificationService)
  { description: "Rice (50kg bag)", aiCategory: "supplies", correctCategory: "food", amount: 45000, correctionType: "full_override" },
  { description: "Wheat flour (bulk)", aiCategory: "supplies", correctCategory: "food", amount: 120000, correctionType: "full_override" },
  { description: "Yam tubers (wholesale)", aiCategory: "produce", correctCategory: "food", amount: 95000, correctionType: "full_override" },
  { description: "Palm oil (drums)", aiCategory: "supplies", correctCategory: "food", amount: 78000, correctionType: "full_override" },
  { description: "Frozen fish (bulk)", aiCategory: "supplies", correctCategory: "food", amount: 145000, correctionType: "full_override" },
  { description: "Cassava flour", aiCategory: "produce", correctCategory: "food", amount: 35000, correctionType: "full_override" },
  { description: "Maize grains", aiCategory: "produce", correctCategory: "food", amount: 65000, correctionType: "full_override" },
  { description: "Baby formula", aiCategory: "supplies", correctCategory: "food", amount: 18500, correctionType: "full_override" },
  
  // Medical items
  { description: "Medical equipment", aiCategory: "equipment", correctCategory: "medical", amount: 1200000, correctionType: "full_override" },
  { description: "Pharmaceutical supplies", aiCategory: "supplies", correctCategory: "medical", amount: 89000, correctionType: "confirmation" },
  
  // Education
  { description: "Textbooks for school", aiCategory: "books", correctCategory: "education", amount: 25000, correctionType: "full_override" },
  { description: "Training workshop", aiCategory: "services", correctCategory: "education", amount: 120000, correctionType: "partial_edit" },
  
  // Agriculture
  { description: "Agricultural fertilizer", aiCategory: "supplies", correctCategory: "agriculture", amount: 220000, correctionType: "full_override" },
  { description: "Cattle feed (bulk)", aiCategory: "livestock", correctCategory: "agriculture", amount: 180000, correctionType: "full_override" },
  
  // Export
  { description: "Export goods to UK", aiCategory: "sales", correctCategory: "export", amount: 2500000, correctionType: "full_override" },
  
  // Rent (exempt)
  { description: "Office rent payment", aiCategory: "rent_standard", correctCategory: "rent", amount: 500000, correctionType: "partial_edit" },
  
  // Financial (exempt)
  { description: "Bank transfer charges", aiCategory: "fees", correctCategory: "financial", amount: 50, correctionType: "partial_edit" },
  
  // Insurance (exempt)
  { description: "Insurance premium", aiCategory: "other", correctCategory: "insurance", amount: 150000, correctionType: "partial_edit" },
  
  // Transport
  { description: "Diesel for transport", aiCategory: "fuel", correctCategory: "transport", amount: 48000, correctionType: "confirmation" },
  { description: "Vehicle maintenance", aiCategory: "maintenance", correctCategory: "transport", amount: 85000, correctionType: "partial_edit" },
  { description: "Travel expenses", aiCategory: "other", correctCategory: "transport", amount: 120000, correctionType: "confirmation" },
  
  // Services (standard VAT)
  { description: "Consulting services", aiCategory: "services", correctCategory: "services", amount: 350000, correctionType: "confirmation" },
  { description: "Website development", aiCategory: "technology", correctCategory: "services", amount: 450000, correctionType: "partial_edit" },
  { description: "Legal consultation fees", aiCategory: "professional", correctCategory: "services", amount: 200000, correctionType: "partial_edit" },
  { description: "Audit services", aiCategory: "professional", correctCategory: "services", amount: 500000, correctionType: "confirmation" },
  { description: "Printing services", aiCategory: "services", correctCategory: "services", amount: 35000, correctionType: "confirmation" },
  { description: "Security services", aiCategory: "services", correctCategory: "services", amount: 150000, correctionType: "confirmation" },
  { description: "Plumbing repairs", aiCategory: "maintenance", correctCategory: "services", amount: 35000, correctionType: "confirmation" },
  
  // Equipment (standard VAT)
  { description: "Laptop computer", aiCategory: "electronics", correctCategory: "equipment", amount: 850000, correctionType: "confirmation" },
  { description: "Generator purchase", aiCategory: "equipment", correctCategory: "equipment", amount: 750000, correctionType: "confirmation" },
  { description: "Office furniture", aiCategory: "furniture", correctCategory: "equipment", amount: 280000, correctionType: "confirmation" },
  { description: "Imported machinery", aiCategory: "equipment", correctCategory: "equipment", amount: 5500000, correctionType: "confirmation" },
  
  // Materials (standard VAT)
  { description: "Cement and building blocks", aiCategory: "construction", correctCategory: "materials", amount: 180000, correctionType: "confirmation" },
  { description: "Building materials", aiCategory: "construction", correctCategory: "materials", amount: 420000, correctionType: "confirmation" },
  { description: "Packaging materials", aiCategory: "supplies", correctCategory: "materials", amount: 28000, correctionType: "confirmation" },
  
  // Utilities (standard VAT)
  { description: "Electricity bill", aiCategory: "utilities", correctCategory: "utilities", amount: 85000, correctionType: "confirmation" },
  { description: "Internet subscription", aiCategory: "telecoms", correctCategory: "utilities", amount: 25000, correctionType: "partial_edit" },
  { description: "Mobile phone airtime", aiCategory: "telecoms", correctCategory: "utilities", amount: 50000, correctionType: "confirmation" },
  
  // Supplies (standard VAT)
  { description: "Cleaning supplies", aiCategory: "supplies", correctCategory: "supplies", amount: 12000, correctionType: "confirmation" },
  { description: "Stationery supplies", aiCategory: "office", correctCategory: "supplies", amount: 15000, correctionType: "confirmation" },
  { description: "Staff uniforms", aiCategory: "clothing", correctCategory: "supplies", amount: 45000, correctionType: "partial_edit" },
  
  // Other
  { description: "Marketing campaign", aiCategory: "advertising", correctCategory: "marketing", amount: 300000, correctionType: "confirmation" },
  { description: "Courier services", aiCategory: "logistics", correctCategory: "logistics", amount: 8500, correctionType: "confirmation" },
  { description: "Fuel purchase - generator", aiCategory: "fuel", correctCategory: "fuel", amount: 35000, correctionType: "confirmation" },
  { description: "Labor payment - construction", aiCategory: "services", correctCategory: "labor", amount: 75000, correctionType: "partial_edit" },
  { description: "Accounting software", aiCategory: "software", correctCategory: "software", amount: 95000, correctionType: "confirmation" },
  { description: "Equipment rental", aiCategory: "rental", correctCategory: "rental", amount: 200000, correctionType: "partial_edit" },
  { description: "Water treatment chemicals", aiCategory: "chemicals", correctCategory: "chemicals", amount: 55000, correctionType: "partial_edit" },
  { description: "Salary advance repayment", aiCategory: "other", correctCategory: "non_taxable", amount: 100000, correctionType: "full_override" },
  { description: "Office renovation", aiCategory: "construction", correctCategory: "capital", amount: 1500000, correctionType: "partial_edit" },
];

// Simplified pattern templates - just item types, no VAT suffix
const PATTERN_TEMPLATES = [
  { pattern: "rice", category: "food" },
  { pattern: "laptop", category: "equipment" },
  { pattern: "medical", category: "medical" },
  { pattern: "consulting", category: "services" },
  { pattern: "fuel", category: "fuel" },
  { pattern: "electricity", category: "utilities" },
  { pattern: "cement", category: "materials" },
  { pattern: "bank charge", category: "financial" },
  { pattern: "textbook", category: "education" },
  { pattern: "export", category: "export" },
  { pattern: "fertilizer", category: "agriculture" },
  { pattern: "insurance", category: "insurance" },
  { pattern: "office rent", category: "rent" },
  { pattern: "legal fees", category: "services" },
  { pattern: "diesel", category: "fuel" },
  { pattern: "wheat flour", category: "food" },
  { pattern: "yam", category: "food" },
  { pattern: "internet", category: "utilities" },
  { pattern: "generator", category: "equipment" },
  { pattern: "maintenance", category: "services" },
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
