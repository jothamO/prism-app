import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

/**
 * Process Receipt Edge Function
 * 
 * Converts receipt images to Markdown format with:
 * - OCR extraction via Claude Vision
 * - SHA-256 hash for verification
 * - Storage in bank_transactions.receipt_markdown
 * 
 * NOTE: Original receipt images are NOT stored (privacy by design)
 */

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Authentication check
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

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user) {
            return new Response(
                JSON.stringify({ error: 'Invalid authentication token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[process-receipt] Request from user: ${authData.user.id}`);

        const { image, transactionId } = await req.json();

        if (!image) {
            return new Response(
                JSON.stringify({ error: 'No image provided' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Generate SHA-256 hash of original image for verification
        const encoder = new TextEncoder();
        const imageData = encoder.encode(image);
        const hashBuffer = await crypto.subtle.digest("SHA-256", imageData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sourceHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        console.log(`[process-receipt] Image hash: ${sourceHash.slice(0, 16)}...`);

        // Detect image MIME type
        let mimeType = 'image/jpeg';
        if (image.startsWith('/9j/')) mimeType = 'image/jpeg';
        else if (image.startsWith('iVBORw')) mimeType = 'image/png';
        else if (image.startsWith('UklGR')) mimeType = 'image/webp';
        else if (image.startsWith('R0lGOD')) mimeType = 'image/gif';

        const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
        if (!ANTHROPIC_API_KEY) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }

        // Prompt for receipt extraction to Markdown
        const prompt = `Analyze this receipt/invoice image and convert it to a structured Markdown format.

Extract and format as follows:

# Receipt Summary

**Vendor:** [vendor name]
**Date:** [YYYY-MM-DD]
**Receipt No:** [number if visible]

## Items

| Description | Qty | Unit Price | Total |
|-------------|-----|------------|-------|
| [item 1]    | 1   | ₦X,XXX     | ₦X,XXX |
| [item 2]    | 1   | ₦X,XXX     | ₦X,XXX |

## Totals

| | Amount |
|---------|--------|
| Subtotal | ₦X,XXX |
| VAT (7.5%) | ₦XXX |
| **Total** | **₦X,XXX** |

---
*Extracted by PRISM AI. Original document not stored.*

IMPORTANT:
- Use Nigerian Naira (₦) formatting
- Include VAT breakdown if visible (standard rate: 7.5%)
- If any field is unclear, mark as "[unclear]"
- Return ONLY the Markdown, no JSON or additional text

If the image is not a valid receipt, return:
# Not a Receipt
This image does not appear to be a receipt or invoice.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 4000,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mimeType,
                                    data: image,
                                },
                            },
                        ],
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[process-receipt] AI error:', response.status, errorText);

            if (response.status === 429) {
                return new Response(
                    JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
                    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            throw new Error(`Receipt processing failed: ${response.status}`);
        }

        const aiResult = await response.json();
        const markdown = aiResult.content?.[0]?.text?.trim();

        if (!markdown) {
            throw new Error('No content returned from AI');
        }

        console.log(`[process-receipt] Markdown generated (${markdown.length} chars)`);

        // Extract key data from markdown for structured response
        const vendorMatch = markdown.match(/\*\*Vendor:\*\*\s*(.+)/);
        const dateMatch = markdown.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
        const totalMatch = markdown.match(/\*\*Total\*\*.*?₦([\d,]+(?:\.\d{2})?)/);

        const extractedData = {
            vendor: vendorMatch?.[1]?.trim() || null,
            date: dateMatch?.[1] || null,
            total: totalMatch?.[1] ? parseFloat(totalMatch[1].replace(/,/g, '')) : null,
        };

        // If transactionId provided, update the transaction
        if (transactionId) {
            const { error: updateError } = await supabase
                .from('bank_transactions')
                .update({
                    receipt_markdown: markdown,
                    receipt_source_hash: sourceHash,
                })
                .eq('id', transactionId)
                .eq('user_id', authData.user.id); // Security: only update user's own transactions

            if (updateError) {
                console.error('[process-receipt] Update error:', updateError);
                // Don't fail the whole request, just log it
            } else {
                console.log(`[process-receipt] Updated transaction ${transactionId}`);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                markdown,
                sourceHash,
                extracted: extractedData,
                notice: 'Original receipt image was not stored for privacy protection.',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Receipt processing failed';
        console.error('[process-receipt] Error:', errorMessage);
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
