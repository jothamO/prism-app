import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Upload, Phone, Bot, User, Loader2, Zap, Database, Brain, FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction, callPublicEdgeFunction } from "@/lib/supabase-functions";
import { NLUDebugPanel, NLUIntent, ArtificialTransactionCheck } from "@/components/admin/NLUDebugPanel";
import { WhatsAppButtonsPreview, WhatsAppListMessage, ListSection } from "@/components/admin/WhatsAppInteractivePreview";
import { DocumentTestUploader, ExtractedData } from "@/components/admin/DocumentTestUploader";
import { ConversationFlowTester } from "@/components/admin/ConversationFlowTester";
interface ListConfig {
  header?: string;
  body: string;
  footer?: string;
  buttonText: string;
  sections: ListSection[];
}

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  type?: "text" | "image" | "buttons" | "list";
  buttons?: Array<{ id: string; title: string }>;
  listConfig?: ListConfig;
  intent?: { name: string; confidence: number };
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
  
  // NLU State
  const [nluIntent, setNluIntent] = useState<NLUIntent | null>(null);
  const [nluSource, setNluSource] = useState<'ai' | 'fallback' | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [artificialCheck, setArtificialCheck] = useState<ArtificialTransactionCheck | null>(null);
  const [conversationContext, setConversationContext] = useState<Array<{ role: string; content: string }>>([]);
  const [nluEnabled, setNluEnabled] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // NLU Classification
  const classifyIntent = async (message: string): Promise<{
    intent: NLUIntent;
    source: 'ai' | 'fallback';
    artificialTransactionCheck?: ArtificialTransactionCheck;
  } | null> => {
    if (!nluEnabled) return null;
    
    setIsClassifying(true);
    try {
      const result = await callPublicEdgeFunction<{
        intent: { name: string; confidence: number; entities: Record<string, unknown>; reasoning?: string };
        source: 'ai' | 'fallback';
        artificialTransactionCheck?: { isSuspicious: boolean; warning?: string; actReference?: string };
      }>('simulate-nlu', {
        message,
        context: conversationContext.slice(-5)
      });

      const intent: NLUIntent = {
        name: result.intent.name,
        confidence: result.intent.confidence,
        entities: result.intent.entities,
        reasoning: result.intent.reasoning
      };
      
      setNluIntent(intent);
      setNluSource(result.source);
      setArtificialCheck(result.artificialTransactionCheck || null);
      
      return {
        intent,
        source: result.source,
        artificialTransactionCheck: result.artificialTransactionCheck
      };
    } catch (error) {
      console.error('NLU classification failed:', error);
      return null;
    } finally {
      setIsClassifying(false);
    }
  };

  const addBotMessage = (
    text: string, 
    buttons?: Array<{ id: string; title: string }>,
    listConfig?: ListConfig,
    intent?: { name: string; confidence: number }
  ) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text,
          sender: "bot",
          timestamp: new Date(),
          type: listConfig ? "list" : buttons ? "buttons" : "text",
          buttons,
          listConfig,
          intent,
        },
      ]);
      setIsTyping(false);
      
      // Update conversation context
      setConversationContext(prev => [...prev.slice(-4), { role: 'assistant', content: text }]);
    }, 500 + Math.random() * 300);
  };

  const addBotMessageImmediate = (
    text: string, 
    buttons?: Array<{ id: string; title: string }>,
    listConfig?: ListConfig
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text,
        sender: "bot",
        timestamp: new Date(),
        type: listConfig ? "list" : buttons ? "buttons" : "text",
        buttons,
        listConfig,
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

  // Intent-based response helpers
  const sendTaxReliefOptions = () => {
    addBotMessage(
      "Select the type of relief you want to learn about:",
      undefined,
      {
        header: "Tax Relief Options",
        body: "Nigeria Tax Act 2025 provides various tax reliefs and exemptions.",
        footer: "NTA 2025 Sections 62-75",
        buttonText: "View Options",
        sections: [
          {
            title: "Personal Reliefs",
            rows: [
              { id: "relief_cra", title: "CRA", description: "Consolidated Relief Allowance" },
              { id: "relief_pension", title: "Pension", description: "Pension contributions" },
              { id: "relief_housing", title: "Housing", description: "NHF contributions" }
            ]
          },
          {
            title: "Family Reliefs",
            rows: [
              { id: "relief_children", title: "Children", description: "Child education allowance" },
              { id: "relief_dependent", title: "Dependents", description: "Dependent relative relief" }
            ]
          }
        ]
      },
      nluIntent ? { name: nluIntent.name, confidence: nluIntent.confidence } : undefined
    );
  };

  const sendTransactionSummaryOptions = () => {
    addBotMessage(
      "Select a period to view your transaction summary:",
      [
        { id: "period_week", title: "This Week" },
        { id: "period_month", title: "This Month" },
        { id: "period_year", title: "This Year" }
      ],
      undefined,
      nluIntent ? { name: nluIntent.name, confidence: nluIntent.confidence } : undefined
    );
  };

  const sendTaxCalculationOptions = () => {
    addBotMessage(
      "What type of tax calculation do you need?",
      undefined,
      {
        header: "Tax Calculator",
        body: "Choose the type of tax you want to calculate:",
        footer: "Nigeria Tax Act 2025",
        buttonText: "Select Type",
        sections: [
          {
            title: "Income Tax",
            rows: [
              { id: "calc_employment", title: "Employment Income", description: "PAYE calculation" },
              { id: "calc_business", title: "Business Income", description: "Self-employed/Freelancer" },
              { id: "calc_pension", title: "Pension Income", description: "Retiree exemption check" }
            ]
          },
          {
            title: "VAT",
            rows: [
              { id: "calc_vat_standard", title: "Standard VAT", description: "7.5% rate calculation" },
              { id: "calc_vat_exempt", title: "Check Exemption", description: "Is my item VAT exempt?" }
            ]
          }
        ]
      },
      nluIntent ? { name: nluIntent.name, confidence: nluIntent.confidence } : undefined
    );
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
    
    // Update conversation context
    setConversationContext(prev => [...prev.slice(-4), { role: 'user', content: inputMessage }]);

    const lowerMessage = inputMessage.toLowerCase().trim();
    setInputMessage("");

    // Classify intent via NLU for registered users
    let nluResult: Awaited<ReturnType<typeof classifyIntent>> = null;
    if (userState === "registered" && nluEnabled) {
      nluResult = await classifyIntent(inputMessage);
    }

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

    // Registered user - use NLU-based routing with fallback to regex
    if (userState === "registered" || userState === "awaiting_invoice") {
      setUserState("registered");

      // Try NLU-based routing first
      if (nluResult?.intent) {
        const { name: intentName, entities } = nluResult.intent;
        
        // Route based on intent
        switch (intentName) {
          case 'get_tax_relief_info':
            sendTaxReliefOptions();
            return;
            
          case 'get_transaction_summary':
            sendTransactionSummaryOptions();
            return;
            
          case 'get_tax_calculation':
            // Check if entities provide enough info for direct calculation
            if (entities.amount && typeof entities.amount === 'number') {
              if (entities.tax_type === 'vat') {
                // Direct VAT calculation
                await handleVATCalculation(entities.amount, entities.description as string || 'goods');
                return;
              } else {
                // Direct income tax calculation
                await handleIncomeTaxCalculation(entities.amount);
                return;
              }
            }
            // Otherwise show options
            sendTaxCalculationOptions();
            return;
            
          case 'upload_receipt':
            addBotMessage(
              "📤 Invoice Upload\n\n" +
              "Please send a photo of your invoice. I'll use OCR to extract the details.",
              [
                { id: "upload_now", title: "📎 Upload Now" },
                { id: "upload_later", title: "Later" }
              ],
              undefined,
              { name: intentName, confidence: nluResult.intent.confidence }
            );
            setUserState("awaiting_invoice");
            return;
            
          case 'categorize_expense':
            if (nluResult.artificialTransactionCheck?.isSuspicious) {
              addBotMessage(
                `⚠️ SECTION 191 ALERT\n\n${nluResult.artificialTransactionCheck.warning}\n\n` +
                `Reference: ${nluResult.artificialTransactionCheck.actReference}\n\n` +
                "How would you like to categorize this?",
                [
                  { id: "cat_business", title: "💼 Business" },
                  { id: "cat_personal", title: "👤 Personal" },
                  { id: "cat_review", title: "📋 Flag for Review" }
                ],
                undefined,
                { name: intentName, confidence: nluResult.intent.confidence }
              );
            } else {
              addBotMessage(
                "How would you like to categorize this expense?",
                [
                  { id: "cat_business", title: "💼 Business" },
                  { id: "cat_personal", title: "👤 Personal" }
                ],
                undefined,
                { name: intentName, confidence: nluResult.intent.confidence }
              );
            }
            return;
            
          case 'verify_identity':
            addBotMessage(
              "Which ID would you like to verify?",
              undefined,
              {
                header: "ID Verification",
                body: "Select the type of identification to verify:",
                footer: "Verification via NIMC/CAC",
                buttonText: "Select ID Type",
                sections: [
                  {
                    title: "Personal ID",
                    rows: [
                      { id: "verify_tin", title: "TIN", description: "Tax Identification Number" },
                      { id: "verify_nin", title: "NIN", description: "National ID Number" }
                    ]
                  },
                  {
                    title: "Business ID",
                    rows: [
                      { id: "verify_cac", title: "CAC/RC", description: "Company Registration" }
                    ]
                  }
                ]
              },
              { name: intentName, confidence: nluResult.intent.confidence }
            );
            return;
            
          case 'connect_bank':
            addBotMessage(
              "🏦 Connect your bank account for automated transaction tracking.",
              undefined,
              {
                header: "Bank Connection",
                body: "Select your bank to connect via Mono:",
                footer: "Secure connection via Mono API",
                buttonText: "Select Bank",
                sections: [
                  {
                    title: "Major Banks",
                    rows: [
                      { id: "bank_gtb", title: "GTBank", description: "Guaranty Trust Bank" },
                      { id: "bank_access", title: "Access Bank", description: "Access Bank Plc" },
                      { id: "bank_zenith", title: "Zenith Bank", description: "Zenith Bank Plc" },
                      { id: "bank_first", title: "First Bank", description: "First Bank of Nigeria" }
                    ]
                  }
                ]
              },
              { name: intentName, confidence: nluResult.intent.confidence }
            );
            return;
            
          case 'set_reminder':
            addBotMessage(
              "📅 What would you like to be reminded about?",
              [
                { id: "remind_vat", title: "VAT Filing" },
                { id: "remind_tax", title: "Tax Payment" },
                { id: "remind_custom", title: "Custom" }
              ],
              undefined,
              { name: intentName, confidence: nluResult.intent.confidence }
            );
            return;
            
          case 'general_query':
            addBotMessage(HELP_MESSAGE);
            return;
        }
      }

      // Fallback to legacy regex-based handlers
      if (lowerMessage === "help") {
        addBotMessage(HELP_MESSAGE);
        return;
      }

      // VAT calculation command: "vat 50000 electronics" or just a number
      const vatMatch = lowerMessage.match(/^vat\s+(\d+(?:,\d{3})*)\s*(.*)$/);
      if (vatMatch) {
        const amount = parseInt(vatMatch[1].replace(/,/g, ""));
        const description = vatMatch[2] || "general goods";
        await handleVATCalculation(amount, description);
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
        await handleIncomeTaxCalculation(amount, isMonthly);
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
            source_relationship: 'family',
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
            
            setActiveProject(prev => prev ? { ...prev, spent: newSpent } : null);
            
            let warningMessage = '';
            
            const lowerDesc = description.toLowerCase();
            if (lowerDesc.includes('labor') || lowerDesc.includes('cash') || lowerDesc.includes('worker')) {
              if (amount >= 500000) {
                warningMessage += `\n\n⚠️ SECTION 191 ALERT\n` +
                  `Large cash-based expense detected.\n` +
                  `Ensure you retain receipts and payment records.`;
              }
            }
            
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
              `└─ ${hasExcess ? `Excess (Taxable): ${formatCurrency(c.excess)}` : 'Fully Utilized ✓'}\n\n` +
              (hasExcess ? 
                `💰 Tax on Excess:\n${taxBreakdown}\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `Total Tax Due: ${formatCurrency(c.taxCalculation.totalTax)}\n\n` +
                `⚠️ The excess amount is treated as personal income\n` +
                `and subject to progressive income tax.\n\n`
              : `✅ No tax liability - funds fully utilized for project purposes.\n\n`) +
              `Reference: NTA 2025 Section 5 (Agency Funds)`
            );
            
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

      // Default: Unknown command
      addBotMessage(
        "I didn't understand that command. 🤔\n\n" +
        "Type *help* to see available commands, or try:\n" +
        "• *vat 50000 electronics*\n" +
        "• *tax 10000000*\n" +
        "• *summary*"
      );
    }
  };

  // Helper functions for tax calculations
  const handleVATCalculation = async (amount: number, description: string) => {
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
        (result.canClaimInputVAT ? '✅ Input VAT claimable' : '❌ Cannot claim input VAT'),
        undefined,
        undefined,
        nluIntent ? { name: nluIntent.name, confidence: nluIntent.confidence } : undefined
      );
    } else {
      addBotMessage("❌ Failed to calculate VAT. Please try again.");
    }
  };

  const handleIncomeTaxCalculation = async (amount: number, isMonthly: boolean = false) => {
    setIsTyping(true);
    addBotMessageImmediate("🔄 Calculating income tax...");
    
    const result = await callIncomeTaxCalculator(amount, isMonthly ? 'monthly' : 'annual');
    setIsTyping(false);
    
    if (result && !result.error) {
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
          `Reference: ${result.actReference}`,
          undefined,
          undefined,
          nluIntent ? { name: nluIntent.name, confidence: nluIntent.confidence } : undefined
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
          `Reference: ${result.actReference}`,
          undefined,
          undefined,
          nluIntent ? { name: nluIntent.name, confidence: nluIntent.confidence } : undefined
        );
      }
    } else {
      addBotMessage("❌ Failed to calculate income tax. Please try again.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: "📷 Invoice uploaded",
          sender: "user",
          timestamp: new Date(),
          type: "image",
        },
      ]);

      setIsTyping(true);
      addBotMessageImmediate("🔍 Processing invoice with OCR...");

      const result = await callInvoiceProcessor('process-image', {
        imageBase64: base64,
        userId: userData.id,
        businessId: userData.businessId
      });

      setIsTyping(false);

      if (result && result.success) {
        setPendingInvoice({
          invoiceNumber: result.invoiceNumber || 'INV-001',
          customerName: result.customerName || 'Customer',
          items: result.items || [],
          subtotal: result.subtotal || 0,
          vatAmount: result.vatAmount || 0,
          total: result.total || 0,
          confidence: result.confidence || 0.85
        });

        const itemsList = result.items?.map((item: { description: string; quantity: number; unitPrice: number; vatAmount: number }) => 
          `• ${item.description} x${item.quantity} @ ${formatCurrency(item.unitPrice)}`
        ).join('\n');

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

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const handleButtonClick = async (buttonId: string) => {
    // Handle WhatsApp list/button selections
    if (buttonId.startsWith('relief_')) {
      const reliefType = buttonId.replace('relief_', '');
      const reliefInfo: Record<string, string> = {
        cra: "📋 *Consolidated Relief Allowance (CRA)*\n\nSection 62 of NTA 2025:\n• 20% of gross income\n• Plus ₦200,000 base allowance\n\nThis is automatically applied to reduce your taxable income.",
        pension: "📋 *Pension Contribution Relief*\n\nSection 63 of NTA 2025:\n• Employee contributions to approved pension schemes\n• Up to 8% of gross earnings\n• Fully deductible from taxable income",
        housing: "📋 *National Housing Fund (NHF)*\n\nSection 64 of NTA 2025:\n• 2.5% of basic salary contribution\n• Fully tax-deductible\n• Applicable to all employees earning minimum wage or above",
        children: "📋 *Child Education Allowance*\n\nSection 65 of NTA 2025:\n• ₦2,500 per child in school\n• Maximum of 4 children\n• Requires proof of enrollment",
        dependent: "📋 *Dependent Relative Allowance*\n\nSection 66 of NTA 2025:\n• ₦2,000 per dependent\n• For non-working relatives you support\n• Maximum of 2 dependents"
      };
      addBotMessage(reliefInfo[reliefType] || `📋 ${reliefType.toUpperCase()} Relief - Details not available.`);
      return;
    }
    if (buttonId.startsWith('period_')) {
      const period = buttonId.replace('period_', '');
      const mockSummaries: Record<string, string> = {
        week: "📊 *This Week's Transactions*\n\n💰 Total Income: ₦450,000\n📤 Total Expenses: ₦125,000\n📈 Net: ₦325,000\n\nVAT Collected: ₦33,750\nVAT Paid: ₦9,375",
        month: "📊 *This Month's Transactions*\n\n💰 Total Income: ₦2,150,000\n📤 Total Expenses: ₦580,000\n📈 Net: ₦1,570,000\n\nVAT Collected: ₦161,250\nVAT Paid: ₦43,500",
        year: "📊 *This Year's Transactions*\n\n💰 Total Income: ₦18,500,000\n📤 Total Expenses: ₦6,200,000\n📈 Net: ₦12,300,000\n\nVAT Collected: ₦1,387,500\nVAT Paid: ₦465,000"
      };
      addBotMessage(mockSummaries[period] || "Summary not available.");
      return;
    }
    if (buttonId.startsWith('calc_')) {
      const calcType = buttonId.replace('calc_', '');
      const calcPrompts: Record<string, string> = {
        employment: "💼 *Employment Income Tax*\n\nPlease enter your annual gross salary.\n\nExample: *tax 5000000*",
        business: "🏢 *Business Income Tax*\n\nPlease enter your business income and expenses.\n\nExample: *freelance 7200000 expenses 1800000*",
        pension: "👴 *Pension Income*\n\nPlease enter your annual pension amount.\n\nExample: *pension 2400000*",
        vat_standard: "📦 *Standard VAT Calculation*\n\nPlease enter the amount and item description.\n\nExample: *vat 50000 electronics*",
        vat_exempt: "🔍 *VAT Exemption Check*\n\nCommon VAT exempt items:\n• Basic food items (rice, beans, garri)\n• Medical supplies\n• Educational materials\n• Baby products\n\nType *vat [amount] [item]* to check."
      };
      addBotMessage(calcPrompts[calcType] || "Please enter the amount for calculation.\n\nExample: *tax 10000000* or *vat 50000*");
      return;
    }
    if (buttonId.startsWith('bank_')) {
      const bankId = buttonId.replace('bank_', '');
      const bankNames: Record<string, string> = {
        gtb: 'Guaranty Trust Bank',
        access: 'Access Bank',
        zenith: 'Zenith Bank',
        first: 'First Bank of Nigeria'
      };
      const bankName = bankNames[bankId] || 'Selected Bank';
      
      // Simulate Mono connection flow
      addBotMessage(`🔗 *Connecting to ${bankName}...*\n\n⏳ Initializing secure connection...`);
      
      setTimeout(() => {
        addBotMessage(
          `✅ *${bankName} Connected Successfully!*\n\n` +
          `Account: ****5678\n` +
          `Name: ACME TRADING LTD\n` +
          `Type: Current Account\n\n` +
          `📊 Last 30 days:\n` +
          `• 12 Credits: ₦4,250,000\n` +
          `• 28 Debits: ₦1,890,000\n` +
          `• Balance: ₦2,360,000\n\n` +
          `Auto-sync enabled. Transactions will be categorized automatically.`,
          [
            { id: "bank_disconnect", title: "Disconnect" },
            { id: "bank_sync_now", title: "Sync Now" }
          ]
        );
      }, 1500);
      return;
    }
    if (buttonId === 'bank_disconnect') {
      addBotMessage("🔌 Bank account disconnected. Type *connect bank* to reconnect.");
      return;
    }
    if (buttonId === 'bank_sync_now') {
      addBotMessage("🔄 *Syncing transactions...*\n\n5 new transactions found and categorized.");
      return;
    }
    if (buttonId.startsWith('verify_')) {
      const idType = buttonId.replace('verify_', '');
      const idPrompts: Record<string, { prompt: string; mockResult: string }> = {
        tin: {
          prompt: "Please enter your TIN (Tax Identification Number):",
          mockResult: "✅ *TIN Verified*\n\nTIN: 12345678-0001\nName: ACME TRADING LIMITED\nStatus: Active\nRegistration Date: 15-Jun-2024\nValid Through: 31-Dec-2025\n\nSource: FIRS Database"
        },
        nin: {
          prompt: "Please enter your NIN (National Identification Number):",
          mockResult: "✅ *NIN Verified*\n\nNIN: 12345678901\nName: CHUKWU EMEKA JOHN\nGender: Male\nDate of Birth: 15-Mar-1985\nStatus: Active\n\nSource: NIMC Database"
        },
        cac: {
          prompt: "Please enter your CAC/RC Number:",
          mockResult: "✅ *CAC Verified*\n\nRC Number: RC-1234567\nCompany: ACME TRADING LIMITED\nType: Private Limited Company\nStatus: Active\nIncorporation: 10-Jan-2020\n\nDirectors:\n• CHUKWU EMEKA JOHN (MD)\n• ADEBAYO FUNKE GRACE\n\nSource: CAC Database"
        }
      };
      
      const info = idPrompts[idType];
      if (info) {
        addBotMessage(info.prompt);
        // Simulate verification after a delay
        setTimeout(() => {
          addBotMessage(info.mockResult);
        }, 2000);
      }
      return;
    }
    if (buttonId.startsWith('remind_')) {
      const reminderType = buttonId.replace('remind_', '');
      const reminderConfigs: Record<string, { title: string; message: string; date: string }> = {
        vat: {
          title: "VAT Filing Reminder",
          message: "Your VAT return for this period is due.",
          date: "21st of next month"
        },
        tax: {
          title: "Tax Payment Reminder",
          message: "Your income tax payment is due.",
          date: "End of tax year"
        },
        custom: {
          title: "Custom Reminder",
          message: "What would you like to be reminded about?",
          date: "You choose"
        }
      };
      
      const config = reminderConfigs[reminderType];
      if (config) {
        if (reminderType === 'custom') {
          addBotMessage("📝 *Custom Reminder*\n\nWhat would you like to be reminded about?\n\nPlease describe your reminder in a message.");
        } else {
          addBotMessage(
            `✅ *Reminder Set*\n\n` +
            `📋 ${config.title}\n` +
            `📅 Due: ${config.date}\n` +
            `📱 You'll receive a WhatsApp reminder 3 days before.\n\n` +
            `Reminder: "${config.message}"`,
            [
              { id: "remind_edit", title: "Edit" },
              { id: "remind_cancel", title: "Cancel" }
            ]
          );
        }
      }
      return;
    }
    if (buttonId === 'remind_edit') {
      addBotMessage("📝 What would you like to change about your reminder?\n\n• Type a new date\n• Type a new message");
      return;
    }
    if (buttonId === 'remind_cancel') {
      addBotMessage("❌ Reminder cancelled.");
      return;
    }
    if (buttonId.startsWith('cat_')) {
      const category = buttonId.replace('cat_', '');
      const categoryMessages: Record<string, string> = {
        business: "✅ *Expense Categorized*\n\nCategory: Business Expense\nVAT Reclaimable: Yes\n\nThis expense will be included in your input VAT for the period.",
        personal: "✅ *Expense Categorized*\n\nCategory: Personal Expense\nVAT Reclaimable: No\n\nPersonal expenses are not tax-deductible.",
        review: "📋 *Flagged for Review*\n\nThis transaction has been flagged for manual review by your accountant.\n\nReason: Potential Section 191 artificial transaction"
      };
      addBotMessage(categoryMessages[category] || `✅ Expense categorized as: *${category.toUpperCase()}*`);
      return;
    }
    if (buttonId === 'upload_now') {
      fileInputRef.current?.click();
      return;
    }
    if (buttonId === 'upload_later') {
      addBotMessage("No problem! Type *upload* when you're ready to upload an invoice.");
      setUserState("registered");
      return;
    }

    // Original button handlers
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

  // Handle document from DocumentTestUploader
  const handleDocumentProcessed = (data: ExtractedData, summary: string) => {
    // Add a user message indicating document upload
    const userMsg: Message = {
      id: Date.now().toString(),
      text: `📄 [Uploaded ${data.documentType.replace('_', ' ')}]`,
      sender: "user",
      timestamp: new Date(),
      type: "text"
    };
    setMessages(prev => [...prev, userMsg]);
    
    // Add bot response with extracted data
    setTimeout(() => {
      addBotMessage(
        `✅ *Document Processed*\n\n${summary}\n\n` +
        "What would you like to do with this data?",
        [
          { id: "doc_categorize", title: "Categorize" },
          { id: "doc_save", title: "Save" },
          { id: "doc_discard", title: "Discard" }
        ]
      );
    }, 500);
  };

  // Handle flow tester message injection
  const handleFlowTesterMessage = (message: string) => {
    setInputMessage(message);
    // Trigger send after a brief delay
    setTimeout(() => {
      const fakeEvent = { key: 'Enter' } as React.KeyboardEvent;
      if (inputMessage || message) {
        // Directly set and send
        setInputMessage(message);
      }
    }, 50);
  };

  // Get last bot message for flow tester
  const lastBotMessage = messages.filter(m => m.sender === 'bot').slice(-1)[0]?.text || null;

  const resetSimulator = () => {
    setMessages([]);
    setUserState("new");
    setUserData({});
    setPendingInvoice(null);
    setActiveProject(null);
    setNluIntent(null);
    setNluSource(null);
    setArtificialCheck(null);
    setConversationContext([]);
    toast({ title: "Simulator reset" });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Config Panel */}
      <Card className="w-80 flex-shrink-0 overflow-y-auto">
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

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="nluEnabled"
              checked={nluEnabled}
              onChange={(e) => setNluEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="nluEnabled" className="text-sm flex items-center gap-1">
              <Brain className="w-3 h-3" />
              NLU Enabled
            </label>
          </div>

          <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
            <p className="font-medium">User State: {userState}</p>
            {userData.businessName && <p>Business: {userData.businessName}</p>}
            {userData.tin && <p>TIN: {userData.tin}</p>}
            {userData.id && <p>ID: {userData.id.substring(0, 8)}...</p>}
            {activeProject && (
              <p className="text-primary">Project: {activeProject.name}</p>
            )}
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

          {/* NLU Debug Panel */}
          <NLUDebugPanel
            intent={nluIntent}
            source={nluSource}
            isLoading={isClassifying}
            artificialCheck={artificialCheck}
            onTestIntent={(testMessage) => {
              setInputMessage(testMessage);
            }}
          />
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
                {isClassifying ? "🧠 classifying..." : isTyping ? "typing..." : "Online"}
              </p>
            </div>
            {nluEnabled && (
              <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <Brain className="w-3 h-3" />
                NLU Active
              </div>
            )}
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
                    
                    {/* WhatsApp Reply Buttons */}
                    {message.buttons && message.buttons.length <= 3 && !message.listConfig && (
                      <WhatsAppButtonsPreview
                        buttons={message.buttons}
                        onSelect={(buttonId) => handleButtonClick(buttonId)}
                      />
                    )}

                    {/* WhatsApp List Messages */}
                    {message.listConfig && (
                      <WhatsAppListMessage
                        header={message.listConfig.header}
                        body={message.listConfig.body}
                        footer={message.listConfig.footer}
                        buttonText={message.listConfig.buttonText}
                        sections={message.listConfig.sections}
                        onSelect={(rowId) => handleButtonClick(rowId)}
                      />
                    )}

                    {/* Intent Badge (for debugging) */}
                    {message.intent && nluEnabled && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <Brain className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                          {message.intent.name} ({Math.round(message.intent.confidence * 100)}%)
                        </span>
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
          <Button onClick={handleSendMessage} disabled={!inputMessage.trim() || isClassifying} data-send-button>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Testing Panel */}
      <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
        {/* Flow Tester */}
        <ConversationFlowTester
          onSendMessage={(msg) => {
            setInputMessage(msg);
            setTimeout(() => {
              const btn = document.querySelector('[data-send-button]') as HTMLButtonElement;
              btn?.click();
            }, 100);
          }}
          onClickButton={handleButtonClick}
          lastBotMessage={lastBotMessage}
          isTyping={isTyping}
        />

        {/* Document Uploader */}
        <DocumentTestUploader onDocumentProcessed={handleDocumentProcessed} />
      </div>
    </div>
  );
};

export default AdminSimulator;
