import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  FileText,
  Cpu,
  BookOpen,
  Scale,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCcw,
  Timer,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ProcessingEvent {
  id: string;
  document_id: string;
  part_id: string | null;
  event_type: "started" | "stage_started" | "stage_completed" | "completed" | "failed" | "retried" | "warning";
  stage: string | null;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  message: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface DocumentPart {
  id: string;
  part_number: number;
  part_title: string | null;
  status: string;
  provisions_count: number | null;
  rules_count: number | null;
  processed_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface ProcessingStatusTabProps {
  documentId: string;
  documentTitle: string;
  documentStatus: string;
  isMultiPart: boolean;
  processingStartedAt?: string | null;
  processingCompletedAt?: string | null;
  currentStage?: string | null;
  processingProgress?: number;
  onRefresh: () => void;
}

// Define processing stages
const PROCESSING_STAGES = [
  { key: "upload", label: "Upload", icon: FileText },
  { key: "text_extraction", label: "Text Extraction", icon: FileText },
  { key: "provision_extraction", label: "Provisions", icon: BookOpen },
  { key: "rules_extraction", label: "Rules", icon: Scale },
  { key: "summary_generation", label: "Summary", icon: Sparkles },
  { key: "prism_impact", label: "PRISM Impact", icon: Zap },
];

export default function DocumentProcessingStatusTab({
  documentId,
  documentTitle,
  documentStatus,
  isMultiPart,
  processingStartedAt,
  processingCompletedAt,
  currentStage,
  processingProgress = 0,
  onRefresh,
}: ProcessingStatusTabProps) {
  const { toast } = useToast();
  const [events, setEvents] = useState<ProcessingEvent[]>([]);
  const [parts, setParts] = useState<DocumentPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [reprocessingPart, setReprocessingPart] = useState<string | null>(null);

  const isProcessing = documentStatus === "processing";

  // Calculate derived state
  const completedStages = events
    .filter((e) => e.event_type === "stage_completed" && e.status === "completed")
    .map((e) => e.stage);

  const failedStages = events
    .filter((e) => e.event_type === "failed" || e.status === "failed")
    .map((e) => e.stage);

  const inProgressStage = events
    .filter((e) => e.event_type === "stage_started" && e.status === "in_progress")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.stage;

  // Get the processing mode from the most recent 'started' event
  const latestStartedEvent = events.find((e) => e.event_type === "started");
  const processingMode = (latestStartedEvent?.details?.processing_mode as string) || null;

  // Fetch processing events and parts
  const fetchData = useCallback(async () => {
    try {
      // Fetch events
      const { data: eventsData, error: eventsError } = await supabase
        .from("document_processing_events")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (eventsError) throw eventsError;
      setEvents((eventsData || []) as ProcessingEvent[]);

      // Fetch parts if multi-part
      if (isMultiPart) {
        const { data: partsData, error: partsError } = await supabase
          .from("document_parts")
          .select("*")
          .eq("parent_document_id", documentId)
          .order("part_number");

        if (partsError) throw partsError;
        setParts((partsData || []) as DocumentPart[]);
      }
    } catch (error) {
      console.error("Error fetching processing data:", error);
    } finally {
      setLoading(false);
    }
  }, [documentId, isMultiPart]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscription for events
  useEffect(() => {
    const channel = supabase
      .channel(`processing-events-${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "document_processing_events",
          filter: `document_id=eq.${documentId}`,
        },
        (payload) => {
          setEvents((prev) => [payload.new as ProcessingEvent, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId]);

  // Real-time subscription for parts status changes
  useEffect(() => {
    if (!isMultiPart) return;

    const channel = supabase
      .channel(`processing-parts-${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "document_parts",
          filter: `parent_document_id=eq.${documentId}`,
        },
        (payload) => {
          setParts((prev) =>
            prev.map((p) => (p.id === payload.new.id ? (payload.new as DocumentPart) : p))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, isMultiPart]);

  // Polling fallback for when realtime isn't working
  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(() => {
      fetchData();
      onRefresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [isProcessing, fetchData, onRefresh]);

  const toggleEventExpanded = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const reprocessPart = async (partId: string) => {
    setReprocessingPart(partId);
    try {
      const { error } = await supabase.functions.invoke("process-multipart-document", {
        body: { documentId, reprocessPartId: partId },
      });

      if (error) throw error;

      toast({
        title: "Part reprocessing started",
        description: "The part is being reprocessed. Status will update automatically.",
      });

      fetchData();
      onRefresh();
    } catch (error) {
      console.error("Error reprocessing part:", error);
      toast({
        title: "Reprocessing failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setReprocessingPart(null);
    }
  };

  // Calculate overall progress
  const calculateProgress = () => {
    if (!isMultiPart) {
      return processingProgress;
    }

    const totalParts = parts.length;
    if (totalParts === 0) return 0;

    const completedParts = parts.filter((p) => p.status === "processed").length;
    const processingParts = parts.filter((p) => p.status === "processing").length;

    return Math.round(((completedParts + processingParts * 0.5) / totalParts) * 100);
  };

  // Calculate processing time
  const getProcessingDuration = () => {
    if (!processingStartedAt) return null;

    const start = new Date(processingStartedAt);
    const end = processingCompletedAt ? new Date(processingCompletedAt) : new Date();
    const durationMs = end.getTime() - start.getTime();

    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const getStatusIcon = (status: string, isAnimated = false) => {
    switch (status) {
      case "completed":
      case "processed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "processing":
      case "in_progress":
        return <Loader2 className={cn("w-4 h-4 text-primary", isAnimated && "animate-spin")} />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "pending":
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case "completed":
      case "stage_completed":
        return "bg-green-500/20 text-green-500";
      case "started":
      case "stage_started":
        return "bg-primary/20 text-primary";
      case "failed":
        return "bg-destructive/20 text-destructive";
      case "warning":
        return "bg-yellow-500/20 text-yellow-500";
      case "retried":
        return "bg-orange-500/20 text-orange-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const progress = calculateProgress();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Progress Header */}
      <div className="bg-muted/30 rounded-lg p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-full",
              isProcessing ? "bg-primary/20" : 
              documentStatus === "pending" ? "bg-green-500/20" : "bg-muted"
            )}>
              {isProcessing ? (
                <Activity className="w-5 h-5 text-primary animate-pulse" />
              ) : documentStatus === "pending" || documentStatus === "active" ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <Clock className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">
                  {isProcessing ? "Processing in Progress" : 
                   documentStatus === "pending" || documentStatus === "active" ? "Processing Complete" : 
                   "Awaiting Processing"}
                </h3>
                {/* Processing Mode Badge */}
                {processingMode && (
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium",
                    processingMode === "full" && "bg-purple-500/20 text-purple-400 border border-purple-500/30",
                    processingMode === "resume" && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
                    processingMode === "single_part" && "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                  )}>
                    {processingMode === "full" && "🔄 Full Reprocess"}
                    {processingMode === "resume" && "▶️ Resume"}
                    {processingMode === "single_part" && "🔁 Single Part"}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {isProcessing && currentStage
                  ? `Currently: ${currentStage.replace(/_/g, " ")}`
                  : isMultiPart
                  ? `${parts.filter((p) => p.status === "processed").length} of ${parts.length} parts processed`
                  : documentStatus === "pending" || documentStatus === "active"
                  ? "Document ready for review"
                  : "Document has not been processed yet"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {processingStartedAt && (
              <div className="flex items-center gap-1">
                <Timer className="w-4 h-4" />
                {getProcessingDuration()}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-muted rounded-full h-2 mb-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-500",
              progress >= 100 ? "bg-green-500" : "bg-primary"
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground text-right">{progress}% complete</div>
      </div>

      {/* Stage Pipeline */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Processing Pipeline
        </h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {PROCESSING_STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const isCompleted = completedStages.includes(stage.key);
            const isFailed = failedStages.includes(stage.key);
            const isInProgress = inProgressStage === stage.key;

            return (
              <div key={stage.key} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                    isCompleted
                      ? "bg-green-500/10 border-green-500/30 text-green-500"
                      : isFailed
                      ? "bg-destructive/10 border-destructive/30 text-destructive"
                      : isInProgress
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground"
                  )}
                >
                  {isInProgress ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isFailed ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium whitespace-nowrap">{stage.label}</span>
                </div>
                {index < PROCESSING_STAGES.length - 1 && (
                  <div
                    className={cn(
                      "w-6 h-0.5 mx-1",
                      isCompleted ? "bg-green-500" : "bg-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Parts Status Grid (for multi-part documents) */}
      {isMultiPart && parts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Document Parts Status
          </h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Part</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Title</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Provisions</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Rules</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Processed</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => {
                  const hasIssue =
                    part.status === "processed" &&
                    ((part.provisions_count || 0) > 0 && (part.rules_count || 0) === 0);

                  return (
                    <tr
                      key={part.id}
                      className={cn(
                        "border-t border-border",
                        hasIssue && "bg-yellow-500/5"
                      )}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        Part {part.part_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
                        {part.part_title || `Part ${part.part_number}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {getStatusIcon(part.status, part.status === "processing")}
                          <span
                            className={cn(
                              "text-xs font-medium capitalize",
                              part.status === "processed"
                                ? "text-green-500"
                                : part.status === "processing"
                                ? "text-primary"
                                : part.status === "failed"
                                ? "text-destructive"
                                : "text-muted-foreground"
                            )}
                          >
                            {part.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-foreground">
                        {part.provisions_count ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-sm text-foreground">
                            {part.rules_count ?? "—"}
                          </span>
                          {hasIssue && (
                            <AlertTriangle className="w-3 h-3 text-yellow-500" title="No rules extracted" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                        {part.processed_at
                          ? new Date(part.processed_at).toLocaleTimeString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(part.status === "failed" || hasIssue) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => reprocessPart(part.id)}
                            disabled={reprocessingPart === part.id}
                          >
                            {reprocessingPart === part.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Event Timeline */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Processing Event Timeline
          <span className="text-xs font-normal text-muted-foreground">
            ({events.length} events)
          </span>
        </h3>

        {events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No processing events recorded yet</p>
            <p className="text-xs mt-1">
              Events will appear here when the document is processed
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {events.map((event) => {
              const isExpanded = expandedEvents.has(event.id);
              const hasDetails =
                event.details && Object.keys(event.details).length > 0;

              return (
                <div
                  key={event.id}
                  className={cn(
                    "border border-border rounded-lg p-3 transition-colors",
                    event.event_type === "failed" && "border-destructive/30 bg-destructive/5"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-start gap-3",
                      hasDetails && "cursor-pointer"
                    )}
                    onClick={() => hasDetails && toggleEventExpanded(event.id)}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {hasDetails ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )
                      ) : (
                        <div className="w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium",
                            getEventTypeColor(event.event_type)
                          )}
                        >
                          {event.event_type.replace(/_/g, " ")}
                        </span>
                        {event.stage && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {event.stage.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground mt-1">{event.message}</p>
                    </div>
                    <div className="flex-shrink-0 text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleTimeString()}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && hasDetails && (
                    <div className="mt-3 ml-7 p-3 bg-muted/50 rounded-lg">
                      <pre className="text-xs text-muted-foreground overflow-x-auto">
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Diagnostics Summary */}
      {(processingCompletedAt || events.length > 0) && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            Processing Diagnostics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/30 rounded-lg p-3 border border-border">
              <p className="text-xs text-muted-foreground">Total Duration</p>
              <p className="text-lg font-semibold text-foreground">
                {getProcessingDuration() || "—"}
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 border border-border">
              <p className="text-xs text-muted-foreground">Parts Processed</p>
              <p className="text-lg font-semibold text-foreground">
                {isMultiPart
                  ? `${parts.filter((p) => p.status === "processed").length}/${parts.length}`
                  : "1/1"}
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 border border-border">
              <p className="text-xs text-muted-foreground">Events Logged</p>
              <p className="text-lg font-semibold text-foreground">{events.length}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 border border-border">
              <p className="text-xs text-muted-foreground">Errors</p>
              <p
                className={cn(
                  "text-lg font-semibold",
                  events.filter((e) => e.event_type === "failed").length > 0
                    ? "text-destructive"
                    : "text-green-500"
                )}
              >
                {events.filter((e) => e.event_type === "failed").length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
