import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateDeadlineRequest {
  title: string;
  deadlineType: string;
  provisionIds?: string[];
  documentId?: string;
}

interface LegalProvision {
  id: string;
  section_number: string | null;
  title: string | null;
  provision_text: string | null;
  document_title: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { title, deadlineType, provisionIds, documentId }: GenerateDeadlineRequest = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: "Title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch provision details if IDs provided
    let provisions: LegalProvision[] = [];
    if (provisionIds && provisionIds.length > 0) {
      const { data: provData, error: provError } = await supabase
        .from("legal_provisions")
        .select(`
          id,
          section_number,
          title,
          provision_text,
          legal_documents!inner(title)
        `)
        .in("id", provisionIds);

      if (!provError && provData) {
        provisions = provData.map((p: any) => ({
          id: p.id,
          section_number: p.section_number,
          title: p.title,
          provision_text: p.provision_text,
          document_title: p.legal_documents?.title || null,
        }));
      }
    }

    // Build the system prompt
    const systemPrompt = `You are a Nigerian tax compliance expert creating tax calendar deadline entries for PRISM Tax Assistant.

Guidelines:
- Be specific about who the deadline applies to (individuals, businesses, VAT-registered, etc.)
- Mention consequences of missing the deadline when applicable
- Include any relevant thresholds or exemptions
- Create notification message templates using these variables: {deadline_type}, {date}, {title}, {amount}
- Determine if this should be monthly, annual, or a specific one-time date

Generate a JSON response with:
1. description: Clear explanation of the deadline (2-3 sentences)
2. message_template: Notification message template using the variables above
3. suggested_recurrence: "monthly", "annual", or "specific_date"
4. suggested_day: Day of month for monthly deadlines (1-28)
5. suggested_month: Month number for annual deadlines (1-12)`;

    // Build the user message
    let userMessage = `Create a tax calendar deadline entry for: "${title}"`;
    userMessage += `\nDeadline Type: ${deadlineType.toUpperCase()}`;

    if (provisions.length > 0) {
      userMessage += `\n\nLEGAL BASIS:\n`;
      for (const prov of provisions) {
        userMessage += `\n§${prov.section_number || 'N/A'}: ${prov.title || 'Untitled'}\n`;
        if (prov.provision_text) {
          userMessage += `"${prov.provision_text.slice(0, 400)}${prov.provision_text.length > 400 ? '...' : ''}"\n`;
        }
        if (prov.document_title) {
          userMessage += `Source: ${prov.document_title}\n`;
        }
      }
    }

    userMessage += `\n\nRespond with valid JSON only.`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.5,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[generate-deadline-content] AI error:", errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const responseText = aiData.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let result = {
      description: "",
      message_template: "",
      suggested_recurrence: "monthly",
      suggested_day: 21,
      suggested_month: 1,
    };

    try {
      // Extract JSON from response
      let cleaned = responseText.trim();
      if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          description: parsed.description || "",
          message_template: parsed.message_template || "",
          suggested_recurrence: parsed.suggested_recurrence || "monthly",
          suggested_day: parsed.suggested_day || 21,
          suggested_month: parsed.suggested_month || 1,
        };
      }
    } catch (parseError) {
      console.error("[generate-deadline-content] Parse error, using defaults");
      result.description = title;
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        provisions_used: provisions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-deadline-content] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
