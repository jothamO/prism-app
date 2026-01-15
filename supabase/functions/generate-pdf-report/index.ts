import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


interface ClassificationResult {
  description: string;
  expected: string;
  result: string;
  passed: boolean;
  actReference?: string;
}

interface ReconciliationData {
  period: string;
  businessName: string;
  tin: string;
  outputVAT: number;
  outputVATInvoicesCount: number;
  inputVAT: number;
  inputVATExpensesCount: number;
  creditBroughtForward: number;
  netVAT: number;
  creditCarriedForward: number;
  status: string;
}

interface E2EResult {
  scenario: string;
  timestamp: string;
  passed: boolean;
  expected: { netVAT: number; invoices: number; expenses: number };
  actual: { netVAT: number; invoices: number; expenses: number };
  classificationResults: ClassificationResult[];
  reconciliationData: ReconciliationData;
}

interface TaxBandBreakdown {
  band: string;
  taxableInBand: number;
  rate: number;
  taxInBand: number;
}

interface IncomeTaxData {
  grossIncome: number;
  period: 'annual' | 'monthly';
  deductions: {
    pension: number;
    nhf: number;
    nhis: number;
    rentRelief: number;
    lifeInsurance: number;
    housingLoanInterest: number;
    total: number;
  };
  chargeableIncome: number;
  taxBreakdown: TaxBandBreakdown[];
  totalTax: number;
  effectiveRate: number;
  netIncome: number;
  monthlyTax: number;
  monthlyNetIncome: number;
  isMinimumWageExempt: boolean;
  actReference: string;
  employeeName?: string;
  employerName?: string;
  tin?: string;
}

interface BankStatementAnalysisData {
  bank: string;
  accountName: string;
  accountNumber: string;
  period: string;
  generatedAt: string;
  categories: {
    sales: { count: number; total: number };
    transfers_in: { count: number; total: number };
    expenses: { count: number; total: number };
    utilities: { count: number; total: number };
    salaries: { count: number; total: number };
    other: { count: number; total: number };
  };
  transactions: Array<{
    date: string;
    description: string;
    credit?: number;
    debit?: number;
    category?: string;
    vatImplication?: string;
    riskFlag?: string;
  }>;
  totals: {
    credits: number;
    debits: number;
    outputVAT: number;
    inputVAT: number;
    netVAT: number;
  };
  reviewItemsCount: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
};

