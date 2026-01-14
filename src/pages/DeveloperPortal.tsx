import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
    Key,
    Plus,
    Copy,
    Trash2,
    RefreshCw,
    AlertTriangle,
    Code,
    Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PricingCard, PRICING_TIERS } from "@/components/developer/PricingCard";
import { UsageStats } from "@/components/developer/UsageStats";
import { PaymentHistory } from "@/components/developer/PaymentHistory";
import { SubscriptionManager } from "@/components/developer/SubscriptionManager";
import { DeveloperAccessGate } from "@/components/developer/DeveloperAccessGate";

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

export default function DeveloperPortal() {
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const [keys, setKeys] = useState<APIKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [newKeyName, setNewKeyName] = useState("");
    const [newKeyEnv, setNewKeyEnv] = useState("test");
    const [showNewKey, setShowNewKey] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [currentTier, setCurrentTier] = useState("free");

    useEffect(() => {
        fetchKeys();
        handleSubscriptionCallback();
    }, []);

    function handleSubscriptionCallback() {
        const subscriptionStatus = searchParams.get('subscription');
        if (subscriptionStatus === 'success') {
            toast({
                title: "Subscription Activated!",
                description: "Your API subscription has been activated successfully.",
            });
            // Remove query param
            window.history.replaceState({}, '', '/developers');
        } else if (subscriptionStatus === 'cancelled') {
            toast({
                title: "Subscription Cancelled",
                description: "You cancelled the subscription process.",
                variant: "destructive",
            });
            window.history.replaceState({}, '', '/developers');
        }
    }

    async function fetchKeys() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // Get user ID from public.users table
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('email', session.user.email)
                .single();

            if (userData) {
                setUserId(userData.id);
            }

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
                    tier: currentTier
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

    async function handleSubscribe(tier: string) {
        setSubscribing(true);
        try {
            const { data, error } = await supabase.functions.invoke('paystack-initialize', {
                body: { tier }
            });

            if (error) throw error;

            if (data.authorization_url) {
                window.location.href = data.authorization_url;
            }
        } catch (error: any) {
            toast({
                title: "Subscription Error",
                description: error.message || "Failed to start subscription",
                variant: "destructive"
            });
        } finally {
            setSubscribing(false);
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
        <DeveloperAccessGate>
        <div className="container mx-auto py-8 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Code className="h-8 w-8" />
                        Developer Portal
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Manage your API keys and integrate PRISM into your applications
                    </p>
                </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="keys">API Keys</TabsTrigger>
                    <TabsTrigger value="pricing">Pricing</TabsTrigger>
                    <TabsTrigger value="billing">Billing</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                    {/* Subscription Status */}
                    <div className="grid gap-6 md:grid-cols-2">
                        {userId && (
                            <SubscriptionManager 
                                userId={userId} 
                                onTierChange={setCurrentTier}
                            />
                        )}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Zap className="h-5 w-5" />
                                    Quick Actions
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button 
                                    className="w-full justify-start" 
                                    variant="outline"
                                    onClick={() => document.querySelector('[value="keys"]')?.dispatchEvent(new Event('click'))}
                                >
                                    <Key className="h-4 w-4 mr-2" />
                                    Manage API Keys
                                </Button>
                                <Button 
                                    className="w-full justify-start" 
                                    variant="outline"
                                    onClick={() => window.open('/docs/api', '_blank')}
                                >
                                    <Code className="h-4 w-4 mr-2" />
                                    View API Documentation
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Usage Stats */}
                    {userId && <UsageStats userId={userId} tier={currentTier} />}

                    {/* Quick Start */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Quick Start</CardTitle>
                            <CardDescription>Make your first API call</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
                                {`curl -X POST https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/api-gateway/api/v1/tax/pit \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: pk_test_your_key_here" \\
  -d '{"income": 12000000}'`}
                            </pre>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* API Keys Tab */}
                <TabsContent value="keys" className="space-y-6">
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
                </TabsContent>

                {/* Pricing Tab */}
                <TabsContent value="pricing" className="space-y-6">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold">Choose Your Plan</h2>
                        <p className="text-muted-foreground mt-2">
                            Scale your integration with PRISM's powerful tax APIs
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {PRICING_TIERS.map((tier) => (
                            <PricingCard
                                key={tier.tier}
                                tier={tier}
                                currentTier={currentTier}
                                onSubscribe={handleSubscribe}
                                isLoading={subscribing}
                            />
                        ))}
                    </div>
                </TabsContent>

                {/* Billing Tab */}
                <TabsContent value="billing" className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        {userId && (
                            <>
                                <SubscriptionManager 
                                    userId={userId} 
                                    onTierChange={setCurrentTier}
                                />
                                <PaymentHistory userId={userId} />
                            </>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
        </DeveloperAccessGate>
    );
}
