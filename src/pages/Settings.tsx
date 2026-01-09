import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Settings as SettingsIcon,
    Bell,
    Mail,
    MessageSquare,
    User,
    Shield,
    Save,
    Loader2,
    CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationSettings {
    // Email notifications
    emailDailySummary: boolean;
    emailLargeTransactions: boolean;
    emailTaxReminders: boolean;
    emailWeeklyReports: boolean;
    emailMonthlyReports: boolean;

    // Telegram notifications
    telegramAllTransactions: boolean;
    telegramTaxRelevant: boolean;
    telegramEmtlCharges: boolean;
    telegramInsights: boolean;
    telegramConnectionIssues: boolean;

    // Thresholds
    largeTransactionThreshold: number;
}

const DEFAULT_SETTINGS: NotificationSettings = {
    emailDailySummary: true,
    emailLargeTransactions: true,
    emailTaxReminders: true,
    emailWeeklyReports: false,
    emailMonthlyReports: true,
    telegramAllTransactions: false,
    telegramTaxRelevant: true,
    telegramEmtlCharges: true,
    telegramInsights: true,
    telegramConnectionIssues: true,
    largeTransactionThreshold: 50000,
};

export default function Settings() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
    const [profile, setProfile] = useState<{ fullName: string; email: string; telegramConnected: boolean } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            const { data: userData } = await supabase
                .from('users')
                .select('full_name, email, telegram_id, notification_preferences')
                .eq('auth_user_id', user.id)
                .single();

            if (userData) {
                setProfile({
                    fullName: userData.full_name || '',
                    email: userData.email || user.email || '',
                    telegramConnected: !!userData.telegram_id,
                });

                // Load saved preferences
                if (userData.notification_preferences) {
                    const prefs = userData.notification_preferences as Record<string, unknown>;
                    setSettings({
                        ...DEFAULT_SETTINGS,
                        ...prefs as NotificationSettings,
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateSetting = (key: keyof NotificationSettings, value: boolean | number) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('users')
                .update({
                    notification_preferences: settings,
                })
                .eq('auth_user_id', user.id);

            if (error) throw error;

            toast({
                title: 'Settings Saved',
                description: 'Your notification preferences have been updated',
            });
        } catch (error) {
            console.error('Error saving settings:', error);
            toast({
                title: 'Error',
                description: 'Failed to save settings',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <SettingsIcon className="h-8 w-8 text-indigo-600" />
                            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
                        </div>
                        <Button variant="outline" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                {/* Profile Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Profile
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-gray-500 text-sm">Full Name</Label>
                            <p className="font-medium">{profile?.fullName || 'Not set'}</p>
                        </div>
                        <div>
                            <Label className="text-gray-500 text-sm">Email</Label>
                            <p className="font-medium">{profile?.email || 'Not set'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Label className="text-gray-500 text-sm">Telegram</Label>
                            {profile?.telegramConnected ? (
                                <div className="flex items-center gap-1 text-green-600">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="text-sm font-medium">Connected</span>
                                </div>
                            ) : (
                                <span className="text-sm text-gray-500">Not connected</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Email Notifications */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Mail className="h-5 w-5" />
                            Email Notifications
                        </CardTitle>
                        <CardDescription>
                            Choose what notifications you receive via email
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">Daily Transaction Summary</Label>
                                <p className="text-sm text-gray-500">Receive a summary at 9:00 AM daily</p>
                            </div>
                            <Switch
                                checked={settings.emailDailySummary}
                                onCheckedChange={(v) => updateSetting('emailDailySummary', v)}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">Large Transactions</Label>
                                <p className="text-sm text-gray-500">
                                    Alerts for transactions over {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(settings.largeTransactionThreshold)}
                                </p>
                            </div>
                            <Switch
                                checked={settings.emailLargeTransactions}
                                onCheckedChange={(v) => updateSetting('emailLargeTransactions', v)}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">Tax Filing Reminders</Label>
                                <p className="text-sm text-gray-500">Deadline reminders 30, 15, 7, 1 days before</p>
                            </div>
                            <Switch
                                checked={settings.emailTaxReminders}
                                onCheckedChange={(v) => updateSetting('emailTaxReminders', v)}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">Weekly Reports</Label>
                                <p className="text-sm text-gray-500">Summary every Sunday evening</p>
                            </div>
                            <Switch
                                checked={settings.emailWeeklyReports}
                                onCheckedChange={(v) => updateSetting('emailWeeklyReports', v)}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">Monthly Reports</Label>
                                <p className="text-sm text-gray-500">Full month summary on the 1st</p>
                            </div>
                            <Switch
                                checked={settings.emailMonthlyReports}
                                onCheckedChange={(v) => updateSetting('emailMonthlyReports', v)}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Telegram Notifications */}
                <Card className={!profile?.telegramConnected ? 'opacity-60' : ''}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5" />
                            Telegram Notifications
                        </CardTitle>
                        <CardDescription>
                            {profile?.telegramConnected
                                ? 'Choose what notifications you receive via Telegram'
                                : 'Connect Telegram to enable these notifications'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">All Transactions</Label>
                                <p className="text-sm text-gray-500">Instant alerts for every transaction</p>
                            </div>
                            <Switch
                                checked={settings.telegramAllTransactions}
                                onCheckedChange={(v) => updateSetting('telegramAllTransactions', v)}
                                disabled={!profile?.telegramConnected}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">Tax-Relevant Only</Label>
                                <p className="text-sm text-gray-500">Only transactions with tax implications</p>
                            </div>
                            <Switch
                                checked={settings.telegramTaxRelevant}
                                onCheckedChange={(v) => updateSetting('telegramTaxRelevant', v)}
                                disabled={!profile?.telegramConnected}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">EMTL Charges</Label>
                                <p className="text-sm text-gray-500">Notify when EMTL (₦50) is deducted</p>
                            </div>
                            <Switch
                                checked={settings.telegramEmtlCharges}
                                onCheckedChange={(v) => updateSetting('telegramEmtlCharges', v)}
                                disabled={!profile?.telegramConnected}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">Tax Insights</Label>
                                <p className="text-sm text-gray-500">AI-powered tax optimization tips</p>
                            </div>
                            <Switch
                                checked={settings.telegramInsights}
                                onCheckedChange={(v) => updateSetting('telegramInsights', v)}
                                disabled={!profile?.telegramConnected}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-medium">Connection Issues</Label>
                                <p className="text-sm text-gray-500">Alert if bank sync fails</p>
                            </div>
                            <Switch
                                checked={settings.telegramConnectionIssues}
                                onCheckedChange={(v) => updateSetting('telegramConnectionIssues', v)}
                                disabled={!profile?.telegramConnected}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Thresholds */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            Alert Thresholds
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Label>Large Transaction Threshold</Label>
                            <div className="flex items-center gap-3">
                                <span className="text-gray-500">₦</span>
                                <Input
                                    type="number"
                                    value={settings.largeTransactionThreshold}
                                    onChange={(e) => updateSetting('largeTransactionThreshold', parseInt(e.target.value) || 50000)}
                                    className="w-40"
                                />
                            </div>
                            <p className="text-sm text-gray-500">
                                Get alerts for transactions above this amount
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end">
                    <Button onClick={saveSettings} disabled={saving} size="lg">
                        {saving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Settings
                    </Button>
                </div>
            </main>
        </div>
    );
}
