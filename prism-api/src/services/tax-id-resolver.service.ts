import { supabase } from '../config/supabase';

export class TaxIDResolverService {
    /**
     * Resolve tax identifier from NIN/CAC
     */
    async resolveTaxID(identifier: string, type: 'nin' | 'cac'): Promise<TaxIDResolution> {
        if (type === 'nin') {
            // Validate NIN format (11 digits)
            if (!this.isValidNIN(identifier)) {
                throw new Error('Invalid NIN format. Must be 11 digits.');
            }

            // For alpha testing: Mock NIMC verification
            // TODO: Replace with actual NIMC API call in production
            const ninData = await this.mockVerifyNIN(identifier);

            return {
                tax_id: identifier,
                tax_id_type: 'NIN',
                entity_type: 'individual',
                verified: true,
                name: ninData.full_name,
                dob: ninData.date_of_birth,
                tax_rules: 'PIT',
                act_reference: 'Tax Act 2025 - Tax ID Definition'
            };
        } else {
            // CAC Number (RC or BN)
            if (!this.isValidCAC(identifier)) {
                throw new Error('Invalid CAC number format.');
            }

            // For alpha testing: Mock CAC verification
            // TODO: Replace with actual CAC API call in production
            const cacData = await this.mockVerifyCACNumber(identifier);

            return {
                tax_id: identifier,
                tax_id_type: cacData.type,
                entity_type: 'company',
                verified: true,
                name: cacData.company_name,
                incorporation_date: cacData.registration_date,
                tax_rules: 'CIT',
                small_company_eligible: true,
                act_reference: 'Tax Act 2025 - Tax ID Definition'
            };
        }
    }

    /**
     * Validate NIN format
     */
    private isValidNIN(nin: string): boolean {
        return /^\d{11}$/.test(nin);
    }

    /**
     * Validate CAC number format
     */
    private isValidCAC(cac: string): boolean {
        return /^(RC|BN)\d{6,7}$/i.test(cac);
    }

    /**
     * Mock NIN verification (for alpha testing)
     * TODO: Replace with actual NIMC API
     */
    private async mockVerifyNIN(nin: string): Promise<NINData> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            nin,
            full_name: 'Test User', // In production, this comes from NIMC
            date_of_birth: '1990-01-01',
            verified: true
        };
    }

    /**
     * Mock CAC verification (for alpha testing)
     * TODO: Replace with actual CAC API
     */
    private async mockVerifyCACNumber(cac: string): Promise<CACData> {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        const type = cac.startsWith('RC') ? 'RC' : 'BN';

        return {
            cac_number: cac,
            type,
            company_name: 'Test Company Ltd', // In production, this comes from CAC
            registration_date: '2020-01-01',
            verified: true,
            annual_turnover: 0
        };
    }

    /**
     * Check if company qualifies for small company status
     */
    async checkSmallCompanyStatus(cacNumber: string): Promise<boolean> {
        const { data: business } = await supabase
            .from('businesses')
            .select('annual_turnover')
            .eq('cac_number', cacNumber)
            .single();

        if (!business) {
            return true; // Default to eligible for new businesses
        }

        return business.annual_turnover < 50_000_000;
    }
}

interface TaxIDResolution {
    tax_id: string;
    tax_id_type: string;
    entity_type: 'individual' | 'company';
    verified: boolean;
    name: string;
    dob?: string;
    incorporation_date?: string;
    tax_rules: 'PIT' | 'CIT';
    small_company_eligible?: boolean;
    act_reference: string;
}

interface NINData {
    nin: string;
    full_name: string;
    date_of_birth: string;
    verified: boolean;
}

interface CACData {
    cac_number: string;
    type: 'RC' | 'BN';
    company_name: string;
    registration_date: string;
    verified: boolean;
    annual_turnover: number;
}
