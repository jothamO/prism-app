import { supabase } from '../config/database';

export interface Project {
    id: string;
    user_id: string;
    business_id?: string;
    name: string;
    description?: string;
    source_person: string;
    source_relationship: string;
    budget: number;
    spent: number;
    is_agency_fund: boolean;
    tax_treatment: string;
    status: 'active' | 'completed' | 'closed';
    exclude_from_vat: boolean;
    created_at: string;
    updated_at: string;
    completed_at?: string;
    notes?: string;
}

export interface CreateProjectDTO {
    name: string;
    description?: string;
    source_person: string;
    source_relationship: string;
    budget: number;
    business_id?: string;
    is_agency_fund?: boolean;
    notes?: string;
}

export interface ProjectExpenseDTO {
    amount: number;
    description: string;
    category?: string;
    date?: string;
    supplier_name?: string;
}

export interface ProjectSummary {
    project: Project;
    balance_remaining: number;
    expense_count: number;
    receipt_count: number;
    verified_receipt_count: number;
    expenses: any[];
    taxable_excess?: number;
    estimated_tax?: number;
}

export interface ProjectCompletion {
    project: Project;
    total_spent: number;
    excess: number;
    is_taxable: boolean;
    estimated_tax: number;
    tax_rate: number;
}

export class ProjectService {
    /**
     * Create a new project fund (Section 5 - Agency Funds)
     */
    async createProject(userId: string, data: CreateProjectDTO): Promise<Project> {
        const { data: project, error } = await supabase
            .from('projects')
            .insert({
                user_id: userId,
                name: data.name,
                description: data.description,
                source_person: data.source_person,
                source_relationship: data.source_relationship,
                budget: data.budget,
                business_id: data.business_id,
                is_agency_fund: data.is_agency_fund ?? true,
                tax_treatment: 'non_taxable',
                status: 'active',
                exclude_from_vat: true,
                notes: data.notes
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating project:', error);
            throw new Error(`Failed to create project: ${error.message}`);
        }

        return project as Project;
    }

    /**
     * Get project by ID
     */
    async getProject(projectId: string): Promise<Project | null> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error) {
            console.error('Error getting project:', error);
            return null;
        }

