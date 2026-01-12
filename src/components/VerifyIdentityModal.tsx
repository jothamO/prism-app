import { useState, forwardRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface VerifyIdentityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified?: () => void;
}

type VerificationType = 'nin' | 'bvn';

const VerifyIdentityModal = forwardRef<HTMLDivElement, VerifyIdentityModalProps>(
  function VerifyIdentityModal({ open, onOpenChange, onVerified }, ref) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [verificationType, setVerificationType] = useState<VerificationType>('nin');
    const [idNumber, setIdNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [verificationResult, setVerificationResult] = useState<{
      success: boolean;
      message: string;
    } | null>(null);

    const handleVerify = async () => {
      if (!user?.id) {
        toast({
          title: 'Error',
          description: 'You must be logged in to verify your identity',
          variant: 'destructive',
        });
        return;
      }

      if (!idNumber.trim()) {
        toast({
          title: 'Error',
          description: `Please enter your ${verificationType.toUpperCase()}`,
          variant: 'destructive',
        });
        return;
      }

      // Basic validation
      if (verificationType === 'nin' && idNumber.length !== 11) {
        toast({
          title: 'Invalid NIN',
          description: 'NIN must be 11 digits',
          variant: 'destructive',
        });
        return;
      }

      if (verificationType === 'bvn' && idNumber.length !== 11) {
        toast({
          title: 'Invalid BVN',
          description: 'BVN must be 11 digits',
          variant: 'destructive',
        });
        return;
      }

      setLoading(true);
      setVerificationResult(null);

      try {
        const { data, error } = await supabase.functions.invoke('verify-identity', {
          body: {
            userId: user.id,
            verificationType,
            idNumber: idNumber.trim(),
          },
        });

        if (error) throw error;

        if (data?.verified) {
          setVerificationResult({
            success: true,
            message: `${verificationType.toUpperCase()} verified successfully!`,
          });
          toast({
            title: 'Verification Successful',
            description: `Your ${verificationType.toUpperCase()} has been verified`,
          });
          setTimeout(() => {
            onVerified?.();
            onOpenChange(false);
          }, 1500);
        } else {
          setVerificationResult({
            success: false,
            message: data?.message || 'Verification failed. Please check your details.',
          });
        }
      } catch (error: any) {
        console.error('Verification error:', error);
        setVerificationResult({
          success: false,
          message: error.message || 'Verification failed. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    };

    const resetForm = () => {
      setIdNumber('');
      setVerificationResult(null);
    };

    return (
      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}>
        <DialogContent ref={ref} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Verify Your Identity
            </DialogTitle>
            <DialogDescription>
              Verify your identity with NIN or BVN to unlock full features and comply with Nigerian regulations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Verification Type Selection */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setVerificationType('nin');
                  resetForm();
                }}
                className={`p-3 rounded-lg border text-center transition-all ${
                  verificationType === 'nin'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-medium text-sm">NIN</p>
                <p className="text-xs text-muted-foreground">National ID</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerificationType('bvn');
                  resetForm();
                }}
                className={`p-3 rounded-lg border text-center transition-all ${
                  verificationType === 'bvn'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-medium text-sm">BVN</p>
                <p className="text-xs text-muted-foreground">Bank Verification</p>
              </button>
            </div>

            {/* ID Number Input */}
            <div className="space-y-2">
              <Label htmlFor="idNumber">
                {verificationType === 'nin' ? 'NIN (11 digits)' : 'BVN (11 digits)'}
              </Label>
              <Input
                id="idNumber"
                type="text"
                inputMode="numeric"
                placeholder={verificationType === 'nin' ? '12345678901' : '22123456789'}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                disabled={loading}
                className="font-mono"
              />
            </div>

            {/* Verification Result */}
            {verificationResult && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg ${
                  verificationResult.success
                    ? 'bg-emerald-500/10 text-emerald-700'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {verificationResult.success ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <p className="text-sm">{verificationResult.message}</p>
              </div>
            )}

            <Button
              onClick={handleVerify}
              disabled={loading || idNumber.length !== 11}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Verify {verificationType.toUpperCase()}
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Your information is securely verified through official government channels.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export default VerifyIdentityModal;
