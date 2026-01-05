import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Building2, Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ProgressBar from '@/components/registration/ProgressBar';

type VerificationStatus = 'idle' | 'verifying' | 'verified' | 'invalid' | 'error';

interface VerificationState {
    status: VerificationStatus;
    data?: any;
    message?: string;
}

interface BusinessFormData {
    // Business info
    businessName: string;
    cacNumber: string;
    cacVerified: boolean;
    cacData?: any;
    tin: string;
    tinVerified: boolean;
    tinData?: any;
    // Admin user
    adminName: string;
    adminRole: string;
    adminEmail: string;
    adminPhone: string;
    password: string;
    // Business context
    tellUsAboutBusiness: string;
    industry: string;
    revenueRange: string;
    handlesProjectFunds: string;
    // Compliance
    authorized: boolean;
    consent: boolean;
    bankSetup: 'connect_now' | 'upload_later' | '';
}

const STEPS = ['Business Info', 'Admin User', 'Business Context', 'Compliance'];

const INDUSTRY_OPTIONS = [
    { value: 'technology', label: 'Technology/IT' },
    { value: 'professional_services', label: 'Professional Services' },
    { value: 'trading', label: 'Trading/Commerce' },
    { value: 'manufacturing', label: 'Manufacturing' },
    { value: 'agriculture', label: 'Agriculture' },
    { value: 'other', label: 'Other' },
];

