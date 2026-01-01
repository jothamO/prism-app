import { useState, useRef, useEffect } from "react";
import {
  MoreHorizontal,
  Eye,
  MessageSquare,
  RotateCcw,
  Ban,
  CheckCircle,
  Trash2,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
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
  onUpdate?: () => void;
}

type ResetOption = "state" | "messages" | "onboarding" | "full";

export function UserActionMenu({ userId, userName, platform, isBlocked, onUpdate }: UserActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showResetSubmenu, setShowResetSubmenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [resetting, setResetting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowResetSubmenu(false);
        setShowMessageInput(false);
        setShowBlockConfirm(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      setShowMessageInput(false);
      setIsOpen(false);
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
      setShowResetSubmenu(false);
      setIsOpen(false);
      onUpdate?.();
    } catch (error) {
      console.error("Error resetting user:", error);
      toast({ title: "Error", description: "Reset failed", variant: "destructive" });
    } finally {
      setResetting(false);
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
      
      setShowBlockConfirm(false);
      setBlockReason("");
      setIsOpen(false);
      onUpdate?.();
    } catch (error) {
      console.error("Error toggling block:", error);
      toast({ title: "Error", description: "Operation failed", variant: "destructive" });
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-accent rounded-lg transition-colors"
      >
        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
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

          {/* Reset User Submenu */}
          <div className="relative">
            <button
              onClick={() => setShowResetSubmenu(!showResetSubmenu)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <span className="flex items-center gap-3">
                <RotateCcw className="w-4 h-4 text-muted-foreground" />
                Reset User
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

          {/* Block/Unblock */}
          <div className="relative">
            <button
              onClick={() => isBlocked ? toggleBlock() : setShowBlockConfirm(!showBlockConfirm)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                isBlocked ? "text-green-500 hover:bg-green-500/10" : "text-destructive hover:bg-destructive/10"
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
                  className="mt-1 w-full py-1.5 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50"
                >
                  Confirm Block
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
