import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, Zap, Building, Users, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface SubscriptionInfo {
  tier_name: string;
  display_name: string;
  status: string;
  daily_ai_chats: number;
  ocr_documents_monthly: number;
  max_bank_accounts: number;
}

const tierIcons: Record<string, React.ReactNode> = {
  free: <Zap className="h-5 w-5 text-muted-foreground" />,
  personal: <Crown className="h-5 w-5 text-amber-500" />,
  business_standard: <Building className="h-5 w-5 text-blue-500" />,
  business_plus: <Building className="h-5 w-5 text-purple-500" />,
  enterprise: <Users className="h-5 w-5 text-emerald-500" />,
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trial: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  free: "bg-muted text-muted-foreground",
};

export function SubscriptionCard() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSubscription() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user's subscription with tier details
        const { data: userData } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", user.id)
          .single();

        if (!userData) return;

        const { data: subData } = await supabase
          .from("user_subscriptions")
          .select(`
            status,
            user_pricing_tiers (
              name,
              display_name,
              daily_ai_chats,
              ocr_documents_monthly,
              max_bank_accounts
            )
          `)
          .eq("user_id", userData.id)
          .eq("status", "active")
          .maybeSingle();

        if (subData?.user_pricing_tiers) {
          const tier = subData.user_pricing_tiers as any;
          setSubscription({
            tier_name: tier.name,
            display_name: tier.display_name,
            status: subData.status,
            daily_ai_chats: tier.daily_ai_chats,
            ocr_documents_monthly: tier.ocr_documents_monthly,
            max_bank_accounts: tier.max_bank_accounts,
          });
        } else {
          // Default to free plan
          setSubscription({
            tier_name: "free",
            display_name: "Free Plan",
            status: "free",
            daily_ai_chats: 5,
            ocr_documents_monthly: 3,
            max_bank_accounts: 1,
          });
        }
      } catch (error) {
        console.error("Error fetching subscription:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSubscription();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!subscription) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {tierIcons[subscription.tier_name] || tierIcons.free}
            {subscription.display_name}
          </CardTitle>
          <Badge className={statusColors[subscription.status] || statusColors.free}>
            {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{subscription.daily_ai_chats}</p>
            <p className="text-muted-foreground text-xs">AI Chats/day</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{subscription.ocr_documents_monthly}</p>
            <p className="text-muted-foreground text-xs">OCR Docs/mo</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{subscription.max_bank_accounts}</p>
            <p className="text-muted-foreground text-xs">Bank Accounts</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={() => navigate("/pricing")}
        >
          View Plans
        </Button>
      </CardContent>
    </Card>
  );
}
