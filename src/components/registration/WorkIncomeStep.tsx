import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Briefcase, Wallet, Building2, GraduationCap, Clock } from 'lucide-react';
import type { RegistrationData } from '@/pages/Register';

interface WorkIncomeStepProps {
  formData: RegistrationData;
  updateFormData: (updates: Partial<RegistrationData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const WORK_STATUS_OPTIONS = [
  { value: 'business', label: 'Business Owner', icon: Building2, description: 'I run my own business or company' },
  { value: 'employed', label: 'Employed', icon: Briefcase, description: 'I work for an employer (PAYE)' },
  { value: 'freelancer', label: 'Freelancer', icon: Wallet, description: 'I do contract or freelance work' },
  { value: 'student', label: 'Student', icon: GraduationCap, description: 'I\'m currently studying' },
  { value: 'retired', label: 'Retired', icon: Clock, description: 'I\'m retired from work' },
];

const INCOME_TYPE_OPTIONS = [
  { value: 'salary', label: 'Salary Only', description: 'Regular employment income' },
  { value: 'business', label: 'Business Income', description: 'From business operations' },
  { value: 'rental', label: 'Rental Income', description: 'From property rentals' },
  { value: 'investment', label: 'Investment Income', description: 'Dividends, interest, etc.' },
  { value: 'consulting', label: 'Consulting Fees', description: 'Professional services' },
  { value: 'multiple', label: 'Multiple Sources', description: 'Mix of income types' },
];

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

    if (!formData.workStatus) {
      newErrors.workStatus = 'Please select your work status';
    }

    if (!formData.incomeType) {
      newErrors.incomeType = 'Please select your income type';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onNext();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          What best describes your work situation?
        </label>
        <div className="grid gap-2">
          {WORK_STATUS_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = formData.workStatus === option.value;
            
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updateFormData({ workStatus: option.value })}
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
        {errors.workStatus && (
          <p className="text-xs text-destructive">{errors.workStatus}</p>
        )}
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          What's your main income source?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {INCOME_TYPE_OPTIONS.map((option) => {
            const isSelected = formData.incomeType === option.value;
            
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updateFormData({ incomeType: option.value })}
                className={`flex flex-col p-3 rounded-lg border text-left transition-colors ${
                  isSelected 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <div className={`font-medium text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {option.label}
                </div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </button>
            );
          })}
        </div>
        {errors.incomeType && (
          <p className="text-xs text-destructive">{errors.incomeType}</p>
        )}
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
