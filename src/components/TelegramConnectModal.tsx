import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Send, Copy, Check, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TelegramConnectModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConnected?: () => void;
}

export default function TelegramConnectModal({
    open,
    onOpenChange,
    onConnected
}: TelegramConnectModalProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [expiresAt, setExpiresAt] = useState<Date | null>(null);

    const generateToken = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('generate-telegram-token');

            if (error) throw error;

            if (data.success) {
                setToken(data.token);
                setExpiresAt(new Date(data.expiresAt));
            } else if (data.rateLimited) {
                toast({
                    title: "Rate limit reached",
                    description: `You can generate a new token in ${Math.ceil(data.retryAfter / 60)} minutes`,
                    variant: "destructive"
                });
            } else {
                throw new Error(data.error || 'Failed to generate token');
            }
        } catch (err: any) {
            console.error('[TelegramConnectModal] Error:', err);
            toast({
                title: "Failed to generate token",
                description: err.message || "Please try again",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const copyToken = async () => {
        if (token) {
            await navigator.clipboard.writeText(token);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleOpenTelegram = () => {
        if (token) {
            const botUsername = 'PrismTaxBot'; // TODO: Make configurable
            window.open(`https://t.me/${botUsername}?start=${token}`, '_blank');
        }
    };

    const getTimeRemaining = () => {
        if (!expiresAt) return null;
        const diff = expiresAt.getTime() - Date.now();
        if (diff <= 0) return 'Expired';
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-[#0088cc]" />
                        Connect Telegram
                    </DialogTitle>
                    <DialogDescription>
                        Link your Telegram account to receive tax updates and chat with PRISM.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {!token ? (
                        <div className="text-center space-y-4">
                            <div className="bg-muted/50 rounded-lg p-6">
                                <Send className="h-12 w-12 mx-auto text-[#0088cc] mb-3" />
                                <p className="text-sm text-muted-foreground mb-4">
                                    Generate a one-time token to connect your Telegram account.
                                </p>
                                <Button onClick={generateToken} disabled={loading} className="w-full">
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        'Generate Token'
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Token display */}
                            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground font-medium">Your Token</span>
                                    <div className="flex items-center gap-1 text-xs text-amber-600">
                                        <Clock className="h-3 w-3" />
                                        {getTimeRemaining()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-background rounded px-3 py-2 text-sm font-mono truncate">
                                        {token}
                                    </code>
                                    <Button variant="outline" size="icon" onClick={copyToken}>
                                        {copied ? (
                                            <Check className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Instructions */}
                            <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-sm">
                                <p className="font-medium">Next steps:</p>
                                <ol className="space-y-1 text-muted-foreground">
                                    <li>1. Click "Open Telegram" below</li>
                                    <li>2. Press "Start" in the PRISM bot</li>
                                    <li>3. The bot will automatically link your account</li>
                                </ol>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={generateToken}
                                    disabled={loading}
                                    className="flex-1"
                                >
                                    New Token
                                </Button>
                                <Button
                                    onClick={handleOpenTelegram}
                                    className="flex-1 bg-[#0088cc] hover:bg-[#0077b5]"
                                >
                                    Open Telegram
                                    <ExternalLink className="ml-2 h-4 w-4" />
                                </Button>
                            </div>

                            <p className="text-xs text-center text-muted-foreground">
                                Token expires in 15 minutes. Max 3 tokens per day.
                            </p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
