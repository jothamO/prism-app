import { useState, useEffect } from "react";
import {
    DollarSign,
    Plus,
    Edit2,
    Save,
    X,
    RefreshCw,
    Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PricingTier {
    id: string;
    name: string;
    display_name: string;
    price_monthly: number;
    requests_per_min: number;
    requests_per_day: number;
    can_access_documents: boolean;
    can_access_ocr: boolean;
    can_use_webhooks: boolean;
    is_active: boolean;
    is_featured: boolean;
    sort_order: number;
}

export default function AdminAPIPricing() {
    const { toast } = useToast();
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<PricingTier>>({});

    useEffect(() => {
        fetchTiers();
    }, []);

    async function fetchTiers() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('api_pricing_tiers')
                .select('*')
                .order('sort_order');

            if (error) throw error;
            setTiers(data || []);
        } catch (error) {
            console.error('Error fetching tiers:', error);
        } finally {
            setLoading(false);
        }
    }

    function startEdit(tier: PricingTier) {
        setEditingId(tier.id);
        setEditForm({ ...tier });
    }

    function cancelEdit() {
        setEditingId(null);
        setEditForm({});
    }

    async function saveTier() {
        if (!editingId) return;

        try {
            const { error } = await supabase
                .from('api_pricing_tiers')
                .update({
                    display_name: editForm.display_name,
                    price_monthly: editForm.price_monthly,
                    requests_per_min: editForm.requests_per_min,
                    requests_per_day: editForm.requests_per_day,
                    can_access_documents: editForm.can_access_documents,
                    can_access_ocr: editForm.can_access_ocr,
                    can_use_webhooks: editForm.can_use_webhooks,
                    is_active: editForm.is_active,
                    is_featured: editForm.is_featured,
                    updated_at: new Date().toISOString()
                })
                .eq('id', editingId);

            if (error) throw error;

            toast({ title: "Saved", description: "Pricing tier updated" });
            setEditingId(null);
            fetchTiers();
        } catch (error) {
            toast({ title: "Error", description: "Failed to save tier", variant: "destructive" });
        }
    }

    function formatPrice(kobo: number): string {
        return `₦${(kobo / 100).toLocaleString()}`;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">API Pricing</h1>
                    <p className="text-muted-foreground">Configure pricing tiers and limits</p>
                </div>
                <Button onClick={fetchTiers} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {tiers.map((tier) => (
                    <Card
                        key={tier.id}
                        className={`relative ${tier.is_featured ? 'border-primary border-2' : ''} ${!tier.is_active ? 'opacity-60' : ''}`}
                    >
                        {tier.is_featured && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                    <Star className="w-3 h-3" />
                                    Popular
                                </span>
                            </div>
                        )}
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                {editingId === tier.id ? (
                                    <Input
                                        value={editForm.display_name || ''}
                                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                                        className="font-bold text-lg"
                                    />
                                ) : (
                                    <CardTitle>{tier.display_name}</CardTitle>
                                )}
                                {editingId === tier.id ? (
                                    <div className="flex gap-1">
                                        <Button size="sm" onClick={saveTier}>
                                            <Save className="w-4 h-4" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Button size="sm" variant="ghost" onClick={() => startEdit(tier)}>
                                        <Edit2 className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                            {editingId === tier.id ? (
                                <div className="flex items-center gap-2">
                                    <span>₦</span>
                                    <Input
                                        type="number"
                                        value={(editForm.price_monthly || 0) / 100}
                                        onChange={(e) => setEditForm({ ...editForm, price_monthly: parseInt(e.target.value) * 100 })}
                                        className="w-32"
                                    />
                                    <span>/mo</span>
                                </div>
                            ) : (
                                <CardDescription className="text-2xl font-bold text-foreground">
                                    {formatPrice(tier.price_monthly)}/mo
                                </CardDescription>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Rate Limits */}
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Rate Limits</Label>
                                {editingId === tier.id ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={editForm.requests_per_min || 0}
                                                onChange={(e) => setEditForm({ ...editForm, requests_per_min: parseInt(e.target.value) })}
                                                className="w-20"
                                            />
                                            <span className="text-sm">/min</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={editForm.requests_per_day || 0}
                                                onChange={(e) => setEditForm({ ...editForm, requests_per_day: parseInt(e.target.value) })}
                                                className="w-20"
                                            />
                                            <span className="text-sm">/day</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm">
                                        <div>{tier.requests_per_min.toLocaleString()}/min</div>
                                        <div>{tier.requests_per_day.toLocaleString()}/day</div>
                                    </div>
                                )}
                            </div>

                            {/* Features */}
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Features</Label>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">Documents</span>
                                        {editingId === tier.id ? (
                                            <Switch
                                                checked={editForm.can_access_documents || false}
                                                onCheckedChange={(v) => setEditForm({ ...editForm, can_access_documents: v })}
                                            />
                                        ) : (
                                            <span className={tier.can_access_documents ? 'text-green-600' : 'text-gray-400'}>
                                                {tier.can_access_documents ? '✓' : '✗'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">OCR</span>
                                        {editingId === tier.id ? (
                                            <Switch
                                                checked={editForm.can_access_ocr || false}
                                                onCheckedChange={(v) => setEditForm({ ...editForm, can_access_ocr: v })}
                                            />
                                        ) : (
                                            <span className={tier.can_access_ocr ? 'text-green-600' : 'text-gray-400'}>
                                                {tier.can_access_ocr ? '✓' : '✗'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">Webhooks</span>
                                        {editingId === tier.id ? (
                                            <Switch
                                                checked={editForm.can_use_webhooks || false}
                                                onCheckedChange={(v) => setEditForm({ ...editForm, can_use_webhooks: v })}
                                            />
                                        ) : (
                                            <span className={tier.can_use_webhooks ? 'text-green-600' : 'text-gray-400'}>
                                                {tier.can_use_webhooks ? '✓' : '✗'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Status */}
                            {editingId === tier.id && (
                                <div className="space-y-2 pt-2 border-t">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">Active</span>
                                        <Switch
                                            checked={editForm.is_active || false}
                                            onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">Featured</span>
                                        <Switch
                                            checked={editForm.is_featured || false}
                                            onCheckedChange={(v) => setEditForm({ ...editForm, is_featured: v })}
                                        />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
