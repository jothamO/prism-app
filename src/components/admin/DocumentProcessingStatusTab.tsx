import { useState, useEffect, useCallback, useRef } from "react";
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
  ChevronUp,
  Loader2,
  RotateCcw,
  Timer,
  Zap,
  StopCircle,
  PlayCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  updated_at?: string;
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

interface ProcessingLogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

interface ProcessingStats {
  totalParts: number;
  completedParts: number;
  failedParts: number;
  currentPartNumber: number;
  currentPartTitle: string;
  startTime: Date | null;
  partTimes: number[]; // Time taken per part in ms
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

// Format duration from milliseconds
function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

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
  const [stoppingProcessing, setStoppingProcessing] = useState(false);

  // Auto-sequential processing state
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [processingInitiating, setProcessingInitiating] = useState(false);
  const stopRequestedRef = useRef(false);
  const [processingStats, setProcessingStats] = useState<ProcessingStats>({
    totalParts: 0,
    completedParts: 0,
    failedParts: 0,
    currentPartNumber: 0,
    currentPartTitle: "",
    startTime: null,
    partTimes: [],
  });
  const [processingLog, setProcessingLog] = useState<ProcessingLogEntry[]>([]);
  const [logExpanded, setLogExpanded] = useState(true);
  const partStartTimeRef = useRef<number>(0);
  const processingRef = useRef(false);

  const isProcessing = documentStatus === "processing";

  // Detect if any parts are stuck in processing status (for showing Stop button)
  const hasStuckParts = parts.some(p => p.status === 'processing');
  const showStopButton = isProcessing || hasStuckParts || autoProcessing;

  // Check for pending/failed parts for "Process Next Part" button
  const pendingParts = parts.filter(p => p.status === 'pending' || p.status === 'failed');
  const hasPendingParts = pendingParts.length > 0;
  const completedPartsCount = parts.filter(p => p.status === 'processed').length;

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

  // Add log entry
  const addLogEntry = useCallback((message: string, type: ProcessingLogEntry["type"] = "info") => {
    const entry: ProcessingLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setProcessingLog(prev => [entry, ...prev].slice(0, 100)); // Keep last 100 entries
  }, []);

