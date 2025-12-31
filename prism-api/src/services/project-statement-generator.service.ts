/**
 * Project Statement PDF Generator Service
 * 
 * Generates detailed compliance reports for completed projects including:
 * - Financial summary (budget, spent, balance)
 * - Expense log with categories
 * - Receipt verification status
 * - Tax Act 2025 compliance checklist
 * - PIT calculation breakdown (if excess exists)
 */

import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface ProjectStatementData {
  project: any;
  expenses: any[];
  receipts: any[];
  user: any;
  business?: any;
}

export interface TaxBreakdown {
  taxableExcess: number;
  bands: Array<{
    band: string;
    taxableAmount: number;
    rate: number;
    tax: number;
  }>;
  totalTax: number;
}

export interface ComplianceChecklist {
  section5_agency: boolean;
  section20_wholly_exclusively: boolean;
  section32_receipts: { attached: number; total: number; percentage: number };
  section191_artificial: boolean;
  warnings: string[];
}

class ProjectStatementGeneratorService {
  private readonly TAX_BANDS = [
    { min: 0, max: 800000, rate: 0, description: 'First ₦800,000' },
    { min: 800000, max: 2400000, rate: 0.15, description: 'Next ₦1,600,000' },
    { min: 2400000, max: 4000000, rate: 0.175, description: 'Next ₦1,600,000' },
    { min: 4000000, max: 7200000, rate: 0.20, description: 'Next ₦3,200,000' },
    { min: 7200000, max: 12000000, rate: 0.225, description: 'Next ₦4,800,000' },
    { min: 12000000, max: Infinity, rate: 0.25, description: 'Above ₦12,000,000' },
  ];

  /**
   * Generate full project statement PDF
   */
  async generateProjectStatement(projectId: string): Promise<Buffer> {
    // Fetch all project data
    const data = await this.fetchProjectData(projectId);
    if (!data.project) {
      throw new Error('Project not found');
    }

    // Calculate tax breakdown
    const excess = data.project.budget - (data.project.spent || 0);
    const taxBreakdown = this.calculateTaxBreakdown(excess > 0 ? excess : 0);

    // Build compliance checklist
    const compliance = this.buildComplianceChecklist(data);

    // Generate PDF
    return this.buildPDF(data, taxBreakdown, compliance);
  }

  /**
   * Fetch all data needed for the statement
   */
  private async fetchProjectData(projectId: string): Promise<ProjectStatementData> {
    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError) throw projectError;

    // Fetch expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_project_expense', true)
      .order('date', { ascending: true });

