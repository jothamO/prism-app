import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Scale,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Sparkles,
  Undo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import PRISMImpactSummaryTab from "@/components/admin/PRISMImpactSummaryTab";

interface PRISMImpactAnalysis {
  summary: string;
  prism_changes_required: {
    category: string;
    description: string;
    priority: string;
    completed?: boolean;
  }[];
  tax_calendar_updates: { deadline: string; description: string; created?: boolean }[];
  education_center_updates: { topic: string; suggested: boolean; created?: boolean }[];
  user_notifications: { required: boolean; message: string };
  ai_confidence: number;
  ai_generated_at: string;
}

type Criticality = 'breaking_change' | 'rate_update' | 'new_requirement' | 'procedural_update' | 'advisory';

interface DateMismatchWarning {
  admin_entered: string;
  ai_extracted: string;
  confidence: string;
  detected_at: string;
}

interface DocumentMetadata {
  processing_completed_at?: string;
  provisions_count?: number;
  rules_count?: number;
  ai_extracted_effective_date?: string | null;
  ai_extracted_publication_date?: string | null;
  date_extraction_confidence?: string;
  date_mismatch_warning?: DateMismatchWarning | null;
}

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
  prism_impact_analysis: PRISMImpactAnalysis | null;
  criticality: Criticality | null;
  impact_reviewed: boolean | null;
  impact_reviewed_at: string | null;
  metadata?: DocumentMetadata | null;
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
  const [activeTab, setActiveTab] = useState<"overview" | "summary" | "provisions" | "rules" | "raw">("overview");
  const [updating, setUpdating] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      
      // Type assertion for JSONB fields
      const typedDoc = {
        ...doc,
        prism_impact_analysis: doc.prism_impact_analysis as PRISMImpactAnalysis | null,
        criticality: doc.criticality as Criticality | null,
        metadata: doc.metadata as DocumentMetadata | null,
      };
      setDocument(typedDoc as LegalDocument);

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

  async function reprocessDocument() {
    if (!document || !document.raw_text) {
      toast({
        title: "Cannot reprocess",
        description: "No raw text available for this document",
        variant: "destructive",
      });
      return;
    }

    setReprocessing(true);
    try {
      // Edge function now handles cleanup internally (idempotent)
      // Call the edge function to reprocess
      const { data, error } = await supabase.functions.invoke("process-compliance-document", {
        body: {
          documentId: document.id,
          extractedText: document.raw_text,
          documentType: document.document_type,
          title: document.title,
        },
      });

      if (error) throw error;

      toast({
        title: "Reprocessing complete",
        description: `Extracted ${data?.provisionsCount || 0} provisions and ${data?.rulesCount || 0} rules`,
      });

      // Refresh the document data
      fetchDocument();
    } catch (error) {
      console.error("Error reprocessing document:", error);
      toast({
        title: "Reprocessing failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setReprocessing(false);
    }
  }

  // Restore a soft-deleted document and its related data
  const restoreDocument = useCallback(async (documentId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const restoredAt = new Date().toISOString();

      // Find the soft-deleted document
      const { data: deletedDoc, error: docError } = await supabase
        .from("deleted_items")
        .select("*")
        .eq("item_type", "legal_document")
        .eq("item_id", documentId)
        .eq("restored", false)
        .single();

      if (docError || !deletedDoc) {
        toast({
          title: "Cannot restore",
          description: "Document has already been permanently deleted or restored",
          variant: "destructive",
        });
        return;
      }

      // Restore the document
      const { error: insertDocError } = await supabase
        .from("legal_documents")
        .insert(deletedDoc.item_data as Record<string, unknown>);

      if (insertDocError) throw insertDocError;

      // Mark document as restored
      await supabase
        .from("deleted_items")
        .update({ restored: true, restored_at: restoredAt, restored_by: user?.id })
        .eq("id", deletedDoc.id);

      // Find and restore related provisions
      const { data: deletedProvisions } = await supabase
        .from("deleted_items")
        .select("*")
        .eq("item_type", "legal_provision")
        .eq("restored", false);

      const matchingProvisions = (deletedProvisions || []).filter(
        (item) => (item.item_data as { document_id?: string })?.document_id === documentId
      );

      for (const item of matchingProvisions) {
        await supabase.from("legal_provisions").insert(item.item_data as Record<string, unknown>);
        await supabase
          .from("deleted_items")
          .update({ restored: true, restored_at: restoredAt, restored_by: user?.id })
          .eq("id", item.id);
      }

      // Find and restore related rules
      const { data: deletedRules } = await supabase
        .from("deleted_items")
        .select("*")
        .eq("item_type", "compliance_rule")
        .eq("restored", false);

      const matchingRules = (deletedRules || []).filter(
        (item) => (item.item_data as { document_id?: string })?.document_id === documentId
      );

      for (const item of matchingRules) {
        await supabase.from("compliance_rules").insert(item.item_data as Record<string, unknown>);
        await supabase
          .from("deleted_items")
          .update({ restored: true, restored_at: restoredAt, restored_by: user?.id })
          .eq("id", item.id);
      }

      toast({
        title: "Document restored",
        description: `Restored document with ${matchingProvisions.length} provisions and ${matchingRules.length} rules`,
      });

      // Navigate back to the document
      navigate(`/admin/compliance/documents/${documentId}`);
      fetchDocument();
    } catch (error) {
      console.error("Error restoring document:", error);
      toast({
        title: "Restore failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [navigate, toast]);

  async function deleteDocument() {
    if (!document) return;

    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes grace period
      const documentId = document.id;

      // 1. Snapshot and soft-delete provisions
      const { data: provisionData } = await supabase
        .from("legal_provisions")
        .select("*")
        .eq("document_id", documentId);

      for (const provision of provisionData || []) {
        await supabase.from("deleted_items").insert({
          item_type: "legal_provision",
          item_id: provision.id,
          item_data: provision,
          deleted_by: user?.id,
          expires_at: expiresAt,
        });
      }

      // Delete provisions from original table
      await supabase.from("legal_provisions").delete().eq("document_id", documentId);

      // 2. Snapshot and soft-delete rules
      const { data: ruleData } = await supabase
        .from("compliance_rules")
        .select("*")
        .eq("document_id", documentId);

      for (const rule of ruleData || []) {
        await supabase.from("deleted_items").insert({
          item_type: "compliance_rule",
          item_id: rule.id,
          item_data: rule,
          deleted_by: user?.id,
          expires_at: expiresAt,
        });
      }

      // Delete rules from original table
      await supabase.from("compliance_rules").delete().eq("document_id", documentId);

      // 3. Snapshot and soft-delete the document
      await supabase.from("deleted_items").insert({
        item_type: "legal_document",
        item_id: documentId,
        item_data: document,
        deleted_by: user?.id,
        expires_at: expiresAt,
      });

      // Delete document from original table
      const { error } = await supabase.from("legal_documents").delete().eq("id", documentId);

      if (error) throw error;

      // Show toast with Undo action
      toast({
        title: "Document deleted",
        description: `You have 5 minutes to undo. ${provisionData?.length || 0} provisions and ${ruleData?.length || 0} rules also removed.`,
        action: (
          <ToastAction altText="Undo deletion" onClick={() => restoreDocument(documentId)}>
            <Undo2 className="w-4 h-4 mr-1" />
            Undo
          </ToastAction>
        ),
      });

      // Navigate back to documents list
      navigate("/admin/compliance/documents");
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  // Update effective date with cascade to all related rules
  async function updateEffectiveDateWithCascade(newDate: string) {
    if (!document) return;
    setUpdating(true);
    try {
      // Update the document's effective date
      const { error: docError } = await supabase
        .from("legal_documents")
        .update({ 
          effective_date: newDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", document.id);

      if (docError) throw docError;

      // Update all associated rules
      const { error: rulesError } = await supabase
        .from("compliance_rules")
        .update({ effective_from: newDate })
        .eq("document_id", document.id);

      if (rulesError) throw rulesError;

      // Clear the date mismatch warning from metadata
      const currentMetadata = document.metadata || {};
      const { date_mismatch_warning, ...cleanMetadata } = currentMetadata;
      
      await supabase
        .from("legal_documents")
        .update({ 
          metadata: cleanMetadata,
          needs_human_review: false,
        })
        .eq("id", document.id);

      toast({
        title: "Effective date updated",
        description: `Document and ${rules.length} rules updated to ${new Date(newDate).toLocaleDateString()}`,
      });

      // Refresh the document data
      fetchDocument();
    } catch (error) {
      console.error("Error updating effective date:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
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
            disabled={reprocessing || !document.raw_text}
            onClick={reprocessDocument}
            title={!document.raw_text ? "No raw text available" : "Re-run AI extraction"}
          >
            <RotateCcw className={cn("w-4 h-4 mr-2", reprocessing && "animate-spin")} />
            {reprocessing ? "Reprocessing..." : "Reprocess"}
          </Button>
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
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">Delete Document?</h3>
            <p className="text-muted-foreground mb-4">
              This will delete "{document.title}" along with {provisions.length} provisions
              and {rules.length} compliance rules. You'll have <strong>5 minutes</strong> to undo this action.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={deleteDocument} disabled={deleting}>
                {deleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Date Mismatch Warning */}
      {document.metadata?.date_mismatch_warning && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
              <div>
                <h3 className="font-medium text-foreground">Effective Date Mismatch Detected</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI found a different date in the document text than what was entered during upload.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-background/50 rounded p-2">
                    <span className="text-muted-foreground">You entered:</span>
                    <div className="font-medium text-foreground">
                      {new Date(document.metadata.date_mismatch_warning.admin_entered).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="bg-background/50 rounded p-2">
                    <span className="text-muted-foreground">AI found in document:</span>
                    <div className="font-medium text-yellow-500">
                      {new Date(document.metadata.date_mismatch_warning.ai_extracted).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Confidence: {document.metadata.date_mismatch_warning.confidence}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={updating}
                onClick={() => {
                  // Clear warning without changing date
                  const currentMetadata = document.metadata || {};
                  const { date_mismatch_warning, ...cleanMetadata } = currentMetadata;
                  supabase
                    .from("legal_documents")
                    .update({ metadata: cleanMetadata, needs_human_review: false })
                    .eq("id", document.id)
                    .then(() => fetchDocument());
                  toast({ title: "Warning dismissed", description: "Keeping the original date" });
                }}
              >
                Keep My Date
              </Button>
              <Button
                size="sm"
                disabled={updating}
                onClick={() => updateEffectiveDateWithCascade(document.metadata!.date_mismatch_warning!.ai_extracted)}
              >
                {updating ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Use AI Date
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {(["overview", "summary", "provisions", "rules", "raw"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize flex items-center gap-2",
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "summary" && <Sparkles className="w-3 h-3" />}
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

        {activeTab === "summary" && (
          <PRISMImpactSummaryTab
            documentId={document.id}
            documentTitle={document.title}
            rawText={document.raw_text}
            documentType={document.document_type}
            prismImpactAnalysis={document.prism_impact_analysis}
            criticality={document.criticality}
            impactReviewed={document.impact_reviewed || false}
            impactReviewedAt={document.impact_reviewed_at}
            onRefresh={fetchDocument}
          />
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
