import { supabase } from '../config/supabase';
import { monoLookupService, NINLookupResult, CACSearchResult, TINLookupResult } from './mono-lookup.service';

export class TaxIDResolverService {
    /**
     * Resolve tax identifier from NIN/CAC/TIN
     */
    async resolveTaxID(identifier: string, type: 'nin' | 'cac' | 'tin'): Promise<TaxIDResolution> {
        if (type === 'nin') {
            // Validate NIN format (11 digits)
            if (!this.isValidNIN(identifier)) {
                throw new Error('Invalid NIN format. Must be 11 digits.');
            }

            const ninData = await this.verifyNIN(identifier);

            return {
                tax_id: identifier,
                tax_id_type: 'NIN',
                entity_type: 'individual',
                verified: ninData.verified,
                name: ninData.full_name,
                dob: ninData.date_of_birth,
                photo_url: ninData.photo_url,
                tax_rules: 'PIT',
                verification_source: ninData.verification_source,
                act_reference: 'Tax Act 2025 - Tax ID Definition'
            };
        } else if (type === 'tin') {
            // Validate TIN format
            if (!this.isValidTIN(identifier)) {
                throw new Error('Invalid TIN format.');
            }

            const tinData = await this.verifyTIN(identifier);

            return {
                tax_id: identifier,
                tax_id_type: 'TIN',
                entity_type: tinData.entity_type,
                verified: tinData.verified,
                name: tinData.taxpayer_name,
                tax_rules: tinData.entity_type === 'individual' ? 'PIT' : 'CIT',
                small_company_eligible: tinData.entity_type === 'company',
                verification_source: tinData.verification_source,
                act_reference: 'Tax Act 2025 - Tax ID Definition'
            };
        } else {
            // CAC Number (RC or BN)
            if (!this.isValidCAC(identifier)) {
                throw new Error('Invalid CAC number format.');
            }

            const cacData = await this.verifyCAC(identifier);

            return {
                tax_id: identifier,
                tax_id_type: cacData.type,
                entity_type: 'company',
                verified: cacData.verified,
                name: cacData.company_name,
                incorporation_date: cacData.registration_date,
                tax_rules: 'CIT',
                small_company_eligible: true,
                verification_source: cacData.verification_source,
                act_reference: 'Tax Act 2025 - Tax ID Definition'
            };
        }
    }

    /**
     * Validate NIN format (11 digits)
     */
    private isValidNIN(nin: string): boolean {
        return /^\d{11}$/.test(nin);
    }

    /**
     * Validate CAC number format (RC or BN followed by 6-7 digits)
     */
    private isValidCAC(cac: string): boolean {
        return /^(RC|BN)\d{6,7}$/i.test(cac);
    }

    /**
     * Validate TIN format (typically 10-14 digits with optional hyphen)
     */
    private isValidTIN(tin: string): boolean {
        return /^[\d-]{8,15}$/.test(tin);
    }

    /**
     * Verify NIN via Mono Lookup API
     * Falls back to mock data if Mono is not configured
     */
    async verifyNIN(nin: string): Promise<NINData> {
        if (monoLookupService.isConfigured()) {
            try {
                const result = await monoLookupService.lookupNIN(nin);
                return {
                    nin,
                    full_name: `${result.firstname} ${result.middlename || ''} ${result.surname}`.trim(),
                    date_of_birth: result.birthdate,
                    photo_url: result.photo ? `data:image/jpeg;base64,${result.photo}` : undefined,
                    phone: result.telephoneno,
                    email: result.email,
                    gender: result.gender,
                    address: result.residence_address,
                    state: result.residence_state,
                    verified: true,
                    verification_source: 'mono_nin'
                };
            } catch (error: any) {
                console.error('[TaxIDResolver] Mono NIN lookup failed:', error);
                
                // If not found, don't fall back to mock
                if (error.statusCode === 404) {
                    throw new Error('NIN not found in national database');
                }
                
                // For other errors, fall back to mock in non-production
                if (process.env.NODE_ENV === 'production') {
                    throw new Error('NIN verification service unavailable');
                }
            }
        }

        // Fallback: Mock verification for testing
        console.warn('[TaxIDResolver] Using mock NIN verification');
        return this.mockVerifyNIN(nin);
    }

