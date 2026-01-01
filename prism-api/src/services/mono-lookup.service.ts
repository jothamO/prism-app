/**
 * Mono Lookup Service
 * Provides real-time identity verification via Mono's Lookup API (v3)
 * 
 * Supports:
 * - NIN Lookup: Personal details, photo, DOB
 * - TIN Lookup: Taxpayer info (individual & corporate)
 * - CAC Lookup: Company details, directors, shareholders
 * - BVN Lookup: Linked bank accounts
 * - Account Number Lookup: Account holder details
 */

export interface NINLookupResult {
    nin: string;
    firstname: string;
    middlename: string;
    surname: string;
    birthdate: string;
    photo: string; // Base64 encoded
    telephoneno: string;
    email: string;
    gender: string;
    self_origin_lga: string;
    self_origin_place: string;
    self_origin_state: string;
    residence_address: string;
    residence_lga: string;
    residence_state: string;
    signature: string;
}

export interface TINLookupResult {
    taxpayer_name: string;
    cac_reg_number: string | null;
    firstin: string | null;
    jittin: string;
    tax_office: string | null;
    phone_number: string;
    email: string;
    tin_type: 'INDIVIDUAL' | 'CORPORATE';
}

export interface CACSearchResult {
    id: string;
    company_name: string;
    rc_number: string;
    company_type: string;
    date_of_registration: string;
    address: string;
    status: string;
}

export interface CACDirector {
    id: string;
    name: string;
    designation: string;
    date_of_appointment: string;
    nationality: string;
    residential_address: string;
}

export interface CACShareholder {
    id: string;
    name: string;
    shares: number;
    share_type: string;
    nationality: string;
}

export interface BVNBankAccount {
    institution: {
        name: string;
        bank_code: string;
        type: string;
    };
    account_number: string;
    account_type: string;
}

export interface AccountLookupResult {
    account_name: string;
    account_number: string;
    bvn: string;
}

export interface MonoLookupError {
    code: string;
    message: string;
    statusCode: number;
}

export class MonoLookupService {
    private readonly baseUrl = 'https://api.withmono.com/v3';
    private readonly secretKey: string;

    constructor() {
        this.secretKey = process.env.MONO_SECRET_KEY || '';
        if (!this.secretKey) {
            console.warn('MONO_SECRET_KEY not configured - Mono Lookup will use mock data');
        }
    }

    /**
     * Helper: Make authenticated request to Mono API
     */
    private async makeRequest<T>(
        endpoint: string,
        method: 'GET' | 'POST' = 'GET',
        body?: object
    ): Promise<T> {
        if (!this.secretKey) {
            throw new Error('MONO_SECRET_KEY not configured');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const headers: HeadersInit = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'mono-sec-key': this.secretKey
        };

        const options: RequestInit = {
            method,
            headers
        };

        if (body && method === 'POST') {
            options.body = JSON.stringify(body);
        }

        console.log(`[MonoLookup] ${method} ${endpoint}`);

        const response = await fetch(url, options);
        const data = await response.json();

        if (!response.ok) {
            console.error(`[MonoLookup] Error ${response.status}:`, data);
            const error: MonoLookupError = {
                code: data.code || 'UNKNOWN_ERROR',
                message: data.message || 'Unknown error occurred',
                statusCode: response.status
            };
            throw error;
        }

        console.log(`[MonoLookup] Success:`, data);
        return data.data || data;
    }

    /**
     * NIN Lookup - Verify National Identification Number
     * Returns full personal details including photo
     */
    async lookupNIN(nin: string): Promise<NINLookupResult> {
        return this.makeRequest<NINLookupResult>('/lookup/nin', 'POST', { nin });
    }

    /**
     * TIN Lookup - Verify Tax Identification Number
     * Works for both individuals (channel: 'tin') and corporates (channel: 'cac')
     */
    async lookupTIN(number: string, channel: 'tin' | 'cac' = 'tin'): Promise<TINLookupResult> {
        return this.makeRequest<TINLookupResult>('/lookup/tin', 'POST', { number, channel });
    }

    /**
     * CAC Company Search - Find companies by name or RC number
     */
    async searchCAC(query: string): Promise<CACSearchResult[]> {
        const encoded = encodeURIComponent(query);
        const result = await this.makeRequest<{ companies: CACSearchResult[] }>(
            `/lookup/cac?search=${encoded}`,
            'GET'
        );
        return result.companies || [];
    }

    /**
     * CAC Company Details - Get directors list
     */
    async getCACDirectors(companyId: string): Promise<CACDirector[]> {
        const result = await this.makeRequest<{ directors: CACDirector[] }>(
            `/lookup/cac/${companyId}/directors`,
            'GET'
        );
        return result.directors || [];
    }

    /**
     * CAC Company Details - Get shareholders list
     */
    async getCACShareholders(companyId: string): Promise<CACShareholder[]> {
        const result = await this.makeRequest<{ shareholders: CACShareholder[] }>(
            `/lookup/cac/${companyId}/shareholders`,
            'GET'
        );
        return result.shareholders || [];
    }

    /**
     * BVN Bank Accounts - Discover all bank accounts linked to a BVN
     */
    async lookupBVNAccounts(bvn: string): Promise<BVNBankAccount[]> {
        const result = await this.makeRequest<{ accounts: BVNBankAccount[] }>(
            '/lookup/bvn/bank-accounts',
            'POST',
            { bvn }
        );
        return result.accounts || [];
    }

    /**
     * Account Number Lookup - Verify bank account details
     */
    async lookupAccountNumber(accountNumber: string, bankCode: string): Promise<AccountLookupResult> {
        return this.makeRequest<AccountLookupResult>(
            `/lookup/account-number?account_number=${accountNumber}&bank_code=${bankCode}`,
            'GET'
        );
    }

    /**
     * Check if service is configured and ready
     */
    isConfigured(): boolean {
        return !!this.secretKey;
    }
}

export const monoLookupService = new MonoLookupService();
