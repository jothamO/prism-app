import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Transaction {
  amount: number;
  description: string;
  isConnectedPerson?: boolean;
  counterpartyAmount?: number;
  counterpartyName?: string;
  counterpartyTin?: string;
  type?: 'income' | 'expense' | 'capital';
  userId?: string;
}

interface ConnectedPartyMatch {
  isConnected: boolean;
  matchSource?: 'own_business' | 'related_party' | 'manual';
  matchedName?: string;
  relationshipType?: string;
}

interface AvoidanceCheck {
  riskLevel: 'low' | 'medium' | 'high';
  warnings: string[];
  recommendation: string;
  taxActReferences: string[];
  connectedPartyDetection?: ConnectedPartyMatch;
}

// Normalize business names for fuzzy matching
function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(ltd|limited|inc|incorporated|plc|llc|corp|corporation)\s*\.?$/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity between two strings (Jaccard similarity)
function calculateSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(' '));
  const set2 = new Set(str2.split(' '));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

// Detect connected party by cross-referencing
async function detectConnectedParty(
  supabase: any,
  userId: string,
  counterpartyName?: string,
  counterpartyTin?: string
): Promise<ConnectedPartyMatch> {
  if (!counterpartyName && !counterpartyTin) {
    return { isConnected: false };
  }

  const normalizedCounterparty = counterpartyName ? normalizeBusinessName(counterpartyName) : '';

  // Check against user's own businesses
  const { data: userBusinesses } = await supabase
    .from('businesses')
    .select('name, tin, registration_number')
    .eq('user_id', userId);

  if (userBusinesses) {
    for (const business of userBusinesses) {
      // Check TIN match
      if (counterpartyTin && business.tin && counterpartyTin === business.tin) {
        return {
          isConnected: true,
          matchSource: 'own_business',
          matchedName: business.name,
          relationshipType: 'own_business',
        };
      }

      // Check name similarity
      if (counterpartyName) {
        const normalizedBusiness = normalizeBusinessName(business.name);
        const similarity = calculateSimilarity(normalizedCounterparty, normalizedBusiness);
        
        if (similarity > 0.7) {
          return {
            isConnected: true,
            matchSource: 'own_business',
            matchedName: business.name,
            relationshipType: 'own_business',
          };
        }
      }
    }
  }

  // Check against declared related parties
  const { data: relatedParties } = await supabase
    .from('related_parties')
    .select('party_name, party_tin, relationship_type')
    .eq('user_id', userId);

  if (relatedParties) {
    for (const party of relatedParties) {
      // Check TIN match
      if (counterpartyTin && party.party_tin && counterpartyTin === party.party_tin) {
        return {
          isConnected: true,
          matchSource: 'related_party',
          matchedName: party.party_name,
          relationshipType: party.relationship_type,
        };
      }

      // Check name similarity
      if (counterpartyName) {
        const normalizedParty = normalizeBusinessName(party.party_name);
        const similarity = calculateSimilarity(normalizedCounterparty, normalizedParty);
        
        if (similarity > 0.7) {
          return {
            isConnected: true,
            matchSource: 'related_party',
            matchedName: party.party_name,
            relationshipType: party.relationship_type,
          };
        }
      }
    }
  }

  return { isConnected: false };
}

function checkConnectedPerson(transaction: Transaction, connectedPartyMatch?: ConnectedPartyMatch): Partial<AvoidanceCheck> {
  const isConnected = transaction.isConnectedPerson || connectedPartyMatch?.isConnected;
  
  if (!isConnected) {
    return { riskLevel: 'low', warnings: [], taxActReferences: [] };
  }

  const warnings: string[] = [];
  const taxActReferences: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  // Add auto-detection warning if applicable
  if (connectedPartyMatch?.isConnected && !transaction.isConnectedPerson) {
    const source = connectedPartyMatch.matchSource === 'own_business' 
      ? 'your own business' 
      : `declared related party (${connectedPartyMatch.relationshipType})`;
    warnings.push(`Auto-detected as connected person: "${connectedPartyMatch.matchedName}" matches ${source}`);
    taxActReferences.push('Section 191 - Connected Persons');
    riskLevel = 'high';
  }

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
  if (isConnected) {
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

function checkRoundNumbers(transaction: Transaction, connectedPartyMatch?: ConnectedPartyMatch): Partial<AvoidanceCheck> {
  const warnings: string[] = [];
  const taxActReferences: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  const isConnected = transaction.isConnectedPerson || connectedPartyMatch?.isConnected;
  const isExactlyRound = transaction.amount % 100000 === 0 && transaction.amount >= 1000000;
  
  if (isExactlyRound && isConnected) {
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

function checkTransaction(transaction: Transaction, connectedPartyMatch?: ConnectedPartyMatch): AvoidanceCheck {
  const checks = [
    checkConnectedPerson(transaction, connectedPartyMatch),
    checkGiftVsIncome(transaction),
    checkCapitalVsRevenue(transaction),
    checkRoundNumbers(transaction, connectedPartyMatch),
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
    connectedPartyDetection: connectedPartyMatch,
  };
}

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
      console.log('[anti-avoidance-check] Missing authorization header');
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
      console.log('[anti-avoidance-check] Invalid token:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[anti-avoidance-check] User authenticated:', user.id);
    // ===== END AUTHENTICATION CHECK =====

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('Anti-avoidance check request:', JSON.stringify(body));

    if (Array.isArray(body.transactions)) {
      // Batch check
      const results = await Promise.all(
        body.transactions.map(async (t: Transaction) => {
          let connectedPartyMatch: ConnectedPartyMatch | undefined;
          
          // Use the authenticated user's ID for connected party detection
          const targetUserId = t.userId || user.id;
          
          if (targetUserId && (t.counterpartyName || t.counterpartyTin)) {
            connectedPartyMatch = await detectConnectedParty(
              supabase,
              targetUserId,
              t.counterpartyName,
              t.counterpartyTin
            );
          }
          
          return {
            transaction: t,
            check: checkTransaction(t, connectedPartyMatch),
          };
        })
      );

      const summary = {
        total: results.length,
        highRisk: results.filter((r: any) => r.check.riskLevel === 'high').length,
        mediumRisk: results.filter((r: any) => r.check.riskLevel === 'medium').length,
        lowRisk: results.filter((r: any) => r.check.riskLevel === 'low').length,
        autoDetectedConnected: results.filter((r: any) => r.check.connectedPartyDetection?.isConnected).length,
      };

      console.log('Batch check summary:', summary);

      return new Response(
        JSON.stringify({ results, summary }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Single transaction check
      let connectedPartyMatch: ConnectedPartyMatch | undefined;
      const transaction = body as Transaction;
      
      // Use the authenticated user's ID for connected party detection
      const targetUserId = transaction.userId || user.id;
      
      if (targetUserId && (transaction.counterpartyName || transaction.counterpartyTin)) {
        connectedPartyMatch = await detectConnectedParty(
          supabase,
          targetUserId,
          transaction.counterpartyName,
          transaction.counterpartyTin
        );
        console.log('Connected party detection result:', connectedPartyMatch);
      }
      
      const result = checkTransaction(transaction, connectedPartyMatch);
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