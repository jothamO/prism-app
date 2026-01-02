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
        try {
            const response = await fetch(`${this.gatewayUrl}/health`);
            return await response.json();
        } catch (error) {
            console.error('[Gateway Client] Health check failed:', error);
            throw error;
        }
    }
}

// Export singleton instance
const GATEWAY_URL = import.meta.env.VITE_RAILWAY_GATEWAY_URL || 'https://your-gateway.railway.app';
export const gatewayClient = new GatewayClient(GATEWAY_URL);