export default function BusinessSignup() {
    const navigate = useNavigate();
    const { toast } = useToast();

    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [cacState, setCacState] = useState<VerificationState>({ status: 'idle' });
    const [tinState, setTinState] = useState<VerificationState>({ status: 'idle' });

    const [formData, setFormData] = useState<BusinessFormData>({
        businessName: '',
        cacNumber: '',
        cacVerified: false,
        tin: '',
        tinVerified: false,
        adminName: '',
        adminRole: '',
        adminEmail: '',
        adminPhone: '',
        password: '',
        tellUsAboutBusiness: '',
        industry: '',
        revenueRange: '',
        handlesProjectFunds: '',
        authorized: false,
        consent: false,
        bankSetup: '',
    });

    const updateFormData = (updates: Partial<BusinessFormData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    const verifyCAC = async (cacNumber: string) => {
        if (!cacNumber || cacNumber.length < 5) {
            setCacState({ status: 'idle' });
            return;
        }

        setCacState({ status: 'verifying' });

        try {
            const { data, error } = await supabase.functions.invoke('verify-identity', {
                body: { type: 'cac', identifier: cacNumber }
            });

            if (error) throw error;

            if (data.valid) {
                setCacState({ status: 'verified', data: data.data });
                updateFormData({
                    cacVerified: true,
                    cacData: data.data,
                    businessName: data.data.company_name || formData.businessName
                });
            } else {
                setCacState({ status: 'invalid', message: data.error });
            }
        } catch (error) {
            setCacState({ status: 'error', message: 'Could not verify CAC' });
        }
    };

    const verifyTIN = async (tin: string) => {
        if (!tin || tin.length < 8) {
            setTinState({ status: 'idle' });
            return;
        }

        setTinState({ status: 'verifying' });

        try {
            const { data, error } = await supabase.functions.invoke('verify-identity', {
                body: { type: 'tin', identifier: tin }
            });

            if (error) throw error;

            if (data.valid) {
                setTinState({ status: 'verified', data: data.data });
                updateFormData({ tinVerified: true, tinData: data.data });
            } else {
                setTinState({ status: 'invalid', message: data.error });
            }
        } catch (error) {
            setTinState({ status: 'error', message: 'Could not verify TIN' });
        }
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        } else {
            navigate('/register');
        }
    };

    const handleSubmit = async () => {
        if (!formData.authorized || !formData.consent) {
            toast({
                title: "Consent required",
                description: "Please confirm authorization and agree to the terms",
                variant: "destructive"
            });
            return;
        }

        setLoading(true);

        try {
            const { data, error } = await supabase.functions.invoke('register-business', {
                body: formData
            });

            if (error) throw error;

            if (data.success) {
                // Auto-login
                await supabase.auth.signInWithPassword({
                    email: formData.adminEmail,
                    password: formData.password
                });

                toast({
                    title: "Business registered!",
                    description: "Welcome to PRISM Business"
                });

                navigate('/dashboard', { state: { showTelegramPrompt: true } });
            } else {
                throw new Error(data.error || 'Registration failed');
            }
        } catch (error: any) {
            toast({
                title: "Registration failed",
                description: error.message || "Please try again",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const renderVerification = (state: VerificationState, label: string) => {
        switch (state.status) {
            case 'verifying':
                return (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying...
                    </div>
                );
            case 'verified':
                return (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        Verified: {state.data?.company_name || state.data?.name}
                    </div>
                );
            case 'invalid':
                return (
                    <div className="flex items-center gap-2 text-destructive text-sm">
                        <XCircle className="h-4 w-4" />
                        {state.message || `Invalid ${label}`}
                    </div>
                );
            case 'error':
                return (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <AlertCircle className="h-4 w-4" />
                        {state.message}
                    </div>
                );
            default:
                return null;
        }
    };

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
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                                <Building2 className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div className="flex-1">
                                <CardTitle className="text-xl font-bold">
                                    Register Your Business
                                </CardTitle>
                                <CardDescription>
                                    Step {currentStep + 1} of {STEPS.length}
                                </CardDescription>
                            </div>
                        </div>
                        <ProgressBar steps={STEPS} currentStep={currentStep} />
                    </CardHeader>
                    <CardContent>
                        {/* Step 1: Business Info */}
                        {currentStep === 0 && (
                            <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="cacNumber">CAC Registration Number (RC/BN) *</Label>
                                    <Input
                                        id="cacNumber"
                                        placeholder="RC 1234567"
                                        value={formData.cacNumber}
                                        onChange={(e) => {
                                            updateFormData({ cacNumber: e.target.value, cacVerified: false });
                                            verifyCAC(e.target.value);
                                        }}
                                    />
                                    {renderVerification(cacState, 'CAC')}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="businessName">Registered Business Name *</Label>
                                    <Input
                                        id="businessName"
                                        placeholder="Company Name Ltd"
                                        value={formData.businessName}
                                        onChange={(e) => updateFormData({ businessName: e.target.value })}
                                        disabled={formData.cacVerified}
                                    />
                                    {formData.cacVerified && (
                                        <p className="text-xs text-muted-foreground">Auto-filled from CAC</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="tin">TIN (Tax Identification Number)</Label>
                                    <Input
                                        id="tin"
                                        placeholder="12345678-0001"
                                        value={formData.tin}
                                        onChange={(e) => {
                                            updateFormData({ tin: e.target.value, tinVerified: false });
                                            verifyTIN(e.target.value);
                                        }}
                                    />
                                    {renderVerification(tinState, 'TIN')}
                                </div>

                                <Button type="submit" className="w-full" disabled={!formData.businessName}>
                                    Continue
                                </Button>
                            </form>
                        )}

                        {/* Step 2: Admin User */}
                        {currentStep === 1 && (
                            <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="adminName">Your Full Name *</Label>
                                    <Input
                                        id="adminName"
                                        placeholder="Chukwuemeka Okonkwo"
                                        value={formData.adminName}
                                        onChange={(e) => updateFormData({ adminName: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Your Role *</Label>
                                    <RadioGroup
                                        value={formData.adminRole}
                                        onValueChange={(v) => updateFormData({ adminRole: v })}
                                        className="flex gap-4"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="director" id="director" />
                                            <Label htmlFor="director">Director/CEO</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="finance" id="finance" />
                                            <Label htmlFor="finance">Finance</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="other" id="other" />
                                            <Label htmlFor="other">Other</Label>
                                        </div>
                                    </RadioGroup>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="adminEmail">Email *</Label>
                                    <Input
                                        id="adminEmail"
                                        type="email"
                                        placeholder="you@company.com"
                                        value={formData.adminEmail}
                                        onChange={(e) => updateFormData({ adminEmail: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="adminPhone">Phone *</Label>
                                    <Input
                                        id="adminPhone"
                                        placeholder="+234 800 000 0000"
                                        value={formData.adminPhone}
                                        onChange={(e) => updateFormData({ adminPhone: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password">Password *</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => updateFormData({ password: e.target.value })}
                                    />
                                </div>

                                <div className="flex gap-3">
                                    <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
                                        Back
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1"
                                        disabled={!formData.adminName || !formData.adminEmail || !formData.password}
                                    >
                                        Continue
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Step 3: Business Context */}
                        {currentStep === 2 && (
                            <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="tellUs">Tell us about your business</Label>
                                    <Textarea
                                        id="tellUs"
                                        placeholder="We provide IT consulting to corporate clients. 5 staff on payroll, sometimes hire contractors..."
                                        value={formData.tellUsAboutBusiness}
                                        onChange={(e) => updateFormData({ tellUsAboutBusiness: e.target.value })}
                                        className="min-h-[100px]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Industry *</Label>
                                    <RadioGroup
                                        value={formData.industry}
                                        onValueChange={(v) => updateFormData({ industry: v })}
                                        className="grid grid-cols-2 gap-2"
                                    >
                                        {INDUSTRY_OPTIONS.map((opt) => (
                                            <div key={opt.value} className="flex items-center space-x-2">
                                                <RadioGroupItem value={opt.value} id={opt.value} />
                                                <Label htmlFor={opt.value} className="text-sm">{opt.label}</Label>
                                            </div>
                                        ))}
                                    </RadioGroup>
                                </div>

                                <div className="space-y-2">
                                    <Label>Annual Revenue Range *</Label>
                                    <RadioGroup
                                        value={formData.revenueRange}
                                        onValueChange={(v) => updateFormData({ revenueRange: v })}
                                        className="space-y-2"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="under_25m" id="under_25m" />
                                            <Label htmlFor="under_25m">Under ₦25 million</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="25m_100m" id="25m_100m" />
                                            <Label htmlFor="25m_100m">₦25M - ₦100 million</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="over_100m" id="over_100m" />
                                            <Label htmlFor="over_100m">Over ₦100 million</Label>
                                        </div>
                                    </RadioGroup>
                                </div>

                                <div className="space-y-2">
                                    <Label>Do you handle project funds for clients?</Label>
                                    <RadioGroup
                                        value={formData.handlesProjectFunds}
                                        onValueChange={(v) => updateFormData({ handlesProjectFunds: v })}
                                        className="flex gap-4"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="yes" id="pf_yes" />
                                            <Label htmlFor="pf_yes">Yes</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="sometimes" id="pf_sometimes" />
                                            <Label htmlFor="pf_sometimes">Sometimes</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="no" id="pf_no" />
                                            <Label htmlFor="pf_no">No</Label>
                                        </div>
                                    </RadioGroup>
                                </div>

                                <div className="flex gap-3">
                                    <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
                                        Back
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1"
                                        disabled={!formData.industry || !formData.revenueRange}
                                    >
                                        Continue
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Step 4: Compliance */}
                        {currentStep === 3 && (
                            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-6">
                                <div className="space-y-2">
                                    <Label>Bank Account Setup</Label>
                                    <RadioGroup
                                        value={formData.bankSetup}
                                        onValueChange={(v) => updateFormData({ bankSetup: v as any })}
                                        className="space-y-2"
                                    >
                                        <div className="flex items-start space-x-3 p-3 rounded-lg border">
                                            <RadioGroupItem value="connect_now" id="b_connect" className="mt-0.5" />
                                            <Label htmlFor="b_connect" className="cursor-pointer">
                                                <span className="font-medium">Connect now</span>
                                                <p className="text-xs text-muted-foreground">Auto-track business transactions</p>
                                            </Label>
                                        </div>
                                        <div className="flex items-start space-x-3 p-3 rounded-lg border">
                                            <RadioGroupItem value="upload_later" id="b_later" className="mt-0.5" />
                                            <Label htmlFor="b_later" className="cursor-pointer">
                                                <span className="font-medium">Upload later</span>
                                                <p className="text-xs text-muted-foreground">I'll upload statements manually</p>
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-start space-x-3">
                                        <Checkbox
                                            id="authorized"
                                            checked={formData.authorized}
                                            onCheckedChange={(c) => updateFormData({ authorized: c as boolean })}
                                        />
                                        <Label htmlFor="authorized" className="text-sm leading-relaxed cursor-pointer">
                                            I confirm I am authorized to act on behalf of <strong>{formData.businessName}</strong>
                                        </Label>
                                    </div>

                                    <div className="flex items-start space-x-3">
                                        <Checkbox
                                            id="consent"
                                            checked={formData.consent}
                                            onCheckedChange={(c) => updateFormData({ consent: c as boolean })}
                                        />
                                        <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                                            I agree to the{' '}
                                            <Link to="/terms" className="text-primary hover:underline">Terms</Link>
                                            {' '}and{' '}
                                            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                                        </Label>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
                                        Back
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1"
                                        disabled={loading || !formData.authorized || !formData.consent}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            'Create Business Account'
                                        )}
                                    </Button>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
