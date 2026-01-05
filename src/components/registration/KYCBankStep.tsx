import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { RegistrationData } from '@/pages/Register';

interface KYCBankStepProps {
    formData: RegistrationData;
    updateFormData: (updates: Partial<RegistrationData>) => void;
    onBack: () => void;
    onSubmit: () => void;
    loading: boolean;
}

type VerificationStatus = 'idle' | 'verifying' | 'verified' | 'mismatch' | 'invalid' | 'error';

interface VerificationState {
    status: VerificationStatus;
    verifiedName?: string;
    similarity?: number;
    message?: string;
}

export default function KYCBankStep({
    formData,
    updateFormData,
    onBack,
    onSubmit,
    loading
}: KYCBankStepProps) {
    const [ninState, setNinState] = useState<VerificationState>({ status: 'idle' });
    const [bvnState, setBvnState] = useState<VerificationState>({ status: 'idle' });
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Debounced NIN verification
    const verifyNIN = useCallback(async (nin: string) => {
        if (nin.length !== 11) {
            setNinState({ status: 'idle' });
            return;
        }

        setNinState({ status: 'verifying' });

        try {
            const { data, error } = await supabase.functions.invoke('verify-identity', {
                body: {
                    type: 'nin',
                    identifier: nin,
                    nameToMatch: formData.fullName
                }
            });

            if (error) throw error;

            if (data.valid) {
                if (data.nameMatch) {
                    setNinState({
                        status: 'verified',
                        verifiedName: data.verifiedName,
                        similarity: data.similarity
                    });
                    updateFormData({
                        ninVerified: true,
                        ninVerifiedName: data.verifiedName
                    });
                } else {
                    setNinState({
                        status: 'mismatch',
                        verifiedName: data.verifiedName,
                        similarity: data.similarity,
                        message: `Name on NIN: ${data.verifiedName}`
                    });
                }
            } else {
                setNinState({
                    status: 'invalid',
                    message: data.error || 'Invalid NIN'
                });
            }
        } catch (error) {
            console.error('NIN verification error:', error);
            setNinState({
                status: 'error',
                message: 'Could not verify now. You can continue and verify later.'
            });
        }
    }, [formData.fullName, updateFormData]);

    // Debounced BVN verification
    const verifyBVN = useCallback(async (bvn: string) => {
        if (bvn.length !== 11) {
            setBvnState({ status: 'idle' });
            return;
        }

        setBvnState({ status: 'verifying' });

        try {
            const { data, error } = await supabase.functions.invoke('verify-identity', {
                body: {
                    type: 'bvn',
                    identifier: bvn,
                    nameToMatch: formData.fullName
                }
            });

            if (error) throw error;

            if (data.valid) {
                if (data.nameMatch) {
                    setBvnState({
                        status: 'verified',
                        verifiedName: data.verifiedName,
                        similarity: data.similarity
                    });
                    updateFormData({
                        bvnVerified: true,
                        bvnVerifiedName: data.verifiedName
                    });
                } else {
                    setBvnState({
                        status: 'mismatch',
                        verifiedName: data.verifiedName,
                        similarity: data.similarity,
                        message: `Name on BVN: ${data.verifiedName}`
                    });
                }
            } else {
                setBvnState({
                    status: 'invalid',
                    message: data.error || 'Invalid BVN'
                });
            }
        } catch (error) {
            console.error('BVN verification error:', error);
            setBvnState({
                status: 'error',
                message: 'Could not verify now. You can continue and verify later.'
            });
        }
    }, [formData.fullName, updateFormData]);

    const handleNINChange = (value: string) => {
        // Only allow digits
        const cleaned = value.replace(/\D/g, '').slice(0, 11);
        updateFormData({ nin: cleaned, ninVerified: false });

        // Auto-verify when 11 digits entered
        if (cleaned.length === 11) {
            verifyNIN(cleaned);
        } else {
            setNinState({ status: 'idle' });
        }
    };

    const handleBVNChange = (value: string) => {
        const cleaned = value.replace(/\D/g, '').slice(0, 11);
        updateFormData({ bvn: cleaned, bvnVerified: false });

        if (cleaned.length === 11) {
            verifyBVN(cleaned);
        } else {
            setBvnState({ status: 'idle' });
        }
    };

    const useVerifiedName = (type: 'nin' | 'bvn') => {
        const name = type === 'nin' ? ninState.verifiedName : bvnState.verifiedName;
        if (name) {
            updateFormData({ fullName: name });
            // Re-verify with new name
            if (type === 'nin' && formData.nin) verifyNIN(formData.nin);
            if (type === 'bvn' && formData.bvn) verifyBVN(formData.bvn);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};

        if (!formData.bankSetup) {
            newErrors.bankSetup = 'Please select a bank setup option';
        }

        if (!formData.consent) {
            newErrors.consent = 'You must agree to continue';
        }

        setErrors(newErrors);

        if (Object.keys(newErrors).length === 0) {
            onSubmit();
        }
    };

    const renderVerificationStatus = (state: VerificationState, type: 'nin' | 'bvn') => {
        switch (state.status) {
            case 'verifying':
                return (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-xs">Verifying...</span>
                    </div>
                );
            case 'verified':
                return (
                    <div className="flex items-center gap-2 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs">
                            Verified: {state.verifiedName} ({Math.round((state.similarity || 0) * 100)}% match)
                        </span>
                    </div>
                );
            case 'mismatch':
                return (
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-amber-600">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-xs">{state.message}</span>
                        </div>
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => useVerifiedName(type)}
                        >
                            Use name from {type.toUpperCase()}
                        </Button>
                    </div>
                );
            case 'invalid':
                return (
                    <div className="flex items-center gap-2 text-destructive">
                        <XCircle className="h-4 w-4" />
                        <span className="text-xs">{state.message}</span>
                    </div>
                );
            case 'error':
                return (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-xs">{state.message}</span>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* KYC Section */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-medium mb-1">Identity Verification (Optional)</h3>
                    <p className="text-xs text-muted-foreground">
                        Helps with KYC compliance when you connect your bank
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="nin">NIN (National Identification Number)</Label>
                    <Input
                        id="nin"
                        placeholder="12345678901"
                        value={formData.nin || ''}
                        onChange={(e) => handleNINChange(e.target.value)}
                        maxLength={11}
                    />
                    {renderVerificationStatus(ninState, 'nin')}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="bvn">BVN (Bank Verification Number)</Label>
                    <Input
                        id="bvn"
                        placeholder="12345678901"
                        value={formData.bvn || ''}
                        onChange={(e) => handleBVNChange(e.target.value)}
                        maxLength={11}
                    />
                    {renderVerificationStatus(bvnState, 'bvn')}
                </div>
            </div>

            {/* Bank Setup Section */}
            <div className="space-y-3">
                <Label className="text-sm font-medium">Bank Account Setup</Label>
                <RadioGroup
                    value={formData.bankSetup}
                    onValueChange={(value) => updateFormData({ bankSetup: value as RegistrationData['bankSetup'] })}
                    className="space-y-2"
                >
                    <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="connect_now" id="connect_now" className="mt-0.5" />
                        <Label htmlFor="connect_now" className="flex-1 cursor-pointer">
                            <span className="font-medium">Connect now</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Auto-track all your transactions with Mono
                            </p>
                        </Label>
                    </div>
                    <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="upload_later" id="upload_later" className="mt-0.5" />
                        <Label htmlFor="upload_later" className="flex-1 cursor-pointer">
                            <span className="font-medium">Upload later</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                I'll upload bank statements manually
                            </p>
                        </Label>
                    </div>
                </RadioGroup>
                {errors.bankSetup && (
                    <p className="text-xs text-destructive">{errors.bankSetup}</p>
                )}
            </div>

            {/* Consent */}
            <div className="space-y-2">
                <div className="flex items-start space-x-3">
                    <Checkbox
                        id="consent"
                        checked={formData.consent}
                        onCheckedChange={(checked) => updateFormData({ consent: checked as boolean })}
                    />
                    <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                        I agree to the{' '}
                        <a href="/terms" className="text-primary hover:underline" target="_blank">
                            Terms of Service
                        </a>
                        {' '}and{' '}
                        <a href="/privacy" className="text-primary hover:underline" target="_blank">
                            Privacy Policy
                        </a>
                    </Label>
                </div>
                {errors.consent && (
                    <p className="text-xs text-destructive">{errors.consent}</p>
                )}
            </div>

            <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onBack} className="flex-1">
                    Back
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating account...
                        </>
                    ) : (
                        'Create Account'
                    )}
                </Button>
            </div>
        </form>
    );
}
