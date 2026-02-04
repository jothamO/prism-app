import { useState, useEffect } from "react";
import { Shield, ShieldCheck, ShieldAlert, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type AppRole = "owner" | "admin" | "moderator" | "user";

interface RoleManagerProps {
  userId: string;
  onRoleChange?: () => void;
}

const ROLE_CONFIG: { role: AppRole; label: string; icon: typeof Shield; color: string }[] = [
  { role: "owner", label: "Owner", icon: ShieldAlert, color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  { role: "admin", label: "Admin", icon: ShieldCheck, color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
  { role: "moderator", label: "Moderator", icon: Shield, color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  { role: "user", label: "User", icon: UserIcon, color: "text-muted-foreground border-border bg-accent" },
];

export function RoleManager({ userId, onRoleChange }: RoleManagerProps) {
  const { toast } = useToast();
  const [userRoles, setUserRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUserRoles();
  }, [userId]);

  async function fetchUserRoles() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) throw error;
      setUserRoles((data || []).map((r) => r.role as AppRole));
    } catch (error) {
      console.error("Error fetching roles:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRole(role: AppRole) {
    setSaving(true);
    const hasRole = userRoles.includes(role);

    try {
      if (hasRole) {
        // Remove role
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);

        if (error) throw error;
        setUserRoles(userRoles.filter((r) => r !== role));
        toast({ title: "Role Removed", description: `${role} role has been removed` });
      } else {
        // Add role
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role });

        if (error) throw error;
        setUserRoles([...userRoles, role]);
        toast({ title: "Role Assigned", description: `${role} role has been assigned` });
      }

      // Log the change to audit_log
      await supabase.from("audit_log").insert({
        user_id: userId,
        action: hasRole ? "role_removed" : "role_assigned",
        entity_type: "user_roles",
        entity_id: userId,
        new_values: { role, action: hasRole ? "removed" : "assigned" },
      });

      onRoleChange?.();
    } catch (error) {
      console.error("Error toggling role:", error);
      toast({ title: "Error", description: "Failed to update role", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading roles...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Role Management</p>
      <div className="flex flex-wrap gap-2">
        {ROLE_CONFIG.map(({ role, label, icon: Icon, color }) => {
          const isActive = userRoles.includes(role);
          return (
            <button
              key={role}
              onClick={() => toggleRole(role)}
              disabled={saving}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                isActive
                  ? color
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
                saving && "opacity-50 cursor-not-allowed"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
              {isActive && (
                <span className="w-2 h-2 rounded-full bg-current" />
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Click to toggle roles. Users can have multiple roles.
      </p>
    </div>
  );
}