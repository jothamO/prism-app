import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


// Intent definitions for AI classification
const INTENT_DEFINITIONS = `
Available intents:

1. get_transaction_summary - User wants transaction history, spending summary, or bank activity
   Entities: period (month, week, day), account_type
   Examples: "show my transactions", "what did I spend last month", "summary of December"

2. get_tax_relief_info - User asking about tax deductions, exemptions, reliefs, or allowances
   Entities: relief_type (pension, housing, children, medical, nhf, nhis)
   Examples: "what deductions can I claim", "tax relief for children", "am I exempt"

3. upload_receipt - User wants to upload, send, or submit a receipt or invoice
   Entities: receipt_type (invoice, receipt, expense)
   Examples: "I want to upload a receipt", "here's my invoice", "submit expense"

4. categorize_expense - User wants to classify or categorize a transaction or expense
   Entities: category, amount, description
   Examples: "categorize this as transport", "is this a business expense", "classify my purchase"

5. get_tax_calculation - User wants to calculate VAT, income tax, or any tax amount
   Entities: tax_type (vat, income, pension, salary, freelance), amount, period, expenses
   Examples: "calculate VAT on 50000", "how much tax do I owe", "what's my tax bill", "tax 10000000"

6. set_reminder - User wants to set up a reminder for tax filing or payment deadlines
   Entities: reminder_type, due_date, tax_type
   Examples: "remind me to file VAT", "set deadline reminder", "when is my tax due"

7. connect_bank - User wants to link their bank account for automatic transaction tracking
   Entities: bank_name
   Examples: "connect my bank", "link account", "add my GTBank"

8. verify_identity - User wants to verify their NIN, TIN, or CAC registration
   Entities: id_type (nin, tin, cac, bvn), id_value
   Examples: "verify my TIN", "check my NIN", "validate my CAC number"

9. onboarding - User is starting fresh or wants to set up their account
   Examples: "start", "get started", "begin", "setup", "onboard"

10. general_query - General questions about tax, the system, or conversation that doesn't fit other intents
    Examples: "hello", "what can you do", "help me understand VAT"
`;

// Personal items that might be artificial transactions (Section 191)
const PERSONAL_ITEM_PATTERNS = [
  { pattern: /\b(playstation|xbox|nintendo|gaming|ps5|ps4)\b/i, item: 'gaming console' },
  { pattern: /\b(vacation|holiday|trip|travel)\b.*\b(personal|family)\b/i, item: 'personal vacation' },
  { pattern: /\b(groceries|supermarket|food shopping)\b/i, item: 'personal groceries' },
  { pattern: /\b(gym|fitness|workout|membership)\b/i, item: 'personal fitness' },
  { pattern: /\b(birthday|anniversary|wedding)\b/i, item: 'personal celebration' },
  { pattern: /\b(netflix|spotify|streaming|disney)\b/i, item: 'personal entertainment subscription' },
  { pattern: /\b(personal|family)\s+(car|vehicle|suv)\b/i, item: 'personal vehicle' },
  { pattern: /\b(children|kids)\s+(school|tuition)\b/i, item: 'personal education' },
];

