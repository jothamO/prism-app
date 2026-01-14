import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, handleCors } from '../_shared/cors.ts';
import { getSupabaseWithAuth, getUserFromAuth } from '../_shared/supabase.ts';

const STANDARD_RATE = 0.075; // 7.5% per Tax Act 2025 Section 148

// Zero-rated items per Tax Act 2025 Section 186
const ZERO_RATED_KEYWORDS = [
  // Basic food items
  'rice', 'beans', 'yam', 'cassava', 'maize', 'millet', 'sorghum', 'wheat',
  'bread', 'flour', 'garri', 'plantain', 'potato', 'tomato', 'onion', 'pepper',
  'palm oil', 'groundnut oil', 'vegetable oil', 'salt', 'milk', 'baby food',
  // Medical supplies
  'medicine', 'drug', 'pharmaceutical', 'medical equipment', 'hospital',
  'vaccine', 'syringe', 'bandage', 'first aid', 'diagnostic',
  // Educational materials
  'textbook', 'exercise book', 'pencil', 'pen', 'school uniform', 'educational',
  // Agricultural inputs
  'fertilizer', 'seedling', 'pesticide', 'herbicide', 'tractor', 'farm equipment',
  // Exports
  'export', 'exported', 'foreign buyer', 'international shipment'
];

// Exempt items per Tax Act 2025 Section 187
const EXEMPT_KEYWORDS = [
  // Land and buildings
  'land', 'building', 'property', 'real estate', 'rent', 'lease',
  // Financial services
  'bank charges', 'interest', 'insurance premium', 'forex', 'stock trading',
  // Transport
  'public transport', 'bus fare', 'train ticket', 'ferry',
  // Medical services (not products)
  'medical consultation', 'hospital services', 'diagnostic services',
  // Educational services
  'school fees', 'tuition', 'training course'
];

interface VATClassification {
  category: 'standard' | 'zero-rated' | 'exempt';
  rate: number;
  canClaimInputVAT: boolean;
  actReference: string;
  matchedKeyword?: string;
}

function classifySupply(description: string, category?: string): VATClassification {
  const lowerDesc = description.toLowerCase();
  const lowerCat = category?.toLowerCase() || '';

  // Check zero-rated first
  for (const keyword of ZERO_RATED_KEYWORDS) {
    if (lowerDesc.includes(keyword) || lowerCat.includes(keyword)) {
      return {
        category: 'zero-rated',
        rate: 0,
        canClaimInputVAT: true,
        actReference: 'Section 186',
        matchedKeyword: keyword
      };
    }
  }

  // Check exempt
  for (const keyword of EXEMPT_KEYWORDS) {
    if (lowerDesc.includes(keyword) || lowerCat.includes(keyword)) {
      return {
        category: 'exempt',
        rate: 0,
        canClaimInputVAT: false,
        actReference: 'Section 187',
        matchedKeyword: keyword
      };
    }
  }

  // Default to standard rate
  return {
    category: 'standard',
    rate: STANDARD_RATE,
    canClaimInputVAT: true,
    actReference: 'Section 148'
  };
}

function calculateVAT(
  amount: number,
  includesVAT: boolean,
  classification: VATClassification
): {
  subtotal: number;
  vatAmount: number;
  total: number;
} {
  if (includesVAT) {
    const divisor = 1 + classification.rate;
    const subtotal = amount / divisor;
    const vatAmount = amount - subtotal;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      total: amount
    };
  } else {
    const vatAmount = amount * classification.rate;
    return {
      subtotal: amount,
      vatAmount: Math.round(vatAmount * 100) / 100,
      total: Math.round((amount + vatAmount) * 100) / 100
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // ===== AUTHENTICATION CHECK =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[vat-calculator] Missing authorization header');
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const supabase = getSupabaseWithAuth(authHeader.replace('Bearer ', ''));

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('[vat-calculator] Invalid token:', authError?.message);
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    console.log('[vat-calculator] User authenticated:', user.id);
    // ===== END AUTHENTICATION CHECK =====

    const { 
      amount, 
      includesVAT = false, 
      itemDescription = '', 
      category = '',
      items = [] // For batch processing
    } = await req.json();

    // Batch processing mode
    if (items && items.length > 0) {
      const results = items.map((item: any) => {
        const classification = classifySupply(item.description || '', item.category);
        const calculation = calculateVAT(item.amount || 0, item.includesVAT || false, classification);
        return {
          description: item.description,
          ...calculation,
          vatRate: classification.rate,
          classification: classification.category,
          canClaimInputVAT: classification.canClaimInputVAT,
          actReference: classification.actReference,
          matchedKeyword: classification.matchedKeyword
        };
      });

      const summary = {
        totalSubtotal: results.reduce((sum: number, r: any) => sum + r.subtotal, 0),
        totalVAT: results.reduce((sum: number, r: any) => sum + r.vatAmount, 0),
        totalAmount: results.reduce((sum: number, r: any) => sum + r.total, 0),
        standardRatedCount: results.filter((r: any) => r.classification === 'standard').length,
        zeroRatedCount: results.filter((r: any) => r.classification === 'zero-rated').length,
        exemptCount: results.filter((r: any) => r.classification === 'exempt').length
      };

      return jsonResponse({ items: results, summary });
    }

    // Single item mode
    const classification = classifySupply(itemDescription, category);
    const calculation = calculateVAT(amount, includesVAT, classification);

    const result = {
      ...calculation,
      vatRate: classification.rate,
      classification: classification.category,
      canClaimInputVAT: classification.canClaimInputVAT,
      actReference: classification.actReference,
      matchedKeyword: classification.matchedKeyword
    };

    console.log('VAT Calculation:', { input: { amount, includesVAT, itemDescription }, result });

    return jsonResponse(result);

  } catch (error) {
    console.error('VAT Calculator Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
