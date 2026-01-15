import { useState, useEffect } from "react";
import {
    FileText,
    CheckCircle2,
    Clock,
    AlertCircle,
    RefreshCw,
    Eye,
    RotateCcw,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DocumentPart {
    id: string;
    part_number: number;
    part_title: string | null;
    file_url: string | null;
    raw_text: string | null;
    status: string;
    provisions_count: number;
    rules_count: number;
    created_at: string;
    processed_at: string | null;
    metadata: Record<string, unknown> | null;
}

interface DocumentPartsViewProps {
    documentId: string;
    onReprocessComplete?: () => void;
}

export default function DocumentPartsView({ documentId, onReprocessComplete }: DocumentPartsViewProps) {
    const { toast } = useToast();
    const [parts, setParts] = useState<DocumentPart[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedPart, setExpandedPart] = useState<string | null>(null);
    const [reprocessingPart, setReprocessingPart] = useState<string | null>(null);

    useEffect(() => {
        fetchParts();
    }, [documentId]);

    async function fetchParts() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("document_parts")
                .select("*")
                .eq("parent_document_id", documentId)
                .order("part_number");

            if (error) throw error;
            setParts(data || []);
        } catch (error) {
            console.error("Error fetching parts:", error);
        } finally {
            setLoading(false);
        }
    }

    async function reprocessPart(partId: string) {
        setReprocessingPart(partId);
        try {
            // Update part status to processing
            await supabase
                .from("document_parts")
                .update({ status: "processing" })
                .eq("id", partId);

            // Trigger reprocessing (we'll use the single part reprocess endpoint)
            const { error } = await supabase.functions.invoke("process-multipart-document", {
                body: {
                    documentId,
                    reprocessPartId: partId,
                },
            });

            if (error) throw error;

            toast({
                title: "Reprocessing started",
                description: "The part is being reprocessed. Refresh to see results.",
            });

            // Refresh parts list
            fetchParts();
            onReprocessComplete?.();
        } catch (error) {
            console.error("Reprocess error:", error);
            toast({
                title: "Reprocess failed",
                description: error instanceof Error ? error.message : "Unknown error",
                variant: "destructive",
            });
        } finally {
            setReprocessingPart(null);
        }
    }

    const statusIcon = (status: string) => {
        switch (status) {
            case "processed":
                return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case "processing":
                return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
            case "failed":
                return <AlertCircle className="w-4 h-4 text-red-500" />;
            default:
                return <Clock className="w-4 h-4 text-yellow-500" />;
        }
    };

    const statusBadgeColor = (status: string) => {
        switch (status) {
            case "processed":
                return "bg-green-500/20 text-green-500";
            case "processing":
                return "bg-blue-500/20 text-blue-500";
            case "failed":
                return "bg-red-500/20 text-red-500";
            default:
                return "bg-yellow-500/20 text-yellow-500";
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (parts.length === 0) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                No parts found for this document.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{parts.length}</p>
                    <p className="text-xs text-muted-foreground">Total Parts</p>
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold text-green-500">
                        {parts.filter((p) => p.status === "processed").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Processed</p>
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">
                        {parts.reduce((sum, p) => sum + (p.provisions_count || 0), 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Provisions</p>
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">
                        {parts.reduce((sum, p) => sum + (p.rules_count || 0), 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Rules</p>
                </div>
            </div>

            {/* Parts List */}
            <div className="divide-y divide-border border border-border rounded-lg">
                {parts.map((part) => (
                    <div key={part.id} className="bg-card">
                        {/* Part Header */}
                        <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/30 transition-colors"
                            onClick={() => setExpandedPart(expandedPart === part.id ? null : part.id)}
                        >
                            <div className="flex items-center gap-3">
                                <span className="w-8 h-8 flex items-center justify-center bg-primary/20 text-primary rounded-full text-sm font-bold">
                                    {part.part_number}
                                </span>
                                <div>
                                    <h4 className="font-medium text-foreground">
                                        {part.part_title || `Part ${part.part_number}`}
                                    </h4>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span>{part.provisions_count || 0} provisions</span>
                                        <span>•</span>
                                        <span>{part.rules_count || 0} rules</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span
                                    className={cn(
                                        "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                                        statusBadgeColor(part.status)
                                    )}
                                >
                                    {statusIcon(part.status)}
                                    {part.status}
                                </span>
                                {expandedPart === part.id ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                            </div>
                        </div>

                        {/* Expanded Content */}
                        {expandedPart === part.id && (
                            <div className="px-4 pb-4 space-y-4">
                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    {part.file_url && (
                                        <a
                                            href={part.file_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-background border border-border rounded-lg hover:bg-accent transition-colors"
                                        >
                                            <Eye className="w-4 h-4" />
                                            View File
                                        </a>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            reprocessPart(part.id);
                                        }}
                                        disabled={reprocessingPart === part.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-background border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
                                    >
                                        {reprocessingPart === part.id ? (
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <RotateCcw className="w-4 h-4" />
                                        )}
                                        Reprocess Part
                                    </button>
                                </div>

                                {/* Raw Text Preview */}
                                {part.raw_text && (
                                    <div className="bg-muted/50 rounded-lg p-4">
                                        <p className="text-xs font-medium text-muted-foreground mb-2">
                                            Content Preview (first 500 chars)
                                        </p>
                                        <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">
                                            {part.raw_text.substring(0, 500)}
                                            {part.raw_text.length > 500 && "..."}
                                        </pre>
                                    </div>
                                )}

                                {/* Metadata */}
                                {part.processed_at && (
                                    <p className="text-xs text-muted-foreground">
                                        Processed: {new Date(part.processed_at).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
