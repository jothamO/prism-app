import { useState } from "react";
import { X, Send, MessageSquare, Smartphone, Bot, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SendMessageModalProps {
  userId: string;
  userName: string;
  userPlatform: string;
  telegramId?: string | null;
  whatsappNumber?: string | null;
  onClose: () => void;
}

type Channel = "telegram" | "whatsapp";

export function SendMessageModal({
  userId,
  userName,
  userPlatform,
  telegramId,
  whatsappNumber,
  onClose,
}: SendMessageModalProps) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel>(
    userPlatform === "telegram" ? "telegram" : "whatsapp"
  );

  const hasTelegram = !!telegramId;
  const hasWhatsApp = !!whatsappNumber;

  async function handleSend() {
    if (!message.trim()) {
      toast({ title: "Error", description: "Please enter a message", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-bot-messaging", {
        body: {
          action: "direct-message",
          userId,
          message: message.trim(),
          platform: selectedChannel,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Message Sent",
          description: `Message delivered to ${userName} via ${selectedChannel}`,
        });
        onClose();
      } else {
        throw new Error(data?.error || "Failed to send message");
      }
    } catch (error) {
      console.error("Send message error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-md overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Send Message</h2>
              <p className="text-sm text-muted-foreground">to {userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Channel Selection */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Send via
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => hasTelegram && setSelectedChannel("telegram")}
                disabled={!hasTelegram}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-lg border transition-all",
                  selectedChannel === "telegram"
                    ? "border-sky-500 bg-sky-500/10 text-sky-500"
                    : hasTelegram
                    ? "border-border hover:border-sky-500/50 text-muted-foreground hover:text-foreground"
                    : "border-border/50 text-muted-foreground/50 cursor-not-allowed"
                )}
              >
                <Bot className="w-4 h-4" />
                <span className="text-sm font-medium">Telegram</span>
                {selectedChannel === "telegram" && (
                  <CheckCircle2 className="w-4 h-4 ml-auto" />
                )}
              </button>
              <button
                onClick={() => hasWhatsApp && setSelectedChannel("whatsapp")}
                disabled={!hasWhatsApp}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-lg border transition-all",
                  selectedChannel === "whatsapp"
                    ? "border-green-500 bg-green-500/10 text-green-500"
                    : hasWhatsApp
                    ? "border-border hover:border-green-500/50 text-muted-foreground hover:text-foreground"
                    : "border-border/50 text-muted-foreground/50 cursor-not-allowed"
                )}
              >
                <Smartphone className="w-4 h-4" />
                <span className="text-sm font-medium">WhatsApp</span>
                {selectedChannel === "whatsapp" && (
                  <CheckCircle2 className="w-4 h-4 ml-auto" />
                )}
              </button>
            </div>
            {!hasTelegram && !hasWhatsApp && (
              <p className="text-xs text-destructive mt-2">
                User has no messaging channels linked
              </p>
            )}
          </div>

          {/* Message Input */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Supports HTML formatting for Telegram
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || (!hasTelegram && !hasWhatsApp)}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Message
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}