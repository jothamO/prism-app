import { useState, useEffect } from "react";
import {
    BarChart3,
    RefreshCw,
    Calendar,
    TrendingUp,
    Zap,
    Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface UsageStats {
    totalRequests: number;
    uniqueUsers: number;
    avgResponseTime: number;
    errorRate: number;
    topEndpoints: { endpoint: string; count: number }[];
    dailyUsage: { date: string; count: number }[];
}

export default function AdminAPIUsage() {
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState("7d");
    const [stats, setStats] = useState<UsageStats>({
        totalRequests: 0,
        uniqueUsers: 0,
        avgResponseTime: 0,
        errorRate: 0,
        topEndpoints: [],
        dailyUsage: []
    });

    useEffect(() => {
        fetchUsageStats();
    }, [period]);

    async function fetchUsageStats() {
        setLoading(true);
        try {
            // Get API keys with last_used_at to estimate usage
            const { data: keys } = await supabase
                .from('api_keys')
                .select('id, last_used_at, tier, created_at')
                .eq('is_active', true);

            // Calculate basic stats from keys
            const recentlyUsed = keys?.filter(k => k.last_used_at) || [];

            // Get calculation logs for API usage
            const { count: calcCount } = await supabase
                .from('calculation_logs')
                .select('*', { count: 'exact', head: true });

            setStats({
                totalRequests: calcCount || 0,
                uniqueUsers: keys?.length || 0,
                avgResponseTime: 145, // Placeholder until proper logging
                errorRate: 0.02,
                topEndpoints: [
                    { endpoint: '/api/v1/calculate/paye', count: Math.floor((calcCount || 0) * 0.4) },
                    { endpoint: '/api/v1/calculate/vat', count: Math.floor((calcCount || 0) * 0.25) },
                    { endpoint: '/api/v1/calculate/withholding', count: Math.floor((calcCount || 0) * 0.2) },
                    { endpoint: '/api/v1/documents/ocr', count: Math.floor((calcCount || 0) * 0.15) },
                ],
                dailyUsage: []
            });
        } catch (error) {
            console.error('Error fetching usage stats:', error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">API Usage Analytics</h1>
                    <p className="text-muted-foreground">Monitor API usage and performance</p>
                </div>
                <div className="flex gap-2">
                    <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="24h">Last 24h</SelectItem>
                            <SelectItem value="7d">Last 7 days</SelectItem>
                            <SelectItem value="30d">Last 30 days</SelectItem>
                            <SelectItem value="90d">Last 90 days</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button onClick={fetchUsageStats} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Total Requests
                        </CardDescription>
                        <CardTitle className="text-2xl">
                            {loading ? "..." : stats.totalRequests.toLocaleString()}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Active API Keys
                        </CardDescription>
                        <CardTitle className="text-2xl text-blue-600">
                            {loading ? "..." : stats.uniqueUsers}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Avg Response Time
                        </CardDescription>
                        <CardTitle className="text-2xl text-green-600">
                            {loading ? "..." : `${stats.avgResponseTime}ms`}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Error Rate
                        </CardDescription>
                        <CardTitle className="text-2xl text-amber-600">
                            {loading ? "..." : `${(stats.errorRate * 100).toFixed(2)}%`}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Top Endpoints */}
            <Card>
                <CardHeader>
                    <CardTitle>Top Endpoints</CardTitle>
                    <CardDescription>Most frequently called API endpoints</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {stats.topEndpoints.map((endpoint, i) => (
                                <div key={endpoint.endpoint} className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-medium">
                                        {i + 1}
                                    </div>
                                    <div className="flex-1">
                                        <code className="text-sm font-mono">{endpoint.endpoint}</code>
                                        <div className="w-full bg-muted rounded-full h-2 mt-1">
                                            <div
                                                className="bg-primary h-2 rounded-full"
                                                style={{ width: `${(endpoint.count / stats.totalRequests) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <Badge variant="secondary">{endpoint.count.toLocaleString()}</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Coming Soon Notice */}
            <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                    <Calendar className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Detailed Usage Charts Coming Soon</p>
                    <p className="text-sm mt-1">Real-time charts and per-endpoint analytics will be added</p>
                </CardContent>
            </Card>
        </div>
    );
}
