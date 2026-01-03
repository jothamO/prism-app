/**
 * Shared Gateway Client for Edge Functions
 * Use this to route requests to the Railway Gateway
 */

export interface GatewayRequest {
    userId: string;
    platform: 'telegram' | 'whatsapp' | 'simulator';
    message: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
}

export interface GatewayDocumentRequest {
    userId: string;
    platform: 'telegram' | 'whatsapp' | 'simulator';
    documentUrl: string;
    documentType: 'bank_statement' | 'invoice' | 'receipt' | 'tax_document';
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
}

export interface GatewayResponse {
    message: string;
    buttons?: Array<Array<{ text: string; callback_data: string }>>;
    metadata?: Record<string, unknown>;
}

export class GatewayClient {
    private gatewayUrl: string;

    constructor(gatewayUrl: string) {
        this.gatewayUrl = gatewayUrl;
    }

    /**
     * Check if gateway is available
     */
    isConfigured(): boolean {
        return !!this.gatewayUrl && this.gatewayUrl !== 'NOT_CONFIGURED';
    }

    /**
     * Send a chat message to the gateway
     */
    async sendMessage(request: GatewayRequest): Promise<GatewayResponse> {
        if (!this.isConfigured()) {
            throw new Error('Gateway URL not configured');
        }

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
    }

    /**
     * Send a document for processing
     */
    async processDocument(request: GatewayDocumentRequest): Promise<GatewayResponse> {
        if (!this.isConfigured()) {
            throw new Error('Gateway URL not configured');
        }

        const response = await fetch(`${this.gatewayUrl}/document/process`, {
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
    }

    /**
     * Check gateway health
     */
    async checkHealth(): Promise<{
        status: string;
        uptime: number;
        sessions: { size: number; max: number };
    }> {
        if (!this.isConfigured()) {
            throw new Error('Gateway URL not configured');
        }

        const response = await fetch(`${this.gatewayUrl}/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }

        return await response.json();
    }
}

/**
 * Create a gateway client instance
 * Call this in your edge function with the RAILWAY_GATEWAY_URL secret
 */
export function createGatewayClient(): GatewayClient {
    const gatewayUrl = Deno.env.get('RAILWAY_GATEWAY_URL') || '';
    return new GatewayClient(gatewayUrl);
}

/**
 * Helper to check if gateway should be used
 */
export function shouldUseGateway(): boolean {
    const gatewayUrl = Deno.env.get('RAILWAY_GATEWAY_URL');
    return !!gatewayUrl && gatewayUrl !== 'NOT_CONFIGURED';
}
