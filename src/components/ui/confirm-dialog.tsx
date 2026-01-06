import * as React from "react";
import { X, AlertTriangle, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive" | "warning";
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  loading = false,
  children,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Confirm action failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !isLoading && !loading) {
      onOpenChange(false);
    }
  };

  if (!open) return null;

  const Icon = variant === "destructive" ? Trash2 : variant === "warning" ? AlertTriangle : Info;
  const iconBgColor = variant === "destructive" 
    ? "bg-destructive/20 text-destructive" 
    : variant === "warning" 
    ? "bg-yellow-500/20 text-yellow-500" 
    : "bg-primary/20 text-primary";

  const confirmBtnColor = variant === "destructive"
    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
    : variant === "warning"
    ? "bg-yellow-500 text-white hover:bg-yellow-600"
    : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0" 
        onClick={() => !isLoading && !loading && onOpenChange(false)}
      />
      
      {/* Dialog */}
      <div className="relative z-50 w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex items-start gap-4 p-6 pb-4">
          <div className={cn("p-2 rounded-lg", iconBgColor)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isLoading || loading}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {children && (
          <div className="px-6 pb-4">
            {children}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 pt-4 border-t border-border">
          <button
            onClick={() => onOpenChange(false)}
            disabled={isLoading || loading}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || loading}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2",
              confirmBtnColor
            )}
          >
            {(isLoading || loading) && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
