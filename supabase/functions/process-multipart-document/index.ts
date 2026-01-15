/**
 * Process Multi-Part Document Edge Function
 * Handles processing of documents split into multiple parts with deduplication
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaudeJSON } from "../_shared/claude-client.ts";

interface ProcessRequest {
    documentId: string;
    reprocessPartId?: string; // If set, only reprocess this specific part
}

interface ExtractedProvision {
    section_number: string;
    title: string;
    content: string;
    provision_type: string;
    applies_to: string[];
    key_terms: string[];
}

interface ExtractedRule {
    rule_code: string;
    rule_name: string;
    rule_type: string;
    description: string;
    conditions: Record<string, unknown>;
    parameters: Record<string, unknown>;
    actions: Record<string, unknown>;
}

const VALID_PROVISION_TYPES = [
    "definition",
    "rate",
    "threshold",
    "exemption",
    "relief",
    "penalty",
    "procedure",
    "deadline",
    "obligation",
    "other",
];

const VALID_RULE_TYPES = [
    "tax_rate",
    "tax_band",
    "threshold",
    "relief",
    "exemption",
    "penalty",
    "deadline",
    "filing_deadline",
    "vat_rate",
    "emtl",
    "procedure",
];

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { documentId, reprocessPartId }: ProcessRequest = await req.json();

        if (!documentId) {
            return jsonResponse({ error: "Missing documentId" }, 400);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log(`[process-multipart] Starting processing for document: ${documentId}`);

        // Fetch parent document
        const { data: parentDoc, error: docError } = await supabase
            .from("legal_documents")
            .select("*")
            .eq("id", documentId)
            .single();

        if (docError || !parentDoc) {
            throw new Error(`Document not found: ${documentId}`);
        }

        // Fetch all parts
        let partsQuery = supabase
            .from("document_parts")
            .select("*")
            .eq("parent_document_id", documentId)
            .order("part_number");

        if (reprocessPartId) {
            partsQuery = supabase
                .from("document_parts")
                .select("*")
                .eq("id", reprocessPartId);
        }

        const { data: parts, error: partsError } = await partsQuery;

        if (partsError || !parts || parts.length === 0) {
            throw new Error("No parts found for document");
        }

        console.log(`[process-multipart] Found ${parts.length} parts to process`);

        const allProvisions: (ExtractedProvision & { source_part_id: string; source_part_number: number })[] = [];
        const allRules: (ExtractedRule & { source_part_id: string })[] = [];

        // Process each part
        for (const part of parts) {
            if (!part.raw_text || part.raw_text.trim().length < 50) {
                console.log(`[process-multipart] Skipping part ${part.part_number}: no content`);
                continue;
            }

            console.log(`[process-multipart] Processing part ${part.part_number}: ${part.part_title}`);

            // Update part status
            await supabase
                .from("document_parts")
                .update({ status: "processing" })
                .eq("id", part.id);

            try {
                // Extract provisions from this part
                const provisionsSystemPrompt = `You are a legal document analyst specializing in Nigerian tax law. Extract legal provisions from document parts and return them as structured JSON.`;
                
                const provisionsUserMessage = `Analyze Part ${part.part_number} of "${parentDoc.title}" (titled: "${part.part_title || `Part ${part.part_number}`}").

Extract all significant legal provisions. For each provision, provide:
- section_number: The section/article number (e.g., "Section 5(1)(a)")
- title: A brief title for the provision
- content: The full text of the provision
- provision_type: One of [${VALID_PROVISION_TYPES.join(", ")}]
- applies_to: Array of who this applies to (e.g., ["individuals", "companies"])
- key_terms: Array of key legal/tax terms used

Return JSON array of provisions. If no provisions found, return empty array [].

Document text:
${part.raw_text.substring(0, 60000)}`;

                const provisions = await callClaudeJSON<ExtractedProvision[]>(provisionsSystemPrompt, provisionsUserMessage);

                if (Array.isArray(provisions)) {
                    for (const provision of provisions) {
                        // Validate provision type
                        if (!VALID_PROVISION_TYPES.includes(provision.provision_type)) {
                            provision.provision_type = "other";
                        }
                        allProvisions.push({
                            ...provision,
                            source_part_id: part.id,
                            source_part_number: part.part_number,
                        });
                    }
                }

                // Extract rules from this part
                const rulesSystemPrompt = `You are a legal document analyst specializing in Nigerian tax law. Extract machine-readable tax rules and return them as structured JSON.`;
                
                const rulesUserMessage = `Analyze Part ${part.part_number} of "${parentDoc.title}".
Extract machine-readable tax rules from this text.

For each rule, provide:
- rule_code: Unique code (e.g., "PIT_BAND_1", "VAT_RATE_STANDARD")
- rule_name: Human readable name
- rule_type: One of [${VALID_RULE_TYPES.join(", ")}]
- description: Brief description
- conditions: JSON object of when this rule applies
- parameters: JSON object of rule parameters (rates, thresholds, etc.)
- actions: JSON object of what happens when rule applies

Return JSON array of rules. If no rules found, return empty array [].

Document text:
${part.raw_text.substring(0, 60000)}`;

                const rules = await callClaudeJSON<ExtractedRule[]>(rulesSystemPrompt, rulesUserMessage);

                if (Array.isArray(rules)) {
                    for (const rule of rules) {
                        if (!VALID_RULE_TYPES.includes(rule.rule_type)) {
                            rule.rule_type = "procedure";
                        }
                        allRules.push({
                            ...rule,
                            source_part_id: part.id,
                        });
                    }
                }

                // Update part as processed
                await supabase
                    .from("document_parts")
                    .update({
                        status: "processed",
                        provisions_count: provisions?.length || 0,
                        rules_count: rules?.length || 0,
                        processed_at: new Date().toISOString(),
                    })
                    .eq("id", part.id);

                console.log(
                    `[process-multipart] Part ${part.part_number} complete: ${provisions?.length || 0} provisions, ${rules?.length || 0} rules`
                );
            } catch (partError) {
                console.error(`[process-multipart] Error processing part ${part.part_number}:`, partError);
                await supabase
                    .from("document_parts")
                    .update({ status: "failed", metadata: { error: String(partError) } })
                    .eq("id", part.id);
            }
        }

        console.log(`[process-multipart] Total extracted: ${allProvisions.length} provisions, ${allRules.length} rules`);

        // Deduplicate provisions
        const deduplicatedProvisions = deduplicateProvisions(allProvisions);
        console.log(`[process-multipart] After dedup: ${deduplicatedProvisions.length} provisions`);

        // Deduplicate rules
        const deduplicatedRules = deduplicateRules(allRules);
        console.log(`[process-multipart] After dedup: ${deduplicatedRules.length} rules`);

        // If reprocessing single part, we need to delete only that part's provisions/rules first
        if (reprocessPartId) {
            await supabase.from("legal_provisions").delete().eq("source_part_id", reprocessPartId);
            await supabase.from("compliance_rules").delete().eq("source_part_id", reprocessPartId);
        } else {
            // Delete all existing provisions and rules for this document
            await supabase.from("legal_provisions").delete().eq("document_id", documentId);
            await supabase.from("compliance_rules").delete().eq("document_id", documentId);
        }

        // Insert deduplicated provisions
        for (const provision of deduplicatedProvisions) {
            await supabase.from("legal_provisions").insert({
                document_id: documentId,
                source_part_id: provision.source_part_id,
                section_number: provision.section_number,
                title: provision.title,
                content: provision.content,
                provision_type: provision.provision_type,
                applies_to: provision.applies_to,
                key_terms: provision.key_terms,
            });
        }

        // Insert deduplicated rules
        for (const rule of deduplicatedRules) {
            await supabase.from("compliance_rules").insert({
                document_id: documentId,
                source_part_id: rule.source_part_id,
                rule_code: rule.rule_code,
                rule_name: rule.rule_name,
                rule_type: rule.rule_type,
                description: rule.description,
                conditions: rule.conditions,
                parameters: rule.parameters,
                actions: rule.actions,
                is_active: false, // New rules start inactive until reviewed
                effective_from: parentDoc.effective_date || new Date().toISOString(),
            });
        }

        // Generate consolidated summary
        const summarySystemPrompt = `You are a legal document analyst. Create professional summaries of legal documents suitable for tax professionals. Return JSON format.`;
        
        const summaryUserMessage = `Summarize this multi-part Nigerian legal document in 2-3 paragraphs.

Document: ${parentDoc.title}
Parts: ${parts.length}
Total Provisions: ${deduplicatedProvisions.length}
Total Rules: ${deduplicatedRules.length}

Key provisions extracted:
${deduplicatedProvisions
    .slice(0, 10)
    .map((p) => `- ${p.section_number}: ${p.title}`)
    .join("\n")}

Key rules extracted:
${deduplicatedRules
    .slice(0, 10)
    .map((r) => `- ${r.rule_code}: ${r.rule_name}`)
    .join("\n")}

Return JSON: {"summary": "..."}`;

        let summary = "";
        try {
            const summaryResult = await callClaudeJSON<{ summary: string }>(summarySystemPrompt, summaryUserMessage);
            summary = summaryResult?.summary || "";
        } catch (e) {
            console.error("[process-multipart] Summary generation failed:", e);
            summary = `Multi-part document with ${parts.length} parts containing ${deduplicatedProvisions.length} provisions and ${deduplicatedRules.length} rules.`;
        }

        // Update parent document
        await supabase
            .from("legal_documents")
            .update({
                status: "pending", // Ready for human review
                summary: summary,
                needs_human_review: true,
                metadata: {
                    ...((parentDoc.metadata as Record<string, unknown>) || {}),
                    processing_completed_at: new Date().toISOString(),
                    total_provisions: deduplicatedProvisions.length,
                    total_rules: deduplicatedRules.length,
                    parts_processed: parts.length,
                },
            })
            .eq("id", documentId);

        console.log(`[process-multipart] Document ${documentId} processing complete`);

        return jsonResponse({
            success: true,
            documentId,
            partsProcessed: parts.length,
            provisionsExtracted: deduplicatedProvisions.length,
            rulesExtracted: deduplicatedRules.length,
        });
    } catch (error) {
        console.error("[process-multipart] Error:", error);
        return jsonResponse({ error: String(error) }, 500);
    }
});

/**
 * Deduplicate provisions based on section number and content similarity
 */
