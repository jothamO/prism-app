import { useState, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Activity,
  DollarSign,
  Calendar,
  Send,
  Building2,
  CreditCard,
  CheckCircle2,
  XCircle,
  ChevronRight,
  User,
  Briefcase,
  ShieldCheck,
  LogOut,
  RefreshCw,
  Lightbulb,
  Plus,
  Receipt,
  BarChart3,
  BookOpen,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useConnectedAccounts } from '@/hooks/useConnectedAccounts';
import { useUserInsights } from '@/hooks/useUserInsights';
import { useToast } from '@/hooks/use-toast';
import TelegramConnectModal from '@/components/TelegramConnectModal';
import BankConnectModal from '@/components/BankConnectModal';
import VerifyIdentityModal from '@/components/VerifyIdentityModal';
import ChatWidget from '@/components/ChatWidget';

export default function Dashboard() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const { profile, business, loading, refetch } = useUserProfile();
  const { accounts, loading: accountsLoading, syncAccount, syncing, refetch: refetchAccounts } = useConnectedAccounts();
  const { highPriorityCount, totalPotentialSavings } = useUserInsights();
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // Handle bank connected callback
  useEffect(() => {
    const bankConnected = searchParams.get('bankConnected');
    if (bankConnected === 'true') {
      toast({
        title: 'Bank Connected!',
        description: 'Your bank account has been linked successfully. Transactions will sync automatically.',
      });
      refetch();
      // Clear the query param
      navigate('/dashboard', { replace: true });
    } else if (bankConnected === 'false') {
      toast({
        title: 'Connection Cancelled',
        description: 'Bank connection was cancelled. You can try again anytime.',
        variant: 'destructive',
      });
      navigate('/dashboard', { replace: true });
    }
  }, [searchParams, navigate, toast, refetch]);

  // Show Telegram modal if redirected from registration
  useEffect(() => {
    if (location.state?.showTelegramPrompt && profile && !profile.telegramConnected) {
      setShowTelegramModal(true);
    }
  }, [location.state, profile]);

  const handleTelegramConnected = () => {
    setShowTelegramModal(false);
    refetch();
  };

  const handleBankConnected = () => {
    setShowBankModal(false);
    refetch();
    refetchAccounts();
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never synced';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const maskAccountNumber = (num: string | null) => {
    if (!num || num.length < 4) return '****';
    return '****' + num.slice(-4);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleIdentityVerified = () => {
    setShowVerifyModal(false);
    refetch();
  };

  // Calculate onboarding progress
  const onboardingSteps = [
    { key: 'profile', label: 'Profile created', completed: !!profile },
    { key: 'telegram', label: 'Telegram connected', completed: profile?.telegramConnected || false },
    { key: 'bank', label: 'Bank connected', completed: profile?.bankConnected || false },
    { key: 'kyc', label: 'KYC verified', completed: (profile?.kycLevel || 0) >= 1 },
  ];
  const completedSteps = onboardingSteps.filter(s => s.completed).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {profile?.accountType === 'business' && business
              ? `🏢 ${business.name}`
              : `Welcome back, ${profile?.fullName?.split(' ')[0] || 'there'}!`
            }
          </h1>
          <p className="text-muted-foreground mt-1">
            {profile?.occupation || profile?.taxCategory?.replace('_', ' ') || 'Your tax dashboard'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>

      {/* Onboarding Progress (if not complete) */}
      {completedSteps < onboardingSteps.length && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Complete your setup</CardTitle>
              <Badge variant="secondary">{completedSteps}/{onboardingSteps.length}</Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {/* Telegram */}
            {!profile?.telegramConnected && (
              <button
                onClick={() => setShowTelegramModal(true)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
              >
                <div className="p-2 rounded-lg bg-[#0088cc]/10">
                  <Send className="h-5 w-5 text-[#0088cc]" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Connect Telegram</p>
                  <p className="text-xs text-muted-foreground">Get alerts on phone</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}

            {/* Bank */}
            {!profile?.bankConnected && (
              <button
                onClick={() => setShowBankModal(true)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
              >
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Connect Bank</p>
                  <p className="text-xs text-muted-foreground">Auto-track transactions</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}

            {/* KYC */}
            {(profile?.kycLevel || 0) < 1 && (
              <button
                onClick={() => setShowVerifyModal(true)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
              >
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <ShieldCheck className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Verify Identity</p>
                  <p className="text-xs text-muted-foreground">Add NIN or BVN</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Profile Summary Card */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Profile */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
            {profile?.accountType === 'business' ? (
              <Building2 className="h-4 w-4 text-muted-foreground" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold capitalize">
              {profile?.taxCategory?.replace('_', ' ') || 'Personal'}
            </div>
            <p className="text-xs text-muted-foreground">
              {profile?.accountType === 'business' ? 'Business account' : 'Personal account'}
            </p>
          </CardContent>
        </Card>

        {/* KYC Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">KYC Level</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">Level {profile?.kycLevel || 0}</div>
            <div className="flex gap-1 mt-1">
              {profile?.ninVerified && (
                <Badge variant="outline" className="text-xs">NIN ✓</Badge>
              )}
              {profile?.bvnVerified && (
                <Badge variant="outline" className="text-xs">BVN ✓</Badge>
              )}
              {!profile?.ninVerified && !profile?.bvnVerified && (
                <span className="text-xs text-muted-foreground">Not verified</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Connections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connections</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {profile?.telegramConnected ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm">Telegram</span>
                </div>
                <Badge 
                  variant={profile?.telegramConnected ? "default" : "outline"} 
                  className={profile?.telegramConnected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}
                >
                  {profile?.telegramConnected ? "Connected" : "Not linked"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {profile?.bankConnected ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm">Bank</span>
                </div>
                <Badge 
                  variant={profile?.bankConnected ? "default" : "outline"}
                  className={profile?.bankConnected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}
                >
                  {profile?.bankConnected ? "Connected" : "Not linked"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Filing (placeholder) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Filing</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">Jan 21</div>
            <p className="text-xs text-muted-foreground">VAT Return (Q4 2025)</p>
          </CardContent>
        </Card>
      </div>

      {/* Business-specific section */}
      {profile?.accountType === 'business' && business && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Business Verification</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3">
              {business.cacVerified ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
              <div>
                <p className="font-medium text-sm">CAC Registration</p>
                <p className="text-xs text-muted-foreground">{business.cacNumber || 'Not provided'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {business.tinVerified ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">TIN</p>
                <p className="text-xs text-muted-foreground">{business.tin || 'Not provided'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {business.vatRegistered ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">VAT Registered</p>
                <p className="text-xs text-muted-foreground">
                  {business.vatRegistered ? 'Yes' : 'No'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connected Banks Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Connected Banks</CardTitle>
            <CardDescription>Your linked bank accounts</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowBankModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </CardHeader>
        <CardContent>
          {accountsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-4">No bank accounts connected</p>
              <Button onClick={() => setShowBankModal(true)}>Connect Your Bank</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <Building2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {account.bankName || 'Bank Account'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {account.accountName} • {maskAccountNumber(account.accountNumber)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <Badge
                        variant={account.status === 'active' ? 'default' : 'secondary'}
                        className={account.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}
                      >
                        {account.status || 'Unknown'}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(account.lastSyncedAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => syncAccount(account.id)}
                      disabled={syncing === account.id}
                    >
                      <RefreshCw className={`h-4 w-4 ${syncing === account.id ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insights Preview Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Financial Insights</CardTitle>
              <CardDescription>
                {highPriorityCount > 0
                  ? `${highPriorityCount} high priority insight${highPriorityCount > 1 ? 's' : ''} need attention`
                  : 'Personalized tax optimization tips'
                }
              </CardDescription>
            </div>
          </div>
          <Button onClick={() => navigate('/insights')}>
            View Insights
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </CardHeader>
        {totalPotentialSavings > 0 && (
          <CardContent className="pt-0">
            <p className="text-sm text-emerald-600 font-medium">
              💰 Potential savings: {formatCurrency(totalPotentialSavings)}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Tax Dashboard Quick Link */}
      <Card className="border-indigo-500/20 bg-indigo-500/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Receipt className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Tax Dashboard</CardTitle>
              <CardDescription>
                View compliance score, EMTL/VAT breakdown, and monthly charts
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/tax-dashboard')}>
            Open Tax Dashboard
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </CardHeader>
      </Card>

      {/* Quick Access to Features */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/analytics')}
          className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <BarChart3 className="h-6 w-6 text-indigo-600" />
          <span className="text-sm font-medium">Analytics</span>
        </button>
        
        <button
          onClick={() => navigate('/tax-calendar')}
          className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <Calendar className="h-6 w-6 text-indigo-600" />
          <span className="text-sm font-medium">Tax Calendar</span>
        </button>
        
        <button
          onClick={() => navigate('/education')}
          className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <BookOpen className="h-6 w-6 text-indigo-600" />
          <span className="text-sm font-medium">Education</span>
        </button>
        
        <button
          onClick={() => navigate('/reports')}
          className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <FileText className="h-6 w-6 text-indigo-600" />
          <span className="text-sm font-medium">Reports</span>
        </button>
      </div>

      {/* Main content area */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>Your tax activity summary</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[200px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
              {profile?.bankConnected
                ? 'Transaction chart will appear here'
                : 'Connect your bank to see transaction data'
              }
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest transactions and events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              {profile?.bankConnected
                ? 'Recent transactions will appear here'
                : 'No activity yet'
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Telegram Connect Modal */}
      <TelegramConnectModal
        open={showTelegramModal}
        onOpenChange={setShowTelegramModal}
        onConnected={handleTelegramConnected}
      />

      {/* Bank Connect Modal */}
      <BankConnectModal
        open={showBankModal}
        onOpenChange={setShowBankModal}
        onConnected={handleBankConnected}
      />

      {/* Verify Identity Modal */}
      <VerifyIdentityModal
        open={showVerifyModal}
        onOpenChange={setShowVerifyModal}
        onVerified={handleIdentityVerified}
      />

      {/* AI Chat Widget */}
      <ChatWidget />
    </div>
  );
}