  // Process a single part
  const processSinglePart = useCallback(async (part: DocumentPart): Promise<boolean> => {
    partStartTimeRef.current = Date.now();

    setProcessingStats(prev => ({
      ...prev,
      currentPartNumber: part.part_number,
      currentPartTitle: part.part_title || `Part ${part.part_number}`,
    }));

    addLogEntry(`Starting Part ${part.part_number}: ${part.part_title || 'Untitled'}`, "info");

    try {
      const { error } = await supabase.functions.invoke("process-multipart-document", {
        body: { documentId, reprocessPartId: part.id },
      });

      if (error) throw error;

      // Wait for the part to complete processing (poll for status change)
      let attempts = 0;
      const maxAttempts = 180; // 15 minutes max (5s intervals)

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

        const { data: updatedPart } = await supabase
          .from("document_parts")
          .select("*")
          .eq("id", part.id)
          .single();

        if (updatedPart?.status === "processed") {
          const elapsed = Date.now() - partStartTimeRef.current;
          setProcessingStats(prev => ({
            ...prev,
            completedParts: prev.completedParts + 1,
            partTimes: [...prev.partTimes, elapsed],
          }));
          addLogEntry(
            `✓ Part ${part.part_number} completed in ${formatDuration(elapsed)} — ${updatedPart.provisions_count || 0} provisions, ${updatedPart.rules_count || 0} rules`,
            "success"
          );
          return true;
        }

        if (updatedPart?.status === "failed") {
          setProcessingStats(prev => ({
            ...prev,
            failedParts: prev.failedParts + 1,
          }));
          addLogEntry(`✗ Part ${part.part_number} failed`, "error");
          return false;
        }

        // Check if stop was requested (use ref for synchronous read)
        if (stopRequestedRef.current) {
          addLogEntry("Stop requested, will halt after current part", "warning");
          break;
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        addLogEntry(`⚠ Part ${part.part_number} timed out after 15 minutes`, "error");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error processing part:", error);
      addLogEntry(`✗ Part ${part.part_number} error: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      setProcessingStats(prev => ({
        ...prev,
        failedParts: prev.failedParts + 1,
      }));
      return false;
    }
  }, [documentId, addLogEntry, stopRequested]);

  // Start auto-sequential processing
  const startAutoProcessing = useCallback(async () => {
    if (processingRef.current) return;
    
    // Show stop button immediately
    setProcessingInitiating(true);
    processingRef.current = true;

    const partsToProcess = parts.filter(p => p.status === 'pending' || p.status === 'failed');

    if (partsToProcess.length === 0) {
      toast({
        title: "No parts to process",
        description: "All parts are already processed.",
      });
      processingRef.current = false;
      setProcessingInitiating(false);
      return;
    }

    setAutoProcessing(true);
    setProcessingInitiating(false);
    setStopRequested(false);
    stopRequestedRef.current = false;
    setProcessingLog([]);
    setProcessingStats({
      totalParts: parts.length,
      completedParts: parts.filter(p => p.status === 'processed').length,
      failedParts: 0,
      currentPartNumber: 0,
      currentPartTitle: "",
      startTime: new Date(),
      partTimes: [],
    });

    addLogEntry(`Starting sequential processing of ${partsToProcess.length} parts`, "info");

    // Update document status to processing
    await supabase
      .from("legal_documents")
      .update({ status: 'processing' })
      .eq("id", documentId);

    onRefresh();

    // Process parts sequentially
    for (const part of partsToProcess) {
      // Check stop flag (use ref for synchronous read)
      if (stopRequestedRef.current) {
        addLogEntry("Processing stopped by user", "warning");
        break;
      }

      const success = await processSinglePart(part);

      if (!success) {
        addLogEntry(`Processing halted due to failure on Part ${part.part_number}. Use 'Process Next Part' to retry or skip.`, "error");
        break;
      }

      // Refresh parts data
      await fetchData();
    }

    // Check if all parts are processed
    const { data: finalParts } = await supabase
      .from("document_parts")
      .select("status")
      .eq("parent_document_id", documentId);

    const allProcessed = finalParts?.every(p => p.status === 'processed');

    if (allProcessed) {
      addLogEntry("🎉 All parts processed successfully!", "success");

      // Update document status
      await supabase
        .from("legal_documents")
        .update({ status: 'pending' })
        .eq("id", documentId);

      toast({
        title: "Processing Complete",
        description: `All ${parts.length} parts have been processed successfully.`,
      });
    } else {
      // Set status back to pending to allow manual intervention
      await supabase
        .from("legal_documents")
        .update({ status: 'pending' })
        .eq("id", documentId);
    }

    setAutoProcessing(false);
    processingRef.current = false;
    onRefresh();
  }, [parts, documentId, addLogEntry, processSinglePart, onRefresh, toast, stopRequested]);

  // Stop auto-sequential processing
  const stopAutoProcessing = useCallback(() => {
    setStopRequested(true);
    stopRequestedRef.current = true; // Synchronous update for immediate effect
    addLogEntry("Stop requested - will halt after current part completes", "warning");
    toast({
      title: "Stop Requested",
      description: "Processing will stop after the current part completes.",
    });
  }, [addLogEntry, toast]);

  // Process a single pending/failed part (manual step)
  const processNextPart = async () => {
    const nextPart = parts.find(p => p.status === 'pending' || p.status === 'failed');

    if (!nextPart) {
      toast({
        title: "All parts processed",
        description: "There are no pending or failed parts to process.",
      });
      return;
    }

    setReprocessingPart(nextPart.id);
    addLogEntry(`Manually processing Part ${nextPart.part_number}`, "info");

    try {
      const { error } = await supabase.functions.invoke("process-multipart-document", {
        body: { documentId, reprocessPartId: nextPart.id },
      });

      if (error) throw error;

      toast({
        title: `Processing Part ${nextPart.part_number}`,
        description: `${nextPart.part_title || 'Untitled'} is being processed.`,
      });

      fetchData();
      onRefresh();
    } catch (error) {
      console.error("Error processing next part:", error);
      addLogEntry(`Failed to start Part ${nextPart.part_number}: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setReprocessingPart(null);
    }
  };

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

  // NOTE: No polling - we rely entirely on Supabase Realtime subscriptions above
  // Users can click the Refresh button for manual updates

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
    const part = parts.find(p => p.id === partId);
    if (part) {
      addLogEntry(`Reprocessing Part ${part.part_number}`, "info");
    }

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

    return formatDuration(durationMs);
  };

  // Calculate time estimates
  const getTimeEstimates = () => {
    if (processingStats.partTimes.length === 0) {
      return { avgTime: 0, remainingTime: 0, elapsedTime: 0 };
    }

    const avgTime = processingStats.partTimes.reduce((a, b) => a + b, 0) / processingStats.partTimes.length;
    const remainingParts = processingStats.totalParts - processingStats.completedParts - processingStats.failedParts;
    const remainingTime = remainingParts * avgTime;
    const elapsedTime = processingStats.startTime ? Date.now() - processingStats.startTime.getTime() : 0;

    return { avgTime, remainingTime, elapsedTime };
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
  const timeEstimates = getTimeEstimates();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sequential Processing Progress (for multi-part documents) */}
      {isMultiPart && (
        <div className="bg-muted/30 rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-full",
                autoProcessing ? "bg-primary/20" :
                  completedPartsCount === parts.length ? "bg-green-500/20" : "bg-muted"
              )}>
                {autoProcessing ? (
                  <Activity className="w-5 h-5 text-primary animate-pulse" />
                ) : completedPartsCount === parts.length ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {autoProcessing
                    ? `Processing Part ${processingStats.currentPartNumber} of ${parts.length}`
                    : completedPartsCount === parts.length
                      ? "All Parts Processed"
                      : `${completedPartsCount} of ${parts.length} parts complete`}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {autoProcessing && processingStats.currentPartTitle
                    ? processingStats.currentPartTitle
                    : hasPendingParts
                      ? `${pendingParts.length} parts remaining`
                      : "Ready for review"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Start Processing All Button */}
              {!autoProcessing && hasPendingParts && (
                <Button onClick={startAutoProcessing} className="gap-2">
                  <PlayCircle className="w-4 h-4" />
                  Start Processing All ({pendingParts.length} parts)
                </Button>
              )}

              {/* Stop Button - visible immediately when processing starts or initiating */}
              {(autoProcessing || processingInitiating) && (
                <Button
                  variant="destructive"
                  onClick={stopAutoProcessing}
                  disabled={stopRequested}
                  className="gap-2"
                >
                  {stopRequested ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <StopCircle className="w-4 h-4" />
                  )}
                  {stopRequested ? "Stopping..." : "Stop After Current Part"}
                </Button>
              )}

              {/* Manual single-step */}
              {!autoProcessing && hasPendingParts && (
                <Button
                  variant="outline"
                  onClick={processNextPart}
                  disabled={reprocessingPart !== null}
                  className="gap-2"
                >
                  {reprocessingPart ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Process Next Part Only
                </Button>
              )}

              <Button variant="ghost" size="icon" onClick={fetchData} title="Refresh data">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Enhanced Progress Bar */}
          <div className="space-y-2">
            <Progress
              value={(completedPartsCount / parts.length) * 100}
              className="h-3"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{Math.round((completedPartsCount / parts.length) * 100)}% complete</span>
              {processingStats.failedParts > 0 && (
                <span className="text-destructive">{processingStats.failedParts} failed</span>
              )}
            </div>
          </div>

          {/* Time Estimates */}
          {autoProcessing && processingStats.partTimes.length > 0 && (
            <div className="flex gap-4 text-sm text-muted-foreground mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-1">
                <Timer className="w-3 h-3" />
                <span>Avg/part: {formatDuration(timeEstimates.avgTime)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Est. remaining: {formatDuration(timeEstimates.remainingTime)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                <span>Elapsed: {formatDuration(timeEstimates.elapsedTime)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Processing Log */}
      {isMultiPart && processingLog.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div
            className="p-3 bg-muted/30 flex items-center justify-between cursor-pointer"
            onClick={() => setLogExpanded(!logExpanded)}
          >
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Live Processing Log
              <span className="text-xs text-muted-foreground">({processingLog.length} entries)</span>
            </h4>
            <Button variant="ghost" size="sm">
              {logExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
          {logExpanded && (
            <div className="p-3 max-h-[200px] overflow-y-auto font-mono text-xs space-y-1 bg-background">
              {processingLog.map((entry, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2",
                    entry.type === 'error' && "text-destructive",
                    entry.type === 'success' && "text-green-500",
                    entry.type === 'warning' && "text-yellow-500",
                    entry.type === 'info' && "text-muted-foreground"
                  )}
                >
                  <span className="text-muted-foreground shrink-0">[{entry.timestamp}]</span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overall Progress Header (for single documents or fallback) */}
      {!isMultiPart && (
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
              {showStopButton && !isMultiPart && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    setStoppingProcessing(true);
                    try {
                      // Set abort flag in document metadata
                      const { data: doc } = await supabase
                        .from("legal_documents")
                        .select("metadata")
                        .eq("id", documentId)
                        .single();

                      const currentMetadata = (doc?.metadata as Record<string, unknown>) || {};

                      await supabase
                        .from("legal_documents")
                        .update({
                          metadata: { ...currentMetadata, abort_requested: true },
                        })
                        .eq("id", documentId);

                      toast({
                        title: "Stop Requested",
                        description: "Processing will stop after the current part completes.",
                      });
                    } catch (error) {
                      console.error("Error requesting stop:", error);
                      toast({
                        title: "Error",
                        description: "Failed to request stop",
                        variant: "destructive",
                      });
                    } finally {
                      setStoppingProcessing(false);
                    }
                  }}
                  disabled={stoppingProcessing}
                >
                  {stoppingProcessing ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <StopCircle className="w-4 h-4 mr-1" />
                  )}
                  Stop Processing
                </Button>
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
      )}

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

                  // Detect stuck/timed-out parts (processing > 15 minutes)
                  const updatedAt = part.updated_at
                    ? new Date(part.updated_at).getTime()
                    : 0;
                  const fifteenMinutes = 15 * 60 * 1000;
                  const isStuck = part.status === 'processing' && (Date.now() - updatedAt > fifteenMinutes);

                  return (
                    <tr
                      key={part.id}
                      className={cn(
                        "border-t border-border",
                        hasIssue && "bg-yellow-500/5",
                        isStuck && "bg-destructive/5"
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
                          {getStatusIcon(part.status, part.status === "processing" && !isStuck)}
                          <span
                            className={cn(
                              "text-xs font-medium capitalize",
                              part.status === "processed"
                                ? "text-green-500"
                                : part.status === "processing"
                                  ? isStuck ? "text-destructive" : "text-primary"
                                  : part.status === "failed"
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                            )}
                          >
                            {part.status}
                            {isStuck && <span className="ml-1">(timed out)</span>}
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
                        {(part.status === "failed" || hasIssue || isStuck || part.status === "pending") && !autoProcessing && (
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
