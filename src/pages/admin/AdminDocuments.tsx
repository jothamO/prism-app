import { useState, useEffect } from "react";
import { 
  FileStack, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  FileText,
  Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface DocumentJob {
  id: string;
  user_id: string;
  document_type: string;
  processing_status: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  attempts: number | null;
}

interface DocumentStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
  successRate: number;
  avgProcessingTime: number;
}

export default function AdminDocuments() {
  const [jobs, setJobs] = useState<DocumentJob[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "processing" | "completed" | "failed">("all");

  useEffect(() => {
    fetchDocumentData();
  }, []);

  async function fetchDocumentData() {
    setLoading(true);
    try {
      const { data: jobsData } = await supabase
        .from("document_processing_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      setJobs(jobsData || []);

      // Calculate stats
      const allJobs = jobsData || [];
      const completed = allJobs.filter(j => j.processing_status === "completed").length;
      const failed = allJobs.filter(j => j.processing_status === "failed").length;
      const pending = allJobs.filter(j => j.processing_status === "pending" || j.processing_status === "queued").length;
      const processing = allJobs.filter(j => j.processing_status === "processing").length;

      // Calculate average processing time for completed jobs
      const completedJobs = allJobs.filter(j => j.processing_status === "completed" && j.started_at && j.completed_at);
      let avgTime = 0;
      if (completedJobs.length > 0) {
        const totalTime = completedJobs.reduce((sum, j) => {
          const start = new Date(j.started_at!).getTime();
          const end = new Date(j.completed_at!).getTime();
          return sum + (end - start);
        }, 0);
        avgTime = totalTime / completedJobs.length / 1000; // in seconds
      }

      setStats({
        total: allJobs.length,
        completed,
        failed,
        pending,
        processing,
        successRate: allJobs.length > 0 ? (completed / (completed + failed)) * 100 || 0 : 0,
        avgProcessingTime: avgTime
      });
    } catch (error) {
      console.error("Error fetching document data:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredJobs = jobs.filter(j => {
    if (filter === "all") return true;
    if (filter === "pending") return j.processing_status === "pending" || j.processing_status === "queued";
    if (filter === "processing") return j.processing_status === "processing";
    if (filter === "completed") return j.processing_status === "completed";
    if (filter === "failed") return j.processing_status === "failed";
    return true;
  });

  function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return "—";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  function getStatusConfig(status: string | null) {
    switch (status) {
      case "completed":
        return { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/20", label: "Completed" };
      case "failed":
        return { icon: XCircle, color: "text-red-400", bg: "bg-red-500/20", label: "Failed" };
      case "processing":
        return { icon: RefreshCw, color: "text-blue-400", bg: "bg-blue-500/20", label: "Processing" };
      case "pending":
      case "queued":
        return { icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/20", label: "Pending" };
      default:
        return { icon: AlertTriangle, color: "text-muted-foreground", bg: "bg-muted", label: status || "Unknown" };
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Document Processing</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor OCR and document classification jobs</p>
        </div>
        <button 
          onClick={fetchDocumentData}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Total Jobs</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{stats.completed}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{stats.failed}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">{stats.pending}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Success Rate</p>
            <p className={cn(
              "text-2xl font-bold mt-1",
              stats.successRate >= 90 ? "text-green-400" : 
              stats.successRate >= 70 ? "text-yellow-400" : "text-red-400"
            )}>{stats.successRate.toFixed(0)}%</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Avg Process Time</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{stats.avgProcessingTime.toFixed(1)}s</p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { id: "all", label: "All" },
          { id: "pending", label: "Pending" },
          { id: "processing", label: "Processing" },
          { id: "completed", label: "Completed" },
          { id: "failed", label: "Failed" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as typeof filter)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              filter === tab.id
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Jobs Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-accent/50 text-muted-foreground text-sm font-medium">
              <tr>
                <th className="px-6 py-3 border-b border-border">Document Type</th>
                <th className="px-6 py-3 border-b border-border">Status</th>
                <th className="px-6 py-3 border-b border-border">Attempts</th>
                <th className="px-6 py-3 border-b border-border">Created</th>
                <th className="px-6 py-3 border-b border-border">Completed</th>
                <th className="px-6 py-3 border-b border-border">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No document jobs found
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const statusConfig = getStatusConfig(job.processing_status);
                  const StatusIcon = statusConfig.icon;
                  
                  return (
                    <tr key={job.id} className="hover:bg-accent/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-accent rounded-lg">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <span className="text-sm font-medium text-foreground capitalize">
                            {job.document_type.replace(/_/g, " ")}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                          statusConfig.bg, statusConfig.color
                        )}>
                          <StatusIcon className={cn(
                            "w-3 h-3",
                            job.processing_status === "processing" && "animate-spin"
                          )} />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {job.attempts || 0}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {formatRelativeTime(job.created_at)}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {formatRelativeTime(job.completed_at)}
                      </td>
                      <td className="px-6 py-4">
                        {job.error_message ? (
                          <span className="text-xs text-red-400 truncate max-w-[200px] block" title={job.error_message}>
                            {job.error_message}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
