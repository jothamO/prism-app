import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PricingTier {
  name: string;
  price: string;
  priceAmount: number;
  description: string;
  features: string[];
  tier: 'free' | 'starter' | 'business' | 'enterprise';
  popular?: boolean;
}

interface PricingCardProps {
  tier: PricingTier;
  currentTier: string;
  onSubscribe: (tier: string) => void;
  isLoading?: boolean;
}

export function PricingCard({ tier, currentTier, onSubscribe, isLoading }: PricingCardProps) {
  const isCurrentPlan = currentTier === tier.tier;
  const isUpgrade = getTierOrder(tier.tier) > getTierOrder(currentTier as any);
  const isDowngrade = getTierOrder(tier.tier) < getTierOrder(currentTier as any);

  return (
    <Card className={cn(
      "relative flex flex-col",
      tier.popular && "border-primary shadow-lg",
      isCurrentPlan && "ring-2 ring-primary"
    )}>
      {tier.popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          Most Popular
        </Badge>
      )}
      {isCurrentPlan && (
        <Badge variant="secondary" className="absolute -top-3 right-4">
          Current Plan
        </Badge>
      )}
      
      <CardHeader>
        <CardTitle className="text-xl">{tier.name}</CardTitle>
        <CardDescription>{tier.description}</CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1">
        <div className="mb-6">
          <span className="text-4xl font-bold">{tier.price}</span>
          {tier.priceAmount > 0 && (
            <span className="text-muted-foreground">/month</span>
          )}
        </div>
        
        <ul className="space-y-3">
          {tier.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      
      <CardFooter>
        {tier.tier === 'free' ? (
          <Button 
            variant="outline" 
            className="w-full" 
            disabled={isCurrentPlan}
          >
            {isCurrentPlan ? 'Current Plan' : 'Free Forever'}
          </Button>
        ) : tier.tier === 'enterprise' ? (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => window.location.href = 'mailto:sales@prism.ng?subject=Enterprise%20API%20Inquiry'}
          >
            Contact Sales
          </Button>
        ) : (
          <Button 
            className="w-full"
            variant={isCurrentPlan ? "outline" : "default"}
            disabled={isCurrentPlan || isLoading}
            onClick={() => onSubscribe(tier.tier)}
          >
            {isLoading ? 'Processing...' : 
             isCurrentPlan ? 'Current Plan' : 
             isUpgrade ? 'Upgrade' : 
             isDowngrade ? 'Downgrade' : 'Subscribe'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function getTierOrder(tier: 'free' | 'starter' | 'business' | 'enterprise'): number {
  const order = { free: 0, starter: 1, business: 2, enterprise: 3 };
  return order[tier] ?? 0;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    name: 'Free',
    tier: 'free',
    price: '₦0',
    priceAmount: 0,
    description: 'For testing and development',
    features: [
      '10 requests/minute',
      '100 requests/day',
      'Basic tax calculations',
      'Community support',
    ],
  },
  {
    name: 'Starter',
    tier: 'starter',
    price: '₦5,000',
    priceAmount: 5000,
    description: 'For small projects and startups',
    features: [
      '60 requests/minute',
      '5,000 requests/day',
      'Webhook notifications',
      'Email support',
      'API usage analytics',
    ],
  },
  {
    name: 'Business',
    tier: 'business',
    price: '₦50,000',
    priceAmount: 50000,
    popular: true,
    description: 'For growing businesses',
    features: [
      '120 requests/minute',
      '50,000 requests/day',
      'Document processing API',
      'OCR capabilities',
      'Priority support',
      'Dedicated account manager',
    ],
  },
  {
    name: 'Enterprise',
    tier: 'enterprise',
    price: 'Custom',
    priceAmount: 0,
    description: 'For large organizations',
    features: [
      'Unlimited requests',
      'Custom rate limits',
      'Full API access',
      'SLA guarantee',
      '24/7 phone support',
      'Custom integrations',
      'On-premise deployment option',
    ],
  },
];
