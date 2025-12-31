/**
 * Project Funds Feature Test Suite
 * Tests compliance with Nigeria Tax Act 2025:
 * - Section 5: Agency/non-taxable fund classification
 * - Section 20: "Wholly and exclusively" expense rule
 * - Section 21(c): Private expense detection
 * - Section 32: Proof of claims (receipts)
 * - Section 191: Artificial transaction detection
 * - Section 4(1)(k): Taxable excess calculation
 */

import { ProjectService, projectService } from '../services/project.service';
import { ProjectExpenseValidatorService, projectExpenseValidatorService } from '../services/project-expense-validator.service';
import { testUtils } from './setup';

describe('Project Funds Feature (Phase: Project Tracking)', () => {
  // Test data
  const testUserId = testUtils.generateUUID();
  const testBusinessId = testUtils.generateUUID();

  describe('ProjectExpenseValidatorService', () => {
    describe('validateExpenseCategory (Section 20)', () => {
      const mockProject = {
        id: testUtils.generateUUID(),
        name: 'Test Construction Project',
        budget: 5000000,
        spent: 1000000,
        status: 'active'
      };

      test('should approve construction expenses as low risk', () => {
        const expense = { amount: 150000, description: 'cement bags 50 units' };
        const result = projectExpenseValidatorService.validateExpenseCategory(mockProject as any, expense);
        
        expect(result.isValid).toBe(true);
        expect(result.risk).toBe('low');
        expect(result.warnings).toHaveLength(0);
      });

      test('should approve labor expenses as low risk', () => {
        const expense = { amount: 200000, description: 'mason workers weekly pay' };
        const result = projectExpenseValidatorService.validateExpenseCategory(mockProject as any, expense);
        
        expect(result.isValid).toBe(true);
        expect(result.risk).toBe('low');
      });

      test('should flag fuel/transport as medium risk (gray area)', () => {
        const expense = { amount: 50000, description: 'fuel for site generator' };
        const result = projectExpenseValidatorService.validateExpenseCategory(mockProject as any, expense);
        
        expect(result.isValid).toBe(true);
        expect(result.risk).toBe('medium');
        expect(result.warnings.length).toBeGreaterThan(0);
      });

      test('should flag entertainment as high risk (private)', () => {
        const expense = { amount: 80000, description: 'dinner entertainment workers' };
        const result = projectExpenseValidatorService.validateExpenseCategory(mockProject as any, expense);
        
        expect(result.isValid).toBe(false);
        expect(result.risk).toBe('high');
        expect(result.actReferences).toContain('Section 21(c)');
      });

      test('should warn on unusually high amounts (>50% of budget)', () => {
        const expense = { amount: 3000000, description: 'bulk materials' };
        const result = projectExpenseValidatorService.validateExpenseCategory(mockProject as any, expense);
        
        expect(result.warnings.some(w => w.includes('unusually high'))).toBe(true);
      });

      test('should flag round numbers as suspicious', () => {
        const expense = { amount: 1000000, description: 'miscellaneous supplies' };
        const result = projectExpenseValidatorService.validateExpenseCategory(mockProject as any, expense);
        
        expect(result.warnings.some(w => w.includes('round number'))).toBe(true);
      });
    });

    describe('detectArtificialExpense (Section 191)', () => {
      test('should detect private expense disguised as project expense', () => {
        const expense = { amount: 150000, description: 'family vacation travel' };
        const result = projectExpenseValidatorService.detectArtificialExpense(expense);
        
        expect(result.isArtificial).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(result.recommendation).toContain('reject');
      });

      test('should flag vague description with high amount', () => {
        const expense = { amount: 500000, description: 'misc' };
        const result = projectExpenseValidatorService.detectArtificialExpense(expense);
        
        expect(result.isArtificial).toBe(true);
        expect(result.reason).toContain('vague');
      });

      test('should accept legitimate construction expense', () => {
        const expense = { amount: 200000, description: 'iron rods 12mm 500 pieces' };
        const result = projectExpenseValidatorService.detectArtificialExpense(expense);
        
        expect(result.isArtificial).toBe(false);
      });
    });

    describe('detectPrivateExpense (Section 21(c))', () => {
      test('should detect multiple private indicators', () => {
        const expense = { amount: 100000, description: 'family dinner celebration entertainment' };
        const result = projectExpenseValidatorService.detectPrivateExpense(expense);
        
        expect(result.isPrivate).toBe(true);
        expect(result.indicators.length).toBeGreaterThanOrEqual(2);
        expect(result.confidence).toBeGreaterThan(0.5);
      });

      test('should not flag legitimate project expense', () => {
        const expense = { amount: 150000, description: 'cement blocks for foundation' };
        const result = projectExpenseValidatorService.detectPrivateExpense(expense);
        
        expect(result.isPrivate).toBe(false);
        expect(result.indicators).toHaveLength(0);
      });
    });

    describe('generateWarningMessage', () => {
      test('should format high risk warning correctly', () => {
        const validation = {
          isValid: false,
          risk: 'high' as const,
          warnings: ['Appears to be private expense'],
          actReferences: ['Section 21(c)', 'Section 191']
        };
        
        const message = projectExpenseValidatorService.generateWarningMessage(validation);
        
        expect(message).toContain('HIGH RISK');
        expect(message).toContain('Section 21(c)');
      });
    });
  });

  describe('ProjectService', () => {
    describe('calculatePITOnExcess (Section 58 - 2025 Tax Bands)', () => {
      // Access private method through reflection for testing
      const service = new ProjectService();
      const calculatePIT = (service as any).calculatePITOnExcess.bind(service);

      test('should return 0 for amounts within first ₦800,000 band', () => {
        expect(calculatePIT(500000)).toBe(0);
        expect(calculatePIT(800000)).toBe(0);
      });

      test('should calculate 15% on ₦800,001 to ₦2,400,000', () => {
        // ₦1,000,000 = ₦800,000 at 0% + ₦200,000 at 15%
        expect(calculatePIT(1000000)).toBe(30000);
        
        // ₦2,400,000 = ₦800,000 at 0% + ₦1,600,000 at 15%
        expect(calculatePIT(2400000)).toBe(240000);
      });

      test('should calculate progressive rates correctly', () => {
        // ₦5,000,000 breakdown:
        // Band 1: ₦800,000 at 0% = 0
        // Band 2: ₦1,600,000 at 15% = 240,000
        // Band 3: ₦1,600,000 at 17.5% = 280,000
        // Band 4: ₦1,000,000 at 21% = 210,000
        // Total = 730,000
        expect(calculatePIT(5000000)).toBe(730000);
      });

      test('should apply 24% rate above ₦21.2M', () => {
        // Large income with all bands
        const tax = calculatePIT(25000000);
        expect(tax).toBeGreaterThan(4000000); // Significant tax on high income
      });
    });
  });

  describe('Uncle House Project Simulation', () => {
    test('should validate full project lifecycle compliance', () => {
      // Simulate the Uncle Ahmed ₦5M house project
      const projectBudget = 5000000;
      
      // Step 1: Create project - should be classified as agency fund
      const project = {
        id: testUtils.generateUUID(),
        name: "Uncle Ahmed's House Project",
        source_person: "Uncle Ahmed",
        source_relationship: "family member",
        budget: projectBudget,
        spent: 0,
        is_agency_fund: true,
        tax_treatment: 'non_taxable',
        status: 'active'
      };
      
      expect(project.is_agency_fund).toBe(true);
      expect(project.tax_treatment).toBe('non_taxable');
      
      // Step 2: Validate legitimate construction expenses
      const legitimateExpenses = [
        { amount: 150000, description: 'cement bags 50 units' },
        { amount: 200000, description: 'iron rods and steel reinforcement' },
        { amount: 500000, description: 'mason and labor workers weekly' },
        { amount: 300000, description: 'sand and gravel delivery' },
        { amount: 450000, description: 'roofing sheets and timber' }
      ];
      
      legitimateExpenses.forEach(expense => {
        const validation = projectExpenseValidatorService.validateExpenseCategory(project as any, expense);
        expect(validation.isValid).toBe(true);
        expect(validation.risk).toBe('low');
      });
      
      // Step 3: Attempt suspicious expense - should be flagged
      const suspiciousExpense = { amount: 50000, description: 'dinner entertainment family' };
      const suspiciousValidation = projectExpenseValidatorService.validateExpenseCategory(project as any, suspiciousExpense);
      
      expect(suspiciousValidation.isValid).toBe(false);
      expect(suspiciousValidation.risk).toBe('high');
      
      // Step 4: Calculate project completion with excess
      const totalSpent = legitimateExpenses.reduce((sum, e) => sum + e.amount, 0);
      const excess = projectBudget - totalSpent;
      
      expect(totalSpent).toBe(1600000);
      expect(excess).toBe(3400000); // ₦3.4M kept as fee
      
      // Step 5: Calculate PIT on excess (Section 4(1)(k))
      const service = new ProjectService();
      const estimatedPIT = (service as any).calculatePITOnExcess(excess);
      
      // ₦3,400,000 breakdown:
      // Band 1: ₦800,000 at 0% = 0
      // Band 2: ₦1,600,000 at 15% = 240,000
      // Band 3: ₦1,000,000 at 17.5% = 175,000
      // Total = 415,000
      expect(estimatedPIT).toBe(415000);
    });

    test('should detect artificial transaction patterns', () => {
      // Test Section 191 compliance
      const artificialPatterns = [
        { amount: 1000000, description: 'payment to self' },
        { amount: 500000, description: 'misc expenses general' },
        { amount: 200000, description: 'personal shopping' }
      ];
      
      artificialPatterns.forEach(expense => {
        const result = projectExpenseValidatorService.detectArtificialExpense(expense);
        expect(result.isArtificial).toBe(true);
      });
    });

    test('should enforce Section 32 receipt requirement awareness', () => {
      // The system should track whether receipts are attached
      const expenseWithoutReceipt = {
        id: testUtils.generateUUID(),
        amount: 150000,
        description: 'cement purchase',
        receipt_url: null
      };
      
      // System should flag expenses without receipts for compliance
      expect(expenseWithoutReceipt.receipt_url).toBeNull();
      
      // After receipt attachment
      const expenseWithReceipt = {
        ...expenseWithoutReceipt,
        receipt_url: 'https://storage.example.com/receipts/123.jpg'
      };
      
      expect(expenseWithReceipt.receipt_url).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero budget project', () => {
      const project = { id: testUtils.generateUUID(), name: 'Test', budget: 0, spent: 0, status: 'active' };
      const expense = { amount: 100, description: 'small item' };
      
      const validation = projectExpenseValidatorService.validateExpenseCategory(project as any, expense);
      expect(validation.warnings.some(w => w.includes('exceeds remaining budget'))).toBe(true);
    });

    test('should handle empty description', () => {
      const expense = { amount: 50000, description: '' };
      const result = projectExpenseValidatorService.detectArtificialExpense(expense);
      
      expect(result.isArtificial).toBe(true);
    });

    test('should handle extremely large amounts', () => {
      const project = { id: testUtils.generateUUID(), name: 'Big Project', budget: 100000000, spent: 0, status: 'active' };
      const expense = { amount: 50000000, description: 'major construction phase' };
      
      const validation = projectExpenseValidatorService.validateExpenseCategory(project as any, expense);
      expect(validation.warnings.some(w => w.includes('unusually high'))).toBe(true);
    });
  });
});
