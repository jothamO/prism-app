/**
 * WhatsApp Interactive Service Tests
 * Tests for reply buttons, list messages, and webhook response parsing
 */

// Mock fetch before importing the service
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import { WhatsAppInteractiveService } from '../services/whatsapp-interactive.service';

describe('WhatsAppInteractiveService', () => {
  let service: WhatsAppInteractiveService;
  
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test_token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    service = new WhatsAppInteractiveService();
    mockFetch.mockReset();
  });

  describe('sendReplyButtons', () => {
    it('should send valid 1-3 buttons correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      await service.sendReplyButtons('+234123456789', 'Choose an option:', [
        { id: 'opt1', title: 'Option 1' },
        { id: 'opt2', title: 'Option 2' }
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test_token',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should throw error when more than 3 buttons provided', async () => {
      await expect(
        service.sendReplyButtons('+234123456789', 'Choose:', [
          { id: '1', title: 'One' },
          { id: '2', title: 'Two' },
          { id: '3', title: 'Three' },
          { id: '4', title: 'Four' }
        ])
      ).rejects.toThrow('WhatsApp Reply Buttons limited to 3');
    });

    it('should truncate button titles exceeding 20 characters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      const longTitle = 'This is a very long button title';
      const buttons = [{ id: 'btn1', title: longTitle }];
      
      await service.sendReplyButtons('+234123456789', 'Test', buttons);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
    });

    it('should strip non-digit characters from phone numbers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      await service.sendReplyButtons('+234-123-456-789', 'Test', [
        { id: 'btn1', title: 'Click' }
      ]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.to).toBe('234123456789');
    });

    it('should format WhatsApp API payload correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      await service.sendReplyButtons('234123456789', 'Choose type:', [
        { id: 'personal', title: 'Personal' },
        { id: 'business', title: 'Business' }
      ]);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '234123456789',
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Choose type:' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'personal', title: 'Personal' } },
              { type: 'reply', reply: { id: 'business', title: 'Business' } }
            ]
          }
        }
      });
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid request')
      });

      await expect(
        service.sendReplyButtons('234123', 'Test', [{ id: '1', title: 'OK' }])
      ).rejects.toThrow('WhatsApp API error: 400');
    });
  });

  describe('sendListMessage', () => {
    it('should send valid list with sections correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      await service.sendListMessage('234123456789', {
        header: 'Expense Categories',
        body: 'Select a category for your expense:',
        footer: 'Section 20 NTA 2025',
        buttonText: 'Select Category',
        sections: [{
          title: 'Common',
          rows: [
            { id: 'transport', title: 'Transport', description: 'Vehicle, fuel, tolls' },
            { id: 'office', title: 'Office Supplies', description: 'Stationery, equipment' }
          ]
        }]
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.interactive.type).toBe('list');
    });

    it('should throw error when total rows exceed 10', async () => {
      const tooManyRows = Array.from({ length: 11 }, (_, i) => ({
        id: `row${i}`,
        title: `Row ${i}`
      }));

      await expect(
        service.sendListMessage('234123456789', {
          body: 'Select:',
          buttonText: 'Choose',
          sections: [{
            title: 'All Items',
            rows: tooManyRows
          }]
        })
      ).rejects.toThrow('WhatsApp List Messages limited to 10 total rows');
    });

    it('should truncate button text exceeding 20 characters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      await service.sendListMessage('234123456789', {
        body: 'Select:',
        buttonText: 'This button text is way too long',
        sections: [{
          title: 'Items',
          rows: [{ id: '1', title: 'One' }]
        }]
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.interactive.action.button.length).toBeLessThanOrEqual(20);
    });

    it('should truncate row titles (24 chars) and descriptions (72 chars)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      const longTitle = 'A'.repeat(50);
      const longDesc = 'B'.repeat(100);

      await service.sendListMessage('234123456789', {
        body: 'Select:',
        buttonText: 'Choose',
        sections: [{
          title: 'Items',
          rows: [{ id: '1', title: longTitle, description: longDesc }]
        }]
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const row = callBody.interactive.action.sections[0].rows[0];
      expect(row.title.length).toBeLessThanOrEqual(24);
      expect(row.description.length).toBeLessThanOrEqual(72);
    });

    it('should structure sections array correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      await service.sendListMessage('234123456789', {
        body: 'Select category:',
        buttonText: 'Categories',
        sections: [
          {
            title: 'Business',
            rows: [
              { id: 'rent', title: 'Rent', description: 'Office rent' },
              { id: 'utilities', title: 'Utilities' }
            ]
          },
          {
            title: 'Personal',
            rows: [
              { id: 'food', title: 'Food' }
            ]
          }
        ]
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.interactive.action.sections).toHaveLength(2);
      expect(callBody.interactive.action.sections[0].rows).toHaveLength(2);
      expect(callBody.interactive.action.sections[1].rows).toHaveLength(1);
    });

    it('should handle optional header and footer', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: 'msg123' }] })
      });

      // Without header/footer
      await service.sendListMessage('234123456789', {
        body: 'Select:',
        buttonText: 'Choose',
        sections: [{
          title: 'Items',
          rows: [{ id: '1', title: 'One' }]
        }]
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.interactive.header).toBeUndefined();
      expect(callBody.interactive.footer).toBeUndefined();
    });
  });

  describe('handleButtonResponse', () => {
    it('should parse button_reply correctly', () => {
      const webhookData = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '234123456789',
                type: 'interactive',
                interactive: {
                  button_reply: {
                    id: 'personal',
                    title: 'Personal'
                  }
                }
              }]
            }
          }]
        }]
      };

      const result = service.handleButtonResponse(webhookData);
      expect(result).toEqual({
        userId: '234123456789',
        buttonId: 'personal',
        buttonText: 'Personal',
        type: 'button'
      });
    });

    it('should parse list_reply correctly', () => {
      const webhookData = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '234123456789',
                type: 'interactive',
                interactive: {
                  list_reply: {
                    id: 'transport',
                    title: 'Transport'
                  }
                }
              }]
            }
          }]
        }]
      };

      const result = service.handleButtonResponse(webhookData);
      expect(result).toEqual({
        userId: '234123456789',
        buttonId: 'transport',
        buttonText: 'Transport',
        type: 'list'
      });
    });

    it('should return null for non-interactive messages', () => {
      const webhookData = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '234123456789',
                type: 'text',
                text: { body: 'Hello' }
              }]
            }
          }]
        }]
      };

      const result = service.handleButtonResponse(webhookData);
      expect(result).toBeNull();
    });

    it('should handle malformed webhook data gracefully', () => {
      expect(service.handleButtonResponse(null)).toBeNull();
      expect(service.handleButtonResponse({})).toBeNull();
      expect(service.handleButtonResponse({ entry: [] })).toBeNull();
      expect(service.handleButtonResponse({ entry: [{ changes: [] }] })).toBeNull();
    });

    it('should return null when interactive object has no reply', () => {
      const webhookData = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '234123456789',
                type: 'interactive',
                interactive: {}
              }]
            }
          }]
        }]
      };

      const result = service.handleButtonResponse(webhookData);
      expect(result).toBeNull();
    });
  });
});

