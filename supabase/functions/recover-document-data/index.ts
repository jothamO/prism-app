/**
 * Recover Document Data Edge Function
 * Restores provisions and rules from document_parts.metadata backups
 * when main tables get wiped during an interrupted reprocess
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecoverRequest {
  documentId: string;
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

interface PartMetadata {
  extracted_provisions?: ExtractedProvision[];
  extracted_rules?: ExtractedRule[];
  extraction_timestamp?: string;
  source_part_number?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId }: RecoverRequest = await req.json();

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "Missing documentId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[recover-document-data] Starting recovery for document: ${documentId}`);

    // Fetch parent document
    const { data: parentDoc, error: docError } = await supabase
      .from("legal_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !parentDoc) {
      return new Response(
        JSON.stringify({ error: `Document not found: ${documentId}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all document parts with their metadata backups
    const { data: parts, error: partsError } = await supabase
      .from("document_parts")
      .select("*")
      .eq("parent_document_id", documentId)
      .order("part_number");

    if (partsError || !parts || parts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No document parts found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which parts have backup data
    const partsWithBackup = parts.filter(p => {
      const metadata = p.metadata as PartMetadata | null;
      return metadata?.extracted_provisions || metadata?.extracted_rules;
    });

    if (partsWithBackup.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No backup data found in part metadata",
          message: "Parts do not contain extracted_provisions or extracted_rules in their metadata. Full reprocessing is required."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[recover-document-data] Found ${partsWithBackup.length} parts with backup data`);

    // Collect all provisions and rules from backups
    const allProvisions: (ExtractedProvision & { source_part_id: string; source_part_number: number })[] = [];
    const allRules: (ExtractedRule & { source_part_id: string })[] = [];

    for (const part of partsWithBackup) {
      const metadata = part.metadata as PartMetadata;
      
      if (metadata.extracted_provisions && Array.isArray(metadata.extracted_provisions)) {
        for (const provision of metadata.extracted_provisions) {
          allProvisions.push({
            ...provision,
            source_part_id: part.id,
            source_part_number: part.part_number,
          });
        }
      }

      if (metadata.extracted_rules && Array.isArray(metadata.extracted_rules)) {
        for (const rule of metadata.extracted_rules) {
          allRules.push({
            ...rule,
            source_part_id: part.id,
          });
        }
      }
    }

    console.log(`[recover-document-data] Collected ${allProvisions.length} provisions and ${allRules.length} rules from backups`);

    // Check current state of main tables
    const { count: existingProvisions } = await supabase
      .from("legal_provisions")
      .select("*", { count: "exact", head: true })
      .eq("document_id", documentId);

    const { count: existingRules } = await supabase
      .from("compliance_rules")
      .select("*", { count: "exact", head: true })
      .eq("document_id", documentId);

    console.log(`[recover-document-data] Current state: ${existingProvisions || 0} provisions, ${existingRules || 0} rules`);

    // Clear existing data before recovery (to avoid duplicates)
    if ((existingProvisions || 0) > 0) {
      await supabase
        .from("legal_provisions")
        .delete()
        .eq("document_id", documentId);
    }

    if ((existingRules || 0) > 0) {
      await supabase
        .from("compliance_rules")
        .delete()
        .eq("document_id", documentId);
    }

    // Insert recovered provisions
    let provisionsInserted = 0;
    for (const provision of allProvisions) {
      const { error: provError } = await supabase.from("legal_provisions").insert({
        document_id: documentId,
        source_part_id: provision.source_part_id,
        section_number: provision.section_number,
        title: provision.title,
        content: provision.content,
        provision_type: provision.provision_type,
        affected_entities: provision.applies_to,
        keywords: provision.key_terms,
      });
      
      if (!provError) {
        provisionsInserted++;
      } else {
        console.error(`[recover-document-data] Failed to insert provision:`, provError);
      }
    }

    // Insert recovered rules
    let rulesInserted = 0;
    for (const rule of allRules) {
      const { error: ruleError } = await supabase.from("compliance_rules").insert({
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

      if (!ruleError) {
        rulesInserted++;
      } else {
        console.error(`[recover-document-data] Failed to insert rule:`, ruleError);
      }
    }

    // Update document metadata
    const currentMetadata = (parentDoc.metadata as Record<string, unknown>) || {};
    await supabase
      .from("legal_documents")
      .update({
        status: 'pending',
        metadata: {
          ...currentMetadata,
          last_recovered_at: new Date().toISOString(),
          recovery_source: 'part_metadata_backup',
          recovered_provisions: provisionsInserted,
          recovered_rules: rulesInserted,
          parts_with_backup: partsWithBackup.length,
          total_parts: parts.length,
        },
      })
      .eq("id", documentId);

    console.log(`[recover-document-data] Recovery complete: ${provisionsInserted} provisions, ${rulesInserted} rules`);

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        recovery: {
          partsWithBackup: partsWithBackup.length,
          totalParts: parts.length,
          provisionsRecovered: provisionsInserted,
          rulesRecovered: rulesInserted,
          previousState: {
            provisions: existingProvisions || 0,
            rules: existingRules || 0,
          },
        },
        message: `Successfully recovered ${provisionsInserted} provisions and ${rulesInserted} rules from ${partsWithBackup.length} part backups.`,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    console.error("[recover-document-data] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
