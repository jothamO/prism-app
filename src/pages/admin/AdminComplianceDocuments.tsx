import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
    Upload,
    FileText,
    Clock,
    CheckCircle2,
    XCircle,
    RefreshCw,
    Eye,
    Trash2,
    Filter,
    Search,
    ChevronRight,
    Building2,
    Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface LegalDocument {
    id: string;
    title: string;
    document_type: string;
    official_reference: string | null;
    status: string;
    review_status: string;
    effective_date: string | null;
    publication_date: string | null;
    regulatory_body_id: string | null;
    summary: string | null;
    created_at: string;
    regulatory_bodies?: { id: string; abbreviation: string; name: string };
}

interface RegulatoryBody {
    id: string;
    abbreviation: string;
    name: string;
}

const DOCUMENT_TYPES = [
    { value: "act", label: "Primary Legislation (Act)" },
    { value: "regulation", label: "Secondary Legislation (Regulation)" },
    { value: "circular", label: "Circular" },
    { value: "practice_note", label: "Practice Note" },
    { value: "guideline", label: "Guideline" },
    { value: "court_ruling", label: "Court Ruling" },
    { value: "treaty", label: "International Treaty" },
];

// Helper function to get MIME type from file extension
const getMimeType = (fileName: string): string => {
    const ext = fileName.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain',
        'md': 'text/markdown'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
};

