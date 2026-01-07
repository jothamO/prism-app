import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check - require valid JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[document-ocr] Request from user: ${data.user.id}`);

    const { image, documentType } = await req.json();
    
    if (!image) {
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect image MIME type from base64 header
    let mimeType = 'image/jpeg';
    if (image.startsWith('/9j/')) mimeType = 'image/jpeg';
    else if (image.startsWith('iVBORw')) mimeType = 'image/png';
    else if (image.startsWith('UklGR')) mimeType = 'image/webp';
    else if (image.startsWith('R0lGOD')) mimeType = 'image/gif';

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Processing document type: ${documentType}, MIME: ${mimeType}`);

    console.log(`Processing document type: ${documentType}`);

    // Different prompts based on document type
    const prompts: Record<string, string> = {
      bank_statement: `Analyze this bank statement image and extract the following information in JSON format:
{
  "data": {
    "documentType": "bank_statement",
    "bank": "bank name",
    "accountNumber": "last 4 digits masked as ****XXXX",
    "accountName": "account holder name",
    "period": "statement period range",
    "openingBalance": 0,
    "closingBalance": 0,
    "transactions": [{"date": "YYYY-MM-DD", "description": "transaction description", "credit": 0, "debit": 0}]
  },
  "confidence": {
    "bank": 0.95,
    "accountNumber": 0.90,
    "accountName": 0.85,
    "period": 0.80,
    "openingBalance": 0.75,
    "closingBalance": 0.75,
    "transactions": 0.70,
    "overall": 0.80
  }
}

Confidence scores should be 0.0-1.0 based on readability:
- 0.9-1.0: Clearly readable, high certainty
- 0.7-0.89: Readable but some uncertainty
- 0.5-0.69: Partially readable, low certainty
- 0.0-0.49: Guessed or unreadable

For Nigerian bank statements, handle NGN/₦ amounts. Use null for unreadable fields.`,

      invoice: `Analyze this invoice/receipt image and extract the following information in JSON format:
{
  "data": {
    "documentType": "invoice",
    "vendor": "vendor/seller name",
    "invoiceNumber": "invoice or receipt number",
    "date": "YYYY-MM-DD",
    "items": [{"description": "item description", "qty": 1, "unitPrice": 0, "vatRate": 0.075}],
    "subtotal": 0,
    "vatAmount": 0,
    "total": 0
  },
  "confidence": {
    "vendor": 0.95,
    "invoiceNumber": 0.90,
    "date": 0.85,
    "items": 0.80,
    "subtotal": 0.85,
    "vatAmount": 0.80,
    "total": 0.90,
    "overall": 0.85
  }
}

Confidence scores should be 0.0-1.0 based on readability:
- 0.9-1.0: Clearly readable, high certainty
- 0.7-0.89: Readable but some uncertainty
- 0.5-0.69: Partially readable, low certainty
- 0.0-0.49: Guessed or unreadable

For Nigerian invoices, handle NGN/₦ amounts. Standard VAT rate is 7.5% (0.075). Use null for unreadable fields.`,

      tax_document: `Analyze this tax document image and extract the following information in JSON format:
{
  "data": {
    "documentType": "tax_document",
    "tin": "tax identification number",
    "taxpayerName": "taxpayer or company name",
    "registrationDate": "YYYY-MM-DD",
    "status": "Active or Inactive",
    "validThrough": "YYYY-MM-DD"
  },
  "confidence": {
    "tin": 0.95,
    "taxpayerName": 0.90,
    "registrationDate": 0.85,
    "status": 0.80,
    "validThrough": 0.75,
    "overall": 0.85
  }
}

Confidence scores should be 0.0-1.0 based on readability:
- 0.9-1.0: Clearly readable, high certainty
- 0.7-0.89: Readable but some uncertainty
- 0.5-0.69: Partially readable, low certainty
- 0.0-0.49: Guessed or unreadable

This is a Nigerian tax document (FIRS). Use null for unreadable fields.`
    };

    const prompt = prompts[documentType] || prompts.invoice;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${prompt}\n\nReturn ONLY valid JSON, no markdown formatting or explanation.`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${image}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required - add credits to your workspace' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content returned from AI');
    }

    console.log('AI Response:', content);

    // Parse JSON from response - handle markdown code blocks
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const extractedData = JSON.parse(jsonStr.trim());

    console.log('Extracted data:', JSON.stringify(extractedData));

    // Handle both new format (with data/confidence) and legacy format
    const responseData = extractedData.data ? extractedData.data : extractedData;
    const confidenceData = extractedData.confidence || null;

    return new Response(
      JSON.stringify({ success: true, data: responseData, confidence: confidenceData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'OCR processing failed';
    console.error('Document OCR error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
