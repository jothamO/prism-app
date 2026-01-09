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
    provisionType: string; // Will be validated before insert
    appliesTo: string[];
    taxImpact: 'increases_liability' | 'decreases_liability' | 'neutral' | 'procedural';
    plainLanguageSummary: string;
}

// Valid provision types in database
const VALID_PROVISION_TYPES = ['definition', 'obligation', 'exemption', 'rate', 'penalty', 'procedure', 'deadline', 'relief', 'power', 'general'] as const;

// Valid rule types in database
const VALID_RULE_TYPES = [
    'tax_rate', 'levy', 'threshold', 'relief', 'deadline', 'exemption',
    'filing_deadline', 'payment_deadline', 'rate_application', 'threshold_check',
    'exemption_eligibility', 'penalty_calculation', 'documentation_requirement',
    'registration_requirement', 'reporting_requirement'
] as const;

interface ComplianceRule {
    ruleName: string;
    ruleType: string; // Will be validated before insert
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
${extractedText.slice(0, 30000)}

Extract each provision as a JSON object. For each provision identify:
1. Section number (e.g., "Section 2.1", "Article 4(a)")
2. Title or heading
3. The exact provision text
4. Type: MUST be exactly one of: 'definition', 'obligation', 'exemption', 'rate', 'penalty', 'procedure', 'deadline', 'relief', 'power', 'general'
   - definition: Defines a term or concept
   - obligation: A requirement or duty
   - exemption: An exclusion from tax/rule
   - rate: A specific rate, amount, or fee structure
   - penalty: Consequences for non-compliance
   - procedure: Steps or processes to follow
   - deadline: Time limits or due dates
   - relief: Tax relief or reduction
   - power: Authority granted to an entity
   - general: Other provisions that don't fit above
5. Who it applies to: ['individuals', 'companies', 'smes', 'non-residents', 'banks', 'all']
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

        const provisionsResult = await callClaudeJSON<ExtractedProvision[]>(
            'You are an expert Nigerian tax lawyer. Extract provisions accurately.',
            extractionPrompt,
            { model: CLAUDE_MODELS.SONNET, maxTokens: 8000 }
        );
        const provisions = Array.isArray(provisionsResult) ? provisionsResult : [];

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

CRITICAL: ruleType MUST be exactly one of these values:
- tax_rate: For fee amounts, rates, percentages
- levy: For charges/levies applied
- threshold: For limits, caps, minimum/maximum values
- relief: For reductions or waivers
- deadline: For implementation dates
- exemption: For exclusions from fees/rules
- filing_deadline: For filing-related deadlines
- payment_deadline: For payment due dates
- rate_application: For how rates are applied
- threshold_check: For conditional threshold logic
- exemption_eligibility: For exemption conditions
- penalty_calculation: For penalty formulas
- documentation_requirement: For required documents
- registration_requirement: For registration obligations
- reporting_requirement: For reporting obligations

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

        const rulesResult = await callClaudeJSON<ComplianceRule[]>(
            'You are a tax rules engineer. Create machine-readable rules.',
            rulesPrompt,
            { model: CLAUDE_MODELS.SONNET, maxTokens: 8000 }
        );
        const rules = Array.isArray(rulesResult) ? rulesResult : [];

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
            { model: CLAUDE_MODELS.HAIKU, maxTokens: 2000 }
        ) || {};

        // Step 4: Save to database
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Fetch document's effective_date to pass to rules
        const { data: docData } = await supabase
            .from('legal_documents')
            .select('effective_date')
            .eq('id', documentId)
            .single();
        
        const documentEffectiveDate = docData?.effective_date || null;
        console.log(`[process-compliance-document] Document effective date: ${documentEffectiveDate}`);

        // Update legal document with summary info and processing status
        await supabase
            .from('legal_documents')
            .update({
                summary: classification.summary,
                key_provisions: classification.keyProvisions,
                affected_taxpayers: classification.affectedTaxpayers,
                tax_types: classification.taxTypes,
                needs_human_review: classification.needsReview ?? true,
                review_notes: classification.reviewReasons?.join('; '),
                status: 'pending', // Processing complete, ready for review
                updated_at: new Date().toISOString(),
                metadata: {
                    processing_completed_at: new Date().toISOString(),
                    provisions_count: provisions.length,
                    rules_count: rules.length,
                },
            })
            .eq('id', documentId);

        // Save provisions with validated provision_type
        for (const provision of provisions) {
            // Validate provision_type, default to 'general' if invalid
            const provisionType = VALID_PROVISION_TYPES.includes(provision.provisionType as typeof VALID_PROVISION_TYPES[number])
                ? provision.provisionType
                : 'general';

            const { error: provisionError } = await supabase.from('legal_provisions').insert({
                document_id: documentId,
                section_number: provision.sectionNumber,
                title: provision.title,
                content: provision.provisionText,
                provision_type: provisionType, // Use validated type
                affected_entities: provision.appliesTo,
                tax_implications: provision.taxImpact,
                ai_interpretation: provision.plainLanguageSummary,
            });
            if (provisionError) {
                console.error('[process-compliance-document] Provision insert error:', provisionError);
            }
        }

        // Save rules with validated rule_type
        for (const rule of rules) {
            // Validate rule_type, default to 'tax_rate' if invalid
            const ruleType = VALID_RULE_TYPES.includes(rule.ruleType as typeof VALID_RULE_TYPES[number])
                ? rule.ruleType
                : 'tax_rate';

            const { error: ruleError } = await supabase.from('compliance_rules').insert({
                document_id: documentId,
                rule_name: rule.ruleName,
                rule_type: ruleType, // Use validated type
                conditions: rule.conditions,
                actions: rule.outcome,
                effective_from: documentEffectiveDate, // Set from document's effective_date
                parameters: {
                    appliesToTransactions: rule.appliesToTransactions,
                    appliesToFiling: rule.appliesToFiling,
                },
                is_active: false, // Activate after human review
            });
            if (ruleError) {
                console.error('[process-compliance-document] Rule insert error:', ruleError);
            }
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
        
        // Try to update document status to failed
        try {
            const { documentId } = await req.clone().json();
            if (documentId) {
                const supabase = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                );
                await supabase.from('legal_documents').update({
                    status: 'processing_failed',
                    metadata: {
                        processing_error: errorMessage,
                        processing_failed_at: new Date().toISOString(),
                    },
                }).eq('id', documentId);
            }
        } catch (updateError) {
            console.error('[process-compliance-document] Failed to update status:', updateError);
        }
        
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
