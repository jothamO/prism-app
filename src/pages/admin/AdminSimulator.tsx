import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Upload, Phone, Bot, User, Loader2 } from "lucide-react";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  type?: "text" | "image" | "buttons";
  buttons?: Array<{ id: string; title: string }>;
}

type UserState = "new" | "awaiting_tin" | "awaiting_business_name" | "registered" | "awaiting_invoice";

const HELP_MESSAGE = `Welcome to PRISM! 🇳🇬

Available commands:
📝 *vat* - Calculate VAT on an amount
📊 *summary* - Get your VAT filing summary
💰 *paid* - Confirm payment for a filing
📤 *upload* - Upload an invoice for processing
❓ *help* - Show this menu

Or simply send me an invoice image to process!`;

const AdminSimulator = () => {
  const [phoneNumber, setPhoneNumber] = useState("+234");
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userState, setUserState] = useState<UserState>("new");
  const [isTyping, setIsTyping] = useState(false);
  const [userData, setUserData] = useState<{ tin?: string; businessName?: string }>({});
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
    }, 800 + Math.random() * 500);
  };

  const handleSendMessage = () => {
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
        addBotMessage(
          "Welcome to PRISM - Nigeria's VAT automation platform! 🇳🇬\n\nTo get started, I'll need to verify your business.\n\nPlease enter your TIN (Tax Identification Number):"
        );
        setUserState("awaiting_tin");
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

    // Registered user commands
    if (userState === "registered" || userState === "awaiting_invoice") {
      setUserState("registered");

      if (lowerMessage === "help") {
        addBotMessage(HELP_MESSAGE);
        return;
      }

      if (lowerMessage === "vat") {
        addBotMessage(
          "💰 VAT Calculator\n\nPlease enter the amount (in Naira) to calculate VAT:\n\nExample: *50000*"
        );
        return;
      }

      if (/^\d+$/.test(lowerMessage.replace(/,/g, ""))) {
        const amount = parseInt(lowerMessage.replace(/,/g, ""));
        const vat = amount * 0.075;
        const total = amount + vat;
        addBotMessage(
          `📊 VAT Calculation:\n\n` +
            `Amount: ₦${amount.toLocaleString()}\n` +
            `VAT (7.5%): ₦${vat.toLocaleString()}\n` +
            `Total: ₦${total.toLocaleString()}`
        );
        return;
      }

      if (lowerMessage === "summary") {
        addBotMessage(
          `📊 VAT Filing Summary for *${userData.businessName || "Your Business"}*\n\n` +
            `Period: November 2024\n\n` +
            `📥 Input VAT: ₦125,000\n` +
            `📤 Output VAT: ₦287,500\n` +
            `💵 Net Payable: ₦162,500\n\n` +
            `📅 Due Date: December 21, 2024\n` +
            `Status: ⏳ Pending`,
          [
            { id: "pay_now", title: "Pay Now" },
            { id: "view_details", title: "View Details" },
          ]
        );
        return;
      }

      if (lowerMessage === "paid" || lowerMessage === "pay_now") {
        addBotMessage(
          `💳 Payment Confirmation\n\n` +
            `Please confirm payment of ₦162,500 for November 2024 VAT filing.\n\n` +
            `Generate Remita RRR?`,
          [
            { id: "generate_rrr", title: "Generate RRR" },
            { id: "cancel", title: "Cancel" },
          ]
        );
        return;
      }

      if (lowerMessage === "generate_rrr") {
        addBotMessage(
          `✅ RRR Generated Successfully!\n\n` +
            `RRR: *310234567890*\n` +
            `Amount: ₦162,500\n\n` +
            `Pay via:\n` +
            `🏦 Bank Transfer\n` +
            `💳 Card Payment\n` +
            `📱 USSD: *322*310234567890#\n\n` +
            `Reply *paid* once payment is complete.`
        );
        return;
      }

      if (lowerMessage === "upload") {
        addBotMessage(
          "📤 Invoice Upload\n\nPlease send an image of your invoice and I'll extract the details automatically."
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    // Simulate OCR processing
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: "🔄 Processing invoice with OCR...",
          sender: "bot",
          timestamp: new Date(),
        },
      ]);

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 2).toString(),
            text:
              `✅ Invoice Extracted Successfully!\n\n` +
              `📋 Invoice Details:\n` +
              `━━━━━━━━━━━━━━━━━\n` +
              `Vendor: ABC Supplies Ltd\n` +
              `Invoice #: INV-2024-0892\n` +
              `Date: Dec 15, 2024\n\n` +
              `Items:\n` +
              `• Office Supplies - ₦45,000\n` +
              `• IT Equipment - ₦280,000\n\n` +
              `Subtotal: ₦325,000\n` +
              `VAT (7.5%): ₦24,375\n` +
              `Total: ₦349,375\n\n` +
              `Classification: *Input VAT* 📥`,
            sender: "bot",
            timestamp: new Date(),
            type: "buttons",
            buttons: [
              { id: "confirm", title: "✓ Confirm" },
              { id: "edit", title: "✎ Edit" },
            ],
          },
        ]);
        setIsTyping(false);
        setUserState("registered");
      }, 2000);
    }, 1000);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleButtonClick = (buttonId: string) => {
    const fakeMessage: Message = {
      id: Date.now().toString(),
      text: buttonId,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, fakeMessage]);

    if (buttonId === "confirm") {
      addBotMessage(
        "✅ Invoice confirmed and added to your records!\n\n" +
          "Your Input VAT has been updated.\n" +
          "Type *summary* to see your updated VAT position."
      );
    } else if (buttonId === "edit") {
      addBotMessage(
        "✏️ Edit Mode\n\n" +
          "Please specify what to edit:\n" +
          "1. Vendor name\n" +
          "2. Amount\n" +
          "3. Date\n" +
          "4. Classification"
      );
    } else if (buttonId === "view_details") {
      addBotMessage(
        "📋 Detailed Filing Report\n\n" +
          "Input Invoices: 12\n" +
          "Output Invoices: 8\n\n" +
          "Top Input Sources:\n" +
          "• ABC Supplies: ₦85,000\n" +
          "• XYZ Services: ₦40,000\n\n" +
          "Top Output Sources:\n" +
          "• Client A: ₦150,000\n" +
          "• Client B: ₦137,500"
      );
    } else {
      handleSendMessage();
    }
  };

  const resetSimulator = () => {
    setMessages([]);
    setUserState("new");
    setUserData({});
    setInputMessage("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">WhatsApp Simulator</h2>
          <p className="text-muted-foreground">
            Test the chatbot conversation flows
          </p>
        </div>
        <Button variant="outline" onClick={resetSimulator}>
          Reset Conversation
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Phone Input */}
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
            <div>
              <label className="text-sm font-medium">User State</label>
              <div className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">
                {userState === "new" && "🆕 New User"}
                {userState === "awaiting_tin" && "📝 Awaiting TIN"}
                {userState === "awaiting_business_name" && "🏢 Awaiting Business Name"}
                {userState === "registered" && "✅ Registered"}
                {userState === "awaiting_invoice" && "📤 Awaiting Invoice"}
              </div>
            </div>
            {userData.businessName && (
              <div>
                <label className="text-sm font-medium">Business</label>
                <div className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">
                  {userData.businessName}
                </div>
              </div>
            )}
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">
                Try commands: <code className="bg-muted px-1">help</code>,{" "}
                <code className="bg-muted px-1">vat</code>,{" "}
                <code className="bg-muted px-1">summary</code>,{" "}
                <code className="bg-muted px-1">upload</code>
              </p>
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
                  {isTyping ? "typing..." : "online"}
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
                    <p className="text-sm">Type "hi" or "help" to begin</p>
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
                className="shrink-0 bg-[#075E54] hover:bg-[#054d44]"
                onClick={handleSendMessage}
                disabled={!inputMessage.trim()}
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
