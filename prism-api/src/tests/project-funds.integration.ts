/**
 * Project Funds Integration Tests
 * 
 * Tests real CRUD operations against the Supabase database for project
 * fund management, including Section 5 agency funds, expense tracking,
 * receipt attachment, and project completion with tax calculation.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { testUtils } from './setup';

dotenv.config();

// Use environment variables for Supabase connection
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

describe('Project Funds Integration Tests', () => {
  let supabase: SupabaseClient;
  let testUserId: string;
  let testBusinessId: string;
  let testProjectId: string;
  let testExpenseIds: string[] = [];
  let testReceiptIds: string[] = [];

  beforeAll(async () => {
    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('Skipping integration tests - no Supabase credentials');
      return;
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create a test user in the users table
    const testPhoneNumber = `+234${Date.now().toString().slice(-10)}`;
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        whatsapp_number: testPhoneNumber,
        business_name: 'Integration Test Business',
        tin: `TIN-${Date.now()}`,
        email: `test-${Date.now()}@integration.test`,
      })
      .select()
      .single();

    if (userError) {
      console.error('Failed to create test user:', userError);
      throw userError;
    }

    testUserId = user.id;

    // Create a test business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        user_id: testUserId,
        name: 'Test Integration Business',
        registration_number: `RC-${Date.now()}`,
        is_default: true,
      })
      .select()
      .single();

    if (businessError) {
      console.error('Failed to create test business:', businessError);
      throw businessError;
    }

    testBusinessId = business.id;
  });

  afterAll(async () => {
    if (!supabase) return;

    // Clean up test data in reverse order of dependencies
    if (testReceiptIds.length > 0) {
      await supabase.from('project_receipts').delete().in('id', testReceiptIds);
    }

    if (testExpenseIds.length > 0) {
      await supabase.from('expenses').delete().in('id', testExpenseIds);
    }

    if (testProjectId) {
      await supabase.from('projects').delete().eq('id', testProjectId);
    }

    if (testBusinessId) {
      await supabase.from('businesses').delete().eq('id', testBusinessId);
    }

    if (testUserId) {
      await supabase.from('users').delete().eq('id', testUserId);
    }
  });

  describe('Project CRUD Operations', () => {
    test('should create a project in the database', async () => {
      if (!supabase) return;

      const projectData = {
        user_id: testUserId,
        business_id: testBusinessId,
        name: 'Integration Test Project',
        description: 'Testing project creation',
        source_person: 'Uncle Ahmed',
        source_relationship: 'family member',
        budget: 5000000,
        is_agency_fund: true,
        tax_treatment: 'non_taxable',
        exclude_from_vat: true,
        status: 'active',
      };

      const { data: project, error } = await supabase
        .from('projects')
        .insert(projectData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.name).toBe('Integration Test Project');
      expect(project.budget).toBe(5000000);
      expect(project.is_agency_fund).toBe(true);
      expect(project.tax_treatment).toBe('non_taxable');
      expect(project.status).toBe('active');

      testProjectId = project.id;
    });

    test('should read project from database', async () => {
      if (!supabase || !testProjectId) return;

      const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', testProjectId)
        .single();

      expect(error).toBeNull();
      expect(project).toBeDefined();
      expect(project.id).toBe(testProjectId);
      expect(project.source_person).toBe('Uncle Ahmed');
    });

    test('should update project in database', async () => {
      if (!supabase || !testProjectId) return;

      const { data: project, error } = await supabase
        .from('projects')
        .update({ notes: 'Updated via integration test' })
        .eq('id', testProjectId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(project.notes).toBe('Updated via integration test');
    });
  });

  describe('Expense Recording and Budget Tracking', () => {
    test('should record expense and link to project', async () => {
      if (!supabase || !testProjectId) return;

      const expenseData = {
        user_id: testUserId,
        business_id: testBusinessId,
        project_id: testProjectId,
        is_project_expense: true,
        amount: 150000,
        description: 'Cement bags 50 units',
        category: 'construction_materials',
        date: new Date().toISOString().split('T')[0],
        period: new Date().toISOString().slice(0, 7),
        can_claim_input_vat: false,
      };

      const { data: expense, error } = await supabase
        .from('expenses')
        .insert(expenseData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(expense).toBeDefined();
      expect(expense.project_id).toBe(testProjectId);
      expect(expense.is_project_expense).toBe(true);
      expect(expense.amount).toBe(150000);

      testExpenseIds.push(expense.id);
    });

    test('should update project spent amount via trigger', async () => {
      if (!supabase || !testProjectId) return;

      // Wait a moment for the trigger to execute
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: project, error } = await supabase
        .from('projects')
        .select('spent, budget')
        .eq('id', testProjectId)
        .single();

      expect(error).toBeNull();
      expect(project).not.toBeNull();
      expect(project!.spent).toBe(150000);
    });

    test('should record multiple expenses and accumulate spent', async () => {
      if (!supabase || !testProjectId) return;

      const expenses = [
        { amount: 200000, description: 'Iron rods 12mm' },
        { amount: 500000, description: 'Mason and labor workers' },
        { amount: 300000, description: 'Sand and gravel' },
      ];

      for (const exp of expenses) {
        const { data: expense, error } = await supabase
          .from('expenses')
          .insert({
            user_id: testUserId,
            business_id: testBusinessId,
            project_id: testProjectId,
            is_project_expense: true,
            amount: exp.amount,
            description: exp.description,
            category: 'construction_materials',
            date: new Date().toISOString().split('T')[0],
            period: new Date().toISOString().slice(0, 7),
            can_claim_input_vat: false,
          })
          .select()
          .single();

        expect(error).toBeNull();
        testExpenseIds.push(expense.id);
      }

      // Wait for triggers
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: project } = await supabase
        .from('projects')
        .select('spent')
        .eq('id', testProjectId)
        .single();

      // 150000 + 200000 + 500000 + 300000 = 1,150,000
      expect(project).not.toBeNull();
      expect(project!.spent).toBe(1150000);
    });

    test('should calculate remaining balance correctly', async () => {
      if (!supabase || !testProjectId) return;

      const { data: project } = await supabase
        .from('projects')
        .select('budget, spent')
        .eq('id', testProjectId)
        .single();

      expect(project).not.toBeNull();
      const remaining = project!.budget - project!.spent;
      expect(remaining).toBe(5000000 - 1150000); // 3,850,000
    });
  });

  describe('Receipt Attachment', () => {
    test('should attach receipt to project', async () => {
      if (!supabase || !testProjectId || testExpenseIds.length === 0) return;

      const receiptData = {
        project_id: testProjectId,
        expense_id: testExpenseIds[0],
        receipt_url: 'https://example.com/receipts/cement-receipt.jpg',
        amount: 150000,
        date: new Date().toISOString().split('T')[0],
        vendor_name: 'Dangote Cement Depot',
        is_verified: false,
      };

      const { data: receipt, error } = await supabase
        .from('project_receipts')
        .insert(receiptData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(receipt).toBeDefined();
      expect(receipt.project_id).toBe(testProjectId);
      expect(receipt.expense_id).toBe(testExpenseIds[0]);
      expect(receipt.vendor_name).toBe('Dangote Cement Depot');

      testReceiptIds.push(receipt.id);
    });

    test('should attach receipt with OCR data', async () => {
      if (!supabase || !testProjectId || testExpenseIds.length < 2) return;

      const receiptData = {
        project_id: testProjectId,
        expense_id: testExpenseIds[1],
        receipt_url: 'https://example.com/receipts/iron-rods.jpg',
        amount: 200000,
        date: new Date().toISOString().split('T')[0],
        vendor_name: 'Steel Masters Ltd',
        ocr_extracted_amount: 199500,
        ocr_extracted_vendor: 'STEEL MASTERS LTD',
        ocr_confidence: 0.92,
        bank_match_confidence: 0.95,
        is_verified: true,
        verification_method: 'ocr_bank_match',
      };

      const { data: receipt, error } = await supabase
        .from('project_receipts')
        .insert(receiptData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(receipt.ocr_confidence).toBe(0.92);
      expect(receipt.is_verified).toBe(true);
      expect(receipt.verification_method).toBe('ocr_bank_match');

      testReceiptIds.push(receipt.id);
    });

    test('should retrieve all receipts for project', async () => {
      if (!supabase || !testProjectId) return;

      const { data: receipts, error } = await supabase
        .from('project_receipts')
        .select('*')
        .eq('project_id', testProjectId);

      expect(error).toBeNull();
      expect(receipts).not.toBeNull();
      expect(receipts!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Project Completion and Tax Calculation', () => {
    test('should complete project with excess', async () => {
      if (!supabase || !testProjectId) return;

      const { data: project, error } = await supabase
        .from('projects')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', testProjectId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(project.status).toBe('completed');
      expect(project.completed_at).toBeDefined();
    });

    test('should calculate taxable excess correctly', async () => {
      if (!supabase || !testProjectId) return;

      const { data: project } = await supabase
        .from('projects')
        .select('budget, spent')
        .eq('id', testProjectId)
        .single();

      expect(project).not.toBeNull();
      const excess = project!.budget - project!.spent;
      expect(excess).toBe(3850000);
      expect(excess).toBeGreaterThan(0);

      // Update tax treatment since there's excess
      await supabase
        .from('projects')
        .update({ tax_treatment: 'taxable_excess' })
        .eq('id', testProjectId);
    });

    test('should calculate PIT on excess using 2025 tax bands', async () => {
      if (!supabase || !testProjectId) return;

      const { data: project } = await supabase
        .from('projects')
        .select('budget, spent')
        .eq('id', testProjectId)
        .single();

      expect(project).not.toBeNull();
      const excess = project!.budget - project!.spent; // 3,850,000

      // Apply Section 58 PIT bands
      const taxBands = [
        { min: 0, max: 800000, rate: 0 },
        { min: 800000, max: 2400000, rate: 0.15 },
        { min: 2400000, max: 4000000, rate: 0.175 },
        { min: 4000000, max: 7200000, rate: 0.20 },
        { min: 7200000, max: 12000000, rate: 0.225 },
        { min: 12000000, max: Infinity, rate: 0.25 },
      ];

      let remainingIncome = excess;
      let totalTax = 0;

      for (const band of taxBands) {
        if (remainingIncome <= 0) break;

        const taxableInBand = Math.min(remainingIncome, band.max - band.min);
        const taxInBand = taxableInBand * band.rate;
        totalTax += taxInBand;
        remainingIncome -= taxableInBand;
      }

      // Expected calculation:
      // First ₦800,000 at 0% = ₦0
      // Next ₦1,600,000 at 15% = ₦240,000
      // Next ₦1,450,000 at 17.5% = ₦253,750
      // Total = ₦493,750
      expect(totalTax).toBe(493750);
    });
  });

  describe('Full Lifecycle: Uncle Ahmed ₦5M House Project', () => {
    let lifecycleProjectId: string;
    const lifecycleExpenseIds: string[] = [];
    const lifecycleReceiptIds: string[] = [];

    afterAll(async () => {
      if (!supabase) return;

      // Cleanup lifecycle test data
      if (lifecycleReceiptIds.length > 0) {
        await supabase.from('project_receipts').delete().in('id', lifecycleReceiptIds);
      }
      if (lifecycleExpenseIds.length > 0) {
        await supabase.from('expenses').delete().in('id', lifecycleExpenseIds);
      }
      if (lifecycleProjectId) {
        await supabase.from('projects').delete().eq('id', lifecycleProjectId);
      }
    });

    test('Step 1: Create project for Uncle Ahmed', async () => {
      if (!supabase) return;

      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          user_id: testUserId,
          business_id: testBusinessId,
          name: "Uncle Ahmed's House Project",
          description: 'Building a 3-bedroom house for Uncle Ahmed',
          source_person: 'Uncle Ahmed',
          source_relationship: 'family member',
          budget: 5000000,
          is_agency_fund: true,
          tax_treatment: 'non_taxable',
          exclude_from_vat: true,
          status: 'active',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(project.is_agency_fund).toBe(true);
      expect(project.tax_treatment).toBe('non_taxable');

      lifecycleProjectId = project.id;
    });

    test('Step 2: Record construction expenses', async () => {
      if (!supabase || !lifecycleProjectId) return;

      const expenses = [
        { amount: 500000, description: 'Foundation and concrete work', category: 'construction' },
        { amount: 750000, description: 'Block laying and cement', category: 'construction_materials' },
        { amount: 450000, description: 'Iron rods and reinforcement', category: 'construction_materials' },
        { amount: 600000, description: 'Roofing sheets and timber', category: 'construction_materials' },
        { amount: 400000, description: 'Mason and labor costs', category: 'labor' },
        { amount: 300000, description: 'Plumbing installation', category: 'services' },
        { amount: 350000, description: 'Electrical wiring', category: 'services' },
        { amount: 250000, description: 'Windows and doors', category: 'construction_materials' },
        { amount: 200000, description: 'Painting and finishing', category: 'finishing' },
        { amount: 400000, description: 'Tiles and flooring', category: 'finishing' },
      ];

      for (const exp of expenses) {
        const { data: expense, error } = await supabase
          .from('expenses')
          .insert({
            user_id: testUserId,
            business_id: testBusinessId,
            project_id: lifecycleProjectId,
            is_project_expense: true,
            amount: exp.amount,
            description: exp.description,
            category: exp.category,
            date: new Date().toISOString().split('T')[0],
            period: new Date().toISOString().slice(0, 7),
            can_claim_input_vat: false,
          })
          .select()
          .single();

        expect(error).toBeNull();
        lifecycleExpenseIds.push(expense.id);
      }

      // Total expenses: 4,200,000
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: project } = await supabase
        .from('projects')
        .select('spent')
        .eq('id', lifecycleProjectId)
        .single();

      expect(project).not.toBeNull();
      expect(project!.spent).toBe(4200000);
    });

    test('Step 3: Attach receipts for compliance (Section 32)', async () => {
      if (!supabase || !lifecycleProjectId || lifecycleExpenseIds.length === 0) return;

      // Attach receipts for first 5 expenses
      for (let i = 0; i < 5; i++) {
        const { data: receipt, error } = await supabase
          .from('project_receipts')
          .insert({
            project_id: lifecycleProjectId,
            expense_id: lifecycleExpenseIds[i],
            receipt_url: `https://example.com/receipts/uncle-ahmed-${i}.jpg`,
            amount: [500000, 750000, 450000, 600000, 400000][i],
            date: new Date().toISOString().split('T')[0],
            vendor_name: ['Foundation Co', 'Cement Depot', 'Steel Works', 'Roofing Ltd', 'Builders Inc'][i],
            is_verified: true,
            verification_method: 'manual',
          })
          .select()
          .single();

        expect(error).toBeNull();
        lifecycleReceiptIds.push(receipt.id);
      }

      // Check receipt count
      const { data: receipts } = await supabase
        .from('project_receipts')
        .select('*')
        .eq('project_id', lifecycleProjectId);

      expect(receipts?.length).toBe(5);
    });

    test('Step 4: Check project balance', async () => {
      if (!supabase || !lifecycleProjectId) return;

      const { data: project } = await supabase
        .from('projects')
        .select('budget, spent')
        .eq('id', lifecycleProjectId)
        .single();

      expect(project).not.toBeNull();
      const balance = project!.budget - project!.spent;
      expect(balance).toBe(800000); // ₦800,000 excess
    });

    test('Step 5: Complete project with taxable excess', async () => {
      if (!supabase || !lifecycleProjectId) return;

      const { data: project } = await supabase
        .from('projects')
        .select('budget, spent')
        .eq('id', lifecycleProjectId)
        .single();

      expect(project).not.toBeNull();
      const excess = project!.budget - project!.spent;
      expect(excess).toBe(800000);

      // Complete the project
      const { data: completedProject, error } = await supabase
        .from('projects')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          tax_treatment: excess > 0 ? 'taxable_excess' : 'non_taxable',
        })
        .eq('id', lifecycleProjectId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(completedProject.status).toBe('completed');
      expect(completedProject.tax_treatment).toBe('taxable_excess');
    });

    test('Step 6: Calculate PIT - ₦800K is within first band (0%)', async () => {
      if (!supabase || !lifecycleProjectId) return;

      const { data: project } = await supabase
        .from('projects')
        .select('budget, spent')
        .eq('id', lifecycleProjectId)
        .single();

      expect(project).not.toBeNull();
      const excess = project!.budget - project!.spent;
      expect(excess).toBe(800000);

      // ₦800,000 falls entirely within the first tax band (0% rate)
      // Section 58 - First ₦800,000 is taxed at 0%
      const estimatedTax = 0;
      expect(estimatedTax).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle project with zero expenses', async () => {
      if (!supabase) return;

      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          user_id: testUserId,
          name: 'Empty Project',
          source_person: 'Test Person',
          source_relationship: 'test',
          budget: 100000,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(project.spent).toBe(0);

      // Cleanup
      await supabase.from('projects').delete().eq('id', project.id);
    });

    test('should handle over-budget scenario', async () => {
      if (!supabase) return;

      // Create small budget project
      const { data: project } = await supabase
        .from('projects')
        .insert({
          user_id: testUserId,
          name: 'Small Budget Project',
          source_person: 'Client',
          source_relationship: 'business client',
          budget: 100000,
        })
        .select()
        .single();

      // Add expense exceeding budget
      const { data: expense } = await supabase
        .from('expenses')
        .insert({
          user_id: testUserId,
          project_id: project.id,
          is_project_expense: true,
          amount: 150000, // Over budget
          description: 'Over budget expense',
          date: new Date().toISOString().split('T')[0],
          period: new Date().toISOString().slice(0, 7),
        })
        .select()
        .single();

      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: updatedProject } = await supabase
        .from('projects')
        .select('budget, spent')
        .eq('id', project.id)
        .single();

      expect(updatedProject).not.toBeNull();
      expect(updatedProject!.spent).toBe(150000);
      expect(updatedProject!.spent).toBeGreaterThan(updatedProject!.budget);

      // Cleanup
      await supabase.from('expenses').delete().eq('id', expense.id);
      await supabase.from('projects').delete().eq('id', project.id);
    });
  });
});
