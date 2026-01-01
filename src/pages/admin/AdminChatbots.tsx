import { useState, useEffect } from "react";
import {
  Bot,
  MessageSquare,
  Users,
  Send,
  Radio,
  RefreshCw,
  Search,
  CheckCircle2,
  Smartphone,
  MessagesSquare,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Terminal,
  Ban,
  Zap,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BotCommandsManager } from "@/components/admin/BotCommandsManager";
import { UserActionMenu } from "@/components/admin/UserActionMenu";

type Tab = "overview" | "users" | "conversations" | "broadcast";

interface BotUser {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  platform: string | null;
  telegram_id: string | null;
  telegram_username: string | null;
  whatsapp_id: string | null;
  whatsapp_number: string | null;
  entity_type: string | null;
  onboarding_completed: boolean | null;
  verification_status: string | null;
  subscription_tier: string | null;
  is_blocked: boolean | null;
  created_at: string | null;
}

interface Message {
  id: string;
  content: string | null;
  direction: string;
  message_type: string | null;
  created_at: string | null;
  media_url: string | null;
}

interface ConversationState {
  id: string;
  telegram_id: string | null;
  whatsapp_id: string | null;
  expecting: string | null;
  context: Record<string, unknown> | null;
  updated_at: string | null;
}

export default function AdminChatbots() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const tabs = [
    { id: "overview" as Tab, name: "Overview", icon: Radio },
    { id: "users" as Tab, name: "Bot Users", icon: Users },
    { id: "conversations" as Tab, name: "Conversations", icon: MessagesSquare },
    { id: "broadcast" as Tab, name: "Broadcast", icon: Send },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Chatbot Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage Telegram and WhatsApp bot users, conversations, and broadcasts
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.name}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "users" && <UsersTab />}
      {activeTab === "conversations" && <ConversationsTab />}
      {activeTab === "broadcast" && <BroadcastTab />}
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    telegramUsers: 0,
    whatsappUsers: 0,
    onboardedUsers: 0,
    verifiedUsers: 0,
    totalMessages: 0,
    totalReceipts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{ telegram: string; whatsapp: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchStats();
    fetchSettings();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const [usersRes, messagesRes, receiptsRes] = await Promise.all([
        supabase.from("users").select("id, platform, onboarding_completed, verification_status"),
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("receipts").select("id", { count: "exact", head: true }),
      ]);

      const users = usersRes.data || [];
      setStats({
        totalUsers: users.length,
        telegramUsers: users.filter((u) => u.platform === "telegram").length,
        whatsappUsers: users.filter((u) => u.platform === "whatsapp").length,
        onboardedUsers: users.filter((u) => u.onboarding_completed).length,
        verifiedUsers: users.filter((u) => u.verification_status === "verified").length,
        totalMessages: messagesRes.count || 0,
        totalReceipts: receiptsRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSettings() {
    const { data } = await supabase.from("system_settings").select("telegram_enabled, whatsapp_enabled").maybeSingle();
    if (data) {
      setTelegramEnabled(data.telegram_enabled ?? true);
      setWhatsappEnabled(data.whatsapp_enabled ?? true);
    }
  }

  async function toggleBot(platform: "telegram" | "whatsapp") {
    const newEnabled = platform === "telegram" ? !telegramEnabled : !whatsappEnabled;
    setToggling(platform);
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: { action: "toggle-bot", platform, enabled: newEnabled },
      });
      if (response.error) throw response.error;
      if (platform === "telegram") setTelegramEnabled(newEnabled);
      else setWhatsappEnabled(newEnabled);
      toast({ title: "Success", description: `${platform} bot ${newEnabled ? "enabled" : "disabled"}` });
    } catch (error) {
      console.error("Toggle error:", error);
      toast({ title: "Error", description: "Failed to toggle bot", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  }

  async function testConnections() {
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", { body: { action: "health" } });
      if (response.error) throw response.error;
      setHealthStatus(response.data);
      toast({
        title: "Connection Status",
        description: `Telegram: ${response.data.telegram}, WhatsApp: ${response.data.whatsapp}`,
      });
    } catch (error) {
      console.error("Health check error:", error);
      toast({ title: "Error", description: "Connection test failed", variant: "destructive" });
    }
  }

  async function syncTelegramCommands() {
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: { action: "update-commands", platform: "telegram" },
      });
      if (response.error) throw response.error;
      toast({ title: "Success", description: `Synced ${response.data.commandsSet} commands to Telegram` });
    } catch (error) {
      console.error("Sync error:", error);
      toast({ title: "Error", description: "Failed to sync commands", variant: "destructive" });
    }
  }

  async function clearAllStates() {
    if (!confirm("Clear all conversation states? This will unstick all users.")) return;
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", { body: { action: "clear-all-states" } });
      if (response.error) throw response.error;
      toast({ title: "Success", description: "All conversation states cleared" });
    } catch (error) {
      console.error("Clear states error:", error);
      toast({ title: "Error", description: "Failed to clear states", variant: "destructive" });
    }
  }

  const statCards = [
    { label: "Total Bot Users", value: stats.totalUsers, icon: Users, color: "text-blue-500" },
    { label: "Telegram Users", value: stats.telegramUsers, icon: Bot, color: "text-sky-500" },
    { label: "WhatsApp Users", value: stats.whatsappUsers, icon: Smartphone, color: "text-green-500" },
    { label: "Onboarded", value: stats.onboardedUsers, icon: CheckCircle2, color: "text-emerald-500" },
    { label: "Verified", value: stats.verifiedUsers, icon: CheckCircle2, color: "text-purple-500" },
    { label: "Total Messages", value: stats.totalMessages, icon: MessageSquare, color: "text-orange-500" },
    { label: "Receipts Processed", value: stats.totalReceipts, icon: MessagesSquare, color: "text-pink-500" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <stat.icon className={cn("w-8 h-8", stat.color)} />
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Status with Toggles */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Platform Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-background rounded-lg">
              <div className="flex items-center gap-3">
                <Bot className="w-5 h-5 text-sky-500" />
                <div>
                  <span className="text-foreground">Telegram Bot</span>
                  {healthStatus && (
                    <p className="text-xs text-muted-foreground">API: {healthStatus.telegram}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("flex items-center gap-2 text-sm", telegramEnabled ? "text-green-500" : "text-muted-foreground")}>
                  <span className={cn("w-2 h-2 rounded-full", telegramEnabled ? "bg-green-500 animate-pulse" : "bg-muted-foreground")} />
                  {telegramEnabled ? "Online" : "Disabled"}
                </span>
                <button onClick={() => toggleBot("telegram")} disabled={toggling === "telegram"} className="p-1 hover:bg-accent rounded">
                  {toggling === "telegram" ? <RefreshCw className="w-5 h-5 animate-spin" /> : telegramEnabled ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-background rounded-lg">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-green-500" />
                <div>
                  <span className="text-foreground">WhatsApp (360dialog)</span>
                  {healthStatus && (
                    <p className="text-xs text-muted-foreground">API: {healthStatus.whatsapp}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("flex items-center gap-2 text-sm", whatsappEnabled ? "text-green-500" : "text-muted-foreground")}>
                  <span className={cn("w-2 h-2 rounded-full", whatsappEnabled ? "bg-green-500 animate-pulse" : "bg-muted-foreground")} />
                  {whatsappEnabled ? "Online" : "Disabled"}
                </span>
                <button onClick={() => toggleBot("whatsapp")} disabled={toggling === "whatsapp"} className="p-1 hover:bg-accent rounded">
                  {toggling === "whatsapp" ? <RefreshCw className="w-5 h-5 animate-spin" /> : whatsappEnabled ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions - Platform Aware */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Quick Actions</h3>
          <div className="space-y-4">
            {/* Shared Actions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">General</p>
              <button onClick={testConnections} className="w-full text-left px-4 py-3 bg-background rounded-lg hover:bg-accent transition-colors flex items-center gap-3">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-foreground">Test Platform Connections</span>
              </button>
              <button onClick={clearAllStates} className="w-full text-left px-4 py-3 bg-background rounded-lg hover:bg-accent transition-colors flex items-center gap-3">
                <Trash2 className="w-4 h-4 text-destructive" />
                <span className="text-foreground">Clear All Conversation States</span>
              </button>
            </div>

            {/* Telegram Actions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Bot className="w-3 h-3" /> Telegram
              </p>
              <button onClick={() => setShowCommands(!showCommands)} className="w-full text-left px-4 py-3 bg-background rounded-lg hover:bg-accent transition-colors flex items-center gap-3">
                <Terminal className="w-4 h-4 text-sky-500" />
                <span className="text-foreground">Manage Menu Commands</span>
              </button>
              <button onClick={syncTelegramCommands} className="w-full text-left px-4 py-3 bg-background rounded-lg hover:bg-accent transition-colors flex items-center gap-3">
                <RefreshCw className="w-4 h-4 text-sky-500" />
                <span className="text-foreground">Sync Commands to Telegram</span>
              </button>
            </div>

            {/* WhatsApp Actions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Smartphone className="w-3 h-3" /> WhatsApp
              </p>
              <div className="w-full text-left px-4 py-3 bg-background rounded-lg flex items-center gap-3 text-muted-foreground">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Templates managed via 360dialog dashboard</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bot Commands Section */}
      {showCommands && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Telegram Menu Commands</h3>
          <BotCommandsManager platform="telegram" />
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<BotUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, first_name, last_name, platform, telegram_id, telegram_username, whatsapp_id, whatsapp_number, entity_type, onboarding_completed, verification_status, subscription_tier, is_blocked, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ title: "Error", description: "Failed to fetch bot users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      (user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.telegram_username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.whatsapp_number?.includes(searchTerm));
    const matchesPlatform = platformFilter === "all" || user.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, username, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
        >
          <option value="all">All Platforms</option>
          <option value="telegram">Telegram</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-accent/50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Platform</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Entity Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Onboarding</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Verification</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className={cn("hover:bg-accent/30 transition-colors", user.is_blocked && "opacity-60")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-foreground font-medium">
                          {user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {user.telegram_username ? `@${user.telegram_username}` : user.whatsapp_number || "N/A"}
                        </p>
                      </div>
                      {user.is_blocked && <Ban className="w-4 h-4 text-destructive" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", user.platform === "telegram" ? "bg-sky-500/20 text-sky-500" : "bg-green-500/20 text-green-500")}>
                      {user.platform === "telegram" ? <Bot className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                      {user.platform || "Unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground capitalize">{user.entity_type || "-"}</td>
                  <td className="px-4 py-3">
                    {user.onboarding_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <span className="text-muted-foreground text-sm">Incomplete</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-sm", user.verification_status === "verified" ? "text-green-500" : "text-muted-foreground")}>
                      {user.verification_status || "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <UserActionMenu 
                      userId={user.id}
                      userName={user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown"}
                      platform={user.platform}
                      isBlocked={user.is_blocked}
                      verificationStatus={user.verification_status}
                      subscriptionTier={user.subscription_tier}
                      onUpdate={fetchUsers} 
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConversationsTab() {
  const [users, setUsers] = useState<BotUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<ConversationState | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchConversation(selectedUser);
    }
  }, [selectedUser]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("users")
        .select("id, full_name, first_name, last_name, platform, telegram_id, telegram_username, whatsapp_id, whatsapp_number, entity_type, onboarding_completed, verification_status, is_blocked, created_at")
        .order("created_at", { ascending: false });
      setUsers(data || []);
    } finally {
      setLoading(false);
    }
  }

  async function fetchConversation(userId: string) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    // Fetch messages
    const { data: messagesData } = await supabase
      .from("messages")
      .select("id, content, direction, message_type, created_at, media_url")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    setMessages(messagesData || []);

    // Fetch conversation state
    let stateQuery = supabase.from("conversation_state").select("*");
    if (user.telegram_id) {
      stateQuery = stateQuery.eq("telegram_id", user.telegram_id);
    } else if (user.whatsapp_id) {
      stateQuery = stateQuery.eq("whatsapp_id", user.whatsapp_id);
    }
    const { data: stateData } = await stateQuery.maybeSingle();
    setState(stateData);
  }

  async function clearUserState() {
    if (!selectedUser) return;
    const user = users.find((u) => u.id === selectedUser);
    if (!user) return;

    try {
      await supabase.functions.invoke("admin-bot-messaging", {
        body: { action: "clear-user-data", userId: selectedUser, clearOption: "state" },
      });
      toast({ title: "Success", description: "Conversation state cleared" });
      fetchConversation(selectedUser);
    } catch {
      toast({ title: "Error", description: "Failed to clear state", variant: "destructive" });
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* User List */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-lg font-medium text-foreground mb-4">Select User</h3>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-4">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg transition-colors",
                  selectedUser === user.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
              >
                <p className="font-medium text-sm">
                  {user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown"}
                </p>
                <p className={cn("text-xs", selectedUser === user.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {user.platform} • {user.telegram_username ? `@${user.telegram_username}` : user.whatsapp_number || "N/A"}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversation View */}
      <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
        {selectedUser ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-foreground">Conversation</h3>
              <button
                onClick={clearUserState}
                className="px-3 py-1 text-sm bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
              >
                Clear State
              </button>
            </div>

            {/* Current State */}
            {state && (
              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-sm font-medium text-foreground">Current State</p>
                <p className="text-sm text-muted-foreground">Expecting: {state.expecting || "Nothing"}</p>
                {state.context && Object.keys(state.context).length > 0 && (
                  <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">
                    {JSON.stringify(state.context, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Messages */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No messages yet</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "p-3 rounded-lg max-w-[80%]",
                      msg.direction === "incoming" ? "bg-accent ml-0" : "bg-primary/10 ml-auto"
                    )}
                  >
                    <p className="text-sm text-foreground">{msg.content || "[Media]"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {msg.created_at ? new Date(msg.created_at).toLocaleString() : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Select a user to view their conversation
          </div>
        )}
      </div>
    </div>
  );
}

function BroadcastTab() {
  const [mode, setMode] = useState<"broadcast" | "segment" | "direct">("broadcast");
  const [message, setMessage] = useState("");
  const [platform, setPlatform] = useState<"all" | "telegram" | "whatsapp">("all");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<BotUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [filters, setFilters] = useState({ entityType: "all", onboarded: "all", verified: "all" });
  const { toast } = useToast();

  useEffect(() => {
    if (mode === "direct") {
      fetchUsers();
    }
  }, [mode]);

  async function fetchUsers() {
    const { data } = await supabase
      .from("users")
      .select("id, full_name, first_name, last_name, platform, telegram_id, telegram_username, whatsapp_id, whatsapp_number, entity_type, onboarding_completed, verification_status, is_blocked, created_at")
      .or("is_blocked.is.null,is_blocked.eq.false")
      .order("created_at", { ascending: false });
    setUsers(data || []);
  }

  async function sendBroadcast() {
    if (!message.trim()) {
      toast({ title: "Error", description: "Please enter a message", variant: "destructive" });
      return;
    }

    if (mode === "direct" && !selectedUserId) {
      toast({ title: "Error", description: "Please select a user", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const body: Record<string, unknown> = {
        action: mode === "segment" ? "segment-broadcast" : mode,
        message,
        platform,
      };

      if (mode === "direct") {
        body.userId = selectedUserId;
      } else if (mode === "segment") {
        body.filters = filters;
      }

      const response = await supabase.functions.invoke("admin-bot-messaging", { body });
      if (response.error) throw response.error;

      toast({
        title: "Success",
        description: `Sent to ${response.data.sent} users (${response.data.failed} failed)`,
      });
      setMessage("");
    } catch (error) {
      console.error("Broadcast error:", error);
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">Send Message</h3>

        {/* Mode Selection */}
        <div className="flex gap-2 mb-4">
          {[
            { id: "broadcast", label: "Broadcast All" },
            { id: "segment", label: "Segment" },
            { id: "direct", label: "Direct" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id as typeof mode)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                mode === m.id ? "bg-primary text-primary-foreground" : "bg-accent text-foreground hover:bg-accent/80"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Platform Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as typeof platform)}
            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
          >
            <option value="all">All Platforms</option>
            <option value="telegram">Telegram Only</option>
            <option value="whatsapp">WhatsApp Only</option>
          </select>
        </div>

        {/* Segment Filters */}
        {mode === "segment" && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Entity Type</label>
              <select
                value={filters.entityType}
                onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              >
                <option value="all">All</option>
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Onboarded</label>
              <select
                value={filters.onboarded}
                onChange={(e) => setFilters({ ...filters, onboarded: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Verified</label>
              <select
                value={filters.verified}
                onChange={(e) => setFilters({ ...filters, verified: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              >
                <option value="all">All</option>
                <option value="verified">Verified</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        )}

        {/* Direct Message User Selection */}
        {mode === "direct" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">Select User</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
            >
              <option value="">Select a user...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown"} ({user.platform})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Message Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your message... (HTML supported for Telegram)"
            rows={4}
            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Send Button */}
        <button
          onClick={sendBroadcast}
          disabled={sending || !message.trim()}
          className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? "Sending..." : "Send Message"}
        </button>
      </div>
    </div>
  );
}