const generateClassificationReportHTML = (results: ClassificationResult[]): string => {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const timestamp = new Date().toISOString();

  const rows = results.map(r => `
    <tr class="${r.passed ? 'passed' : 'failed'}">
      <td>${r.description}</td>
      <td>${r.expected}</td>
      <td>${r.result}</td>
      <td class="status">${r.passed ? '✓ PASS' : '✗ FAIL'}</td>
      <td>${r.actReference || 'Section 148'}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>PRISM VAT Classification Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { border-bottom: 3px solid #228B22; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #228B22; font-size: 24px; }
    .header p { color: #666; margin-top: 5px; }
    .summary { display: flex; justify-content: space-between; margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; }
    .summary-item { text-align: center; }
    .summary-item .value { font-size: 32px; font-weight: bold; color: #228B22; }
    .summary-item .label { color: #666; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #228B22; color: white; padding: 12px; text-align: left; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    tr.passed td { background: #f0fff0; }
    tr.failed td { background: #fff0f0; }
    .status { font-weight: bold; }
    tr.passed .status { color: #228B22; }
    tr.failed .status { color: #dc3545; }
    .footer { border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 12px; }
    .certification { background: #f0fff0; border: 2px solid #228B22; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
    .certification h3 { color: #228B22; margin-bottom: 10px; }
    @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🇳🇬 PRISM VAT CLASSIFICATION TEST REPORT</h1>
      <p>Tax Act 2025 Compliance Verification</p>
      <p>Generated: ${new Date(timestamp).toLocaleString()}</p>
    </div>

    <div class="summary">
      <div class="summary-item">
        <div class="value">${passed}/${total}</div>
        <div class="label">Tests Passed</div>
      </div>
      <div class="summary-item">
        <div class="value">${((passed/total)*100).toFixed(0)}%</div>
        <div class="label">Pass Rate</div>
      </div>
      <div class="summary-item">
        <div class="value">${passed === total ? '✓' : '✗'}</div>
        <div class="label">Compliant</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item Description</th>
          <th>Expected</th>
          <th>Result</th>
          <th>Status</th>
          <th>Act Reference</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    ${passed === total ? `
    <div class="certification">
      <h3>✓ Compliance Certification</h3>
      <p>This system correctly implements Nigeria Tax Act 2025 supply classification as of ${new Date().toLocaleDateString()}.</p>
      <p>All tested categories (zero-rated, exempt, standard) return correct classifications per Sections 148, 186, and 187.</p>
    </div>
    ` : `
    <div class="certification" style="background: #fff0f0; border-color: #dc3545;">
      <h3 style="color: #dc3545;">⚠ Compliance Issues Found</h3>
      <p>Some classifications do not match expected values. Please review failed test cases.</p>
    </div>
    `}

    <div class="footer">
      <p>PRISM - Nigeria VAT Automation Platform</p>
      <p>This report was automatically generated for compliance documentation purposes.</p>
    </div>
  </div>
</body>
</html>
  `;
};

const generateReconciliationReportHTML = (data: ReconciliationData): string => {
  const timestamp = new Date().toISOString();
  const dueDate = new Date();
  dueDate.setMonth(dueDate.getMonth() + 1);
  dueDate.setDate(21);

  return `
<!DOCTYPE html>
<html>
<head>
  <title>PRISM VAT Reconciliation Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { border-bottom: 3px solid #228B22; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-left h1 { color: #228B22; font-size: 24px; }
    .header-left p { color: #666; margin-top: 5px; }
    .header-right { text-align: right; }
    .header-right .period { font-size: 24px; font-weight: bold; color: #333; }
    .business-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    .business-info h3 { color: #333; margin-bottom: 10px; }
    .business-info p { color: #666; }
    .section { margin-bottom: 30px; }
    .section h3 { color: #228B22; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 1px solid #eee; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
    .row:last-child { border-bottom: none; }
    .row .label { color: #666; }
    .row .value { font-weight: bold; color: #333; }
    .row .value.positive { color: #228B22; }
    .row .value.negative { color: #dc3545; }
    .total-section { background: #228B22; color: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    .total-section h3 { color: white; margin-bottom: 15px; }
    .total-section .row .label { color: rgba(255,255,255,0.8); }
    .total-section .row .value { color: white; font-size: 24px; }
    .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; text-transform: uppercase; }
    .status-remit { background: #007bff; color: white; }
    .status-credit { background: #28a745; color: white; }
    .footer { border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 12px; }
    @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <h1>🇳🇬 VAT RECONCILIATION REPORT</h1>
        <p>Generated: ${new Date(timestamp).toLocaleString()}</p>
      </div>
      <div class="header-right">
        <div class="period">${data.period}</div>
        <span class="status-badge status-${data.status}">${data.status}</span>
      </div>
    </div>

    <div class="business-info">
      <h3>${data.businessName}</h3>
      <p>TIN: ${data.tin}</p>
    </div>

    <div class="section">
      <h3>📤 OUTPUT VAT (Collected on Sales)</h3>
      <div class="row">
        <span class="label">Total Invoices</span>
        <span class="value">${data.outputVATInvoicesCount}</span>
      </div>
      <div class="row">
        <span class="label">Output VAT Amount</span>
        <span class="value">${formatCurrency(data.outputVAT)}</span>
      </div>
    </div>

    <div class="section">
      <h3>📥 INPUT VAT (Paid on Purchases)</h3>
      <div class="row">
        <span class="label">Total Expenses</span>
        <span class="value">${data.inputVATExpensesCount}</span>
      </div>
      <div class="row">
        <span class="label">Input VAT Amount</span>
        <span class="value">${formatCurrency(data.inputVAT)}</span>
      </div>
    </div>

    <div class="section">
      <h3>📊 RECONCILIATION</h3>
      <div class="row">
        <span class="label">Credit Brought Forward</span>
        <span class="value">${formatCurrency(data.creditBroughtForward)}</span>
      </div>
      <div class="row">
        <span class="label">Net VAT Position</span>
        <span class="value ${data.netVAT >= 0 ? 'negative' : 'positive'}">${formatCurrency(data.netVAT)}</span>
      </div>
      <div class="row">
        <span class="label">Credit Carried Forward</span>
        <span class="value positive">${formatCurrency(data.creditCarriedForward)}</span>
      </div>
    </div>

    <div class="total-section">
      <h3>${data.status === 'remit' ? '💵 AMOUNT PAYABLE TO FIRS' : '💰 VAT CREDIT AVAILABLE'}</h3>
      <div class="row">
        <span class="label">${data.status === 'remit' ? 'Net VAT Payable' : 'Credit Balance'}</span>
        <span class="value">${formatCurrency(Math.abs(data.netVAT))}</span>
      </div>
      ${data.status === 'remit' ? `
      <div class="row">
        <span class="label">Due Date</span>
        <span class="value">${dueDate.toLocaleDateString()}</span>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>PRISM - Nigeria VAT Automation Platform</p>
      <p>This report was automatically generated for compliance documentation purposes.</p>
      <p>Tax Act 2025 - Sections 148, 186, 187</p>
    </div>
  </div>
</body>
</html>
  `;
};

const generateE2EReportHTML = (result: E2EResult): string => {
  const timestamp = new Date().toISOString();
  const classificationRows = result.classificationResults.map(r => `
    <tr class="${r.passed ? 'passed' : 'failed'}">
      <td>${r.description}</td>
      <td>${r.expected}</td>
      <td>${r.result}</td>
      <td class="status">${r.passed ? '✓' : '✗'}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>PRISM E2E VAT Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { border-bottom: 3px solid ${result.passed ? '#228B22' : '#dc3545'}; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: ${result.passed ? '#228B22' : '#dc3545'}; font-size: 24px; }
    .header p { color: #666; margin-top: 5px; }
    .result-banner { background: ${result.passed ? '#f0fff0' : '#fff0f0'}; border: 2px solid ${result.passed ? '#228B22' : '#dc3545'}; border-radius: 8px; padding: 30px; text-align: center; margin-bottom: 30px; }
    .result-banner h2 { color: ${result.passed ? '#228B22' : '#dc3545'}; font-size: 36px; margin-bottom: 10px; }
    .result-banner p { color: #666; }
    .section { margin-bottom: 30px; }
    .section h3 { color: #228B22; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 1px solid #eee; }
    .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .comparison-box { padding: 20px; border-radius: 8px; }
    .comparison-box.expected { background: #f8f9fa; }
    .comparison-box.actual { background: ${result.passed ? '#f0fff0' : '#fff0f0'}; }
    .comparison-box h4 { margin-bottom: 15px; color: #333; }
    .comparison-box .row { display: flex; justify-content: space-between; padding: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #228B22; color: white; padding: 10px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #eee; }
    tr.passed td { background: #f0fff0; }
    tr.failed td { background: #fff0f0; }
    .status { font-weight: bold; }
    tr.passed .status { color: #228B22; }
    tr.failed .status { color: #dc3545; }
    .footer { border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 12px; }
    @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🇳🇬 PRISM END-TO-END VAT TEST REPORT</h1>
      <p>Scenario: ${result.scenario}</p>
      <p>Generated: ${new Date(timestamp).toLocaleString()}</p>
    </div>

    <div class="result-banner">
      <h2>${result.passed ? '✓ ALL TESTS PASSED' : '✗ TESTS FAILED'}</h2>
      <p>VAT calculations ${result.passed ? 'match' : 'do not match'} expected values</p>
    </div>

    <div class="section">
      <h3>📊 VAT Calculation Comparison</h3>
      <div class="comparison">
        <div class="comparison-box expected">
          <h4>Expected Values</h4>
          <div class="row"><span>Net VAT:</span><span>${formatCurrency(result.expected.netVAT)}</span></div>
          <div class="row"><span>Invoices:</span><span>${result.expected.invoices}</span></div>
          <div class="row"><span>Expenses:</span><span>${result.expected.expenses}</span></div>
        </div>
        <div class="comparison-box actual">
          <h4>Actual Values</h4>
          <div class="row"><span>Net VAT:</span><span>${formatCurrency(result.actual.netVAT)}</span></div>
          <div class="row"><span>Invoices:</span><span>${result.actual.invoices}</span></div>
          <div class="row"><span>Expenses:</span><span>${result.actual.expenses}</span></div>
        </div>
      </div>
    </div>

    ${result.classificationResults.length > 0 ? `
    <div class="section">
      <h3>📝 Classification Test Results</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Expected</th>
            <th>Result</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${classificationRows}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="section">
      <h3>💰 Reconciliation Summary</h3>
      <div class="comparison-box expected" style="margin: 0;">
        <div class="row"><span>Period:</span><span>${result.reconciliationData.period}</span></div>
        <div class="row"><span>Output VAT:</span><span>${formatCurrency(result.reconciliationData.outputVAT)}</span></div>
        <div class="row"><span>Input VAT:</span><span>${formatCurrency(result.reconciliationData.inputVAT)}</span></div>
        <div class="row"><span>Net Position:</span><span>${formatCurrency(result.reconciliationData.netVAT)}</span></div>
        <div class="row"><span>Status:</span><span>${result.reconciliationData.status.toUpperCase()}</span></div>
      </div>
    </div>

    <div class="footer">
      <p>PRISM - Nigeria VAT Automation Platform</p>
      <p>This report was automatically generated for compliance documentation purposes.</p>
      <p>Test completed: ${result.timestamp}</p>
    </div>
  </div>
</body>
</html>
  `;
};

const generateIncomeTaxReportHTML = (data: IncomeTaxData): string => {
  const timestamp = new Date().toISOString();
  
  const deductionRows = [
    { label: 'Pension Contribution', value: data.deductions.pension },
    { label: 'National Housing Fund (NHF)', value: data.deductions.nhf },
    { label: 'National Health Insurance (NHIS)', value: data.deductions.nhis },
    { label: 'Rent Relief', value: data.deductions.rentRelief },
    { label: 'Life Insurance Premium', value: data.deductions.lifeInsurance },
    { label: 'Housing Loan Interest', value: data.deductions.housingLoanInterest },
  ].filter(r => r.value > 0).map(r => `
    <tr>
      <td>${r.label}</td>
      <td class="amount">${formatCurrency(r.value)}</td>
    </tr>
  `).join('');

  const taxBandRows = data.taxBreakdown.map(band => `
    <tr>
      <td>${band.band}</td>
      <td class="amount">${formatCurrency(band.taxableInBand)}</td>
      <td class="rate">${(band.rate * 100).toFixed(0)}%</td>
      <td class="amount">${formatCurrency(band.taxInBand)}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>PRISM Income Tax Computation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { border-bottom: 3px solid #228B22; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; }
    .header-left h1 { color: #228B22; font-size: 24px; }
    .header-left p { color: #666; margin-top: 5px; }
    .header-right { text-align: right; }
    .header-right .period { font-size: 18px; font-weight: bold; color: #333; }
    .taxpayer-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    .taxpayer-info h3 { color: #333; margin-bottom: 10px; }
    .taxpayer-info p { color: #666; }
    .section { margin-bottom: 30px; }
    .section h3 { color: #228B22; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 1px solid #eee; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #228B22; color: white; padding: 12px; text-align: left; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    .amount { text-align: right; font-family: monospace; }
    .rate { text-align: center; }
    .total-row { background: #f8f9fa; font-weight: bold; }
    .total-row td { border-top: 2px solid #228B22; }
    .summary-box { background: #228B22; color: white; padding: 25px; border-radius: 8px; margin-bottom: 30px; }
    .summary-box h3 { color: white; margin-bottom: 20px; font-size: 18px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .summary-item { text-align: center; }
    .summary-item .value { font-size: 24px; font-weight: bold; }
    .summary-item .label { font-size: 12px; opacity: 0.8; margin-top: 5px; }
    .exempt-badge { background: #17a2b8; color: white; padding: 10px 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
    .footer { border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 12px; }
    @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <h1>🇳🇬 INCOME TAX COMPUTATION</h1>
        <p>Nigeria Tax Act 2025 - Section 58</p>
        <p>Generated: ${new Date(timestamp).toLocaleString()}</p>
      </div>
      <div class="header-right">
        <div class="period">Tax Year ${new Date().getFullYear()}</div>
      </div>
    </div>

    ${data.employeeName || data.employerName ? `
    <div class="taxpayer-info">
      ${data.employeeName ? `<h3>${data.employeeName}</h3>` : ''}
      ${data.employerName ? `<p>Employer: ${data.employerName}</p>` : ''}
      ${data.tin ? `<p>TIN: ${data.tin}</p>` : ''}
    </div>
    ` : ''}

    ${data.isMinimumWageExempt ? `
    <div class="exempt-badge">
      <strong>✓ MINIMUM WAGE EXEMPTION</strong><br>
      <small>Income at or below ₦420,000/year is exempt from income tax per Section 58</small>
    </div>
    ` : ''}

    <div class="section">
      <h3>📊 Income Summary</h3>
      <table>
        <tr>
          <td>Gross Annual Income</td>
          <td class="amount"><strong>${formatCurrency(data.grossIncome)}</strong></td>
        </tr>
        <tr>
          <td>Less: Total Deductions</td>
          <td class="amount">(${formatCurrency(data.deductions.total)})</td>
        </tr>
        <tr class="total-row">
          <td>Chargeable Income</td>
          <td class="amount">${formatCurrency(data.chargeableIncome)}</td>
        </tr>
      </table>
    </div>

    ${data.deductions.total > 0 ? `
    <div class="section">
      <h3>📋 Deductions Applied</h3>
      <table>
        <thead>
          <tr>
            <th>Deduction Type</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${deductionRows}
          <tr class="total-row">
            <td>Total Deductions</td>
            <td class="amount">${formatCurrency(data.deductions.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="section">
      <h3>🧮 Progressive Tax Calculation</h3>
      <table>
        <thead>
          <tr>
            <th>Tax Band</th>
            <th style="text-align: right;">Taxable Amount</th>
            <th style="text-align: center;">Rate</th>
            <th style="text-align: right;">Tax</th>
          </tr>
        </thead>
        <tbody>
          ${taxBandRows}
          <tr class="total-row">
            <td colspan="3">Total Annual Tax</td>
            <td class="amount">${formatCurrency(data.totalTax)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-box">
      <h3>💰 PAYE Summary</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="value">${formatCurrency(data.totalTax)}</div>
          <div class="label">Annual Tax</div>
        </div>
        <div class="summary-item">
          <div class="value">${formatCurrency(data.monthlyTax)}</div>
          <div class="label">Monthly PAYE</div>
        </div>
        <div class="summary-item">
          <div class="value">${data.effectiveRate.toFixed(2)}%</div>
          <div class="label">Effective Rate</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h3>📈 Net Income</h3>
      <table>
        <tr>
          <td>Annual Net Income (After Tax & Deductions)</td>
          <td class="amount"><strong>${formatCurrency(data.netIncome)}</strong></td>
        </tr>
        <tr>
          <td>Monthly Net Income</td>
          <td class="amount"><strong>${formatCurrency(data.monthlyNetIncome)}</strong></td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <p><strong>Act Reference:</strong> ${data.actReference}</p>
      <p>PRISM - Nigeria Tax Automation Platform</p>
      <p>This computation is for informational purposes. Please consult a tax professional for official filings.</p>
    </div>
  </div>
</body>
</html>
  `;
};

const generateBankStatementAnalysisHTML = (data: BankStatementAnalysisData): string => {
  const timestamp = new Date(data.generatedAt).toLocaleString();
  
  const transactionRows = data.transactions.map(txn => `
    <tr class="${txn.riskFlag ? 'flagged' : ''}">
      <td>${txn.date}</td>
      <td>${txn.description.substring(0, 50)}${txn.description.length > 50 ? '...' : ''}</td>
      <td class="amount credit">${txn.credit ? formatCurrency(txn.credit) : '-'}</td>
      <td class="amount debit">${txn.debit ? formatCurrency(txn.debit) : '-'}</td>
      <td>${txn.category || '-'}</td>
      <td>${txn.riskFlag ? '⚠️' : '✓'}</td>
    </tr>
  `).join('');

  const categoryRows = Object.entries(data.categories)
    .filter(([, val]) => val.count > 0)
    .map(([key, val]) => `
      <tr>
        <td>${key.replace('_', ' ').toUpperCase()}</td>
        <td>${val.count}</td>
        <td class="amount">${formatCurrency(val.total)}</td>
      </tr>
    `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>PRISM Bank Statement Analysis Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #f5f5f5; }
    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { border-bottom: 3px solid #228B22; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-left h1 { color: #228B22; font-size: 24px; }
    .header-left p { color: #666; margin-top: 5px; }
    .header-right { text-align: right; }
    .header-right .period { font-size: 18px; font-weight: bold; color: #333; }
    .account-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    .account-info h3 { color: #333; margin-bottom: 10px; }
    .account-info p { color: #666; }
    .section { margin-bottom: 30px; }
    .section h3 { color: #228B22; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 1px solid #eee; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
    .summary-box { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .summary-box .value { font-size: 24px; font-weight: bold; color: #333; }
    .summary-box .label { color: #666; font-size: 14px; }
    .summary-box.highlight { background: #228B22; color: white; }
    .summary-box.highlight .value { color: white; }
    .summary-box.highlight .label { color: rgba(255,255,255,0.8); }
    .summary-box.warning { background: #fff3cd; border: 1px solid #ffc107; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
    th { background: #228B22; color: white; padding: 10px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #eee; }
    .amount { text-align: right; font-family: monospace; }
    .credit { color: #228B22; }
    .debit { color: #dc3545; }
    tr.flagged { background: #fff3cd; }
    .vat-section { background: #e8f5e9; border: 2px solid #228B22; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
    .vat-section h3 { color: #228B22; margin-bottom: 15px; }
    .vat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #c8e6c9; }
    .vat-row:last-child { border-bottom: none; font-weight: bold; font-size: 18px; }
    .compliance-section { background: #fff8e1; border: 1px solid #ff9800; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
    .compliance-section h3 { color: #ff9800; margin-bottom: 10px; }
    .compliance-section ul { margin-left: 20px; }
    .compliance-section li { margin-bottom: 5px; }
    .footer { border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 12px; }
    @media print { 
      body { background: white; padding: 0; } 
      .container { box-shadow: none; } 
      .summary-box.highlight { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <h1>🇳🇬 BANK STATEMENT ANALYSIS REPORT</h1>
        <p>Generated: ${timestamp}</p>
      </div>
      <div class="header-right">
        <div class="period">${data.period}</div>
        <p>${data.bank}</p>
      </div>
    </div>

    <div class="account-info">
      <h3>${data.accountName}</h3>
      <p>Account Number: ${data.accountNumber}</p>
    </div>

    <div class="summary-grid">
      <div class="summary-box">
        <div class="value">${formatCurrency(data.totals.credits)}</div>
        <div class="label">Total Credits</div>
      </div>
      <div class="summary-box">
        <div class="value">${formatCurrency(data.totals.debits)}</div>
        <div class="label">Total Debits</div>
      </div>
      <div class="summary-box highlight">
        <div class="value">${formatCurrency(data.totals.credits - data.totals.debits)}</div>
        <div class="label">Net Position</div>
      </div>
    </div>

    <div class="section">
      <h3>📊 Category Breakdown</h3>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Transactions</th>
            <th>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRows}
        </tbody>
      </table>
    </div>

    <div class="vat-section">
      <h3>💹 VAT Implications</h3>
      <div class="vat-row">
        <span>Output VAT (7.5% on Sales)</span>
        <span>${formatCurrency(data.totals.outputVAT)}</span>
      </div>
      <div class="vat-row">
        <span>Input VAT (7.5% on Eligible Expenses)</span>
        <span>(${formatCurrency(data.totals.inputVAT)})</span>
      </div>
      <div class="vat-row">
        <span>Net VAT ${data.totals.netVAT >= 0 ? 'Payable' : 'Refundable'}</span>
        <span>${formatCurrency(Math.abs(data.totals.netVAT))}</span>
      </div>
    </div>

    ${data.reviewItemsCount > 0 ? `
    <div class="compliance-section">
      <h3>⚠️ Section 191 Compliance Notes</h3>
      <p><strong>${data.reviewItemsCount} transaction(s) flagged for review:</strong></p>
      <ul>
        <li>Large value transfers (>₦500,000) require verification</li>
        <li>Ensure transactions are not artificial under Section 191 of the Nigeria Tax Act 2025</li>
        <li>Maintain supporting documentation for all flagged items</li>
        <li>Consider professional review before VAT filing</li>
      </ul>
    </div>
    ` : ''}

    <div class="section">
      <h3>📝 Transaction Details</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Credit</th>
            <th>Debit</th>
            <th>Category</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${transactionRows}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <p><strong>Compliance References:</strong></p>
      <p>• VAT Classification: Nigeria Tax Act 2025, Sections 148, 186, 187</p>
      <p>• Artificial Transactions: Section 191</p>
      <p>• Record Keeping: Section 32</p>
      <br>
      <p>PRISM - Nigeria Tax Automation Platform</p>
      <p>This analysis is for informational purposes. Please consult a tax professional for official filings.</p>
    </div>
  </div>
</body>
</html>
  `;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportType, data } = await req.json();

    let html = '';

    switch (reportType) {
      case 'classification':
        html = generateClassificationReportHTML(data.results);
        break;
      case 'reconciliation':
        html = generateReconciliationReportHTML(data);
        break;
      case 'e2e':
        html = generateE2EReportHTML(data);
        break;
      case 'income-tax-computation':
        html = generateIncomeTaxReportHTML(data);
        break;
      case 'bank-statement-analysis':
        html = generateBankStatementAnalysisHTML(data);
        break;
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
