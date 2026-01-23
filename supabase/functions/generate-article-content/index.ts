import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaudeJSON, CLAUDE_MODELS } from "../_shared/claude-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateArticleRequest {
  topic: string;
  category: string;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topic, category, provisionIds, documentId }: GenerateArticleRequest = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
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
    const systemPrompt = `You are a Nigerian tax education expert writing for PRISM Tax Assistant. Your articles help Nigerian taxpayers understand their obligations clearly and practically.

Guidelines:
- Write in clear, accessible Nigerian English
- Use practical examples relevant to Nigerian taxpayers and businesses
- Reference specific section numbers when citing legal provisions
- Include a "What This Means for You" section
- Include practical tips and common mistakes to avoid
- Format in Markdown with ## headings
- Keep the tone professional but friendly
- Target ${category} readers

Generate the following:
1. Article content (800-1500 words in Markdown)
2. A brief description (1-2 sentences for the article card)
3. Estimated read time (e.g., "5 min")`;

    // Build the user message
    let userMessage = `Create an educational article about: "${topic}"`;

    if (provisions.length > 0) {
      userMessage += `\n\nLEGAL PROVISIONS TO REFERENCE:\n`;
      for (const prov of provisions) {
        userMessage += `\n§${prov.section_number || 'N/A'}: ${prov.title || 'Untitled'}\n`;
        if (prov.provision_text) {
          userMessage += `"${prov.provision_text.slice(0, 500)}${prov.provision_text.length > 500 ? '...' : ''}"\n`;
        }
        if (prov.document_title) {
          userMessage += `Source: ${prov.document_title}\n`;
        }
      }
    }

    // Define expected response structure
    interface ArticleContent {
      content: string;
      description: string;
      read_time: string;
    }

    // Call Claude Haiku via shared client (handles retries automatically)
    try {
      const result = await callClaudeJSON<ArticleContent>(
        systemPrompt,
        userMessage,
        { 
          model: CLAUDE_MODELS.HAIKU,
          maxTokens: 4000 
        }
      );

      if (!result) {
        throw new Error("Failed to generate article content - no response from AI");
      }

      return new Response(
        JSON.stringify({
          success: true,
          content: result.content || "",
          description: result.description || topic,
          read_time: result.read_time || "5 min",
          provisions_used: provisions.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (aiError) {
      const errorMessage = aiError instanceof Error ? aiError.message : String(aiError);
      console.error("[generate-article-content] Claude error:", errorMessage);
      
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate limit")) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw aiError;
    }

  } catch (error) {
    console.error("[generate-article-content] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
