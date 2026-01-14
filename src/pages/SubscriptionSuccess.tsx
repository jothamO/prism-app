import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Loader2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type VerificationStatus = 'verifying' | 'success' | 'failed';

interface SubscriptionDetails {
    tier_name: string;
    display_name: string;
    billing_cycle: string;
    amount: number;
}

export default function SubscriptionSuccess() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<VerificationStatus>('verifying');
    const [details, setDetails] = useState<SubscriptionDetails | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reference = searchParams.get('reference') || searchParams.get('trxref');

    useEffect(() => {
        if (reference) {
            verifyPayment(reference);
        } else {
            setStatus('failed');
            setError('No payment reference found');
        }
    }, [reference]);

    async function verifyPayment(ref: string) {
        try {
            const { data, error } = await supabase.functions.invoke('paystack-verify', {
                body: { reference: ref }
            });

            if (error) throw error;

            if (data?.success) {
                setStatus('success');
                setDetails(data.subscription);
            } else {
                setStatus('failed');
                setError(data?.message || 'Payment verification failed');
            }
        } catch (err) {
            console.error('Verification error:', err);
            setStatus('failed');
            setError('Failed to verify payment. Please contact support.');
        }
    }

    function formatPrice(kobo: number): string {
        return `₦${(kobo / 100).toLocaleString()}`;
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                {status === 'verifying' && (
                    <>
                        <CardHeader className="text-center">
                            <div className="mx-auto mb-4">
                                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                            </div>
                            <CardTitle className="text-2xl">Verifying Payment</CardTitle>
                            <CardDescription>Please wait while we confirm your subscription...</CardDescription>
                        </CardHeader>
                    </>
                )}

                {status === 'success' && details && (
                    <>
                        <CardHeader className="text-center">
                            <div className="mx-auto mb-4">
                                <CheckCircle className="w-16 h-16 text-green-500" />
                            </div>
                            <CardTitle className="text-2xl">Subscription Activated!</CardTitle>
                            <CardDescription>Welcome to {details.display_name}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Plan</span>
                                    <span className="font-medium">{details.display_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Billing</span>
                                    <span className="font-medium capitalize">{details.billing_cycle}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Amount</span>
                                    <span className="font-medium">{formatPrice(details.amount)}</span>
                                </div>
                            </div>

                            <Button className="w-full" onClick={() => navigate('/dashboard')}>
                                Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </CardContent>
                    </>
                )}

                {status === 'failed' && (
                    <>
                        <CardHeader className="text-center">
                            <div className="mx-auto mb-4">
                                <XCircle className="w-16 h-16 text-destructive" />
                            </div>
                            <CardTitle className="text-2xl">Payment Issue</CardTitle>
                            <CardDescription>{error}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button className="w-full" variant="outline" onClick={() => navigate('/pricing')}>
                                Back to Pricing
                            </Button>
                            <Button className="w-full" variant="ghost" onClick={() => navigate('/contact')}>
                                Contact Support
                            </Button>
                        </CardContent>
                    </>
                )}
            </Card>
        </div>
    );
}
