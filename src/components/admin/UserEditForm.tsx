import { useState } from "react";
import { Save, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UserEditFormProps {
  userId: string;
  platform: string;
  initialData: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    entity_type?: string | null;
    occupation?: string | null;
    location?: string | null;
    nin_verified?: boolean | null;
    bvn_verified?: boolean | null;
    subscription_tier?: string | null;
    telegram_id?: string | null;
    whatsapp_number?: string | null;
  };
  onSave: () => void;
  onCancel: () => void;
}

const ENTITY_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "self_employed", label: "Self-Employed" },
  { value: "sme", label: "SME" },
  { value: "corporate", label: "Corporate" },
];

const SUBSCRIPTION_TIERS = [
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

export function UserEditForm({ userId, platform, initialData, onSave, onCancel }: UserEditFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    full_name: initialData.full_name || "",
    email: initialData.email || "",
    phone: initialData.phone || "",
    entity_type: initialData.entity_type || "",
    occupation: initialData.occupation || "",
    location: initialData.location || "",
    nin_verified: initialData.nin_verified || false,
    bvn_verified: initialData.bvn_verified || false,
    subscription_tier: initialData.subscription_tier || "basic",
    telegram_id: initialData.telegram_id || "",
    whatsapp_number: initialData.whatsapp_number || "",
  });

  async function handleSave() {
    setSaving(true);
    try {
      const oldValues = initialData;
      const newValues = formData;

      if (platform === "web") {
        // Update profiles table for web users
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: formData.full_name || null,
            email: formData.email || null,
          })
          .eq("id", userId);

        if (profileError) throw profileError;

        // Check if user has linked bot account to update additional fields
        const { data: linkedUser } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", userId)
          .single();

        if (linkedUser) {
          await supabase
            .from("users")
            .update({
              full_name: formData.full_name || null,
              email: formData.email || null,
              entity_type: formData.entity_type || null,
              occupation: formData.occupation || null,
              location: formData.location || null,
              nin_verified: formData.nin_verified,
              bvn_verified: formData.bvn_verified,
              subscription_tier: formData.subscription_tier || "basic",
              telegram_id: formData.telegram_id || null,
              whatsapp_number: formData.whatsapp_number || null,
            })
            .eq("id", linkedUser.id);
        }
      } else {
        // Update users table for bot users
        const { error } = await supabase
          .from("users")
          .update({
            full_name: formData.full_name || null,
            email: formData.email || null,
            entity_type: formData.entity_type || null,
            occupation: formData.occupation || null,
            location: formData.location || null,
            nin_verified: formData.nin_verified,
            bvn_verified: formData.bvn_verified,
            subscription_tier: formData.subscription_tier || "basic",
            telegram_id: formData.telegram_id || null,
            whatsapp_number: formData.whatsapp_number || null,
          })
          .eq("id", userId);

        if (error) throw error;
      }

      // Log the change to audit_log
      await supabase.from("audit_log").insert({
        user_id: userId,
        action: "profile_updated",
        entity_type: "user_profile",
        entity_id: userId,
        old_values: oldValues,
        new_values: newValues,
      });

      // Log to activity log
      await supabase.from("user_activity_log").insert({
        user_id: userId,
        event_type: "profile_update",
        event_data: { changed_fields: Object.keys(formData).filter(k => 
          formData[k as keyof typeof formData] !== initialData[k as keyof typeof initialData]
        )},
      });

      toast({ title: "Profile Updated", description: "Changes have been saved successfully" });
      onSave();
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground border-b border-border pb-2">Basic Info</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Full Name</label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Phone</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Entity/Tax Type */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground border-b border-border pb-2">Entity & Tax Type</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Entity Type</label>
            <select
              value={formData.entity_type}
              onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">Select...</option>
              {ENTITY_TYPES.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Occupation</label>
            <input
              type="text"
              value={formData.occupation}
              onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Verification Status */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground border-b border-border pb-2">Verification Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="nin_verified"
              checked={formData.nin_verified}
              onChange={(e) => setFormData({ ...formData, nin_verified: e.target.checked })}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="nin_verified" className="text-sm text-foreground">NIN Verified</label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="bvn_verified"
              checked={formData.bvn_verified}
              onChange={(e) => setFormData({ ...formData, bvn_verified: e.target.checked })}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="bvn_verified" className="text-sm text-foreground">BVN Verified</label>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Subscription Tier</label>
            <select
              value={formData.subscription_tier}
              onChange={(e) => setFormData({ ...formData, subscription_tier: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            >
              {SUBSCRIPTION_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>{tier.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Linked Accounts */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground border-b border-border pb-2">Linked Accounts</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Telegram ID</label>
            <input
              type="text"
              value={formData.telegram_id}
              onChange={(e) => setFormData({ ...formData, telegram_id: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
              placeholder="Enter Telegram ID to link"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">WhatsApp Number</label>
            <input
              type="text"
              value={formData.whatsapp_number}
              onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
              placeholder="Enter WhatsApp number to link"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2",
            saving && "opacity-50 cursor-not-allowed"
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}