// Fallback rule-based intent detection
function fallbackIntentDetection(message: string): { 
  name: string; 
  confidence: number; 
  entities: Record<string, unknown>;
  source: 'fallback';
} {
  const lower = message.toLowerCase().trim();
  
  // Intent patterns with confidence scores
  const patterns: Array<{
    intent: string;
    patterns: RegExp[];
    confidence: number;
  }> = [
    {
      intent: 'onboarding',
      patterns: [
        /^\/?(start|onboard|setup|get started|begin)$/i,
        /^(hi|hello|hey)\s*$/i
      ],
      confidence: 0.9
    },
    {
      intent: 'get_tax_calculation',
      patterns: [
        /^(vat|tax|salary|pension|freelance)\s+[₦n]?\d/i,
        /calculate\s+(vat|tax|income)/i,
        /how\s+much\s+(vat|tax)/i,
        /\btax\s+on\s+\d+/i
      ],
      confidence: 0.85
    },
    {
      intent: 'get_transaction_summary',
      patterns: [
        /\b(transactions?|spending|spent|summary|history|statement)\b/i,
        /\b(show|view|see)\s+(my\s+)?(money|account|bank)/i,
        /what\s+did\s+i\s+spend/i
      ],
      confidence: 0.8
    },
    {
      intent: 'get_tax_relief_info',
      patterns: [
        /\b(relief|deduct|exempt|allowance)\b/i,
        /\b(can\s+i\s+claim|what\s+deductions?)\b/i,
        /\bsection\s+\d+\b/i,
        /\b(nhf|nhis|pension)\s+contribution/i
      ],
      confidence: 0.8
    },
    {
      intent: 'upload_receipt',
      patterns: [
        /\b(upload|send|submit)\s+(receipt|invoice|document)/i,
        /\breceipt\b.*\b(upload|send|here)/i,
        /\binvoice\b.*\b(upload|send|here)/i
      ],
      confidence: 0.8
    },
    {
      intent: 'categorize_expense',
      patterns: [
        /\b(categorize|classify|category)\b/i,
        /\bis\s+this\s+(business|personal|deductible)\b/i,
        /\bwhat\s+type\s+of\s+expense\b/i
      ],
      confidence: 0.75
    },
    {
      intent: 'set_reminder',
      patterns: [
        /\b(remind|reminder|deadline|due\s+date)\b/i,
        /\bwhen\s+(is|should)\s+(my|the)\s+(tax|vat|filing)/i
      ],
      confidence: 0.75
    },
    {
      intent: 'connect_bank',
      patterns: [
        /\b(connect|link|add)\s+(my\s+)?(bank|account)/i,
        /\b(gtbank|zenith|access|uba|first\s+bank|sterling|fcmb)\b/i
      ],
      confidence: 0.75
    },
    {
      intent: 'verify_identity',
      patterns: [
        /\b(verify|validate|check)\s+(my\s+)?(nin|tin|cac|bvn)/i,
        /\bmy\s+(nin|tin|cac)\s+is\b/i,
        /\b(nin|tin|cac)\s*[:\s]+\d+/i
      ],
      confidence: 0.8
    }
  ];

  for (const { intent, patterns: regexes, confidence } of patterns) {
    for (const regex of regexes) {
      if (regex.test(lower)) {
        const extractedEntities = extractEntities(message, intent);
        return {
          name: intent,
          confidence,
          entities: extractedEntities,
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
function extractEntities(message: string, intent: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {};
  const lower = message.toLowerCase();

  // Extract amounts (handle Nigerian formats)
  const amountMatch = message.match(/[₦n]?\s?(\d[\d,]*(?:\.\d{2})?)/i);
  if (amountMatch) {
    entities.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  // Extract second amount for expenses (freelance X expenses Y)
  const expenseMatch = message.match(/expenses?\s+[₦n]?(\d[\d,]*)/i);
  if (expenseMatch) {
    entities.expenses = parseFloat(expenseMatch[1].replace(/,/g, ''));
  }

  // Extract period references
  if (/last\s+month/i.test(lower)) entities.period = 'last_month';
  else if (/this\s+month/i.test(lower)) entities.period = 'current_month';
  else if (/last\s+week/i.test(lower)) entities.period = 'last_week';
  else if (/this\s+year/i.test(lower)) entities.period = 'current_year';
  else if (/last\s+year/i.test(lower)) entities.period = 'last_year';
  
  // Extract specific months
  const monthMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  if (monthMatch) {
    entities.period = monthMatch[1];
  }

  // Extract tax types
  if (/\bvat\b/i.test(lower)) entities.tax_type = 'vat';
  else if (/\bincome\s+tax\b/i.test(lower)) entities.tax_type = 'income';
  else if (/\bpension\b/i.test(lower)) entities.tax_type = 'pension';
  else if (/\bsalary\b/i.test(lower)) entities.tax_type = 'salary';
  else if (/\bfreelance\b/i.test(lower)) entities.tax_type = 'freelance';
  else if (/\bpaye\b/i.test(lower)) entities.tax_type = 'paye';

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

  const cacMatch = message.match(/\b(?:CAC|RC)[:\s]*(\d+)/i);
  if (cacMatch) {
    entities.id_type = 'cac';
    entities.id_value = cacMatch[1];
  }

  // Extract description after amount
  const descMatch = message.match(/\d[\d,]*\s+(.+)$/i);
  if (descMatch && intent === 'get_tax_calculation') {
    entities.description = descMatch[1].trim();
  }

  // Extract relief types
  const reliefTypes = ['pension', 'nhf', 'nhis', 'housing', 'children', 'medical', 'insurance', 'rent'];
  for (const relief of reliefTypes) {
    if (lower.includes(relief)) {
      entities.relief_type = relief;
      break;
    }
  }

  // Extract bank names
  const bankNames = ['gtbank', 'zenith', 'access', 'uba', 'first bank', 'sterling', 'fcmb', 'fidelity', 'union', 'stanbic'];
  for (const bank of bankNames) {
    if (lower.includes(bank)) {
      entities.bank_name = bank;
      break;
    }
  }

  return entities;
}

// Artificial transaction detection (Section 191 NTA 2025)
function detectArtificialTransaction(
  message: string,
  entities: Record<string, unknown>
): { isSuspicious: boolean; warning?: string; actReference?: string } | undefined {
  const lower = message.toLowerCase();

  // Check for personal items being claimed as business
  for (const { pattern, item } of PERSONAL_ITEM_PATTERNS) {
    if (pattern.test(lower)) {
      // Check if context suggests business claim
      if (/\b(business|deduct|claim|expense|write[\s-]?off)\b/i.test(lower)) {
        return {
          isSuspicious: true,
          warning: `⚠️ SECTION 191 ALERT: "${item}" appears to be a personal expense being claimed as business deductible. This may constitute an artificial arrangement to avoid tax.`,
          actReference: 'Section 191 NTA 2025 - Anti-Avoidance'
        };
      }
    }
  }

  // Check if categorization intent with suspicious items
  if (entities.category === 'business' || entities.category === 'deductible') {
    for (const { pattern, item } of PERSONAL_ITEM_PATTERNS) {
      if (pattern.test(lower)) {
        return {
          isSuspicious: true,
          warning: `⚠️ SECTION 191 ALERT: "${item}" appears to be a personal expense being claimed as business deductible.`,
          actReference: 'Section 191 NTA 2025 - Anti-Avoidance'
        };
      }
    }
  }

  return undefined;
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
      const result = detectArtificialTransaction(itemDescription, { category });
      return new Response(
        JSON.stringify(result || { isSuspicious: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    
    // Use AI if available, otherwise fallback
    if (ANTHROPIC_API_KEY) {
      try {
        // Build context from conversation history
        const contextString = context.length > 0
          ? `Recent conversation:\n${context.map((c: { role: string; content: string }) => `${c.role}: ${c.content}`).join('\n')}\n\n`
          : '';

        const systemPrompt = `You are an NLU intent classifier for PRISM, a Nigerian tax assistant.

${INTENT_DEFINITIONS}

Analyze the user's message and return a JSON object with:
- name: the intent name (one of the 10 listed above)
- confidence: a number between 0 and 1 indicating how confident you are
- entities: any extracted entities as key-value pairs (amounts as numbers, periods as strings)
- reasoning: brief explanation of why you chose this intent

Extract Nigerian-specific entities:
- Amounts: Parse ₦ or N prefix, commas (e.g., "50,000" → 50000)
- Periods: "last month", "December", "Q4 2024"
- Tax types: VAT, PAYE, CIT, income tax, pension
- ID numbers: TIN (10+ digits), NIN (11 digits), CAC/RC numbers

Be precise. If the message is a greeting or unclear, use "general_query".
Consider the conversation context when available.

Return ONLY valid JSON, no markdown or explanation.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 8000,
            system: systemPrompt,
            messages: [
              { role: 'user', content: `${contextString}Current message: "${message}"` }
            ]
          })
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.error('Anthropic Claude rate limited');
          } else if (response.status === 402) {
            console.error('Anthropic Claude payment required');
          } else {
            console.error('Anthropic Claude error:', response.status);
          }
          throw new Error('Anthropic Claude unavailable');
        }

        const aiData = await response.json();
        const content = aiData.content?.[0]?.text;

        if (content) {
          // Parse JSON response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate intent name
            const validIntents = [
              'get_transaction_summary', 'get_tax_relief_info', 'upload_receipt',
              'categorize_expense', 'get_tax_calculation', 'set_reminder',
              'connect_bank', 'verify_identity', 'onboarding', 'general_query'
            ];
            const intentName = validIntents.includes(parsed.name) ? parsed.name : 'general_query';
            
            // Also check for artificial transaction if relevant
            const artificialCheck = detectArtificialTransaction(message, parsed.entities || {});

            return new Response(
              JSON.stringify({
                intent: {
                  name: intentName,
                  confidence: Math.min(1, Math.max(0, parsed.confidence || 0.8)),
                  entities: parsed.entities || {},
                  reasoning: parsed.reasoning
                },
                source: 'ai',
                model: 'claude-haiku-4-5-20251001',
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
    const artificialCheck = detectArtificialTransaction(message, fallbackResult.entities);

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
