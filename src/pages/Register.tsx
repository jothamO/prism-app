import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ProgressBar from '@/components/registration/ProgressBar';
import PersonalInfoStep from '@/components/registration/PersonalInfoStep';
import WorkIncomeStep from '@/components/registration/WorkIncomeStep';
import BankSetupStep from '@/components/registration/BankSetupStep';
import RegistrationSuccess from '@/components/registration/RegistrationSuccess';

export interface RegistrationData {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  workStatus: string;
  incomeType: string;
  bankSetup: string;
  consent: boolean;
  platform: 'telegram' | 'whatsapp';
}

const STEPS = ['Personal Info', 'Work & Income', 'Bank Setup'];

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [telegramLink, setTelegramLink] = useState('');
  const [registrationComplete, setRegistrationComplete] = useState(false);
  
  const [formData, setFormData] = useState<RegistrationData>({
    fullName: '',
    email: location.state?.email || '',
    phone: '',
    password: location.state?.password || '',
    workStatus: '',
    incomeType: '',
    bankSetup: '',
    consent: false,
    platform: 'telegram'
  });

  // Redirect to auth if no email/password provided
  useEffect(() => {
    if (!location.state?.email || !location.state?.password) {
      // Allow direct access but require filling in credentials
    }
  }, [location.state, navigate]);

  const updateFormData = (updates: Partial<RegistrationData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
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
        setTelegramLink(data.telegramLink);
        setRegistrationComplete(true);
        toast({
          title: "Registration successful!",
          description: "Click the button to connect your Telegram"
        });
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
        telegramLink={telegramLink} 
        fullName={formData.fullName}
      />
    );
  }

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
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold">
                Create your account
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {STEPS.length}
              </span>
            </div>
            <ProgressBar steps={STEPS} currentStep={currentStep} />
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
              <WorkIncomeStep
                formData={formData}
                updateFormData={updateFormData}
                onNext={handleNext}
                onBack={handleBack}
              />
            )}
            {currentStep === 2 && (
              <BankSetupStep
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
