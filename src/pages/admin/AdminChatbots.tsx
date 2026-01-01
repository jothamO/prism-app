import { useState, useEffect } from "react";
import {
  Bot,
  MessageSquare,
  Users,
  Send,
  Radio,
  RefreshCw,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Smartphone,
  MessagesSquare
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  const { toast } = useToast();

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

  useEffect(() => {
    fetchStats();
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Platform Status */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Platform Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-background rounded-lg">
              <div className="flex items-center gap-3">
                <Bot className="w-5 h-5 text-sky-500" />
                <span className="text-foreground">Telegram Bot</span>
              </div>
              <span className="flex items-center gap-2 text-sm text-green-500">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Online
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-background rounded-lg">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-green-500" />
                <span className="text-foreground">WhatsApp (360dialog)</span>
              </div>
              <span className="flex items-center gap-2 text-sm text-green-500">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Online
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button className="w-full text-left px-4 py-3 bg-background rounded-lg hover:bg-accent transition-colors flex items-center gap-3">
              <Send className="w-4 h-4 text-primary" />
              <span className="text-foreground">Send Broadcast Message</span>
            </button>
            <button className="w-full text-left px-4 py-3 bg-background rounded-lg hover:bg-accent transition-colors flex items-center gap-3">
              <RefreshCw className="w-4 h-4 text-primary" />
              <span className="text-foreground">Test Webhook Connection</span>
            </button>
            <button className="w-full text-left px-4 py-3 bg-background rounded-lg hover:bg-accent transition-colors flex items-center gap-3">
              <Eye className="w-4 h-4 text-primary" />
              <span className="text-foreground">View Recent Errors</span>
            </button>
          </div>
        </div>
      </div>
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
        .select("id, full_name, first_name, last_name, platform, telegram_id, telegram_username, whatsapp_id, whatsapp_number, entity_type, onboarding_completed, verification_status, created_at")
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
                <tr key={user.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-foreground font-medium">
                        {user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {user.telegram_username ? `@${user.telegram_username}` : user.whatsapp_number || "N/A"}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                        user.platform === "telegram"
                          ? "bg-sky-500/20 text-sky-500"
                          : "bg-green-500/20 text-green-500"
                      )}
                    >
                      {user.platform === "telegram" ? <Bot className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                      {user.platform || "Unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground capitalize">
                    {user.entity_type || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {user.onboarding_completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-500" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 py-1 rounded-full text-xs font-medium",
                        user.verification_status === "verified"
                          ? "bg-green-500/20 text-green-500"
                          : user.verification_status === "pending"
                          ? "bg-yellow-500/20 text-yellow-500"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {user.verification_status || "none"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="p-2 hover:bg-accent rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
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
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const { data } = await supabase
      .from("users")
      .select("id, full_name, first_name, last_name, platform, telegram_username, whatsapp_number")
      .order("created_at", { ascending: false });
    setUsers(data || []);
  }

  async function fetchConversation(userId: string) {
    setLoading(true);
    try {
      // Get user details first
      const { data: userData } = await supabase
        .from("users")
        .select("telegram_id, whatsapp_id")
        .eq("id", userId)
        .single();

      // Fetch messages
      const { data: msgData } = await supabase
        .from("messages")
        .select("id, content, direction, message_type, created_at, media_url")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      setMessages(msgData || []);

      // Fetch conversation state
      if (userData) {
        let stateQuery = supabase.from("conversation_state").select("*");
        if (userData.telegram_id) {
          stateQuery = stateQuery.eq("telegram_id", userData.telegram_id);
        } else if (userData.whatsapp_id) {
          stateQuery = stateQuery.eq("whatsapp_id", userData.whatsapp_id);
        }
        const { data: stateData } = await stateQuery.maybeSingle();
        setConversationState(stateData as ConversationState | null);
      }
    } catch (error) {
      console.error("Error fetching conversation:", error);
      toast({ title: "Error", description: "Failed to load conversation", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function clearConversationState() {
    if (!conversationState?.id) return;
    try {
      await supabase
        .from("conversation_state")
        .update({ expecting: null, context: {} })
        .eq("id", conversationState.id);
      toast({ title: "Success", description: "Conversation state cleared" });
      if (selectedUserId) fetchConversation(selectedUserId);
    } catch (error) {
      toast({ title: "Error", description: "Failed to clear state", variant: "destructive" });
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* User Selector */}
      <div className="lg:col-span-1 bg-card border border-border rounded-xl p-4">
        <h3 className="text-lg font-medium text-foreground mb-4">Select User</h3>
        <select
          value={selectedUserId}
          onChange={(e) => {
            setSelectedUserId(e.target.value);
            if (e.target.value) fetchConversation(e.target.value);
          }}
          className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground mb-4"
        >
          <option value="">Choose a user...</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.telegram_username || user.whatsapp_number || "Unknown"}
            </option>
          ))}
        </select>

        {conversationState && (
          <div className="space-y-3 pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-muted-foreground">Conversation State</h4>
            <div className="bg-background p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Expecting:</p>
              <p className="text-foreground font-mono text-sm">{conversationState.expecting || "None"}</p>
            </div>
            {conversationState.context && Object.keys(conversationState.context).length > 0 && (
              <div className="bg-background p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">Context:</p>
                <pre className="text-foreground font-mono text-xs overflow-auto max-h-32">
                  {JSON.stringify(conversationState.context, null, 2)}
                </pre>
              </div>
            )}
            <button
              onClick={clearConversationState}
              className="w-full px-4 py-2 bg-destructive/20 text-destructive rounded-lg hover:bg-destructive/30 transition-colors text-sm"
            >
              Clear State (Unstick User)
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
        <h3 className="text-lg font-medium text-foreground mb-4">Message History</h3>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !selectedUserId ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            Select a user to view their conversation
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No messages found for this user
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[80%] p-3 rounded-lg",
                  msg.direction === "incoming"
                    ? "bg-accent text-foreground"
                    : "bg-primary text-primary-foreground ml-auto"
                )}
              >
                <p className="text-sm">{msg.content || "[Media message]"}</p>
                <p className="text-xs opacity-70 mt-1">
                  {msg.created_at ? new Date(msg.created_at).toLocaleString() : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BroadcastTab() {
  const [mode, setMode] = useState<"all" | "segment" | "direct">("all");
  const [message, setMessage] = useState("");
  const [platform, setPlatform] = useState<"all" | "telegram" | "whatsapp">("all");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [users, setUsers] = useState<BotUser[]>([]);
  const [sending, setSending] = useState(false);
  const [filters, setFilters] = useState({
    entityType: "all",
    onboarded: "all",
    verified: "all",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const { data } = await supabase
      .from("users")
      .select("id, full_name, first_name, last_name, platform, telegram_username, whatsapp_number, entity_type, onboarding_completed, verification_status")
      .order("created_at", { ascending: false });
    setUsers(data || []);
  }

  async function sendMessage() {
    if (!message.trim()) {
      toast({ title: "Error", description: "Please enter a message", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // In a real implementation, this would call the edge function
      // For now, we'll just log the broadcast to the database
      const filterData = mode === "segment" ? filters : null;
      const targetUserId = mode === "direct" ? selectedUserId : null;

      await supabase.from("broadcast_messages").insert({
        admin_user_id: (await supabase.auth.getUser()).data.user?.id,
        platform: mode === "direct" ? users.find(u => u.id === selectedUserId)?.platform || "all" : platform,
        message_text: message,
        filters: filterData,
        status: "pending",
      });

      toast({
        title: "Broadcast Queued",
        description: mode === "direct" 
          ? "Direct message queued for delivery" 
          : `Broadcast queued for ${platform === "all" ? "all platforms" : platform}`,
      });
      setMessage("");
    } catch (error) {
      console.error("Error sending broadcast:", error);
      toast({ title: "Error", description: "Failed to queue broadcast", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  const filteredUserCount = users.filter((u) => {
    if (platform !== "all" && u.platform !== platform) return false;
    if (filters.entityType !== "all" && u.entity_type !== filters.entityType) return false;
    if (filters.onboarded !== "all") {
      const isOnboarded = u.onboarding_completed;
      if (filters.onboarded === "yes" && !isOnboarded) return false;
      if (filters.onboarded === "no" && isOnboarded) return false;
    }
    if (filters.verified !== "all" && u.verification_status !== filters.verified) return false;
    return true;
  }).length;

  return (
    <div className="space-y-6">
      {/* Mode Selector */}
      <div className="flex gap-2">
        {[
          { id: "all", label: "Broadcast All" },
          { id: "segment", label: "Segmented" },
          { id: "direct", label: "Direct Message" },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id as typeof mode)}
            className={cn(
              "px-4 py-2 rounded-lg transition-colors",
              mode === m.id
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-foreground hover:bg-accent/80"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Composer */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">
            {mode === "all" && "Broadcast to All Users"}
            {mode === "segment" && "Segmented Broadcast"}
            {mode === "direct" && "Direct Message"}
          </h3>

          {mode === "direct" && (
            <div className="mb-4">
              <label className="text-sm font-medium text-muted-foreground block mb-2">
                Select Recipient
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
              >
                <option value="">Choose a user...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.telegram_username || user.whatsapp_number || "Unknown"} ({user.platform})
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode !== "direct" && (
            <div className="mb-4">
              <label className="text-sm font-medium text-muted-foreground block mb-2">
                Platform
              </label>
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
          )}

          {mode === "segment" && (
            <div className="mb-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">
                  Entity Type
                </label>
                <select
                  value={filters.entityType}
                  onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
                >
                  <option value="all">All Types</option>
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">
                  Onboarding Status
                </label>
                <select
                  value={filters.onboarded}
                  onChange={(e) => setFilters({ ...filters, onboarded: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
                >
                  <option value="all">All</option>
                  <option value="yes">Completed</option>
                  <option value="no">Not Completed</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">
                  Verification Status
                </label>
                <select
                  value={filters.verified}
                  onChange={(e) => setFilters({ ...filters, verified: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
                >
                  <option value="all">All</option>
                  <option value="verified">Verified</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-sm font-medium text-muted-foreground block mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message..."
              rows={4}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={sendMessage}
            disabled={sending || !message.trim() || (mode === "direct" && !selectedUserId)}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending..." : "Send Message"}
          </button>
        </div>

        {/* Preview & Stats */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Preview & Recipients</h3>

          <div className="bg-background rounded-lg p-4 mb-4">
            <p className="text-sm text-muted-foreground mb-2">Message Preview:</p>
            <p className="text-foreground whitespace-pre-wrap">
              {message || "Your message will appear here..."}
            </p>
          </div>

          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">Recipients:</p>
            <p className="text-2xl font-bold text-foreground">
              {mode === "direct" ? (selectedUserId ? "1 user" : "0 users") : `${filteredUserCount} users`}
            </p>
            {mode !== "direct" && (
              <p className="text-sm text-muted-foreground">
                Platform: {platform === "all" ? "Telegram & WhatsApp" : platform}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
