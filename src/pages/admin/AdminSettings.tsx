import { useState, useEffect } from "react";
import { Settings, User, Bell, Shield, Sliders, Save, Eye, EyeOff, RefreshCw, Check, AlertTriangle, Plug, Unplug, ExternalLink, Wifi, WifiOff, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TestModePinDialog } from "@/components/admin/TestModePinDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useGatewayHealth } from "@/hooks/useGatewayHealth";

type Tab = "profile" | "notifications" | "security" | "general" | "integrations";

interface AdminPreferences {
  email_on_new_user: boolean;
  email_on_failed_verification: boolean;
  email_on_receipt_error: boolean;
  email_daily_summary: boolean;
}

interface SystemSettings {
  filing_reminder_days: number;
  auto_verification_enabled: boolean;
  default_tax_year: number;
  welcome_message_telegram: string;
  welcome_message_whatsapp: string;
  onboarding_mode: 'strict' | 'ai';
  test_mode_enabled: boolean;
  test_mode_enabled_at: string | null;
  gateway_enabled: boolean;
}

interface Profile {
  full_name: string;
  email: string;
}

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  const tabs = [
    { id: "profile" as Tab, name: "Profile", icon: User },
    { id: "notifications" as Tab, name: "Notifications", icon: Bell },
    { id: "security" as Tab, name: "Security", icon: Shield },
    { id: "general" as Tab, name: "General", icon: Sliders },
    { id: "integrations" as Tab, name: "Integrations", icon: Plug },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and application preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full text-left px-4 py-2 rounded-lg transition-colors flex items-center gap-3",
                activeTab === tab.id
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.name}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="md:col-span-3 bg-card border border-border rounded-xl p-6">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "integrations" && <IntegrationsTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({ full_name: "", email: "" });

  useEffect(() => {
    fetchProfile();
  }, [user]);

  async function fetchProfile() {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      setProfile({
        full_name: data?.full_name || "",
        email: data?.email || user.email || "",
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          email: profile.email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;
      toast({ title: "Success", description: "Profile updated successfully" });
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({ title: "Error", description: "Failed to update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const nameParts = profile.full_name.split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  return (
    <div>
      <h3 className="text-lg font-medium text-foreground mb-4">Profile Settings</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">First Name</label>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={firstName}
              onChange={(e) =>
                setProfile({ ...profile, full_name: `${e.target.value} ${lastName}`.trim() })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Last Name</label>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={lastName}
              onChange={(e) =>
                setProfile({ ...profile, full_name: `${firstName} ${e.target.value}`.trim() })
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Email Address</label>
          <input
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
        </div>
        <div className="pt-4">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<AdminPreferences>({
    email_on_new_user: true,
    email_on_failed_verification: true,
    email_on_receipt_error: false,
    email_daily_summary: true,
  });

  useEffect(() => {
    fetchPreferences();
  }, [user]);

  async function fetchPreferences() {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("admin_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setPreferences({
          email_on_new_user: data.email_on_new_user ?? true,
          email_on_failed_verification: data.email_on_failed_verification ?? true,
          email_on_receipt_error: data.email_on_receipt_error ?? false,
          email_daily_summary: data.email_daily_summary ?? true,
        });
      }
    } catch (error) {
      console.error("Error fetching preferences:", error);
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("admin_preferences").upsert({
        user_id: user.id,
        ...preferences,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
      toast({ title: "Success", description: "Notification preferences saved" });
    } catch (error) {
      console.error("Error saving preferences:", error);
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const toggleItems = [
    { key: "email_on_new_user", label: "New user signups", description: "Get notified when a new user joins via chatbot" },
    { key: "email_on_failed_verification", label: "Failed verifications", description: "Alert when NIN/CAC/TIN verification fails" },
    { key: "email_on_receipt_error", label: "Receipt processing errors", description: "Notify on OCR or classification failures" },
    { key: "email_daily_summary", label: "Daily summary report", description: "Receive a daily email with key metrics" },
  ];

  return (
    <div>
      <h3 className="text-lg font-medium text-foreground mb-4">Notification Preferences</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Choose which email notifications you'd like to receive.
      </p>
      <div className="space-y-4">
        {toggleItems.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between p-4 bg-background rounded-lg"
          >
            <div>
              <p className="text-foreground font-medium">{item.label}</p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
            <button
              onClick={() =>
                setPreferences({
                  ...preferences,
                  [item.key]: !preferences[item.key as keyof AdminPreferences],
                })
              }
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                preferences[item.key as keyof AdminPreferences] ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                  preferences[item.key as keyof AdminPreferences] ? "translate-x-7" : "translate-x-1"
                )}
              />
            </button>
          </div>
        ))}
      </div>
      <div className="pt-6">
        <button
          onClick={savePreferences}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

function SecurityTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Success", description: "Password updated successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({ title: "Error", description: error.message || "Failed to change password", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="text-lg font-medium text-foreground mb-4">Security Settings</h3>

      {/* Change Password */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Change Password</h4>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Current Password</label>
            <div className="relative">
              <input
                type={showPasswords ? "text" : "password"}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground pr-10 focus:outline-none focus:ring-2 focus:ring-primary"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">New Password</label>
            <input
              type={showPasswords ? "text" : "password"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Confirm New Password</label>
            <input
              type={showPasswords ? "text" : "password"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          <button
            onClick={changePassword}
            disabled={saving || !currentPassword || !newPassword || !confirmPassword}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {saving ? "Updating..." : "Update Password"}
          </button>
        </div>
      </div>

      {/* Session Info */}
      <div className="pt-6 border-t border-border">
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Current Session</h4>
        <div className="bg-background rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Check className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-foreground font-medium">{user?.email}</p>
              <p className="text-sm text-muted-foreground">
                Last sign in: {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Unknown"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>({
    filing_reminder_days: 7,
    auto_verification_enabled: true,
    default_tax_year: 2025,
    welcome_message_telegram: "",
    welcome_message_whatsapp: "",
    onboarding_mode: 'strict',
    test_mode_enabled: false,
    test_mode_enabled_at: null,
    gateway_enabled: true,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .limit(1)
        .single();

      if (error) throw error;
      if (data) {
        setSettings({
          filing_reminder_days: data.filing_reminder_days ?? 7,
          auto_verification_enabled: data.auto_verification_enabled ?? true,
          default_tax_year: data.default_tax_year ?? 2025,
          welcome_message_telegram: data.welcome_message_telegram ?? "",
          welcome_message_whatsapp: data.welcome_message_whatsapp ?? "",
          onboarding_mode: data.onboarding_mode ?? 'strict',
          test_mode_enabled: data.test_mode_enabled ?? false,
          test_mode_enabled_at: data.test_mode_enabled_at ?? null,
          gateway_enabled: data.gateway_enabled ?? true,
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleTestMode() {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const newValue = !settings.test_mode_enabled;
      
      const { error } = await supabase
        .from("system_settings")
        .update({
          test_mode_enabled: newValue,
          test_mode_enabled_at: newValue ? new Date().toISOString() : null,
          test_mode_enabled_by: newValue ? user.user?.id : null,
          updated_at: new Date().toISOString(),
          updated_by: user.user?.id,
        })
        .not("id", "is", null);

      if (error) throw error;
      
      setSettings({ ...settings, test_mode_enabled: newValue, test_mode_enabled_at: newValue ? new Date().toISOString() : null });
      toast({ 
        title: newValue ? "Test Mode Enabled" : "Test Mode Disabled",
        description: newValue ? "New users will require admin approval" : "Normal signup flow restored"
      });
      setShowPinDialog(false);
    } catch (error) {
      console.error("Error toggling test mode:", error);
      toast({ title: "Error", description: "Failed to toggle test mode", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("system_settings")
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
          updated_by: user.user?.id,
        })
        .not("id", "is", null); // Update all rows (should be just one)

      if (error) throw error;
      toast({ title: "Success", description: "System settings saved" });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-medium text-foreground mb-4">General Settings</h3>

      {/* System Configuration */}
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Default Tax Year</label>
            <select
              value={settings.default_tax_year}
              onChange={(e) => setSettings({ ...settings, default_tax_year: parseInt(e.target.value) })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Filing Reminder (days before)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={settings.filing_reminder_days}
              onChange={(e) => setSettings({ ...settings, filing_reminder_days: parseInt(e.target.value) || 7 })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-background rounded-lg">
          <div>
            <p className="text-foreground font-medium">Auto-Verification</p>
            <p className="text-sm text-muted-foreground">Automatically verify NIN/CAC/TIN on submission</p>
          </div>
          <button
            onClick={() => setSettings({ ...settings, auto_verification_enabled: !settings.auto_verification_enabled })}
            className={cn(
              "w-12 h-6 rounded-full transition-colors relative",
              settings.auto_verification_enabled ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                settings.auto_verification_enabled ? "translate-x-7" : "translate-x-1"
              )}
            />
          </button>
        </div>

        {/* Onboarding Mode */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-muted-foreground mb-4">Onboarding Mode</h4>
          <div className="bg-background rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-foreground font-medium">Onboarding Question Style</p>
                <p className="text-sm text-muted-foreground">
                  {settings.onboarding_mode === 'strict' 
                    ? 'Users must reply with numbers (1, 2, 3)' 
                    : 'Users can reply naturally (e.g., "I run a business")'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSettings({ ...settings, onboarding_mode: 'strict' })}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg border transition-colors",
                  settings.onboarding_mode === 'strict'
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                Strict Mode
              </button>
              <button
                onClick={() => setSettings({ ...settings, onboarding_mode: 'ai' })}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg border transition-colors",
                  settings.onboarding_mode === 'ai'
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                AI Mode
              </button>
            </div>
          </div>
        </div>
        {/* Bot Welcome Messages */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-muted-foreground mb-4">Bot Welcome Messages</h4>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Telegram Welcome Message</label>
              <textarea
                value={settings.welcome_message_telegram}
                onChange={(e) => setSettings({ ...settings, welcome_message_telegram: e.target.value })}
                rows={3}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Welcome message for Telegram users..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">WhatsApp Welcome Message</label>
              <textarea
                value={settings.welcome_message_whatsapp}
                onChange={(e) => setSettings({ ...settings, welcome_message_whatsapp: e.target.value })}
                rows={3}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Welcome message for WhatsApp users..."
              />
            </div>
          </div>
        </div>

        {/* Test Mode Section */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-muted-foreground mb-4">System Mode</h4>
          <div className="bg-background rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground font-medium flex items-center gap-2">
                  Test Mode
                  {settings.test_mode_enabled && (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      ACTIVE
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  When enabled, new users require admin approval. Subscriptions are hidden.
                </p>
                {settings.test_mode_enabled && settings.test_mode_enabled_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Enabled since: {new Date(settings.test_mode_enabled_at).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowPinDialog(true)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  settings.test_mode_enabled ? "bg-amber-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                    settings.test_mode_enabled ? "translate-x-7" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Test Mode PIN Dialog */}
      <TestModePinDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        currentMode={settings.test_mode_enabled}
        onConfirm={toggleTestMode}
        loading={saving}
      />
    </div>
  );
}

function IntegrationsTab() {
  const { toast } = useToast();
  const { health, loading: healthLoading, refetch } = useGatewayHealth(60000);
  const [gatewayEnabled, setGatewayEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<'connect' | 'disconnect' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const gatewayUrl = import.meta.env.VITE_RAILWAY_GATEWAY_URL || '';
  const maskedUrl = gatewayUrl ? gatewayUrl.replace(/\/\/([^.]+)\./, '//$1*****.') : 'Not configured';

  useEffect(() => {
    fetchGatewayStatus();
  }, []);

  async function fetchGatewayStatus() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("gateway_enabled")
        .limit(1)
        .single();

      if (error) throw error;
      setGatewayEnabled(data?.gateway_enabled ?? true);
    } catch (error) {
      console.error("Error fetching gateway status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleGateway(enable: boolean) {
    setActionLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("system_settings")
        .update({
          gateway_enabled: enable,
          gateway_enabled_at: enable ? new Date().toISOString() : null,
          gateway_enabled_by: enable ? user.user?.id : null,
          updated_at: new Date().toISOString(),
          updated_by: user.user?.id,
        })
        .not("id", "is", null);

      if (error) throw error;
      
      setGatewayEnabled(enable);
      toast({ 
        title: enable ? "Gateway Connected" : "Gateway Disconnected",
        description: enable 
          ? "Railway Gateway is now active for bot messages" 
          : "Bot messages will use local fallback processing"
      });
      
      setShowConnectDialog(false);
      setShowDisconnectDialog(false);
      setShowPinDialog(false);
      setPendingAction(null);
    } catch (error) {
      console.error("Error toggling gateway:", error);
      toast({ title: "Error", description: "Failed to update gateway status", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  function handleToggleClick(action: 'connect' | 'disconnect') {
    setPendingAction(action);
    setShowPinDialog(true);
  }

  function handlePinSuccess() {
    setShowPinDialog(false);
    if (pendingAction === 'disconnect') {
      setShowDisconnectDialog(true);
    } else if (pendingAction === 'connect') {
      setShowConnectDialog(true);
    }
  }

  const statusConfig = {
    healthy: { icon: Wifi, color: "text-green-500", bg: "bg-green-500/20", label: "Connected" },
    degraded: { icon: Radio, color: "text-amber-500", bg: "bg-amber-500/20", label: "Degraded" },
    offline: { icon: WifiOff, color: "text-red-500", bg: "bg-red-500/20", label: "Offline" },
    unknown: { icon: WifiOff, color: "text-muted-foreground", bg: "bg-muted", label: "Unknown" },
  };

  const currentStatus = gatewayEnabled ? statusConfig[health.status] : statusConfig.offline;
  const StatusIcon = currentStatus.icon;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-medium text-foreground mb-4">Integrations</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Manage external service connections for PRISM.
      </p>

      {/* Railway Gateway */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="p-4 bg-background">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", currentStatus.bg)}>
                <StatusIcon className={cn("w-5 h-5", currentStatus.color)} />
              </div>
              <div>
                <h4 className="text-foreground font-medium flex items-center gap-2">
                  Railway Gateway
                  <Badge className={cn(
                    "text-xs",
                    gatewayEnabled && health.status === 'healthy' 
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : gatewayEnabled && health.status === 'degraded'
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      : "bg-red-500/20 text-red-400 border-red-500/30"
                  )}>
                    {gatewayEnabled ? currentStatus.label : 'Disabled'}
                  </Badge>
                </h4>
                <p className="text-sm text-muted-foreground">
                  Processes Telegram & WhatsApp bot messages
                </p>
              </div>
            </div>
            
            {gatewayEnabled ? (
              <button
                onClick={() => handleToggleClick('disconnect')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <Unplug className="w-4 h-4" />
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => handleToggleClick('connect')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Plug className="w-4 h-4" />
                Connect
              </button>
            )}
          </div>
        </div>

        {gatewayEnabled && (
          <div className="px-4 py-3 border-t border-border bg-card">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">URL</p>
                <p className="text-foreground font-mono text-xs truncate">{maskedUrl}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Response Time</p>
                <p className="text-foreground">
                  {health.responseTime !== null ? `${health.responseTime}ms` : '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Check</p>
                <p className="text-foreground">
                  {health.lastCheck ? new Date(health.lastCheck).toLocaleTimeString() : '-'}
                </p>
              </div>
            </div>
            {health.error && (
              <div className="mt-3 p-2 bg-destructive/10 rounded-lg">
                <p className="text-xs text-destructive">{health.error}</p>
              </div>
            )}
            <div className="mt-3 flex justify-between items-center">
              <button
                onClick={() => refetch()}
                disabled={healthLoading}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={cn("w-3 h-3", healthLoading && "animate-spin")} />
                Refresh Status
              </button>
              <a
                href="/admin/simulator"
                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              >
                Open Simulator
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">Gateway Processing</p>
            <p className="text-xs text-muted-foreground mt-1">
              When the Gateway is disconnected, bot messages will fall back to basic responses. 
              Advanced features like NLU processing, tax calculations, and document analysis require an active Gateway connection.
            </p>
          </div>
        </div>
      </div>

      {/* PIN Dialog */}
      <TestModePinDialog
        open={showPinDialog}
        onOpenChange={(open) => {
          setShowPinDialog(open);
          if (!open) setPendingAction(null);
        }}
        currentMode={false}
        onConfirm={handlePinSuccess}
        loading={false}
      />

      {/* Disconnect Confirmation */}
      <ConfirmDialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
        title="Disconnect Railway Gateway?"
        description="Bot messages will fall back to basic responses. Advanced features like NLU, tax calculations, and document processing will be unavailable."
        confirmText="Disconnect"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={() => toggleGateway(false)}
        loading={actionLoading}
      />

      {/* Connect Confirmation */}
      <ConfirmDialog
        open={showConnectDialog}
        onOpenChange={setShowConnectDialog}
        title="Connect Railway Gateway?"
        description="This will enable advanced bot processing including NLU, tax calculations, and document analysis."
        confirmText="Connect"
        cancelText="Cancel"
        onConfirm={() => toggleGateway(true)}
        loading={actionLoading}
      />
    </div>
  );
}
