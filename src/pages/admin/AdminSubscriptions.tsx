import { useState, useEffect } from "react";
import {
    Users,
    RefreshCw,
    CreditCard,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Subscription {
    id: string;
    user_id: string;
    tier_id: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    requests_this_period: number;
    created_at: string;
    users?: { email: string; full_name: string };
    api_pricing_tiers?: { name: string; display_name: string };
}

export default function AdminSubscriptions() {
    const { toast } = useToast();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        cancelled: 0,
        pastDue: 0,
        mrr: 0
    });

    useEffect(() => {
        fetchSubscriptions();
    }, [statusFilter]);

    async function fetchSubscriptions() {
        setLoading(true);
        try {
            let query = supabase
                .from('user_subscriptions')
                .select(`
                    *,
                    users:user_id (email, full_name),
                    api_pricing_tiers:tier_id (name, display_name)
                `)
                .order('created_at', { ascending: false });

            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            const { data, error } = await query;
            if (error) throw error;

            setSubscriptions(data || []);

            // Calculate stats
            const activeCount = data?.filter(s => s.status === 'active').length || 0;
            const cancelledCount = data?.filter(s => s.status === 'cancelled').length || 0;
            const pastDueCount = data?.filter(s => s.status === 'past_due').length || 0;

            setStats({
                total: data?.length || 0,
                active: activeCount,
                cancelled: cancelledCount,
                pastDue: pastDueCount,
                mrr: 0 // Would calculate from tier prices
            });
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
        } finally {
            setLoading(false);
        }
    }

    async function updateStatus(subId: string, newStatus: string) {
        try {
            const { error } = await supabase
                .from('user_subscriptions')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', subId);

            if (error) throw error;

            toast({ title: "Updated", description: `Subscription status changed to ${newStatus}` });
            fetchSubscriptions();
        } catch (error) {
            toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
        }
    }

    function getStatusBadge(status: string) {
        const config: Record<string, { color: string; icon: any }> = {
            active: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
            cancelled: { color: 'bg-gray-100 text-gray-800', icon: XCircle },
            past_due: { color: 'bg-red-100 text-red-800', icon: AlertTriangle },
            trialing: { color: 'bg-blue-100 text-blue-800', icon: CreditCard },
            paused: { color: 'bg-amber-100 text-amber-800', icon: AlertTriangle }
        };
        const { color, icon: Icon } = config[status] || config.cancelled;
        return (
            <Badge className={`${color} flex items-center gap-1`}>
                <Icon className="w-3 h-3" />
                {status}
            </Badge>
        );
    }

    const filteredSubs = subscriptions.filter(sub => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            sub.users?.email?.toLowerCase().includes(term) ||
            sub.api_pricing_tiers?.display_name?.toLowerCase().includes(term)
        );
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Subscriptions</h1>
                    <p className="text-muted-foreground">Manage user API subscriptions</p>
                </div>
                <Button onClick={fetchSubscriptions} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total</CardDescription>
                        <CardTitle className="text-2xl">{stats.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Active</CardDescription>
                        <CardTitle className="text-2xl text-green-600">{stats.active}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Cancelled</CardDescription>
                        <CardTitle className="text-2xl text-gray-600">{stats.cancelled}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Past Due</CardDescription>
                        <CardTitle className="text-2xl text-red-600">{stats.pastDue}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <Input
                    placeholder="Search by user or tier..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="past_due">Past Due</SelectItem>
                        <SelectItem value="trialing">Trialing</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Subscriptions List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                    ) : filteredSubs.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No subscriptions found
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredSubs.map((sub) => (
                                <div key={sub.id} className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <Users className="w-5 h-5 text-muted-foreground" />
                                        <div>
                                            <div className="font-medium">
                                                {sub.users?.email || 'Unknown user'}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {sub.api_pricing_tiers?.display_name || 'Unknown tier'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right text-sm">
                                            <div className="text-muted-foreground">
                                                {sub.requests_this_period.toLocaleString()} requests
                                            </div>
                                            {sub.current_period_end && (
                                                <div className="text-xs text-muted-foreground">
                                                    Renews: {new Date(sub.current_period_end).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                        {getStatusBadge(sub.status)}
                                        <Select
                                            value={sub.status}
                                            onValueChange={(v) => updateStatus(sub.id, v)}
                                        >
                                            <SelectTrigger className="w-28 h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="cancelled">Cancelled</SelectItem>
                                                <SelectItem value="past_due">Past Due</SelectItem>
                                                <SelectItem value="paused">Paused</SelectItem>
                                            </SelectContent>
                                        </Select>
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