    /**
     * Verify CAC number via Mono Lookup API
     */
    async verifyCAC(cac: string): Promise<CACData> {
        if (monoLookupService.isConfigured()) {
            try {
                const results = await monoLookupService.searchCAC(cac);
                
                if (results.length === 0) {
                    throw new Error('CAC number not found in registry');
                }

                const company = results[0];
                const type = cac.toUpperCase().startsWith('RC') ? 'RC' : 'BN';

                return {
                    cac_number: company.rc_number,
                    type,
                    company_name: company.company_name,
                    registration_date: company.date_of_registration,
                    address: company.address,
                    status: company.status,
                    verified: true,
                    verification_source: 'mono_cac',
                    mono_company_id: company.id
                };
            } catch (error: any) {
                console.error('[TaxIDResolver] Mono CAC lookup failed:', error);
                
                if (error.statusCode === 404 || error.message?.includes('not found')) {
                    throw new Error('CAC number not found in registry');
                }
                
                if (process.env.NODE_ENV === 'production') {
                    throw new Error('CAC verification service unavailable');
                }
            }
        }

        // Fallback: Mock verification for testing
        console.warn('[TaxIDResolver] Using mock CAC verification');
        return this.mockVerifyCAC(cac);
    }

    /**
     * Verify TIN via Mono Lookup API
     */
    async verifyTIN(tin: string, channel: 'tin' | 'cac' = 'tin'): Promise<TINData> {
        if (monoLookupService.isConfigured()) {
            try {
                const result = await monoLookupService.lookupTIN(tin, channel);
                
                return {
                    tin,
                    taxpayer_name: result.taxpayer_name,
                    entity_type: result.tin_type === 'INDIVIDUAL' ? 'individual' : 'company',
                    tax_office: result.tax_office,
                    phone: result.phone_number,
                    email: result.email,
                    cac_number: result.cac_reg_number,
                    verified: true,
                    verification_source: 'mono_tin'
                };
            } catch (error: any) {
                console.error('[TaxIDResolver] Mono TIN lookup failed:', error);
                
                if (error.statusCode === 404) {
                    throw new Error('TIN not found in tax database');
                }
                
                if (process.env.NODE_ENV === 'production') {
                    throw new Error('TIN verification service unavailable');
                }
            }
        }

        // Fallback: Mock verification for testing
        console.warn('[TaxIDResolver] Using mock TIN verification');
        return this.mockVerifyTIN(tin);
    }

    /**
     * Get CAC company directors via Mono API
     */
    async getCACDirectors(companyId: string): Promise<CACDirector[]> {
        if (!monoLookupService.isConfigured()) {
            console.warn('[TaxIDResolver] Mono not configured, cannot fetch directors');
            return [];
        }

        try {
            const directors = await monoLookupService.getCACDirectors(companyId);
            return directors.map(d => ({
                name: d.name,
                designation: d.designation,
                appointed_date: d.date_of_appointment,
                nationality: d.nationality,
                address: d.residential_address
            }));
        } catch (error) {
            console.error('[TaxIDResolver] Failed to fetch directors:', error);
            return [];
        }
    }

    /**
     * Get CAC company shareholders via Mono API
     */
    async getCACShareholders(companyId: string): Promise<CACShareholder[]> {
        if (!monoLookupService.isConfigured()) {
            console.warn('[TaxIDResolver] Mono not configured, cannot fetch shareholders');
            return [];
        }

        try {
            const shareholders = await monoLookupService.getCACShareholders(companyId);
            return shareholders.map(s => ({
                name: s.name,
                shares: s.shares,
                share_type: s.share_type,
                nationality: s.nationality
            }));
        } catch (error) {
            console.error('[TaxIDResolver] Failed to fetch shareholders:', error);
            return [];
        }
    }

