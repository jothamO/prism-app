import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";

interface SearchRequest {
  query: string;
  type?: "documents" | "provisions" | "all";
  filters?: {
    documentType?: string;
    taxTypes?: string[];
    status?: string;
  };
  limit?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, type = "all", filters = {}, limit = 10 }: SearchRequest = await req.json();

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Search query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Generate embedding for the query using Lovable AI
    console.log("[compliance-search] Generating embedding for query:", query);

    const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("[compliance-search] Embedding API error:", errorText);
      throw new Error(`Failed to generate embedding: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    console.log("[compliance-search] Embedding generated, searching database...");

    // Search database with vector similarity
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: {
      documents: any[];
      provisions: any[];
    } = { documents: [], provisions: [] };

    // Search documents
    if (type === "documents" || type === "all") {
      const { data: documents, error: docError } = await supabase.rpc(
        "search_compliance_documents",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.5,
          match_count: limit,
        }
      );

      if (docError) {
        console.error("[compliance-search] Document search error:", docError);
      } else {
        // Apply additional filters
        let filteredDocs = documents || [];
        if (filters.documentType) {
          filteredDocs = filteredDocs.filter((d: any) => d.document_type === filters.documentType);
        }
        if (filters.status) {
          filteredDocs = filteredDocs.filter((d: any) => d.status === filters.status);
        }
        results.documents = filteredDocs;
      }
    }

    // Search provisions
    if (type === "provisions" || type === "all") {
      const { data: provisions, error: provError } = await supabase.rpc(
        "search_compliance_provisions",
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.5,
          match_count: limit * 2,
        }
      );

      if (provError) {
        console.error("[compliance-search] Provision search error:", provError);
      } else {
        results.provisions = provisions || [];
      }
    }

    // Also do a text-based fallback search if no vector results
    if (results.documents.length === 0 && results.provisions.length === 0) {
      console.log("[compliance-search] No vector results, falling back to text search");

      const { data: textDocs } = await supabase
        .from("legal_documents")
        .select("id, title, document_type, summary, status")
        .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
        .limit(limit);

      const { data: textProvisions } = await supabase
        .from("legal_provisions")
        .select("id, document_id, section_number, title, content, provision_type")
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(limit * 2);

      results.documents = (textDocs || []).map((d: any) => ({ ...d, similarity: 0.5 }));
      results.provisions = (textProvisions || []).map((p: any) => ({ ...p, similarity: 0.5 }));
    }

    console.log(`[compliance-search] Found ${results.documents.length} documents, ${results.provisions.length} provisions`);

    return new Response(
      JSON.stringify({
        query,
        results,
        meta: {
          documentsCount: results.documents.length,
          provisionsCount: results.provisions.length,
          searchType: type,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[compliance-search] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
