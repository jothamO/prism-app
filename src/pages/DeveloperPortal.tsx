import { useState, useEffect } from "react";
import {
    Key,
    Plus,
    Copy,
    Trash2,
    RefreshCw,
    Eye,
    EyeOff,
    ExternalLink,
    AlertTriangle,
    CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface APIKey {
    id: string;
    key_prefix: string;
    name: string;
    tier: string;
    environment: string;
    is_active: boolean;
    last_used_at: string | null;
    created_at: string;
}

const TIERS = [
    { value: 'free', label: 'Free', price: '₦0/mo', limits: '100 requests/day' },
    { value: 'starter', label: 'Starter', price: '₦5,000/mo', limits: '5,000 requests/day + Webhooks' },
    { value: 'business', label: 'Business', price: '₦50,000/mo', limits: '50,000 requests/day + Documents + OCR' },
    { value: 'enterprise', label: 'Enterprise', price: '₦500,000/mo', limits: 'Unlimited + Priority Support' },
];

export default function DeveloperPortal() {
    const { toast } = useToast();
    const [keys, setKeys] = useState<APIKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newKeyName, setNewKeyName] = useState("");
    const [newKeyEnv, setNewKeyEnv] = useState("test");
    const [showNewKey, setShowNewKey] = useState<string | null>(null);

    useEffect(() => {
        fetchKeys();
    }, []);

    async function fetchKeys() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data, error } = await supabase.functions.invoke('api-key-manager', {
                body: { action: 'list' }
            });

            if (error) throw error;
            setKeys(data.keys || []);
        } catch (error) {
            console.error('Error fetching keys:', error);
            toast({
                title: "Error",
                description: "Failed to load API keys",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    }

    async function createKey() {
        if (!newKeyName.trim()) {
            toast({ title: "Error", description: "Please enter a key name", variant: "destructive" });
            return;
        }

        setCreating(true);
        try {
            const { data, error } = await supabase.functions.invoke('api-key-manager', {
                body: {
                    action: 'create',
                    name: newKeyName,
                    environment: newKeyEnv,
                    tier: 'free'
                }
            });

            if (error) throw error;

            setShowNewKey(data.key);
            setNewKeyName("");
            fetchKeys();

            toast({
                title: "API Key Created",
                description: "Copy your key now - it won't be shown again!"
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to create API key",
                variant: "destructive"
            });
        } finally {
            setCreating(false);
        }
    }

    async function revokeKey(keyId: string) {
        try {
            const { error } = await supabase.functions.invoke('api-key-manager', {
                body: { action: 'revoke', key_id: keyId }
            });

            if (error) throw error;
            fetchKeys();
            toast({ title: "Key Revoked", description: "The API key has been deactivated" });
        } catch (error) {
            toast({ title: "Error", description: "Failed to revoke key", variant: "destructive" });
        }
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied!", description: "API key copied to clipboard" });
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Developer Portal</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your API keys and integrate PRISM into your applications
                </p>
            </div>

            {/* Pricing Tiers */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {TIERS.map((tier) => (
                    <Card key={tier.value} className={tier.value === 'business' ? 'border-primary' : ''}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{tier.label}</CardTitle>
                            <CardDescription className="text-2xl font-bold">{tier.price}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{tier.limits}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Create New Key */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Create New API Key
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <Label htmlFor="keyName">Key Name</Label>
                            <Input
                                id="keyName"
                                placeholder="My App Key"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                            />
                        </div>
                        <div className="w-full md:w-48">
                            <Label>Environment</Label>
                            <Select value={newKeyEnv} onValueChange={setNewKeyEnv}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="test">Test (Sandbox)</SelectItem>
                                    <SelectItem value="live">Live (Production)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end">
                            <Button onClick={createKey} disabled={creating}>
                                {creating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                                Create Key
                            </Button>
                        </div>
                    </div>

                    {/* Show new key */}
                    {showNewKey && (
                        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-medium text-amber-800 dark:text-amber-200">
                                        Copy your API key now!
                                    </p>
                                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                                        This key will not be shown again.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 p-2 bg-white dark:bg-gray-900 rounded text-sm font-mono">
                                            {showNewKey}
                                        </code>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => copyToClipboard(showNewKey)}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Existing Keys */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Key className="w-5 h-5" />
                        Your API Keys
                    </CardTitle>
                    <CardDescription>
                        {keys.length} key{keys.length !== 1 ? 's' : ''} created
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {keys.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                            No API keys yet. Create one above to get started.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {keys.map((key) => (
                                <div
                                    key={key.id}
                                    className="flex items-center justify-between p-4 border rounded-lg"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-2 h-2 rounded-full ${key.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                                        <div>
                                            <div className="font-medium">{key.name}</div>
                                            <div className="text-sm text-muted-foreground font-mono">
                                                {key.key_prefix}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-2 py-1 text-xs rounded ${key.environment === 'live'
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                                            }`}>
                                            {key.environment}
                                        </span>
                                        <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded">
                                            {key.tier}
                                        </span>
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

            {/* Quick Start */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Start</CardTitle>
                    <CardDescription>Make your first API call</CardDescription>
                </CardHeader>
                <CardContent>
                    <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
                        {`curl -X POST https://your-project.supabase.co/functions/v1/api-gateway/api/v1/tax/pit \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: pk_test_your_key_here" \\
  -d '{"income": 12000000}'`}
                    </pre>
                </CardContent>
            </Card>
        </div>
    );
}
