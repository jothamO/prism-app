import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { callClaudeJSON, CLAUDE_MODELS } from '../_shared/claude-client.ts';
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";

// ============================================
// COMPLIANCE DOCUMENT PROCESSING
// Extracts provisions and generates rules from legal documents
// ============================================


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

interface PRISMImpactItem {
    category: 'code_changes' | 'database_updates' | 'user_notification' | 'tax_calendar' | 'education_center' | 'no_action';
    description: string;
    priority: 'high' | 'medium' | 'low';
    completed?: boolean;
}

interface PRISMImpactAnalysis {
    summary: string;
    prism_changes_required: PRISMImpactItem[];
    tax_calendar_updates: { deadline: string; description: string; created?: boolean }[];
    education_center_updates: { topic: string; suggested: boolean; created?: boolean }[];
    user_notifications: { required: boolean; message: string };
    ai_confidence: number;
    ai_generated_at: string;
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
    prismImpact?: PRISMImpactAnalysis;
    criticality?: string;
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

        // Step 3: Generate summary, classification, and extract dates from text
        const summaryPrompt = `Summarize this Nigerian tax document for administrators.

TITLE: ${title}
TYPE: ${documentType}
PROVISIONS EXTRACTED: ${provisions.length}

KEY PROVISIONS:
${provisions.slice(0, 5).map(p => `- ${p.sectionNumber}: ${p.plainLanguageSummary}`).join('\n')}

DOCUMENT TEXT (for date and metadata extraction):
${extractedText.slice(0, 5000)}

Provide:
1. A 2-3 sentence summary
2. List of key provisions (just titles)
3. Who is affected: ['individuals', 'companies', 'smes', 'all']
4. Tax types involved: ['pit', 'cit', 'vat', 'cgt', 'emtl', 'wht', 'stamp_duty']
5. Whether human review is needed (true if complex rules or conflicts detected)
6. If review needed, list reasons
7. IMPORTANT: Extract dates and law metadata:
   - effectiveDateFromText: When the law takes effect (e.g., "effective from 1st March, 2025")
   - effectiveToFromText: When the law expires or was superseded (null if still active)
   - publicationDateFromText: When document was published/issued
   - lawReference: Official citation (e.g., "PITA 2011", "Finance Act 2019", "Nigeria Tax Act 2025")
   - supersedes: Name of law this replaces (e.g., "PITA 2004") if mentioned
   - taxRegime: Based on effective date - "pre_2026" if before Jan 1, 2026, or "2026_act" if on/after

Return ONLY valid JSON:
{
  "summary": "...",
  "keyProvisions": ["..."],
  "affectedTaxpayers": ["..."],
  "taxTypes": ["..."],
  "needsReview": true,
  "reviewReasons": ["Complex exemptions detected", "May conflict with existing rules"],
  "effectiveDateFromText": "2011-06-01",
  "effectiveToFromText": "2025-12-31",
  "publicationDateFromText": "2011-05-20",
  "lawReference": "PITA 2011",
  "supersedes": "PITA 2004",
  "taxRegime": "pre_2026",
  "dateExtractionConfidence": "high"
}

For dates:
- Return null if no date found or still active
- Use ISO format: YYYY-MM-DD
- dateExtractionConfidence: "high" (explicit date), "medium" (inferred), "low" (uncertain)`;

        const classification = await callClaudeJSON<Partial<ProcessingResult> & {
            effectiveDateFromText?: string | null;
            effectiveToFromText?: string | null;
            publicationDateFromText?: string | null;
            lawReference?: string | null;
            supersedes?: string | null;
            taxRegime?: 'pre_2026' | '2026_act' | null;
            dateExtractionConfidence?: string;

        }>(
            'You are a tax document classifier with expertise in date extraction.',
            summaryPrompt,
            { model: CLAUDE_MODELS.SONNET, maxTokens: 2000 }
        ) || {};

        // Step 4: Save to database
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Clean up existing provisions and rules before inserting new ones
        // This makes the function idempotent - safe to call multiple times
        console.log(`[process-compliance-document] Cleaning up existing provisions/rules for document ${documentId}`);

        const { error: deleteProvisionsError } = await supabase
            .from('legal_provisions')
            .delete()
            .eq('document_id', documentId);

        if (deleteProvisionsError) {
            console.error('[process-compliance-document] Error deleting provisions:', deleteProvisionsError);
        }

        const { error: deleteRulesError } = await supabase
            .from('compliance_rules')
            .delete()
            .eq('document_id', documentId);

        if (deleteRulesError) {
            console.error('[process-compliance-document] Error deleting rules:', deleteRulesError);
        }

        // Fetch document's effective_date to pass to rules
        const { data: docData } = await supabase
            .from('legal_documents')
            .select('effective_date')
            .eq('id', documentId)
            .single();