function deduplicateProvisions(
    provisions: (ExtractedProvision & { source_part_id: string; source_part_number: number })[]
): (ExtractedProvision & { source_part_id: string; source_part_number: number })[] {
    const seen = new Map<string, (ExtractedProvision & { source_part_id: string; source_part_number: number })>();

    for (const provision of provisions) {
        const key = normalizeText(provision.section_number);

        if (!seen.has(key)) {
            seen.set(key, provision);
        } else {
            // Keep the one with more content
            const existing = seen.get(key)!;
            if (provision.content.length > existing.content.length) {
                seen.set(key, provision);
            }
        }
    }

    return Array.from(seen.values());
}

/**
 * Deduplicate rules based on rule_code
 */
function deduplicateRules(
    rules: (ExtractedRule & { source_part_id: string })[]
): (ExtractedRule & { source_part_id: string })[] {
    const seen = new Map<string, (ExtractedRule & { source_part_id: string })>();

    for (const rule of rules) {
        const key = normalizeText(rule.rule_code);

        if (!seen.has(key)) {
            seen.set(key, rule);
        } else {
            // Merge parameters if they differ
            const existing = seen.get(key)!;
            const mergedParams = { ...existing.parameters, ...rule.parameters };
            seen.set(key, { ...existing, parameters: mergedParams });
        }
    }

    return Array.from(seen.values());
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();
}
