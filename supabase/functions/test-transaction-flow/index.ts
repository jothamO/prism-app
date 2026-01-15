import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


// Comprehensive Nigerian transactions for testing - includes edge cases
const SAMPLE_TRANSACTIONS = [
  // USSD Transactions
  {
    description: "USSD/AIRTIME/MTN/2348012345678",
    amount: 500,
    type: "debit",
    expectedClassification: "personal_expense",
    expectedFlags: { isUSSD: true }
  },
  {
    description: "*737*1*500#/GTB USSD AIRTIME",
    amount: 500,
    type: "debit",
    expectedClassification: "personal_expense",
    expectedFlags: { isUSSD: true }
  },
  {
    description: "*894*1*1000#/FIRST BANK TRANSFER",
    amount: 1000,
    type: "debit",
    expectedClassification: "transfer",
    expectedFlags: { isUSSD: true }
  },
  // POS Transactions
  {
    description: "POS/BUKKA HUT RESTAURANT/LAGOS",
    amount: 15000,
    type: "debit",
    expectedClassification: "meals_entertainment",
    expectedFlags: { isPOS: true }
  },
  {
    description: "POS/TERMINAL ID 12345/SHOPRITE LEKKI",
    amount: 35000,
    type: "debit",
    expectedClassification: "expense",
    expectedFlags: { isPOS: true }
  },
  // Salary/Income
  {
    description: "SALARY FOR DECEMBER 2025/ACME CORP",
    amount: 450000,
    type: "credit",
    expectedClassification: "salary_income",
    expectedFlags: {}
  },
  {
    description: "TRF FRM JOHN DOE/FREELANCE WEB DEV",
    amount: 75000,
    type: "credit",
    expectedClassification: "freelance_income",
    expectedFlags: {}
  },
  // Bank Charges - Various types
  {
    description: "EMTL CHARGE/ELECTRONIC MONEY TRANSFER",
    amount: 50,
    type: "debit",
    expectedClassification: "bank_charges",
    expectedFlags: { isEMTL: true }
  },
  {
    description: "VAT ON SMS ALERT/BANK CHARGE",
    amount: 52.50,
    type: "debit",
    expectedClassification: "bank_charges",
    expectedFlags: { isBankCharge: true }
  },
  {
    description: "ATM WDL FEE/FIRST BANK ATM",
    amount: 65,
    type: "debit",
    expectedClassification: "bank_charges",
    expectedFlags: { isBankCharge: true }
  },
  {
    description: "ACCOUNT MAINTENANCE FEE DEC 2025",
    amount: 500,
    type: "debit",
    expectedClassification: "bank_charges",
    expectedFlags: { isBankCharge: true }
  },
  {
    description: "COT CHARGE/COMMISSION ON TURNOVER",
    amount: 2500,
    type: "debit",
    expectedClassification: "bank_charges",
    expectedFlags: { isBankCharge: true }
  },
  {
    description: "SMS ALERT CHARGES OCT-DEC 2025",
    amount: 150,
    type: "debit",
    expectedClassification: "bank_charges",
    expectedFlags: { isBankCharge: true }
  },
  // Mobile Money
  {
    description: "OPAY/TRANSFER TO 0812345678",
    amount: 25000,
    type: "debit",
    expectedClassification: "transfer",
    expectedFlags: { isMobileMoney: true }
  },
  {
    description: "PALMPAY TRANSFER FROM 08123456789",
    amount: 45000,
    type: "credit",
    expectedClassification: "income",
    expectedFlags: { isMobileMoney: true }
  },
  {
    description: "KUDA/TRF TO SAVINGS",
    amount: 20000,
    type: "debit",
    expectedClassification: "transfer",
    expectedFlags: { isMobileMoney: true }
  },
  // Stamp Duty
  {
    description: "STAMP DUTY CHARGE",
    amount: 50,
    type: "debit",
    expectedClassification: "bank_charges",
    expectedFlags: { isStampDuty: true }
  },
  {
    description: "NXG STAMP DUTY/10000",
    amount: 50,
    type: "debit",
    expectedClassification: "bank_charges",
    expectedFlags: { isStampDuty: true }
  },
  // Foreign Currency
  {
    description: "USD TRANSFER/INTERNATIONAL/500USD",
    amount: 750000,
    type: "credit",
    expectedClassification: "income",
    expectedFlags: { isForeignCurrency: true }
  },
  {
    description: "FX PURCHASE 100 GBP AT 1850",
    amount: 185000,
    type: "debit",
    expectedClassification: "transfer",
    expectedFlags: { isForeignCurrency: true }
  },
  // NIP Transfers
  {
    description: "NIP TRF TO GTB/JOHN DOE/0012345678",
    amount: 150000,
    type: "debit",
    expectedClassification: "transfer",
    expectedFlags: {}
  },
  {
    description: "NIP/INWARD/FROM ACCESS/MARY JANE",
    amount: 100000,
    type: "credit",
    expectedClassification: "income",
    expectedFlags: {}
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const timing: Record<string, number> = {};

  try {
    const { userId, customTransactions } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user exists and has auth_user_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, full_name, email, auth_user_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "User not found", details: userError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[test-flow] Starting test for user:', user.full_name || user.email);
    
    if (!user.auth_user_id) {
      console.warn('[test-flow] WARNING: User has no auth_user_id - insights may not be visible in frontend');
    } else {
      console.log('[test-flow] User auth_user_id:', user.auth_user_id);
    }

    const transactions = customTransactions || SAMPLE_TRANSACTIONS;
    const results: any[] = [];
    const insertStart = Date.now();

    // Step 1: Insert transactions
    for (const txn of transactions) {
      const txnDate = new Date().toISOString().split('T')[0];
      const reference = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const { data: insertedTxn, error: insertError } = await supabase
        .from('bank_transactions')
        .insert({
          user_id: userId,
          description: txn.description,
          debit: txn.type === 'debit' ? txn.amount : null,
          credit: txn.type === 'credit' ? txn.amount : null,
          transaction_date: txnDate,
          reference: reference,
          metadata: {
            source: 'test-transaction-flow',
            expected: {
              classification: txn.expectedClassification,
              flags: txn.expectedFlags
            }
          }
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[test-flow] Insert error:', insertError);
        results.push({
          description: txn.description,
          error: 'Insert failed',
          details: insertError.message
        });
        continue;
      }

      results.push({
        id: insertedTxn.id,
        description: txn.description,
        amount: txn.amount,
        type: txn.type,
        expected: {
          classification: txn.expectedClassification,
          flags: txn.expectedFlags
        },
        actual: null,
        classificationTime: null
      });
    }

    timing.insertMs = Date.now() - insertStart;
    console.log(`[test-flow] Inserted ${results.filter(r => r.id).length} transactions in ${timing.insertMs}ms`);

    // Step 2: Classify each transaction
    const classifyStart = Date.now();
    
    for (const result of results) {
      if (!result.id) continue;

      const classifyStartSingle = Date.now();
      
      try {
        const classifyResponse = await supabase.functions.invoke('classify-transaction', {
          body: {
            transactionId: result.id,
            narration: result.description,
            amount: result.amount,
            type: result.type,
            date: new Date().toISOString().split('T')[0],
            userId: userId,
            saveResult: true
          }
        });

        result.classificationTime = Date.now() - classifyStartSingle;

        if (classifyResponse.error) {
          console.error('[test-flow] Classification error:', classifyResponse.error);
          result.actual = { error: classifyResponse.error.message || 'Classification failed' };
        } else {
          result.actual = {
            classification: classifyResponse.data?.classification,
            confidence: classifyResponse.data?.confidence,
            nigerianFlags: classifyResponse.data?.nigerianFlags,
            taxImplications: classifyResponse.data?.taxImplications,
            reasoning: classifyResponse.data?.reasoning
          };

          // Check if classification matches expected
          result.matchesExpected = result.actual.classification === result.expected.classification;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        result.actual = { error: errorMessage };
        result.classificationTime = Date.now() - classifyStartSingle;
      }
    }

    timing.classificationMs = Date.now() - classifyStart;
    console.log(`[test-flow] Classified transactions in ${timing.classificationMs}ms`);

    // Step 3: Generate insights
    const insightsStart = Date.now();
    let insights = null;

    try {
      const insightsResponse = await supabase.functions.invoke('generate-insights', {
        body: { userId }
      });

      if (insightsResponse.error) {
        console.error('[test-flow] Insights error:', insightsResponse.error);
        insights = { error: insightsResponse.error.message || 'Insights generation failed' };
      } else {
        insights = insightsResponse.data;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      insights = { error: errorMessage };
    }

    timing.insightsMs = Date.now() - insightsStart;
    timing.totalMs = Date.now() - startTime;

    // Calculate summary stats including flag detection
    const successfulClassifications = results.filter(r => r.actual && !r.actual.error);
    const matchingClassifications = results.filter(r => r.matchesExpected);
    
    // Calculate flag detection accuracy
    let expectedFlagsCount = 0;
    let detectedFlagsCount = 0;
    
    for (const result of successfulClassifications) {
      const expectedFlags = result.expected?.flags || {};
      const actualFlags = result.actual?.nigerianFlags || {};
      
      for (const [flagName, expectedValue] of Object.entries(expectedFlags)) {
        if (expectedValue === true) {
          expectedFlagsCount++;
          // Map expected flag names to actual flag names
          const flagMapping: Record<string, string> = {
            'isUSSD': 'isUSSD',
            'isPOS': 'isPOS',
            'isBankCharge': 'isBankCharge',
            'isEMTL': 'isEMTL',
            'isStampDuty': 'isStampDuty',
            'isMobileMoney': 'isMobileMoney',
            'isForeignCurrency': 'isForeignCurrency'
          };
          const actualFlagName = flagMapping[flagName] || flagName;
          if (actualFlags[actualFlagName] === true) {
            detectedFlagsCount++;
          }
        }
      }
    }
    
    const flagDetectionAccuracy = expectedFlagsCount > 0 
      ? (detectedFlagsCount / expectedFlagsCount * 100).toFixed(1) + '%'
      : 'N/A';
    
    const summary = {
      totalTransactions: transactions.length,
      inserted: results.filter(r => r.id).length,
      classified: successfulClassifications.length,
      matchingExpected: matchingClassifications.length,
      classificationAccuracy: successfulClassifications.length > 0 
        ? (matchingClassifications.length / successfulClassifications.length * 100).toFixed(1) + '%'
        : 'N/A',
      flagDetection: {
        expected: expectedFlagsCount,
        detected: detectedFlagsCount,
        accuracy: flagDetectionAccuracy
      },
      avgClassificationTime: successfulClassifications.length > 0
        ? Math.round(successfulClassifications.reduce((sum, r) => sum + (r.classificationTime || 0), 0) / successfulClassifications.length)
        : 0
    };

    console.log('[test-flow] Summary:', summary);

    return new Response(
      JSON.stringify({
        success: true,
        user: { id: user.id, name: user.full_name || user.email },
        summary,
        transactions: results,
        insights,
        timing
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[test-flow] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        timing: { totalMs: Date.now() - startTime }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
