import { useEffect, useState } from "react";
import {
  Users,
  DollarSign,
  FileText,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DashboardMetrics {
  totalUsers: number;
  monthlyRevenue: number;
  filings: number;
  reviewQueue: number;
  autoFiledPercentage: number;
  highPriorityReviews: number;
  userGrowth: string;
  revenueGrowth: string;
}

interface RecentUser {
  id: string;
  name: string;
  platform: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalUsers: 0,
    monthlyRevenue: 0,
    filings: 0,
    reviewQueue: 0,
    autoFiledPercentage: 0,
    highPriorityReviews: 0,
    userGrowth: "+0%",
    revenueGrowth: "+0%"
  });
  const [recentActivity, setRecentActivity] = useState<RecentUser[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      // Get total users
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Get users from last month for growth calculation
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const { count: lastMonthUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', lastMonth.toISOString());

      const userGrowth = lastMonthUsers && lastMonthUsers > 0 
        ? Math.round(((userCount || 0) - lastMonthUsers) / lastMonthUsers * 100)
        : 0;

      // Get monthly revenue from invoices
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const { data: revenueData } = await supabase
        .from('invoices')
        .select('total')
        .gte('date', startOfMonth.toISOString().split('T')[0]);
      
      const monthlyRevenue = revenueData?.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0) || 0;

      // Get filings this month
      const { data: filingsData, count: filingCount } = await supabase
        .from('filings')
        .select('auto_filed', { count: 'exact' })
        .gte('created_at', startOfMonth.toISOString());
      
      const autoFiled = filingsData?.filter(f => f.auto_filed).length || 0;
      const autoFiledPct = filingCount && filingCount > 0 ? Math.round((autoFiled / filingCount) * 100) : 0;

      // Get review queue
      const { count: reviewCount } = await supabase
        .from('review_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: highPriorityCount } = await supabase
        .from('review_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('priority', 'high');

      // Get recent users
      const { data: recentUsers } = await supabase
        .from('users')
        .select('id, full_name, first_name, telegram_username, whatsapp_number, platform, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      setMetrics({
        totalUsers: userCount || 0,
        monthlyRevenue,
        filings: filingCount || 0,
        reviewQueue: reviewCount || 0,
        autoFiledPercentage: autoFiledPct,
        highPriorityReviews: highPriorityCount || 0,
        userGrowth: `${userGrowth >= 0 ? '+' : ''}${userGrowth}%`,
        revenueGrowth: "+0%" // Would need historical data
      });

      setRecentActivity(
        (recentUsers || []).map(u => ({
          id: u.id,
          name: u.full_name || `${u.first_name || ''}`.trim() || u.telegram_username || u.whatsapp_number || 'Unknown User',
          platform: u.platform || 'unknown',
          created_at: u.created_at
        }))
      );
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount: number): string {
    if (amount >= 1000000) {
      return `₦${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `₦${(amount / 1000).toFixed(0)}K`;
    }
    return `₦${amount.toLocaleString()}`;
  }

  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  const metricCards = [
    { 
      title: "Total Users", 
      value: metrics.totalUsers.toLocaleString(), 
      change: metrics.userGrowth, 
      isPositive: !metrics.userGrowth.startsWith('-'),
      icon: Users, 
      color: "text-blue-400", 
      bg: "bg-blue-400/10" 
    },
    { 
      title: "Monthly Revenue", 
      value: formatCurrency(metrics.monthlyRevenue), 
      change: metrics.revenueGrowth, 
      isPositive: true,
      icon: DollarSign, 
      color: "text-green-400", 
      bg: "bg-green-400/10" 
    },
    { 
      title: "Filings This Month", 
      value: metrics.filings.toLocaleString(), 
      change: `${metrics.autoFiledPercentage}% Auto`, 
      isPositive: true,
      icon: FileText, 
      color: "text-purple-400", 
      bg: "bg-purple-400/10" 
    },
    { 
      title: "Review Queue", 
      value: metrics.reviewQueue.toString(), 
      change: `${metrics.highPriorityReviews} High Priority`, 
      isPositive: metrics.reviewQueue === 0,
      icon: ShieldAlert, 
      color: "text-orange-400", 
      bg: "bg-orange-400/10" 
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your PRISM platform</p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((metric) => (
          <div key={metric.title} className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${metric.bg}`}>
                <metric.icon className={`w-6 h-6 ${metric.color}`} />
              </div>
              <span className={`text-sm font-medium flex items-center gap-1 ${
                metric.isPositive ? 'text-green-400' : 'text-red-400'
              }`}>
                {metric.change} 
                {metric.isPositive ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
              </span>
            </div>
            <h3 className="text-muted-foreground text-sm font-medium">{metric.title}</h3>
            <p className="text-2xl font-bold text-foreground mt-1">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 h-96">
          <h3 className="text-lg font-medium text-foreground mb-4">Revenue Overview</h3>
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Revenue chart coming soon</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 h-96">
          <h3 className="text-lg font-medium text-foreground mb-4">User Growth</h3>
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Growth chart coming soon</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Recent Activity
        </h3>
        {recentActivity.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No recent user activity
          </div>
        ) : (
          <div className="space-y-4">
            {recentActivity.map((user) => (
              <div key={user.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                    <Users className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">New user registration</p>
                    <p className="text-sm text-muted-foreground">{user.name} joined via {user.platform}</p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">{formatRelativeTime(user.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}