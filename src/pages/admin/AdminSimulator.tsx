import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Upload, Phone, Bot, User, Loader2, Zap, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction, callPublicEdgeFunction } from "@/lib/supabase-functions";

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

interface ActiveProject {
  id: string;
  name: string;
  budget: number;
  spent: number;
  source_person: string;
  source_relationship: string;
}

const HELP_MESSAGE = `Welcome to PRISM! 🇳🇬

Available commands:
📝 *vat [amount] [description]* - Calculate VAT
💼 *tax [amount]* - Calculate income tax
🏛️ *pension [amount]* - Calculate tax for pensioners
💻 *freelance [income] expenses [amount]* - Freelancer tax
👤 *profile* - View your detected tax profile
📊 *summary* - Get your VAT filing summary
💰 *paid* - Confirm payment for a filing
📤 *upload* - Upload an invoice for processing

📁 Project Funds:
• *new project [name] [budget] from [source]* - Create project
• *project expense [amount] [description]* - Record expense
• *project balance* - Check project status
• *complete project* - Close and calculate tax

❓ *help* - Show this menu

Examples:
• vat 50000 electronics
• tax 10000000
• monthly tax 500000
• pension 2400000
• freelance 7200000 expenses 1800000
• contractor 10000000
• new project Uncle Building 5000000 from Uncle Chukwu
• project expense 150000 cement and blocks
• project balance
• complete project`;

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
};

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
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);
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

  // Call VAT Calculator API
  const callVATCalculator = async (amount: number, description: string) => {
    try {
      return await callEdgeFunction<{
        classification: string;
        actReference: string;
        subtotal: number;
        vatRate: number;
        vatAmount: number;
        total: number;
        canClaimInputVAT: boolean;
        error?: string;
      }>('vat-calculator', { amount, itemDescription: description });
    } catch (error) {
      console.error('VAT Calculator error:', error);
      return null;
    }
  };

  // Call VAT Reconciliation API
  const callReconciliation = async (userId: string, period: string) => {
    try {
      return await callEdgeFunction<{
        period: string;
        outputVAT: number;
        outputVATInvoicesCount: number;
        inputVAT: number;
        inputVATExpensesCount: number;
        netVAT: number;
        status: string;
        error?: string;
      }>('vat-reconciliation', { action: 'calculate', userId, period });
    } catch (error) {
      console.error('Reconciliation error:', error);
      return null;
    }
  };

  // Call Invoice Processor API
  const callInvoiceProcessor = async (action: string, data: Record<string, unknown>) => {
    try {
      return await callEdgeFunction<{
        success: boolean;
        invoiceNumber?: string;
        customerName?: string;
        items?: Array<{ description: string; quantity: number; unitPrice: number; vatAmount: number }>;
        subtotal?: number;
        vatAmount?: number;
        total?: number;
        confidence?: number;
        error?: string;
      }>('invoice-processor', { action, ...data });
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
    pensionAmount: number = 0,
    businessExpenses: number = 0,
    equipmentCosts: number = 0
  ) => {
    try {
      return await callEdgeFunction<{
        grossIncome: number;
        chargeableIncome: number;
        totalTax: number;
        effectiveRate: number;
        monthlyTax: number;
        monthlyNetIncome: number;
        netBusinessIncome?: number;
        taxBreakdown: Array<{ band: string; rate: number; taxInBand: number }>;
        businessExpensesBreakdown?: { total: number };
        freelancerTips?: string[];
        pensionExemption?: number;
        taxableIncome?: number;
        isMinimumWageExempt?: boolean;
        isPensionExempt?: boolean;
        actReference: string;
        error?: string;
      }>('income-tax-calculator', { 
        grossIncome, 
        period, 
        incomeType, 
        pensionAmount, 
        includeDeductions: true,
        deductions: {
          businessExpenses,
          equipmentCosts
        }
      });
    } catch (error) {
      console.error('Income Tax Calculator error:', error);
      return null;
    }
  };

  // Seed test user
  const seedTestUser = async () => {
    try {
      const result = await callEdgeFunction<{
        user: { id: string };
        business: { id: string; name: string };
        created: { invoices: number; expenses: number };
        error?: string;
      }>('seed-test-data', {
        action: 'seed',
        scenario: 'standard-retail',
        period: new Date().toISOString().substring(0, 7)
      });
      
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

      // Freelancer/Self-employed tax: "freelance 7200000 expenses 1800000" or "contractor 10000000"
      const freelanceMatch = lowerMessage.match(/^(?:freelance(?:r)?|self.?employed|contractor)\s+[₦n]?(\d[\d,]*)\s*(?:expenses?\s+[₦n]?(\d[\d,]*))?/i);
      if (freelanceMatch) {
        const grossIncome = parseInt(freelanceMatch[1].replace(/,/g, ""));
        const businessExpenses = freelanceMatch[2] ? parseInt(freelanceMatch[2].replace(/,/g, "")) : 0;
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Calculating freelancer tax...");
        
        const result = await callIncomeTaxCalculator(grossIncome, 'annual', 'business', 0, businessExpenses, 0);
        setIsTyping(false);
        
        if (result && !result.error) {
          const breakdown = result.taxBreakdown
            .filter((band: { taxInBand: number }) => band.taxInBand > 0)
            .map((band: { band: string; rate: number; taxInBand: number }) => 
              `├─ ${band.band} @ ${(band.rate * 100).toFixed(0)}%: ${formatCurrency(band.taxInBand)}`
            )
            .join('\n');
          
          const tips = result.freelancerTips?.map((tip: string) => `• ${tip}`).join('\n') || '';
          
          addBotMessage(
            `💼 Freelancer Tax Calculation\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📊 Income Summary:\n` +
            `├─ Gross Business Income: ${formatCurrency(result.grossIncome)}\n` +
            `├─ Business Expenses (Section 20): ${formatCurrency(result.businessExpensesBreakdown?.total || businessExpenses)}\n` +
            `├─ Net Business Income: ${formatCurrency(result.netBusinessIncome || result.grossIncome)}\n` +
            `└─ Chargeable Income: ${formatCurrency(result.chargeableIncome)}\n\n` +
            (breakdown ? `📋 Tax Breakdown (Section 58):\n${breakdown}\n` : '') +
            `━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 Total Tax: ${formatCurrency(result.totalTax)}\n` +
            `📊 Effective Rate: ${result.effectiveRate.toFixed(2)}%\n` +
            `📅 Monthly Tax: ${formatCurrency(result.monthlyTax)}\n` +
            `💵 Monthly Net: ${formatCurrency(result.monthlyNetIncome)}\n\n` +
            (tips ? `💡 Tips:\n${tips}\n\n` : '') +
            `Reference: ${result.actReference}`
          );
        } else {
          addBotMessage("❌ Failed to calculate freelancer tax. Please try again.");
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
            `Reference: ${result.actReference}`
          );
        } else {
          addBotMessage("❌ Failed to calculate mixed income tax. Please try again.");
        }
        return;
      }

      // Income tax calculation: "tax 10000000" or "monthly tax 500000"
      const taxMatch = lowerMessage.match(/^(?:(monthly)\s+)?tax\s+[₦n]?(\d[\d,]*)/i);
      if (taxMatch) {
        const isMonthly = !!taxMatch[1];
        const amount = parseInt(taxMatch[2].replace(/,/g, ""));
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Calculating income tax...");
        
        const result = await callIncomeTaxCalculator(amount, isMonthly ? 'monthly' : 'annual');
        setIsTyping(false);
        
        if (result && !result.error) {
          // Check for special exemptions
          if (result.isMinimumWageExempt) {
            addBotMessage(
              `💰 Income Tax Calculation\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `${isMonthly ? 'Monthly' : 'Annual'} Income: ${formatCurrency(result.grossIncome)}\n\n` +
              `✅ MINIMUM WAGE EXEMPTION\n\n` +
              `Earners of national minimum wage (₦70,000/month\n` +
              `or ₦840,000/year) or below are exempt from\n` +
              `personal income tax under the Nigeria Tax Act 2025.\n\n` +
              `📊 Summary:\n` +
              `├─ Gross Income: ${formatCurrency(result.grossIncome)}\n` +
              `├─ Tax Payable: ₦0\n` +
              `├─ Effective Rate: 0%\n` +
              `└─ Monthly Net: ${formatCurrency(result.monthlyNetIncome)}\n\n` +
              `Reference: ${result.actReference}`
            );
          } else {
            const breakdown = result.taxBreakdown
              .filter((band: { taxInBand: number }) => band.taxInBand > 0)
              .map((band: { band: string; rate: number; taxInBand: number }) => 
                `├─ ${band.band} @ ${(band.rate * 100).toFixed(0)}%: ${formatCurrency(band.taxInBand)}`
              )
              .join('\n');
            
            addBotMessage(
              `💰 Income Tax Calculation\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `${isMonthly ? 'Monthly' : 'Annual'} Income: ${formatCurrency(result.grossIncome)}\n` +
              `Chargeable Income: ${formatCurrency(result.chargeableIncome)}\n\n` +
              (breakdown ? `📋 Tax Breakdown (Section 58):\n${breakdown}\n` : '') +
              `━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `💰 Total Tax: ${formatCurrency(result.totalTax)}\n` +
              `📊 Effective Rate: ${result.effectiveRate.toFixed(2)}%\n` +
              `📅 Monthly Tax: ${formatCurrency(result.monthlyTax)}\n` +
              `💵 Monthly Net: ${formatCurrency(result.monthlyNetIncome)}\n\n` +
              `Reference: ${result.actReference}`
            );
          }
        } else {
          addBotMessage("❌ Failed to calculate income tax. Please try again.");
        }
        return;
      }

      // Summary command
      if (lowerMessage === "summary") {
        if (!userData.id) {
          addBotMessage("Please register first by typing *hi* or *help*.");
          return;
        }
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Fetching summary...");
        
        const period = new Date().toISOString().substring(0, 7);
        const result = await callReconciliation(userData.id, period);
        setIsTyping(false);
        
        if (result && !result.error) {
          addBotMessage(
            `📊 VAT Summary for ${result.period}\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📤 Output VAT (${result.outputVATInvoicesCount} invoices): ${formatCurrency(result.outputVAT)}\n` +
            `📥 Input VAT (${result.inputVATExpensesCount} expenses): ${formatCurrency(result.inputVAT)}\n\n` +
            `💰 Net VAT: ${formatCurrency(result.netVAT)}\n` +
            `Status: ${result.status.toUpperCase()}\n\n` +
            (result.netVAT > 0 ? 
              `To pay, use Remita with RRR or type *paid* after payment.` : 
              `You have a credit to carry forward.`)
          );
        } else {
          addBotMessage("❌ Failed to fetch summary. Please try again.");
        }
        return;
      }

      // Profile command
      if (lowerMessage === "profile") {
        addBotMessage(
          `👤 Your Profile\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Business: ${userData.businessName || 'Not set'}\n` +
          `TIN: ${userData.tin || 'Not set'}\n` +
          `User ID: ${userData.id?.substring(0, 8) || 'Not set'}...\n` +
          `Phone: ${phoneNumber}\n\n` +
          `Type *help* to see available commands.`
        );
        return;
      }

      // Upload command
      if (lowerMessage === "upload") {
        addBotMessage(
          "📤 Invoice Upload\n\n" +
          "Please send a photo of your invoice. I'll use OCR to extract:\n" +
          "• Invoice number\n" +
          "• Customer details\n" +
          "• Line items\n" +
          "• VAT amounts\n\n" +
          "Click the 📎 button to attach an image."
        );
        setUserState("awaiting_invoice");
        return;
      }

      // Paid command
      if (lowerMessage === "paid") {
        addBotMessage(
          "💰 Payment Confirmation\n\n" +
          "To confirm your VAT payment, please provide:\n" +
          "• Remita RRR number, or\n" +
          "• Bank transfer reference\n\n" +
          "Example: RRR123456789"
        );
        return;
      }

      // PROJECT FUND COMMANDS
      
      // New project command: "new project Uncle Building 5000000 from Uncle Chukwu"
      const newProjectMatch = lowerMessage.match(/^new\s+project\s+(.+?)\s+(\d[\d,]*)\s+from\s+(.+)$/i);
      if (newProjectMatch) {
        const projectName = newProjectMatch[1];
        const budget = parseInt(newProjectMatch[2].replace(/,/g, ""));
        const sourcePerson = newProjectMatch[3];
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Creating project fund...");
        
        try {
          const result = await callEdgeFunction<{
            success: boolean;
            project: ActiveProject;
            error?: string;
          }>('project-funds', {
            action: 'create',
            name: projectName,
            budget: budget,
            source_person: sourcePerson,
            source_relationship: 'family', // Default for simulation
          });
          
          setIsTyping(false);
          
          if (result && result.success && result.project) {
            setActiveProject({
              id: result.project.id,
              name: projectName,
              budget: budget,
              spent: 0,
              source_person: sourcePerson,
              source_relationship: 'family'
            });
            
            addBotMessage(
              `✅ Project Created!\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `📁 *${projectName}*\n` +
              `💰 Budget: ${formatCurrency(budget)}\n` +
              `👤 Source: ${sourcePerson}\n\n` +
              `📋 Tax Treatment: NON-TAXABLE\n` +
              `(Section 5 - Agency Fund)\n\n` +
              `Available commands:\n` +
              `• *project expense [amount] [description]*\n` +
              `• *project balance*\n` +
              `• *complete project*`
            );
          } else {
            addBotMessage("❌ Failed to create project. Please try again.");
          }
        } catch (error) {
          setIsTyping(false);
          addBotMessage("❌ Failed to create project. Please log in first.");
        }
        return;
      }

      // Project expense command: "project expense 150000 cement and blocks"
      const projectExpenseMatch = lowerMessage.match(/^project\s+expense\s+(\d[\d,]*)\s+(.+)$/i);
      if (projectExpenseMatch) {
        if (!activeProject) {
          addBotMessage(
            "❌ No active project!\n\n" +
            "Create a project first:\n" +
            "*new project [name] [budget] from [source]*"
          );
          return;
        }
        
        const amount = parseInt(projectExpenseMatch[1].replace(/,/g, ""));
        const description = projectExpenseMatch[2];
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Recording expense...");
        
        try {
          const result = await callEdgeFunction<{
            success: boolean;
            expense: { id: string; amount: number; description: string };
            project: { spent: number; budget: number };
            warning?: string;
            error?: string;
          }>('project-funds', {
            action: 'expense',
            project_id: activeProject.id,
            amount: amount,
            description: description,
          });
          
          setIsTyping(false);
          
          if (result && result.success) {
            const newSpent = result.project?.spent || (activeProject.spent + amount);
            const balance = activeProject.budget - newSpent;
            const isOverBudget = balance < 0;
            
            // Update local state
            setActiveProject(prev => prev ? { ...prev, spent: newSpent } : null);
            
            // Check for risk indicators
            let warningMessage = '';
            
            // Rapid cash withdrawal check (mock - in real scenario would check DB)
            const lowerDesc = description.toLowerCase();
            if (lowerDesc.includes('labor') || lowerDesc.includes('cash') || lowerDesc.includes('worker')) {
              if (amount >= 500000) {
                warningMessage += `\n\n⚠️ SECTION 191 ALERT\n` +
                  `Large cash-based expense detected.\n` +
                  `Ensure you retain receipts and payment records.`;
              }
            }
            
            // Vague description check
            const vagueTerms = ['misc', 'sundry', 'various', 'other', 'general'];
            if (vagueTerms.some(term => lowerDesc.includes(term))) {
              warningMessage += `\n\n⚠️ DOCUMENTATION WARNING\n` +
                `Vague description may be flagged for review.\n` +
                `Section 32 requires specific documentation.`;
            }
            
            addBotMessage(
              `${isOverBudget ? '⚠️' : '✅'} Expense Recorded\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `📁 ${activeProject.name}\n` +
              `📝 ${description}\n` +
              `💸 Amount: ${formatCurrency(amount)}\n\n` +
              `📊 Project Status:\n` +
              `├─ Budget: ${formatCurrency(activeProject.budget)}\n` +
              `├─ Spent: ${formatCurrency(newSpent)}\n` +
              `└─ Balance: ${formatCurrency(balance)}\n` +
              `${isOverBudget ? '\n⚠️ PROJECT IS OVER BUDGET!' : ''}` +
              warningMessage
            );
          } else {
            addBotMessage("❌ Failed to record expense: " + (result?.error || 'Unknown error'));
          }
        } catch (error) {
          setIsTyping(false);
          addBotMessage("❌ Failed to record expense. Please log in first.");
        }
        return;
      }

      // Project balance command
      if (lowerMessage === "project balance" || lowerMessage === "project status") {
        if (!activeProject) {
          addBotMessage(
            "❌ No active project!\n\n" +
            "Create a project first:\n" +
            "*new project [name] [budget] from [source]*"
          );
          return;
        }
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Fetching project status...");
        
        try {
          const result = await callEdgeFunction<{
            success: boolean;
            summary: {
              budget: number;
              spent: number;
              balance: number;
              balancePercentage: string;
              expenseCount: number;
              receiptCount: number;
              verifiedReceiptCount: number;
            };
            error?: string;
          }>('project-funds', {
            action: 'summary',
            project_id: activeProject.id,
          });
          
          setIsTyping(false);
          
          if (result && result.success) {
            const s = result.summary;
            const balance = s.budget - s.spent;
            const isOverBudget = balance < 0;
            
            addBotMessage(
              `📁 Project Balance\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `*${activeProject.name}*\n` +
              `Source: ${activeProject.source_person}\n\n` +
              `📊 Financial Status:\n` +
              `├─ Budget: ${formatCurrency(s.budget)}\n` +
              `├─ Spent: ${formatCurrency(s.spent)}\n` +
              `├─ Balance: ${formatCurrency(balance)} (${s.balancePercentage}%)\n` +
              `└─ Status: ${isOverBudget ? '🔴 OVER BUDGET' : '🟢 WITHIN BUDGET'}\n\n` +
              `📋 Records:\n` +
              `├─ Expenses: ${s.expenseCount}\n` +
              `├─ Receipts: ${s.receiptCount}\n` +
              `└─ Verified: ${s.verifiedReceiptCount}\n\n` +
              `💡 Tip: Send receipt photos to verify expenses.`
            );
            
            // Update local state
            setActiveProject(prev => prev ? { ...prev, spent: s.spent } : null);
          } else {
            addBotMessage("❌ Failed to fetch project status.");
          }
        } catch (error) {
          setIsTyping(false);
          addBotMessage("❌ Failed to fetch project status. Please log in first.");
        }
        return;
      }

      // Complete project command
      if (lowerMessage === "complete project" || lowerMessage === "finish project") {
        if (!activeProject) {
          addBotMessage(
            "❌ No active project!\n\n" +
            "Create a project first:\n" +
            "*new project [name] [budget] from [source]*"
          );
          return;
        }
        
        setIsTyping(true);
        addBotMessageImmediate("🔄 Completing project and calculating tax...");
        
        try {
          const result = await callEdgeFunction<{
            success: boolean;
            completion: {
              budget: number;
              spent: number;
              excess: number;
              taxCalculation: {
                totalTax: number;
                bands: Array<{ band: string; taxableAmount: number; rate: number; tax: number }>;
              };
            };
            error?: string;
          }>('project-funds', {
            action: 'complete',
            project_id: activeProject.id,
          });
          
          setIsTyping(false);
          
          if (result && result.success) {
            const c = result.completion;
            const hasExcess = c.excess > 0;
            
            let taxBreakdown = '';
            if (hasExcess && c.taxCalculation.bands.length > 0) {
              taxBreakdown = c.taxCalculation.bands
                .filter(b => b.tax > 0)
                .map(b => `├─ ${b.band} @ ${(b.rate * 100).toFixed(0)}%: ${formatCurrency(b.tax)}`)
                .join('\n');
            }
            
            addBotMessage(
              `🎉 Project Completed!\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `📁 *${activeProject.name}*\n\n` +
              `📊 Final Summary:\n` +
              `├─ Budget Received: ${formatCurrency(c.budget)}\n` +
              `├─ Total Spent: ${formatCurrency(c.spent)}\n` +
              `└─ Excess Retained: ${formatCurrency(c.excess)}\n\n` +
              (hasExcess ? 
                `⚠️ TAX TREATMENT\n` +
                `Excess of ${formatCurrency(c.excess)} is taxable income\n` +
                `under Section 4(1)(k) of the Tax Act 2025.\n\n` +
                `📋 PIT Calculation (Section 58):\n` +
                (taxBreakdown || `All within 0% band (₦0 - ₦800,000)`) +
                `\n━━━━━━━━━━━━━━━━━━━━━\n` +
                `💰 Total Tax Due: ${formatCurrency(c.taxCalculation.totalTax)}` +
                (c.taxCalculation.totalTax === 0 ? `\n\n✅ Excess falls within tax-free band!` : '')
                :
                `✅ NO TAXABLE EXCESS\n` +
                `All funds were properly expended on the project.\n` +
                `No Personal Income Tax liability.`
              ) +
              `\n\n📄 Type *project statement* to generate a PDF report.`
            );
            
            // Clear active project
            setActiveProject(null);
          } else {
            addBotMessage("❌ Failed to complete project: " + (result?.error || 'Unknown error'));
          }
        } catch (error) {
          setIsTyping(false);
          addBotMessage("❌ Failed to complete project. Please log in first.");
        }
        return;
      }

      // Default response for unrecognized commands
      addBotMessage(
        "I didn't understand that command. Type *help* to see available options."
      );
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Add user message showing upload
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: `📎 Uploaded: ${file.name}`,
        sender: "user",
        timestamp: new Date(),
        type: "image",
      },
    ]);

    setIsTyping(true);
    addBotMessageImmediate("🔄 Processing invoice with OCR...");

    // Simulate OCR processing
    const result = await callInvoiceProcessor('process-ocr', { 
      imageUrl: URL.createObjectURL(file),
      userId: userData.id 
    });

    setIsTyping(false);

    if (result && !result.error) {
      setPendingInvoice({
        invoiceNumber: result.invoiceNumber || 'INV-001',
        customerName: result.customerName || 'Customer',
        items: result.items || [],
        subtotal: result.subtotal || 0,
        vatAmount: result.vatAmount || 0,
        total: result.total || 0,
        confidence: result.confidence || 0.85
      });

      const itemsList = (result.items || [])
        .map((item: { description: string; quantity: number; unitPrice: number }) => 
          `• ${item.description} x${item.quantity} @ ${formatCurrency(item.unitPrice)}`
        )
        .join('\n');

      addBotMessage(
        `✅ Invoice Extracted (${Math.round((result.confidence || 0.85) * 100)}% confidence)\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Invoice #: ${result.invoiceNumber || 'INV-001'}\n` +
        `Customer: ${result.customerName || 'Customer'}\n\n` +
        `Items:\n${itemsList || 'No items'}\n\n` +
        `Subtotal: ${formatCurrency(result.subtotal || 0)}\n` +
        `VAT (7.5%): ${formatCurrency(result.vatAmount || 0)}\n` +
        `Total: ${formatCurrency(result.total || 0)}\n\n` +
        `Is this correct?`,
        [
          { id: "confirm", title: "✓ Confirm" },
          { id: "edit", title: "✎ Edit" }
        ]
      );
      setUserState("awaiting_confirm");
    } else {
      addBotMessage(
        "❌ Failed to process invoice. Please try again with a clearer image."
      );
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleButtonClick = async (buttonId: string) => {
    if (buttonId === "confirm" && pendingInvoice) {
      setIsTyping(true);
      addBotMessageImmediate("🔄 Saving invoice...");

      const result = await callInvoiceProcessor('create-invoice', {
        userId: userData.id,
        businessId: userData.businessId,
        ...pendingInvoice,
        period: new Date().toISOString().substring(0, 7)
      });

      setIsTyping(false);

      if (result && result.success) {
        addBotMessage(
          `✅ Invoice saved successfully!\n\n` +
          `Invoice #${pendingInvoice.invoiceNumber} has been added to your records.\n` +
          `VAT of ${formatCurrency(pendingInvoice.vatAmount)} will be included in your next filing.\n\n` +
          `Type *summary* to see your updated VAT position.`
        );
      } else {
        addBotMessage("❌ Failed to save invoice. Please try again.");
      }
      
      setPendingInvoice(null);
      setUserState("registered");
    } else if (buttonId === "edit") {
      addBotMessage(
        "Please re-upload the invoice with a clearer image, or type the details manually:\n\n" +
        "Format: invoice [number] [customer] [amount]"
      );
      setPendingInvoice(null);
      setUserState("registered");
    }
  };

  const resetSimulator = () => {
    setMessages([]);
    setUserState("new");
    setUserData({});
    setPendingInvoice(null);
    toast({ title: "Simulator reset" });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Config Panel */}
      <Card className="w-80 flex-shrink-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Simulator Config
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+234..."
            />
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="testMode"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="testMode" className="text-sm">
              Test Mode (auto-seed data)
            </label>
          </div>

          <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
            <p className="font-medium">User State: {userState}</p>
            {userData.businessName && <p>Business: {userData.businessName}</p>}
            {userData.tin && <p>TIN: {userData.tin}</p>}
            {userData.id && <p>ID: {userData.id.substring(0, 8)}...</p>}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetSimulator}
              className="flex-1"
            >
              Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const result = await seedTestUser();
                if (result) {
                  toast({ title: "Test data seeded" });
                }
              }}
              className="flex-1 gap-1"
            >
              <Database className="w-3 h-3" />
              Seed
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chat Window */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">PRISM Tax Bot</CardTitle>
              <p className="text-xs text-muted-foreground">
                {isTyping ? "typing..." : "Online"}
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Start a conversation by typing "hi" or "help"</p>
            </div>
          )}
          
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.sender === "user"
                    ? "bg-green-500 text-white"
                    : "bg-muted"
                }`}
              >
                <div className="flex items-start gap-2">
                  {message.sender === "bot" && (
                    <Bot className="w-4 h-4 mt-1 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="whitespace-pre-wrap text-sm">
                      {message.text.split('*').map((part, i) => 
                        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                      )}
                    </p>
                    {message.buttons && (
                      <div className="flex gap-2 mt-3">
                        {message.buttons.map((btn) => (
                          <Button
                            key={btn.id}
                            size="sm"
                            variant="secondary"
                            onClick={() => handleButtonClick(btn.id)}
                          >
                            {btn.title}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  {message.sender === "user" && (
                    <User className="w-4 h-4 mt-1 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs opacity-60 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">typing...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input Area */}
        <div className="border-t p-4 flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
          </Button>
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            className="flex-1"
          />
          <Button onClick={handleSendMessage} disabled={!inputMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default AdminSimulator;
