import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserProfile {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    accountType: 'personal' | 'business';
    // Tax classification
    entityType?: string;
    taxCategory?: string;
    occupation?: string;
    location?: string;
    // Income sources
    hasBusinessIncome: boolean;
    hasSalaryIncome: boolean;
    hasFreelanceIncome: boolean;
    hasPensionIncome: boolean;
    // KYC
    ninVerified: boolean;
    bvnVerified: boolean;
    kycLevel: number;
    // Telegram
    telegramId?: string;
    telegramConnected: boolean;
    // Bank
    bankSetup?: string;
    bankConnected: boolean;
    // Developer Access
    hasDeveloperAccess: boolean;
    // Onboarding
    onboardingCompleted: boolean;
    profileConfidence?: number;
    createdAt?: string;
}

export interface Business {
    id: string;
    name: string;
    cacNumber?: string;
    cacVerified: boolean;
    tin?: string;
    tinVerified: boolean;
    vatRegistered: boolean;
    industryCode?: string;
    companySize?: string;
    revenueRange?: string;
    handlesProjectFunds: boolean;
}

interface UseUserProfileReturn {
    profile: UserProfile | null;
    business: Business | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function useUserProfile(): UseUserProfileReturn {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [business, setBusiness] = useState<Business | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProfile = useCallback(async () => {
        if (!user) {
            setProfile(null);
            setBusiness(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Fetch user profile
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('auth_user_id', user.id)
                .single();

            if (userError) {
                // User might not exist yet in users table (just signed up via Auth)
                if (userError.code === 'PGRST116') {
                    setProfile(null);
                    setLoading(false);
                    return;
                }
                throw userError;
            }

            const userProfile: UserProfile = {
                id: userData.id,
                fullName: userData.full_name || user.user_metadata?.full_name || '',
                email: userData.email || user.email || '',
                phone: userData.phone,
                accountType: userData.account_type || 'personal',
                entityType: userData.entity_type,
                taxCategory: userData.tax_category,
                occupation: userData.occupation,
                location: userData.location,
                hasBusinessIncome: userData.has_business_income || false,
                hasSalaryIncome: userData.has_salary_income || false,
                hasFreelanceIncome: userData.has_freelance_income || false,
                hasPensionIncome: userData.has_pension_income || false,
                ninVerified: userData.nin_verified || false,
                bvnVerified: userData.bvn_verified || false,
                kycLevel: userData.kyc_level || 0,
                telegramId: userData.telegram_id,
                telegramConnected: !!userData.telegram_id,
                bankSetup: userData.bank_setup,
                bankConnected: userData.bank_setup === 'connected',
                hasDeveloperAccess: userData.has_developer_access || false,
                onboardingCompleted: userData.onboarding_completed || false,
                profileConfidence: userData.profile_confidence,
                createdAt: userData.created_at,
            };

            setProfile(userProfile);

            // If business account, fetch business data
            if (userProfile.accountType === 'business') {
                const { data: businessData } = await supabase
                    .from('businesses')
                    .select('*')
                    .eq('owner_user_id', userData.id)
                    .single();

                if (businessData) {
                    setBusiness({
                        id: businessData.id,
                        name: businessData.name,
                        cacNumber: businessData.cac_number,
                        cacVerified: businessData.cac_verified || false,
                        tin: businessData.tin,
                        tinVerified: businessData.tin_verified || false,
                        vatRegistered: businessData.vat_registered || false,
                        industryCode: businessData.industry_code,
                        companySize: businessData.company_size,
                        revenueRange: businessData.revenue_range,
                        handlesProjectFunds: businessData.handles_project_funds || false,
                    });
                }
            }
        } catch (err: any) {
            console.error('[useUserProfile] Error:', err);
            setError(err.message || 'Failed to load profile');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    return { profile, business, loading, error, refetch: fetchProfile };
}
