import { useState, useEffect, useRef } from "react";
import { Check, Zap, Building, Crown, Users, CreditCard, ArrowRight, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface PricingTier {
    id: string;
    name: string;
    display_name: string;
    price_monthly: number;
    price_yearly: number | null;
    max_team_members: number;
    max_bank_accounts: number;
    max_ocr_docs_per_month: number;
    max_chats_per_day: number | null;
    has_pdf_reports: boolean;
    has_reminders: boolean;
    has_filing_assistance: boolean;
    has_priority_support: boolean;
    has_api_access: boolean;
    min_revenue_band: string | null;
    is_featured: boolean;
}

interface CurrentSubscription {
    tier_id: string;
    tier_name: string;
    status: string;
}

export default function Pricing() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [loading, setLoading] = useState(true);
    const [isYearly, setIsYearly] = useState(false);
    const [currentSub, setCurrentSub] = useState<CurrentSubscription | null>(null);
    const [subscribing, setSubscribing] = useState<string | null>(null);
    const [testModeEnabled, setTestModeEnabled] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchTiers();
        fetchTestMode();
        if (user) fetchCurrentSubscription();
    }, [user]);

    async function fetchTestMode() {
        const { data } = await supabase
            .from('system_settings')
            .select('test_mode_enabled')
            .single();
        setTestModeEnabled(data?.test_mode_enabled ?? false);
    }

    async function fetchTiers() {
        const { data, error } = await supabase
            .from('user_pricing_tiers')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');

        if (!error && data) setTiers(data);
        setLoading(false);
    }

    async function fetchCurrentSubscription() {
        const { data } = await supabase
            .from('user_subscriptions')
            .select(`
                tier_id,
                status,
                user_pricing_tiers (name)
            `)
            .eq('user_id', user?.id)
            .single();

        if (data) {
            setCurrentSub({
                tier_id: data.tier_id,
                tier_name: (data as any).user_pricing_tiers?.name || 'free',
                status: data.status
            });
        }
    }

    async function handleSubscribe(tier: PricingTier) {
        if (!user) {
            navigate('/auth?redirect=/pricing');
            return;
        }

        if (tier.name === 'free') {
            toast({ title: "Free Tier", description: "You're already on the free tier!" });
            return;
        }

        if (tier.name === 'enterprise') {
            toast({ title: "Enterprise", description: "Please contact us for enterprise pricing" });
            return;
        }

        setSubscribing(tier.id);
        try {
            // TODO: Integrate with Paystack
            const { error } = await supabase.functions.invoke('paystack-subscribe', {
                body: { tier_id: tier.id, billing_cycle: isYearly ? 'yearly' : 'monthly' }
            });

            if (error) throw error;
            toast({ title: "Success", description: "Subscription started!" });
            fetchCurrentSubscription();
        } catch (error) {
            toast({ title: "Error", description: "Failed to subscribe", variant: "destructive" });
        } finally {
            setSubscribing(null);
        }
    }

    function formatPrice(kobo: number): string {
        return `₦${(kobo / 100).toLocaleString()}`;
    }

    function getIcon(tierName: string) {
        switch (tierName) {
            case 'free': return <Users className="w-6 h-6" />;
            case 'personal':
            case 'personal_plus': return <Zap className="w-6 h-6" />;
            case 'business_lite':
            case 'business_standard':
            case 'business_pro': return <Building className="w-6 h-6" />;
            case 'enterprise': return <Crown className="w-6 h-6" />;
            default: return <CreditCard className="w-6 h-6" />;
        }
    }

    function getFeatures(tier: PricingTier): string[] {
        const features: string[] = [];

        if (tier.max_chats_per_day === null) {
            features.push("Unlimited AI chats");
        } else {
            features.push(`${tier.max_chats_per_day} AI chats/day`);
        }

        if (tier.max_bank_accounts > 0) {
            features.push(`${tier.max_bank_accounts === 999999 ? 'Unlimited' : tier.max_bank_accounts} bank account${tier.max_bank_accounts !== 1 ? 's' : ''}`);
        }

        if (tier.max_ocr_docs_per_month > 0) {
            features.push(`${tier.max_ocr_docs_per_month === 999999 ? 'Unlimited' : tier.max_ocr_docs_per_month} OCR docs/month`);
        }

        if (tier.max_team_members > 1) {
            features.push(`${tier.max_team_members === 999999 ? 'Unlimited' : tier.max_team_members} team members`);
        }

        if (tier.has_pdf_reports) features.push("PDF tax reports");
        if (tier.has_reminders) features.push("Tax reminders");
        if (tier.has_filing_assistance) features.push("Filing assistance");
        if (tier.has_priority_support) features.push("Priority support");
        if (tier.has_api_access) features.push("API access");

        return features;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-12 px-4">
            <div className="max-w-7xl mx-auto">
                {/* Back Button */}
                <Button variant="ghost" onClick={() => navigate(user ? '/dashboard' : '/')} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>

                {/* Test Mode Banner */}
                {testModeEnabled && (
                    <div className="mb-6 p-4 bg-amber-500/20 border border-amber-500/30 rounded-lg text-center">
                        <p className="text-amber-600 font-medium">
                            🔧 Subscriptions are temporarily disabled during testing period.
                        </p>
                    </div>
                )}

                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
                    <p className="text-xl text-muted-foreground mb-8">
                        Choose the plan that's right for you. All plans include tax calculator access.
                    </p>

                    {/* Billing Toggle */}
                    <div className="flex items-center justify-center gap-4">
                        <span className={!isYearly ? 'font-medium' : 'text-muted-foreground'}>Monthly</span>
                        <Switch checked={isYearly} onCheckedChange={setIsYearly} />
                        <span className={isYearly ? 'font-medium' : 'text-muted-foreground'}>
                            Yearly <Badge variant="secondary" className="ml-1">Save 17%</Badge>
                        </span>
                    </div>
                </div>

                {/* Pricing Cards - Horizontal Scroll */}
                <div className="relative">
                    {/* Left scroll arrow */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 hidden md:flex bg-background/80 backdrop-blur-sm shadow-md hover:bg-background"
                        onClick={() => scrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </Button>

                    {/* Horizontal scroll container */}
                    <div
                        ref={scrollRef}
                        className="flex gap-6 overflow-x-auto pb-4 px-10 snap-x snap-mandatory scrollbar-hide"
                    >
                        {tiers.map((tier) => (
                            <Card
                                key={tier.id}
                                className={`relative flex flex-col min-w-[280px] max-w-[300px] flex-shrink-0 snap-center ${tier.is_featured ? 'border-primary border-2 shadow-lg scale-105' : ''}`}
                            >
                                {tier.is_featured && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                                    </div>
                                )}

                                <CardHeader className="text-center pb-4">
                                    <div className="mx-auto mb-2 p-2 bg-primary/10 rounded-full w-fit">
                                        {getIcon(tier.name)}
                                    </div>
                                    <CardTitle className="text-xl">{tier.display_name}</CardTitle>
                                    <CardDescription>{tier.min_revenue_band?.replace('_', ' ') || 'For everyone'}</CardDescription>
                                </CardHeader>

                                <CardContent className="flex-1 flex flex-col">
                                    {/* Price */}
                                    <div className="text-center mb-6">
                                        {tier.price_monthly === 0 && tier.name !== 'enterprise' ? (
                                            <div className="text-4xl font-bold">Free</div>
                                        ) : tier.name === 'enterprise' ? (
                                            <div className="text-2xl font-bold">Custom</div>
                                        ) : (
                                            <>
                                                <div className="text-4xl font-bold">
                                                    {formatPrice(isYearly && tier.price_yearly ? tier.price_yearly / 12 : tier.price_monthly)}
                                                </div>
                                                <div className="text-muted-foreground">/month</div>
                                                {isYearly && tier.price_yearly && (
                                                    <div className="text-sm text-green-600 mt-1">
                                                        {formatPrice(tier.price_yearly)}/year
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Features */}
                                    <ul className="space-y-3 mb-6 flex-1">
                                        {getFeatures(tier).map((feature, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                                <span className="text-sm">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {/* CTA Button */}
                                    <Button
                                        className="w-full"
                                        variant={tier.is_featured ? 'default' : 'outline'}
                                        disabled={testModeEnabled || subscribing === tier.id || currentSub?.tier_id === tier.id}
                                        onClick={() => handleSubscribe(tier)}
                                    >
                                        {subscribing === tier.id ? (
                                            <span className="animate-spin">⏳</span>
                                        ) : currentSub?.tier_id === tier.id ? (
                                            "Current Plan"
                                        ) : tier.name === 'enterprise' ? (
                                            "Contact Sales"
                                        ) : tier.name === 'free' ? (
                                            "Get Started"
                                        ) : (
                                            <>Subscribe <ArrowRight className="w-4 h-4 ml-1" /></>
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Right scroll arrow */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 hidden md:flex bg-background/80 backdrop-blur-sm shadow-md hover:bg-background"
                        onClick={() => scrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                    >
                        <ChevronRight className="w-6 h-6" />
                    </Button>
                </div>

                {/* All Plans Link */}
                <div className="text-center mt-8">
                    <Button variant="link" onClick={() => navigate('/pricing/compare')}>
                        Compare all 7 plans →
                    </Button>
                </div>

                {/* Revenue Bands Info */}
                <div className="mt-16 bg-muted/50 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Which plan is right for my business?</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                            <strong>Under ₦25M turnover</strong>
                            <p className="text-muted-foreground">Business Lite - 0% CIT eligible</p>
                        </div>
                        <div>
                            <strong>₦25M - ₦100M turnover</strong>
                            <p className="text-muted-foreground">Business Standard - 20% CIT rate</p>
                        </div>
                        <div>
                            <strong>Over ₦100M turnover</strong>
                            <p className="text-muted-foreground">Business Pro or Enterprise - 30% CIT rate</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
