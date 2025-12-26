import fetch from 'node-fetch';
import FormData from 'form-data';

export class WhatsAppService {
    private apiKey = process.env.DIALOG360_API_KEY!;
    private baseUrl = 'https://waba.360dialog.io/v1';

    async sendMessage(to: string, text: string) {
        return fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'D360-API-KEY': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: to.replace(/\D/g, ''),
                type: 'text',
                text: { body: text }
            })
        });
    }

    async sendDocument(to: string, buffer: Buffer, options: {
        filename: string;
        caption?: string;
    }) {
        const formData = new FormData();
        formData.append('file', buffer, options.filename);

        const uploadRes = await fetch(`${this.baseUrl}/media`, {
            method: 'POST',
            headers: { 'D360-API-KEY': this.apiKey },
            body: formData
        });

        const { media } = await uploadRes.json() as any;

        return fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'D360-API-KEY': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: to.replace(/\D/g, ''),
                type: 'document',
                document: {
                    id: media[0].id,
                    filename: options.filename,
                    caption: options.caption
                }
            })
        });
    }

    async sendInteractiveButtons(to: string, text: string, buttons: Array<{
        id: string;
        title: string;
    }>) {
        return fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'D360-API-KEY': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: to.replace(/\D/g, ''),
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text },
                    action: {
                        buttons: buttons.map(btn => ({
                            type: 'reply',
                            reply: { id: btn.id, title: btn.title }
                        }))
                    }
                }
            })
        });
    }

    async downloadMedia(mediaId: string): Promise<Buffer> {
        const res = await fetch(`${this.baseUrl}/media/${mediaId}`, {
            headers: { 'D360-API-KEY': this.apiKey }
        });
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}

export const whatsappService = new WhatsAppService();
