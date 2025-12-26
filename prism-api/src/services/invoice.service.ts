import { supabase } from '../config/database';
import { vatCalculatorService } from './vat-calculator.service';

export class InvoiceService {
    async createFromTransaction(userId: string, accountId: string, txn: any) {
        const { subtotal, vatAmount, total } = vatCalculatorService.calculateVAT(txn.amount, true);

        const { data, error } = await supabase.from('invoices').insert({
            user_id: userId,
            account_id: accountId,
            date: txn.date,
            customer_name: txn.narration, // Best guess from bank narration
            subtotal,
            vat_amount: vatAmount,
            total,
            period: new Date(txn.date).toISOString().slice(0, 7),
            status: 'pending_remittance',
            source: 'bank_sync',
            bank_reference: txn.reference,
            items: [{
                description: txn.narration,
                quantity: 1,
                unitPrice: subtotal,
                total: subtotal
            }]
        }).select().single();

        if (error) throw error;
        return data;
    }

    async create(data: any) {
        const { error, data: invoice } = await supabase.from('invoices').insert(data).select().single();
        if (error) throw error;
        return invoice;
    }
}

export const invoiceService = new InvoiceService();
