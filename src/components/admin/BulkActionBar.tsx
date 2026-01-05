import { useState } from "react";
import { X, Ban, Trash2, Shield, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type BulkAction = "block" | "unblock" | "delete" | "assign_role";

interface BulkActionBarProps {
  selectedCount: number;
  onAction: (action: BulkAction, roleValue?: string) => void;
  onClear: () => void;
}

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "moderator", label: "Moderator" },
  { value: "user", label: "User" },
];

export function BulkActionBar({ selectedCount, onAction, onClear }: BulkActionBarProps) {
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-xl shadow-lg px-4 py-3 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground">
          {selectedCount}
        </span>
        <span className="text-sm text-foreground font-medium">
          {selectedCount === 1 ? "user" : "users"} selected
        </span>
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-2">
        <button
          onClick={() => onAction("block")}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg transition-colors"
        >
          <Ban className="w-4 h-4" />
          Block
        </button>
        
        <button
          onClick={() => onAction("unblock")}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg transition-colors"
        >
          <Ban className="w-4 h-4" />
          Unblock
        </button>

        <div className="relative">
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <Shield className="w-4 h-4" />
            Assign Role
            <ChevronDown className="w-3 h-3" />
          </button>
          
          {showRoleMenu && (
            <div className="absolute bottom-full left-0 mb-1 w-40 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  onClick={() => {
                    onAction("assign_role", role.value);
                    setShowRoleMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent"
                >
                  {role.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => onAction("delete")}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>

      <div className="h-6 w-px bg-border" />

      <button
        onClick={onClear}
        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}