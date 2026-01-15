import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProvisionDetail {
  id: string;
  section_number: string | null;
  title: string | null;
  provision_text: string | null;
  document_id: string | null;
  document_title: string | null;
}

export function useProvisionDetails(provisionIds: string[]) {
  const [provisions, setProvisions] = useState<ProvisionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provisionIds || provisionIds.length === 0) {
      setProvisions([]);
      return;
    }

    async function fetchProvisions() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("legal_provisions")
          .select(`
            id,
            section_number,
            title,
            provision_text,
            document_id,
            legal_documents!inner(title)
          `)
          .in("id", provisionIds);

        if (fetchError) {
          throw fetchError;
        }

        const mapped: ProvisionDetail[] = (data || []).map((p: any) => ({
          id: p.id,
          section_number: p.section_number,
          title: p.title,
          provision_text: p.provision_text,
          document_id: p.document_id,
          document_title: p.legal_documents?.title || null,
        }));

        setProvisions(mapped);
      } catch (err) {
        console.error("[useProvisionDetails] Error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch provisions");
        setProvisions([]);
      } finally {
        setLoading(false);
      }
    }

    fetchProvisions();
  }, [JSON.stringify(provisionIds)]);

  return { provisions, loading, error };
}