    // Fetch receipts
    const { data: receipts } = await supabase
      .from('project_receipts')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: true });

    // Fetch user
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', project.user_id)
      .single();

    // Fetch business if applicable
    let business = null;
    if (project.business_id) {
      const { data: businessData } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', project.business_id)
        .single();
      business = businessData;
    }

    return {
      project,
      expenses: expenses || [],
      receipts: receipts || [],
      user,
      business,
    };
  }

  /**
   * Calculate PIT breakdown using Section 58 tax bands
   */
  calculateTaxBreakdown(excess: number): TaxBreakdown {
    if (excess <= 0) {
      return {
        taxableExcess: 0,
        bands: [],
        totalTax: 0,
      };
    }

    let remainingIncome = excess;
    let totalTax = 0;
    const bands: TaxBreakdown['bands'] = [];

    for (const band of this.TAX_BANDS) {
      if (remainingIncome <= 0) break;

      const bandSize = band.max - band.min;
      const taxableInBand = Math.min(remainingIncome, bandSize);
      const taxInBand = taxableInBand * band.rate;

      bands.push({
        band: band.description,
        taxableAmount: taxableInBand,
        rate: band.rate,
        tax: taxInBand,
      });

      totalTax += taxInBand;
      remainingIncome -= taxableInBand;
    }

    return {
      taxableExcess: excess,
      bands,
      totalTax: Math.round(totalTax * 100) / 100,
    };
  }

  /**
   * Build compliance checklist based on project data
   */
  private buildComplianceChecklist(data: ProjectStatementData): ComplianceChecklist {
    const warnings: string[] = [];

    // Section 5: Agency fund classification
    const section5_agency = data.project.is_agency_fund === true;
    if (!section5_agency) {
      warnings.push('Project not classified as agency fund');
    }

    // Section 20: Wholly & exclusively check
    const privateExpenses = data.expenses.filter(e => 
      this.isPrivateExpense(e.description)
    );
    const section20_wholly_exclusively = privateExpenses.length === 0;
    if (!section20_wholly_exclusively) {
      warnings.push(`${privateExpenses.length} expenses may contain private use items`);
    }

    // Section 32: Receipt compliance
    const expenseCount = data.expenses.length;
    const receiptCount = data.receipts.filter(r => r.is_verified).length;
    const receiptPercentage = expenseCount > 0 
      ? Math.round((receiptCount / expenseCount) * 100) 
      : 100;
    
    if (receiptPercentage < 100) {
      warnings.push(`Only ${receiptPercentage}% of expenses have verified receipts`);
    }

    // Section 191: Artificial transaction check
    const suspiciousExpenses = data.expenses.filter(e => 
      this.isSuspiciousExpense(e, data.project.budget)
    );
    const section191_artificial = suspiciousExpenses.length === 0;
    if (!section191_artificial) {
      warnings.push(`${suspiciousExpenses.length} expenses flagged for potential artificial transactions`);
    }

    return {
      section5_agency,
      section20_wholly_exclusively,
      section32_receipts: {
        attached: receiptCount,
        total: expenseCount,
        percentage: receiptPercentage,
      },
      section191_artificial,
      warnings,
    };
  }

  /**
   * Check if expense description suggests private use
   */
  private isPrivateExpense(description: string): boolean {
    const privateKeywords = [
      'personal', 'family dinner', 'entertainment', 'holiday',
      'vacation', 'shopping', 'clothes', 'groceries',
    ];
    const lowerDesc = description.toLowerCase();
    return privateKeywords.some(kw => lowerDesc.includes(kw));
  }

  /**
   * Check if expense is suspicious (Section 191)
   */
  private isSuspiciousExpense(expense: any, budget: number): boolean {
    // Flag if single expense is >50% of budget
    if (expense.amount > budget * 0.5) return true;

    // Flag if description is too vague
    const vaguePatterns = ['misc', 'various', 'payment', 'transfer'];
    const lowerDesc = expense.description.toLowerCase();
    if (vaguePatterns.some(p => lowerDesc.includes(p)) && expense.amount > 100000) {
      return true;
    }

    return false;
  }

  /**
   * Build the PDF document
   */
  private buildPDF(
    data: ProjectStatementData,
    taxBreakdown: TaxBreakdown,
    compliance: ComplianceChecklist
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50 });

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { project, expenses, receipts, user, business } = data;
      const excess = project.budget - (project.spent || 0);

      // ========== HEADER ==========
      doc.fontSize(20).font('Helvetica-Bold');
      doc.text('🇳🇬 PROJECT FUNDS STATEMENT', { align: 'center' });
      doc.fontSize(12).font('Helvetica');
      doc.text('Nigeria Tax Act 2025 Compliance Report', { align: 'center' });
      doc.moveDown();

      // Reference number
      const refNumber = `PRJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${project.id.slice(0, 8).toUpperCase()}`;
      doc.fontSize(10).text(`Reference: ${refNumber}`, { align: 'right' });
      doc.moveDown(2);

      // ========== PROJECT DETAILS ==========
      doc.fontSize(14).font('Helvetica-Bold').text('PROJECT DETAILS');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');

      const projectDetails = [
        ['Project Name:', project.name],
        ['Source:', `${project.source_person} (${project.source_relationship})`],
        ['Period:', `${this.formatDate(project.created_at)} - ${this.formatDate(project.completed_at || new Date().toISOString())}`],
        ['Status:', project.status.toUpperCase()],
      ];

      projectDetails.forEach(([label, value]) => {
        doc.text(`${label} ${value}`);
      });

      if (business) {
        doc.text(`Business: ${business.name} (${business.registration_number})`);
      }

      doc.moveDown(2);

      // ========== FINANCIAL SUMMARY ==========
      doc.fontSize(14).font('Helvetica-Bold').text('FINANCIAL SUMMARY');
      doc.moveDown(0.5);
      this.drawLine(doc);

      doc.fontSize(11).font('Helvetica');
      doc.text(`Budget Received:     ${this.formatCurrency(project.budget)}`);
      doc.text(`Total Expenses:      ${this.formatCurrency(project.spent || 0)}`);
      doc.text(`Balance (Excess):    ${this.formatCurrency(excess)}`);
      doc.moveDown(0.5);

      if (excess > 0) {
        doc.font('Helvetica-Bold').fillColor('red');
        doc.text(`⚠️ TAX TREATMENT: Taxable under Section 4(1)(k)`);
        doc.fillColor('black').font('Helvetica');
      } else {
        doc.fillColor('green').text('✓ No taxable excess');
        doc.fillColor('black');
      }

      doc.moveDown(2);

      // ========== EXPENSE LOG ==========
      doc.fontSize(14).font('Helvetica-Bold').text(`EXPENSE LOG (${expenses.length} items)`);
      doc.moveDown(0.5);
      this.drawLine(doc);

      doc.fontSize(9).font('Helvetica');
      doc.text('Date          | Description                          | Amount      | Receipt', { continued: false });
      this.drawLine(doc);

      expenses.slice(0, 20).forEach(expense => {
        const date = this.formatDate(expense.date);
        const desc = expense.description.substring(0, 35).padEnd(35);
        const amount = this.formatCurrency(expense.amount).padStart(12);
        const hasReceipt = receipts.some(r => r.expense_id === expense.id);
        const receiptStatus = hasReceipt ? '✓' : '✗';

        doc.text(`${date}  | ${desc} | ${amount} | ${receiptStatus}`);
      });

      if (expenses.length > 20) {
        doc.text(`... and ${expenses.length - 20} more expenses`);
      }

      doc.moveDown(2);

      // ========== COMPLIANCE CHECKLIST ==========
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('COMPLIANCE CHECKLIST');
      doc.moveDown(0.5);
      this.drawLine(doc);

      doc.fontSize(10).font('Helvetica');

      const checklistItems = [
        { label: 'Section 5: Agency fund properly classified', passed: compliance.section5_agency },
        { label: 'Section 20: All expenses wholly & exclusively', passed: compliance.section20_wholly_exclusively },
        { label: `Section 32: Receipts attached (${compliance.section32_receipts.attached}/${compliance.section32_receipts.total})`, passed: compliance.section32_receipts.percentage === 100 },
        { label: 'Section 191: No artificial transactions detected', passed: compliance.section191_artificial },
      ];

      checklistItems.forEach(item => {
        const icon = item.passed ? '✓' : '✗';
        const color = item.passed ? 'green' : 'red';
        doc.fillColor(color).text(`${icon} ${item.label}`);
      });

      doc.fillColor('black');

      if (compliance.warnings.length > 0) {
        doc.moveDown();
        doc.font('Helvetica-Bold').text('Warnings:');
        doc.font('Helvetica');
        compliance.warnings.forEach(warning => {
          doc.text(`• ${warning}`);
        });
      }

      doc.moveDown(2);

      // ========== TAX CALCULATION ==========
      if (taxBreakdown.taxableExcess > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('TAX CALCULATION (Section 58)');
        doc.moveDown(0.5);
        this.drawLine(doc);

        doc.fontSize(10).font('Helvetica');
        doc.text(`Taxable Excess: ${this.formatCurrency(taxBreakdown.taxableExcess)}`);
        doc.moveDown(0.5);

        doc.text('Band                    | Taxable       | Rate    | Tax');
        this.drawLine(doc);

        taxBreakdown.bands.forEach(band => {
          const bandName = band.band.padEnd(22);
          const taxable = this.formatCurrency(band.taxableAmount).padStart(12);
          const rate = `${(band.rate * 100).toFixed(1)}%`.padStart(6);
          const tax = this.formatCurrency(band.tax).padStart(12);

          doc.text(`${bandName} | ${taxable} | ${rate} | ${tax}`);
        });

        this.drawLine(doc);
        doc.font('Helvetica-Bold');
        doc.text(`TOTAL PIT DUE: ${this.formatCurrency(taxBreakdown.totalTax)}`);
        doc.font('Helvetica');
      }

      doc.moveDown(2);

      // ========== DECLARATION ==========
      doc.fontSize(14).font('Helvetica-Bold').text('DECLARATION');
      doc.moveDown(0.5);
      this.drawLine(doc);

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'I declare that the information in this statement is true, correct, and complete. ' +
        'All expenses were incurred wholly and exclusively for this project as required by ' +
        'Section 20 of the Nigeria Tax Act 2025.'
      );

      doc.moveDown(2);
      doc.text('Date: ___________________    Signature: ___________________________');

      doc.moveDown(2);
      doc.fontSize(8).fillColor('gray');
      doc.text('Generated by PRISM Tax Compliance Platform', { align: 'center' });
      doc.text(`Reference: ${refNumber} | Generated: ${new Date().toISOString()}`, { align: 'center' });

      doc.end();
    });
  }

  /**
   * Draw a horizontal line
   */
  private drawLine(doc: PDFKit.PDFDocument): void {
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(0.3);
  }

  /**
   * Format currency for Nigeria
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Format date
   */
  private formatDate(dateStr: string | null): string {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  }
}

export const projectStatementGeneratorService = new ProjectStatementGeneratorService();
