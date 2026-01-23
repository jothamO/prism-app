import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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

    userMessage += `\n\nRespond with a JSON object containing: { "content": "...", "description": "...", "read_time": "..." }`;

    // Call Lovable AI with retry logic for rate limits
    const MAX_RETRIES = 3;
    let aiResponse: Response | null = null;
    let lastError: string = "";
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[generate-article-content] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.7,
        }),
      });
      
      if (aiResponse.ok) {
        break;
      }
      
      lastError = await aiResponse.text();
      console.error(`[generate-article-content] Attempt ${attempt + 1} failed:`, lastError);
      
      // Only retry on 429 (rate limit) or 5xx errors
      if (aiResponse.status !== 429 && aiResponse.status < 500) {
        break;
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      console.error("[generate-article-content] All retries failed:", lastError);
      
      if (aiResponse?.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse?.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI generation failed after retries");
    }

    const aiData = await aiResponse.json();
    const responseText = aiData.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let result = { content: "", description: "", read_time: "5 min" };
    try {
      // Extract JSON from response
      let cleaned = responseText.trim();
      if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("[generate-article-content] Parse error, using raw content");
      // If parsing fails, use the whole response as content
      result.content = responseText;
      result.description = topic;
    }

    return new Response(
      JSON.stringify({
        success: true,
        content: result.content,
        description: result.description,
        read_time: result.read_time,
        provisions_used: provisions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-article-content] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
