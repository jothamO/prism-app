import { useState } from "react";
import { Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const CORRECT_PIN = "5684";

interface TestModePinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMode: boolean;
  onConfirm: () => void;
  loading?: boolean;
}

export function TestModePinDialog({
  open,
  onOpenChange,
  currentMode,
  onConfirm,
  loading = false,
}: TestModePinDialogProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (pin !== CORRECT_PIN) {
      setError("Incorrect PIN. Please try again.");
      setPin("");
      return;
    }
    setError("");
    setPin("");
    onConfirm();
  }

  function handleClose(open: boolean) {
    if (!open) {
      setPin("");
      setError("");
    }
    onOpenChange(open);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && pin.length === 4) {
      handleSubmit();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${currentMode ? "bg-green-500/20" : "bg-amber-500/20"}`}>
              {currentMode ? (
                <Lock className="w-5 h-5 text-green-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              )}
            </div>
            <div>
              <DialogTitle>
                {currentMode ? "Disable" : "Enable"} Test Mode
              </DialogTitle>
              <DialogDescription className="mt-1">
                Enter the 4-digit confirmation PIN to proceed.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {!currentMode && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-400">
              <p className="font-medium mb-1">Warning:</p>
              <p>When Test Mode is enabled:</p>
              <ul className="list-disc ml-4 mt-1 space-y-0.5">
                <li>New users will require admin approval</li>
                <li>Subscription features will be hidden</li>
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Confirmation PIN
            </label>
            <Input
              type="password"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              onKeyDown={handleKeyDown}
              className="text-center text-lg tracking-widest"
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={pin.length !== 4 || loading}
              className={currentMode ? "" : "bg-amber-500 hover:bg-amber-600 text-white"}
            >
              {loading ? "Updating..." : currentMode ? "Disable Test Mode" : "Enable Test Mode"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
