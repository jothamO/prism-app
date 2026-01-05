import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, User, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ProgressBar from '@/components/registration/ProgressBar';
import PersonalInfoStep from '@/components/registration/PersonalInfoStep';
import TellUsAboutYouStep from '@/components/registration/TellUsAboutYouStep';
import KYCBankStep from '@/components/registration/KYCBankStep';
import RegistrationSuccess from '@/components/registration/RegistrationSuccess';

export type AccountType = 'personal' | 'business' | null;

export interface RegistrationData {
  accountType: AccountType;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  // Freeform profile (AI extracts from this)
  tellUsAboutYourself: string;
  // Quick-select fallback options
  workStatus: string;
  incomeType: string;
  // KYC fields
  nin?: string;
  ninVerified?: boolean;
  ninVerifiedName?: string;
  bvn?: string;
  bvnVerified?: boolean;
  bvnVerifiedName?: string;
  // Bank intent
  bankSetup: 'connect_now' | 'upload_later' | '';
  consent: boolean;
  platform: 'telegram' | 'whatsapp';
}

const PERSONAL_STEPS = ['Personal Info', 'Tell Us About You', 'KYC & Bank'];

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [accountType, setAccountType] = useState<AccountType>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const [formData, setFormData] = useState<RegistrationData>({
    accountType: null,
    fullName: '',
    email: location.state?.email || '',
    phone: '',
    password: location.state?.password || '',
    tellUsAboutYourself: '',
    workStatus: '',
    incomeType: '',
    nin: '',
    ninVerified: false,
    ninVerifiedName: '',
    bvn: '',
    bvnVerified: false,
    bvnVerifiedName: '',
    bankSetup: '',
    consent: false,
    platform: 'telegram'
  });

  const updateFormData = (updates: Partial<RegistrationData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleAccountTypeSelect = (type: AccountType) => {
    setAccountType(type);
    updateFormData({ accountType: type });

    if (type === 'business') {
      // Navigate to business signup page
      navigate('/register/business');
    }
  };

  const handleNext = () => {
    if (currentStep < PERSONAL_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else {
      // Go back to account type selection
      setAccountType(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.consent) {
      toast({
        title: "Consent required",
        description: "Please agree to the terms to continue",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('register-user', {
        body: formData
      });

      if (error) throw error;

      if (data.success) {
        // Auto-login the user
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password
        });

        if (signInError) {
          console.warn('Auto-login failed:', signInError);
        }

        setRegistrationComplete(true);
        toast({
          title: "Registration successful!",
          description: "Welcome to PRISM! Let's connect your Telegram."
        });

        // Navigate to dashboard after short delay
        setTimeout(() => {
          navigate('/dashboard', { state: { showTelegramPrompt: true } });
        }, 2000);
      } else {
        throw new Error(data.error || 'Registration failed');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      toast({
        title: "Registration failed",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (registrationComplete) {
    return (
      <RegistrationSuccess
        fullName={formData.fullName}
        redirecting={true}
      />
    );
  }

  // Account Type Selection Screen
  if (!accountType) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <Link
            to="/auth"
            className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </Link>

          <Card className="border-border">
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-2xl font-bold">
                Welcome to PRISM 🇳🇬
              </CardTitle>
              <CardDescription className="text-base">
                Your personal tax assistant. How would you like to register?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Personal Account Option */}
              <button
                onClick={() => handleAccountTypeSelect('personal')}
                className="w-full p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <User className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">Personal Account</h3>
                    <p className="text-sm text-muted-foreground">
                      For individuals, freelancers, and sole proprietors
                    </p>
                    <ul className="mt-3 text-xs text-muted-foreground space-y-1">
                      <li>• Track personal and freelance income</li>
                      <li>• Calculate PIT and claim deductions</li>
                      <li>• Informal business support</li>
                    </ul>
                  </div>
                </div>
              </button>

              {/* Business Account Option */}
              <button
                onClick={() => handleAccountTypeSelect('business')}
                className="w-full p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">Business Account</h3>
                    <p className="text-sm text-muted-foreground">
                      For registered companies (CAC)
                    </p>
                    <ul className="mt-3 text-xs text-muted-foreground space-y-1">
                      <li>• VAT tracking and filing</li>
                      <li>• Payroll tax management</li>
                      <li>• Project fund accounting</li>
                      <li>• Multi-user access (coming soon)</li>
                    </ul>
                  </div>
                </div>
              </button>

              <p className="text-center text-xs text-muted-foreground pt-4">
                Already have an account?{' '}
                <Link to="/auth" className="text-primary hover:underline">
                  Log in
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Personal Registration Flow
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <button
          onClick={handleBack}
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {currentStep === 0 ? 'Back to account type' : 'Back'}
        </button>

        <Card className="border-border">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold">
                Create your account
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {PERSONAL_STEPS.length}
              </span>
            </div>
            <ProgressBar steps={PERSONAL_STEPS} currentStep={currentStep} />
          </CardHeader>
          <CardContent>
            {currentStep === 0 && (
              <PersonalInfoStep
                formData={formData}
                updateFormData={updateFormData}
                onNext={handleNext}
              />
            )}
            {currentStep === 1 && (
              <TellUsAboutYouStep
                formData={formData}
                updateFormData={updateFormData}
                onNext={handleNext}
                onBack={handleBack}
              />
            )}
            {currentStep === 2 && (
              <KYCBankStep
                formData={formData}
                updateFormData={updateFormData}
                onBack={handleBack}
                onSubmit={handleSubmit}
                loading={loading}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
