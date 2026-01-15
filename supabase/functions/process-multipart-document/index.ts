/**
 * Process Multi-Part Document Edge Function
 * Handles processing of documents split into multiple parts with deduplication
 * Includes event emission for real-time processing status tracking
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaudeJSON } from "../_shared/claude-client.ts";

interface ProcessRequest {
    documentId: string;
    reprocessPartId?: string; // If set, only reprocess this specific part
    mode?: 'full' | 'resume'; // Processing mode: 'full' reprocesses all, 'resume' only pending parts
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

type EventType = 'started' | 'stage_started' | 'stage_completed' | 'completed' | 'failed' | 'retried' | 'warning';
type EventStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
type ProcessingStage = 'upload' | 'text_extraction' | 'ocr' | 'provision_extraction' | 'rules_extraction' | 'summary_generation' | 'prism_impact' | 'deduplication' | 'finalization';

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

// Rule categories for chunked extraction - prevents JSON truncation on large documents
const RULE_CATEGORIES = [
    { type: 'tax_rate', description: 'tax rates, percentages, and rate bands' },
    { type: 'threshold', description: 'monetary thresholds, limits, and brackets' },
    { type: 'exemption', description: 'exemptions, exclusions, and zero-rated items' },
    { type: 'deadline', description: 'filing deadlines, due dates, and time limits' },
    { type: 'penalty', description: 'penalties, interest rates, and fines' },
    { type: 'relief', description: 'allowances, reliefs, deductions, and credits' },
];

/**
 * Emit a processing event to the database for real-time tracking
 */
