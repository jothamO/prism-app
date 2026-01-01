import { useState, useEffect } from "react";
import {
  X,
  User,
  Bot,
  Smartphone,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Receipt,
  MessageSquare,
  Building2,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  platform: string | null;
  telegram_id: string | null;
  telegram_username: string | null;
  whatsapp_id: string | null;
  whatsapp_number: string | null;
  entity_type: string | null;
  business_name: string | null;
  company_name: string | null;
  nin: string | null;
  cac_number: string | null;
  tin: string | null;
  onboarding_completed: boolean | null;
  onboarding_step: number | null;
  verification_status: string | null;
  verified_at: string | null;
  is_blocked: boolean | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Receipt {
  id: string;
  merchant: string | null;
  amount: number | null;
  date: string | null;
  category: string | null;
  confirmed: boolean | null;
  created_at: string | null;
}

interface Message {
  id: string;
  content: string | null;
  direction: string;
  message_type: string | null;
  created_at: string | null;
}

export function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"details" | "receipts" | "messages">("details");

  useEffect(() => {
    fetchUserData();
  }, [userId]);

  async function fetchUserData() {
    setLoading(true);
    try {
      const [profileRes, receiptsRes, messagesRes] = await Promise.all([
        supabase.from("users").select("*").eq("id", userId).single(),
        supabase.from("receipts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
        supabase.from("messages").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      ]);

      setProfile(profileRes.data as UserProfile | null);
      setReceipts(receiptsRes.data || []);
      setMessages(messagesRes.data || []);
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  }

  const displayName = profile?.full_name || 
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || 
    profile?.telegram_username || 
    profile?.whatsapp_number || 
    "Unknown User";

  const onboardingSteps = [
    { step: 0, label: "Started" },
    { step: 1, label: "Entity Selected" },
    { step: 2, label: "ID Provided" },
    { step: 3, label: "Verified" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
              <p className="text-sm text-muted-foreground">User Profile</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : profile ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border">
              {[
                { id: "details", label: "Details", icon: User },
                { id: "receipts", label: `Receipts (${receipts.length})`, icon: Receipt },
                { id: "messages", label: `Messages (${messages.length})`, icon: MessageSquare },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2",
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(85vh-180px)]">
              {activeTab === "details" && (
                <div className="space-y-6">
                  {/* Status Badges */}
                  <div className="flex flex-wrap gap-2">
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
                      profile.platform === "telegram" ? "bg-sky-500/20 text-sky-500" : "bg-green-500/20 text-green-500"
                    )}>
                      {profile.platform === "telegram" ? <Bot className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                      {profile.platform}
                    </span>
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      profile.verification_status === "verified"
                        ? "bg-green-500/20 text-green-500"
                        : profile.verification_status === "pending"
                        ? "bg-yellow-500/20 text-yellow-500"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {profile.verification_status || "unverified"}
                    </span>
                    {profile.is_blocked && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/20 text-destructive">
                        Blocked
                      </span>
                    )}
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                      profile.subscription_status === "active" ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground"
                    )}>
                      {profile.subscription_tier || "basic"} · {profile.subscription_status || "trial"}
                    </span>
                  </div>

                  {/* Onboarding Progress */}
                  <div className="bg-accent/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-foreground mb-3">Onboarding Progress</p>
                    <div className="flex items-center gap-2">
                      {onboardingSteps.map((step, i) => (
                        <div key={step.step} className="flex items-center gap-2">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                            (profile.onboarding_step || 0) >= step.step
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {(profile.onboarding_step || 0) > step.step ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              step.step + 1
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground hidden sm:inline">{step.label}</span>
                          {i < onboardingSteps.length - 1 && (
                            <div className={cn(
                              "w-8 h-0.5",
                              (profile.onboarding_step || 0) > step.step ? "bg-primary" : "bg-muted"
                            )} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Entity Type" value={profile.entity_type} capitalize />
                    <DetailItem label="Business Name" value={profile.business_name || profile.company_name} />
                    <DetailItem label="NIN" value={profile.nin} masked />
                    <DetailItem label="CAC Number" value={profile.cac_number} />
                    <DetailItem label="TIN" value={profile.tin} />
                    <DetailItem label="Email" value={profile.email} />
                    <DetailItem 
                      label="Telegram" 
                      value={profile.telegram_username ? `@${profile.telegram_username}` : profile.telegram_id} 
                    />
                    <DetailItem label="WhatsApp" value={profile.whatsapp_number} />
                    <DetailItem 
                      label="Created" 
                      value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : null}
                      icon={<Calendar className="w-3 h-3" />}
                    />
                    <DetailItem 
                      label="Verified At" 
                      value={profile.verified_at ? new Date(profile.verified_at).toLocaleDateString() : null}
                      icon={<CheckCircle2 className="w-3 h-3" />}
                    />
                  </div>

                  {/* Blocked Info */}
                  {profile.is_blocked && profile.blocked_reason && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                      <p className="text-sm font-medium text-destructive mb-1">Blocked</p>
                      <p className="text-sm text-destructive/80">{profile.blocked_reason}</p>
                      <p className="text-xs text-destructive/60 mt-1">
                        {profile.blocked_at ? new Date(profile.blocked_at).toLocaleString() : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "receipts" && (
                <div className="space-y-3">
                  {receipts.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No receipts found</p>
                  ) : (
                    receipts.map((receipt) => (
                      <div key={receipt.id} className="flex items-center justify-between p-3 bg-accent/30 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-foreground">{receipt.merchant || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            {receipt.category} · {receipt.date || "No date"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">
                            ₦{receipt.amount?.toLocaleString() || "N/A"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {receipt.confirmed ? (
                              <span className="text-green-500">Confirmed</span>
                            ) : (
                              <span className="text-yellow-500">Pending</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "messages" && (
                <div className="space-y-2">
                  {messages.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No messages found</p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "max-w-[80%] p-3 rounded-lg",
                          msg.direction === "incoming"
                            ? "bg-accent text-foreground"
                            : "bg-primary text-primary-foreground ml-auto"
                        )}
                      >
                        <p className="text-sm">{msg.content || "[Media]"}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {msg.created_at ? new Date(msg.created_at).toLocaleString() : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            User not found
          </div>
        )}
      </div>
    </div>
  );
}

function DetailItem({ 
  label, 
  value, 
  capitalize = false, 
  masked = false,
  icon 
}: { 
  label: string; 
  value: string | null | undefined; 
  capitalize?: boolean; 
  masked?: boolean;
  icon?: React.ReactNode;
}) {
  const displayValue = masked && value 
    ? `${value.slice(0, 3)}****${value.slice(-2)}` 
    : value;

  return (
    <div className="bg-background border border-border rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={cn(
        "text-sm text-foreground font-medium",
        capitalize && "capitalize",
        !displayValue && "text-muted-foreground"
      )}>
        {displayValue || "—"}
      </p>
    </div>
  );
}
