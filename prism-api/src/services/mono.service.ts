// import { Mono } from 'mono-node'; // Assuming mono-node is installed, but for now we'll mock or use fetch if sdk not available.
// Since I can't check node_modules, I'll assume the user will install it.
// However, the prompt provided code uses 'mono-node'. I will stick to it.

// Note: I need to define the Mono class or import it.
// Since I don't have the type definition, I will use 'any' for now to avoid TS errors if the package is missing types.

import { classifierService } from "./classifier.service";
import { invoiceService } from "./invoice.service";
import { whatsappService } from "./whatsapp.service";
import { supabase } from "../config/database";

// Mocking Mono import for now as I can't verify the package
const Mono = require("mono-node");

export class MonoService {
  private client = new Mono(process.env.MONO_SECRET_KEY!);

  async getAuthUrl(userId: string): Promise<string> {
    const data = await this.client.auth.getAuthUrl({
      scope: "auth",
      customer: {
        id: userId,
      },
      redirect_url: `${process.env.API_URL}/webhook/mono`,
    });

    return data.url;
  }

  async exchangeToken(code: string) {
    return this.client.auth.exchangeToken({ code });
  }

  async getAccountDetails(accountId: string) {
    return this.client.accounts.getAccountDetails(accountId);
  }

  async getTransactions(
    accountId: string,
    options: {
      start: Date;
      end: Date;
    },
  ) {
    return this.client.accounts.getTransactions(accountId, {
      start: options.start.toISOString().split("T")[0],
      end: options.end.toISOString().split("T")[0],
    });
  }

  async syncAccount(userId: string, accountId: string) {
    const start = new Date();
    start.setDate(start.getDate() - 90);

    // Fetch business_id for this account
    const { data: userAccount } = await supabase
      .from("user_accounts")
      .select("business_id")
      .eq("mono_account_id", accountId)
      .single();

    const businessId = userAccount?.business_id;

    const transactions = await this.getTransactions(accountId, {
      start,
      end: new Date(),
    });

    for (const txn of transactions) {
      if (txn.type === "credit" && txn.amount > 1000) {
        await this.processTransaction(userId, accountId, txn, businessId);
      }
    }

    return transactions.length;
  }

  private async processTransaction(userId: string, accountId: string, txn: any, businessId?: string) {
    const classification = await classifierService.classify(txn);

    if (classification.classification === "sale" && classification.confidence > 0.8) {
      await invoiceService.createFromTransaction(userId, accountId, txn, businessId);
    } else {
      await this.flagForConfirmation(userId, txn, classification);
    }
  }

  private async flagForConfirmation(userId: string, txn: any, classification: any) {
    await whatsappService.sendInteractiveButtons(
      userId,
      `
⚠️ Transaction detected:

Amount: ₦${txn.amount.toLocaleString()}
From: ${txn.narration}
Date: ${txn.date}

AI thinks: ${classification.classification} (${Math.round(classification.confidence * 100)}% confident)

Is this a SALE?
      `,
      [
        { id: `confirm_sale_${txn.reference}`, title: "YES - SALE" },
        { id: `confirm_not_sale_${txn.reference}`, title: "NO - NOT SALE" },
      ],
    );
  }
}

export const monoService = new MonoService();
