import { useState, useEffect } from "react";
import {
  X,
  User,
  Bot,
  Smartphone,
  Calendar,
  CheckCircle2,
  Clock,
  Receipt,
  MessageSquare,
  RefreshCw,
  Brain,
  Edit,
  Globe,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ProfileLearningTab } from "./ProfileLearningTab";
import { RoleManager } from "./RoleManager";
import { UserEditForm } from "./UserEditForm";
import { UserActivityTab } from "./UserActivityTab";

interface UserProfileModalProps {
  userId: string;
  platform: string;
  onClose: () => void;
}

interface UnifiedProfile {
  id: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  phone?: string | null;
  platform: string;
  avatar_url?: string | null;
  telegram_id?: string | null;
  telegram_username?: string | null;
  whatsapp_id?: string | null;
  whatsapp_number?: string | null;
  entity_type?: string | null;
  business_name?: string | null;
  company_name?: string | null;
  nin?: string | null;
  nin_verified?: boolean | null;
  bvn_verified?: boolean | null;
  cac_number?: string | null;
  tin?: string | null;
  occupation?: string | null;
  location?: string | null;
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
  verification_status?: string | null;
  verified_at?: string | null;
  is_blocked?: boolean | null;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  // Linked bot account info (for web users)
  linked_telegram_id?: string | null;
  linked_whatsapp_number?: string | null;
  has_bot_account?: boolean;
}

interface ReceiptData {
  id: string;
  merchant: string | null;
  amount: number | null;
  date: string | null;
  category: string | null;
  confirmed: boolean | null;
  created_at: string | null;
}

interface MessageData {
  id: string;
  content: string | null;
  direction: string;
  message_type: string | null;
  created_at: string | null;
}

type TabId = "details" | "receipts" | "messages" | "learning" | "activity";