    /**
     * Discover bank accounts linked to a BVN
     */
    async discoverBankAccounts(bvn: string): Promise<BankAccount[]> {
        if (!monoLookupService.isConfigured()) {
            console.warn('[TaxIDResolver] Mono not configured for BVN lookup');
            return [];
        }

        try {
            const accounts = await monoLookupService.lookupBVNAccounts(bvn);
            return accounts.map(a => ({
                bank_name: a.institution.name,
                bank_code: a.institution.bank_code,
                account_number: a.account_number,
                account_type: a.account_type
            }));
        } catch (error) {
            console.error('[TaxIDResolver] BVN lookup failed:', error);
            return [];
        }
    }

    /**
     * Verify bank account number and get holder name
     */
    async verifyBankAccount(accountNumber: string, bankCode: string): Promise<BankAccountVerification> {
        if (!monoLookupService.isConfigured()) {
            throw new Error('Bank verification service not configured');
        }

        try {
            const result = await monoLookupService.lookupAccountNumber(accountNumber, bankCode);
            return {
                account_name: result.account_name,
                account_number: result.account_number,
                bvn: result.bvn,
                verified: true
            };
        } catch (error: any) {
            console.error('[TaxIDResolver] Bank account lookup failed:', error);
            throw new Error('Unable to verify bank account');
        }
    }

    /**
     * Check if company qualifies for small company status
     */
    async checkSmallCompanyStatus(cacNumber: string): Promise<boolean> {
        const { data: business } = await supabase
            .from('businesses')
            .select('annual_turnover')
            .eq('registration_number', cacNumber)
            .single();

        if (!business) {
            return true; // Default to eligible for new businesses
        }

        return (business.annual_turnover || 0) < 50_000_000;
    }

    // ==================== Mock Fallbacks ====================

    private async mockVerifyNIN(nin: string): Promise<NINData> {
        await new Promise(resolve => setTimeout(resolve, 200));
        return {
            nin,
            full_name: 'Test User',
            date_of_birth: '1990-01-01',
            verified: true,
            verification_source: 'mock'
        };
    }

    private async mockVerifyCAC(cac: string): Promise<CACData> {
        await new Promise(resolve => setTimeout(resolve, 200));
        const type = cac.toUpperCase().startsWith('RC') ? 'RC' : 'BN';
        return {
            cac_number: cac,
            type,
            company_name: 'Test Company Ltd',
            registration_date: '2020-01-01',
            verified: true,
            verification_source: 'mock'
        };
    }

    private async mockVerifyTIN(tin: string): Promise<TINData> {
        await new Promise(resolve => setTimeout(resolve, 200));
        return {
            tin,
            taxpayer_name: 'Test Taxpayer',
            entity_type: 'individual',
            verified: true,
            verification_source: 'mock'
        };
    }
}

// ==================== Type Definitions ====================

export interface TaxIDResolution {
    tax_id: string;
    tax_id_type: string;
    entity_type: 'individual' | 'company';
    verified: boolean;
    name: string;
    dob?: string;
    photo_url?: string;
    incorporation_date?: string;
    tax_rules: 'PIT' | 'CIT';
    small_company_eligible?: boolean;
    verification_source?: string;
    act_reference: string;
}

export interface NINData {
    nin: string;
    full_name: string;
    date_of_birth: string;
    photo_url?: string;
    phone?: string;
    email?: string;
    gender?: string;
    address?: string;
    state?: string;
    verified: boolean;
    verification_source: string;
}

export interface CACData {
    cac_number: string;
    type: 'RC' | 'BN';
    company_name: string;
    registration_date: string;
    address?: string;
    status?: string;
    verified: boolean;
    verification_source: string;
    mono_company_id?: string;
}

export interface TINData {
    tin: string;
    taxpayer_name: string;
    entity_type: 'individual' | 'company';
    tax_office?: string;
    phone?: string;
    email?: string;
    cac_number?: string | null;
    verified: boolean;
    verification_source: string;
}

export interface CACDirector {
    name: string;
    designation: string;
    appointed_date: string;
    nationality: string;
    address: string;
}

export interface CACShareholder {
    name: string;
    shares: number;
    share_type: string;
    nationality: string;
}

export interface BankAccount {
    bank_name: string;
    bank_code: string;
    account_number: string;
    account_type: string;
}

export interface BankAccountVerification {
    account_name: string;
    account_number: string;
    bvn: string;
    verified: boolean;
}

export const taxIdResolverService = new TaxIDResolverService();
