import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Loader2, Save, X, Plus, Star, Users, MessageSquare, FileText, Building2 } from 'lucide-react';

interface UserPricingTier {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number | null;
  max_chats_per_day: number | null;
  max_ocr_docs_per_month: number;
  max_bank_accounts: number;
  max_team_members: number;
  has_reminders: boolean | null;
  has_pdf_reports: boolean | null;
  has_filing_assistance: boolean | null;
  has_priority_support: boolean | null;
  has_api_access: boolean | null;
  is_active: boolean | null;
  is_featured: boolean | null;
  sort_order: number | null;
  min_revenue_band: string | null;
  target_description: string | null;
}

export default function AdminUserPricing() {
  const [tiers, setTiers] = useState<UserPricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<UserPricingTier>>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  const fetchTiers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_pricing_tiers')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      toast({ title: 'Error loading tiers', description: error.message, variant: 'destructive' });
    } else {
      setTiers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTiers();
  }, []);

  const startEdit = (tier: UserPricingTier) => {
    setEditingId(tier.id);
    setEditForm({ ...tier });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveTier = async () => {
    if (!editingId) return;
    setSaving(true);

    const { error } = await supabase
      .from('user_pricing_tiers')
      .update({
        display_name: editForm.display_name,
        price_monthly: editForm.price_monthly,
        price_yearly: editForm.price_yearly,
        max_chats_per_day: editForm.max_chats_per_day,
        max_ocr_docs_per_month: editForm.max_ocr_docs_per_month,
        max_bank_accounts: editForm.max_bank_accounts,
        max_team_members: editForm.max_team_members,
        has_reminders: editForm.has_reminders,
        has_pdf_reports: editForm.has_pdf_reports,
        has_filing_assistance: editForm.has_filing_assistance,
        has_priority_support: editForm.has_priority_support,
        has_api_access: editForm.has_api_access,
        is_active: editForm.is_active,
        is_featured: editForm.is_featured,
        min_revenue_band: editForm.min_revenue_band,
        target_description: editForm.target_description,
      })
      .eq('id', editingId);

    setSaving(false);

    if (error) {
      toast({ title: 'Error saving tier', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Tier updated successfully' });
      setEditingId(null);
      setEditForm({});
      fetchTiers();
    }
  };

  const addNewTier = async () => {
    setAdding(true);
    const maxSortOrder = Math.max(...tiers.map(t => t.sort_order || 0), 0);

    const { error } = await supabase
      .from('user_pricing_tiers')
      .insert({
        name: `tier_${Date.now()}`,
        display_name: 'New Tier',
        price_monthly: 0,
        price_yearly: 0,
        max_chats_per_day: 10,
        max_ocr_docs_per_month: 10,
        max_bank_accounts: 1,
        max_team_members: 1,
        has_reminders: false,
        has_pdf_reports: false,
        has_filing_assistance: false,
        has_priority_support: false,
        has_api_access: false,
        is_active: false,
        is_featured: false,
        sort_order: maxSortOrder + 1,
      });

    setAdding(false);

    if (error) {
      toast({ title: 'Error adding tier', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'New tier added' });
      fetchTiers();
    }
  };

  const formatPrice = (kobo: number): string => {
    return `₦${(kobo / 100).toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Subscription Pricing</h1>
          <p className="text-muted-foreground">Manage pricing tiers for user subscriptions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchTiers}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={addNewTier} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add Tier
          </Button>
        </div>
      </div>

      {/* Tiers Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tiers.map((tier) => {
          const isEditing = editingId === tier.id;
          const data = isEditing ? editForm : tier;

          return (
            <Card
              key={tier.id}
              className={`relative ${!tier.is_active ? 'opacity-60' : ''} ${tier.is_featured ? 'ring-2 ring-primary' : ''}`}
            >
              {tier.is_featured && (
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                  <Star className="h-3 w-3 mr-1" /> Popular
                </Badge>
              )}

              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  {isEditing ? (
                    <Input
                      value={data.display_name || ''}
                      onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                      className="h-8"
                    />
                  ) : (
                    <span>{tier.display_name}</span>
                  )}
                  <Badge variant="outline" className="text-xs">{tier.name}</Badge>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Pricing */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Monthly</span>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={data.price_monthly || 0}
                        onChange={(e) => setEditForm({ ...editForm, price_monthly: parseInt(e.target.value) || 0 })}
                        className="h-7 w-24 text-right"
                      />
                    ) : (
                      <span className="font-semibold">{formatPrice(tier.price_monthly)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Yearly</span>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={data.price_yearly || 0}
                        onChange={(e) => setEditForm({ ...editForm, price_yearly: parseInt(e.target.value) || 0 })}
                        className="h-7 w-24 text-right"
                      />
                    ) : (
                      <span className="font-semibold">{formatPrice(tier.price_yearly || 0)}</span>
                    )}
                  </div>
                </div>

                {/* Limits */}
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Limits</p>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Chats/Day
                    </span>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={data.max_chats_per_day ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, max_chats_per_day: e.target.value ? parseInt(e.target.value) : null })}
                        className="h-7 w-20 text-right"
                        placeholder="∞"
                      />
                    ) : (
                      <span>{tier.max_chats_per_day ?? '∞'}</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" /> OCR/Month
                    </span>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={data.max_ocr_docs_per_month || 0}
                        onChange={(e) => setEditForm({ ...editForm, max_ocr_docs_per_month: parseInt(e.target.value) || 0 })}
                        className="h-7 w-20 text-right"
                      />
                    ) : (
                      <span>{tier.max_ocr_docs_per_month}</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Bank Accounts
                    </span>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={data.max_bank_accounts || 0}
                        onChange={(e) => setEditForm({ ...editForm, max_bank_accounts: parseInt(e.target.value) || 0 })}
                        className="h-7 w-20 text-right"
                      />
                    ) : (
                      <span>{tier.max_bank_accounts}</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> Team Members
                    </span>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={data.max_team_members || 0}
                        onChange={(e) => setEditForm({ ...editForm, max_team_members: parseInt(e.target.value) || 0 })}
                        className="h-7 w-20 text-right"
                      />
                    ) : (
                      <span>{tier.max_team_members}</span>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Features</p>
                  
                  {[
                    { key: 'has_reminders', label: 'Reminders' },
                    { key: 'has_pdf_reports', label: 'PDF Reports' },
                    { key: 'has_filing_assistance', label: 'Filing Assistance' },
                    { key: 'has_priority_support', label: 'Priority Support' },
                    { key: 'has_api_access', label: 'API Access' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <Switch
                        checked={!!data[key as keyof typeof data]}
                        onCheckedChange={(checked) => isEditing && setEditForm({ ...editForm, [key]: checked })}
                        disabled={!isEditing}
                      />
                    </div>
                  ))}
                </div>

                {/* Status */}
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Status</p>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span>Active</span>
                    <Switch
                      checked={!!data.is_active}
                      onCheckedChange={(checked) => isEditing && setEditForm({ ...editForm, is_active: checked })}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span>Featured</span>
                    <Switch
                      checked={!!data.is_featured}
                      onCheckedChange={(checked) => isEditing && setEditForm({ ...editForm, is_featured: checked })}
                      disabled={!isEditing}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t flex gap-2">
                  {isEditing ? (
                    <>
                      <Button size="sm" className="flex-1" onClick={saveTier} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => startEdit(tier)}>
                      Edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