export function UserProfileModal({ userId, platform, onClose }: UserProfileModalProps) {
  const [profile, setProfile] = useState<UnifiedProfile | null>(null);
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, [userId, platform]);

  async function fetchUserData() {
    setLoading(true);
    try {
      let profileData: UnifiedProfile | null = null;
      let botUserId: string | null = null;

      if (platform === "web") {
        // Query profiles table for web users
        const { data: webProfile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (profileError) throw profileError;

        if (webProfile) {
          profileData = {
            id: webProfile.id,
            full_name: webProfile.full_name,
            email: webProfile.email,
            avatar_url: webProfile.avatar_url,
            platform: "web",
            created_at: webProfile.created_at,
            updated_at: webProfile.updated_at,
            onboarding_completed: true,
            onboarding_step: 4,
          };

          // Check for linked bot account
          const { data: linkedBot } = await supabase
            .from("users")
            .select("*")
            .eq("auth_user_id", userId)
            .single();

          if (linkedBot) {
            botUserId = linkedBot.id;
            profileData = {
              ...profileData,
              telegram_id: linkedBot.telegram_id,
              telegram_username: linkedBot.telegram_username,
              whatsapp_number: linkedBot.whatsapp_number,
              entity_type: linkedBot.entity_type,
              business_name: linkedBot.business_name,
              occupation: linkedBot.occupation,
              location: linkedBot.location,
              nin: linkedBot.nin,
              nin_verified: linkedBot.nin_verified,
              bvn_verified: linkedBot.bvn_verified,
              cac_number: linkedBot.cac_number,
              tin: linkedBot.tin,
              onboarding_completed: linkedBot.onboarding_completed,
              onboarding_step: linkedBot.onboarding_step,
              verification_status: linkedBot.verification_status,
              is_blocked: linkedBot.is_blocked,
              subscription_tier: linkedBot.subscription_tier,
              subscription_status: linkedBot.subscription_status,
              linked_telegram_id: linkedBot.telegram_id,
              linked_whatsapp_number: linkedBot.whatsapp_number,
              has_bot_account: true,
            };
          }
        }
      } else {
        // Query users table for bot users
        const { data: botUser, error } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .single();

        if (error) throw error;

        if (botUser) {
          botUserId = botUser.id;
          profileData = {
            id: botUser.id,
            full_name: botUser.full_name,
            first_name: botUser.first_name,
            last_name: botUser.last_name,
            email: botUser.email,
            platform: botUser.platform || platform,
            telegram_id: botUser.telegram_id,
            telegram_username: botUser.telegram_username,
            whatsapp_id: botUser.whatsapp_id,
            whatsapp_number: botUser.whatsapp_number,
            entity_type: botUser.entity_type,
            business_name: botUser.business_name,
            company_name: botUser.company_name,
            nin: botUser.nin,
            nin_verified: botUser.nin_verified,
            bvn_verified: botUser.bvn_verified,
            cac_number: botUser.cac_number,
            tin: botUser.tin,
            occupation: botUser.occupation,
            location: botUser.location,
            onboarding_completed: botUser.onboarding_completed,
            onboarding_step: botUser.onboarding_step,
            verification_status: botUser.verification_status,
            verified_at: botUser.verified_at,
            is_blocked: botUser.is_blocked,
            blocked_at: botUser.blocked_at,
            blocked_reason: botUser.blocked_reason,
            subscription_tier: botUser.subscription_tier,
            subscription_status: botUser.subscription_status,
            created_at: botUser.created_at,
            updated_at: botUser.updated_at,
            has_bot_account: true,
          };
        }
      }

      setProfile(profileData);

      // Fetch receipts and messages if user has bot account
      if (botUserId || platform !== "web") {
        const queryUserId = botUserId || userId;
        const [receiptsRes, messagesRes] = await Promise.all([
          supabase.from("receipts").select("*").eq("user_id", queryUserId).order("created_at", { ascending: false }).limit(10),
          supabase.from("messages").select("*").eq("user_id", queryUserId).order("created_at", { ascending: false }).limit(20),
        ]);
        setReceipts(receiptsRes.data || []);
        setMessages(messagesRes.data || []);
      }
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
    profile?.email ||
    "Unknown User";

  const onboardingSteps = [
    { step: 0, label: "Started" },
    { step: 1, label: "Entity Selected" },
    { step: 2, label: "ID Provided" },
    { step: 3, label: "Verified" },
  ];

  // Build tabs based on available data
  const hasMessagingData = profile?.has_bot_account || platform !== "web";
  const tabs: { id: TabId; label: string; icon: typeof User }[] = [
    { id: "details", label: "Details", icon: User },
    { id: "activity", label: "Activity", icon: Activity },
    ...(hasMessagingData
      ? [
          { id: "learning" as TabId, label: "Profile Learning", icon: Brain },
          { id: "receipts" as TabId, label: `Receipts (${receipts.length})`, icon: Receipt },
          { id: "messages" as TabId, label: `Messages (${messages.length})`, icon: MessageSquare },
        ]
      : []),
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
          <div className="flex items-center gap-2">
            {!isEditing && activeTab === "details" && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 hover:bg-accent rounded-lg transition-colors"
                title="Edit Profile"
              >
                <Edit className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : profile ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsEditing(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap",
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
              {activeTab === "details" && !isEditing && (
                <div className="space-y-6">
                  {/* Status Badges */}
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
                        profile.platform === "web"
                          ? "bg-blue-500/20 text-blue-500"
                          : profile.platform === "telegram"
                          ? "bg-sky-500/20 text-sky-500"
                          : "bg-green-500/20 text-green-500"
                      )}
                    >
                      {profile.platform === "web" ? (
                        <Globe className="w-3 h-3" />
                      ) : profile.platform === "telegram" ? (
                        <Bot className="w-3 h-3" />
                      ) : (
                        <Smartphone className="w-3 h-3" />
                      )}
                      {profile.platform}
                    </span>
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium",
                        profile.verification_status === "verified"
                          ? "bg-green-500/20 text-green-500"
                          : profile.verification_status === "pending"
                          ? "bg-yellow-500/20 text-yellow-500"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {profile.verification_status || "unverified"}
                    </span>
                    {profile.is_blocked && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/20 text-destructive">
                        Blocked
                      </span>
                    )}
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                        profile.subscription_status === "active"
                          ? "bg-emerald-500/20 text-emerald-500"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {profile.subscription_tier || "basic"} · {profile.subscription_status || "trial"}
                    </span>
                  </div>

                  {/* Role Management */}
                  <div className="bg-accent/30 rounded-lg p-4">
                    <RoleManager userId={userId} />
                  </div>

                  {/* Onboarding Progress - Only for bot users */}
                  {profile.platform !== "web" && (
                    <div className="bg-accent/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-foreground mb-3">Onboarding Progress</p>
                      <div className="flex items-center gap-2">
                        {onboardingSteps.map((step, i) => (
                          <div key={step.step} className="flex items-center gap-2">
                            <div
                              className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                                (profile.onboarding_step || 0) >= step.step
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {(profile.onboarding_step || 0) > step.step ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                step.step + 1
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground hidden sm:inline">{step.label}</span>
                            {i < onboardingSteps.length - 1 && (
                              <div
                                className={cn(
                                  "w-8 h-0.5",
                                  (profile.onboarding_step || 0) > step.step ? "bg-primary" : "bg-muted"
                                )}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Linked Accounts - For web users */}
                  {profile.platform === "web" && (
                    <div className="bg-accent/30 rounded-lg p-4">
                      <p className="text-sm font-medium text-foreground mb-3">Linked Accounts</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Bot className="w-4 h-4 text-sky-500" />
                          <span className="text-muted-foreground">Telegram:</span>
                          <span className="text-foreground">
                            {profile.linked_telegram_id || profile.telegram_username
                              ? `@${profile.telegram_username || profile.linked_telegram_id}`
                              : "Not linked"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Smartphone className="w-4 h-4 text-green-500" />
                          <span className="text-muted-foreground">WhatsApp:</span>
                          <span className="text-foreground">
                            {profile.linked_whatsapp_number || profile.whatsapp_number || "Not linked"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Entity Type" value={profile.entity_type} capitalize />
                    <DetailItem label="Business Name" value={profile.business_name || profile.company_name} />
                    <DetailItem label="NIN" value={profile.nin} masked />
                    <DetailItem label="CAC Number" value={profile.cac_number} />
                    <DetailItem label="TIN" value={profile.tin} />
                    <DetailItem label="Email" value={profile.email} />
                    <DetailItem label="Occupation" value={profile.occupation} />
                    <DetailItem label="Location" value={profile.location} />
                    {profile.platform !== "web" && (
                      <>
                        <DetailItem
                          label="Telegram"
                          value={profile.telegram_username ? `@${profile.telegram_username}` : profile.telegram_id}
                        />
                        <DetailItem label="WhatsApp" value={profile.whatsapp_number} />
                      </>
                    )}
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

              {activeTab === "details" && isEditing && (
                <UserEditForm
                  userId={userId}
                  platform={platform}
                  initialData={{
                    full_name: profile?.full_name,
                    email: profile?.email,
                    entity_type: profile?.entity_type,
                    occupation: profile?.occupation,
                    location: profile?.location,
                    nin_verified: profile?.nin_verified,
                    bvn_verified: profile?.bvn_verified,
                    subscription_tier: profile?.subscription_tier,
                    telegram_id: profile?.telegram_id,
                    whatsapp_number: profile?.whatsapp_number,
                  }}
                  onSave={() => {
                    setIsEditing(false);
                    fetchUserData();
                  }}
                  onCancel={() => setIsEditing(false)}
                />
              )}

              {activeTab === "activity" && <UserActivityTab userId={userId} />}

              {activeTab === "learning" && <ProfileLearningTab userId={userId} />}

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
          <div className="flex items-center justify-center h-64 text-muted-foreground">User not found</div>
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
  icon,
}: {
  label: string;
  value: string | null | undefined;
  capitalize?: boolean;
  masked?: boolean;
  icon?: React.ReactNode;
}) {
  const displayValue = masked && value ? `${value.slice(0, 3)}****${value.slice(-2)}` : value;

  return (
    <div className="bg-background border border-border rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={cn("text-sm text-foreground font-medium", capitalize && "capitalize", !displayValue && "text-muted-foreground")}>
        {displayValue || "—"}
      </p>
    </div>
  );
}