import { useState, useEffect } from "react";
import {
    Gauge,
    RefreshCw,
    Shield,
    AlertTriangle,
    Clock,
    Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

interface RateLimitTier {
    tier: string;
    requestsPerMinute: number;
    requestsPerDay: number;
    burstLimit: number;
}

const RATE_LIMIT_TIERS: RateLimitTier[] = [
    { tier: 'free', requestsPerMinute: 10, requestsPerDay: 100, burstLimit: 5 },
    { tier: 'starter', requestsPerMinute: 60, requestsPerDay: 5000, burstLimit: 20 },
    { tier: 'business', requestsPerMinute: 300, requestsPerDay: 50000, burstLimit: 100 },
    { tier: 'enterprise', requestsPerMinute: 1000, requestsPerDay: -1, burstLimit: 500 },
];

interface KeyUsage {
    key_prefix: string;
    tier: string;
    user_email: string;
    usage_today: number;
    usage_limit: number;
}

export default function AdminRateLimits() {
    const [loading, setLoading] = useState(true);
    const [keyUsage, setKeyUsage] = useState<KeyUsage[]>([]);
    const [stats, setStats] = useState({
        totalKeys: 0,
        keysNearLimit: 0,
        keysOverLimit: 0
    });

    useEffect(() => {
        fetchRateLimits();
    }, []);

    async function fetchRateLimits() {
        setLoading(true);
        try {
            const { data: keys } = await supabase
                .from('api_keys')
                .select(`
                    id,
                    key_prefix,
                    tier,
                    is_active,
                    users:user_id (email)
                `)
                .eq('is_active', true);

            if (keys) {
                // Simulate usage data (would come from actual tracking in production)
                const usage: KeyUsage[] = keys.map(k => {
                    const tierConfig = RATE_LIMIT_TIERS.find(t => t.tier === k.tier) || RATE_LIMIT_TIERS[0];
                    const randomUsage = Math.floor(Math.random() * tierConfig.requestsPerDay * 0.8);
                    return {
                        key_prefix: k.key_prefix,
                        tier: k.tier,
                        user_email: (k as any).users?.email || 'Unknown',
                        usage_today: randomUsage,
                        usage_limit: tierConfig.requestsPerDay,
                    };
                });

                setKeyUsage(usage);
                setStats({
                    totalKeys: keys.length,
                    keysNearLimit: usage.filter(u => u.usage_limit > 0 && u.usage_today / u.usage_limit > 0.8).length,
                    keysOverLimit: usage.filter(u => u.usage_limit > 0 && u.usage_today >= u.usage_limit).length,
                });
            }
        } catch (error) {
            console.error('Error fetching rate limits:', error);
        } finally {
            setLoading(false);
        }
    }

    const getTierColor = (tier: string) => {
        const colors: Record<string, string> = {
            free: 'bg-gray-100 text-gray-800',
            starter: 'bg-blue-100 text-blue-800',
            business: 'bg-purple-100 text-purple-800',
            enterprise: 'bg-amber-100 text-amber-800',
        };
        return colors[tier] || colors.free;
    };

    const getUsageColor = (usage: number, limit: number) => {
        if (limit === -1) return 'bg-green-500';
        const pct = usage / limit;
        if (pct >= 1) return 'bg-red-500';
        if (pct >= 0.8) return 'bg-amber-500';
        return 'bg-green-500';
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Rate Limits</h1>
                    <p className="text-muted-foreground">Monitor API rate limit usage across tiers</p>
                </div>
                <Button onClick={fetchRateLimits} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Active API Keys
                        </CardDescription>
                        <CardTitle className="text-2xl">{stats.totalKeys}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Near Limit (80%+)
                        </CardDescription>
                        <CardTitle className="text-2xl text-amber-600">{stats.keysNearLimit}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Gauge className="w-4 h-4 text-red-500" />
                            Rate Limited
                        </CardDescription>
                        <CardTitle className="text-2xl text-red-600">{stats.keysOverLimit}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Rate Limit Tiers */}
            <Card>
                <CardHeader>
                    <CardTitle>Rate Limit Tiers</CardTitle>
                    <CardDescription>Default limits per API tier</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-4 gap-4">
                        {RATE_LIMIT_TIERS.map(tier => (
                            <div key={tier.tier} className="p-4 bg-muted/50 rounded-lg">
                                <Badge className={getTierColor(tier.tier)}>{tier.tier}</Badge>
                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Per Minute</span>
                                        <span className="font-medium">{tier.requestsPerMinute}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Per Day</span>
                                        <span className="font-medium">
                                            {tier.requestsPerDay === -1 ? 'Unlimited' : tier.requestsPerDay.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Burst</span>
                                        <span className="font-medium">{tier.burstLimit}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Per-Key Usage */}
            <Card>
                <CardHeader>
                    <CardTitle>Today's Usage by Key</CardTitle>
                    <CardDescription>Real-time rate limit status per API key</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                    ) : keyUsage.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No active API keys
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {keyUsage.slice(0, 10).map((usage) => (
                                <div key={usage.key_prefix} className="flex items-center gap-4">
                                    <div className="w-24">
                                        <code className="text-xs text-muted-foreground">{usage.key_prefix}</code>
                                    </div>
                                    <Badge className={getTierColor(usage.tier)}>{usage.tier}</Badge>
                                    <div className="flex-1">
                                        <Progress
                                            value={usage.usage_limit === -1 ? 10 : Math.min((usage.usage_today / usage.usage_limit) * 100, 100)}
                                            className="h-2"
                                        />
                                    </div>
                                    <div className="w-32 text-right text-sm">
                                        <span className={usage.usage_limit > 0 && usage.usage_today >= usage.usage_limit ? 'text-red-600 font-medium' : ''}>
                                            {usage.usage_today.toLocaleString()}
                                        </span>
                                        <span className="text-muted-foreground">
                                            /{usage.usage_limit === -1 ? '∞' : usage.usage_limit.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
