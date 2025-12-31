import { Queue, Worker } from 'bullmq';
import { supabase } from '../config/database';
import { pdfGeneratorService } from '../services/pdf-generator.service';
import { whatsappService } from '../services/whatsapp.service';
import { emailService } from '../services/email.service';
import { remitaService } from '../services/remita.service';
import { redisConnection } from '../config/redis';

export const filingQueue = new Queue('auto-filing', { connection: redisConnection });

const worker = new Worker('auto-filing', async (job) => {
    if (job.name === 'monthly-filing-check') {
        // Scheduler job: spawn individual user jobs
        console.log('📅 Running monthly filing check...');

        const { data: users } = await supabase
            .from('users')
            .select('id')
            .eq('subscription_status', 'active')
            .eq('has_active_vat', true);

        const today = new Date();
        const period = new Date(today.getFullYear(), today.getMonth() - 1)
            .toISOString().slice(0, 7);

        for (const user of users || []) {
            await filingQueue.add('file-vat', {
                userId: user.id,
                period
            });
        }

        return { success: true, usersQueued: users?.length || 0 };
    }

    // Individual user filing job
    const { userId, period } = job.data;

    console.log(`📝 Auto-filing VAT for user ${userId}, period ${period}`);

    try {
        const { data: invoices } = await supabase
            .from('invoices')
            .select('*')
            .eq('user_id', userId)
            .eq('period', period)
            .eq('status', 'pending_remittance');

        if (!invoices || invoices.length === 0) {
            return { success: false, reason: 'No invoices to file' };
        }

        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        const { data: expenses } = await supabase
            .from('expenses')
            .select('*')
            .eq('user_id', userId)
            .eq('period', period);

        const totalOutputVAT = invoices.reduce((sum, inv) => sum + inv.vat_amount, 0);
        const totalInputVAT = expenses?.reduce((sum, exp) => sum + exp.vat_amount, 0) || 0;
        const netVATPayable = totalOutputVAT - totalInputVAT;

        const pdfBuffer = await pdfGeneratorService.generateVATReturn({
            tin: user.tin,
            businessName: user.business_name,
            period,
            invoices,
            expenses: expenses || [],
            totalOutputVAT,
            totalInputVAT,
            netVATPayable
        });

        await supabase.storage
            .from('filings')
            .upload(`${userId}/${period}/vat-return.pdf`, pdfBuffer);

        await emailService.sendToFIRS({
            tin: user.tin,
            businessName: user.business_name,
            taxType: 'VAT',
            period,
            amount: netVATPayable,
            userEmail: user.email,
            pdfBuffer
        });

        const remitaRRR = await remitaService.generateRRR({
            tin: user.tin,
            amount: netVATPayable,
            taxType: 'VAT'
        });

        const { data: filing } = await supabase.from('filings').insert({
            user_id: userId,
            period,
            output_vat: totalOutputVAT,
            input_vat: totalInputVAT,
            net_amount: netVATPayable,
            status: 'submitted',
            submitted_at: new Date(),
            remita_rrr: remitaRRR,
            invoice_count: invoices.length,
            expense_count: expenses?.length || 0,
            auto_filed: true
        }).select().single();

        await supabase.from('invoices').update({
            status: 'remitted',
            // remitted_at: new Date() // Assuming column exists or handled by trigger
        }).in('id', invoices.map(i => i.id));

        await whatsappService.sendMessage(user.whatsapp_number, `
✅ ${period.toUpperCase()} VAT FILED AUTOMATICALLY!

Sales: ₦${(totalOutputVAT / 0.075 * 1.075).toLocaleString()}
Output VAT: ₦${totalOutputVAT.toLocaleString()}
Input VAT: ₦${totalInputVAT.toLocaleString()}
NET PAYABLE: ₦${netVATPayable.toLocaleString()}

📧 Filed to FIRS
📄 Copy sent to ${user.email}

💰 PAY NOW:
Remita RRR: ${remitaRRR}

Reply "PAID" after payment.
    `);

        return { success: true, filingId: filing.id };

    } catch (error: any) {
        console.error(`❌ Auto-filing failed:`, error);
        throw error;
    }
}, { connection: redisConnection });

export async function scheduleMonthlyFilings() {
    // Clean up old repeatable jobs
    const repeatableJobs = await filingQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await filingQueue.removeRepeatableByKey(job.key);
    }

    // Schedule monthly filing check for 14th of every month at 00:00
    // CRITICAL: Tax Act 2025 Section 155 requires VAT remittance by 14th (changed from 21st)
    await filingQueue.add('monthly-filing-check', {}, {
        repeat: { pattern: '0 0 14 * *' } // Changed from '0 0 21 * *' for compliance
    });

    console.log('📅 Scheduled monthly VAT filings for 14th of each month (Tax Act 2025 compliance)');
}
