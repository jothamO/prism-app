/**
 * Identity Verification Skill
 * Handles NIN, TIN, CAC, BVN verification via Mono API
 */

import { logger } from '../../utils/logger';
import { supabase, config } from '../../config';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

export interface VerificationResult {
    verified: boolean;
    idType: 'nin' | 'tin' | 'cac' | 'bvn';
    data?: {
        fullName?: string;
        businessName?: string;
        registrationNumber?: string;
        status?: string;
        directors?: Array<{ name: string; designation?: string }>;
        address?: string;
        dateOfBirth?: string;
        phone?: string;
    };
    error?: string;
}

interface MonoLookupResponse {
    status: string;
    message: string;
    data?: any;
}

export class IdentityVerificationSkill {
    private monoSecretKey: string;
    private monoBaseUrl: string;

    constructor() {
        this.monoSecretKey = config.mono.secretKey;
        this.monoBaseUrl = config.mono.baseUrl;
    }

    /**
     * Check if Mono API is configured
     */
    private isMonoConfigured(): boolean {
        return !!this.monoSecretKey && this.monoSecretKey.length > 0;
    }

    /**
     * Make authenticated request to Mono API
     */
    private async monoRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: object): Promise<T> {
        const url = `${this.monoBaseUrl}${endpoint}`;
        
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'mono-sec-key': this.monoSecretKey
        };

        const options: RequestInit = {
            method,
            headers
        };

        if (body && method === 'POST') {
            options.body = JSON.stringify(body);
        }

        logger.info('[Mono API] Request', { url, method });
        
        const response = await fetch(url, options);
        const data = await response.json();

        if (!response.ok) {
            logger.error('[Mono API] Error response', { status: response.status, data });
            throw new Error(data.message || `Mono API error: ${response.status}`);
        }

        logger.info('[Mono API] Success', { endpoint });
        return data as T;
    }

    /**
     * Handle identity verification request
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Identity Skill] Processing request', { userId: context.userId, message });

            const lowerMessage = message.toLowerCase();

            // Check for specific ID type verification
            if (lowerMessage.includes('nin') || context.metadata?.awaitingNIN) {
                return await this.handleNINVerification(message, context);
            }

            if (lowerMessage.includes('tin') || context.metadata?.awaitingTIN) {
                return await this.handleTINVerification(message, context);
            }

            if (lowerMessage.includes('cac') || lowerMessage.includes('rc') || context.metadata?.awaitingCAC) {
                return await this.handleCACVerification(message, context);
            }

            if (lowerMessage.includes('bvn') || context.metadata?.awaitingBVN) {
                return await this.handleBVNVerification(message, context);
            }

            // Show verification options
            const monoStatus = this.isMonoConfigured() ? '✅ Live API' : '⚠️ Demo Mode';
            
            return {
                message: `🆔 Identity Verification (${monoStatus})\n\n` +
                    `I can verify the following IDs via Mono:\n\n` +
                    `*Personal IDs:*\n` +
                    `• NIN - National Identification Number\n` +
                    `• BVN - Bank Verification Number\n` +
                    `• TIN - Tax Identification Number\n\n` +
                    `*Business IDs:*\n` +
                    `• CAC/RC - Company Registration Number\n\n` +
                    `Send your ID in format:\n` +
                    `"verify NIN 12345678901"\n` +
                    `"verify CAC RC123456"`,
                buttons: [
                    [{ text: '🆔 Verify NIN', callback_data: 'verify_nin' }],
                    [{ text: '🏢 Verify CAC', callback_data: 'verify_cac' }],
                    [{ text: '📋 Verify TIN', callback_data: 'verify_tin' }]
                ],
                metadata: { skill: 'identity-verification', monoConfigured: this.isMonoConfigured() }
            };
        } catch (error) {
            logger.error('[Identity Skill] Error:', error);
            return {
                message: "❌ Verification failed. Please try again later.",
                metadata: { skill: 'identity-verification', error: (error as Error).message }
            };
        }
    }

    /**
     * Handle NIN verification
     */
    private async handleNINVerification(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        const ninMatch = message.match(/\b(\d{11})\b/);
        
        if (!ninMatch) {
            return {
                message: "📝 Please enter your 11-digit NIN (National ID Number):",
                metadata: { skill: 'identity-verification', awaitingNIN: true }
            };
        }

        const nin = ninMatch[1];
        const maskedNin = nin.substring(0, 4) + '****' + nin.substring(8);
        logger.info('[Identity Skill] Verifying NIN', { userId: context.userId, maskedNin });

        // Check if Mono is configured
        if (!this.isMonoConfigured()) {
            return this.demoVerificationResponse('nin', maskedNin);
        }

        try {
            // Call Mono NIN Lookup API
            const response = await this.monoRequest<MonoLookupResponse>(
                '/lookup/nin',
                'POST',
                { nin }
            );

            const data = response.data;
            
            // Store verification in database
            await this.storeVerification(context.userId, 'nin', nin, data);

            return {
                message: `🆔 NIN Verification ✅\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `*Name:* ${data?.first_name || ''} ${data?.middle_name || ''} ${data?.last_name || ''}\n` +
                    `*Gender:* ${data?.gender || 'N/A'}\n` +
                    `*DOB:* ${data?.birthdate || 'N/A'}\n` +
                    `*Phone:* ${data?.phone || 'N/A'}\n\n` +
                    `✅ NIN verified successfully via NIMC.\n\n` +
                    `💡 This information is now saved to your profile.`,
                metadata: {
                    skill: 'identity-verification',
                    idType: 'nin',
                    status: 'verified',
                    verificationSource: 'mono',
                    data: {
                        fullName: `${data?.first_name || ''} ${data?.last_name || ''}`.trim(),
                        phone: data?.phone,
                        dateOfBirth: data?.birthdate
                    }
                }
            };
        } catch (error) {
            logger.error('[Identity Skill] NIN verification failed', { error });
            return {
                message: `🆔 NIN Verification ❌\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `NIN: ${maskedNin}\n\n` +
                    `❌ Verification failed: ${(error as Error).message}\n\n` +
                    `Please check the NIN and try again.`,
                metadata: {
                    skill: 'identity-verification',
                    idType: 'nin',
                    status: 'failed',
                    error: (error as Error).message
                }
            };
        }
    }

    /**
     * Handle TIN verification
     */
    private async handleTINVerification(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        const tinMatch = message.match(/\b(\d{10,14})\b/);
        
        if (!tinMatch) {
            return {
                message: "📝 Please enter your TIN (Tax Identification Number):\n\n" +
                    "Format: 10-14 digits",
                metadata: { skill: 'identity-verification', awaitingTIN: true }
            };
        }

        const tin = tinMatch[1];
        const maskedTin = tin.substring(0, 4) + '****';
        logger.info('[Identity Skill] Verifying TIN', { userId: context.userId, maskedTin });

        if (!this.isMonoConfigured()) {
            return this.demoVerificationResponse('tin', maskedTin);
        }

        try {
            // Call Mono TIN Lookup API
            const response = await this.monoRequest<MonoLookupResponse>(
                '/lookup/tin',
                'POST',
                { number: tin, channel: 'tin' }
            );

            const data = response.data;
            
            await this.storeVerification(context.userId, 'tin', tin, data);

            return {
                message: `📋 TIN Verification ✅\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `*Name:* ${data?.taxpayer_name || 'N/A'}\n` +
                    `*TIN:* ${data?.tin || maskedTin}\n` +
                    `*Status:* ${data?.status || 'N/A'}\n` +
                    `*Tax Office:* ${data?.tax_office || 'N/A'}\n\n` +
                    `✅ TIN verified via FIRS JTB.\n\n` +
                    `💡 Your tax registration is confirmed.`,
                metadata: {
                    skill: 'identity-verification',
                    idType: 'tin',
                    status: 'verified',
                    verificationSource: 'mono',
                    data: {
                        fullName: data?.taxpayer_name,
                        registrationNumber: data?.tin
                    }
                }
            };
        } catch (error) {
            logger.error('[Identity Skill] TIN verification failed', { error });
            return {
                message: `📋 TIN Verification ❌\n\n` +
                    `TIN: ${maskedTin}\n\n` +
                    `❌ Verification failed: ${(error as Error).message}`,
                metadata: {
                    skill: 'identity-verification',
                    idType: 'tin',
                    status: 'failed',
                    error: (error as Error).message
                }
            };
        }
    }

    /**
     * Handle CAC verification
     */
    private async handleCACVerification(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        const cacMatch = message.match(/\b(?:RC|BN)?[\s-]?(\d{5,10})\b/i);
        
        if (!cacMatch) {
            return {
                message: "📝 Please enter your CAC Registration Number:\n\n" +
                    "Format: RC123456 or BN123456\n\n" +
                    "• RC = Company (Limited Liability)\n" +
                    "• BN = Business Name (Sole Prop/Partnership)",
                metadata: { skill: 'identity-verification', awaitingCAC: true }
            };
        }

        const regNumber = cacMatch[1];
        const prefix = message.toUpperCase().includes('BN') ? 'BN' : 'RC';
        const fullRegNumber = `${prefix}${regNumber}`;
        
        logger.info('[Identity Skill] Verifying CAC', { userId: context.userId, regNumber: fullRegNumber });

        if (!this.isMonoConfigured()) {
            return this.demoVerificationResponse('cac', fullRegNumber);
        }

        try {
            // Search for company
            const searchResponse = await this.monoRequest<MonoLookupResponse>(
                `/lookup/cac/search?query=${encodeURIComponent(regNumber)}`,
                'GET'
            );

            const companies = searchResponse.data || [];
            
            if (companies.length === 0) {
                return {
                    message: `🏢 CAC Verification\n\n` +
                        `Registration: ${fullRegNumber}\n\n` +
                        `❌ No company found with this registration number.\n\n` +
                        `Please check the number and try again.`,
                    metadata: {
                        skill: 'identity-verification',
                        idType: 'cac',
                        status: 'not_found'
                    }
                };
            }

            const company = companies[0];
            
            // Get directors if available
            let directorsText = '';
            if (company.id) {
                try {
                    const directorsResponse = await this.monoRequest<MonoLookupResponse>(
                        `/lookup/cac/company/${company.id}/directors`,
                        'GET'
                    );
                    const directors = directorsResponse.data || [];
                    if (directors.length > 0) {
                        directorsText = '\n\n*Directors:*\n' + 
                            directors.slice(0, 3).map((d: any) => `• ${d.name}`).join('\n');
                    }
                } catch (e) {
                    logger.warn('[Identity Skill] Could not fetch directors', { error: e });
                }
            }

            await this.storeVerification(context.userId, 'cac', fullRegNumber, company);

            return {
                message: `🏢 CAC Verification ✅\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `*Company:* ${company.name || 'N/A'}\n` +
                    `*RC Number:* ${company.rc_number || fullRegNumber}\n` +
                    `*Status:* ${company.status || 'Active'}\n` +
                    `*Type:* ${company.company_type || 'N/A'}\n` +
                    `*Address:* ${company.address || 'N/A'}` +
                    directorsText + `\n\n` +
                    `✅ Business verified via CAC Public Registry.`,
                metadata: {
                    skill: 'identity-verification',
                    idType: 'cac',
                    status: 'verified',
                    verificationSource: 'mono',
                    data: {
                        businessName: company.name,
                        registrationNumber: company.rc_number || fullRegNumber,
                        status: company.status,
                        address: company.address
                    }
                }
            };
        } catch (error) {
            logger.error('[Identity Skill] CAC verification failed', { error });
            return {
                message: `🏢 CAC Verification ❌\n\n` +
                    `Registration: ${fullRegNumber}\n\n` +
                    `❌ Verification failed: ${(error as Error).message}`,
                metadata: {
                    skill: 'identity-verification',
                    idType: 'cac',
                    status: 'failed',
                    error: (error as Error).message
                }
            };
        }
    }

    /**
     * Handle BVN verification
     */
    private async handleBVNVerification(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        const bvnMatch = message.match(/\b(\d{11})\b/);
        
        if (!bvnMatch) {
            return {
                message: "📝 Please enter your 11-digit BVN:\n\n" +
                    "⚠️ BVN verification requires additional consent.\n" +
                    "Only proceed if you consent to this verification.",
                buttons: [
                    [{ text: '✅ I Consent', callback_data: 'bvn_consent_yes' }],
                    [{ text: '❌ Cancel', callback_data: 'bvn_consent_no' }]
                ],
                metadata: { skill: 'identity-verification', awaitingBVN: true }
            };
        }

        const bvn = bvnMatch[1];
        const maskedBvn = bvn.substring(0, 4) + '****' + bvn.substring(8);
        logger.info('[Identity Skill] BVN verification requested', { userId: context.userId, maskedBvn });

        if (!this.isMonoConfigured()) {
            return this.demoVerificationResponse('bvn', maskedBvn);
        }

        try {
            // Call Mono BVN Accounts Lookup
            const response = await this.monoRequest<MonoLookupResponse>(
                '/lookup/bvn/accounts',
                'POST',
                { bvn }
            );

            const accounts = response.data || [];
            
            await this.storeVerification(context.userId, 'bvn', bvn, { accounts });

            const accountsList = accounts.slice(0, 3).map((a: any) => 
                `• ${a.bank_name}: ${a.account_number?.slice(-4) || '****'}`
            ).join('\n');

            return {
                message: `🏦 BVN Verification ✅\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `BVN: ${maskedBvn}\n\n` +
                    `*Linked Accounts:*\n${accountsList || 'No accounts found'}\n\n` +
                    `✅ BVN verified via NIBSS.\n\n` +
                    `⚠️ This data is protected under CBN regulations.`,
                metadata: {
                    skill: 'identity-verification',
                    idType: 'bvn',
                    status: 'verified',
                    verificationSource: 'mono',
                    accountCount: accounts.length
                }
            };
        } catch (error) {
            logger.error('[Identity Skill] BVN verification failed', { error });
            return {
                message: `🏦 BVN Verification ❌\n\n` +
                    `BVN: ${maskedBvn}\n\n` +
                    `❌ Verification failed: ${(error as Error).message}`,
                metadata: {
                    skill: 'identity-verification',
                    idType: 'bvn',
                    status: 'failed',
                    error: (error as Error).message
                }
            };
        }
    }

    /**
     * Store verification result in database
     */
    private async storeVerification(
        userId: string,
        idType: string,
        idValue: string,
        data: any
    ): Promise<void> {
        try {
            // Update user's verification data
            const { error } = await supabase
                .from('users')
                .update({
                    verification_status: 'verified',
                    verification_source: 'mono',
                    verified_at: new Date().toISOString(),
                    verification_data: {
                        [idType]: {
                            verified: true,
                            verifiedAt: new Date().toISOString(),
                            maskedId: idValue.length > 8 
                                ? idValue.substring(0, 4) + '****' + idValue.slice(-4)
                                : idValue.substring(0, 4) + '****',
                            data: data
                        }
                    }
                })
                .eq('id', userId);

            if (error) {
                logger.warn('[Identity Skill] Failed to store verification', { error, userId });
            } else {
                logger.info('[Identity Skill] Verification stored', { userId, idType });
            }
        } catch (e) {
            logger.error('[Identity Skill] Store verification error', { error: e });
        }
    }

    /**
     * Return demo response when Mono is not configured
     */
    private demoVerificationResponse(
        idType: string,
        maskedId: string
    ): Static<typeof MessageResponseSchema> {
        const typeLabels: Record<string, string> = {
            'nin': '🆔 NIN',
            'tin': '📋 TIN',
            'cac': '🏢 CAC',
            'bvn': '🏦 BVN'
        };

        return {
            message: `${typeLabels[idType] || '🆔'} Verification (Demo)\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `ID: ${maskedId}\n\n` +
                `⚠️ *Demo Mode*\n\n` +
                `MONO_SECRET_KEY is not configured.\n` +
                `Live verification is disabled.\n\n` +
                `💡 Add MONO_SECRET_KEY to Railway\n` +
                `environment variables to enable\n` +
                `real ID verification.`,
            metadata: {
                skill: 'identity-verification',
                idType,
                status: 'demo',
                monoConfigured: false
            }
        };
    }
}

export const identityVerificationSkill = new IdentityVerificationSkill();
