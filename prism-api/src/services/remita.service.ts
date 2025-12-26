export class RemitaService {
    async generateRRR(data: any) {
        console.log('Generating RRR for:', data);
        // Implementation with Remita API would go here
        return 'RRR-1234-5678-9012';
    }
}

export const remitaService = new RemitaService();
