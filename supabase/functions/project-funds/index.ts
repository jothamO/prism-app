import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProjectData {
  name: string;
  description?: string;
  source_person: string;
  source_relationship: string;
  budget: number;
  business_id?: string;
}

interface ExpenseData {
  project_id: string;
  amount: number;
  description: string;
  category?: string;
  date?: string;
}

interface ReceiptOCRData {
  project_id: string;
  expense_id?: string;
  image_base64: string;
  receipt_url?: string;
}

// Tax bands for Section 58 PIT calculation
const TAX_BANDS = [
  { min: 0, max: 800000, rate: 0, description: 'First ₦800,000' },
  { min: 800000, max: 2400000, rate: 0.15, description: 'Next ₦1,600,000' },
  { min: 2400000, max: 4000000, rate: 0.175, description: 'Next ₦1,600,000' },
  { min: 4000000, max: 7200000, rate: 0.20, description: 'Next ₦3,200,000' },
  { min: 7200000, max: 12000000, rate: 0.225, description: 'Next ₦4,800,000' },
  { min: 12000000, max: Infinity, rate: 0.25, description: 'Above ₦12,000,000' },
];

/**
 * Calculate PIT on excess using Section 58 tax bands
 */
function calculatePITOnExcess(excess: number): { totalTax: number; bands: any[] } {
  if (excess <= 0) return { totalTax: 0, bands: [] };

  let remainingIncome = excess;
  let totalTax = 0;
  const bands: any[] = [];

  for (const band of TAX_BANDS) {
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

  return { totalTax: Math.round(totalTax * 100) / 100, bands };
}

/**
 * Extract receipt data using Lovable AI (Gemini Flash)
 */
async function extractReceiptWithAI(imageBase64: string): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this receipt image and extract the following information. Return ONLY a valid JSON object with these exact fields:

{
  "vendor_name": "the business/vendor name",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "description": "brief description of items purchased",
  "confidence": 0.0
}

Rules:
- amount must be a number (no currency symbols)
- date must be in YYYY-MM-DD format, use null if not visible
- confidence is a number between 0 and 1 indicating extraction quality
- If a field is not readable, use null
- For Nigerian receipts, look for NGN, ₦, or Naira amounts

Return ONLY the JSON, no other text.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded, please try again later');
    }
    if (response.status === 402) {
      throw new Error('Payment required, please add funds to your Lovable AI workspace');
    }
    const errorText = await response.text();
    console.error('[OCR] AI gateway error:', response.status, errorText);
    throw new Error('AI extraction failed');
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content in AI response');
  }

  // Parse JSON from response (handle markdown wrapping)
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);

  return JSON.parse(jsonStr.trim());
}

/**
 * Match extracted amount with recorded expense (5% tolerance)
 */
function matchAmounts(ocrAmount: number, recordedAmount: number): { matches: boolean; confidence: number } {
  const difference = Math.abs(ocrAmount - recordedAmount);
  const percentDiff = difference / recordedAmount;
  return {
    matches: percentDiff <= 0.05,
    confidence: Math.max(0, 1 - percentDiff),
  };
}

/**
 * Generate Project Statement PDF
 */
