import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CreditCard, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface BankConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}

export default function BankConnectModal({
  open,
  onOpenChange,
  onConnected,
}: BankConnectModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleConnectBank = async () => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to connect a bank account',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mono-connect-init', {
        body: { 
          authUserId: user.id,
          redirectUrl: window.location.origin,
        },
      });

      if (error) throw error;

      if (data?.connectUrl) {
        // Open Mono Connect in new tab
        window.open(data.connectUrl, '_blank', 'noopener,noreferrer');
        toast({
          title: 'Bank Connection Started',
          description: 'Complete the connection in the new tab. This page will refresh once connected.',
        });
        onOpenChange(false);
      } else {
        throw new Error('No connect URL received');
      }
    } catch (error: any) {
      console.error('Bank connect error:', error);
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to initialize bank connection',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-600" />
            Connect Your Bank
          </DialogTitle>
          <DialogDescription>
            Securely link your bank account to automatically track transactions for tax purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Automatic Transaction Sync</p>
                <p className="text-xs text-muted-foreground">
                  Transactions are automatically imported and categorized
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Bank-Level Security</p>
                <p className="text-xs text-muted-foreground">
                  Your credentials are never stored on our servers
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Powered by Mono</p>
                <p className="text-xs text-muted-foreground">
                  Trusted by thousands of Nigerian businesses
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleConnectBank}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-4 w-4" />
                Connect Bank Account
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By connecting, you agree to share transaction data with PRISM for tax calculations.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
