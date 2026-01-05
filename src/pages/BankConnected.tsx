import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function BankConnected() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  const status = searchParams.get('status');
  const reason = searchParams.get('reason');
  const userId = searchParams.get('userId');

  const isSuccess = status === 'linked' || reason === 'account_linked';
  const isFailed = status === 'failed' || reason === 'user_cancelled';

  // Auto-redirect countdown
  useEffect(() => {
    if (countdown <= 0) {
      navigate('/dashboard?bankConnected=' + (isSuccess ? 'true' : 'false'), { replace: true });
      return;
    }

    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, navigate, isSuccess]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {isSuccess ? (
              <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
            ) : isFailed ? (
              <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              </div>
            )}
          </div>
          <CardTitle className="text-xl">
            {isSuccess
              ? 'Bank Connected Successfully!'
              : isFailed
              ? 'Connection Cancelled'
              : 'Processing...'}
          </CardTitle>
          <CardDescription>
            {isSuccess
              ? 'Your bank account has been securely linked. Transactions will sync automatically.'
              : isFailed
              ? 'The bank connection was cancelled. You can try again from your dashboard.'
              : 'Please wait while we complete the connection...'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isSuccess && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <div className="text-sm">
                <p className="font-medium text-emerald-800 dark:text-emerald-200">
                  Automatic sync enabled
                </p>
                <p className="text-emerald-600 dark:text-emerald-400 text-xs">
                  PRISM will categorize your transactions for tax purposes
                </p>
              </div>
            </div>
          )}

          <div className="text-center text-sm text-muted-foreground">
            Redirecting to dashboard in {countdown} seconds...
          </div>

          <Button
            onClick={() => navigate('/dashboard?bankConnected=' + (isSuccess ? 'true' : 'false'), { replace: true })}
            className="w-full"
            variant={isSuccess ? 'default' : 'outline'}
          >
            Go to Dashboard Now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
