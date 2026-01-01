import { useState, useRef, useEffect } from "react";
import {
  MoreHorizontal,
  Eye,
  MessageSquare,
  RotateCcw,
  Ban,
  CheckCircle,
  Trash2,
  ChevronRight,
  AlertTriangle,
  ShieldCheck,
  ShieldQuestion,
  Crown,
  Copy,
  Receipt,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { UserProfileModal } from "./UserProfileModal";

interface UserActionMenuProps {
  userId: string;
  userName: string;
  platform: string | null;
  isBlocked: boolean | null;
  verificationStatus?: string | null;
  subscriptionTier?: string | null;
  onUpdate?: () => void;
}

type ResetOption = "state" | "messages" | "onboarding" | "full";
type SubscriptionTier = "free" | "basic" | "pro" | "enterprise";

export function UserActionMenu({ 
  userId, 
  userName, 
  platform, 
  isBlocked, 
  verificationStatus,
  subscriptionTier,
  onUpdate 
}: UserActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showResetSubmenu, setShowResetSubmenu] = useState(false);
  const [showVerifySubmenu, setShowVerifySubmenu] = useState(false);
  const [showSubscriptionSubmenu, setShowSubscriptionSubmenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [resetting, setResetting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeAllMenus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function closeAllMenus() {
    setIsOpen(false);
    setShowResetSubmenu(false);
    setShowVerifySubmenu(false);
    setShowSubscriptionSubmenu(false);
    setShowMessageInput(false);
    setShowBlockConfirm(false);
    setShowDeleteConfirm(false);
  }

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(userId);
      toast({ title: "Copied", description: "User ID copied to clipboard" });
      closeAllMenus();
    } catch {
      toast({ title: "Error", description: "Failed to copy", variant: "destructive" });
    }
  }

  async function sendDirectMessage() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: {
          action: "direct-message",
          message: message.trim(),
          userId,
        },
      });

      if (response.error) throw response.error;
      
      toast({ title: "Success", description: "Message sent" });
      setMessage("");
      closeAllMenus();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function handleReset(option: ResetOption) {
    setResetting(true);
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: {
          action: "clear-user-data",
          userId,
          clearOption: option,
        },
      });

      if (response.error) throw response.error;

      const messages: Record<ResetOption, string> = {
        state: "Conversation state cleared",
        messages: "Message history cleared",
        onboarding: "Onboarding reset",
        full: "Full reset completed",
      };
      
      toast({ title: "Success", description: messages[option] });
      closeAllMenus();
      onUpdate?.();
    } catch (error) {
      console.error("Error resetting user:", error);
      toast({ title: "Error", description: "Reset failed", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  async function handleVerify() {
    setProcessing(true);
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: { action: "verify-user", userId },
      });

      if (response.error) throw response.error;
      toast({ title: "Success", description: "User verified" });
      closeAllMenus();
      onUpdate?.();
    } catch (error) {
      console.error("Error verifying user:", error);
      toast({ title: "Error", description: "Verification failed", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }

  async function handleRequestReverify() {
    setProcessing(true);
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: { action: "request-reverify", userId },
      });

      if (response.error) throw response.error;
      toast({ title: "Success", description: "Verification reset requested" });
      closeAllMenus();
      onUpdate?.();
    } catch (error) {
      console.error("Error requesting re-verification:", error);
      toast({ title: "Error", description: "Failed to reset verification", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }

  async function handleUpdateSubscription(tier: SubscriptionTier) {
    setProcessing(true);
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: { action: "update-subscription", userId, subscriptionTier: tier },
      });

      if (response.error) throw response.error;
      toast({ title: "Success", description: `Subscription updated to ${tier}` });
      closeAllMenus();
      onUpdate?.();
    } catch (error) {
      console.error("Error updating subscription:", error);
      toast({ title: "Error", description: "Failed to update subscription", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }

  async function handleDelete() {
    setProcessing(true);
    try {
      const response = await supabase.functions.invoke("admin-bot-messaging", {
        body: { action: "delete-user", userId },
      });

      if (response.error) throw response.error;
      toast({ title: "Success", description: "User deleted" });
      closeAllMenus();
      onUpdate?.();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }

  async function toggleBlock() {
    try {
      if (isBlocked) {
        // Unblock
        const { error } = await supabase
          .from("users")
          .update({ is_blocked: false, blocked_at: null, blocked_reason: null })
          .eq("id", userId);
        
        if (error) throw error;
        toast({ title: "Success", description: "User unblocked" });
      } else {
        // Block
        if (!blockReason.trim()) {
          toast({ title: "Error", description: "Please provide a reason", variant: "destructive" });
          return;
        }
        const { error } = await supabase
          .from("users")
          .update({ 
            is_blocked: true, 
            blocked_at: new Date().toISOString(), 
            blocked_reason: blockReason.trim() 
          })
          .eq("id", userId);
        
        if (error) throw error;
        toast({ title: "Success", description: "User blocked" });
      }
      
      closeAllMenus();
      onUpdate?.();
    } catch (error) {
      console.error("Error toggling block:", error);
      toast({ title: "Error", description: "Operation failed", variant: "destructive" });
    }
  }

  const subscriptionTiers: { value: SubscriptionTier; label: string }[] = [
    { value: "free", label: "Free" },
    { value: "basic", label: "Basic" },
    { value: "pro", label: "Pro" },
    { value: "enterprise", label: "Enterprise" },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-accent rounded-lg transition-colors"
      >
        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-60 bg-card border border-border rounded-lg shadow-lg z-50 py-1 max-h-[70vh] overflow-y-auto">
          {/* ========== USER INFO SECTION ========== */}
          <div className="px-3 py-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">User Info</p>
          </div>

          {/* View Profile */}
          <button
            onClick={() => {
              setShowProfileModal(true);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Eye className="w-4 h-4 text-muted-foreground" />
            View Profile
          </button>

          {/* Copy User ID */}
          <button
            onClick={copyUserId}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Copy className="w-4 h-4 text-muted-foreground" />
            Copy User ID
          </button>

          {/* View Receipts */}
          <button
            onClick={() => {
              // Navigate to invoices with user filter
              window.location.href = `/admin/invoices?userId=${userId}`;
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Receipt className="w-4 h-4 text-muted-foreground" />
            View Receipts
          </button>

          {/* Send Message */}
          <div className="relative">
            <button
              onClick={() => setShowMessageInput(!showMessageInput)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Send Direct Message
            </button>
            {showMessageInput && (
              <div className="px-3 pb-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type message..."
                  rows={2}
                  className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground resize-none"
                />
                <button
                  onClick={sendDirectMessage}
                  disabled={sending || !message.trim()}
                  className="mt-1 w-full py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border my-1" />

          {/* ========== RESET SECTION ========== */}
          <div className="px-3 py-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reset User</p>
          </div>

          {/* Reset User Submenu */}
          <div className="relative">
            <button
              onClick={() => {
                setShowResetSubmenu(!showResetSubmenu);
                setShowVerifySubmenu(false);
                setShowSubscriptionSubmenu(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="flex items-center gap-3">
                <RotateCcw className="w-4 h-4 text-muted-foreground" />
                Reset Options
              </span>
              <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showResetSubmenu && "rotate-90")} />
            </button>
            {showResetSubmenu && (
              <div className="bg-accent/50 py-1">
                <button
                  onClick={() => handleReset("state")}
                  disabled={resetting}
                  className="w-full text-left px-6 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  Clear Conversation State
                </button>
                <button
                  onClick={() => handleReset("messages")}
                  disabled={resetting}
                  className="w-full text-left px-6 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  Clear Messages
                </button>
                <button
                  onClick={() => handleReset("onboarding")}
                  disabled={resetting}
                  className="w-full text-left px-6 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  Reset Onboarding
                </button>
                <button
                  onClick={() => handleReset("full")}
                  disabled={resetting}
                  className="w-full text-left px-6 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
                >
                  Full Reset
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border my-1" />

          {/* ========== VERIFICATION SECTION ========== */}
          <div className="px-3 py-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Verification</p>
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowVerifySubmenu(!showVerifySubmenu);
                setShowResetSubmenu(false);
                setShowSubscriptionSubmenu(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                Verification
                {verificationStatus && (
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    verificationStatus === "verified" ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"
                  )}>
                    {verificationStatus}
                  </span>
                )}
              </span>
              <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showVerifySubmenu && "rotate-90")} />
            </button>
            {showVerifySubmenu && (
              <div className="bg-accent/50 py-1">
                <button
                  onClick={handleVerify}
                  disabled={processing || verificationStatus === "verified"}
                  className="w-full text-left px-6 py-1.5 text-sm text-green-500 hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3" />
                    Mark as Verified
                  </span>
                </button>
                <button
                  onClick={handleRequestReverify}
                  disabled={processing || verificationStatus === "pending"}
                  className="w-full text-left px-6 py-1.5 text-sm text-yellow-500 hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <ShieldQuestion className="w-3 h-3" />
                    Request Re-verification
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border my-1" />

          {/* ========== SUBSCRIPTION SECTION ========== */}
          <div className="px-3 py-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subscription</p>
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowSubscriptionSubmenu(!showSubscriptionSubmenu);
                setShowResetSubmenu(false);
                setShowVerifySubmenu(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="flex items-center gap-3">
                <Crown className="w-4 h-4 text-muted-foreground" />
                Subscription Tier
                {subscriptionTier && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary capitalize">
                    {subscriptionTier}
                  </span>
                )}
              </span>
              <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showSubscriptionSubmenu && "rotate-90")} />
            </button>
            {showSubscriptionSubmenu && (
              <div className="bg-accent/50 py-1">
                {subscriptionTiers.map((tier) => (
                  <button
                    key={tier.value}
                    onClick={() => handleUpdateSubscription(tier.value)}
                    disabled={processing || subscriptionTier === tier.value}
                    className={cn(
                      "w-full text-left px-6 py-1.5 text-sm hover:bg-accent transition-colors",
                      subscriptionTier === tier.value ? "text-primary font-medium" : "text-foreground",
                      processing && "opacity-50"
                    )}
                  >
                    {tier.label}
                    {subscriptionTier === tier.value && " ✓"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border my-1" />

          {/* ========== DANGER ZONE ========== */}
          <div className="px-3 py-1.5">
            <p className="text-xs font-medium text-destructive uppercase tracking-wider">Danger Zone</p>
          </div>

          {/* Block/Unblock */}
          <div className="relative">
            <button
              onClick={() => isBlocked ? toggleBlock() : setShowBlockConfirm(!showBlockConfirm)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                isBlocked ? "text-green-500 hover:bg-green-500/10" : "text-yellow-500 hover:bg-yellow-500/10"
              )}
            >
              {isBlocked ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Unblock User
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  Block User
                </>
              )}
            </button>
            {showBlockConfirm && !isBlocked && (
              <div className="px-3 pb-2">
                <div className="flex items-center gap-2 text-xs text-destructive mb-2">
                  <AlertTriangle className="w-3 h-3" />
                  This will prevent user from using the bot
                </div>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Reason for blocking..."
                  className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground"
                />
                <button
                  onClick={toggleBlock}
                  disabled={!blockReason.trim()}
                  className="mt-1 w-full py-1.5 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                >
                  Confirm Block
                </button>
              </div>
            )}
          </div>

          {/* Delete User */}
          <div className="relative">
            <button
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete User
            </button>
            {showDeleteConfirm && (
              <div className="px-3 pb-2">
                <div className="flex items-center gap-2 text-xs text-destructive mb-2">
                  <AlertTriangle className="w-3 h-3" />
                  This will permanently delete the user and ALL their data!
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Deleting: <span className="font-medium text-foreground">{userName}</span>
                </p>
                <button
                  onClick={handleDelete}
                  disabled={processing}
                  className="w-full py-1.5 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50"
                >
                  {processing ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <UserProfileModal userId={userId} onClose={() => setShowProfileModal(false)} />
      )}
    </div>
  );
}