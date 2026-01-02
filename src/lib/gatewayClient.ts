/**
 * Gateway Client Library
 * Use this to communicate with the Railway Gateway from frontend code
 */

export interface GatewayMessageRequest {
    userId: string;
    platform: 'telegram' | 'whatsapp' | 'simulator';
    message: string;
    idempotencyKey: string;
    metadata?: Record<string, any>;
}

export interface GatewayMessageResponse {
    message: string;
    buttons?: { text: string; callback_data: string }[][];
    metadata?: Record<string, any>;
}

export class GatewayClient {
    private gatewayUrl: string;

    constructor(gatewayUrl: string) {
        this.gatewayUrl = gatewayUrl;
    }

    async sendMessage(request: GatewayMessageRequest): Promise<GatewayMessageResponse> {
        try {
            const response = await fetch(`${this.gatewayUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gateway error: ${response.status} - ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[Gateway Client] Error:', error);
            throw error;
        }
    }

    async uploadDocument(
        userId: string,
        platform: 'telegram' | 'whatsapp' | 'simulator',
        documentUrl: string,
        documentType: 'bank_statement' | 'invoice' | 'receipt' | 'tax_document'
    ): Promise<GatewayMessageResponse> {
        try {
            const response = await fetch(`${this.gatewayUrl}/document/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId,
                    platform,
                    documentUrl,
                    documentType,
                    idempotencyKey: `${platform}_${userId}_${Date.now()}`,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gateway error: ${response.status} - ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[Gateway Client] Document upload error:', error);
            throw error;
        }
    }

    async checkHealth(): Promise<any> {
        if (!this.gatewayUrl || this.gatewayUrl === 'NOT_CONFIGURED') {
            throw new Error('Gateway URL not configured');
        }
        try {
            const response = await fetch(`${this.gatewayUrl}/health`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[Gateway Client] Health check failed:', error);
            throw error;
        }
    }

    getUrl(): string {
        return this.gatewayUrl;
    }
}

// Export singleton instance
// The RAILWAY_GATEWAY_URL should be set in Railway env or via VITE_ prefix for frontend
const GATEWAY_URL = import.meta.env.VITE_RAILWAY_GATEWAY_URL || 'NOT_CONFIGURED';
export const gatewayClient = new GatewayClient(GATEWAY_URL);
export { GATEWAY_URL };
