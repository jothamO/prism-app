import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Briefcase, Wallet, Building2, GraduationCap, Clock, User } from 'lucide-react';
import type { RegistrationData } from '@/pages/Register';

interface TellUsAboutYouStepProps {
    formData: RegistrationData;
    updateFormData: (updates: Partial<RegistrationData>) => void;
    onNext: () => void;
    onBack: () => void;
}

const QUICK_OPTIONS = [
    { value: 'business', label: 'Business Owner', icon: Building2 },
    { value: 'employed', label: 'Employed', icon: Briefcase },
    { value: 'freelancer', label: 'Freelancer', icon: Wallet },
    { value: 'student', label: 'Student', icon: GraduationCap },
    { value: 'retired', label: 'Retired', icon: Clock },
    { value: 'other', label: 'Other', icon: User },
];

export default function TellUsAboutYouStep({
    formData,
    updateFormData,
    onNext,
    onBack
}: TellUsAboutYouStepProps) {
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};

        // Must have either freeform text OR a quick selection
        if (!formData.tellUsAboutYourself.trim() && !formData.workStatus) {
            newErrors.profile = 'Please tell us about yourself or select an option below';
        }

        setErrors(newErrors);

        if (Object.keys(newErrors).length === 0) {
            onNext();
        }
    };

    const hasContent = formData.tellUsAboutYourself.trim().length > 0 || formData.workStatus;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
                <Label htmlFor="tellUs" className="text-base font-medium">
                    Tell us about yourself and your work
                </Label>
                <Textarea
                    id="tellUs"
                    placeholder="Example: I'm a fashion designer in Lagos. I run my own boutique in Lekki but don't have CAC registration yet. I also do some freelance styling work on the side..."
                    value={formData.tellUsAboutYourself}
                    onChange={(e) => updateFormData({ tellUsAboutYourself: e.target.value })}
                    className="min-h-[120px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                    💡 The more you share, the better PRISM can help with your taxes. We'll use AI to understand your situation.
                </p>
            </div>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        Or choose from common options
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {QUICK_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = formData.workStatus === option.value;

                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => updateFormData({ workStatus: option.value })}
                            className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all ${isSelected
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : 'border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground'
                                }`}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="text-xs font-medium">{option.label}</span>
                        </button>
                    );
                })}
            </div>

            {errors.profile && (
                <p className="text-sm text-destructive text-center">{errors.profile}</p>
            )}

            <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onBack} className="flex-1">
                    Back
                </Button>
                <Button
                    type="submit"
                    className="flex-1"
                    disabled={!hasContent}
                >
                    Continue
                </Button>
            </div>
        </form>
    );
}