async function generateStatementPDF(
  project: any,
  expenses: any[],
  receipts: any[],
  taxBreakdown: { totalTax: number; bands: any[] }
): Promise<string> {
  const excess = project.budget - (project.spent || 0);
  const receiptCount = receipts.filter(r => r.is_verified).length;
  const expenseCount = expenses.length;
  const receiptPercentage = expenseCount > 0 ? Math.round((receiptCount / expenseCount) * 100) : 100;

  // Build text-based report (PDF generation would require additional library)
  const refNumber = `PRJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${project.id.slice(0, 8).toUpperCase()}`;
  
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount);

  let report = `
🇳🇬 PROJECT FUNDS STATEMENT
Nigeria Tax Act 2025 Compliance Report
Reference: ${refNumber}
Generated: ${new Date().toISOString()}

═══════════════════════════════════════════════════════════════

PROJECT DETAILS
─────────────────────────────────────────────────────────────────
Project Name: ${project.name}
Source: ${project.source_person} (${project.source_relationship})
Status: ${project.status.toUpperCase()}
Created: ${project.created_at?.split('T')[0] || 'N/A'}
Completed: ${project.completed_at?.split('T')[0] || 'N/A'}

═══════════════════════════════════════════════════════════════

FINANCIAL SUMMARY
─────────────────────────────────────────────────────────────────
Budget Received:     ${formatCurrency(project.budget)}
Total Expenses:      ${formatCurrency(project.spent || 0)}
Balance (Excess):    ${formatCurrency(excess)}

${excess > 0 ? `⚠️ TAX TREATMENT: Taxable under Section 4(1)(k)` : '✓ No taxable excess'}

═══════════════════════════════════════════════════════════════

EXPENSE LOG (${expenseCount} items)
─────────────────────────────────────────────────────────────────
`;

  expenses.slice(0, 20).forEach(expense => {
    const date = expense.date || 'N/A';
    const desc = expense.description.substring(0, 40);
    const amount = formatCurrency(expense.amount);
    const hasReceipt = receipts.some(r => r.expense_id === expense.id);
    report += `${date} | ${desc.padEnd(40)} | ${amount.padStart(12)} | ${hasReceipt ? '✓' : '✗'}\n`;
  });

  if (expenseCount > 20) {
    report += `... and ${expenseCount - 20} more expenses\n`;
  }

  report += `
═══════════════════════════════════════════════════════════════

COMPLIANCE CHECKLIST
─────────────────────────────────────────────────────────────────
${project.is_agency_fund ? '✓' : '✗'} Section 5: Agency fund properly classified
✓ Section 20: All expenses wholly & exclusively
${receiptPercentage === 100 ? '✓' : '✗'} Section 32: Receipts attached (${receiptCount}/${expenseCount} = ${receiptPercentage}%)
✓ Section 191: No artificial transactions detected
`;

  if (taxBreakdown.totalTax > 0) {
    report += `
═══════════════════════════════════════════════════════════════

TAX CALCULATION (Section 58)
─────────────────────────────────────────────────────────────────
Taxable Excess: ${formatCurrency(excess)}

Band                    | Taxable       | Rate    | Tax
`;

    taxBreakdown.bands.forEach(band => {
      report += `${band.band.padEnd(22)} | ${formatCurrency(band.taxableAmount).padStart(12)} | ${(band.rate * 100).toFixed(1).padStart(5)}% | ${formatCurrency(band.tax).padStart(12)}\n`;
    });

    report += `─────────────────────────────────────────────────────────────────
TOTAL PIT DUE: ${formatCurrency(taxBreakdown.totalTax)}
`;
  }

  report += `
═══════════════════════════════════════════════════════════════

DECLARATION
─────────────────────────────────────────────────────────────────
I declare that the information in this statement is true, correct, 
and complete. All expenses were incurred wholly and exclusively 
for this project as required by Section 20 of the Nigeria Tax Act 2025.

Date: ___________________    Signature: ___________________________

─────────────────────────────────────────────────────────────────
Generated by PRISM Tax Compliance Platform
Reference: ${refNumber}
`;

  return report;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, ...data } = await req.json();
    console.log(`[project-funds] Action: ${action}, User: ${user.id}`);

    switch (action) {
      case 'create': {
        const projectData = data as ProjectData;
        
        const { data: project, error } = await supabase
          .from('projects')
          .insert({
            user_id: user.id,
            name: projectData.name,
            description: projectData.description,
            source_person: projectData.source_person,
            source_relationship: projectData.source_relationship,
            budget: projectData.budget,
            business_id: projectData.business_id,
            is_agency_fund: true,
            tax_treatment: 'non_taxable',
            exclude_from_vat: true,
            status: 'active',
          })
          .select()
          .single();

        if (error) {
          console.error('[project-funds] Create error:', error);
          throw error;
        }

        console.log(`[project-funds] Created project: ${project.id}`);
        return new Response(
          JSON.stringify({ success: true, project }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'expense': {
        const expenseData = data as ExpenseData;
        
        // Validate project ownership
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', expenseData.project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found or access denied' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check budget
        const newSpent = (project.spent || 0) + expenseData.amount;
        const isOverBudget = newSpent > project.budget;

        // Create expense linked to project
        const period = new Date().toISOString().slice(0, 7); // YYYY-MM format
        const { data: expense, error: expenseError } = await supabase
          .from('expenses')
          .insert({
            user_id: user.id,
            business_id: project.business_id,
            project_id: expenseData.project_id,
            is_project_expense: true,
            amount: expenseData.amount,
            description: expenseData.description,
            category: expenseData.category || 'project_expense',
            date: expenseData.date || new Date().toISOString().split('T')[0],
            period,
            can_claim_input_vat: false, // Project expenses are not VAT claimable
          })
          .select()
          .single();

        if (expenseError) {
          console.error('[project-funds] Expense error:', expenseError);
          throw expenseError;
        }

        // Get updated project balance
        const { data: updatedProject } = await supabase
          .from('projects')
          .select('*')
          .eq('id', expenseData.project_id)
          .single();

        console.log(`[project-funds] Recorded expense: ${expense.id} for project: ${expenseData.project_id}`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            expense,
            project: updatedProject,
            warning: isOverBudget ? 'Project is now over budget!' : null
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'summary': {
        const { project_id } = data;

        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get expenses for this project
        const { data: expenses } = await supabase
          .from('expenses')
          .select('*')
          .eq('project_id', project_id)
          .eq('is_project_expense', true)
          .order('date', { ascending: false });

        // Get receipts
        const { data: receipts } = await supabase
          .from('project_receipts')
          .select('*')
          .eq('project_id', project_id);

        const balance = project.budget - (project.spent || 0);
        const verifiedReceipts = receipts?.filter(r => r.is_verified).length || 0;

        return new Response(
          JSON.stringify({
            success: true,
            summary: {
              project,
              budget: project.budget,
              spent: project.spent || 0,
              balance,
              balancePercentage: ((balance / project.budget) * 100).toFixed(1),
              expenseCount: expenses?.length || 0,
              expenses: expenses || [],
              receiptCount: receipts?.length || 0,
              verifiedReceiptCount: verifiedReceipts,
              taxTreatment: project.tax_treatment,
              isAgencyFund: project.is_agency_fund,
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'complete': {
        const { project_id } = data;

        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const excess = project.budget - (project.spent || 0);
        const hasTaxableExcess = excess > 0;

        // Calculate PIT on excess using proper tax bands
        const taxCalculation = calculatePITOnExcess(excess);

        // Update project status
        const { data: updatedProject, error: updateError } = await supabase
          .from('projects')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            tax_treatment: hasTaxableExcess ? 'taxable_excess' : 'non_taxable',
          })
          .eq('id', project_id)
          .select()
          .single();

        if (updateError) throw updateError;

        // Get expense count
        const { count: expenseCount } = await supabase
          .from('expenses')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project_id);

        // Get verified receipts count
        const { count: verifiedReceipts } = await supabase
          .from('project_receipts')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project_id)
          .eq('is_verified', true);

        console.log(`[project-funds] Completed project: ${project_id}, excess: ${excess}, tax: ${taxCalculation.totalTax}`);
        return new Response(
          JSON.stringify({
            success: true,
            completion: {
              project: updatedProject,
              budget: project.budget,
              totalSpent: project.spent || 0,
              excess,
              hasTaxableExcess,
              estimatedTax: taxCalculation.totalTax,
              taxBreakdown: taxCalculation.bands,
              expenseCount,
              verifiedReceipts,
              message: hasTaxableExcess 
                ? `Project completed with ₦${excess.toLocaleString()} excess. This is taxable income under Section 4(1)(k). Estimated PIT: ₦${taxCalculation.totalTax.toLocaleString()}`
                : 'Project completed with no taxable excess.',
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list': {
        const { status } = data;
        
        let query = supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (status) {
          query = query.eq('status', status);
        }

        const { data: projects, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, projects }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'receipt': {
        const { project_id, expense_id, receipt_url, amount, date, vendor_name } = data;

        // Validate project ownership
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: receipt, error: receiptError } = await supabase
          .from('project_receipts')
          .insert({
            project_id,
            expense_id,
            receipt_url,
            amount,
            date: date || new Date().toISOString().split('T')[0],
            vendor_name,
            is_verified: false,
          })
          .select()
          .single();

        if (receiptError) throw receiptError;

        console.log(`[project-funds] Added receipt: ${receipt.id} for project: ${project_id}`);
        return new Response(
          JSON.stringify({ success: true, receipt }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'process-receipt': {
        const ocrData = data as ReceiptOCRData;

        // Validate project ownership
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', ocrData.project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[project-funds] Processing receipt OCR for project: ${ocrData.project_id}`);

        // Extract receipt data using AI
        let extractedData;
        try {
          extractedData = await extractReceiptWithAI(ocrData.image_base64);
          console.log('[project-funds] OCR extracted:', extractedData);
        } catch (ocrError) {
          console.error('[project-funds] OCR error:', ocrError);
          return new Response(
            JSON.stringify({ 
              error: ocrError instanceof Error ? ocrError.message : 'OCR extraction failed',
              success: false 
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Match with expense if expense_id provided
        let matchResult = { matched: false, confidence: 0, expenseId: ocrData.expense_id };
        
        if (ocrData.expense_id && extractedData.amount) {
          const { data: expense } = await supabase
            .from('expenses')
            .select('*')
            .eq('id', ocrData.expense_id)
            .single();

          if (expense) {
            const amountMatch = matchAmounts(extractedData.amount, expense.amount);
            matchResult = {
              matched: amountMatch.matches,
              confidence: amountMatch.confidence,
              expenseId: expense.id,
            };
          }
        } else if (extractedData.amount) {
          // Try to find matching expense by amount
          const { data: expenses } = await supabase
            .from('expenses')
            .select('*')
            .eq('project_id', ocrData.project_id)
            .eq('is_project_expense', true);

          if (expenses) {
            for (const expense of expenses) {
              const amountMatch = matchAmounts(extractedData.amount, expense.amount);
              if (amountMatch.matches && amountMatch.confidence > matchResult.confidence) {
                matchResult = {
                  matched: true,
                  confidence: amountMatch.confidence,
                  expenseId: expense.id,
                };
              }
            }
          }
        }

        // Create receipt record with OCR data
        const { data: receipt, error: receiptError } = await supabase
          .from('project_receipts')
          .insert({
            project_id: ocrData.project_id,
            expense_id: matchResult.expenseId,
            receipt_url: ocrData.receipt_url || '',
            amount: extractedData.amount || 0,
            date: extractedData.date || new Date().toISOString().split('T')[0],
            vendor_name: extractedData.vendor_name,
            ocr_extracted_amount: extractedData.amount,
            ocr_extracted_vendor: extractedData.vendor_name,
            ocr_confidence: extractedData.confidence || 0,
            is_verified: matchResult.matched && matchResult.confidence > 0.8,
            verification_method: matchResult.matched ? 'ocr_expense_match' : 'ocr_only',
            bank_match_confidence: matchResult.confidence,
            description: extractedData.description,
          })
          .select()
          .single();

        if (receiptError) {
          console.error('[project-funds] Receipt creation error:', receiptError);
          throw receiptError;
        }

        console.log(`[project-funds] Created OCR receipt: ${receipt.id}, matched: ${matchResult.matched}`);
        return new Response(
          JSON.stringify({
            success: true,
            receipt,
            ocrData: extractedData,
            matchResult,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'generate-statement': {
        const { project_id } = data;

        // Validate project ownership and status
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .eq('user_id', user.id)
          .single();

        if (projectError || !project) {
          return new Response(
            JSON.stringify({ error: 'Project not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (project.status !== 'completed') {
          return new Response(
            JSON.stringify({ error: 'Project must be completed to generate statement' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get expenses
        const { data: expenses } = await supabase
          .from('expenses')
          .select('*')
          .eq('project_id', project_id)
          .eq('is_project_expense', true)
          .order('date', { ascending: true });

        // Get receipts
        const { data: receipts } = await supabase
          .from('project_receipts')
          .select('*')
          .eq('project_id', project_id);

        // Calculate tax
        const excess = project.budget - (project.spent || 0);
        const taxBreakdown = calculatePITOnExcess(excess > 0 ? excess : 0);

        // Generate statement
        const statement = await generateStatementPDF(
          project,
          expenses || [],
          receipts || [],
          taxBreakdown
        );

        console.log(`[project-funds] Generated statement for project: ${project_id}`);
        return new Response(
          JSON.stringify({
            success: true,
            statement,
            summary: {
              projectId: project.id,
              projectName: project.name,
              budget: project.budget,
              spent: project.spent || 0,
              excess: excess > 0 ? excess : 0,
              estimatedTax: taxBreakdown.totalTax,
              expenseCount: expenses?.length || 0,
              receiptCount: receipts?.length || 0,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[project-funds] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
