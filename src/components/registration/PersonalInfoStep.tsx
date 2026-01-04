import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Mail, Phone, Lock, Eye, EyeOff } from 'lucide-react';
import type { RegistrationData } from '@/pages/Register';

interface PersonalInfoStepProps {
  formData: RegistrationData;
  updateFormData: (updates: Partial<RegistrationData>) => void;
  onNext: () => void;
}

export default function PersonalInfoStep({ 
  formData, 
  updateFormData, 
  onNext 
}: PersonalInfoStepProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validatePhone = (phone: string) => {
    // Nigerian phone format: 0XXXXXXXXXX or +234XXXXXXXXXX
    const cleaned = phone.replace(/\s/g, '');
    return /^(\+234|0)[789]\d{9}$/.test(cleaned);
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.fullName || formData.fullName.length < 2) {
      newErrors.fullName = 'Please enter your full name';
    }

    if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!validatePhone(formData.phone)) {
      newErrors.phone = 'Please enter a valid Nigerian phone number';
    }

    if (!formData.password || formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onNext();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Full Name</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="John Doe"
            value={formData.fullName}
            onChange={(e) => updateFormData({ fullName: e.target.value })}
            className={`pl-10 ${errors.fullName ? 'border-destructive' : ''}`}
          />
        </div>
        {errors.fullName && (
          <p className="text-xs text-destructive">{errors.fullName}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={(e) => updateFormData({ email: e.target.value })}
            className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
          />
        </div>
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Phone Number</label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="tel"
            placeholder="08012345678"
            value={formData.phone}
            onChange={(e) => updateFormData({ phone: e.target.value })}
            className={`pl-10 ${errors.phone ? 'border-destructive' : ''}`}
          />
        </div>
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Format: 0801234567 or +234801234567
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) => updateFormData({ password: e.target.value })}
            className={`pl-10 pr-10 ${errors.password ? 'border-destructive' : ''}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Must be at least 8 characters
        </p>
      </div>

      <Button type="submit" className="w-full">
        Continue
      </Button>
    </form>
  );
}
