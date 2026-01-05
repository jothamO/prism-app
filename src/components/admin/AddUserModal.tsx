import { useState } from "react";
import { X, UserPlus, Bot, Smartphone, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Platform = "telegram" | "whatsapp" | "web";

export function AddUserModal({ onClose, onSuccess }: AddUserModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState<Platform>("telegram");
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    telegramId: "",
    telegramUsername: "",
    whatsappNumber: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.fullName.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    if (platform === "telegram" && !formData.telegramId.trim()) {
      toast({ title: "Error", description: "Telegram ID is required", variant: "destructive" });
      return;
    }

    if (platform === "whatsapp" && !formData.whatsappNumber.trim()) {
      toast({ title: "Error", description: "WhatsApp number is required", variant: "destructive" });
      return;
    }

    if (platform === "web" && !formData.email.trim()) {
      toast({ title: "Error", description: "Email is required for web users", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (platform === "web") {
        // Create in profiles table (web users)
        const { error } = await supabase.from("profiles").insert({
          id: crypto.randomUUID(),
          full_name: formData.fullName.trim(),
          email: formData.email.trim(),
        });

        if (error) throw error;
      } else {
        // Create in users table (bot users)
        const userData: Record<string, unknown> = {
          full_name: formData.fullName.trim(),
          email: formData.email.trim() || null,
          platform,
          onboarding_completed: false,
          onboarding_step: 0,
        };

        if (platform === "telegram") {
          userData.telegram_id = formData.telegramId.trim();
          userData.telegram_username = formData.telegramUsername.trim() || null;
        } else if (platform === "whatsapp") {
          userData.whatsapp_number = formData.whatsappNumber.trim();
          userData.whatsapp_id = formData.whatsappNumber.trim();
        }

        const { error } = await supabase.from("users").insert(userData);

        if (error) throw error;
      }

      toast({ title: "User Created", description: `${formData.fullName} has been added` });
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Add user error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create user",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-md overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Add User</h2>
              <p className="text-sm text-muted-foreground">Create a new user manually</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Platform Selection */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Platform
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "telegram" as Platform, label: "Telegram", icon: Bot, color: "sky" },
                { id: "whatsapp" as Platform, label: "WhatsApp", icon: Smartphone, color: "green" },
                { id: "web" as Platform, label: "Web", icon: Globe, color: "purple" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                    platform === p.id
                      ? p.color === "sky"
                        ? "border-sky-500 bg-sky-500/10 text-sky-500"
                        : p.color === "green"
                        ? "border-green-500 bg-green-500/10 text-green-500"
                        : "border-purple-500 bg-purple-500/10 text-purple-500"
                      : "border-border hover:border-muted-foreground/50 text-muted-foreground"
                  )}
                >
                  <p.icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Full Name *
            </label>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Enter full name"
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Email {platform === "web" && "*"}
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter email address"
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Telegram Fields */}
          {platform === "telegram" && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Telegram ID *
                </label>
                <input
                  type="text"
                  value={formData.telegramId}
                  onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
                  placeholder="e.g., 123456789"
                  className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Telegram Username
                </label>
                <input
                  type="text"
                  value={formData.telegramUsername}
                  onChange={(e) => setFormData({ ...formData, telegramUsername: e.target.value })}
                  placeholder="@username (optional)"
                  className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </>
          )}

          {/* WhatsApp Fields */}
          {platform === "whatsapp" && (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                WhatsApp Number *
              </label>
              <input
                type="text"
                value={formData.whatsappNumber}
                onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                placeholder="e.g., +2348012345678"
                className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}