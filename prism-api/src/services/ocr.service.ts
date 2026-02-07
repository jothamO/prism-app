import { createWorker } from "tesseract.js";
import Anthropic from "@anthropic-ai/sdk";

export class OCRService {
  private claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY! });

  async extractInvoice(imageBuffer: Buffer) {
    const worker = await createWorker("eng");
    const {
      data: { text, confidence },
    } = await worker.recognize(imageBuffer);
    await worker.terminate();

    const ocrConfidence = confidence / 100; // Normalize to 0-1

    const response = await this.claude.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: `Extract invoice data from this text. Return ONLY valid JSON.

Text:
${text}

Required JSON format:
{
  "invoiceNumber": "INV-123",
  "date": "2025-11-15",
  "customerName": "Company Name",
  "items": [
    {
      "description": "Product/Service",
      "quantity": 10,
      "unitPrice": 1000,
      "total": 10000
    }
  ],
  "subtotal": 10000,
  "vatAmount": 750,
  "total": 10750,
  "hasVAT": true
}`,
        },
      ],
    });

    const jsonText = (response.content[0].type === "text" ? response.content[0].text : "")
      .replace(/```json|```/g, "")
      .trim();

    const data = JSON.parse(jsonText);

    if (!data.invoiceNumber || !data.date || !data.items || data.items.length === 0) {
      throw new Error("Invalid invoice data extracted");
    }

    return { ...data, ocrConfidence };
  }

  async extractExpense(imageBuffer: Buffer) {
    const worker = await createWorker("eng");
    const {
      data: { text },
    } = await worker.recognize(imageBuffer);
    await worker.terminate();

    const response = await this.claude.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: `Extract expense receipt data. Return ONLY JSON.

Text:
${text}

Format:
{
  "description": "Electricity bill",
  "supplier": "IKEDC",
  "amount": 150000,
  "vatAmount": 10465,
  "date": "2025-08-20"
}`,
        },
      ],
    });

    const jsonText = (response.content[0].type === "text" ? response.content[0].text : "")
      .replace(/```json|```/g, "")
      .trim();
    return JSON.parse(jsonText);
  }

  /**
   * Alias for extractExpense - used by message-handler.service
   */
  async extractReceipt(photoUrl: string | Buffer) {
    // If URL string passed, fetch it as buffer first
    if (typeof photoUrl === 'string') {
      const response = await fetch(photoUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      return this.extractExpense(buffer);
    }
    return this.extractExpense(photoUrl);
  }
}

export const ocrService = new OCRService();
