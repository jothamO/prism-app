import { useState, useRef, useCallback } from "react";
import {
    Upload,
    FileText,
    X,
    GripVertical,
    RefreshCw,
    Layers,
    AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RegulatoryBody {
    id: string;
    abbreviation: string;
    name: string;
}

interface UploadedFile {
    file: File;
    partNumber: number;
    partTitle: string;
}

interface MultiPartUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    regulatoryBodies: RegulatoryBody[];
    documentTypes: { value: string; label: string }[];
}

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

// Extract part number from filename (e.g., "part1.md", "chapter_02.md", "section-3.md")
function extractPartNumber(filename: string): number | null {
    const patterns = [
        /part[_-]?(\d+)/i,
        /chapter[_-]?(\d+)/i,
        /section[_-]?(\d+)/i,
        /(\d+)$/,
    ];
    for (const pattern of patterns) {
        const match = filename.match(pattern);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    return null;
}

// Extract part title from filename and content
function extractPartTitle(filename: string, content: string): string {
    // Try to extract from first heading in content
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
        return headingMatch[1].trim();
    }
    // Fall back to filename
    return filename.replace(/\.(md|txt|pdf)$/i, '').replace(/[_-]/g, ' ');
}

export default function MultiPartUploadModal({
    isOpen,
    onClose,
    onSuccess,
    regulatoryBodies,
    documentTypes,
}: MultiPartUploadModalProps) {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const [uploadForm, setUploadForm] = useState({
        regulatoryBodyId: "",
        documentType: "act",
        title: "",
        officialReference: "",
        publicationDate: "",
        effectiveDate: "",
        processingStrategy: "sequential" as "sequential" | "parallel",
    });

    const handleFileSelect = useCallback(async (files: FileList | null) => {
        if (!files) return;

        const fileArray = Array.from(files);
        const processedFiles: UploadedFile[] = [];

        for (const file of fileArray) {
            let partNumber = extractPartNumber(file.name);
            let partTitle = file.name;

            // If it's a text/markdown file, try to extract title from content
            if (file.type === "text/plain" || file.type === "text/markdown" || file.name.endsWith('.md')) {
                const content = await file.text();
                partTitle = extractPartTitle(file.name, content);
            }

            processedFiles.push({
                file,
                partNumber: partNumber || processedFiles.length + 1,
                partTitle,
            });
        }

        // Sort by part number
        processedFiles.sort((a, b) => a.partNumber - b.partNumber);

        // Renumber to ensure sequential
        processedFiles.forEach((f, i) => {
            f.partNumber = i + 1;
        });

        setUploadedFiles(processedFiles);
    }, []);

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newFiles = [...uploadedFiles];
        const [draggedItem] = newFiles.splice(draggedIndex, 1);
        newFiles.splice(index, 0, draggedItem);

        // Renumber
        newFiles.forEach((f, i) => {
            f.partNumber = i + 1;
        });

        setUploadedFiles(newFiles);
        setDraggedIndex(index);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const removeFile = (index: number) => {
        const newFiles = uploadedFiles.filter((_, i) => i !== index);
        newFiles.forEach((f, i) => {
            f.partNumber = i + 1;
        });
        setUploadedFiles(newFiles);
    };

    const handleUpload = async () => {
        if (uploadedFiles.length === 0 || !uploadForm.title || !uploadForm.regulatoryBodyId) {
            toast({
                title: "Missing fields",
                description: "Please fill in all required fields and select at least one file.",
                variant: "destructive",
            });
            return;
        }

        setUploading(true);
        try {
            // 1. Create parent document
            const { data: parentDoc, error: parentError } = await supabase
                .from("legal_documents")
                .insert({
                    regulatory_body_id: uploadForm.regulatoryBodyId,
                    document_type: uploadForm.documentType,
                    title: uploadForm.title,
                    document_number: uploadForm.officialReference || null,
                    publication_date: uploadForm.publicationDate || null,
                    effective_date: uploadForm.effectiveDate || null,
                    is_multi_part: true,
                    total_parts: uploadedFiles.length,
                    parts_received: 0,
                    processing_strategy: uploadForm.processingStrategy,
                    status: "processing",
                    needs_human_review: true,
                    metadata: {
                        version: "1.0",
                        uploaded_by: "admin",
                        upload_timestamp: new Date().toISOString(),
                    },
                })
                .select()
                .single();

            if (parentError) throw parentError;

            toast({
                title: "Uploading parts...",
                description: `Uploading ${uploadedFiles.length} parts`,
            });

            // 2. Upload each file and create document_parts records
            const allTexts: string[] = [];
            for (const uploadedFile of uploadedFiles) {
                const { file, partNumber, partTitle } = uploadedFile;

                // Upload to storage
                const contentType = getMimeType(file.name);
                const fileName = `compliance/${parentDoc.id}/part${partNumber}_${file.name}`;
                const { error: uploadError } = await supabase.storage
                    .from("documents")
                    .upload(fileName, file, {
                        contentType: contentType,
                        upsert: false,
                    });

                if (uploadError) {
                    console.error(`Error uploading part ${partNumber}:`, uploadError);
                    continue;
                }

                const { data: urlData } = supabase.storage
                    .from("documents")
                    .getPublicUrl(fileName);

                // Extract text
                let rawText = "";
                if (file.type === "text/plain" || file.type === "text/markdown" || file.name.endsWith('.md')) {
                    rawText = await file.text();
                } else {
                    rawText = `[Content from: ${file.name}]`;
                }

                allTexts.push(`--- PART ${partNumber}: ${partTitle} ---\n${rawText}`);

                // Create part record
                await supabase.from("document_parts").insert({
                    parent_document_id: parentDoc.id,
                    part_number: partNumber,
                    part_title: partTitle,
                    file_url: urlData.publicUrl,
                    raw_text: rawText,
                    status: "pending",
                });
            }

            // 3. Update parent with combined text and parts_received count
            const combinedText = allTexts.join("\n\n");
            await supabase
                .from("legal_documents")
                .update({
                    raw_text: combinedText,
                    parts_received: uploadedFiles.length,
                })
                .eq("id", parentDoc.id);

            // 4. Trigger processing
            supabase.functions
                .invoke("process-multipart-document", {
                    body: { documentId: parentDoc.id },
                })
                .catch((err) => {
                    console.error("Background processing error:", err);
                });

            toast({
                title: "Multi-part document uploaded",
                description: `${uploadedFiles.length} parts uploaded. AI processing started.`,
            });

            // Reset and close
            setUploadedFiles([]);
            setUploadForm({
                regulatoryBodyId: "",
                documentType: "act",
                title: "",
                officialReference: "",
                publicationDate: "",
                effectiveDate: "",
                processingStrategy: "sequential",
            });
            onSuccess();
            onClose();
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
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">Upload Multi-Part Regulation</h2>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Info Banner */}
                    <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-400">
                            <p className="font-medium">Multi-Part Upload</p>
                            <p className="text-blue-400/80">
                                Upload multiple files that together form a single regulation (e.g., Nigeria Tax Act split into 10 parts).
                                Files will be processed together with deduplication.
                            </p>
                        </div>
                    </div>

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
                                <option key={body.id} value={body.id}>
                                    {body.abbreviation} - {body.name}
                                </option>
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
                            {documentTypes.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Regulation Title *</label>
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
                            placeholder="e.g., Act No. 1 of 2025"
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

                    {/* Processing Strategy */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Processing Strategy</label>
                        <select
                            value={uploadForm.processingStrategy}
                            onChange={(e) =>
                                setUploadForm({ ...uploadForm, processingStrategy: e.target.value as "sequential" | "parallel" })
                            }
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                        >
                            <option value="sequential">Sequential (recommended for related parts)</option>
                            <option value="parallel">Parallel (faster, for independent parts)</option>
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">
                            Sequential: Processes parts in order, accumulating context. Parallel: Processes all parts simultaneously.
                        </p>
                    </div>

                    {/* Multi-file Upload Zone */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Document Parts *</label>
                        <div
                            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                handleFileSelect(e.dataTransfer.files);
                            }}
                        >
                            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-muted-foreground">Click or drag to upload multiple files</p>
                            <p className="text-xs text-muted-foreground mt-1">Supports MD, TXT (PDF coming soon)</p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".md,.txt"
                            onChange={(e) => handleFileSelect(e.target.files)}
                            className="hidden"
                        />
                    </div>

                    {/* Uploaded Files List (Reorderable) */}
                    {uploadedFiles.length > 0 && (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground">
                                Parts Order ({uploadedFiles.length} files)
                            </label>
                            <p className="text-xs text-muted-foreground mb-2">Drag to reorder parts</p>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {uploadedFiles.map((uploadedFile, index) => (
                                    <div
                                        key={`${uploadedFile.file.name}-${index}`}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDragEnd={handleDragEnd}
                                        className={cn(
                                            "flex items-center gap-3 p-3 bg-background border border-border rounded-lg",
                                            draggedIndex === index && "opacity-50"
                                        )}
                                    >
                                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                                        <span className="w-8 h-8 flex items-center justify-center bg-primary/20 text-primary rounded-full text-sm font-medium">
                                            {uploadedFile.partNumber}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{uploadedFile.partTitle}</p>
                                            <p className="text-xs text-muted-foreground truncate">{uploadedFile.file.name}</p>
                                        </div>
                                        <button
                                            onClick={() => removeFile(index)}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={uploading || uploadedFiles.length === 0}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {uploading && <RefreshCw className="w-4 h-4 animate-spin" />}
                        {uploading ? "Uploading..." : `Upload ${uploadedFiles.length} Parts`}
                    </button>
                </div>
            </div>
        </div>
    );
}
