import { Request, Response } from "express";
import { timingSafeEqual, createHmac } from "crypto";
import { whatsappService } from "../services/whatsapp.service";
import { ocrService } from "../services/ocr.service";
import { supabase } from "../config/database";
import { invoiceService } from "../services/invoice.service";
import { vatCalculatorService } from "../services/vat-calculator.service";
import { conversationService } from "../services/conversation.service";
import { analyticsService } from "../services/analytics.service";
import { websocketService } from "../services/websocket.service";
import { antiAvoidanceService } from "../services/anti-avoidance.service";
import { projectController } from "./project.controller";

/**
 * Performs a constant-time comparison of two strings to prevent timing attacks.
 * Returns true if the strings are equal, false otherwise.
 */
function safeCompare(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  // If lengths differ, still perform comparison to maintain constant time
  if (bufA.length !== bufB.length) {
    // Compare against itself to maintain timing, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

export class WebhookController {
  async handleWhatsApp(req: Request, res: Response) {
    try {
      const message = req.body;
      res.sendStatus(200);

      await this.processMessage(message);
    } catch (error) {
      console.error("Webhook error:", error);
      res.sendStatus(500);
    }
  }

  async handleMonoWebhook(req: Request, res: Response) {
    try {
      const secret = req.headers["x-mono-webhook-secret"] as string | undefined;
      const expectedSecret = process.env.MONO_WEBHOOK_SECRET;

      // Use constant-time comparison to prevent timing attacks
      if (!safeCompare(secret, expectedSecret)) {
        console.warn("Mono webhook: Invalid secret received");
        return res.status(401).send("Unauthorized");
      }

      const event = req.body;
      console.log("Mono Webhook Event:", event.event);

      res.sendStatus(200);

      if (event.event === "reauthorization.required") {
        console.log("Reauthorization required for account:", event.data.account._id);
      } else if (event.event === "mono.events.account_updated") {
        const accountId = event.data.account._id;

        const { data: accountData } = await supabase
          .from("user_accounts")
          .select("user_id")
          .eq("mono_account_id", accountId)
          .single();

        if (accountData && event.data.meta && event.data.meta.data_status === "AVAILABLE") {
          const { monoService } = await import("../services/mono.service");
          await monoService.syncAccount(accountData.user_id, accountId);

          // Phase 6: Detect EMTL charges and bank fees
          await this.detectBankCharges(accountData.user_id, accountId);
        }
      }
    } catch (error) {
      console.error("Mono Webhook error:", error);
      if (!res.headersSent) res.sendStatus(500);
    }
  }

  /**
   * Detect EMTL charges and bank fees from Mono transactions
   * Phase 6: Bank Charges & EMTL Compliance
   */
  private async detectBankCharges(userId: string, accountId: string) {
    try {
      console.log(`[Webhook] Detecting bank charges for user ${userId}, account ${accountId}`);

      // Get recent transactions from Mono
      const { monoService } = await import("../services/mono.service");
      const transactions = await monoService.getTransactions(accountId);

      if (!transactions || transactions.length === 0) {
        console.log('[Webhook] No transactions to analyze');
        return;
      }

      // Detect EMTL charges
      const { emtlDetectorService } = await import("../services/emtl-detector.service");
      const emtlCharges = await emtlDetectorService.detectEMTL(transactions, userId);
      await emtlDetectorService.saveEMTLCharges(userId, emtlCharges);

      // Categorize bank charges
      const { bankChargeCategorizer } = await import("../services/bank-charge-categorizer.service");
      const bankCharges = await bankChargeCategorizer.categorizeCharges(transactions, userId);
      await bankChargeCategorizer.saveCharges(userId, bankCharges);

      // Send summary to user if significant charges detected
      const totalEMTL = emtlCharges.reduce((sum, c) => sum + c.amount, 0);
      const totalBankCharges = bankCharges.reduce((sum, c) => sum + c.amount, 0);

      if (totalEMTL + totalBankCharges > 0) {
        await this.sendBankChargesSummary(userId, emtlCharges, bankCharges);
      }

      console.log(`[Webhook] Bank charge detection complete: ${emtlCharges.length} EMTL, ${bankCharges.length} bank charges`);
    } catch (error) {
      console.error('[Webhook] Error detecting bank charges:', error);
      // Don't throw - webhook should still succeed
    }
  }

  /**
   * Send bank charges summary to user via WhatsApp
   */
  private async sendBankChargesSummary(userId: string, emtlCharges: any[], bankCharges: any[]) {
    try {
      const { data: user } = await supabase
        .from("users")
        .select("whatsapp_number")
        .eq("id", userId)
        .single();

      if (!user || !user.whatsapp_number) {
        console.log('[Webhook] User has no WhatsApp number, skipping notification');
        return;
      }

      // Generate summaries
      const { emtlDetectorService } = await import("../services/emtl-detector.service");
      const { bankChargeCategorizer } = await import("../services/bank-charge-categorizer.service");

      const emtlSummary = emtlDetectorService.generateSummary(emtlCharges);
      const bankSummary = bankChargeCategorizer.generateMonthlySummary(bankCharges);

      const message = `🏦 *Bank Charges Detected*\n\n${emtlSummary}\n\n${bankSummary}`;

      await whatsappService.sendMessage(user.whatsapp_number, message);

      console.log(`[Webhook] Sent bank charges summary to user ${userId}`);
    } catch (error) {
      console.error('[Webhook] Error sending bank charges summary:', error);
    }
  }

  private async processMessage(message: any) {
    const userId = message.from;
    const messageType = message.type;

    await supabase.from("messages").insert({
      user_id: userId, // Note: This assumes user_id is the phone number or we have a mapping.
      // In reality we'd look up the user UUID by phone number.
      // For this snippet I'll assume we handle user lookup.
      direction: "inbound",
      message_type: messageType,
      content: message.text?.body,
      whatsapp_message_id: message.id,
    });

    // Lookup user by phone number
    let { data: user } = await supabase.from("users").select("*").eq("whatsapp_number", userId).single();

    if (!user) {
      user = await this.startOnboarding(userId);
      return;
    }

    switch (messageType) {
      case "text":
        await this.handleTextMessage(userId, message.text.body, user);
        break;

      case "image":
      case "document":
        await this.handleMediaMessage(userId, message, user);
        break;

      case "interactive":
        await this.handleInteractiveResponse(userId, message, user);
        break;
    }
  }

  private async handleTextMessage(userId: string, text: string, user: any) {
    // Check for active conversation state
    const state = await conversationService.getState(userId);

    if (state) {
      await this.handleStatefulMessage(userId, text, user, state);
      return;
    }

    const lowerText = text.toLowerCase();

    // Try project commands first
    const isProjectCommand = await projectController.handleProjectCommand(userId, text, user);
    if (isProjectCommand) {
      return;
    }

    if (lowerText.includes("vat") || lowerText.includes("summary")) {
      await this.sendVATSummary(userId);
    } else if (lowerText.includes("help")) {
      await this.sendHelp(userId);
    } else if (lowerText === "paid") {
      await this.handlePaymentConfirmation(userId);
    } else if (lowerText.startsWith("switch")) {
      const businessNamePart = lowerText.replace("switch", "").trim();
      await this.handleBusinessSwitch(userId, businessNamePart, user);
    } else if (lowerText === "businesses") {
      await this.listBusinesses(userId, user);
    } else {
      await whatsappService.sendMessage(
        userId,
        "I'm not sure how to help with that yet. Try 'help', 'vat', 'projects', or 'new project'.",
      );
    }
  }

  private async handleStatefulMessage(userId: string, text: string, user: any, state: any) {
    if (state.flow === "onboarding") {
      if (state.step === "ask_name") {
        await supabase.from("users").update({ business_name: text }).eq("id", user.id);
        await conversationService.updateState(userId, { step: "ask_tin" });
        await whatsappService.sendMessage(
          userId,
          `Nice to meet you, ${text}! What is your Tax Identification Number (TIN)?`,
        );
      } else if (state.step === "ask_tin") {
        await supabase.from("users").update({ tin: text }).eq("id", user.id);
        await conversationService.clearState(userId);
        await whatsappService.sendMessage(userId, `Perfect! Your profile is set up. You can now send me invoices.`);
      }
    }
  }

  private async handleBusinessSwitch(userId: string, namePart: string, user: any) {
    if (!namePart) {
      await whatsappService.sendMessage(userId, "Please specify a business name. e.g. 'switch My Shop'");
      return;
    }

    const { data: businesses } = await supabase
      .from("businesses")
      .select("*")
      .eq("user_id", user.id)
      .ilike("name", `%${namePart}%`);

    if (!businesses || businesses.length === 0) {
      await whatsappService.sendMessage(
        userId,
        `No business found matching "${namePart}". Try 'businesses' to see your list.`,
      );
    } else if (businesses.length > 1) {
      await whatsappService.sendMessage(
        userId,
        `Multiple businesses found. Please be more specific:\n${businesses.map((b) => `• ${b.name}`).join("\n")}`,
      );
    } else {
      const business = businesses[0];
      await conversationService.updateState(userId, {
        businessId: business.id,
        currentBusinessName: business.name,
      });
      await whatsappService.sendMessage(userId, `✅ Switched to **${business.name}**.`);
    }
  }

  private async listBusinesses(userId: string, user: any) {
    const { data: businesses } = await supabase.from("businesses").select("*").eq("user_id", user.id);

    if (!businesses || businesses.length === 0) {
      await whatsappService.sendMessage(userId, "You don't have any businesses set up yet.");
    } else {
      await whatsappService.sendMessage(
        userId,
        `🏢 **Your Businesses**:\n\n${businesses.map((b) => `• ${b.name}`).join("\n")}\n\nReply 'switch [name]' to change active business.`,
      );
    }
  }

  private async handleMediaMessage(userId: string, message: any, user: any) {
    await whatsappService.sendMessage(userId, "Processing your invoice... ⏳");

    try {
      const mediaBuffer = await whatsappService.downloadMedia(message.media.id);
      const invoiceData = await ocrService.extractInvoice(mediaBuffer);

      const { vatAmount } = vatCalculatorService.calculateVAT(invoiceData.subtotal);
      const vat = invoiceData.vatAmount || vatAmount;

      // Get active business from conversation state
      const state = await conversationService.getState(userId);
      let businessId = state?.businessId;

      // If no active business, try to find primary or default
      if (!businessId) {
        const { data: businesses } = await supabase
          .from("businesses")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_primary", true)
          .limit(1);
        if (businesses && businesses.length > 0) businessId = businesses[0].id;
      }

      const needsReview = (invoiceData.ocrConfidence || 1) < 0.8;

      // Run anti-avoidance checks
      const avoidanceCheck = await antiAvoidanceService.checkTransaction({
        amount: invoiceData.subtotal + vat,
        description: invoiceData.customerName || invoiceData.invoiceNumber || '',
        isConnectedPerson: false,
        type: 'income'
      });

      const hasAvoidanceRisk = avoidanceCheck.riskLevel !== 'low';
      const reviewReasons: string[] = [];
      if (needsReview) reviewReasons.push("Low OCR confidence");
      if (hasAvoidanceRisk) reviewReasons.push(...avoidanceCheck.warnings);

      const invoice = await invoiceService.create({
        user_id: user.id,
        business_id: businessId,
        ...invoiceData,
        vat_amount: vat,
        period: new Date().toISOString().slice(0, 7),
        source: "manual_upload",
        confidence_score: invoiceData.ocrConfidence,
        needs_review: needsReview || hasAvoidanceRisk,
        review_reasons: reviewReasons,
      });

      // Add to review queue if anti-avoidance flags are raised
      if (hasAvoidanceRisk) {
        await supabase.from("review_queue").insert({
          invoice_id: invoice.id,
          user_id: user.id,
          reasons: avoidanceCheck.warnings,
          priority: avoidanceCheck.riskLevel === 'high' ? 'high' : 'medium',
          priority_score: avoidanceCheck.riskLevel === 'high' ? 0.9 : 0.6,
          notes: avoidanceCheck.recommendation,
        });
      }

      // Track analytics event
      await analyticsService.trackEvent(user.id, "invoice_uploaded", {
        amount: invoice.total,
        source: "manual_upload",
        confidence: invoiceData.ocrConfidence,
      });

      // Emit WebSocket event
      websocketService.emitNewInvoice(invoice);

      const confirmationMessage = needsReview
        ? `⚠️ Invoice processed (low scan quality - please verify)!\n\nInvoice #: ${invoiceData.invoiceNumber}\nCustomer: ${invoiceData.customerName}\nAmount: ₦${invoiceData.subtotal.toLocaleString()}\nVAT: ₦${vat.toLocaleString()}\n\nPlease double-check the details are correct.`
        : `✅ Invoice processed!\n\nInvoice #: ${invoiceData.invoiceNumber}\nCustomer: ${invoiceData.customerName}\nAmount: ₦${invoiceData.subtotal.toLocaleString()}\nVAT: ₦${vat.toLocaleString()}\n\nCurrent month total: ₦${await this.getMonthlyTotal(user.id)}`;

      await whatsappService.sendMessage(userId, confirmationMessage);
    } catch (error) {
      await whatsappService.sendMessage(
        userId,
        `
❌ Failed to process invoice.

Please try:
• Taking a clearer photo
• Sending as PDF
• Or reply "HELP" for support
      `,
      );
    }
  }

  private async startOnboarding(userId: string) {
    await whatsappService.sendMessage(
      userId,
      `
👋 Welcome to PRISM!

I'm your AI tax assistant. I automate VAT filing so you never miss a deadline.

Let's get started!

What's your Business Name?
    `,
    );

    // Create a temporary user or partial record
    const { data: user } = await supabase
      .from("users")
      .insert({
        whatsapp_number: userId,
        onboarding_step: 1,
        business_name: "Pending", // Placeholder
        tin: "Pending", // Placeholder
      })
      .select()
      .single();

    // Set conversation state
    await conversationService.setState(userId, {
      flow: "onboarding",
      step: "ask_name",
      data: {},
    });

    return user;
  }

  private async handleInteractiveResponse(userId: string, message: any, user: any) {
    // Handle button clicks
    console.log("Interactive response:", message);
  }

  private async sendVATSummary(userId: string) {
    // Implementation
    await whatsappService.sendMessage(userId, "Here is your VAT summary...");
  }

  private async sendHelp(userId: string) {
    await whatsappService.sendMessage(userId, "Here are some commands you can use...");
  }

  private async handlePaymentConfirmation(userId: string) {
    await whatsappService.sendMessage(userId, "Checking payment status...");
  }

  private async getMonthlyTotal(userId: string) {
    // Implementation
    return 0;
  }
}

export const webhookController = new WebhookController();
