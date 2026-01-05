import { useState, useEffect } from "react";
import { 
  LogIn, 
  LogOut, 
  UserCog, 
  Receipt, 
  CreditCard, 
  RefreshCw,
  Filter,
  Calendar
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface UserActivityTabProps {
  userId: string;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string;
  source: "activity_log" | "audit_log" | "receipts" | "transactions";
}

const EVENT_CONFIG: Record<string, { icon: typeof LogIn; color: string; label: string }> = {
  login: { icon: LogIn, color: "text-green-400", label: "Login" },
  logout: { icon: LogOut, color: "text-muted-foreground", label: "Logout" },
  profile_update: { icon: UserCog, color: "text-blue-400", label: "Profile Updated" },
  receipt_upload: { icon: Receipt, color: "text-amber-400", label: "Receipt Uploaded" },
  transaction_classified: { icon: CreditCard, color: "text-purple-400", label: "Transaction Classified" },
  role_assigned: { icon: UserCog, color: "text-emerald-400", label: "Role Assigned" },
  role_removed: { icon: UserCog, color: "text-red-400", label: "Role Removed" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "All Events" },
  { value: "login", label: "Login/Logout" },
  { value: "profile", label: "Profile Changes" },
  { value: "transaction", label: "Transactions" },
];

const DATE_RANGE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

export function UserActivityTab({ userId }: UserActivityTabProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [dateRange, setDateRange] = useState(30);

  useEffect(() => {
    fetchActivity();
  }, [userId, filter, dateRange]);

  async function fetchActivity() {
    setLoading(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);
      const startDateStr = startDate.toISOString();

      const allActivities: ActivityEvent[] = [];

      // Fetch from user_activity_log
      const { data: activityData } = await supabase
        .from("user_activity_log")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", startDateStr)
        .order("created_at", { ascending: false })
        .limit(50);

      if (activityData) {
        allActivities.push(...activityData.map(a => ({
          id: a.id,
          event_type: a.event_type,
          event_data: (a.event_data || {}) as Record<string, unknown>,
          created_at: a.created_at,
          source: "activity_log" as const,
        })));
      }

      // Fetch from audit_log
      const { data: auditData } = await supabase
        .from("audit_log")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", startDateStr)
        .order("created_at", { ascending: false })
        .limit(50);

      if (auditData) {
        allActivities.push(...auditData.map(a => ({
          id: a.id,
          event_type: a.action,
          event_data: { old_values: a.old_values, new_values: a.new_values, entity_type: a.entity_type } as Record<string, unknown>,
          created_at: a.created_at || "",
          source: "audit_log" as const,
        })));
      }

      // Fetch recent receipts as activity
      if (filter === "all" || filter === "transaction") {
        const { data: receiptsData } = await supabase
          .from("receipts")
          .select("id, merchant, amount, created_at")
          .eq("user_id", userId)
          .gte("created_at", startDateStr)
          .order("created_at", { ascending: false })
          .limit(20);

        if (receiptsData) {
          allActivities.push(...receiptsData.map(r => ({
            id: r.id,
            event_type: "receipt_upload",
            event_data: { merchant: r.merchant, amount: r.amount } as Record<string, unknown>,
            created_at: r.created_at || "",
            source: "receipts" as const,
          })));
        }
      }

      // Fetch recent classified transactions
      if (filter === "all" || filter === "transaction") {
        const { data: txData } = await supabase
          .from("bank_transactions")
          .select("id, description, classification, confidence, created_at")
          .eq("user_id", userId)
          .not("classification", "is", null)
          .gte("created_at", startDateStr)
          .order("created_at", { ascending: false })
          .limit(20);

        if (txData) {
          allActivities.push(...txData.map(t => ({
            id: t.id,
            event_type: "transaction_classified",
            event_data: { description: t.description, classification: t.classification, confidence: t.confidence } as Record<string, unknown>,
            created_at: t.created_at || "",
            source: "transactions" as const,
          })));
        }
      }

      // Sort by date and apply filter
      let filtered = allActivities.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (filter === "login") {
        filtered = filtered.filter(a => ["login", "logout"].includes(a.event_type));
      } else if (filter === "profile") {
        filtered = filtered.filter(a => 
          ["profile_update", "role_assigned", "role_removed", "profile_updated"].includes(a.event_type)
        );
      } else if (filter === "transaction") {
        filtered = filtered.filter(a => 
          ["receipt_upload", "transaction_classified"].includes(a.event_type)
        );
      }

      setActivities(filtered.slice(0, 50));
    } catch (error) {
      console.error("Error fetching activity:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatEventDetails(event: ActivityEvent): string {
    const data = event.event_data;
    
    switch (event.event_type) {
      case "profile_update":
      case "profile_updated":
        const fields = data.changed_fields || [];
        return Array.isArray(fields) && fields.length > 0 
          ? `Changed: ${(fields as string[]).join(", ")}` 
          : "Profile details updated";
      case "receipt_upload":
        return `${data.merchant || "Unknown"} · ₦${((data.amount as number) || 0).toLocaleString()}`;
      case "transaction_classified":
        return `${data.description || "Transaction"} → ${data.classification} (${Math.round(((data.confidence as number) || 0) * 100)}%)`;
      case "role_assigned":
      case "role_removed":
        return `${(data.new_values as Record<string, unknown>)?.role || "Role"} ${event.event_type === "role_assigned" ? "added" : "removed"}`;
      case "login":
        return "User logged in";
      case "logout":
        return "User logged out";
      default:
        return event.event_type.replace(/_/g, " ");
    }
  }

  function getEventConfig(eventType: string) {
    return EVENT_CONFIG[eventType] || { 
      icon: UserCog, 
      color: "text-muted-foreground", 
      label: eventType.replace(/_/g, " ") 
    };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Activity List */}
      <div className="space-y-2">
        {activities.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No activity found</p>
        ) : (
          activities.map((activity) => {
            const config = getEventConfig(activity.event_type);
            const Icon = config.icon;
            
            return (
              <div
                key={`${activity.source}-${activity.id}`}
                className="flex items-start gap-3 p-3 bg-accent/30 rounded-lg"
              >
                <div className={cn("mt-0.5", config.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{config.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatEventDetails(activity)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(activity.created_at).toLocaleDateString()} {new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}