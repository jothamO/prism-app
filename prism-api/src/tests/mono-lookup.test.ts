/**
 * Mono Lookup Service Tests
 * 
 * Run with: npm run test:mono
 * 
 * Note: Integration tests require MONO_SECRET_KEY to be set
 * and will use real Mono API (sandbox mode uses real data)
 */

import { MonoLookupService } from '../services/mono-lookup.service';

// Mock fetch for unit tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('MonoLookupService', () => {
    let service: MonoLookupService;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.MONO_SECRET_KEY = 'test_secret_key';
        service = new MonoLookupService();
    });

    afterEach(() => {
        delete process.env.MONO_SECRET_KEY;
    });

    describe('isConfigured', () => {
        it('should return true when MONO_SECRET_KEY is set', () => {
            expect(service.isConfigured()).toBe(true);
        });

        it('should return false when MONO_SECRET_KEY is not set', () => {
            delete process.env.MONO_SECRET_KEY;
            const unconfiguredService = new MonoLookupService();
            expect(unconfiguredService.isConfigured()).toBe(false);
        });
    });

    describe('lookupNIN', () => {
        it('should return NIN details on success', async () => {
            const mockResponse = {
                data: {
                    nin: '12345678901',
                    firstname: 'John',
                    middlename: 'Doe',
                    surname: 'Smith',
                    birthdate: '1990-01-15',
                    photo: 'base64_encoded_photo',
                    telephoneno: '08012345678',
                    email: 'john@example.com',
                    gender: 'Male',
                    self_origin_lga: 'Ikeja',
                    self_origin_place: 'Lagos',
                    self_origin_state: 'Lagos',
                    residence_address: '123 Test Street',
                    residence_lga: 'Ikeja',
                    residence_state: 'Lagos',
                    signature: 'base64_signature'
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await service.lookupNIN('12345678901');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.withmono.com/v3/lookup/nin',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'mono-sec-key': 'test_secret_key'
                    }),
                    body: JSON.stringify({ nin: '12345678901' })
                })
            );
            expect(result.firstname).toBe('John');
            expect(result.surname).toBe('Smith');
        });

        it('should throw error on API failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: () => Promise.resolve({ code: 'NOT_FOUND', message: 'NIN not found' })
            });

            await expect(service.lookupNIN('invalid')).rejects.toMatchObject({
                code: 'NOT_FOUND',
                statusCode: 404
            });
        });
    });

    describe('lookupTIN', () => {
        it('should lookup individual TIN', async () => {
            const mockResponse = {
                data: {
                    taxpayer_name: 'John Smith',
                    cac_reg_number: null,
                    firstin: null,
                    jittin: '12345678-0001',
                    tax_office: 'Ikeja Tax Office',
                    phone_number: '08012345678',
                    email: 'john@example.com',
                    tin_type: 'INDIVIDUAL'
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await service.lookupTIN('12345678-0001', 'tin');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.withmono.com/v3/lookup/tin',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ number: '12345678-0001', channel: 'tin' })
                })
            );
            expect(result.tin_type).toBe('INDIVIDUAL');
        });

        it('should lookup corporate TIN via CAC channel', async () => {
            const mockResponse = {
                data: {
                    taxpayer_name: 'ABC Company Ltd',
                    cac_reg_number: 'RC123456',
                    firstin: null,
                    jittin: '98765432-0001',
                    tax_office: 'Large Tax Office',
                    phone_number: '08098765432',
                    email: 'info@abc.com',
                    tin_type: 'CORPORATE'
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await service.lookupTIN('RC123456', 'cac');

            expect(result.tin_type).toBe('CORPORATE');
            expect(result.cac_reg_number).toBe('RC123456');
        });
    });

    describe('searchCAC', () => {
        it('should return list of matching companies', async () => {
            const mockResponse = {
                data: {
                    companies: [
                        {
                            id: 'cmp_123',
                            company_name: 'Dangote Industries Ltd',
                            rc_number: 'RC71463',
                            company_type: 'PRIVATE',
                            date_of_registration: '1989-01-01',
                            address: 'Lagos',
                            status: 'ACTIVE'
                        },
                        {
                            id: 'cmp_456',
                            company_name: 'Dangote Cement Plc',
                            rc_number: 'RC620420',
                            company_type: 'PUBLIC',
                            date_of_registration: '2008-01-01',
                            address: 'Lagos',
                            status: 'ACTIVE'
                        }
                    ]
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await service.searchCAC('Dangote');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.withmono.com/v3/lookup/cac?search=Dangote',
                expect.objectContaining({ method: 'GET' })
            );
            expect(result).toHaveLength(2);
            expect(result[0].company_name).toBe('Dangote Industries Ltd');
        });

        it('should handle empty results', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ data: { companies: [] } })
            });

            const result = await service.searchCAC('NonExistentCompany123');
            expect(result).toEqual([]);
        });
    });

    describe('getCACDirectors', () => {
        it('should return list of company directors', async () => {
            const mockResponse = {
                data: {
                    directors: [
                        {
                            id: 'dir_1',
                            name: 'Aliko Dangote',
                            designation: 'Chairman',
                            date_of_appointment: '1989-01-01',
                            nationality: 'Nigerian',
                            residential_address: 'Lagos'
                        }
                    ]
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await service.getCACDirectors('cmp_123');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.withmono.com/v3/lookup/cac/cmp_123/directors',
                expect.objectContaining({ method: 'GET' })
            );
            expect(result[0].name).toBe('Aliko Dangote');
        });
    });

    describe('getCACShareholders', () => {
        it('should return list of company shareholders', async () => {
            const mockResponse = {
                data: {
                    shareholders: [
                        {
                            id: 'sh_1',
                            name: 'Dangote Holdings',
                            shares: 1000000,
                            share_type: 'Ordinary',
                            nationality: 'Nigerian'
                        }
                    ]
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await service.getCACShareholders('cmp_123');

            expect(result[0].name).toBe('Dangote Holdings');
            expect(result[0].shares).toBe(1000000);
        });
    });

    describe('lookupBVNAccounts', () => {
        it('should return linked bank accounts', async () => {
            const mockResponse = {
                data: {
                    accounts: [
                        {
                            institution: {
                                name: 'First Bank',
                                bank_code: '011',
                                type: 'commercial'
                            },
                            account_number: '1234567890',
                            account_type: 'savings'
                        },
                        {
                            institution: {
                                name: 'GTBank',
                                bank_code: '058',
                                type: 'commercial'
                            },
                            account_number: '0987654321',
                            account_type: 'current'
                        }
                    ]
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await service.lookupBVNAccounts('22345678901');

            expect(result).toHaveLength(2);
            expect(result[0].institution.name).toBe('First Bank');
        });
    });

    describe('lookupAccountNumber', () => {
        it('should return account holder details', async () => {
            const mockResponse = {
                data: {
                    account_name: 'JOHN DOE SMITH',
                    account_number: '1234567890',
                    bvn: '22345678901'
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            });

            const result = await service.lookupAccountNumber('1234567890', '011');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.withmono.com/v3/lookup/account-number?account_number=1234567890&bank_code=011',
                expect.objectContaining({ method: 'GET' })
            );
            expect(result.account_name).toBe('JOHN DOE SMITH');
        });
    });

    describe('Error handling', () => {
        it('should throw error when MONO_SECRET_KEY is not configured', async () => {
            delete process.env.MONO_SECRET_KEY;
            const unconfiguredService = new MonoLookupService();

            await expect(unconfiguredService.lookupNIN('123')).rejects.toThrow('MONO_SECRET_KEY not configured');
        });

        it('should handle network errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await expect(service.lookupNIN('123')).rejects.toThrow('Network error');
        });
    });
});

// Integration tests - only run when MONO_SECRET_KEY is set to a real key
describe('MonoLookupService Integration', () => {
    const SKIP_INTEGRATION = !process.env.MONO_SECRET_KEY || process.env.MONO_SECRET_KEY === 'test_secret_key';

    beforeAll(() => {
        if (SKIP_INTEGRATION) {
            console.log('⚠️ Skipping integration tests - set real MONO_SECRET_KEY to run');
        }
    });

    const conditionalTest = SKIP_INTEGRATION ? it.skip : it;

    conditionalTest('should perform real CAC search', async () => {
        // Reset mock to use real fetch
        global.fetch = require('node-fetch');
        const realService = new MonoLookupService();

        const result = await realService.searchCAC('Dangote');
        
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('company_name');
        expect(result[0]).toHaveProperty('rc_number');
    }, 30000);
});
