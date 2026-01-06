import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  documentId?: string;
  regenerateAll?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, regenerateAll = false }: GenerateRequest = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get documents that need embeddings
    let documentsQuery = supabase
      .from("legal_documents")
      .select("id, title, summary, raw_text, document_type");

    if (documentId) {
      documentsQuery = documentsQuery.eq("id", documentId);
    } else if (!regenerateAll) {
      documentsQuery = documentsQuery.is("embedding", null);
    }

    const { data: documents, error: docError } = await documentsQuery.limit(50);

    if (docError) {
      throw new Error(`Failed to fetch documents: ${docError.message}`);
    }

    console.log(`[generate-embeddings] Processing ${documents?.length || 0} documents`);

    let documentsProcessed = 0;
    let provisionsProcessed = 0;

    // Process documents
    for (const doc of documents || []) {
      const textToEmbed = [
        doc.title,
        doc.summary || "",
        doc.document_type,
        (doc.raw_text || "").substring(0, 8000), // Limit text length
      ].filter(Boolean).join(" | ");

      if (!textToEmbed.trim()) continue;

      try {
        const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: textToEmbed,
          }),
        });

        if (!embeddingResponse.ok) {
          console.error(`[generate-embeddings] Failed to embed document ${doc.id}`);
          continue;
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0].embedding;

        const { error: updateError } = await supabase
          .from("legal_documents")
          .update({ embedding })
          .eq("id", doc.id);

        if (updateError) {
          console.error(`[generate-embeddings] Failed to update document ${doc.id}:`, updateError);
        } else {
          documentsProcessed++;
        }
      } catch (err) {
        console.error(`[generate-embeddings] Error processing document ${doc.id}:`, err);
      }
    }

    // Get provisions that need embeddings
    let provisionsQuery = supabase
      .from("legal_provisions")
      .select("id, title, content, section_number, provision_type");

    if (documentId) {
      provisionsQuery = provisionsQuery.eq("document_id", documentId);
    } else if (!regenerateAll) {
      provisionsQuery = provisionsQuery.is("embedding", null);
    }

    const { data: provisions, error: provError } = await provisionsQuery.limit(200);

    if (provError) {
      console.error("[generate-embeddings] Failed to fetch provisions:", provError);
    }

    console.log(`[generate-embeddings] Processing ${provisions?.length || 0} provisions`);

    // Process provisions
    for (const prov of provisions || []) {
      const textToEmbed = [
        prov.section_number || "",
        prov.title || "",
        prov.provision_type || "",
        (prov.content || "").substring(0, 8000),
      ].filter(Boolean).join(" | ");

      if (!textToEmbed.trim()) continue;

      try {
        const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: textToEmbed,
          }),
        });

        if (!embeddingResponse.ok) {
          console.error(`[generate-embeddings] Failed to embed provision ${prov.id}`);
          continue;
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0].embedding;

        const { error: updateError } = await supabase
          .from("legal_provisions")
          .update({ embedding })
          .eq("id", prov.id);

        if (updateError) {
          console.error(`[generate-embeddings] Failed to update provision ${prov.id}:`, updateError);
        } else {
          provisionsProcessed++;
        }
      } catch (err) {
        console.error(`[generate-embeddings] Error processing provision ${prov.id}:`, err);
      }
    }

    console.log(`[generate-embeddings] Completed: ${documentsProcessed} documents, ${provisionsProcessed} provisions`);

    return new Response(
      JSON.stringify({
        success: true,
        documentsProcessed,
        provisionsProcessed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-embeddings] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
