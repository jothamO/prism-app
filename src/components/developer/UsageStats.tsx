import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, Calendar, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UsageData {
  daily_requests: number;
  monthly_requests: number;
  daily_limit: number;
  monthly_limit: number;
  avg_response_time: number;
  error_rate: number;
}

interface UsageStatsProps {
  userId: string;
  tier: string;
}

const TIER_LIMITS = {
  free: { daily: 100, monthly: 3000 },
  starter: { daily: 5000, monthly: 150000 },
  business: { daily: 50000, monthly: 1500000 },
  enterprise: { daily: Infinity, monthly: Infinity },
};

export function UsageStats({ userId, tier }: UsageStatsProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
  }, [userId]);

  async function fetchUsage() {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      // Get user's API keys first
      const { data: keys } = await supabase
        .from('api_keys')
        .select('id')
        .eq('user_id', userId);

      if (!keys?.length) {
        setUsage({
          daily_requests: 0,
          monthly_requests: 0,
          daily_limit: TIER_LIMITS[tier as keyof typeof TIER_LIMITS]?.daily || 100,
          monthly_limit: TIER_LIMITS[tier as keyof typeof TIER_LIMITS]?.monthly || 3000,
          avg_response_time: 0,
          error_rate: 0,
        });
        setLoading(false);
        return;
      }

      const keyIds = keys.map(k => k.id);

      // Fetch daily usage
      const { data: dailyData, count: dailyCount } = await supabase
        .from('api_usage')
        .select('response_time_ms, status_code', { count: 'exact' })
        .in('api_key_id', keyIds)
        .gte('created_at', startOfDay);

      // Fetch monthly usage
      const { count: monthlyCount } = await supabase
        .from('api_usage')
        .select('*', { count: 'exact', head: true })
        .in('api_key_id', keyIds)
        .gte('created_at', startOfMonth);

      // Calculate metrics
      const avgResponseTime = dailyData?.length 
        ? dailyData.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / dailyData.length 
        : 0;
      
      const errorCount = dailyData?.filter(r => r.status_code && r.status_code >= 400).length || 0;
      const errorRate = dailyData?.length ? (errorCount / dailyData.length) * 100 : 0;

      const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free;

      setUsage({
        daily_requests: dailyCount || 0,
        monthly_requests: monthlyCount || 0,
        daily_limit: limits.daily,
        monthly_limit: limits.monthly,
        avg_response_time: Math.round(avgResponseTime),
        error_rate: Math.round(errorRate * 10) / 10,
      });
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded mb-2" />
              <div className="h-2 w-full bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!usage) return null;

  const dailyPercentage = usage.daily_limit === Infinity 
    ? 0 
    : Math.min((usage.daily_requests / usage.daily_limit) * 100, 100);
  
  const monthlyPercentage = usage.monthly_limit === Infinity 
    ? 0 
    : Math.min((usage.monthly_requests / usage.monthly_limit) * 100, 100);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Today's Usage</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {usage.daily_requests.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground">
              {usage.daily_limit === Infinity ? '' : ` / ${usage.daily_limit.toLocaleString()}`}
            </span>
          </div>
          {usage.daily_limit !== Infinity && (
            <>
              <Progress value={dailyPercentage} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {dailyPercentage.toFixed(1)}% of daily limit
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Monthly Usage</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {usage.monthly_requests.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground">
              {usage.monthly_limit === Infinity ? '' : ` / ${usage.monthly_limit.toLocaleString()}`}
            </span>
          </div>
          {usage.monthly_limit !== Infinity && (
            <>
              <Progress value={monthlyPercentage} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {monthlyPercentage.toFixed(1)}% of monthly limit
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Performance</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <span className="text-2xl font-bold">{usage.avg_response_time}ms</span>
              <p className="text-xs text-muted-foreground">Avg. response time</p>
            </div>
            <div>
              <span className={`text-lg font-semibold ${usage.error_rate > 5 ? 'text-destructive' : 'text-green-500'}`}>
                {usage.error_rate}%
              </span>
              <span className="text-xs text-muted-foreground ml-1">error rate</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
