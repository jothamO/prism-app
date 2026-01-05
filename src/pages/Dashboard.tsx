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
  AlertCircle,
  ChevronRight,
  User,
  Briefcase,
  ShieldCheck,
  LogOut
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import TelegramConnectModal from '@/components/TelegramConnectModal';
import BankConnectModal from '@/components/BankConnectModal';
import VerifyIdentityModal from '@/components/VerifyIdentityModal';

export default function Dashboard() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const { profile, business, loading, refetch } = useUserProfile();
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
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {profile?.telegramConnected ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm">Telegram</span>
              </div>
              <div className="flex items-center gap-2">
                {profile?.bankConnected ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm">Bank</span>
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
    </div>
  );
}