import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Building2, MapPin } from 'lucide-react';
import type { RegistrationData } from '@/pages/Register';

interface WorkIncomeStepProps {
  formData: RegistrationData;
  updateFormData: (updates: Partial<RegistrationData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara'
];

const INCOME_SOURCE_OPTIONS = [
  { key: 'hasBusinessIncome', label: 'Business income', description: 'From business operations' },
  { key: 'hasSalaryIncome', label: 'Salary/Employment', description: 'Regular employment income' },
  { key: 'hasFreelanceIncome', label: 'Freelance/Contract', description: 'Contract or gig work' },
  { key: 'hasPensionIncome', label: 'Pension', description: 'Retirement income' },
  { key: 'hasRentalIncome', label: 'Rental income', description: 'From property rentals' },
  { key: 'hasInvestmentIncome', label: 'Investment income', description: 'Dividends, interest, etc.' },
] as const;

export default function WorkIncomeStep({ 
  formData, 
  updateFormData, 
  onNext,
  onBack 
}: WorkIncomeStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.accountType) {
      newErrors.accountType = 'Please select an account type';
    }

    // Check if at least one income source is selected
    const hasIncome = INCOME_SOURCE_OPTIONS.some(
      opt => formData[opt.key as keyof RegistrationData]
    );
    if (!hasIncome) {
      newErrors.incomeSources = 'Please select at least one income source';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onNext();
    }
  };

  const toggleIncomeSource = (key: keyof RegistrationData) => {
    updateFormData({ [key]: !formData[key] });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account Type */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Account Type
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => updateFormData({ accountType: 'personal' })}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border text-center transition-colors ${
              formData.accountType === 'personal'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <User className={`h-6 w-6 ${formData.accountType === 'personal' ? 'text-primary' : 'text-muted-foreground'}`} />
            <div>
              <div className={`font-medium text-sm ${formData.accountType === 'personal' ? 'text-primary' : 'text-foreground'}`}>
                Personal
              </div>
              <div className="text-xs text-muted-foreground">Individual taxes</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => updateFormData({ accountType: 'business' })}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border text-center transition-colors ${
              formData.accountType === 'business'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <Building2 className={`h-6 w-6 ${formData.accountType === 'business' ? 'text-primary' : 'text-muted-foreground'}`} />
            <div>
              <div className={`font-medium text-sm ${formData.accountType === 'business' ? 'text-primary' : 'text-foreground'}`}>
                Business
              </div>
              <div className="text-xs text-muted-foreground">Company/SME</div>
            </div>
          </button>
        </div>
        {errors.accountType && (
          <p className="text-xs text-destructive">{errors.accountType}</p>
        )}
      </div>

      {/* Occupation */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Occupation <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          placeholder="e.g. Software Developer, Trader, Consultant"
          value={formData.occupation}
          onChange={(e) => updateFormData({ occupation: e.target.value })}
        />
      </div>

      {/* Location */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Location <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <select
          value={formData.location}
          onChange={(e) => updateFormData({ location: e.target.value })}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Select state</option>
          {NIGERIAN_STATES.map((state) => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>
      </div>

      {/* Income Sources */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Income Sources <span className="text-muted-foreground font-normal">(select all that apply)</span>
        </label>
        <div className="grid gap-2">
          {INCOME_SOURCE_OPTIONS.map((option) => {
            const isChecked = formData[option.key as keyof RegistrationData] as boolean;
            
            return (
              <label
                key={option.key}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isChecked 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleIncomeSource(option.key as keyof RegistrationData)}
                />
                <div className="flex-1">
                  <div className={`font-medium text-sm ${isChecked ? 'text-primary' : 'text-foreground'}`}>
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </label>
            );
          })}
        </div>
        {errors.incomeSources && (
          <p className="text-xs text-destructive">{errors.incomeSources}</p>
        )}
      </div>

      {/* Informal Business Toggle */}
      <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-colors">
        <Checkbox
          checked={formData.informalBusiness}
          onCheckedChange={(checked) => updateFormData({ informalBusiness: checked === true })}
        />
        <div>
          <div className="font-medium text-sm text-foreground">
            I run an informal/unregistered business
          </div>
          <div className="text-xs text-muted-foreground">
            Not registered with CAC
          </div>
        </div>
      </label>

      {/* Tell Us About Yourself */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Tell us about yourself <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Textarea
          placeholder="Briefly describe your work and income sources. This helps us personalize your tax experience."
          value={formData.tellUsAboutYourself}
          onChange={(e) => updateFormData({ tellUsAboutYourself: e.target.value })}
          className="min-h-[80px] resize-none"
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground text-right">
          {formData.tellUsAboutYourself.length}/500
        </p>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button type="submit" className="flex-1">
          Continue
        </Button>
      </div>
    </form>
  );
}
