import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, XCircle, Circle, X } from "lucide-react";

export interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "in-progress" | "completed" | "error";
  detail?: string;
}

export interface AffectedItem {
  label: string;
  count: number;
}

interface ConfirmationProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  affectedItems?: AffectedItem[];
  destructive?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => Promise<{ steps: ProgressStep[] } | void>;
  initialSteps?: ProgressStep[];
}

export function ConfirmationProgressDialog({
  open,
  onOpenChange,
  title,
  description,
  affectedItems = [],
  destructive = true,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  initialSteps = [],
}: ConfirmationProgressDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>(initialSteps);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Delay reset to allow close animation
      const timer = setTimeout(() => {
        setIsProcessing(false);
        setSteps(initialSteps);
        setIsComplete(false);
        setHasError(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open, initialSteps]);

  const handleConfirm = async () => {
    setIsProcessing(true);
    setHasError(false);
    
    // Set initial steps to in-progress
    const processingSteps = initialSteps.map((step, index) => ({
      ...step,
      status: index === 0 ? "in-progress" as const : "pending" as const,
    }));
    setSteps(processingSteps);

    try {
      const result = await onConfirm();
      
      if (result?.steps) {
        setSteps(result.steps);
        const hasAnyError = result.steps.some(s => s.status === "error");
        setHasError(hasAnyError);
      } else {
        // Mark all steps as completed if no steps returned
        setSteps(initialSteps.map(step => ({ ...step, status: "completed" as const })));
      }
      setIsComplete(true);
    } catch (error) {
      console.error("Confirmation action failed:", error);
      setSteps(prev => prev.map((step, index) => {
        if (step.status === "in-progress") {
          return { ...step, status: "error" as const, detail: "Action failed" };
        }
        if (step.status === "pending" && index > 0) {
          return { ...step, status: "pending" as const };
        }
        return step;
      }));
      setHasError(true);
      setIsComplete(true);
    }
  };

  const handleClose = () => {
    if (!isProcessing || isComplete) {
      onOpenChange(false);
    }
  };

  const getStepIcon = (status: ProgressStep["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "in-progress":
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground/40" />;
    }
  };

  const completedCount = steps.filter(s => s.status === "completed").length;
  const progressPercent = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Dialog Panel */}
      <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-md mx-4 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-start gap-4">
            {destructive && !isProcessing && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            )}
            {isProcessing && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                {isComplete ? (
                  hasError ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  )
                ) : (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                )}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {isProcessing ? (isComplete ? (hasError ? "Action Failed" : "Complete") : "Processing...") : title}
              </h3>
              {!isProcessing && (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing && !isComplete}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {!isProcessing ? (
            <>
              {/* Affected Items */}
              {affectedItems.length > 0 && (
                <div className="mb-4 p-3 bg-accent/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Affected Items
                  </p>
                  <div className="space-y-1">
                    {affectedItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{item.label}</span>
                        <span className="font-mono text-muted-foreground">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={handleClose}>
                  {cancelText}
                </Button>
                <Button
                  variant={destructive ? "destructive" : "default"}
                  onClick={handleConfirm}
                >
                  {confirmText}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="h-2 bg-accent rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getStepIcon(step.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        step.status === "pending" 
                          ? "text-muted-foreground" 
                          : step.status === "error"
                          ? "text-destructive"
                          : "text-foreground"
                      }`}>
                        {step.label}
                      </p>
                      {step.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {step.detail}
                        </p>
                      )}
                    </div>
                    {/* Connecting line */}
                    {index < steps.length - 1 && (
                      <div className="absolute left-[2.35rem] mt-7 w-0.5 h-4 bg-border" />
                    )}
                  </div>
                ))}
              </div>

              {/* Close button when complete */}
              {isComplete && (
                <div className="mt-6 flex justify-end">
                  <Button onClick={handleClose}>
                    Close
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
