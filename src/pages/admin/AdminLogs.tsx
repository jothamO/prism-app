import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  ScrollText, 
  RefreshCw, 
  Download, 
  Search, 
  Filter,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Brain,
  Sparkles,
  Database,
  Clock,
  ArrowUpDown
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LogLevel = "info" | "warning" | "error" | "success";
type LogSource = "ml_training" | "classification" | "sync" | "system" | "feedback";

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  details?: string;
  userId?: string;
}

const LOG_LEVELS: { value: LogLevel | "all"; label: string; icon: typeof CheckCircle; color: string }[] = [
  { value: "all", label: "All Levels", icon: Filter, color: "text-muted-foreground" },
  { value: "info", label: "Info", icon: CheckCircle, color: "text-blue-500" },
  { value: "success", label: "Success", icon: CheckCircle, color: "text-green-500" },
  { value: "warning", label: "Warning", icon: AlertTriangle, color: "text-yellow-500" },
  { value: "error", label: "Error", icon: XCircle, color: "text-red-500" },
];

const LOG_SOURCES: { value: LogSource | "all"; label: string; icon: typeof Brain }[] = [
  { value: "all", label: "All Sources", icon: Filter },
  { value: "ml_training", label: "ML Training", icon: Brain },
  { value: "classification", label: "Classification", icon: Sparkles },
  { value: "feedback", label: "AI Feedback", icon: Brain },
  { value: "sync", label: "Data Sync", icon: Database },
  { value: "system", label: "System", icon: ScrollText },
];

