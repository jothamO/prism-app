import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
}

// Known hardcoded locations in the codebase that might need updates
const CODE_PATTERNS: Record<string, { files: string[]; pattern: string; description: string }> = {
  vat_rate: {
    files: [
      "prism-api/src/services/vat-calculator.service.ts",
      "gateway/src/skills/vat-calculation/index.ts",
      "supabase/functions/vat-calculator/index.ts"
    ],
    pattern: "VAT_RATE|vatRate|0\\.075|7\\.5%",
    description: "VAT rate calculation logic"
  },
  tax_band: {
    files: [
      "prism-api/src/services/pit-calculator.service.ts",
      "prism-api/src/services/enhanced-pit-calculator.service.ts",
      "supabase/functions/income-tax-calculator/index.ts"
    ],
    pattern: "TAX_BANDS|taxBands|brackets",
    description: "Personal income tax band definitions"
  },
  threshold: {
    files: [
      "prism-api/src/services/business-classification.service.ts",
      "gateway/src/skills/document-processing/classifiers/business-pattern.ts"
    ],
    pattern: "THRESHOLD|turnover|revenue_limit",
    description: "Business classification thresholds"
  },
  emtl: {
    files: [
      "prism-api/src/services/emtl-detector.service.ts",
      "gateway/src/skills/document-processing/nigerian-detectors/index.ts"
    ],
    pattern: "EMTL|emtl|electronic.*levy|₦50",
    description: "Electronic Money Transfer Levy logic"
  },
  relief: {
    files: [
      "prism-api/src/services/enhanced-pit-calculator.service.ts",
      "prism-api/src/services/tax-rule-registry.service.ts"
    ],
    pattern: "RELIEF|relief|allowance|deduction",
    description: "Tax relief and allowance calculations"
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get pending items from queue
    const { data: queueItems, error: queueError } = await supabase
      .from("code_proposal_queue")
      .select("*")
      .eq("status", "pending")
      .limit(5);

    if (queueError) throw queueError;

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending items in queue" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const item of queueItems as QueueItem[]) {
      // Mark as processing
      await supabase
        .from("code_proposal_queue")
        .update({ status: "processing" })
        .eq("id", item.id);

      try {
        // Get the rule details
        const { data: rule, error: ruleError } = await supabase
          .from("compliance_rules")
          .select("*")
          .eq("id", item.rule_id)
          .single();

        if (ruleError || !rule) {
          throw new Error(`Rule not found: ${item.rule_id}`);
        }

        const typedRule = rule as ComplianceRule;
        const codePattern = CODE_PATTERNS[typedRule.rule_type];

        if (!codePattern) {
          // No code pattern for this rule type, mark as completed
          await supabase
            .from("code_proposal_queue")
            .update({ 
              status: "completed", 
              processed_at: new Date().toISOString(),
              error_message: "No code patterns defined for this rule type"
            })
            .eq("id", item.id);
          continue;
        }

        // Generate proposal using AI if available
        let codeDiff: Record<string, unknown>;
        let description: string;

        const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (anthropicApiKey) {
          // Use Anthropic Claude Opus for intelligent code suggestions
          const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicApiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-opus-4-5-20251101",
              max_tokens: 8000,
              system: `You are a code review assistant for a Nigerian tax compliance system (PRISM).
Generate a JSON object with code change suggestions when tax rules change.
Output ONLY valid JSON with this structure:
{
  "affected_files": ["file1.ts", "file2.ts"],
  "changes": [
    {
      "file": "path/to/file.ts",
      "line_hint": "around line 45",
      "current_pattern": "old code pattern",
      "suggested_change": "new code pattern",
      "reason": "why this change is needed"
    }
  ],
  "summary": "brief description of all changes"
}`,
              messages: [
                {
                  role: "user",
                  content: `A compliance rule has been activated:

Rule: ${typedRule.rule_name}
Type: ${typedRule.rule_type}
Code: ${typedRule.rule_code}
Parameters: ${JSON.stringify(typedRule.parameters)}
Description: ${typedRule.description}

Known affected files: ${codePattern.files.join(", ")}
Pattern to look for: ${codePattern.pattern}
Area: ${codePattern.description}

Generate code change suggestions to ensure the codebase reflects this rule.`
                }
              ]
            })
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.content?.[0]?.text || "";
            
            // Parse AI response
            try {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                codeDiff = JSON.parse(jsonMatch[0]);
                description = `AI-generated code changes for ${typedRule.rule_name}`;
              } else {
                throw new Error("No JSON in AI response");
              }
            } catch {
              // Fallback to template-based suggestion
              codeDiff = generateTemplateDiff(typedRule, codePattern);
              description = `Template-based suggestion for ${typedRule.rule_name}`;
            }
          } else {
            codeDiff = generateTemplateDiff(typedRule, codePattern);
            description = `Template-based suggestion for ${typedRule.rule_name}`;
          }
        } else {
          // No AI key, use template-based suggestions
          codeDiff = generateTemplateDiff(typedRule, codePattern);
          description = `Template-based suggestion for ${typedRule.rule_name}`;
        }

        // Insert the proposal
        const { error: insertError } = await supabase
          .from("code_change_proposals")
          .insert({
            title: `Update code for: ${typedRule.rule_name}`,
            description,
            code_diff: codeDiff,
            affected_files: codePattern.files,
            rule_id: typedRule.id,
            status: "pending",
            priority: typedRule.rule_type === "vat_rate" ? "high" : "medium",
            generated_by: "system"
          });

        if (insertError) throw insertError;

        // Mark queue item as completed
        await supabase
          .from("code_proposal_queue")
          .update({ 
            status: "completed", 
            processed_at: new Date().toISOString() 
          })
          .eq("id", item.id);

        results.push({ rule_id: item.rule_id, status: "completed" });

      } catch (itemError) {
        // Mark as failed
        await supabase
          .from("code_proposal_queue")
          .update({ 
            status: "failed", 
            error_message: itemError instanceof Error ? itemError.message : "Unknown error",
            processed_at: new Date().toISOString()
          })
          .eq("id", item.id);

        results.push({ 
          rule_id: item.rule_id, 
          status: "failed", 
          error: itemError instanceof Error ? itemError.message : "Unknown error"
        });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing code proposals:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateTemplateDiff(
  rule: ComplianceRule, 
  pattern: { files: string[]; pattern: string; description: string }
): Record<string, unknown> {
  return {
    affected_files: pattern.files,
    changes: pattern.files.map(file => ({
      file,
      line_hint: "Search for pattern",
      current_pattern: pattern.pattern,
      suggested_change: `Update to reflect: ${rule.rule_name}`,
      reason: `Compliance rule ${rule.rule_code || rule.id} has been activated. ${rule.description || ""}`
    })),
    parameters: rule.parameters,
    summary: `Review ${pattern.description} to ensure alignment with ${rule.rule_name}`
  };
}
