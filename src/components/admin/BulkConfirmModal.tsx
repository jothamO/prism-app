import { AlertTriangle, X, Ban, Trash2, Shield, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BulkAction = "block" | "unblock" | "delete" | "assign_role";

interface BulkConfirmModalProps {
  action: BulkAction;
  roleValue?: string;
  users: { id: string; name: string; email: string }[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ACTION_CONFIG: Record<BulkAction, { 
  title: string; 
  icon: typeof Ban; 
  color: string;
  buttonLabel: string;
  buttonColor: string;
  warning?: string;
}> = {
  block: {
    title: "Block Users",
    icon: Ban,
    color: "text-amber-500",
    buttonLabel: "Block",
    buttonColor: "bg-amber-500 hover:bg-amber-600 text-white",
    warning: "Blocked users will not be able to access their accounts or send messages.",
  },
  unblock: {
    title: "Unblock Users",
    icon: Ban,
    color: "text-green-500",
    buttonLabel: "Unblock",
    buttonColor: "bg-green-500 hover:bg-green-600 text-white",
  },
  delete: {
    title: "Delete Users",
    icon: Trash2,
    color: "text-destructive",
    buttonLabel: "Delete",
    buttonColor: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
    warning: "This will permanently delete all user data including receipts, messages, transactions, and filings. This action cannot be undone.",
  },
  assign_role: {
    title: "Assign Role",
    icon: Shield,
    color: "text-primary",
    buttonLabel: "Assign",
    buttonColor: "bg-primary hover:bg-primary/90 text-primary-foreground",
  },
};

export function BulkConfirmModal({ 
  action, 
  roleValue, 
  users, 
  onConfirm, 
  onCancel,
  loading = false 
}: BulkConfirmModalProps) {
  const config = ACTION_CONFIG[action];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-accent", config.color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {config.title}
                {action === "assign_role" && roleValue && (
                  <span className="text-primary ml-1">({roleValue})</span>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {users.length} {users.length === 1 ? "user" : "users"} selected
              </p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            disabled={loading}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Warning */}
          {config.warning && (
            <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{config.warning}</p>
            </div>
          )}

          {/* User List */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            <p className="text-sm font-medium text-foreground">
              {action === "delete" ? "You are about to permanently delete:" : "This action will affect:"}
            </p>
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-2 bg-accent/50 rounded-lg"
              >
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
            ))}
          </div>

          {action === "delete" && (
            <p className="text-xs text-muted-foreground">
              All associated data including receipts, messages, transactions, invoices, and filings will be permanently deleted.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2",
              config.buttonColor,
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
            {config.buttonLabel} {users.length} {users.length === 1 ? "User" : "Users"}
          </button>
        </div>
      </div>
    </div>
  );
}