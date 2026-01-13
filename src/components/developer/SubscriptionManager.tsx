import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, CreditCard, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Subscription {
  id: string;
  tier: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  paystack_subscription_code: string | null;
}

interface SubscriptionManagerProps {
  userId: string;
  onTierChange?: (newTier: string) => void;
}

export function SubscriptionManager({ userId, onTierChange }: SubscriptionManagerProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubscription();
  }, [userId]);

  async function fetchSubscription() {
    try {
      const { data, error } = await supabase
        .from('api_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setSubscription(data);
      if (data && onTierChange) {
        onTierChange(data.tier);
      }
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelSubscription() {
    if (!subscription?.paystack_subscription_code) return;

    setCancelling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('paystack-portal', {
        body: { action: 'cancel' },
      });

      if (response.error) throw new Error(response.error.message);

      toast({
        title: "Subscription Cancelled",
        description: response.data.message,
      });

      fetchSubscription();
    } catch (error: any) {
      toast({
        title: "Cancellation Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'past_due':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'cancelled':
      case 'inactive':
        return <XCircle className="h-5 w-5 text-muted-foreground" />;
      default:
        return null;
    }
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      past_due: 'destructive',
      cancelled: 'secondary',
      inactive: 'outline',
      trialing: 'secondary',
    };
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-6 w-24 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isActive = subscription?.status === 'active';
  const isPastDue = subscription?.status === 'past_due';
  const tier = subscription?.tier || 'free';

  return (
    <Card className={isPastDue ? 'border-destructive' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Subscription
          </CardTitle>
          {subscription && getStatusBadge(subscription.status)}
        </div>
        <CardDescription>
          Manage your API subscription plan
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          {subscription && getStatusIcon(subscription.status)}
          <div>
            <p className="font-medium capitalize text-lg">
              {tier} Plan
            </p>
            {subscription?.cancel_at_period_end && (
              <p className="text-sm text-destructive">
                Cancels on {formatDate(subscription.current_period_end)}
              </p>
            )}
          </div>
        </div>

        {isPastDue && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
            <AlertTriangle className="h-4 w-4 inline mr-2" />
            Your payment has failed. Please update your payment method to avoid service interruption.
          </div>
        )}

        {isActive && subscription?.current_period_end && !subscription.cancel_at_period_end && (
          <div className="text-sm text-muted-foreground">
            <p>Started: {formatDate(subscription.current_period_start)}</p>
            <p>Next billing: {formatDate(subscription.current_period_end)}</p>
          </div>
        )}

        {isActive && !subscription?.cancel_at_period_end && tier !== 'free' && (
          <Button 
            variant="outline" 
            onClick={handleCancelSubscription}
            disabled={cancelling}
            className="text-destructive hover:text-destructive"
          >
            {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
          </Button>
        )}

        {tier === 'free' && (
          <p className="text-sm text-muted-foreground">
            Upgrade to a paid plan for higher rate limits and additional features.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
