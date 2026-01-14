import { useState, useEffect } from "react";
import {
    Key,
    Plus,
    Trash2,
    RefreshCw,
    Copy,
    Eye,
    EyeOff,
    Search,
    AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface APIKey {
    id: string;
    user_id: string;
    key_prefix: string;
    name: string;
    tier: string;
    environment: string;
    is_active: boolean;
    last_used_at: string | null;
    created_at: string;
    users?: { email: string; full_name: string };
}

export default function AdminAPIKeys() {
    const { toast } = useToast();
    const [keys, setKeys] = useState<APIKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [tierFilter, setTierFilter] = useState<string>("all");
    const [stats, setStats] = useState({ total: 0, active: 0, byTier: {} as Record<string, number> });

    useEffect(() => {
        fetchKeys();
    }, [tierFilter]);

    async function fetchKeys() {
        setLoading(true);
        try {
            let query = supabase
                .from('api_keys')
                .select(`
                    *,
                    users:user_id (email, full_name)
                `)
                .order('created_at', { ascending: false });

            if (tierFilter !== 'all') {
                query = query.eq('tier', tierFilter);
            }

            const { data, error } = await query;
            if (error) throw error;

            setKeys(data || []);

            // Calculate stats
            const activeCount = data?.filter(k => k.is_active).length || 0;
            const byTier = data?.reduce((acc, k) => {
                acc[k.tier] = (acc[k.tier] || 0) + 1;
                return acc;
            }, {} as Record<string, number>) || {};

            setStats({
                total: data?.length || 0,
                active: activeCount,
                byTier
            });
        } catch (error) {
            console.error('Error fetching keys:', error);
        } finally {
            setLoading(false);
        }
    }

    async function revokeKey(keyId: string) {
        try {
            const { error } = await supabase
                .from('api_keys')
                .update({ is_active: false })
                .eq('id', keyId);

            if (error) throw error;

            toast({ title: "Key Revoked", description: "The API key has been deactivated" });
            fetchKeys();
        } catch (error) {
            toast({ title: "Error", description: "Failed to revoke key", variant: "destructive" });
        }
    }

    async function updateTier(keyId: string, newTier: string) {
        try {
            const { error } = await supabase
                .from('api_keys')
                .update({ tier: newTier })
                .eq('id', keyId);

            if (error) throw error;

            toast({ title: "Tier Updated", description: `Key upgraded to ${newTier}` });
            fetchKeys();
        } catch (error) {
            toast({ title: "Error", description: "Failed to update tier", variant: "destructive" });
        }
    }

    function getTierBadge(tier: string) {
        const colors: Record<string, string> = {
            free: 'bg-gray-100 text-gray-800',
            starter: 'bg-blue-100 text-blue-800',
            business: 'bg-purple-100 text-purple-800',
            enterprise: 'bg-amber-100 text-amber-800'
        };
        return <Badge className={colors[tier] || 'bg-gray-100'}>{tier}</Badge>;
    }

    const filteredKeys = keys.filter(key => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            key.users?.email?.toLowerCase().includes(term) ||
            key.name.toLowerCase().includes(term) ||
            key.key_prefix.toLowerCase().includes(term)
        );
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">API Keys</h1>
                    <p className="text-muted-foreground">Manage developer API keys</p>
                </div>
                <Button onClick={fetchKeys} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Keys</CardDescription>
                        <CardTitle className="text-2xl">{stats.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Active</CardDescription>
                        <CardTitle className="text-2xl text-green-600">{stats.active}</CardTitle>
                    </CardHeader>
                </Card>
                {['free', 'starter', 'business'].map(tier => (
                    <Card key={tier}>
                        <CardHeader className="pb-2">
                            <CardDescription className="capitalize">{tier}</CardDescription>
                            <CardTitle className="text-2xl">{stats.byTier[tier] || 0}</CardTitle>
                        </CardHeader>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <Input
                    placeholder="Search by user, name, or key..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                />
                <Select value={tierFilter} onValueChange={setTierFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Tier" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Tiers</SelectItem>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Keys List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                    ) : filteredKeys.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No API keys found
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredKeys.map((key) => (
                                <div key={key.id} className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-2 h-2 rounded-full ${key.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                                        <Key className="w-5 h-5 text-muted-foreground" />
                                        <div>
                                            <div className="font-medium">{key.name}</div>
                                            <div className="text-sm text-muted-foreground font-mono">
                                                {key.key_prefix}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {key.users?.email || 'Unknown user'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {getTierBadge(key.tier)}
                                        <Badge variant={key.environment === 'live' ? 'default' : 'secondary'}>
                                            {key.environment}
                                        </Badge>
                                        <Select
                                            value={key.tier}
                                            onValueChange={(v) => updateTier(key.id, v)}
                                        >
                                            <SelectTrigger className="w-28 h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="free">Free</SelectItem>
                                                <SelectItem value="starter">Starter</SelectItem>
                                                <SelectItem value="business">Business</SelectItem>
                                                <SelectItem value="enterprise">Enterprise</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {key.is_active && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => revokeKey(key.id)}
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                        )}
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
