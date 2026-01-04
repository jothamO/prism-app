import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, Building, Layers, Send, MessageCircle, Loader2 } from 'lucide-react';
import type { RegistrationData } from '@/pages/Register';

interface BankSetupStepProps {
  formData: RegistrationData;
  updateFormData: (updates: Partial<RegistrationData>) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
}

const BANK_SETUP_OPTIONS = [
  { 
    value: 'mixed', 
    label: 'Mixed Account', 
    icon: CreditCard,
    description: 'Personal & business in one account' 
  },
  { 
    value: 'separate', 
    label: 'Separate Accounts', 
    icon: Building,
    description: 'Dedicated business account(s)' 
  },
  { 
    value: 'multiple', 
    label: 'Multiple Accounts', 
    icon: Layers,
    description: 'Several accounts for different purposes' 
  },
];

const PLATFORM_OPTIONS = [
  { 
    value: 'telegram' as const, 
    label: 'Telegram', 
    icon: Send,
    available: true,
    description: 'Connect via Telegram bot'
  },
  { 
    value: 'whatsapp' as const, 
    label: 'WhatsApp', 
    icon: MessageCircle,
    available: false,
    description: 'Coming soon'
  },
];

export default function BankSetupStep({ 
  formData, 
  updateFormData, 
  onBack,
  onSubmit,
  loading
}: BankSetupStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.bankSetup) {
      newErrors.bankSetup = 'Please select your account setup';
    }

    if (!formData.consent) {
      newErrors.consent = 'You must agree to continue';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          How do you manage your bank accounts?
        </label>
        <div className="grid gap-2">
          {BANK_SETUP_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = formData.bankSetup === option.value;
            
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updateFormData({ bankSetup: option.value })}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  isSelected 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <div className={`p-2 rounded-md ${isSelected ? 'bg-primary/10' : 'bg-muted'}`}>
                  <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <div className={`font-medium text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </button>
            );
          })}
        </div>
        {errors.bankSetup && (
          <p className="text-xs text-destructive">{errors.bankSetup}</p>
        )}
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Choose your notification platform
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORM_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = formData.platform === option.value;
            
            return (
              <button
                key={option.value}
                type="button"
                disabled={!option.available}
                onClick={() => option.available && updateFormData({ platform: option.value })}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border text-center transition-colors ${
                  !option.available
                    ? 'border-border bg-muted/50 opacity-50 cursor-not-allowed'
                    : isSelected 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <Icon className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <div className={`font-medium text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.consent}
            onChange={(e) => updateFormData({ consent: e.target.checked })}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-muted-foreground">
            I agree to PRISM's{' '}
            <a href="#" className="text-primary hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
            I consent to the analysis of my financial data for tax compliance purposes.
          </span>
        </label>
        {errors.consent && (
          <p className="text-xs text-destructive">{errors.consent}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={loading}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            'Complete Registration'
          )}
        </Button>
      </div>
    </form>
  );
}
