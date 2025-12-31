import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Transaction {
  amount: number;
  description: string;
  isConnectedPerson?: boolean;
  counterpartyAmount?: number;
  type?: 'income' | 'expense' | 'capital';
}

interface AvoidanceCheck {
  riskLevel: 'low' | 'medium' | 'high';
  warnings: string[];
  recommendation: string;
  taxActReferences: string[];
}

function checkConnectedPerson(transaction: Transaction): Partial<AvoidanceCheck> {
  if (!transaction.isConnectedPerson) {
    return { riskLevel: 'low', warnings: [], taxActReferences: [] };
  }

  const warnings: string[] = [];
  const taxActReferences: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  // Check if transaction might not be at arm's length (Section 191)
  if (transaction.counterpartyAmount && transaction.counterpartyAmount !== transaction.amount) {
    const discrepancy = Math.abs(transaction.amount - transaction.counterpartyAmount) / transaction.amount;
    if (discrepancy > 0.2) {
      warnings.push(`Connected person transaction with ${(discrepancy * 100).toFixed(0)}% price discrepancy - may not be at arm's length`);
      taxActReferences.push('Section 191 - Connected Persons');
      riskLevel = 'high';
    }
  }

  // Flag all connected person transactions for review
  if (transaction.isConnectedPerson) {
    warnings.push('Transaction with connected person requires arm\'s length verification');
    taxActReferences.push('Section 191 - Connected Persons');
    if (riskLevel === 'low') riskLevel = 'medium';
  }

  return { riskLevel, warnings, taxActReferences };
}

function checkGiftVsIncome(transaction: Transaction): Partial<AvoidanceCheck> {
  const warnings: string[] = [];
  const taxActReferences: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  const desc = transaction.description.toLowerCase();
  const giftKeywords = ['gift', 'donation', 'gratuit', 'free', 'no charge'];
  const incomeKeywords = ['service', 'work', 'contract', 'project', 'commission', 'payment for'];

  const hasGiftKeyword = giftKeywords.some(k => desc.includes(k));
  const hasIncomeKeyword = incomeKeywords.some(k => desc.includes(k));

  if (hasGiftKeyword && hasIncomeKeyword) {
    warnings.push('Transaction labeled as gift but contains income-related keywords');
    taxActReferences.push('Section 192 - Artificial Transactions');
    riskLevel = 'high';
  } else if (hasGiftKeyword && transaction.amount > 500000) {
    warnings.push('Large transaction marked as gift may be disguised income');
    taxActReferences.push('Section 192 - Artificial Transactions');
    riskLevel = 'medium';
  }

  return { riskLevel, warnings, taxActReferences };
}

function checkCapitalVsRevenue(transaction: Transaction): Partial<AvoidanceCheck> {
  const warnings: string[] = [];
  const taxActReferences: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  const desc = transaction.description.toLowerCase();
  const capitalKeywords = ['investment', 'capital', 'equity', 'loan', 'asset sale'];
  const revenueKeywords = ['recurring', 'monthly', 'regular', 'fee', 'service charge'];

  const hasCapitalKeyword = capitalKeywords.some(k => desc.includes(k));
  const hasRevenueKeyword = revenueKeywords.some(k => desc.includes(k));

  if (hasCapitalKeyword && hasRevenueKeyword) {
    warnings.push('Transaction has both capital and revenue characteristics - needs classification review');
    taxActReferences.push('Section 192 - Artificial Transactions');
    riskLevel = 'medium';
  }

  return { riskLevel, warnings, taxActReferences };
}

function checkRoundNumbers(transaction: Transaction): Partial<AvoidanceCheck> {
  const warnings: string[] = [];
  const taxActReferences: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  const isExactlyRound = transaction.amount % 100000 === 0 && transaction.amount >= 1000000;
  
  if (isExactlyRound && transaction.isConnectedPerson) {
    warnings.push('Suspiciously round amount in connected person transaction');
    taxActReferences.push('Section 191 - Connected Persons');
    riskLevel = 'medium';
  }

  return { riskLevel, warnings, taxActReferences };
}

function maxRiskLevel(a: 'low' | 'medium' | 'high', b: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
  const levels = { low: 0, medium: 1, high: 2 };
  return levels[a] >= levels[b] ? a : b;
}

function checkTransaction(transaction: Transaction): AvoidanceCheck {
  const checks = [
    checkConnectedPerson(transaction),
    checkGiftVsIncome(transaction),
    checkCapitalVsRevenue(transaction),
    checkRoundNumbers(transaction),
  ];

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  const warnings: string[] = [];
  const taxActReferences: string[] = [];

  for (const check of checks) {
    if (check.riskLevel) riskLevel = maxRiskLevel(riskLevel, check.riskLevel);
    if (check.warnings) warnings.push(...check.warnings);
    if (check.taxActReferences) taxActReferences.push(...check.taxActReferences);
  }

  let recommendation = 'No action required.';
  if (riskLevel === 'medium') {
    recommendation = 'Review transaction details and ensure proper documentation.';
  } else if (riskLevel === 'high') {
    recommendation = 'Immediate review required. Verify arm\'s length pricing and proper classification.';
  }

  return {
    riskLevel,
    warnings: [...new Set(warnings)],
    recommendation,
    taxActReferences: [...new Set(taxActReferences)],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('Anti-avoidance check request:', JSON.stringify(body));

    if (Array.isArray(body.transactions)) {
      // Batch check
      const results = body.transactions.map((t: Transaction) => ({
        transaction: t,
        check: checkTransaction(t),
      }));

      const summary = {
        total: results.length,
        highRisk: results.filter((r: any) => r.check.riskLevel === 'high').length,
        mediumRisk: results.filter((r: any) => r.check.riskLevel === 'medium').length,
        lowRisk: results.filter((r: any) => r.check.riskLevel === 'low').length,
      };

      console.log('Batch check summary:', summary);

      return new Response(
        JSON.stringify({ results, summary }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Single transaction check
      const result = checkTransaction(body as Transaction);
      console.log('Single check result:', result);

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Anti-avoidance check error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process anti-avoidance check' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
