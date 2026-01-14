import { useState, useEffect } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
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

interface FeatureRow {
    name: string;
    getValue: (tier: PricingTier) => React.ReactNode;
}

export default function PricingCompare() {
    const navigate = useNavigate();
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTiers();
    }, []);

    async function fetchTiers() {
        const { data, error } = await supabase
            .from('user_pricing_tiers')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');

        if (!error && data) setTiers(data);
        setLoading(false);
    }

    function formatPrice(kobo: number): string {
        return `₦${(kobo / 100).toLocaleString()}`;
    }

    function formatLimit(value: number | null, isUnlimited: number = 999999): string {
        if (value === null) return "Unlimited";
        if (value >= isUnlimited) return "Unlimited";
        return value.toLocaleString();
    }

    const featureRows: FeatureRow[] = [
        {
            name: "Monthly Price",
            getValue: (tier) => tier.price_monthly === 0 ? "Free" : tier.name === 'enterprise' ? "Custom" : formatPrice(tier.price_monthly)
        },
        {
            name: "AI Chats / Day",
            getValue: (tier) => formatLimit(tier.max_chats_per_day)
        },
        {
            name: "Bank Accounts",
            getValue: (tier) => formatLimit(tier.max_bank_accounts)
        },
        {
            name: "OCR Documents / Month",
            getValue: (tier) => formatLimit(tier.max_ocr_docs_per_month)
        },
        {
            name: "Team Members",
            getValue: (tier) => formatLimit(tier.max_team_members)
        },
        {
            name: "PDF Tax Reports",
            getValue: (tier) => tier.has_pdf_reports ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-muted-foreground mx-auto" />
        },
        {
            name: "Tax Reminders",
            getValue: (tier) => tier.has_reminders ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-muted-foreground mx-auto" />
        },
        {
            name: "Filing Assistance",
            getValue: (tier) => tier.has_filing_assistance ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-muted-foreground mx-auto" />
        },
        {
            name: "Priority Support",
            getValue: (tier) => tier.has_priority_support ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-muted-foreground mx-auto" />
        },
        {
            name: "API Access",
            getValue: (tier) => tier.has_api_access ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-muted-foreground mx-auto" />
        },
        {
            name: "Revenue Band",
            getValue: (tier) => tier.min_revenue_band?.replace('_', ' ') || "Any"
        }
    ];

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
                {/* Header */}
                <div className="mb-8">
                    <Button variant="ghost" onClick={() => navigate('/pricing')} className="mb-4">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pricing
                    </Button>
                    <h1 className="text-4xl font-bold mb-4">Compare All Plans</h1>
                    <p className="text-xl text-muted-foreground">
                        See which plan is right for you with our detailed comparison.
                    </p>
                </div>

                {/* Comparison Table */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-4 font-medium bg-muted/50 sticky left-0 z-10 min-w-[150px]">
                                            Feature
                                        </th>
                                        {tiers.map((tier) => (
                                            <th key={tier.id} className={`text-center p-4 min-w-[130px] ${tier.is_featured ? 'bg-primary/5' : ''}`}>
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="font-semibold">{tier.display_name}</span>
                                                    {tier.is_featured && (
                                                        <Badge className="bg-primary text-primary-foreground text-xs">Popular</Badge>
                                                    )}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {featureRows.map((row, idx) => (
                                        <tr key={row.name} className={idx % 2 === 0 ? 'bg-muted/20' : ''}>
                                            <td className="p-4 font-medium bg-muted/50 sticky left-0 z-10 border-r">
                                                {row.name}
                                            </td>
                                            {tiers.map((tier) => (
                                                <td key={tier.id} className={`p-4 text-center ${tier.is_featured ? 'bg-primary/5' : ''}`}>
                                                    {row.getValue(tier)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* CTA Section */}
                <div className="mt-12 text-center">
                    <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
                    <p className="text-muted-foreground mb-6">Choose the plan that works best for you.</p>
                    <Button size="lg" onClick={() => navigate('/pricing')}>
                        View Pricing Plans
                    </Button>
                </div>
            </div>
        </div>
    );
}
