export class EmailService {
    async sendToFIRS(data: any) {
        console.log('Sending email to FIRS:', data);
        // Implementation with SendGrid would go here
    }
}

export const emailService = new EmailService();
