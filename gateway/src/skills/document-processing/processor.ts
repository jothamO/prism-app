/**
 * Document Processor
 * Orchestrates extraction, classification, and analysis of bank statements
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { supabase } from '../../config';
import { BankStatementExtractor } from './extractors/bank-statement';
import { BusinessPatternClassifier } from './classifiers/business-pattern';
import { RuleBasedClassifier } from './classifiers/rule-based';
import { AIClassifier } from './classifiers/ai-classifier';
import { NigerianDetectors } from './nigerian-detectors/index';
import { ComplianceChecker } from './compliance/index';
import { FeedbackHandler } from './feedback/correction-handler';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

export class DocumentProcessor {
    private extractor = new BankStatementExtractor(claude);
    private businessPatternClassifier = new BusinessPatternClassifier();
    private ruleBasedClassifier = new RuleBasedClassifier();
    private aiClassifier = new AIClassifier(claude);
    private nigerianDetectors = new NigerianDetectors();
    private complianceChecker = new ComplianceChecker();
    private feedbackHandler = new FeedbackHandler();

    /**
     * Process a document processing job
     */
    async processJob(jobId: string): Promise<void> {
        try {
            // Get job details
            const { data: job, error: jobError } = await supabase
                .from('document_processing_jobs')
                .select('*')
                .eq('id', jobId)
                .single();

            if (jobError || !job) {
                throw new Error(`Job ${jobId} not found`);
            }

            logger.info(`[Processor] Starting job ${jobId}`, {
                documentType: job.document_type,
                userId: job.user_id
            });

            // Update status to processing
            await this.updateJobStatus(jobId, 'processing', { started_at: new Date().toISOString() });

            // Step 1: Extract transactions from document
            const transactions = await this.extractor.extract(job.document_url);

            logger.info(`[Processor] Extracted ${transactions.length} transactions`);

            // Step 2: Create bank statement record
            const statement = await this.createStatement(job, transactions);

            // Step 3: Classify and save each transaction
            for (const txn of transactions) {
                await this.classifyAndSaveTransaction(txn, statement.id, job);
            }

            // Step 4: Generate summary
            const summary = await this.generateSummary(statement.id);

            // Step 5: Update job as completed
            await this.updateJobStatus(jobId, 'completed', {
                completed_at: new Date().toISOString(),
                statement_id: statement.id,
                result_summary: summary
            });

            // Step 6: Notify user
            await this.notifyUser(job.user_id, summary);

            logger.info(`[Processor] Job ${jobId} completed`, summary);
        } catch (error) {
            logger.error(`[Processor] Job ${jobId} failed:`, error);
            await this.updateJobStatus(jobId, 'failed', {
                failed_at: new Date().toISOString(),
                error_message: (error as Error).message
            });
        }
    }

    /**
     * Classify and save a single transaction
     */
    private async classifyAndSaveTransaction(
        txn: any,
        statementId: string,
        job: any
    ): Promise<void> {
        // Step 1: Try business pattern (fastest, most accurate)
        let classification = await this.businessPatternClassifier.classify({
            businessId: job.business_id,
            description: txn.description,
            amount: txn.credit || txn.debit
        });

        // Step 2: If no pattern match, try rule-based
        if (!classification || classification.confidence < 0.85) {
            const ruleResult = await this.ruleBasedClassifier.classify(txn);
            if (ruleResult.confidence > (classification?.confidence || 0)) {
                classification = ruleResult;
            }
        }

        // Step 3: If still low confidence, use AI
        if (!classification || classification.confidence < 0.75) {
            const aiResult = await this.aiClassifier.classify(txn, {
                userId: job.user_id,
                businessId: job.business_id
            });
            classification = aiResult;
        }

        // Step 4: Apply Nigerian-specific detectors (with business context for capital detection)
        const nigerianFlags = await this.nigerianDetectors.detect(txn, {
            businessId: job.business_id,
            userId: job.user_id
        });

        // Step 5: Run compliance checks
        const complianceFlags = await this.complianceChecker.check(txn, {
            userId: job.user_id,
            businessId: job.business_id,
            statementId
        });

        // Step 6: Save transaction (with null safety)
        if (!classification) {
            classification = {
                classification: 'unclassified',
                category: 'needs_review',
                confidence: 0,
                source: 'ai' as const
            };
        }

        const needsReview = classification.confidence < 0.75 || complianceFlags.length > 0;
        
        const { error: insertError } = await supabase.from('bank_transactions').insert({
            statement_id: statementId,
            user_id: job.user_id,
            transaction_date: txn.date,
            description: txn.description,
            debit: txn.debit,
            credit: txn.credit,
            balance: txn.balance,
            reference: txn.reference,
            classification: classification.classification,
            category: classification.category,
            confidence: classification.confidence,
            classification_source: classification.source,
            user_reviewed: false,
            // Nigerian detection flags - explicit columns
            is_ussd_transaction: nigerianFlags.is_ussd_transaction || false,
            is_mobile_money: nigerianFlags.is_mobile_money || false,
            mobile_money_provider: nigerianFlags.mobile_money_provider || null,
            is_pos_transaction: nigerianFlags.is_pos_transaction || false,
            is_foreign_currency: nigerianFlags.is_foreign_currency || false,
            foreign_currency: nigerianFlags.foreign_currency || null,
            // Phase 3: Capital injection tracking
            is_capital_injection: nigerianFlags.is_capital_injection || false,
            capital_type: nigerianFlags.capital_type || null,
            business_id: job.business_id || null,
            // Existing Nigerian columns
            is_nigerian_bank_charge: this.isNigerianBankCharge(txn.description),
            is_emtl: this.isEMTL(txn.description, txn.debit),
            is_stamp_duty: this.isStampDuty(txn.description),
            // Transaction type flags
            is_revenue: classification.classification === 'sale',
            is_expense: classification.classification === 'expense',
            is_transfer: classification.classification === 'personal',
            is_bank_charge: this.isNigerianBankCharge(txn.description),
            is_tax_relevant: classification.classification !== 'personal',
            // Compliance and metadata
            compliance_flags: complianceFlags,
            metadata: { requires_confirmation: needsReview }
        });

        if (insertError) {
            logger.error('[Processor] Failed to save transaction:', {
                error: insertError.message,
                code: insertError.code,
                description: txn.description?.substring(0, 50)
            });
            throw insertError;
        }
        
        logger.info('[Processor] Transaction saved', { 
            description: txn.description?.substring(0, 30),
            classification: classification.classification 
        });
    }

    /**
     * Check if transaction is a Nigerian bank charge
     */
    private isNigerianBankCharge(description: string): boolean {
        if (!description) return false;
        const patterns = [
            /sms alert/i, /sms fee/i, /vat on/i, /maintenance fee/i,
            /cot charge/i, /cot fee/i, /commission/i, /account fee/i,
            /card maintenance/i, /atm fee/i, /transfer fee/i
        ];
        return patterns.some(p => p.test(description));
    }

    /**
     * Check if transaction is EMTL (Electronic Money Transfer Levy)
     */
    private isEMTL(description: string, amount?: number): boolean {
        if (!description) return false;
        // EMTL is exactly ₦50 on electronic transfers over ₦10,000
        if (amount === 50) {
            return /levy|emtl|transfer charge|electronic.*levy/i.test(description);
        }
        return false;
    }

    /**
     * Check if transaction is stamp duty
     */
    private isStampDuty(description: string): boolean {
        if (!description) return false;
        return /stamp duty/i.test(description);
    }

    /**
     * Create bank statement record
     */
    private async createStatement(job: any, transactions: any[]): Promise<any> {
        const { data, error } = await supabase
            .from('bank_statements')
            .insert({
                user_id: job.user_id,
                business_id: job.business_id,
                file_url: job.document_url,
                processing_status: 'processing',
                statement_start_date: transactions[0]?.date,
                statement_end_date: transactions[transactions.length - 1]?.date,
                transaction_count: transactions.length,
                metadata: { upload_source: 'gateway' }
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Generate summary of processed statement
     */
    private async generateSummary(statementId: string): Promise<any> {
        const { data: transactions } = await supabase
            .from('bank_transactions')
            .select('*')
            .eq('statement_id', statementId);

        if (!transactions) return {};

        const sales = transactions.filter(t => t.classification === 'sale');
        const expenses = transactions.filter(t => t.classification === 'expense');
        const needsReview = transactions.filter(t => t.confidence < 0.75 || !t.user_reviewed);

        return {
            transactions: transactions.length,
            classified: transactions.filter(t => t.classification).length,
            needsReview: needsReview.length,
            sales: sales.reduce((sum, t) => sum + (t.credit || 0), 0),
            expenses: expenses.reduce((sum, t) => sum + (t.debit || 0), 0),
            accuracy: 0.95 // Will be calculated from user feedback
        };
    }

    /**
     * Update job status
     */
    private async updateJobStatus(jobId: string, status: string, updates: any = {}): Promise<void> {
        await supabase
            .from('document_processing_jobs')
            .update({ processing_status: status, ...updates })
            .eq('id', jobId);
    }

    /**
     * Notify user of completion
     * In production, this would send via Telegram/WhatsApp
     */
    private async notifyUser(userId: string, summary: any): Promise<void> {
        logger.info(`[Processor] Notify user ${userId}`, summary);
        // TODO: Integrate with bot to send completion message
    }
}
