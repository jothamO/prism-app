import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Upload, Phone, Bot, User, Loader2, Zap, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  type?: "text" | "image" | "buttons";
  buttons?: Array<{ id: string; title: string }>;
}

type UserState = "new" | "awaiting_tin" | "awaiting_business_name" | "registered" | "awaiting_invoice" | "awaiting_confirm";

interface TestUserData {
  id?: string;
  tin?: string;
  businessName?: string;
  businessId?: string;
}

interface PendingInvoice {
  invoiceNumber: string;
  customerName: string;
  items: Array<{ description: string; quantity: number; unitPrice: number; vatAmount: number }>;
  subtotal: number;
  vatAmount: number;
  total: number;
  confidence: number;
}

const HELP_MESSAGE = `Welcome to PRISM! 🇳🇬

Available commands:
📝 *vat [amount] [description]* - Calculate VAT
💼 *tax [amount]* - Calculate income tax
🏛️ *pension [amount]* - Calculate tax for pensioners
📊 *summary* - Get your VAT filing summary
💰 *paid* - Confirm payment for a filing
📤 *upload* - Upload an invoice for processing
❓ *help* - Show this menu

Examples:
• vat 50000 electronics
• tax 10000000
• monthly tax 500000
• pension 2400000
• summary`;

const AdminSimulator = () => {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("+234");
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userState, setUserState] = useState<UserState>("new");
  const [isTyping, setIsTyping] = useState(false);
  const [userData, setUserData] = useState<TestUserData>({});
  const [testMode, setTestMode] = useState(true);
  const [pendingInvoice, setPendingInvoice] = useState<PendingInvoice | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addBotMessage = (text: string, buttons?: Array<{ id: string; title: string }>) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text,
          sender: "bot",
          timestamp: new Date(),
          type: buttons ? "buttons" : "text",
          buttons,
        },
      ]);
      setIsTyping(false);
    }, 500 + Math.random() * 300);
  };

  const addBotMessageImmediate = (text: string, buttons?: Array<{ id: string; title: string }>) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text,
        sender: "bot",
        timestamp: new Date(),
        type: buttons ? "buttons" : "text",
        buttons,
      },
    ]);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
  };

  // Call VAT Calculator API
  const callVATCalculator = async (amount: number, description: string) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/vat-calculator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, itemDescription: description })
      });
      return await response.json();
    } catch (error) {
      console.error('VAT Calculator error:', error);
      return null;
    }
  };

  // Call VAT Reconciliation API
  const callReconciliation = async (userId: string, period: string) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/vat-reconciliation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calculate', userId, period })
      });
      return await response.json();
    } catch (error) {
      console.error('Reconciliation error:', error);
      return null;
    }
  };

  // Call Invoice Processor API
  const callInvoiceProcessor = async (action: string, data: Record<string, unknown>) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/invoice-processor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
      });
      return await response.json();
    } catch (error) {
      console.error('Invoice Processor error:', error);
      return null;
    }
  };

  // Call Income Tax Calculator API
  const callIncomeTaxCalculator = async (
    grossIncome: number, 
    period: 'annual' | 'monthly',
    incomeType: 'employment' | 'pension' | 'business' | 'mixed' = 'employment',
    pensionAmount: number = 0
  ) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/income-tax-calculator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grossIncome, period, incomeType, pensionAmount, includeDeductions: true })
      });
      return await response.json();
    } catch (error) {
      console.error('Income Tax Calculator error:', error);
      return null;
    }
  };

  // Seed test user
  const seedTestUser = async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seed-test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'seed',
          scenario: 'standard-retail',
          period: new Date().toISOString().substring(0, 7)
        })
      });
      const result = await response.json();
      if (result.user && result.business) {
        setUserData({
          id: result.user.id,
          tin: '1234567890',
          businessName: result.business.name,
          businessId: result.business.id
        });
        setUserState("registered");
        return result;
      }
      return null;
    } catch (error) {
      console.error('Seed error:', error);
      return null;
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    const lowerMessage = inputMessage.toLowerCase().trim();
    setInputMessage("");

    // Handle based on user state
    if (userState === "new") {
      if (lowerMessage === "help" || lowerMessage === "hi" || lowerMessage === "hello") {
        if (testMode) {
          setIsTyping(true);
          addBotMessageImmediate("🔄 Setting up test environment...");
          const result = await seedTestUser();
          setIsTyping(false);
          
          if (result) {
            addBotMessage(
              `✅ Test environment ready!\n\n` +
              `Business: *${result.business.name}*\n` +
              `User ID: ${result.user.id.substring(0, 8)}...\n` +
              `Invoices: ${result.created.invoices}\n` +
              `Expenses: ${result.created.expenses}\n\n` +
              HELP_MESSAGE
            );
          } else {
            addBotMessage(
              "Welcome to PRISM - Nigeria's VAT automation platform! 🇳🇬\n\n" +
              "To get started, I'll need to verify your business.\n\n" +
              "Please enter your TIN (Tax Identification Number):"
            );
            setUserState("awaiting_tin");
          }
        } else {
          addBotMessage(
            "Welcome to PRISM - Nigeria's VAT automation platform! 🇳🇬\n\n" +
            "To get started, I'll need to verify your business.\n\n" +
            "Please enter your TIN (Tax Identification Number):"
          );
          setUserState("awaiting_tin");
        }
      } else {
        addBotMessage(
          "Hello! 👋 I'm the PRISM assistant.\n\nIt looks like you're new here. Type *help* or *hi* to get started!"
        );
      }
      return;
    }

    if (userState === "awaiting_tin") {
      if (/^\d{10,}$/.test(lowerMessage.replace(/\D/g, ""))) {
        setUserData((prev) => ({ ...prev, tin: inputMessage }));
        addBotMessage(
          `✅ TIN verified: ${inputMessage}\n\nNow, please enter your business name:`
        );
        setUserState("awaiting_business_name");
      } else {
        addBotMessage(
          "❌ Invalid TIN format. Please enter a valid 10+ digit Tax Identification Number:"
        );
      }
      return;
    }

    if (userState === "awaiting_business_name") {
      setUserData((prev) => ({ ...prev, businessName: inputMessage }));
      addBotMessage(
        `🎉 Registration complete!\n\nBusiness: *${inputMessage}*\nTIN: *${userData.tin}*\n\n${HELP_MESSAGE}`
      );
      setUserState("registered");
      return;
    }

    if (userState === "awaiting_confirm") {
      if (lowerMessage === "confirm" || lowerMessage === "yes" || lowerMessage === "y") {
        handleButtonClick("confirm");
      } else if (lowerMessage === "edit" || lowerMessage === "no" || lowerMessage === "n") {
        handleButtonClick("edit");
      } else {
        addBotMessage("Please type *confirm* to save the invoice or *edit* to make changes.");
      }
      return;
    }

    // Registered user commands
    if (userState === "registered" || userState === "awaiting_invoice") {
      setUserState("registered");

      if (lowerMessage === "help") {
        addBotMessage(HELP_MESSAGE);
        return;
      }

      // VAT calculation command: "vat 50000 electronics" or just a number
      const vatMatch = lowerMessage.match(/^vat\s+(\d+(?:,\d{3})*)\s*(.*)$/);
      if (vatMatch) {
        const amount = parseInt(vatMatch[1].replace(/,/g, ""));
        const description = vatMatch[2] || "general goods";
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Calculating VAT...");
        
        const result = await callVATCalculator(amount, description);
        setIsTyping(false);
        
        if (result && !result.error) {
          const classificationEmoji = 
            result.classification === 'standard' ? '📊' :
            result.classification === 'zero-rated' ? '🆓' : '🚫';
          
          addBotMessage(
            `${classificationEmoji} VAT Calculation Result:\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Classification: *${result.classification.toUpperCase()}*\n` +
            `Act Reference: ${result.actReference}\n\n` +
            `Amount: ${formatCurrency(result.subtotal)}\n` +
            `VAT (${(result.vatRate * 100).toFixed(1)}%): ${formatCurrency(result.vatAmount)}\n` +
            `Total: ${formatCurrency(result.total)}\n\n` +
            (result.canClaimInputVAT ? '✅ Input VAT claimable' : '❌ Cannot claim input VAT')
          );
        } else {
          addBotMessage("❌ Failed to calculate VAT. Please try again.");
        }
        return;
      }

      // Pension tax calculation: "pension 2400000" or "pensioner 1500000"
      const pensionMatch = lowerMessage.match(/^(?:pension(?:er)?)\s+(?:tax\s+)?[₦n]?(\d[\d,]*)/i);
      if (pensionMatch) {
        const amount = parseInt(pensionMatch[1].replace(/,/g, ""));
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Calculating pension tax...");
        
        const result = await callIncomeTaxCalculator(amount, 'annual', 'pension');
        setIsTyping(false);
        
        if (result && !result.error) {
          addBotMessage(
            `🏛️ Pension Tax Calculation\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Annual Pension: ${formatCurrency(result.grossIncome)}\n\n` +
            `✅ FULLY EXEMPT FROM INCOME TAX\n\n` +
            `Under Section 163 of the Nigeria Tax Act 2025,\n` +
            `pension, gratuity and retirement benefits received\n` +
            `under the Pension Reform Act are exempt from\n` +
            `personal income tax.\n\n` +
            `📊 Summary:\n` +
            `├─ Gross Pension: ${formatCurrency(result.grossIncome)}\n` +
            `├─ Tax Payable: ₦0\n` +
            `├─ Effective Rate: 0%\n` +
            `└─ Monthly Net: ${formatCurrency(result.monthlyNetIncome)}\n\n` +
            `Reference: ${result.actReference}`
          );
        } else {
          addBotMessage("❌ Failed to calculate pension tax. Please try again.");
        }
        return;
      }

      // Mixed income: "mixed 4000000 pension 2000000"
      const mixedMatch = lowerMessage.match(/^mixed\s+(?:tax\s+)?[₦n]?(\d[\d,]*)\s+pension\s+[₦n]?(\d[\d,]*)/i);
      if (mixedMatch) {
        const totalAmount = parseInt(mixedMatch[1].replace(/,/g, ""));
        const pensionAmount = parseInt(mixedMatch[2].replace(/,/g, ""));
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Calculating mixed income tax...");
        
        const result = await callIncomeTaxCalculator(totalAmount, 'annual', 'mixed', pensionAmount);
        setIsTyping(false);
        
        if (result && !result.error) {
          const breakdown = result.taxBreakdown
            .filter((band: { taxInBand: number }) => band.taxInBand > 0)
            .map((band: { band: string; rate: number; taxInBand: number }) => 
              `├─ ${band.band} @ ${(band.rate * 100).toFixed(0)}%: ${formatCurrency(band.taxInBand)}`
            )
            .join('\n');
          
          addBotMessage(
            `📊 Mixed Income Tax Calculation\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Total Income: ${formatCurrency(result.grossIncome)}\n` +
            `├─ Pension (Exempt): ${formatCurrency(result.pensionExemption || 0)}\n` +
            `└─ Taxable Income: ${formatCurrency(result.taxableIncome || 0)}\n\n` +
            (breakdown ? `📋 Tax Breakdown (Section 58):\n${breakdown}\n` : '') +
            `━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 Total Tax: ${formatCurrency(result.totalTax)}\n` +
            `📊 Effective Rate: ${result.effectiveRate.toFixed(2)}%\n` +
            `📅 Monthly Tax: ${formatCurrency(result.monthlyTax)}\n` +
            `💵 Monthly Net: ${formatCurrency(result.monthlyNetIncome)}\n\n` +
            `References:\n` +
            `- Section 163 (Pension Exemption)\n` +
            `- Section 58 (Progressive Rates)`
          );
        } else {
          addBotMessage("❌ Failed to calculate mixed income tax. Please try again.");
        }
        return;
      }

      // Income tax calculation: "tax 10000000" or "monthly tax 500000"
      const taxMatch = lowerMessage.match(/^(?:calculate\s+)?(?:my\s+)?(?:(monthly)\s+)?tax(?:\s+on)?\s+[₦n]?(\d[\d,]*)/i);
      if (taxMatch) {
        const isMonthly = !!taxMatch[1];
        const amount = parseInt(taxMatch[2].replace(/,/g, ""));
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Calculating income tax...");
        
        const result = await callIncomeTaxCalculator(amount, isMonthly ? 'monthly' : 'annual', 'employment');
        setIsTyping(false);
        
        if (result && !result.error) {
          const breakdown = result.taxBreakdown
            .filter((band: { taxInBand: number }) => band.taxInBand > 0)
            .map((band: { band: string; rate: number; taxInBand: number }) => 
              `├─ ${band.band} @ ${(band.rate * 100).toFixed(0)}%: ${formatCurrency(band.taxInBand)}`
            )
            .join('\n');
          
          if (result.isMinimumWageExempt) {
            addBotMessage(
              `📊 Personal Income Tax Calculation\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `Gross Income: ${formatCurrency(result.grossIncome)}\n\n` +
              `✅ EXEMPT FROM TAX\n\n` +
              `Your income is at or below minimum wage threshold.\n` +
              `Reference: ${result.actReference}`
            );
          } else {
            addBotMessage(
              `📊 Personal Income Tax Calculation\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `Gross Income: ${formatCurrency(result.grossIncome)}\n` +
              `Deductions: ${formatCurrency(result.deductions.total)}\n` +
              `Chargeable Income: ${formatCurrency(result.chargeableIncome)}\n\n` +
              `📋 Tax Breakdown (Section 58):\n` +
              `${breakdown}\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `💰 Total Tax: ${formatCurrency(result.totalTax)}\n` +
              `📊 Effective Rate: ${result.effectiveRate.toFixed(2)}%\n` +
              `📅 Monthly Tax: ${formatCurrency(result.monthlyTax)}\n` +
              `💵 Monthly Net: ${formatCurrency(result.monthlyNetIncome)}`
            );
          }
        } else {
          addBotMessage("❌ Failed to calculate income tax. Please try again.");
        }
        return;
      }

      // Just a number - assume VAT calculation
      if (/^\d+$/.test(lowerMessage.replace(/,/g, ""))) {
        const amount = parseInt(lowerMessage.replace(/,/g, ""));
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Calculating VAT...");
        
        const result = await callVATCalculator(amount, "general goods");
        setIsTyping(false);
        
        if (result && !result.error) {
          addBotMessage(
            `📊 VAT Calculation:\n\n` +
            `Amount: ${formatCurrency(result.subtotal)}\n` +
            `VAT (${(result.vatRate * 100).toFixed(1)}%): ${formatCurrency(result.vatAmount)}\n` +
            `Total: ${formatCurrency(result.total)}\n\n` +
            `💡 Tip: Add a description for accurate classification:\n` +
            `Example: *vat ${amount} electronics*`
          );
        } else {
          addBotMessage("❌ Failed to calculate VAT. Please try again.");
        }
        return;
      }

      if (lowerMessage === "summary") {
        if (!userData.id) {
          addBotMessage(
            "❌ No user data found. Please seed test data first by typing *hi*."
          );
          return;
        }

        setIsTyping(true);
        addBotMessageImmediate("🔄 Fetching VAT summary...");
        
        const period = new Date().toISOString().substring(0, 7);
        const result = await callReconciliation(userData.id, period);
        setIsTyping(false);
        
        if (result && !result.error) {
          const statusEmoji = result.status === 'remit' ? '💵' : '💰';
          
          addBotMessage(
            `📊 VAT Filing Summary for *${userData.businessName}*\n\n` +
            `Period: ${result.period}\n\n` +
            `📥 Input VAT: ${formatCurrency(result.inputVAT)}\n` +
            `   (${result.inputVATExpensesCount} expenses)\n\n` +
            `📤 Output VAT: ${formatCurrency(result.outputVAT)}\n` +
            `   (${result.outputVATInvoicesCount} invoices)\n\n` +
            `${statusEmoji} Net ${result.status === 'remit' ? 'Payable' : 'Credit'}: ${formatCurrency(Math.abs(result.netVAT))}\n\n` +
            `Status: ${result.status === 'remit' ? '⏳ Pending Payment' : '✅ Credit Available'}`,
            result.status === 'remit' ? [
              { id: "pay_now", title: "Pay Now" },
              { id: "view_details", title: "View Details" },
            ] : undefined
          );
        } else {
          addBotMessage("❌ Failed to fetch summary. Please try again.");
        }
        return;
      }

      if (lowerMessage === "paid" || lowerMessage === "pay_now") {
        addBotMessage(
          `💳 Payment Confirmation\n\n` +
            `Generate Remita RRR for VAT payment?`,
          [
            { id: "generate_rrr", title: "Generate RRR" },
            { id: "cancel", title: "Cancel" },
          ]
        );
        return;
      }

      if (lowerMessage === "generate_rrr") {
        const rrr = Math.floor(Math.random() * 900000000000) + 100000000000;
        addBotMessage(
          `✅ RRR Generated Successfully!\n\n` +
            `RRR: *${rrr}*\n\n` +
            `Pay via:\n` +
            `🏦 Bank Transfer\n` +
            `💳 Card Payment\n` +
            `📱 USSD: *322*${rrr}#\n\n` +
            `Reply *paid* once payment is complete.`
        );
        return;
      }

      if (lowerMessage === "upload") {
        addBotMessage(
          "📤 Invoice Upload\n\nPlease send an image of your invoice and I'll extract the details using OCR."
        );
        setUserState("awaiting_invoice");
        return;
      }

      // Default response
      addBotMessage(
        `I didn't understand that command.\n\n${HELP_MESSAGE}`
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: `📎 Uploaded: ${file.name}`,
      sender: "user",
      timestamp: new Date(),
      type: "image",
    };
    setMessages((prev) => [...prev, userMessage]);

    setIsTyping(true);
    addBotMessageImmediate("🔄 Processing invoice with OCR...");

    // Call invoice processor API
    const result = await callInvoiceProcessor('process-ocr', { imageUrl: file.name });
    setIsTyping(false);

    if (result && !result.error) {
      setPendingInvoice(result);
      
      const itemsList = result.items.map((item: { description: string; quantity: number; unitPrice: number }) => 
        `• ${item.description} x${item.quantity}: ${formatCurrency(item.unitPrice * item.quantity)}`
      ).join('\n');

      addBotMessage(
        `✅ Invoice Extracted! (${(result.confidence * 100).toFixed(0)}% confidence)\n\n` +
        `📋 Invoice Details:\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `Invoice #: ${result.invoiceNumber}\n` +
        `Customer: ${result.customerName}\n\n` +
        `Items:\n${itemsList}\n\n` +
        `Subtotal: ${formatCurrency(result.subtotal)}\n` +
        `VAT (7.5%): ${formatCurrency(result.vatAmount)}\n` +
        `Total: ${formatCurrency(result.total)}\n\n` +
        (result.confidence < 0.85 ? '⚠️ Low confidence - please verify details\n\n' : '') +
        `Classification: *Output VAT* 📤`,
        [
          { id: "confirm", title: "✓ Confirm" },
          { id: "edit", title: "✎ Edit" },
        ]
      );
      setUserState("awaiting_confirm");
    } else {
      addBotMessage("❌ Failed to process invoice. Please try again with a clearer image.");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleButtonClick = async (buttonId: string) => {
    const fakeMessage: Message = {
      id: Date.now().toString(),
      text: buttonId,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, fakeMessage]);

    if (buttonId === "confirm" && pendingInvoice) {
      setIsTyping(true);
      addBotMessageImmediate("🔄 Saving invoice...");

      // Save invoice to database
      const result = await callInvoiceProcessor('create-invoice', {
        userId: userData.id,
        businessId: userData.businessId,
        invoiceNumber: pendingInvoice.invoiceNumber,
        customerName: pendingInvoice.customerName,
        items: pendingInvoice.items,
        subtotal: pendingInvoice.subtotal,
        vatAmount: pendingInvoice.vatAmount,
        total: pendingInvoice.total,
        confidence: pendingInvoice.confidence
      });

      setIsTyping(false);

      if (result && result.invoice) {
        addBotMessage(
          `✅ Invoice saved to database!\n\n` +
          `Invoice ID: ${result.invoice.id.substring(0, 8)}...\n` +
          (result.review ? `⚠️ Added to review queue (${result.review.priority} priority)\n` : '') +
          `\nYour Output VAT has been updated.\n` +
          `Type *summary* to see your updated VAT position.`
        );
        setPendingInvoice(null);
        setUserState("registered");
      } else {
        addBotMessage("❌ Failed to save invoice. Please try again.");
      }
    } else if (buttonId === "edit") {
      addBotMessage(
        "✏️ Edit Mode\n\n" +
          "Please specify what to edit:\n" +
          "1. Customer name\n" +
          "2. Amount\n" +
          "3. Items\n" +
          "4. Classification"
      );
      setUserState("registered");
    } else if (buttonId === "view_details") {
      if (userData.id) {
        setIsTyping(true);
        const period = new Date().toISOString().substring(0, 7);
        const result = await callReconciliation(userData.id, period);
        setIsTyping(false);

        if (result) {
          addBotMessage(
            `📋 Detailed Filing Report\n\n` +
            `Period: ${result.period}\n\n` +
            `Output Invoices: ${result.outputVATInvoicesCount}\n` +
            `Output VAT: ${formatCurrency(result.outputVAT)}\n\n` +
            `Input Expenses: ${result.inputVATExpensesCount}\n` +
            `Input VAT: ${formatCurrency(result.inputVAT)}\n\n` +
            `Credit Brought Forward: ${formatCurrency(result.creditBroughtForward)}\n` +
            `Credit Carried Forward: ${formatCurrency(result.creditCarriedForward)}`
          );
        }
      }
    } else if (buttonId === "pay_now") {
      handleSendMessage();
    } else if (buttonId === "generate_rrr") {
      const rrr = Math.floor(Math.random() * 900000000000) + 100000000000;
      addBotMessage(
        `✅ RRR Generated Successfully!\n\n` +
        `RRR: *${rrr}*\n\n` +
        `Pay via:\n` +
        `🏦 Bank Transfer\n` +
        `💳 Card Payment\n` +
        `📱 USSD: *322*${rrr}#\n\n` +
        `Reply *paid* once payment is complete.`
      );
    } else if (buttonId === "cancel") {
      addBotMessage("Payment cancelled. Type *summary* to view your filing status.");
    }
  };

  const resetSimulator = async () => {
    // Clear test data
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/seed-test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
    } catch (e) {
      console.error('Failed to clear test data:', e);
    }
    
    setMessages([]);
    setUserState("new");
    setUserData({});
    setInputMessage("");
    setPendingInvoice(null);
    toast({ title: "Simulator reset" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">WhatsApp Simulator</h2>
          <p className="text-muted-foreground">
            Test chatbot with live VAT edge functions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetSimulator}>
            Reset Conversation
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Config Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5" />
              Test Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Phone Number</label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+234..."
                className="mt-1"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={testMode}
                  onChange={(e) => setTestMode(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium flex items-center gap-1">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  Test Mode
                </span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-seeds test data on first message
            </p>

            <div>
              <label className="text-sm font-medium">User State</label>
              <div className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">
                {userState === "new" && "🆕 New User"}
                {userState === "awaiting_tin" && "📝 Awaiting TIN"}
                {userState === "awaiting_business_name" && "🏢 Awaiting Business Name"}
                {userState === "registered" && "✅ Registered"}
                {userState === "awaiting_invoice" && "📤 Awaiting Invoice"}
                {userState === "awaiting_confirm" && "⏳ Awaiting Confirmation"}
              </div>
            </div>

            {userData.id && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-green-500 text-sm font-medium">
                  <Database className="w-4 h-4" />
                  Live Database Connected
                </div>
                <div className="text-xs space-y-1">
                  <p><span className="text-muted-foreground">User:</span> {userData.id.substring(0, 8)}...</p>
                  <p><span className="text-muted-foreground">Business:</span> {userData.businessName}</p>
                </div>
              </div>
            )}

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">Try these commands:</p>
              <div className="space-y-1 text-xs">
                <code className="block bg-muted px-2 py-1 rounded">vat 50000 electronics</code>
                <code className="block bg-muted px-2 py-1 rounded">tax 10000000</code>
                <code className="block bg-muted px-2 py-1 rounded">monthly tax 500000</code>
                <code className="block bg-muted px-2 py-1 rounded">summary</code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chat Interface */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b bg-[#075E54] text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-lg font-normal">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <div className="font-medium">PRISM Bot</div>
                <div className="text-xs opacity-80">
                  {isTyping ? "typing..." : testMode ? "🔴 LIVE API" : "online"}
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Messages Area */}
            <div
              className="h-[400px] overflow-y-auto bg-[#ECE5DD] p-4 space-y-3"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              {messages.length === 0 && (
                <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                  <div>
                    <Bot className="mx-auto h-12 w-12 opacity-50" />
                    <p className="mt-2">Start a conversation</p>
                    <p className="text-sm">Type "hi" to begin with live API testing</p>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 shadow-sm ${
                      msg.sender === "user"
                        ? "bg-[#DCF8C6] text-gray-900"
                        : "bg-white text-gray-900"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {msg.sender === "bot" && (
                        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#075E54]" />
                      )}
                      <div className="flex-1">
                        <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                        {msg.buttons && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {msg.buttons.map((btn) => (
                              <Button
                                key={btn.id}
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleButtonClick(btn.id)}
                              >
                                {btn.title}
                              </Button>
                            ))}
                          </div>
                        )}
                        <p className="mt-1 text-right text-[10px] text-gray-500">
                          {msg.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {msg.sender === "user" && (
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-white px-4 py-2 shadow-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-[#075E54]" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex items-center gap-2 border-t bg-[#F0F0F0] p-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*,.pdf"
                className="hidden"
              />
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5 text-gray-600" />
              </Button>
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 border-0 bg-white"
              />
              <Button
                size="icon"
                className="shrink-0 bg-[#075E54] hover:bg-[#064e46]"
                onClick={handleSendMessage}
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminSimulator;
