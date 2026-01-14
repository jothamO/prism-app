import { useState, useEffect } from "react";
import {
    Webhook,
    RefreshCw,
    Plus,
    Play,
    Pause,
    Trash2,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface WebhookConfig {
    id: string;
    user_id: string;
    url: string;
    events: string[];
    is_active: boolean;
    secret: string;
    created_at: string;
    last_triggered_at: string | null;
    failure_count: number;
}

export default function AdminWebhooks() {
    const [loading, setLoading] = useState(true);
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
    const [stats, setStats] = useState({ total: 0, active: 0, failed: 0 });

    useEffect(() => {
        fetchWebhooks();
    }, []);

    async function fetchWebhooks() {
        setLoading(true);
        try {
            // Check if webhooks table exists
            const { data, error } = await supabase
                .from('webhooks')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setWebhooks(data);
                setStats({
                    total: data.length,
                    active: data.filter(w => w.is_active).length,
                    failed: data.filter(w => w.failure_count > 0).length
                });
            }
        } catch (error) {
            // Table may not exist yet
            console.log('Webhooks table not available');
        } finally {
            setLoading(false);
        }
    }

    const eventBadgeColor = (event: string) => {
        const colors: Record<string, string> = {
            'calculation.completed': 'bg-blue-100 text-blue-800',
            'document.processed': 'bg-green-100 text-green-800',
            'filing.submitted': 'bg-purple-100 text-purple-800',
            'payment.received': 'bg-amber-100 text-amber-800',
        };
        return colors[event] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Webhooks</h1>
                    <p className="text-muted-foreground">Manage developer webhook configurations</p>
                </div>
                <Button onClick={fetchWebhooks} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Webhooks</CardDescription>
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
                        <CardDescription>Failed</CardDescription>
                        <CardTitle className="text-2xl text-red-600">{stats.failed}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Webhooks List */}
            <Card>
                <CardHeader>
                    <CardTitle>Webhook Endpoints</CardTitle>
                    <CardDescription>Developer-configured webhook URLs</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                    ) : webhooks.length === 0 ? (
                        <div className="text-center py-12">
                            <Webhook className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-lg font-medium text-muted-foreground">No Webhooks Configured</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Developers can configure webhooks via the Developer Portal
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {webhooks.map((webhook) => (
                                <div key={webhook.id} className="py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-3 h-3 rounded-full ${webhook.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <code className="text-sm font-mono">{webhook.url}</code>
                                                <a href={webhook.url} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                                </a>
                                            </div>
                                            <div className="flex gap-1 mt-1">
                                                {webhook.events.map(event => (
                                                    <Badge key={event} className={eventBadgeColor(event)} variant="secondary">
                                                        {event}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {webhook.failure_count > 0 && (
                                            <Badge variant="destructive" className="gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {webhook.failure_count} failures
                                            </Badge>
                                        )}
                                        {webhook.last_triggered_at && (
                                            <span className="text-xs text-muted-foreground">
                                                Last: {new Date(webhook.last_triggered_at).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Coming Soon */}
            <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                    <Webhook className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Webhook Logs & Testing Coming Soon</p>
                    <p className="text-sm mt-1">View delivery logs and test webhook endpoints</p>
                </CardContent>
            </Card>
        </div>
    );
}
