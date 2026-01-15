import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImportNigeriaTaxActButtonProps {
  onSuccess?: () => void;
}

export function ImportNigeriaTaxActButton({ onSuccess }: ImportNigeriaTaxActButtonProps) {
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  async function handleImport() {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-nigeria-tax-act", {
        body: {},
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Import Started",
          description: `Nigeria Tax Act 2025 (10 parts) is being processed. Document ID: ${data.documentId}`,
        });
        onSuccess?.();
      } else {
        toast({
          title: "Import Failed",
          description: data?.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import Error",
        description: error instanceof Error ? error.message : "Failed to import",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <button
      onClick={handleImport}
      disabled={importing}
      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
    >
      {importing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <BookOpen className="w-4 h-4" />
      )}
      {importing ? "Importing..." : "Import Tax Act 2025"}
    </button>
  );
}
