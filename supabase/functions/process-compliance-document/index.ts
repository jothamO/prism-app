import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { callClaudeJSON, CLAUDE_MODELS } from '../_shared/claude-client.ts';

// ============================================
// COMPLIANCE DOCUMENT PROCESSING
// Extracts provisions and generates rules from legal documents
// ============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
    documentId: string;
    extractedText: string;
    documentType: string;
    title: string;
}

interface ExtractedProvision {
    sectionNumber: string;
    title: string;
    provisionText: string;
    provisionType: 'definition' | 'rate' | 'exemption' | 'penalty' | 'procedure' | 'threshold';
    appliesTo: string[];
    taxImpact: 'increases_liability' | 'decreases_liability' | 'neutral' | 'procedural';
    plainLanguageSummary: string;
}

interface ComplianceRule {
    ruleName: string;
    ruleType: 'tax_rate' | 'threshold' | 'exemption' | 'filing_deadline' | 'penalty';
    conditions: Record<string, unknown>;
    outcome: Record<string, unknown>;
    appliesToTransactions: boolean;
    appliesToFiling: boolean;
}

interface ProcessingResult {
    summary: string;
    keyProvisions: string[];
    affectedTaxpayers: string[];
    taxTypes: string[];
    provisions: ExtractedProvision[];
    rules: ComplianceRule[];
    needsReview: boolean;
    reviewReasons: string[];
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { documentId, extractedText, documentType, title }: ProcessRequest = await req.json();

        if (!documentId || !extractedText) {
            return new Response(
                JSON.stringify({ error: 'documentId and extractedText required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[process-compliance-document] Processing: ${title} (${documentType})`);

        // Step 1: Extract provisions with Claude
        const extractionPrompt = `You are a Nigerian tax law expert. Analyze this legal document and extract all provisions.

DOCUMENT TYPE: ${documentType}
TITLE: ${title}

DOCUMENT TEXT:
${extractedText.slice(0, 15000)}

Extract each provision as a JSON object. For each provision identify:
1. Section number (e.g., "Section 2.1", "Article 4(a)")
2. Title or heading
3. The exact provision text
4. Type: 'definition', 'rate', 'exemption', 'penalty', 'procedure', or 'threshold'
5. Who it applies to: ['individuals', 'companies', 'smes', 'non-residents', 'all']
6. Tax impact: 'increases_liability', 'decreases_liability', 'neutral', 'procedural'
7. Plain language summary

Return ONLY valid JSON array:
[
  {
    "sectionNumber": "Section 2.1",
    "title": "Tax Rate",
    "provisionText": "exact text...",
    "provisionType": "rate",
    "appliesTo": ["all"],
    "taxImpact": "increases_liability",
    "plainLanguageSummary": "Simple explanation..."
  }
]`;

        const provisions = await callClaudeJSON<ExtractedProvision[]>(
            'You are an expert Nigerian tax lawyer. Extract provisions accurately.',
            extractionPrompt,
            { model: CLAUDE_MODELS.SONNET, maxTokens: 4000 }
        ) || [];

        console.log(`[process-compliance-document] Extracted ${provisions.length} provisions`);

        // Step 2: Generate compliance rules from provisions
        const rulesPrompt = `Based on these extracted provisions, generate machine-actionable compliance rules.

PROVISIONS:
${JSON.stringify(provisions.slice(0, 10), null, 2)}

For each key provision, create a rule that PRISM can use to:
- Calculate taxes correctly
- Determine if exemptions apply
- Check filing deadlines
- Apply penalties

Return ONLY valid JSON array:
[
  {
    "ruleName": "EMTL_RATE_2026",
    "ruleType": "tax_rate",
    "conditions": {"amount": {">=": 10000}, "type": "electronic_transfer"},
    "outcome": {"charge": 50, "message": "EMTL of ₦50 applies"},
    "appliesToTransactions": true,
    "appliesToFiling": false
  }
]`;

        const rules = await callClaudeJSON<ComplianceRule[]>(
            'You are a tax rules engineer. Create machine-readable rules.',
            rulesPrompt,
            { model: CLAUDE_MODELS.SONNET, maxTokens: 2000 }
        ) || [];

        console.log(`[process-compliance-document] Generated ${rules.length} rules`);

        // Step 3: Generate summary and classification
        const summaryPrompt = `Summarize this Nigerian tax document for administrators.

TITLE: ${title}
TYPE: ${documentType}
PROVISIONS EXTRACTED: ${provisions.length}

KEY PROVISIONS:
${provisions.slice(0, 5).map(p => `- ${p.sectionNumber}: ${p.plainLanguageSummary}`).join('\n')}

Provide:
1. A 2-3 sentence summary
2. List of key provisions (just titles)
3. Who is affected: ['individuals', 'companies', 'smes', 'all']
4. Tax types involved: ['pit', 'cit', 'vat', 'cgt', 'emtl', 'wht', 'stamp_duty']
5. Whether human review is needed (true if complex rules or conflicts detected)
6. If review needed, list reasons

Return ONLY valid JSON:
{
  "summary": "...",
  "keyProvisions": ["..."],
  "affectedTaxpayers": ["..."],
  "taxTypes": ["..."],
  "needsReview": true,
  "reviewReasons": ["Complex exemptions detected", "May conflict with existing rules"]
}`;

        const classification = await callClaudeJSON<Partial<ProcessingResult>>(
            'You are a tax document classifier.',
            summaryPrompt,
            { model: CLAUDE_MODELS.HAIKU, maxTokens: 1000 }
        ) || {};

        // Step 4: Save to database
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Update legal document with summary info
        await supabase
            .from('legal_documents')
            .update({
                summary: classification.summary,
                key_provisions: classification.keyProvisions,
                affected_taxpayers: classification.affectedTaxpayers,
                tax_types: classification.taxTypes,
                review_status: classification.needsReview ? 'pending' : 'auto_approved',
                review_notes: classification.reviewReasons?.join('; '),
                updated_at: new Date().toISOString(),
            })
            .eq('id', documentId);

        // Save provisions
        for (const provision of provisions) {
            await supabase.from('legal_provisions').insert({
                document_id: documentId,
                section_number: provision.sectionNumber,
                title: provision.title,
                provision_text: provision.provisionText,
                provision_type: provision.provisionType,
                applies_to: provision.appliesTo,
                tax_impact: provision.taxImpact,
                plain_language_summary: provision.plainLanguageSummary,
            });
        }

        // Save rules
        for (const rule of rules) {
            await supabase.from('compliance_rules').insert({
                rule_name: rule.ruleName,
                rule_type: rule.ruleType,
                conditions: rule.conditions,
                outcome: rule.outcome,
                applies_to_transactions: rule.appliesToTransactions,
                applies_to_filing: rule.appliesToFiling,
                validation_status: 'pending',
                active: false, // Activate after human review
            });
        }

        console.log(`[process-compliance-document] Saved to database`);

        const result: ProcessingResult = {
            summary: classification.summary || 'Processing complete',
            keyProvisions: classification.keyProvisions || [],
            affectedTaxpayers: classification.affectedTaxpayers || [],
            taxTypes: classification.taxTypes || [],
            provisions,
            rules,
            needsReview: classification.needsReview ?? true,
            reviewReasons: classification.reviewReasons || [],
        };

        return new Response(
            JSON.stringify({ success: true, ...result }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('[process-compliance-document] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
