import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Intent definitions for AI classification
const INTENT_DEFINITIONS = `
Available intents:
1. get_transaction_summary - User wants to see their transaction history, spending summary, or bank activity
   Entities: period (month, week, day), account_type
   Examples: "show my transactions", "what did I spend last month", "summary"

2. get_tax_relief_info - User asking about tax deductions, exemptions, reliefs, or allowances
   Entities: relief_type (pension, housing, children, medical)
   Examples: "what deductions can I claim", "tax relief for children", "am I exempt"

3. upload_receipt - User wants to upload, send, or submit a receipt or invoice for processing
   Entities: receipt_type (invoice, receipt, expense)
   Examples: "I want to upload a receipt", "here's my invoice", "submit expense"

4. categorize_expense - User wants to classify or categorize a transaction or expense
   Entities: category, amount, description
   Examples: "categorize this as transport", "is this a business expense", "classify my purchase"

5. get_tax_calculation - User wants to calculate VAT, income tax, or any tax amount
   Entities: tax_type (vat, income, pension), amount, period
   Examples: "calculate VAT on 50000", "how much tax do I owe", "what's my tax bill"

6. set_reminder - User wants to set up a reminder for tax filing or payment deadlines
   Entities: reminder_type, due_date, tax_type
   Examples: "remind me to file VAT", "set deadline reminder", "when is my tax due"

7. connect_bank - User wants to link their bank account for automatic transaction tracking
   Entities: bank_name
   Examples: "connect my bank", "link account", "add my GTBank"

8. verify_identity - User wants to verify their NIN, TIN, or CAC registration
   Entities: id_type (nin, tin, cac), id_value
   Examples: "verify my TIN", "check my NIN", "validate my CAC number"

9. general_query - General questions about tax, the system, or conversation that doesn't fit other intents
   Examples: "hello", "what can you do", "help me understand VAT"
`;

// Fallback rule-based intent detection
function fallbackIntentDetection(message: string): { 
  name: string; 
  confidence: number; 
  entities: Record<string, any>;
  source: 'fallback';
} {
  const lower = message.toLowerCase().trim();
  
  // Intent patterns with confidence scores
  const patterns: Array<{
    intent: string;
    patterns: RegExp[];
    entities?: Record<string, any>;
  }> = [
    {
      intent: 'get_transaction_summary',
      patterns: [
        /\b(transactions?|spending|spent|summary|history|statement)\b/i,
        /\b(show|view|see)\s+my\s+(money|account|bank)/i
      ]
    },
    {
      intent: 'get_tax_relief_info',
      patterns: [
        /\b(relief|deduct|exempt|allowance)\b/i,
        /\b(can\s+i\s+claim|what\s+deductions?)\b/i,
        /\bsection\s+\d+\b/i
      ]
    },
    {
      intent: 'upload_receipt',
      patterns: [
        /\b(upload|send|submit)\s+(receipt|invoice|document)/i,
        /\breceipt\b/i,
        /\binvoice\b.*\b(upload|send|here)/i
      ]
    },
    {
      intent: 'categorize_expense',
      patterns: [
        /\b(categorize|classify|category)\b/i,
        /\bis\s+this\s+(business|personal|deductible)\b/i,
        /\bwhat\s+type\s+of\s+expense\b/i
      ]
    },
    {
      intent: 'get_tax_calculation',
      patterns: [
        /\b(calculate|compute|how\s+much)\s+(vat|tax|income)/i,
        /\bvat\s+on\s+\d+/i,
        /\btax\s+\d+/i,
        /\b(pension|freelance|contractor)\s+\d+/i
      ]
    },
    {
      intent: 'set_reminder',
      patterns: [
        /\b(remind|reminder|deadline|due\s+date)\b/i,
        /\bwhen\s+(is|should)\s+(my|the)\s+(tax|vat|filing)/i
      ]
    },
    {
      intent: 'connect_bank',
      patterns: [
        /\b(connect|link|add)\s+(my\s+)?(bank|account)/i,
        /\b(gtbank|zenith|access|uba|first\s+bank)\b/i
      ]
    },
    {
      intent: 'verify_identity',
      patterns: [
        /\b(verify|validate|check)\s+(my\s+)?(nin|tin|cac)/i,
        /\bmy\s+(nin|tin|cac)\s+is\b/i,
        /\b(nin|tin|cac)\s*[:\s]+\d+/i
      ]
    }
  ];

  for (const { intent, patterns: regexes, entities } of patterns) {
    for (const regex of regexes) {
      if (regex.test(lower)) {
        // Extract entities based on intent
        const extractedEntities = extractEntities(message, intent);
        return {
          name: intent,
          confidence: 0.75,
          entities: { ...entities, ...extractedEntities },
          source: 'fallback'
        };
      }
    }
  }

  return {
    name: 'general_query',
    confidence: 0.5,
    entities: {},
    source: 'fallback'
  };
}

