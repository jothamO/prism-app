import { useState, useEffect } from "react";
import {
  Bell,
  FileText,
  AlertTriangle,
  Info,
  CheckCircle,
  Clock,
  X,
  Settings,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  document_id: string | null;
  rule_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

interface NotificationPreferences {
  tax_types: string[];
  notify_new_regulations: boolean;
  notify_amendments: boolean;
  notify_deadlines: boolean;
  notify_rate_changes: boolean;
  email_notifications: boolean;
  in_app_notifications: boolean;
}

interface ComplianceNotificationCenterProps {
  userId: string;
  compact?: boolean;
}

export default function ComplianceNotificationCenter({
  userId,
  compact = false,
}: ComplianceNotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
    fetchPreferences();

    // Subscribe to real-time notifications
    const channel = supabase
      .channel("compliance-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "compliance_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("compliance_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(compact ? 5 : 20);

      if (error) throw error;

      setNotifications(data || []);
      setUnreadCount(data?.filter((n) => !n.is_read).length || 0);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPreferences() {
    try {
      const { data, error } = await supabase
        .from("user_compliance_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      setPreferences(
        data || {
          tax_types: [],
          notify_new_regulations: true,
          notify_amendments: true,
          notify_deadlines: true,
          notify_rate_changes: true,
          email_notifications: true,
          in_app_notifications: true,
        }
      );
    } catch (error) {
      console.error("Error fetching preferences:", error);
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      await supabase
        .from("compliance_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId);

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }

  async function markAllAsRead() {
    try {
      await supabase
        .from("compliance_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_read", false);

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  }

  async function savePreferences(newPrefs: NotificationPreferences) {
    try {
      const { error } = await supabase.from("user_compliance_preferences").upsert({
        user_id: userId,
        ...newPrefs,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setPreferences(newPrefs);
      setShowSettings(false);
    } catch (error) {
      console.error("Error saving preferences:", error);
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "new_regulation":
        return <FileText className="w-4 h-4" />;
      case "deadline_reminder":
        return <Clock className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("bg-card border border-border rounded-lg", compact ? "" : "")}>
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-foreground" />
          <span className="font-medium text-foreground">Regulatory Updates</span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 hover:bg-accent rounded"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && preferences && (
        <div className="p-4 border-b border-border bg-accent/30">
          <h4 className="font-medium text-foreground text-sm mb-3">Notification Preferences</h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.notify_new_regulations}
                onChange={(e) =>
                  setPreferences({ ...preferences, notify_new_regulations: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-foreground">New regulations</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.notify_amendments}
                onChange={(e) =>
                  setPreferences({ ...preferences, notify_amendments: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-foreground">Amendments</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.notify_deadlines}
                onChange={(e) =>
                  setPreferences({ ...preferences, notify_deadlines: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-foreground">Filing deadlines</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.notify_rate_changes}
                onChange={(e) =>
                  setPreferences({ ...preferences, notify_rate_changes: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-foreground">Rate & threshold changes</span>
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowSettings(false)}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => savePreferences(preferences)}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className={cn("divide-y divide-border", compact ? "max-h-80 overflow-y-auto" : "")}>
        {notifications.length === 0 ? (
          <div className="p-6 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">You're all caught up!</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                "p-3 hover:bg-accent/30 transition-colors cursor-pointer",
                !notification.is_read && "bg-primary/5"
              )}
              onClick={() => {
                if (!notification.is_read) markAsRead(notification.id);
                if (notification.action_url) {
                  window.location.href = notification.action_url;
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getSeverityIcon(notification.severity)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm">
                      {notification.title}
                    </span>
                    {!notification.is_read && (
                      <span className="w-2 h-2 bg-primary rounded-full" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatTime(notification.created_at)}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 bg-accent rounded capitalize">
                      {notification.notification_type.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {!compact && notifications.length > 0 && (
        <div className="p-3 border-t border-border text-center">
          <button
            onClick={fetchNotifications}
            className="text-sm text-primary hover:underline flex items-center gap-1 mx-auto"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