export default function AdminLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LogSource | "all">("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const logs: LogEntry[] = [];

      // Fetch ML model events
      const { data: mlModels } = await supabase
        .from("ml_models")
        .select("id, model_name, version, status, trained_at, deployed_at, accuracy")
        .order("created_at", { ascending: false })
        .limit(20);

      mlModels?.forEach(model => {
        if (model.trained_at) {
          logs.push({
            id: `ml-train-${model.id}`,
            timestamp: model.trained_at,
            level: "success",
            source: "ml_training",
            message: `Model ${model.model_name} v${model.version} trained`,
            details: `Accuracy: ${(model.accuracy * 100).toFixed(1)}%`,
          });
        }
        if (model.deployed_at) {
          logs.push({
            id: `ml-deploy-${model.id}`,
            timestamp: model.deployed_at,
            level: "success",
            source: "ml_training",
            message: `Model ${model.model_name} v${model.version} deployed`,
            details: `Status: ${model.status}`,
          });
        }
      });

      // Fetch AI feedback events
      const { data: feedback } = await supabase
        .from("ai_feedback")
        .select("id, correction_type, item_description, created_at, used_in_training, user_id")
        .order("created_at", { ascending: false })
        .limit(50);

      feedback?.forEach(fb => {
        logs.push({
          id: `feedback-${fb.id}`,
          timestamp: fb.created_at,
          level: fb.correction_type === "confirmation" ? "info" : fb.correction_type === "full_override" ? "warning" : "info",
          source: "feedback",
          message: `${fb.correction_type?.replace("_", " ")} for "${fb.item_description?.slice(0, 40)}..."`,
          details: fb.used_in_training ? "Used in training" : "Pending training",
          userId: fb.user_id,
        });
      });

      // Fetch pattern learning events
      const { data: patterns } = await supabase
        .from("business_classification_patterns")
        .select("id, item_pattern, category, confidence, created_at, last_used_at")
        .order("created_at", { ascending: false })
        .limit(30);

      patterns?.forEach(p => {
        logs.push({
          id: `pattern-${p.id}`,
          timestamp: p.created_at,
          level: p.confidence >= 0.8 ? "success" : p.confidence >= 0.5 ? "info" : "warning",
          source: "classification",
          message: `Pattern learned: "${p.item_pattern.slice(0, 30)}..."`,
          details: `Category: ${p.category} (${(p.confidence * 100).toFixed(0)}% confidence)`,
        });
      });

      // Fetch profile learning history
      const { data: profileHistory } = await supabase
        .from("profile_learning_history")
        .select("id, field_name, source, reason, created_at, user_id, confidence")
        .order("created_at", { ascending: false })
        .limit(30);

      profileHistory?.forEach(h => {
        logs.push({
          id: `profile-${h.id}`,
          timestamp: h.created_at,
          level: "info",
          source: "classification",
          message: `Profile update: ${h.field_name.replace("_", " ")}`,
          details: h.reason || `via ${h.source}`,
          userId: h.user_id,
        });
      });

      // Add some system-level logs from analytics_events
      const { data: events } = await supabase
        .from("analytics_events")
        .select("id, event_type, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(20);

      events?.forEach(e => {
        logs.push({
          id: `event-${e.id}`,
          timestamp: e.created_at,
          level: "info",
          source: "system",
          message: `Event: ${e.event_type.replace("_", " ")}`,
          details: e.metadata ? JSON.stringify(e.metadata).slice(0, 50) : undefined,
        });
      });

      // Sort all logs by timestamp
      logs.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      });

      setLogs(logs);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  }, [sortOrder]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (levelFilter !== "all" && log.level !== levelFilter) return false;
    if (sourceFilter !== "all" && log.source !== sourceFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        log.message.toLowerCase().includes(term) ||
        log.details?.toLowerCase().includes(term) ||
        log.source.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const exportLogs = () => {
    const csv = [
      ["Timestamp", "Level", "Source", "Message", "Details", "User ID"].join(","),
      ...filteredLogs.map(log => [
        log.timestamp,
        log.level,
        log.source,
        `"${log.message.replace(/"/g, '""')}"`,
        `"${(log.details || "").replace(/"/g, '""')}"`,
        log.userId || ""
      ].join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case "success": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "error": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <CheckCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSourceIcon = (source: LogSource) => {
    switch (source) {
      case "ml_training": return <Brain className="w-4 h-4" />;
      case "classification": return <Sparkles className="w-4 h-4" />;
      case "feedback": return <Brain className="w-4 h-4" />;
      case "sync": return <Database className="w-4 h-4" />;
      default: return <ScrollText className="w-4 h-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor ML training, classifications, and system events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-border"
            />
            Auto-refresh
          </label>
          <button
            onClick={exportLogs}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Logs</CardDescription>
            <CardTitle className="text-2xl">{logs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-500" /> Errors
            </CardDescription>
            <CardTitle className="text-2xl text-red-500">
              {logs.filter(l => l.level === "error").length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-yellow-500" /> Warnings
            </CardDescription>
            <CardTitle className="text-2xl text-yellow-500">
              {logs.filter(l => l.level === "warning").length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Brain className="w-3 h-3 text-primary" /> ML Events
            </CardDescription>
            <CardTitle className="text-2xl">
              {logs.filter(l => l.source === "ml_training" || l.source === "feedback").length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm"
          />
        </div>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as LogLevel | "all")}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          {LOG_LEVELS.map(level => (
            <option key={level.value} value={level.value}>{level.label}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as LogSource | "all")}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          {LOG_SOURCES.map(source => (
            <option key={source.value} value={source.value}>{source.label}</option>
          ))}
        </select>
        <button
          onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
          className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm hover:bg-muted transition-colors"
        >
          <ArrowUpDown className="w-4 h-4" />
          {sortOrder === "desc" ? "Newest First" : "Oldest First"}
        </button>
      </div>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No logs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Time</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Level</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Source</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Message</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(log.timestamp)}
                        </div>
                      </td>
                      <td className="p-3">
                        {getLevelIcon(log.level)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 text-sm">
                          {getSourceIcon(log.source)}
                          <span className="text-muted-foreground capitalize">
                            {log.source.replace("_", " ")}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-sm max-w-md truncate">{log.message}</td>
                      <td className="p-3 text-sm text-muted-foreground max-w-xs truncate">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Count */}
      <p className="text-sm text-muted-foreground text-center">
        Showing {filteredLogs.length} of {logs.length} logs
      </p>
    </div>
  );
}
