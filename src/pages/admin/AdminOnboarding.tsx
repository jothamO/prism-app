import { useState, useEffect } from "react";
import { 
  GraduationCap, 
  RefreshCw, 
  Users, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  XCircle,
  Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ConfidenceGauge } from "@/components/admin/ConfidenceGauge";

interface OnboardingSession {
  id: string;
  user_id: string;
  user_name: string;
  platform: string;
  current_step: number | null;
  total_steps: number | null;
  completed: boolean;
  profile_confidence: number | null;
  started_at: string | null;
  last_updated_at: string | null;
}

interface OnboardingStats {
  totalSessions: number;
  activeSessions: number;
  completed: number;
  completionRate: number;
  avgConfidence: number;
  avgStepsToComplete: number;
}

export default function AdminOnboarding() {
  const [sessions, setSessions] = useState<OnboardingSession[]>([]);
  const [stats, setStats] = useState<OnboardingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "abandoned">("all");

  useEffect(() => {
    fetchOnboardingData();
  }, []);

  async function fetchOnboardingData() {
    setLoading(true);
    try {
      // Fetch onboarding progress with user info
      const { data: progress } = await supabase
        .from("onboarding_progress")
        .select(`
          id,
          user_id,
          current_step,
          total_steps,
          completed,
          profile_confidence,
          started_at,
          last_updated_at
        `)
        .order("last_updated_at", { ascending: false })
        .limit(100);

      // Get user info for each session
      const userIds = [...new Set((progress || []).map(p => p.user_id))];
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, first_name, telegram_username, whatsapp_number, platform")
        .in("id", userIds);

      const userMap = new Map(users?.map(u => [u.id, u]) || []);

      const sessionsData: OnboardingSession[] = (progress || []).map(p => {
        const user = userMap.get(p.user_id);
        return {
          id: p.id,
          user_id: p.user_id,
          user_name: user?.full_name || user?.first_name || user?.telegram_username || user?.whatsapp_number || "Unknown",
          platform: user?.platform || "unknown",
          current_step: p.current_step,
          total_steps: p.total_steps,
          completed: p.completed || false,
          profile_confidence: p.profile_confidence,
          started_at: p.started_at,
          last_updated_at: p.last_updated_at
        };
      });

      setSessions(sessionsData);

      // Calculate stats
      const total = sessionsData.length;
      const completed = sessionsData.filter(s => s.completed).length;
      const active = sessionsData.filter(s => {
        if (s.completed) return false;
        const lastUpdate = s.last_updated_at ? new Date(s.last_updated_at) : null;
        if (!lastUpdate) return false;
        const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
        return hoursSinceUpdate < 24;
      }).length;

      const confidences = sessionsData
        .map(s => s.profile_confidence || 0)
        .filter(c => c > 0);
      const avgConfidence = confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

      setStats({
        totalSessions: total,
        activeSessions: active,
        completed,
        completionRate: total > 0 ? (completed / total) * 100 : 0,
        avgConfidence,
        avgStepsToComplete: 3 // Placeholder
      });
    } catch (error) {
      console.error("Error fetching onboarding data:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredSessions = sessions.filter(s => {
    if (filter === "all") return true;
    if (filter === "completed") return s.completed;
    if (filter === "active") {
      const lastUpdate = s.last_updated_at ? new Date(s.last_updated_at) : null;
      if (!lastUpdate) return false;
      const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
      return !s.completed && hoursSinceUpdate < 24;
    }
    if (filter === "abandoned") {
      const lastUpdate = s.last_updated_at ? new Date(s.last_updated_at) : null;
      if (!lastUpdate) return true;
      const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
      return !s.completed && hoursSinceUpdate >= 24;
    }
    return true;
  });

  function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return "Never";
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
          <h1 className="text-2xl font-bold text-foreground">Onboarding Monitor</h1>
          <p className="text-muted-foreground text-sm mt-1">Track user onboarding progress and profile learning</p>
        </div>
        <button 
          onClick={fetchOnboardingData}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Total Sessions</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.totalSessions}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Active (24h)</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{stats.activeSessions}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{stats.completed}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Completion Rate</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{stats.completionRate.toFixed(0)}%</p>
          </div>
          <div className="col-span-2 bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <ConfidenceGauge value={stats.avgConfidence} size="sm" label="Avg Confidence" />
            <div>
              <p className="text-xs text-muted-foreground">Average Profile Confidence</p>
              <p className="text-lg font-bold text-foreground">{stats.avgConfidence.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">across all users</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { id: "all", label: "All" },
          { id: "active", label: "Active" },
          { id: "completed", label: "Completed" },
          { id: "abandoned", label: "Abandoned" }
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

      {/* Sessions Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-accent/50 text-muted-foreground text-sm font-medium">
              <tr>
                <th className="px-6 py-3 border-b border-border">User</th>
                <th className="px-6 py-3 border-b border-border">Platform</th>
                <th className="px-6 py-3 border-b border-border">Progress</th>
                <th className="px-6 py-3 border-b border-border">Confidence</th>
                <th className="px-6 py-3 border-b border-border">Status</th>
                <th className="px-6 py-3 border-b border-border">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No sessions found
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => {
                  const progress = session.total_steps && session.current_step
                    ? (session.current_step / session.total_steps) * 100
                    : 0;
                  
                  return (
                    <tr key={session.id} className="hover:bg-accent/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-muted-foreground">
                            {session.user_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-foreground">{session.user_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium capitalize",
                          session.platform === "telegram" ? "bg-sky-500/20 text-sky-400" : "bg-green-500/20 text-green-400"
                        )}>
                          {session.platform}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-accent rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all" 
                              style={{ width: `${progress}%` }} 
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {session.current_step || 0}/{session.total_steps || 4}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "text-sm font-medium",
                          (session.profile_confidence || 0) >= 75 ? "text-green-400" :
                          (session.profile_confidence || 0) >= 50 ? "text-yellow-400" : "text-muted-foreground"
                        )}>
                          {session.profile_confidence ? `${session.profile_confidence}%` : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {session.completed ? (
                          <span className="flex items-center gap-1 text-green-400 text-sm">
                            <CheckCircle2 className="w-4 h-4" /> Completed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-yellow-400 text-sm">
                            <Clock className="w-4 h-4" /> In Progress
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {formatRelativeTime(session.last_updated_at)}
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
