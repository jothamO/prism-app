import fetch from 'node-fetch';

export class WhatsAppInteractiveService {
    private accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
    private phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    private baseUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;

    /**
     * Send Reply Buttons (max 3 buttons)
     * Use for binary/ternary choices like "Personal vs Business"
     */
    async sendReplyButtons(to: string, text: string, buttons: Array<{
        id: string;
        title: string; // Max 20 characters
    }>) {
        if (buttons.length > 3) {
            throw new Error('WhatsApp Reply Buttons limited to 3. Use List Messages for more options.');
        }

        // Validate button titles
        buttons.forEach(btn => {
            if (btn.title.length > 20) {
                console.warn(`Button title "${btn.title}" exceeds 20 chars, truncating`);
                btn.title = btn.title.substring(0, 20);
            }
        });

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to.replace(/\D/g, ''), // Remove non-digits
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text },
                    action: {
                        buttons: buttons.map(btn => ({
                            type: 'reply',
                            reply: {
                                id: btn.id,
                                title: btn.title
                            }
                        }))
                    }
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
        }

        return response.json();
    }

    /**
     * Send List Message (max 10 total rows across all sections)
     * Use for multiple choice selections like expense categories
     */
    async sendListMessage(to: string, options: {
        header?: string;
        body: string;
        footer?: string;
        buttonText: string; // Text shown on the list button
        sections: Array<{
            title: string;
            rows: Array<{
                id: string;
                title: string; // Max 24 characters
                description?: string; // Max 72 characters
            }>;
        }>;
    }) {
        // Validate total rows <= 10
        const totalRows = options.sections.reduce((sum, s) => sum + s.rows.length, 0);
        if (totalRows > 10) {
            throw new Error(`WhatsApp List Messages limited to 10 total rows, got ${totalRows}`);
        }

        // Validate and truncate text limits
        if (options.buttonText.length > 20) {
            console.warn(`Button text "${options.buttonText}" exceeds 20 chars, truncating`);
            options.buttonText = options.buttonText.substring(0, 20);
        }

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to.replace(/\D/g, ''),
                type: 'interactive',
                interactive: {
                    type: 'list',
                    header: options.header ? { type: 'text', text: options.header } : undefined,
                    body: { text: options.body },
                    footer: options.footer ? { text: options.footer } : undefined,
                    action: {
                        button: options.buttonText,
                        sections: options.sections.map(section => ({
                            title: section.title.substring(0, 24),
                            rows: section.rows.map(row => ({
                                id: row.id,
                                title: row.title.substring(0, 24),
                                description: row.description?.substring(0, 72)
                            }))
                        }))
                    }
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
        }

        return response.json();
    }

    /**
     * Handle button/list response from webhook
     */
    handleButtonResponse(webhookData: any): {
        userId: string;
        buttonId: string;
        buttonText: string;
        type: 'button' | 'list';
    } | null {
        try {
            const message = webhookData.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

            if (!message || message.type !== 'interactive') {
                return null;
            }

            const interactive = message.interactive;

            // Check for button reply
            if (interactive.button_reply) {
                return {
                    userId: message.from,
                    buttonId: interactive.button_reply.id,
                    buttonText: interactive.button_reply.title,
                    type: 'button'
                };
            }

            // Check for list reply
            if (interactive.list_reply) {
                return {
                    userId: message.from,
                    buttonId: interactive.list_reply.id,
                    buttonText: interactive.list_reply.title,
                    type: 'list'
                };
            }

            return null;
        } catch (error) {
            console.error('Error parsing button response:', error);
            return null;
        }
    }
}

export const whatsappInteractiveService = new WhatsAppInteractiveService();
