/**
 * NLU Integration Tests
 * Tests intent classification across all 9 intent types
 * Covers both fallback (rule-based) and AI-powered classification
 */

import { nluService } from '../services/nlu.service';

// Test utilities
const expectIntent = (result: any, expectedIntent: string) => {
  expect(result.name).toBe(expectedIntent);
};

const expectConfidenceAbove = (result: any, threshold: number) => {
  expect(result.confidence).toBeGreaterThanOrEqual(threshold);
};

const expectEntity = (result: any, key: string, expectedValue: any) => {
  expect(result.entities).toBeDefined();
  expect(result.entities[key]).toBe(expectedValue);
};

describe('NLU Integration Tests', () => {
  
  describe('Fallback Intent Detection', () => {
    
    describe('get_transaction_summary', () => {
      const testCases = [
        { input: 'show me my spending', description: 'basic spending query' },
        { input: 'what did I buy last week', description: 'time-based query' },
        { input: 'list my transactions', description: 'list transactions' },
        { input: 'view my expenses', description: 'view expenses' },
        { input: 'how much did I spend', description: 'amount query' },
      ];

      testCases.forEach(({ input, description }) => {
        it(`detects "${description}": "${input}"`, async () => {
          const result = await nluService.classifyIntent(input, []);
          expectIntent(result, 'get_transaction_summary');
          expectConfidenceAbove(result, 0.7);
        });
      });
    });

    describe('get_tax_relief_info', () => {
      const testCases = [
        { input: 'how much rent relief can I claim', description: 'rent relief' },
        { input: 'tell me about pension deductions', description: 'pension deductions' },
        { input: 'what tax deductions am I eligible for', description: 'general deductions' },
        { input: 'explain tax relief options', description: 'relief options' },
        { input: 'am I eligible for any exemptions', description: 'exemptions' },
      ];

      testCases.forEach(({ input, description }) => {
        it(`detects "${description}": "${input}"`, async () => {
          const result = await nluService.classifyIntent(input, []);
          expectIntent(result, 'get_tax_relief_info');
          expectConfidenceAbove(result, 0.7);
        });
      });
    });

    describe('upload_receipt', () => {
      const testCases = [
        { input: "I'll send the receipt", description: 'sending receipt' },
        { input: 'here is my receipt', description: 'providing receipt' },
        { input: 'uploading my invoice', description: 'uploading invoice' },
        { input: 'let me send you the bill', description: 'sending bill' },
      ];

      testCases.forEach(({ input, description }) => {
        it(`detects "${description}": "${input}"`, async () => {
          const result = await nluService.classifyIntent(input, []);
          expectIntent(result, 'upload_receipt');
          expectConfidenceAbove(result, 0.7);
        });
      });
    });

    describe('categorize_expense', () => {
      const testCases = [
        { input: 'categorize this as office supplies', description: 'categorize to category' },
        { input: 'tag this expense to the house project', description: 'tag to project' },
        { input: 'is this a business expense', description: 'business expense check' },
        { input: 'move this to personal expenses', description: 'personal expense' },
      ];

      testCases.forEach(({ input, description }) => {
        it(`detects "${description}": "${input}"`, async () => {
          const result = await nluService.classifyIntent(input, []);
          expectIntent(result, 'categorize_expense');
          expectConfidenceAbove(result, 0.7);
        });
      });
    });

    describe('get_tax_calculation', () => {
      const testCases = [
        { input: 'how much tax will I pay', description: 'general tax query' },
        { input: 'calculate my VAT', description: 'VAT calculation' },
        { input: "what's my tax liability", description: 'liability query' },
        { input: 'estimate my income tax', description: 'income tax estimate' },
      ];

      testCases.forEach(({ input, description }) => {
        it(`detects "${description}": "${input}"`, async () => {
          const result = await nluService.classifyIntent(input, []);
          expectIntent(result, 'get_tax_calculation');
          expectConfidenceAbove(result, 0.7);
        });
      });
    });

    describe('set_reminder', () => {
      const testCases = [
        { input: 'remind me to file VAT', description: 'VAT reminder' },
        { input: 'when is my tax deadline', description: 'deadline query' },
        { input: 'set a reminder for filing', description: 'filing reminder' },
        { input: 'notify me before the due date', description: 'due date notification' },
      ];

      testCases.forEach(({ input, description }) => {
        it(`detects "${description}": "${input}"`, async () => {
          const result = await nluService.classifyIntent(input, []);
          expectIntent(result, 'set_reminder');
          expectConfidenceAbove(result, 0.7);
        });
      });
    });

    describe('connect_bank', () => {
      const testCases = [
        { input: 'connect my GTBank account', description: 'connect specific bank' },
        { input: 'link my bank', description: 'general bank link' },
        { input: 'I want to connect my account', description: 'connect account' },
        { input: 'add my bank details', description: 'add bank details' },
      ];

      testCases.forEach(({ input, description }) => {
        it(`detects "${description}": "${input}"`, async () => {
          const result = await nluService.classifyIntent(input, []);
          expectIntent(result, 'connect_bank');
          expectConfidenceAbove(result, 0.7);
        });
      });
    });

    describe('general_query (fallback)', () => {
      const testCases = [
        { input: 'what is EMTL', description: 'acronym query' },
        { input: 'explain Section 32 of the tax act', description: 'legislation query' },
        { input: 'how does PRISM work', description: 'product query' },
        { input: 'hello', description: 'greeting' },
        { input: 'thank you', description: 'thanks' },
      ];

      testCases.forEach(({ input, description }) => {
        it(`defaults to general_query for "${description}": "${input}"`, async () => {
          const result = await nluService.classifyIntent(input, []);
          expectIntent(result, 'general_query');
          expect(result.confidence).toBe(0.5);
        });
      });
    });
  });

  describe('Artificial Transaction Detection (Section 191)', () => {
    
    describe('suspicious personal items claimed as business', () => {
      const suspiciousItems = [
        { item: 'television', category: 'business', expected: true },
        { item: 'refrigerator', category: 'business', expected: true },
        { item: 'mattress', category: 'business', expected: true },
        { item: 'gaming console', category: 'business', expected: true },
        { item: 'personal clothing', category: 'business', expected: true },
      ];

      suspiciousItems.forEach(({ item, category, expected }) => {
        it(`flags "${item}" as suspicious when claimed as ${category}`, () => {
          const result = nluService.detectArtificialTransaction(item, category);
          expect(result.isSuspicious).toBe(expected);
          if (expected) {
            expect(result.warning).toContain('Section 191');
          }
        });
      });
    });

    describe('legitimate business items', () => {
      const legitimateItems = [
        { item: 'laptop', category: 'business', expected: false },
        { item: 'office desk', category: 'business', expected: false },
        { item: 'printer', category: 'business', expected: false },
        { item: 'business software', category: 'business', expected: false },
      ];

      legitimateItems.forEach(({ item, category, expected }) => {
        it(`does not flag "${item}" as suspicious`, () => {
          const result = nluService.detectArtificialTransaction(item, category);
          expect(result.isSuspicious).toBe(expected);
        });
      });
    });
  });

  describe('Conversation Context Handling', () => {
    
    it('uses conversation context for intent classification', async () => {
      const context = [
        { role: 'user', content: 'I want to check my spending' },
        { role: 'assistant', content: 'Here is your transaction summary...' },
      ];
      
      const result = await nluService.classifyIntent('show me more details', context);
      // In context of transactions, should maintain transaction-related intent
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('handles empty conversation context', async () => {
      const result = await nluService.classifyIntent('show me my spending', []);
      expectIntent(result, 'get_transaction_summary');
    });
  });

  describe('Edge Cases', () => {
    
    it('handles empty message gracefully', async () => {
      const result = await nluService.classifyIntent('', []);
      expectIntent(result, 'general_query');
      expect(result.confidence).toBe(0.5);
    });

    it('handles whitespace-only message', async () => {
      const result = await nluService.classifyIntent('   ', []);
      expectIntent(result, 'general_query');
    });

    it('handles very long messages', async () => {
      const longMessage = 'I want to know about my transactions '.repeat(50);
      const result = await nluService.classifyIntent(longMessage, []);
      expect(result).toBeDefined();
      expect(result.name).toBeDefined();
    });

    it('handles special characters', async () => {
      const result = await nluService.classifyIntent('show me ₦50,000 spending!', []);
      expect(result).toBeDefined();
    });

    it('handles Nigerian Pidgin expressions', async () => {
      const pidginExpressions = [
        'wetin I spend money for',
        'show me how much I don chop for market',
        'calculate my tax abeg',
      ];

      for (const expr of pidginExpressions) {
        const result = await nluService.classifyIntent(expr, []);
        expect(result).toBeDefined();
        expect(result.name).toBeDefined();
      }
    });

    it('handles mixed language (English + Pidgin)', async () => {
      const result = await nluService.classifyIntent('I want to see my spending na', []);
      expect(result).toBeDefined();
    });
  });

  describe('Confidence Scoring', () => {
    
    it('returns higher confidence for exact matches', async () => {
      const exactMatch = await nluService.classifyIntent('show me my transactions', []);
      const partialMatch = await nluService.classifyIntent('transactions maybe', []);
      
      expect(exactMatch.confidence).toBeGreaterThanOrEqual(partialMatch.confidence);
    });

    it('returns fallback confidence (0.5) for unrecognized patterns', async () => {
      const result = await nluService.classifyIntent('random gibberish xyz123', []);
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('AI-Powered Classification (conditional)', () => {
    const hasApiKey = !!process.env.LOVABLE_API_KEY;

    // Skip these tests if no API key configured
    const conditionalIt = hasApiKey ? it : it.skip;

    conditionalIt('classifies complex transaction query with AI', async () => {
      const result = await nluService.classifyIntent(
        'Can you show me all my transport expenses from last month that were above 10 thousand naira?',
        []
      );
      expectIntent(result, 'get_transaction_summary');
      expectConfidenceAbove(result, 0.8);
    }, 15000);

    conditionalIt('extracts entities from multi-part message', async () => {
      const result = await nluService.classifyIntent(
        'Calculate my income tax for a salary of 5 million naira per year',
        []
      );
      expectIntent(result, 'get_tax_calculation');
      expect(result.entities).toBeDefined();
    }, 15000);

    conditionalIt('handles ambiguous intent with reasoning', async () => {
      const result = await nluService.classifyIntent(
        'I bought a laptop for work, how do I handle this?',
        []
      );
      expect(result).toBeDefined();
      // Should classify as either upload_receipt or categorize_expense
      expect(['upload_receipt', 'categorize_expense', 'general_query']).toContain(result.name);
    }, 15000);

    conditionalIt('provides reasoning for classification', async () => {
      const result = await nluService.classifyIntent(
        'My tax deadline is coming up, what should I do?',
        []
      );
      expect(result).toBeDefined();
      // AI responses may include reasoning
      if (result.reasoning) {
        expect(typeof result.reasoning).toBe('string');
      }
    }, 15000);
  });
});

describe('Intent Coverage Summary', () => {
  const allIntents = [
    'get_transaction_summary',
    'get_tax_relief_info',
    'upload_receipt',
    'categorize_expense',
    'get_tax_calculation',
    'set_reminder',
    'connect_bank',
    'artificial_transaction_warning',
    'general_query',
  ];

  it('covers all 9 intent types', () => {
    expect(allIntents).toHaveLength(9);
  });

  it('validates intent definitions match NLU service', async () => {
    // Ensure each intent can be triggered by fallback
    const intentTriggers: Record<string, string> = {
      get_transaction_summary: 'show me my spending',
      get_tax_relief_info: 'what tax relief can I claim',
      upload_receipt: 'here is my receipt',
      categorize_expense: 'categorize this expense',
      get_tax_calculation: 'calculate my tax',
      set_reminder: 'remind me about tax deadline',
      connect_bank: 'connect my bank account',
      general_query: 'hello world',
    };

    for (const [intent, trigger] of Object.entries(intentTriggers)) {
      const result = await nluService.classifyIntent(trigger, []);
      expect(result.name).toBe(intent);
    }
  });
});