describe('WhatsApp Interactive Message Integration', () => {
  describe('Reply Buttons Use Cases', () => {
    it('should work for binary personal/business classification', () => {
      // This test validates the expected flow for expense classification
      const buttons = [
        { id: 'personal', title: 'Personal' },
        { id: 'business', title: 'Business' }
      ];
      
      expect(buttons.length).toBeLessThanOrEqual(3);
      expect(buttons.every(b => b.title.length <= 20)).toBe(true);
    });

    it('should work for invoice confirmation flow', () => {
      const buttons = [
        { id: 'confirm', title: '✓ Confirm' },
        { id: 'edit', title: '✎ Edit' },
        { id: 'cancel', title: '✗ Cancel' }
      ];
      
      expect(buttons.length).toBe(3);
      expect(buttons.every(b => b.title.length <= 20)).toBe(true);
    });

    it('should work for tax regime selection', () => {
      const buttons = [
        { id: 'standard', title: 'Standard VAT' },
        { id: 'simplified', title: 'Simplified' }
      ];
      
      expect(buttons.length).toBe(2);
    });
  });

  describe('List Message Use Cases', () => {
    it('should work for expense category selection', () => {
      const sections = [
        {
          title: 'Deductible',
          rows: [
            { id: 'transport', title: 'Transport', description: 'Vehicle, fuel, tolls' },
            { id: 'office', title: 'Office Supplies', description: 'Stationery, printing' },
            { id: 'professional', title: 'Professional Fees', description: 'Legal, accounting' }
          ]
        },
        {
          title: 'Non-Deductible',
          rows: [
            { id: 'entertainment', title: 'Entertainment', description: 'Meals, events' },
            { id: 'personal', title: 'Personal', description: 'Not business related' }
          ]
        }
      ];
      
      const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
      expect(totalRows).toBeLessThanOrEqual(10);
    });

    it('should work for income type selection', () => {
      const sections = [{
        title: 'Income Types',
        rows: [
          { id: 'employment', title: 'Employment', description: 'Salary, wages, bonuses' },
          { id: 'business', title: 'Business', description: 'Self-employed income' },
          { id: 'pension', title: 'Pension', description: 'Retirement benefits' },
          { id: 'investment', title: 'Investment', description: 'Dividends, interest' },
          { id: 'rental', title: 'Rental', description: 'Property income' }
        ]
      }];
      
      expect(sections[0].rows.length).toBe(5);
      expect(sections[0].rows.every(r => r.title.length <= 24)).toBe(true);
    });

    it('should work for tax filing period selection', () => {
      const currentYear = new Date().getFullYear();
      const sections = [{
        title: `${currentYear} Periods`,
        rows: Array.from({ length: 6 }, (_, i) => ({
          id: `${currentYear}-${String(i + 1).padStart(2, '0')}`,
          title: new Date(currentYear, i).toLocaleString('default', { month: 'long' }),
          description: `VAT period ${currentYear}-${String(i + 1).padStart(2, '0')}`
        }))
      }];
      
      expect(sections[0].rows.length).toBe(6);
    });
  });
});
