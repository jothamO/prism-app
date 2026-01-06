import { useState } from "react";
import { Search, FileText, BookOpen, Loader2, ExternalLink, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  documents: Array<{
    id: string;
    title: string;
    document_type: string;
    summary: string | null;
    similarity: number;
  }>;
  provisions: Array<{
    id: string;
    document_id: string;
    section_number: string | null;
    title: string | null;
    content: string;
    provision_type: string | null;
    similarity: number;
  }>;
}

interface ComplianceSearchPanelProps {
  onDocumentSelect?: (documentId: string) => void;
  onProvisionSelect?: (provisionId: string, documentId: string) => void;
}

export default function ComplianceSearchPanel({
  onDocumentSelect,
  onProvisionSelect,
}: ComplianceSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"all" | "documents" | "provisions">("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compliance-search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            query,
            type: searchType,
            limit: 10,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Search failed");
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const highlightMatch = (text: string, maxLength: number = 200) => {
    if (!text) return "";
    const truncated = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
    return truncated;
  };

  const getSimilarityBadge = (similarity: number) => {
    if (similarity >= 0.8) return { label: "Excellent", color: "bg-green-500/20 text-green-500" };
    if (similarity >= 0.6) return { label: "Good", color: "bg-blue-500/20 text-blue-500" };
    if (similarity >= 0.4) return { label: "Fair", color: "bg-yellow-500/20 text-yellow-500" };
    return { label: "Low", color: "bg-gray-500/20 text-gray-500" };
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search Nigerian tax regulations, provisions, and rules..."
            className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select
          value={searchType}
          onChange={(e) => setSearchType(e.target.value as typeof searchType)}
          className="px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">All</option>
          <option value="documents">Documents</option>
          <option value="provisions">Provisions</option>
        </select>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {/* Documents */}
          {results.documents.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-3 border-b border-border bg-accent/30">
                <h3 className="font-medium text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Documents ({results.documents.length})
                </h3>
              </div>
              <div className="divide-y divide-border">
                {results.documents.map((doc) => {
                  const badge = getSimilarityBadge(doc.similarity);
                  return (
                    <div
                      key={doc.id}
                      className="p-4 hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => onDocumentSelect?.(doc.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded uppercase font-medium">
                              {doc.document_type}
                            </span>
                            <span className={cn("text-xs px-2 py-0.5 rounded", badge.color)}>
                              {Math.round(doc.similarity * 100)}% match
                            </span>
                          </div>
                          <h4 className="font-medium text-foreground">{doc.title}</h4>
                          {doc.summary && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {highlightMatch(doc.summary)}
                            </p>
                          )}
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Provisions */}
          {results.provisions.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-3 border-b border-border bg-accent/30">
                <h3 className="font-medium text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Provisions ({results.provisions.length})
                </h3>
              </div>
              <div className="divide-y divide-border">
                {results.provisions.map((prov) => {
                  const badge = getSimilarityBadge(prov.similarity);
                  return (
                    <div
                      key={prov.id}
                      className="p-4 hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => onProvisionSelect?.(prov.id, prov.document_id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {prov.section_number && (
                              <span className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded font-medium">
                                {prov.section_number}
                              </span>
                            )}
                            {prov.provision_type && (
                              <span className="text-xs px-2 py-0.5 bg-accent text-muted-foreground rounded capitalize">
                                {prov.provision_type}
                              </span>
                            )}
                            <span className={cn("text-xs px-2 py-0.5 rounded", badge.color)}>
                              {Math.round(prov.similarity * 100)}% match
                            </span>
                          </div>
                          {prov.title && (
                            <h4 className="font-medium text-foreground text-sm">{prov.title}</h4>
                          )}
                          <p className="text-sm text-muted-foreground mt-1">
                            {highlightMatch(prov.content, 300)}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No results */}
          {results.documents.length === 0 && results.provisions.length === 0 && (
            <div className="p-8 text-center bg-card border border-border rounded-lg">
              <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No results found for "{query}"</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try different keywords or upload documents to build the knowledge base.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!results && !loading && !error && (
        <div className="p-8 text-center bg-card border border-border rounded-lg">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-foreground font-medium">Semantic Search</p>
          <p className="text-sm text-muted-foreground mt-1">
            Search Nigerian tax laws, regulations, and provisions using natural language.
          </p>
        </div>
      )}
    </div>
  );
}