export default function AdminComplianceDocuments() {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [searchParams] = useSearchParams();

    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<LegalDocument[]>([]);
    const [regulatoryBodies, setRegulatoryBodies] = useState<RegulatoryBody[]>([]);
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterBody, setFilterBody] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");

    // Upload modal state
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadForm, setUploadForm] = useState({
        regulatoryBodyId: "",
        documentType: "circular",
        title: "",
        officialReference: "",
        publicationDate: "",
        effectiveDate: "",
        amendsExisting: false,
        supersededDocId: "",
        isUrgent: false,
    });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Handle URL query parameters
    useEffect(() => {
        const action = searchParams.get("action");
        const filter = searchParams.get("filter");
        const body = searchParams.get("body");

        if (action === "new") {
            setShowUploadModal(true);
        }
        if (filter === "pending") {
            setFilterStatus("pending_review");
        }
        if (body) {
            // Will be applied after regulatory bodies are loaded
            setFilterBody(body);
        }
    }, [searchParams]);

    useEffect(() => {
        fetchData();
    }, [filterStatus, filterBody]);

    async function fetchData() {
        setLoading(true);
        try {
            // Fetch regulatory bodies
            const { data: bodies } = await supabase
                .from("regulatory_bodies")
                .select("id, abbreviation, name")
                .order("abbreviation");
            setRegulatoryBodies(bodies || []);

            // Fetch documents with filters
            let query = supabase
                .from("legal_documents")
                .select(`
          id, title, document_type, official_reference, status, review_status,
          effective_date, publication_date, regulatory_body_id, summary, created_at,
          regulatory_bodies (abbreviation, name)
        `)
                .order("created_at", { ascending: false });

            if (filterStatus !== "all") {
                query = query.eq("status", filterStatus);
            }
            if (filterBody !== "all") {
                query = query.eq("regulatory_body_id", filterBody);
            }

            const { data: docs } = await query;
            setDocuments(docs || []);
        } catch (error) {
            console.error("Error fetching documents:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleUpload() {
        if (!selectedFile || !uploadForm.title || !uploadForm.regulatoryBodyId) {
            toast({
                title: "Missing fields",
                description: "Please fill in all required fields and select a file.",
                variant: "destructive",
            });
            return;
        }

        setUploading(true);
        try {
            // 1. Upload file to Supabase Storage with explicit content type
            const contentType = getMimeType(selectedFile.name);
            const fileName = `compliance/${Date.now()}_${selectedFile.name}`;
            const { error: uploadError } = await supabase.storage
                .from("documents")
                .upload(fileName, selectedFile, {
                    contentType: contentType,
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from("documents")
                .getPublicUrl(fileName);

            // 2. Extract text based on file type
            let extractedText = "";
            if (selectedFile.type === "text/plain" || 
                selectedFile.type === "text/markdown" || 
                selectedFile.type === "text/x-markdown" ||
                selectedFile.name.endsWith('.md')) {
                extractedText = await selectedFile.text();
            } else if (selectedFile.type === "application/pdf" || selectedFile.name.endsWith('.pdf')) {
                // Convert PDF to base64 and call document-ocr for text extraction
                toast({
                    title: "Extracting text from PDF...",
                    description: "This may take a moment.",
                });
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(selectedFile);
                    reader.onload = () => {
                        const result = reader.result as string;
                        resolve(result.split(',')[1]); // Remove data:mime;base64, prefix
                    };
                    reader.onerror = reject;
                });
                const { data: ocrResult, error: ocrError } = await supabase.functions.invoke(
                    "document-ocr",
                    { body: { image: base64, documentType: "legal_document" } }
                );
                if (ocrError) {
                    console.error("OCR error:", ocrError);
                    extractedText = `[PDF OCR failed - manual text entry required]`;
                } else if (ocrResult?.data?.text) {
                    extractedText = ocrResult.data.text;
                } else {
                    extractedText = `[PDF processing incomplete - review required]`;
                }
            } else {
                // For DOCX and other formats
                extractedText = `[Document content from: ${selectedFile.name}]`;
            }

            // 3. Create document record
            const { data: newDoc, error: insertError } = await supabase
                .from("legal_documents")
                .insert({
                    regulatory_body_id: uploadForm.regulatoryBodyId,
                    document_type: uploadForm.documentType,
                    title: uploadForm.title,
                    document_number: uploadForm.officialReference || null,
                    publication_date: uploadForm.publicationDate || null,
                    effective_date: uploadForm.effectiveDate || null,
                    file_url: urlData.publicUrl,
                    raw_text: extractedText,
                    status: "pending",
                    needs_human_review: true,
                    metadata: {
                        version: "1.0",
                        supersedes_id: uploadForm.amendsExisting ? uploadForm.supersededDocId : null,
                        uploaded_by: "admin",
                        upload_timestamp: new Date().toISOString()
                    }
                })
                .select()
                .single();

            if (insertError) throw insertError;

            // 4. Call processing edge function
            toast({
                title: "Processing document...",
                description: "AI is extracting provisions and generating rules.",
            });

            const { error: processError } = await supabase.functions.invoke(
                "process-compliance-document",
                {
                    body: {
                        documentId: newDoc.id,
                        extractedText,
                        documentType: uploadForm.documentType,
                        title: uploadForm.title,
                    },
                }
            );

            if (processError) {
                console.error("Processing error:", processError);
                toast({
                    title: "Processing warning",
                    description: "Document uploaded but AI processing may have failed. Check the review queue.",
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "Document uploaded",
                    description: "AI has processed the document. Check the review queue.",
                });
            }

            setShowUploadModal(false);
            setSelectedFile(null);
            setUploadForm({
                regulatoryBodyId: "",
                documentType: "circular",
                title: "",
                officialReference: "",
                publicationDate: "",
                effectiveDate: "",
                amendsExisting: false,
                supersededDocId: "",
                isUrgent: false,
            });
            fetchData();
        } catch (error) {
            console.error("Upload error:", error);
            toast({
                title: "Upload failed",
                description: error instanceof Error ? error.message : "Unknown error",
                variant: "destructive",
            });
        } finally {
            setUploading(false);
        }
    }

    const filteredDocuments = documents.filter((doc) =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.official_reference?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const statusBadgeColor = (status: string) => {
        switch (status) {
            case "active": return "bg-green-500/20 text-green-500";
            case "draft": return "bg-gray-500/20 text-gray-500";
            case "pending": return "bg-yellow-500/20 text-yellow-500";
            case "repealed": return "bg-red-500/20 text-red-500";
            default: return "bg-muted text-muted-foreground";
        }
    };

    const reviewBadgeColor = (status: string) => {
        switch (status) {
            case "approved": return "bg-green-500/20 text-green-500";
            case "pending": return "bg-yellow-500/20 text-yellow-500";
            case "rejected": return "bg-red-500/20 text-red-500";
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Legal Documents</h1>
                    <p className="text-muted-foreground">Manage Nigerian tax regulations and compliance documents</p>
                </div>
                <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                    <Upload className="w-4 h-4" />
                    Upload Document
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search documents..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
                >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="repealed">Repealed</option>
                </select>
                <select
                    value={filterBody}
                    onChange={(e) => setFilterBody(e.target.value)}
                    className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
                >
                    <option value="all">All Bodies</option>
                    {regulatoryBodies.map((body) => (
                        <option key={body.id} value={body.id}>{body.abbreviation}</option>
                    ))}
                </select>
            </div>

            {/* Documents List */}
            <div className="bg-card border border-border rounded-lg">
                <div className="p-4 border-b border-border">
                    <p className="text-sm text-muted-foreground">{filteredDocuments.length} documents</p>
                </div>
                <div className="divide-y divide-border">
                    {filteredDocuments.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            No documents found. Upload your first regulation.
                        </div>
                    ) : (
                        filteredDocuments.map((doc) => (
                            <div
                                key={doc.id}
                                className="p-4 hover:bg-accent/30 transition-colors cursor-pointer"
                                onClick={() => window.location.href = `/admin/compliance/documents/${doc.id}`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <FileText className="w-4 h-4 text-muted-foreground" />
                                            <h3 className="font-medium text-foreground">{doc.title}</h3>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                            {doc.regulatory_bodies && (
                                                <span className="flex items-center gap-1">
                                                    <Building2 className="w-3 h-3" />
                                                    {doc.regulatory_bodies.abbreviation}
                                                </span>
                                            )}
                                            <span>{doc.document_type}</span>
                                            {doc.effective_date && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {new Date(doc.effective_date).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        {doc.summary && (
                                            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{doc.summary}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusBadgeColor(doc.status))}>
                                            {doc.status}
                                        </span>
                                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", reviewBadgeColor(doc.review_status))}>
                                            {doc.review_status}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
                        <div className="p-4 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground">Upload New Regulation</h2>
                        </div>
                        <div className="p-4 space-y-4">
                            {/* Regulatory Body */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Regulatory Body *</label>
                                <select
                                    value={uploadForm.regulatoryBodyId}
                                    onChange={(e) => setUploadForm({ ...uploadForm, regulatoryBodyId: e.target.value })}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                                >
                                    <option value="">Select...</option>
                                    {regulatoryBodies.map((body) => (
                                        <option key={body.id} value={body.id}>{body.abbreviation} - {body.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Document Type */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Document Type *</label>
                                <select
                                    value={uploadForm.documentType}
                                    onChange={(e) => setUploadForm({ ...uploadForm, documentType: e.target.value })}
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                                >
                                    {DOCUMENT_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Title *</label>
                                <input
                                    type="text"
                                    value={uploadForm.title}
                                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                                    placeholder="e.g., Nigeria Tax Act 2025"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
                                />
                            </div>

                            {/* Official Reference */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Official Reference</label>
                                <input
                                    type="text"
                                    value={uploadForm.officialReference}
                                    onChange={(e) => setUploadForm({ ...uploadForm, officialReference: e.target.value })}
                                    placeholder="e.g., CBN/PSM/DIR/PUB/01/044"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
                                />
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Publication Date</label>
                                    <input
                                        type="date"
                                        value={uploadForm.publicationDate}
                                        onChange={(e) => setUploadForm({ ...uploadForm, publicationDate: e.target.value })}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Effective Date</label>
                                    <input
                                        type="date"
                                        value={uploadForm.effectiveDate}
                                        onChange={(e) => setUploadForm({ ...uploadForm, effectiveDate: e.target.value })}
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                                    />
                                </div>
                            </div>

                            {/* File Upload */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Document File *</label>
                                <div
                                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {selectedFile ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <FileText className="w-5 h-5 text-primary" />
                                            <span className="text-foreground">{selectedFile.name}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                            <p className="text-muted-foreground">Click to upload or drag & drop</p>
                                            <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, or MD</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.docx,.txt,.md"
                                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                    className="hidden"
                                />
                            </div>

                            {/* Options */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={uploadForm.amendsExisting}
                                        onChange={(e) => setUploadForm({ ...uploadForm, amendsExisting: e.target.checked })}
                                        className="rounded border-border"
                                    />
                                    <span className="text-sm text-foreground">This amends/supersedes existing regulation</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={uploadForm.isUrgent}
                                        onChange={(e) => setUploadForm({ ...uploadForm, isUrgent: e.target.checked })}
                                        className="rounded border-border"
                                    />
                                    <span className="text-sm text-foreground">Urgent/Emergency update</span>
                                </label>
                            </div>
                        </div>
                        <div className="p-4 border-t border-border flex justify-end gap-3">
                            <button
                                onClick={() => setShowUploadModal(false)}
                                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={uploading}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {uploading && <RefreshCw className="w-4 h-4 animate-spin" />}
                                {uploading ? "Processing..." : "Upload & Process"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