        const documentEffectiveDate = docData?.effective_date || null;
        console.log(`[process-compliance-document] Document effective date: ${documentEffectiveDate}`);

        // Check for date mismatch between admin-entered and AI-extracted
        const aiExtractedDate = classification.effectiveDateFromText;
        const adminEnteredDate = documentEffectiveDate ? documentEffectiveDate.split('T')[0] : null;

        let dateMismatchWarning = null;
        let needsReviewDueToDate = false;

        if (aiExtractedDate && adminEnteredDate && aiExtractedDate !== adminEnteredDate) {
            console.log(`[process-compliance-document] Date mismatch detected! Admin: ${adminEnteredDate}, AI: ${aiExtractedDate}`);
            dateMismatchWarning = {
                admin_entered: adminEnteredDate,
                ai_extracted: aiExtractedDate,
                confidence: classification.dateExtractionConfidence || 'medium',
                detected_at: new Date().toISOString(),
            };
            needsReviewDueToDate = true;
        }

        // Combine review reasons
        const reviewReasons = [...(classification.reviewReasons || [])];
        if (needsReviewDueToDate) {
            reviewReasons.push(`Date mismatch: You entered ${adminEnteredDate} but AI found ${aiExtractedDate} in document text`);
        }

        // Update legal document with summary info and processing status
        await supabase
            .from('legal_documents')
            .update({
                summary: classification.summary,
                key_provisions: classification.keyProvisions,
                affected_taxpayers: classification.affectedTaxpayers,
                tax_types: classification.taxTypes,
                needs_human_review: (classification.needsReview ?? true) || needsReviewDueToDate,
                review_notes: reviewReasons.join('; '),
                status: 'pending', // Processing complete, ready for review
                updated_at: new Date().toISOString(),
                metadata: {
                    processing_completed_at: new Date().toISOString(),
                    provisions_count: provisions.length,
                    rules_count: rules.length,
                    ai_extracted_effective_date: aiExtractedDate,
                    ai_extracted_publication_date: classification.publicationDateFromText,
                    date_extraction_confidence: classification.dateExtractionConfidence,
                    date_mismatch_warning: dateMismatchWarning,
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

        // Save rules with validated rule_type and duplicate detection
        let skippedDuplicates = 0;

        // Determine tax regime from effective date
        const effectiveYear = documentEffectiveDate ? new Date(documentEffectiveDate).getFullYear() : new Date().getFullYear();
        const inferredTaxRegime = classification.taxRegime || (effectiveYear <= 2025 ? 'pre_2026' : '2026_act');
        const lawReference = classification.lawReference || title;

        for (const rule of rules) {
            // Validate rule_type, default to 'tax_rate' if invalid
            const ruleType = VALID_RULE_TYPES.includes(rule.ruleType as typeof VALID_RULE_TYPES[number])
                ? rule.ruleType
                : 'tax_rate';

            // Check for duplicates before inserting
            try {
                const { data: dups } = await supabase.rpc('check_rule_duplicate', {
                    p_rule_name: rule.ruleName, p_rule_type: ruleType, p_description: null
                });
                if (dups?.find((d: any) => d.similarity_score >= 80)) {
                    console.log(`[process-compliance-document] Skipping duplicate: ${rule.ruleName}`);
                    skippedDuplicates++;
                    continue;
                }
            } catch { /* function may not exist */ }


            const { error: ruleError } = await supabase.from('compliance_rules').insert({
                document_id: documentId,
                rule_name: rule.ruleName,
                rule_type: ruleType,
                conditions: rule.conditions,
                actions: rule.outcome,
                effective_from: documentEffectiveDate,
                effective_to: classification.effectiveToFromText || null,  // V18: From AI extraction
                tax_regime: inferredTaxRegime,                              // V18: pre_2026 or 2026_act
                law_reference: `${lawReference}`,                           // V18: Official citation
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

        // V18: Handle supersession - if this document supersedes another, update old rules
        if (classification.supersedes) {
            const supersededLaw = classification.supersedes;
            console.log(`[process-compliance-document] Checking for superseded rules from: ${supersededLaw}`);

            // Find documents/rules that match the superseded law reference
            const { data: supersededDocs } = await supabase
                .from('legal_documents')
                .select('id, title')
                .ilike('title', `%${supersededLaw}%`);

            if (supersededDocs && supersededDocs.length > 0) {
                const supersededDocIds = supersededDocs.map(d => d.id);

                // Calculate the day before this document takes effect as the effective_to for old rules
                const dayBeforeEffective = documentEffectiveDate
                    ? new Date(new Date(documentEffectiveDate).getTime() - 86400000).toISOString().split('T')[0]
                    : '2025-12-31';

                // Update superseded rules
                const { error: updateError, count } = await supabase
                    .from('compliance_rules')
                    .update({
                        effective_to: dayBeforeEffective,
                        superseded_by: documentId,
                    })
                    .in('document_id', supersededDocIds)
                    .is('effective_to', null);  // Only update rules that don't already have an end date

                if (updateError) {
                    console.error('[process-compliance-document] Error updating superseded rules:', updateError);
                } else {
                    console.log(`[process-compliance-document] Marked ${count} rules as superseded by this document`);
                }
            }
        }

        console.log(`[process-compliance-document] Saved provisions and rules`);

        // Step 5: Generate PRISM Impact Analysis
        console.log(`[process-compliance-document] Generating PRISM impact analysis...`);


        const impactPrompt = `Analyze how this Nigerian tax regulation affects the PRISM tax assistant platform.

DOCUMENT: ${title}
TYPE: ${documentType}
PROVISIONS EXTRACTED: ${provisions.length}
RULES GENERATED: ${rules.length}

KEY PROVISIONS:
${provisions.slice(0, 5).map(p => `- ${p.sectionNumber}: ${p.plainLanguageSummary}`).join('\n')}

KEY RULES:
${rules.slice(0, 5).map(r => `- ${r.ruleName} (${r.ruleType})`).join('\n')}

Determine:
1. Criticality level (pick one):
   - 'breaking_change': Requires immediate PRISM code/database updates to function correctly
   - 'rate_update': Tax rates, fees, or amounts have changed
   - 'new_requirement': New compliance obligation for taxpayers
   - 'procedural_update': Process or procedure changes only
   - 'advisory': Informational only, no action needed

2. What changes are needed in PRISM:
   - code_changes: Updates to calculations, classifiers, edge functions
   - database_updates: New rules, rates, thresholds in database
   - user_notification: Should users be notified about this change?
   - tax_calendar: Are there new deadlines to add to tax calendar?
   - education_center: Should new educational articles be created?
   - no_action: No changes needed

Return ONLY valid JSON:
{
  "criticality": "rate_update",
  "summary": "Clear explanation of how this affects PRISM and its users...",
  "prism_changes_required": [
    {"category": "code_changes", "description": "Update VAT calculator to use new rate", "priority": "high"},
    {"category": "database_updates", "description": "Add new VAT rate rule effective from date", "priority": "high"}
  ],
  "tax_calendar_updates": [
    {"deadline": "2026-04-01", "description": "New VAT rate effective date"}
  ],
  "education_center_updates": [
    {"topic": "Understanding the new VAT changes", "suggested": true}
  ],
  "user_notifications": {
    "required": true,
    "message": "VAT rate has changed from X% to Y% effective date Z"
  },
  "ai_confidence": 0.85
}`;

        const impactResult = await callClaudeJSON<{
            criticality: string;
            summary: string;
            prism_changes_required: PRISMImpactItem[];
            tax_calendar_updates: { deadline: string; description: string }[];
            education_center_updates: { topic: string; suggested: boolean }[];
            user_notifications: { required: boolean; message: string };
            ai_confidence: number;
        }>(
            'You are a PRISM platform architect analyzing regulatory impact.',
            impactPrompt,
            { model: CLAUDE_MODELS.SONNET, maxTokens: 4000 }
        );

        const validCriticalities = ['breaking_change', 'rate_update', 'new_requirement', 'procedural_update', 'advisory'];
        const criticality = impactResult?.criticality && validCriticalities.includes(impactResult.criticality)
            ? impactResult.criticality
            : 'procedural_update';

        const prismImpactAnalysis: PRISMImpactAnalysis = {
            summary: impactResult?.summary || 'Impact analysis pending review',
            prism_changes_required: impactResult?.prism_changes_required || [],
            tax_calendar_updates: impactResult?.tax_calendar_updates || [],
            education_center_updates: impactResult?.education_center_updates || [],
            user_notifications: impactResult?.user_notifications || { required: false, message: '' },
            ai_confidence: impactResult?.ai_confidence || 0.5,
            ai_generated_at: new Date().toISOString(),
        };

        // Update document with PRISM impact analysis
        await supabase
            .from('legal_documents')
            .update({
                prism_impact_analysis: prismImpactAnalysis,
                criticality: criticality,
                impact_reviewed: false,
            })
            .eq('id', documentId);

        console.log(`[process-compliance-document] PRISM impact analysis saved, criticality: ${criticality}`);

        const result: ProcessingResult = {
            summary: classification.summary || 'Processing complete',
            keyProvisions: classification.keyProvisions || [],
            affectedTaxpayers: classification.affectedTaxpayers || [],
            taxTypes: classification.taxTypes || [],
            provisions,
            rules,
            needsReview: classification.needsReview ?? true,
            reviewReasons: classification.reviewReasons || [],
            prismImpact: prismImpactAnalysis,
            criticality,
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