// Entity extraction helper
function extractEntities(message: string, intent: string): Record<string, any> {
  const entities: Record<string, any> = {};
  const lower = message.toLowerCase();

  // Extract amounts
  const amountMatch = message.match(/[₦n]?(\d[\d,]*)/i);
  if (amountMatch) {
    entities.amount = parseInt(amountMatch[1].replace(/,/g, ''));
  }

  // Extract period references
  if (/last\s+month/i.test(lower)) entities.period = 'last_month';
  if (/this\s+month/i.test(lower)) entities.period = 'current_month';
  if (/last\s+week/i.test(lower)) entities.period = 'last_week';

  // Extract tax types
  if (/\bvat\b/i.test(lower)) entities.tax_type = 'vat';
  if (/\bincome\s+tax\b/i.test(lower)) entities.tax_type = 'income';
  if (/\bpension\b/i.test(lower)) entities.tax_type = 'pension';

  // Extract ID types and values
  const ninMatch = message.match(/\bNIN[:\s]*(\d{11})/i);
  if (ninMatch) {
    entities.id_type = 'nin';
    entities.id_value = ninMatch[1];
  }
  
  const tinMatch = message.match(/\bTIN[:\s]*(\d{10,})/i);
  if (tinMatch) {
    entities.id_type = 'tin';
    entities.id_value = tinMatch[1];
  }

  const cacMatch = message.match(/\bCAC[:\s]*(\d+)/i);
  if (cacMatch) {
    entities.id_type = 'cac';
    entities.id_value = cacMatch[1];
  }

  return entities;
}

// Artificial transaction detection (Section 191 NTA 2025)
function detectArtificialTransaction(
  itemDescription: string,
  category?: string
): { isSuspicious: boolean; warning?: string; actReference?: string } {
  const lower = itemDescription.toLowerCase();
  
  // Personal items being claimed as business expenses
  const personalItemPatterns = [
    { pattern: /\b(playstation|xbox|nintendo|gaming)\b/i, item: 'gaming console' },
    { pattern: /\b(vacation|holiday|trip)\b/i, item: 'personal vacation' },
    { pattern: /\b(groceries|supermarket|food shopping)\b/i, item: 'personal groceries' },
    { pattern: /\b(gym|fitness|workout)\b/i, item: 'personal fitness' },
    { pattern: /\b(birthday|anniversary|wedding)\b/i, item: 'personal celebration' },
    { pattern: /\b(netflix|spotify|streaming)\b/i, item: 'personal entertainment subscription' }
  ];

  for (const { pattern, item } of personalItemPatterns) {
    if (pattern.test(lower)) {
      if (category === 'business' || category === 'deductible') {
        return {
          isSuspicious: true,
          warning: `⚠️ SECTION 191 ALERT: "${item}" appears to be a personal expense being claimed as business deductible. This may constitute an artificial arrangement to avoid tax.`,
          actReference: 'Section 191 NTA 2025 - Anti-Avoidance'
        };
      }
    }
  }

  return { isSuspicious: false };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      message, 
      context = [], 
      checkArtificialTransaction = false,
      itemDescription,
      category 
    } = await req.json();

    // Validate input
    if (!message && !checkArtificialTransaction) {
      return new Response(
        JSON.stringify({ error: 'Message is required for intent classification' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If checking for artificial transaction
    if (checkArtificialTransaction && itemDescription) {
      const result = detectArtificialTransaction(itemDescription, category);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Use AI if available, otherwise fallback
    if (LOVABLE_API_KEY) {
      try {
        // Build context from conversation history
        const contextString = context.length > 0
          ? `Recent conversation:\n${context.map((c: any) => `${c.role}: ${c.content}`).join('\n')}\n\n`
          : '';

        const systemPrompt = `You are an NLU intent classifier for a Nigerian tax assistant.

${INTENT_DEFINITIONS}

Analyze the user's message and return a JSON object with:
- name: the intent name (one of the 9 listed above)
- confidence: a number between 0 and 1 indicating how confident you are
- entities: any extracted entities as key-value pairs
- reasoning: brief explanation of why you chose this intent

Be precise. If the message is a greeting or unclear, use "general_query".
Consider the conversation context when available.

Return ONLY valid JSON, no markdown or explanation.`;

        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `${contextString}Current message: "${message}"` }
            ]
          })
        });

        if (!response.ok) {
          console.error('AI Gateway error:', response.status);
          throw new Error('AI Gateway unavailable');
        }

        const aiData = await response.json();
        const content = aiData.choices?.[0]?.message?.content;

        if (content) {
          // Parse JSON response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Also check for artificial transaction if relevant
            let artificialCheck = null;
            if (parsed.entities?.amount || parsed.name === 'categorize_expense') {
              const desc = parsed.entities?.description || message;
              artificialCheck = detectArtificialTransaction(desc, parsed.entities?.category);
            }

            return new Response(
              JSON.stringify({
                intent: {
                  name: parsed.name || 'general_query',
                  confidence: parsed.confidence || 0.8,
                  entities: parsed.entities || {},
                  reasoning: parsed.reasoning
                },
                source: 'ai',
                model: 'google/gemini-2.5-flash',
                artificialTransactionCheck: artificialCheck
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        
        throw new Error('Failed to parse AI response');
      } catch (aiError) {
        console.error('AI classification error, using fallback:', aiError);
      }
    }

    // Use fallback classification
    const fallbackResult = fallbackIntentDetection(message);
    
    // Check for artificial transaction
    let artificialCheck = null;
    if (fallbackResult.entities?.amount || fallbackResult.name === 'categorize_expense') {
      artificialCheck = detectArtificialTransaction(message, fallbackResult.entities?.category);
    }

    return new Response(
      JSON.stringify({
        intent: fallbackResult,
        source: 'fallback',
        artificialTransactionCheck: artificialCheck
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('simulate-nlu error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