        return data as Project;
    }

    /**
     * Get all active projects for a user
     */
    async getActiveProjects(userId: string): Promise<Project[]> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error getting active projects:', error);
            return [];
        }

        return data as Project[];
    }

    /**
     * Get all projects for a user
     */
    async getAllProjects(userId: string): Promise<Project[]> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error getting projects:', error);
            return [];
        }

        return data as Project[];
    }

    /**
     * Record an expense against a project
     */
    async recordProjectExpense(
        userId: string,
        projectId: string,
        expense: ProjectExpenseDTO
    ): Promise<any> {
        const project = await this.getProject(projectId);
        if (!project) {
            throw new Error('Project not found');
        }

        if (project.status !== 'active') {
            throw new Error('Cannot add expenses to a completed/closed project');
        }

        const period = new Date().toISOString().slice(0, 7);

        const { data: expenseRecord, error } = await supabase
            .from('expenses')
            .insert({
                user_id: userId,
                project_id: projectId,
                is_project_expense: true,
                amount: expense.amount,
                description: expense.description,
                category: expense.category || 'project_expense',
                date: expense.date || new Date().toISOString().split('T')[0],
                supplier_name: expense.supplier_name,
                period: period,
                can_claim_input_vat: false, // Project expenses are not VAT deductible
                vat_amount: 0,
                vat_rate: 0
            })
            .select()
            .single();

        if (error) {
            console.error('Error recording project expense:', error);
            throw new Error(`Failed to record expense: ${error.message}`);
        }

        return expenseRecord;
    }

    /**
     * Get project summary with expenses and balance
     */
    async getProjectSummary(projectId: string): Promise<ProjectSummary | null> {
        const project = await this.getProject(projectId);
        if (!project) return null;

        // Get expenses
        const { data: expenses } = await supabase
            .from('expenses')
            .select('*')
            .eq('project_id', projectId)
            .eq('is_project_expense', true)
            .order('date', { ascending: false });

        // Get receipts
        const { data: receipts } = await supabase
            .from('project_receipts')
            .select('*')
            .eq('project_id', projectId);

        const expenseCount = expenses?.length || 0;
        const receiptCount = receipts?.length || 0;
        const verifiedReceiptCount = receipts?.filter(r => r.is_verified).length || 0;
        const balanceRemaining = project.budget - project.spent;

        // Calculate taxable excess if project is completed
        let taxable_excess: number | undefined;
        let estimated_tax: number | undefined;

        if (project.status === 'completed' && balanceRemaining > 0) {
            taxable_excess = balanceRemaining;
            // Use graduated PIT rates (simplified)
            estimated_tax = this.calculatePITOnExcess(taxable_excess);
        }

        return {
            project,
            balance_remaining: balanceRemaining,
            expense_count: expenseCount,
            receipt_count: receiptCount,
            verified_receipt_count: verifiedReceiptCount,
            expenses: expenses || [],
            taxable_excess,
            estimated_tax
        };
    }

    /**
     * Get current balance for a project
     */
    async getProjectBalance(projectId: string): Promise<{ budget: number; spent: number; remaining: number } | null> {
        const project = await this.getProject(projectId);
        if (!project) return null;

        return {
            budget: project.budget,
            spent: project.spent,
            remaining: project.budget - project.spent
        };
    }

    /**
     * Complete a project and calculate taxable excess (Section 4(1)(k))
     */
    async completeProject(projectId: string): Promise<ProjectCompletion> {
        const project = await this.getProject(projectId);
        if (!project) {
            throw new Error('Project not found');
        }

        if (project.status !== 'active') {
            throw new Error('Project is already completed or closed');
        }

        const excess = project.budget - project.spent;
        const isTaxable = excess > 0 && project.is_agency_fund;

        // Calculate estimated tax using PIT rates
        const estimatedTax = isTaxable ? this.calculatePITOnExcess(excess) : 0;
        const taxRate = excess > 0 ? (estimatedTax / excess) * 100 : 0;

        // Update project status
        const { data: updatedProject, error } = await supabase
            .from('projects')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                tax_treatment: isTaxable ? 'taxable_excess' : 'non_taxable'
            })
            .eq('id', projectId)
            .select()
            .single();

        if (error) {
            console.error('Error completing project:', error);
            throw new Error(`Failed to complete project: ${error.message}`);
        }

        return {
            project: updatedProject as Project,
            total_spent: project.spent,
            excess,
            is_taxable: isTaxable,
            estimated_tax: estimatedTax,
            tax_rate: taxRate
        };
    }

    /**
     * Attach a receipt to a project expense
     */
    async attachReceipt(
        projectId: string,
        expenseId: string,
        receiptData: {
            receipt_url: string;
            vendor_name?: string;
            amount: number;
            date: string;
            description?: string;
            ocr_extracted_amount?: number;
            ocr_extracted_vendor?: string;
            ocr_confidence?: number;
            bank_reference?: string;
        }
    ): Promise<any> {
        const { data: receipt, error } = await supabase
            .from('project_receipts')
            .insert({
                project_id: projectId,
                expense_id: expenseId,
                receipt_url: receiptData.receipt_url,
                vendor_name: receiptData.vendor_name,
                amount: receiptData.amount,
                date: receiptData.date,
                description: receiptData.description,
                ocr_extracted_amount: receiptData.ocr_extracted_amount,
                ocr_extracted_vendor: receiptData.ocr_extracted_vendor,
                ocr_confidence: receiptData.ocr_confidence,
                bank_reference: receiptData.bank_reference,
                is_verified: receiptData.ocr_confidence ? receiptData.ocr_confidence >= 0.8 : false,
                verification_method: receiptData.ocr_confidence ? 'ocr_auto' : 'manual'
            })
            .select()
            .single();

        if (error) {
            console.error('Error attaching receipt:', error);
            throw new Error(`Failed to attach receipt: ${error.message}`);
        }

        return receipt;
    }

    /**
     * Link a non-revenue transaction (the incoming fund) to a project
     */
    async linkFundToProject(transactionId: string, projectId: string): Promise<void> {
        const { error } = await supabase
            .from('non_revenue_transactions')
            .update({
                project_id: projectId,
                is_project_fund: true
            })
            .eq('id', transactionId);

        if (error) {
            console.error('Error linking fund to project:', error);
            throw new Error(`Failed to link fund: ${error.message}`);
        }
    }

    /**
     * Calculate Personal Income Tax on excess using Nigeria Tax Act 2025 rates
     * Section 58 - Progressive PIT bands
     */
    private calculatePITOnExcess(excess: number): number {
        // Nigeria Tax Act 2025 PIT bands (annual)
        const bands = [
            { limit: 800000, rate: 0 },      // First ₦800,000 - 0%
            { limit: 2400000, rate: 0.15 },  // Next ₦1,600,000 - 15%
            { limit: 4000000, rate: 0.175 }, // Next ₦1,600,000 - 17.5%
            { limit: 6400000, rate: 0.20 },  // Next ₦2,400,000 - 20%
            { limit: 10400000, rate: 0.225 }, // Next ₦4,000,000 - 22.5%
            { limit: Infinity, rate: 0.25 }   // Above ₦10,400,000 - 25%
        ];

        let tax = 0;
        let remaining = excess;
        let previousLimit = 0;

        for (const band of bands) {
            const bandAmount = Math.min(remaining, band.limit - previousLimit);
            if (bandAmount <= 0) break;
            
            tax += bandAmount * band.rate;
            remaining -= bandAmount;
            previousLimit = band.limit;
        }

        return Math.round(tax * 100) / 100;
    }

    /**
     * Find project by name (partial match)
     */
    async findProjectByName(userId: string, namePart: string): Promise<Project[]> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .ilike('name', `%${namePart}%`)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error finding project:', error);
            return [];
        }

        return data as Project[];
    }
}

export const projectService = new ProjectService();