async function emitEvent(
    supabase: SupabaseClient,
    documentId: string,
    partId: string | null,
    eventType: EventType,
    stage: ProcessingStage | null,
    status: EventStatus,
    message: string,
    details: Record<string, unknown> = {}
): Promise<void> {
    try {
        await supabase.from("document_processing_events").insert({
            document_id: documentId,
            part_id: partId,
            event_type: eventType,
            stage,
            status,
            message,
            details: {
                ...details,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("[process-multipart] Failed to emit event:", error);
        // Don't throw - event emission failure shouldn't stop processing
    }
}

/**
 * Update document processing metadata
 */
async function updateDocumentProcessingStatus(
    supabase: SupabaseClient,
    documentId: string,
    updates: Record<string, unknown>
): Promise<void> {
    try {
        const { data: doc } = await supabase
            .from("legal_documents")
            .select("metadata")
            .eq("id", documentId)
            .single();

        const currentMetadata = (doc?.metadata as Record<string, unknown>) || {};
        
        await supabase
            .from("legal_documents")
            .update({
                metadata: { ...currentMetadata, ...updates },
            })
            .eq("id", documentId);
    } catch (error) {
        console.error("[process-multipart] Failed to update document status:", error);
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const startTime = Date.now();

    try {
        const { documentId, reprocessPartId, mode }: ProcessRequest = await req.json();

        if (!documentId) {
            return jsonResponse({ error: "Missing documentId" }, 400);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Determine processing mode for event tracking
        const processingMode = reprocessPartId ? 'single_part' : (mode || 'full');
        const modeLabel = processingMode === 'resume' 
            ? 'Resuming processing (pending parts only)'
            : processingMode === 'single_part' 
            ? 'Reprocessing single part'
            : 'Starting full document reprocess';

        console.log(`[process-multipart] ${modeLabel} for document: ${documentId}`);

        // Emit started event with processing mode
        await emitEvent(supabase, documentId, null, 'started', null, 'in_progress', 
            modeLabel,
            { 
                reprocessPartId,
                processing_mode: processingMode,
            }
        );

        // Update document processing metadata
        await updateDocumentProcessingStatus(supabase, documentId, {
            processing_started_at: new Date().toISOString(),
            current_processing_stage: 'text_extraction',
            processing_progress: 0,
        });

        // Fetch parent document
        const { data: parentDoc, error: docError } = await supabase
            .from("legal_documents")
            .select("*")
            .eq("id", documentId)
            .single();

        if (docError || !parentDoc) {
            await emitEvent(supabase, documentId, null, 'failed', null, 'failed', 
                `Document not found: ${documentId}`);
            throw new Error(`Document not found: ${documentId}`);
        }

        // Fetch parts based on processing mode
        let partsQuery;

        if (reprocessPartId) {
            // Single part reprocess
            partsQuery = supabase
                .from("document_parts")
                .select("*")
                .eq("id", reprocessPartId);
        } else if (mode === 'resume') {
            // RESUME MODE: Reset stuck parts (>15 min), then only fetch pending/failed
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            
            // Reset stuck 'processing' parts to 'failed' with timeout error
            const { data: stuckParts } = await supabase
                .from("document_parts")
                .update({ 
                    status: 'failed', 
                    metadata: { error: 'Processing timeout (>15 min)', timed_out_at: new Date().toISOString() } 
                })
                .eq("parent_document_id", documentId)
                .eq("status", "processing")
                .lt("updated_at", fifteenMinutesAgo)
                .select();
            
            if (stuckParts && stuckParts.length > 0) {
                console.log(`[process-multipart] Reset ${stuckParts.length} stuck parts to failed`);
                await emitEvent(supabase, documentId, null, 'warning', null, 'in_progress',
                    `Reset ${stuckParts.length} stuck part(s) due to timeout (>15 min)`,
                    { reset_parts: stuckParts.map(p => p.part_number) }
                );
            }
            
            // Fetch only pending or failed parts
            partsQuery = supabase
                .from("document_parts")
                .select("*")
                .eq("parent_document_id", documentId)
                .in("status", ["pending", "failed"])
                .order("part_number");
        } else {
            // FULL REPROCESS: Reset ALL parts to pending first
            await supabase
                .from("document_parts")
                .update({ status: 'pending', metadata: null })
                .eq("parent_document_id", documentId);
            
            partsQuery = supabase
                .from("document_parts")
                .select("*")
                .eq("parent_document_id", documentId)
                .order("part_number");
        }

        const { data: parts, error: partsError } = await partsQuery;

        // Handle resume mode with no pending parts gracefully
        if (mode === 'resume' && (!parts || parts.length === 0)) {
            await emitEvent(supabase, documentId, null, 'completed', null, 'completed', 
                'Resume complete - all parts already processed');
            
            await supabase
                .from("legal_documents")
                .update({ status: "pending" })
                .eq("id", documentId);
            
            return jsonResponse({ success: true, message: "All parts already processed" });
        }

        if (partsError || !parts || parts.length === 0) {
            await emitEvent(supabase, documentId, null, 'failed', null, 'failed', 
                'No parts found for document');
            throw new Error("No parts found for document");
        }

        const partsLogLabel = mode === 'resume' 
            ? `Resuming (${parts.length} pending/failed parts)`
            : reprocessPartId 
            ? 'Reprocessing single part'
            : `Full reprocess (${parts.length} parts)`;
        console.log(`[process-multipart] Mode: ${partsLogLabel}`);

        const allProvisions: (ExtractedProvision & { source_part_id: string; source_part_number: number })[] = [];
        const allRules: (ExtractedRule & { source_part_id: string })[] = [];

        // Helper function to check if abort has been requested
        async function checkAbortRequested(): Promise<boolean> {
            try {
                const { data } = await supabase
                    .from("legal_documents")
                    .select("metadata")
                    .eq("id", documentId)
                    .single();
                
                const metadata = data?.metadata as Record<string, unknown> | null;
                return metadata?.abort_requested === true;
            } catch {
                return false;
            }
        }

        // Process each part
        for (let i = 0; i < parts.length; i++) {
            // Check for abort request between parts
            const abortRequested = await checkAbortRequested();
            if (abortRequested) {
                console.log(`[process-multipart] Abort requested - stopping after ${i} parts`);
                
                // Clear abort flag and update status
                await updateDocumentProcessingStatus(supabase, documentId, {
                    abort_requested: false,
                    processing_stopped_at: new Date().toISOString(),
                });
                
                await emitEvent(supabase, documentId, null, 'warning', null, 'completed',
                    `Processing stopped by user after ${i} of ${parts.length} parts`,
                    { parts_completed: i, total_parts: parts.length, stopped_by: 'user_request' }
                );
                
                // Update document status to allow resume
                await supabase
                    .from("legal_documents")
                    .update({ status: "pending" })
                    .eq("id", documentId);
                
                return jsonResponse({
                    success: true,
                    stopped: true,
                    message: `Processing stopped after ${i} parts. You can resume later.`,
                    partsCompleted: i,
                    totalParts: parts.length,
                });
            }

            const part = parts[i];
            const progressPercent = Math.round(((i) / parts.length) * 80); // 0-80% for parts processing

            if (!part.raw_text || part.raw_text.trim().length < 50) {
                console.log(`[process-multipart] Skipping part ${part.part_number}: no content`);
                await emitEvent(supabase, documentId, part.id, 'warning', 'text_extraction', 'skipped',
                    `Skipping part ${part.part_number}: insufficient content`,
                    { part_number: part.part_number, content_length: part.raw_text?.length || 0 }
                );
                continue;
            }

            console.log(`[process-multipart] Processing part ${part.part_number}: ${part.part_title}`);

            // Emit part started event
            await emitEvent(supabase, documentId, part.id, 'stage_started', 'provision_extraction', 'in_progress',
                `Processing part ${part.part_number}: ${part.part_title || 'Untitled'}`,
                { part_number: part.part_number, part_title: part.part_title }
            );

            // Update progress
            await updateDocumentProcessingStatus(supabase, documentId, {
                current_processing_stage: `part_${part.part_number}_provisions`,
                processing_progress: progressPercent,
            });

            // Update part status
            await supabase
                .from("document_parts")
                .update({ status: "processing" })
                .eq("id", part.id);

            const partStartTime = Date.now();

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

                await emitEvent(supabase, documentId, part.id, 'stage_completed', 'provision_extraction', 'completed',
                    `Extracted ${provisions?.length || 0} provisions from part ${part.part_number}`,
                    { provisions_count: provisions?.length || 0, part_number: part.part_number }
                );

                // Update progress for rules extraction
                await updateDocumentProcessingStatus(supabase, documentId, {
                    current_processing_stage: `part_${part.part_number}_rules`,
                });

                await emitEvent(supabase, documentId, part.id, 'stage_started', 'rules_extraction', 'in_progress',
                    `Extracting rules from part ${part.part_number}`,
                    { part_number: part.part_number }
                );

                // Extract rules using chunked approach by category
                // This prevents JSON truncation on large documents like Part 4 (VAT)
                console.log(`[process-multipart] Part ${part.part_number}: Starting chunked rules extraction`);
                
                const partRules: ExtractedRule[] = [];
                
                for (const category of RULE_CATEGORIES) {
                    console.log(`[process-multipart] Part ${part.part_number}: Extracting ${category.type} rules...`);
                    
                    const categorySystemPrompt = `You are a legal document analyst specializing in Nigerian tax law. Extract ONLY ${category.description} and return them as a JSON array.`;
                    
                    const categoryUserMessage = `Analyze Part ${part.part_number} of "${parentDoc.title}".
Extract ONLY rules related to ${category.description}. Return maximum 15 rules for this category.

For each rule, provide:
- rule_code: Unique code (e.g., "PIT_BAND_1", "VAT_RATE_STANDARD")
- rule_name: Human readable name
- rule_type: One of [${VALID_RULE_TYPES.join(", ")}]
- description: Brief description (max 100 words)
- conditions: JSON object of when this rule applies
- parameters: JSON object of rule parameters (rates, thresholds, etc.)
- actions: JSON object of what happens when rule applies

Return JSON array of rules. If no ${category.description} found, return empty array [].

Document text:
${part.raw_text.substring(0, 50000)}`;

                    const categoryRules = await callClaudeJSON<ExtractedRule[]>(categorySystemPrompt, categoryUserMessage);
                    
                    if (Array.isArray(categoryRules) && categoryRules.length > 0) {
                        console.log(`[process-multipart] Part ${part.part_number}: Found ${categoryRules.length} ${category.type} rules`);
                        for (const rule of categoryRules) {
                            if (!VALID_RULE_TYPES.includes(rule.rule_type)) {
                                rule.rule_type = category.type; // Use category as fallback
                            }
                            partRules.push(rule);
                        }
                    }
                }
                
                // Add rules with source part reference
                for (const rule of partRules) {
                    allRules.push({
                        ...rule,
                        source_part_id: part.id,
                    });
                }

                const partDuration = Date.now() - partStartTime;

                await emitEvent(supabase, documentId, part.id, 'stage_completed', 'rules_extraction', 'completed',
                    `Extracted ${partRules.length} rules from part ${part.part_number}`,
                    { 
                        rules_count: partRules.length, 
                        part_number: part.part_number,
                        processing_time_ms: partDuration,
                        rules_by_category: RULE_CATEGORIES.map(c => ({
                            type: c.type,
                            count: partRules.filter(r => r.rule_type === c.type).length
                        }))
                    }
                );

                // Update part as processed
                await supabase
                    .from("document_parts")
                    .update({
                        status: "processed",
                        provisions_count: provisions?.length || 0,
                        rules_count: partRules.length,
                        processed_at: new Date().toISOString(),
                    })
                    .eq("id", part.id);

                console.log(
                    `[process-multipart] Part ${part.part_number} complete: ${provisions?.length || 0} provisions, ${partRules.length} rules (${partDuration}ms)`
                );
            } catch (partError) {
                console.error(`[process-multipart] Error processing part ${part.part_number}:`, partError);
                
                await emitEvent(supabase, documentId, part.id, 'failed', 'rules_extraction', 'failed',
                    `Failed to process part ${part.part_number}: ${String(partError)}`,
                    { part_number: part.part_number, error: String(partError) }
                );

                await supabase
                    .from("document_parts")
                    .update({ status: "failed", metadata: { error: String(partError) } })
                    .eq("id", part.id);
            }
        }

        console.log(`[process-multipart] Total extracted: ${allProvisions.length} provisions, ${allRules.length} rules`);

        // Update progress for deduplication
        await updateDocumentProcessingStatus(supabase, documentId, {
            current_processing_stage: 'deduplication',
            processing_progress: 85,
        });

        await emitEvent(supabase, documentId, null, 'stage_started', 'deduplication', 'in_progress',
            'Deduplicating provisions and rules across parts',
            { total_provisions: allProvisions.length, total_rules: allRules.length }
        );

        // Deduplicate provisions
        const deduplicatedProvisions = deduplicateProvisions(allProvisions);
        console.log(`[process-multipart] After dedup: ${deduplicatedProvisions.length} provisions`);

        // Deduplicate rules
        const deduplicatedRules = deduplicateRules(allRules);
        console.log(`[process-multipart] After dedup: ${deduplicatedRules.length} rules`);

        await emitEvent(supabase, documentId, null, 'stage_completed', 'deduplication', 'completed',
            `Deduplicated to ${deduplicatedProvisions.length} provisions and ${deduplicatedRules.length} rules`,
            { 
                deduplicated_provisions: deduplicatedProvisions.length,
                deduplicated_rules: deduplicatedRules.length,
                removed_duplicate_provisions: allProvisions.length - deduplicatedProvisions.length,
                removed_duplicate_rules: allRules.length - deduplicatedRules.length
            }
        );

        // If reprocessing single part, we need special handling
        if (reprocessPartId) {
            // Delete only this part's provisions/rules
            await supabase.from("legal_provisions").delete().eq("source_part_id", reprocessPartId);
            await supabase.from("compliance_rules").delete().eq("source_part_id", reprocessPartId);
            
            // Insert ONLY the new part's provisions/rules (not deduplicated against other parts)
            for (const provision of allProvisions) {
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
            
            for (const rule of allRules) {
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
                    is_active: false,
                    effective_from: parentDoc.effective_date || new Date().toISOString(),
                });
            }
            
            // Get TOTAL counts from ALL parts (not just reprocessed one)
            const { count: totalProvisions } = await supabase
                .from("legal_provisions")
                .select("*", { count: "exact", head: true })
                .eq("document_id", documentId);
            
            const { count: totalRules } = await supabase
                .from("compliance_rules")
                .select("*", { count: "exact", head: true })
                .eq("document_id", documentId);
            
            const totalDuration = Date.now() - startTime;
            
            // Update only this part's counts and document metadata
            await supabase
                .from("legal_documents")
                .update({
                    metadata: {
                        ...((parentDoc.metadata as Record<string, unknown>) || {}),
                        processing_completed_at: new Date().toISOString(),
                        processing_progress: 100,
                        current_processing_stage: null,
                        total_provisions: totalProvisions || 0,
                        total_rules: totalRules || 0,
                        last_reprocessed_part: reprocessPartId,
                        last_reprocessed_at: new Date().toISOString(),
                    },
                })
                .eq("id", documentId);
            
            await emitEvent(supabase, documentId, reprocessPartId, 'completed', 'finalization', 'completed',
                `Part reprocessed: ${allProvisions.length} provisions, ${allRules.length} rules. Document totals: ${totalProvisions} provisions, ${totalRules} rules`,
                {
                    part_provisions: allProvisions.length,
                    part_rules: allRules.length,
                    total_provisions: totalProvisions,
                    total_rules: totalRules,
                    processing_time_ms: totalDuration,
                }
            );
            
            return jsonResponse({
                success: true,
                documentId,
                partId: reprocessPartId,
                partProvisionsExtracted: allProvisions.length,
                partRulesExtracted: allRules.length,
                totalProvisions: totalProvisions,
                totalRules: totalRules,
                processingTimeMs: totalDuration,
            });
        }
        
        // Full document processing: Delete all existing and insert deduplicated
        await supabase.from("legal_provisions").delete().eq("document_id", documentId);
        await supabase.from("compliance_rules").delete().eq("document_id", documentId);

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

        // Update progress for summary
        await updateDocumentProcessingStatus(supabase, documentId, {
            current_processing_stage: 'summary_generation',
            processing_progress: 95,
        });

        await emitEvent(supabase, documentId, null, 'stage_started', 'summary_generation', 'in_progress',
            'Generating document summary');

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
            
            await emitEvent(supabase, documentId, null, 'stage_completed', 'summary_generation', 'completed',
                'Document summary generated successfully');
        } catch (e) {
            console.error("[process-multipart] Summary generation failed:", e);
            summary = `Multi-part document with ${parts.length} parts containing ${deduplicatedProvisions.length} provisions and ${deduplicatedRules.length} rules.`;
            
            await emitEvent(supabase, documentId, null, 'warning', 'summary_generation', 'completed',
                'Summary generation failed, using fallback summary',
                { error: String(e) }
            );
        }

        const totalDuration = Date.now() - startTime;

        // Update parent document
        await supabase
            .from("legal_documents")
            .update({
                status: "pending", // Ready for human review
                summary: summary,
                needs_human_review: true,
                metadata: {
                    ...((parentDoc.metadata as Record<string, unknown>) || {}),
                    processing_started_at: new Date(startTime).toISOString(),
                    processing_completed_at: new Date().toISOString(),
                    processing_progress: 100,
                    current_processing_stage: null,
                    total_provisions: deduplicatedProvisions.length,
                    total_rules: deduplicatedRules.length,
                    parts_processed: parts.length,
                    total_processing_time_ms: totalDuration,
                },
            })
            .eq("id", documentId);

        // Emit completion event
        await emitEvent(supabase, documentId, null, 'completed', 'finalization', 'completed',
            `Document processing complete: ${deduplicatedProvisions.length} provisions, ${deduplicatedRules.length} rules`,
            {
                total_provisions: deduplicatedProvisions.length,
                total_rules: deduplicatedRules.length,
                parts_processed: parts.length,
                total_processing_time_ms: totalDuration,
            }
        );

        console.log(`[process-multipart] Document ${documentId} processing complete (${totalDuration}ms)`);

        return jsonResponse({
            success: true,
            documentId,
            partsProcessed: parts.length,
            provisionsExtracted: deduplicatedProvisions.length,
            rulesExtracted: deduplicatedRules.length,
            processingTimeMs: totalDuration,
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
