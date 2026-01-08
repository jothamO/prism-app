import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Scale,
  AlertTriangle,
  Edit,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface LegalDocument {
  id: string;
  title: string;
  document_type: string;
  document_number: string | null;
  status: string;
  effective_date: string | null;
  publication_date: string | null;
  expiry_date: string | null;
  regulatory_body_id: string | null;
  summary: string | null;
  ai_summary: string | null;
  raw_text: string | null;
  source_url: string | null;
  file_url: string | null;
  needs_human_review: boolean | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  tax_types: string[] | null;
  key_provisions: string[] | null;
  created_at: string;
  updated_at: string | null;
  regulatory_bodies?: { abbreviation: string; name: string };
}

interface Provision {
  id: string;
  section_number: string | null;
  title: string | null;
  content: string;
  provision_type: string | null;
  ai_interpretation: string | null;
  tax_implications: string | null;
  keywords: string[] | null;
}

interface ComplianceRule {
  id: string;
  rule_name: string;
  rule_type: string;
  description: string | null;
  rule_code: string | null;
  is_active: boolean | null;
  effective_from: string | null;
  effective_to: string | null;
  priority: number | null;
}

export default function AdminComplianceDocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [provisions, setProvisions] = useState<Provision[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "provisions" | "rules" | "raw">("overview");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (id) fetchDocument();
  }, [id]);

  async function fetchDocument() {
    setLoading(true);
    try {
      // Fetch document
      const { data: doc, error: docError } = await supabase
        .from("legal_documents")
        .select(`
          *,
          regulatory_bodies (abbreviation, name)
        `)
        .eq("id", id)
        .single();

      if (docError) throw docError;
      setDocument(doc as LegalDocument);

      // Fetch provisions
      const { data: provs } = await supabase
        .from("legal_provisions")
        .select("*")
        .eq("document_id", id)
        .order("section_number");
      setProvisions(provs || []);

      // Fetch rules
      const { data: rls } = await supabase
        .from("compliance_rules")
        .select("*")
        .eq("document_id", id)
        .order("priority", { ascending: false });
      setRules(rls || []);
    } catch (error) {
      console.error("Error fetching document:", error);
      toast({
        title: "Error",
        description: "Failed to load document",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!document) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("legal_documents")
        .update({ 
          status: newStatus,
          needs_human_review: false,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", document.id);

      if (error) throw error;

      setDocument({ ...document, status: newStatus, needs_human_review: false });
      toast({
        title: "Status updated",
        description: `Document is now ${newStatus}`,
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  }

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/20 text-green-500";
      case "draft": return "bg-gray-500/20 text-gray-500";
      case "pending_review": return "bg-yellow-500/20 text-yellow-500";
      case "archived": return "bg-red-500/20 text-red-500";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Document not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/compliance/documents")}>
          Back to Documents
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/compliance" className="hover:text-foreground">Knowledge Base</Link>
        <span>/</span>
        <Link to="/admin/compliance/documents" className="hover:text-foreground">Documents</Link>
        <span>/</span>
        <span className="text-foreground truncate max-w-[200px]">{document.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/compliance/documents")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-foreground">{document.title}</h1>
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusBadgeColor(document.status || "draft"))}>
                {document.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {document.regulatory_bodies && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  {document.regulatory_bodies.abbreviation}
                </span>
              )}
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {document.document_type}
              </span>
              {document.effective_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Effective: {new Date(document.effective_date).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {document.needs_human_review && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-500 text-sm">
              <AlertTriangle className="w-4 h-4" />
              Needs Review
            </div>
          )}
          <Button
            variant="outline"
            disabled={updating}
            onClick={() => updateStatus("active")}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Approve
          </Button>
          <Button
            variant="outline"
            disabled={updating}
            onClick={() => updateStatus("archived")}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Archive
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {(["overview", "provisions", "rules", "raw"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize",
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "raw" ? "Raw Text" : tab}
              {tab === "provisions" && ` (${provisions.length})`}
              {tab === "rules" && ` (${rules.length})`}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-card border border-border rounded-lg p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* AI Summary */}
            {document.ai_summary && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  AI Summary
                </h3>
                <p className="text-muted-foreground">{document.ai_summary}</p>
              </div>
            )}

            {/* Key Provisions */}
            {document.key_provisions && document.key_provisions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Key Provisions</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {document.key_provisions.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tax Types */}
            {document.tax_types && document.tax_types.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Applicable Tax Types</h3>
                <div className="flex flex-wrap gap-2">
                  {document.tax_types.map((t, i) => (
                    <span key={i} className="px-2 py-1 bg-primary/10 text-primary rounded text-sm">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Document Number</p>
                <p className="text-sm text-foreground">{document.document_number || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Publication Date</p>
                <p className="text-sm text-foreground">
                  {document.publication_date ? new Date(document.publication_date).toLocaleDateString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm text-foreground">{new Date(document.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-sm text-foreground">
                  {document.updated_at ? new Date(document.updated_at).toLocaleDateString() : "—"}
                </p>
              </div>
            </div>

            {/* Source Links */}
            {(document.source_url || document.file_url) && (
              <div className="flex gap-4 pt-4 border-t border-border">
                {document.source_url && (
                  <a
                    href={document.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Source URL
                  </a>
                )}
                {document.file_url && (
                  <a
                    href={document.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileText className="w-4 h-4" />
                    Download File
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "provisions" && (
          <div className="space-y-4">
            {provisions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No provisions extracted yet</p>
            ) : (
              provisions.map((prov) => (
                <div key={prov.id} className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      {prov.section_number && (
                        <span className="text-xs font-mono text-primary mr-2">{prov.section_number}</span>
                      )}
                      <span className="font-medium text-foreground">{prov.title || "Untitled Provision"}</span>
                    </div>
                    {prov.provision_type && (
                      <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                        {prov.provision_type}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{prov.content}</p>
                  {prov.ai_interpretation && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold">AI Interpretation:</span> {prov.ai_interpretation}
                      </p>
                    </div>
                  )}
                  {prov.keywords && prov.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {prov.keywords.map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "rules" && (
          <div className="space-y-4">
            {rules.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No compliance rules generated yet</p>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{rule.rule_name}</span>
                      {rule.rule_code && (
                        <span className="text-xs font-mono text-muted-foreground">[{rule.rule_code}]</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs",
                        rule.is_active ? "bg-green-500/20 text-green-500" : "bg-gray-500/20 text-gray-500"
                      )}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                      <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                        {rule.rule_type}
                      </span>
                    </div>
                  </div>
                  {rule.description && (
                    <p className="text-sm text-muted-foreground">{rule.description}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    {rule.effective_from && <span>From: {new Date(rule.effective_from).toLocaleDateString()}</span>}
                    {rule.effective_to && <span>To: {new Date(rule.effective_to).toLocaleDateString()}</span>}
                    {rule.priority != null && <span>Priority: {rule.priority}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "raw" && (
          <div>
            {document.raw_text ? (
              <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted/30 p-4 rounded-lg max-h-[600px] overflow-y-auto">
                {document.raw_text}
              </pre>
            ) : (
              <p className="text-muted-foreground text-center py-8">No raw text available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
