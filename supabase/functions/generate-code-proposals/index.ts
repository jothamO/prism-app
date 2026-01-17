/**
 * Generate Code Proposals - Enhanced Version
 * 
 * Features:
 * - Risk classification (low/medium/high/critical)
 * - Auto-apply eligibility detection
 * - Centralization-aware (most changes are DB-only now)
 * - Batches similar rules into single proposals
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";
import { callClaudeJSON, CLAUDE_MODELS } from "../_shared/claude-client.ts";

interface QueueItem {
  id: string;
  rule_id: string;
  status: string;
}

interface ComplianceRule {
  id: string;
  rule_code: string;
  rule_name: string;
  rule_type: string;
  parameters: Record<string, unknown>;
  description: string;
  document_id: string;
  section_reference: string;
  extraction_confidence: number;
}

interface RiskClassification {
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  auto_apply_eligible: boolean;
  change_type: 'db_only' | 'prompt_only' | 'code_and_db';
}

interface AICodeSuggestion {
  affected_files: string[];
  changes: Array<{
    file: string;
    line_hint: string;
    current_pattern: string;
    suggested_change: string;
    reason: string;
  }>;
  summary: string;
  db_changes?: {
    table: string;
    column: string;
    old_value?: string;
    new_value: string;
  }[];
}

// Risk classification based on rule type
function classifyRisk(ruleType: string): RiskClassification {
  switch (ruleType) {
    case 'vat_rate':
    case 'tax_rate':
    case 'threshold':
      return { risk_level: 'low', auto_apply_eligible: true, change_type: 'db_only' };

    case 'tax_band':
      return { risk_level: 'medium', auto_apply_eligible: false, change_type: 'db_only' };

    case 'relief':
      return { risk_level: 'medium', auto_apply_eligible: false, change_type: 'prompt_only' };

    case 'exemption':
    case 'penalty':
      return { risk_level: 'high', auto_apply_eligible: false, change_type: 'prompt_only' };

    case 'emtl':
      return { risk_level: 'critical', auto_apply_eligible: false, change_type: 'code_and_db' };

    default:
      return { risk_level: 'medium', auto_apply_eligible: false, change_type: 'prompt_only' };
  }
}

// Get priority based on risk level
function getPriorityFromRisk(riskLevel: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (riskLevel) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    default: return 'low';
  }
}

// Get affected files from codebase_registry database table
// Falls back to static map if DB query fails
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFilesForRuleType(
  supabase: any,
  ruleType: string
): Promise<{ files: string[]; description: string; isCentralized: boolean }> {
  try {
    // Query the codebase_registry using RPC that handles array column
    const { data: registryFiles, error } = await supabase
      .rpc('get_files_for_rule_type', { p_rule_type: ruleType });

    if (error || !registryFiles || registryFiles.length === 0) {
      console.log(`[generate-code-proposals] No registry entries for ${ruleType}, using fallback`);
      return getFallbackFiles(ruleType);
    }

    const filePaths = registryFiles.map((f: { file_path: string }) => f.file_path);
    const descriptions = registryFiles.map((f: { description: string }) => f.description).filter(Boolean);

    // Check if centralized (DB-only is first file)
    const isCentralized = filePaths[0]?.includes('(DB)') ||
      ['vat_rate', 'tax_rate', 'threshold', 'tax_band'].includes(ruleType);

    return {
      files: filePaths,
      description: descriptions[0] || `Files for ${ruleType}`,
      isCentralized
    };
  } catch (error) {
    console.error('[generate-code-proposals] Error fetching codebase registry:', error);
    return getFallbackFiles(ruleType);
  }
}

// Fallback in case codebase_registry isn't populated yet
function getFallbackFiles(ruleType: string): { files: string[]; description: string; isCentralized: boolean } {
  const FALLBACK_MAP: Record<string, { files: string[]; description: string; isCentralized: boolean }> = {
    vat_rate: {
      files: ['compliance_rules (DB)', 'supabase/functions/_shared/prompt-generator.ts'],
      description: 'VAT rate - centralized in tax-calculate',
      isCentralized: true
    },
    tax_rate: {
      files: ['compliance_rules (DB)', 'supabase/functions/_shared/prompt-generator.ts'],
      description: 'Tax rates - centralized via rules-client',
      isCentralized: true
    },
    threshold: {
      files: ['compliance_rules (DB)', 'supabase/functions/_shared/prompt-generator.ts'],
      description: 'Thresholds - centralized via rules-client',
      isCentralized: true
    },
    tax_band: {
      files: ['compliance_rules (DB)', 'supabase/functions/_shared/prompt-generator.ts'],
      description: 'Tax bands - read from compliance_rules',
      isCentralized: true
    },
    relief: {
      files: ['supabase/functions/_shared/prompt-generator.ts'],
      description: 'Tax reliefs - may need prompt updates',
      isCentralized: false
    },
    exemption: {
      files: ['supabase/functions/_shared/prompt-generator.ts', 'supabase/functions/tax-calculate/index.ts'],
      description: 'Exemptions - NLU in tax-calculate',
      isCentralized: false
    },
    emtl: {
      files: ['supabase/functions/_shared/prompt-generator.ts', 'gateway/src/skills/document-processing/nigerian-detectors/index.ts'],
      description: 'EMTL - may need detector updates',
      isCentralized: false
    }
  };

  return FALLBACK_MAP[ruleType] || {
    files: ['supabase/functions/_shared/prompt-generator.ts'],
    description: 'Unknown rule type',
    isCentralized: false
  };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get pending items from queue
    const { data: queueItems, error: queueError } = await supabase
      .from("code_proposal_queue")
      .select("*")
      .eq("status", "pending")
      .limit(20);  // Process more items at once

    if (queueError) throw queueError;

    if (!queueItems || queueItems.length === 0) {
      return jsonResponse({ message: "No pending items in queue", processed: 0 });
    }

    console.log(`[generate-code-proposals] Processing ${queueItems.length} queue items`);

    const results: Array<{ rule_id: string; status: string; proposal_id?: string; error?: string }> = [];

    // Group items by rule_type for batching
    const rulesByType = new Map<string, { queueItem: QueueItem; rule: ComplianceRule }[]>();

    for (const item of queueItems as QueueItem[]) {
      // Mark as processing
      await supabase
        .from("code_proposal_queue")
        .update({ status: "processing" })
        .eq("id", item.id);

      // Get the rule details
      const { data: rule, error: ruleError } = await supabase
        .from("compliance_rules")
        .select("*")
        .eq("id", item.rule_id)
        .single();

      if (ruleError || !rule) {
        await supabase
          .from("code_proposal_queue")
          .update({
            status: "failed",
            error_message: `Rule not found: ${item.rule_id}`,
            processed_at: new Date().toISOString()
          })
          .eq("id", item.id);
        results.push({ rule_id: item.rule_id, status: "failed", error: "Rule not found" });
        continue;
      }

      const typedRule = rule as ComplianceRule;

      // FACT-GROUNDED AI: Verify rule has source document
      if (!typedRule.document_id) {
        console.warn(`[generate-code-proposals] Rule ${typedRule.rule_code} has no source document - flagging`);
        // Still process but mark as unverified
        (typedRule as any)._unverified = true;
      }

      const existing = rulesByType.get(typedRule.rule_type) || [];
      existing.push({ queueItem: item, rule: typedRule });
      rulesByType.set(typedRule.rule_type, existing);
    }

    // Process each rule type batch
    for (const [ruleType, items] of rulesByType) {
      try {
        // Get files from codebase registry (or fallback)
        const fileMapping = await getFilesForRuleType(supabase, ruleType);

        const classification = classifyRisk(ruleType);

        // For multiple rules of same type, create a batched proposal
        const ruleNames = items.map(i => i.rule.rule_name).join(', ');
        const ruleCodes = items.map(i => i.rule.rule_code || i.rule.id).slice(0, 5);

        let description: string;
        let codeDiff: Record<string, unknown>;

        if (fileMapping.isCentralized) {
          // DB-only change - no code changes needed!
          description = `${items.length} ${ruleType} rule(s) updated. No code changes required - values are read from compliance_rules table at runtime.`;
          codeDiff = {
            type: 'db_only',
            affected_files: [],
            db_changes: items.map(i => ({
              table: 'compliance_rules',
              rule_id: i.rule.id,
              rule_name: i.rule.rule_name,
              parameters: i.rule.parameters
            })),
            summary: `Update ${items.length} ${ruleType} rule(s) in compliance_rules table. The application will automatically use the new values via rules-client.ts.`,
            verification: 'Test by calling tax-calculate edge function with relevant parameters.'
          };
        } else {
          // May need code/prompt changes - use AI
          const prompt = `A batch of ${items.length} ${ruleType} compliance rules have been activated/updated:

${items.slice(0, 5).map(i => `
Rule: ${i.rule.rule_name}
Code: ${i.rule.rule_code || 'N/A'}
Parameters: ${JSON.stringify(i.rule.parameters)}
Description: ${i.rule.description || 'No description'}
`).join('\n---\n')}

Known affected files: ${fileMapping.files.join(', ')}
Area: ${fileMapping.description}

Generate code change suggestions. The system uses:
- compliance_rules table as source of truth
- _shared/rules-client.ts to fetch rules
- _shared/prompt-generator.ts for AI chat context

Most rate/threshold changes are DB-only. Focus on:
1. Prompt template updates if new concepts are introduced
2. Classification logic if new exemptions/categories are added`;

          try {
            const aiResult = await callClaudeJSON<AICodeSuggestion>(
              `You are a code review assistant for PRISM (Nigerian tax compliance system).
Generate JSON with code change suggestions. Be specific about what needs to change.
Output ONLY valid JSON with structure:
{
  "affected_files": ["file1.ts"],
  "changes": [{"file": "path", "line_hint": "line ~50", "current_pattern": "old", "suggested_change": "new", "reason": "why"}],
  "summary": "brief description",
  "db_changes": [{"table": "compliance_rules", "column": "parameters", "new_value": "..."}]
}`,
              prompt,
              { model: CLAUDE_MODELS.OPUS, maxTokens: 8000 }
            );

            if (aiResult) {
              codeDiff = aiResult as unknown as Record<string, unknown>;
              description = aiResult.summary || `AI-generated changes for ${ruleType} rules`;
            } else {
              throw new Error('AI returned null');
            }
          } catch (aiError) {
            // Fallback to template
            codeDiff = {
              type: 'prompt_review',
              affected_files: fileMapping.files,
              changes: fileMapping.files.map(f => ({
                file: f,
                action: 'review',
                reason: `Review for ${ruleType} changes: ${ruleNames}`
              })),
              summary: `Review required for ${items.length} ${ruleType} rule(s)`
            };
            description = `Template-based suggestion for ${items.length} ${ruleType} rule(s)`;
          }
        }

        // Get source document info for verification
        const primaryRule = items[0].rule;
        let sourceVerification: Record<string, unknown> = { verified: false };
        let sourceDocumentId: string | null = null;

        if (primaryRule.document_id) {
          const { data: sourceDoc } = await supabase
            .from('legal_documents')
            .select('id, title, document_type, document_priority')
            .eq('id', primaryRule.document_id)
            .single();

          if (sourceDoc) {
            sourceVerification = {
              verified: true,
              document_name: sourceDoc.title,
              document_type: sourceDoc.document_type,
              document_priority: sourceDoc.document_priority,
              section_reference: primaryRule.section_reference,
              extraction_confidence: primaryRule.extraction_confidence
            };
            sourceDocumentId = sourceDoc.id;
          }
        }

        // Insert the proposal with source verification
        const { data: proposal, error: insertError } = await supabase
          .from("code_change_proposals")
          .insert({
            title: fileMapping.isCentralized
              ? `DB Update: ${items.length} ${ruleType} rule(s)`
              : `Code Review: ${items.length} ${ruleType} rule(s)`,
            description: sourceVerification.verified
              ? `${description}\n\n📄 Source: ${sourceVerification.document_name}, ${primaryRule.section_reference || 'no section ref'}`
              : `⚠️ UNVERIFIED: ${description}\n\nThis proposal has no verified source document.`,
            code_diff: codeDiff,
            affected_files: fileMapping.files,
            rule_id: primaryRule.id,
            status: "pending",
            priority: getPriorityFromRisk(classification.risk_level),
            risk_level: classification.risk_level,
            auto_apply_eligible: sourceVerification.verified ? classification.auto_apply_eligible : false, // No auto-apply without verification
            change_type: classification.change_type,
            source_document_id: sourceDocumentId,
            source_verification: sourceVerification
            generated_by: "system"
          })
          .select('id')
          .single();

        if (insertError) throw insertError;

        // Mark all queue items as completed
        for (const { queueItem } of items) {
          await supabase
            .from("code_proposal_queue")
            .update({
              status: "completed",
              processed_at: new Date().toISOString()
            })
            .eq("id", queueItem.id);

          results.push({
            rule_id: queueItem.rule_id,
            status: "completed",
            proposal_id: proposal?.id
          });
        }

      } catch (batchError) {
        console.error(`Error processing ${ruleType} batch:`, batchError);

        // Mark all items in batch as failed
        for (const { queueItem } of items) {
          await supabase
            .from("code_proposal_queue")
            .update({
              status: "failed",
              error_message: batchError instanceof Error ? batchError.message : "Unknown error",
              processed_at: new Date().toISOString()
            })
            .eq("id", queueItem.id);

          results.push({
            rule_id: queueItem.rule_id,
            status: "failed",
            error: batchError instanceof Error ? batchError.message : "Unknown error"
          });
        }
      }
    }

    console.log(`[generate-code-proposals] Completed: ${results.filter(r => r.status === 'completed').length}/${results.length}`);

    return jsonResponse({
      processed: results.length,
      completed: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    });

  } catch (error) {
    console.error("[generate-code-proposals] Error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
