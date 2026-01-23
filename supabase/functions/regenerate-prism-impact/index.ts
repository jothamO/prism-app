import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PRISMImpactItem {
  category: string;
  description: string;
  priority: "high" | "medium" | "low";
  completed?: boolean;
}

interface PRISMImpactAnalysis {
  summary: string;
  prism_changes_required: PRISMImpactItem[];
  tax_calendar_updates: { deadline: string; description: string; type?: string; provision_ids?: string[] }[];
  education_center_updates: { topic: string; category?: string; provision_ids?: string[] }[];
  user_notifications: { required: boolean; message: string };
  ai_confidence: number;
  ai_generated_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { documentId } = await req.json();

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "documentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[regenerate-prism-impact] Starting for document: ${documentId}`);

    // Fetch document info
    const { data: document, error: docError } = await supabase
      .from("legal_documents")
      .select("id, title, document_type, is_multi_part, metadata")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      console.error("[regenerate-prism-impact] Document not found:", docError);
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing provisions count
    const { count: provisionCount } = await supabase
      .from("legal_provisions")
      .select("*", { count: "exact", head: true })
      .eq("document_id", documentId);

    // Fetch existing rules grouped by type
    const { data: rules } = await supabase
      .from("compliance_rules")
      .select("rule_type, rule_name, description, affected_entities")
      .eq("document_id", documentId);

    console.log(`[regenerate-prism-impact] Found ${provisionCount || 0} provisions and ${rules?.length || 0} rules`);

    // Group rules by type for analysis
    const rulesByType: Record<string, number> = {};
    const ruleDetails: { type: string; name: string; description: string }[] = [];
    
    (rules || []).forEach((rule) => {
      const type = rule.rule_type || "other";
      rulesByType[type] = (rulesByType[type] || 0) + 1;
      ruleDetails.push({
        type,
        name: rule.rule_name,
        description: rule.description || "",
      });
    });

    // Generate PRISM impact analysis based on existing data
    const prismChanges: PRISMImpactItem[] = [];
    const taxCalendarUpdates: { deadline: string; description: string; type?: string }[] = [];
    const educationUpdates: { topic: string; category?: string }[] = [];

    // Analyze tax rates
    if (rulesByType["tax_rate"]) {
      prismChanges.push({
        category: "code_changes",
        description: `Update tax calculation engine with ${rulesByType["tax_rate"]} new/modified tax rate rules`,
        priority: "high",
      });
    }

    // Analyze thresholds
    if (rulesByType["threshold"]) {
      prismChanges.push({
        category: "database_updates",
        description: `Update threshold configurations for ${rulesByType["threshold"]} rules`,
        priority: "high",
      });
    }

    // Analyze deadlines
    if (rulesByType["deadline"]) {
      prismChanges.push({
        category: "tax_calendar",
        description: `Add ${rulesByType["deadline"]} filing deadlines to tax calendar`,
        priority: "medium",
      });
      
      // Create calendar suggestions for deadline rules
      ruleDetails
        .filter((r) => r.type === "deadline")
        .slice(0, 5)
        .forEach((r) => {
          taxCalendarUpdates.push({
            deadline: new Date().toISOString().split("T")[0],
            description: r.name || r.description,
            type: "filing",
          });
        });
    }

    // Analyze penalties
    if (rulesByType["penalty"]) {
      prismChanges.push({
        category: "code_changes",
        description: `Implement ${rulesByType["penalty"]} penalty calculation rules`,
        priority: "medium",
      });
    }

    // Analyze exemptions
    if (rulesByType["exemption"]) {
      prismChanges.push({
        category: "code_changes",
        description: `Add ${rulesByType["exemption"]} exemption conditions to eligibility checks`,
        priority: "medium",
      });
      
      educationUpdates.push({
        topic: `Tax Exemptions under ${document.title}`,
        category: "tax_planning",
      });
    }

    // Analyze requirements/procedures
    if (rulesByType["requirement"] || rulesByType["procedure"]) {
      const count = (rulesByType["requirement"] || 0) + (rulesByType["procedure"] || 0);
      prismChanges.push({
        category: "user_notification",
        description: `Notify users of ${count} new compliance requirements`,
        priority: "low",
      });
      
      educationUpdates.push({
        topic: `Compliance Requirements: ${document.title}`,
        category: "compliance",
      });
    }

    // Add education article suggestion if significant rules
    if ((rules?.length || 0) > 10) {
      educationUpdates.push({
        topic: `Understanding ${document.title}: Key Changes for Nigerian Taxpayers`,
        category: "legislation",
      });
    }

    // Generate summary
    const summary = `This ${document.document_type || "document"} contains ${provisionCount || 0} provisions and ${rules?.length || 0} compliance rules. ` +
      `Key areas: ${Object.entries(rulesByType).map(([t, c]) => `${c} ${t} rules`).join(", ")}. ` +
      `${prismChanges.length} PRISM system updates recommended.`;

    const prismImpactAnalysis: PRISMImpactAnalysis = {
      summary,
      prism_changes_required: prismChanges,
      tax_calendar_updates: taxCalendarUpdates,
      education_center_updates: educationUpdates.map((e) => ({ ...e, suggested: true })),
      user_notifications: {
        required: rulesByType["requirement"] > 0 || rulesByType["penalty"] > 0,
        message: `New compliance requirements from ${document.title} may affect your tax obligations.`,
      },
      ai_confidence: 0.85,
      ai_generated_at: new Date().toISOString(),
    };

    // Update document with new PRISM impact analysis (WITHOUT touching provisions/rules)
    const { error: updateError } = await supabase
      .from("legal_documents")
      .update({
        prism_impact_analysis: prismImpactAnalysis,
        impact_reviewed: false,
        impact_reviewed_at: null,
      })
      .eq("id", documentId);

    if (updateError) {
      console.error("[regenerate-prism-impact] Update error:", updateError);
      throw updateError;
    }

    console.log(`[regenerate-prism-impact] Successfully regenerated analysis for ${documentId}`);

    return new Response(
      JSON.stringify({
        success: true,
        analysis: prismImpactAnalysis,
        stats: {
          provisions: provisionCount || 0,
          rules: rules?.length || 0,
          rulesByType,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("[regenerate-prism-impact] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
