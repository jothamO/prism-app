import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SavingsData {
  userName: string;
  userEmail: string;
  totalEMTL: number;
  totalBankCharges: number;
  totalVAT: number;
  potentialRefund: number;
  emtlCount: number;
  bankChargesCount: number;
  illegalCount: number;
}

// Generate HTML email template
function generateEmailHTML(data: SavingsData): string {
  const totalSavings = data.totalVAT + (data.totalEMTL + data.totalBankCharges) * 0.24;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Tax Savings Summary</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">📊 Weekly Tax Savings</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Your PRISM Summary</p>
    </div>
    
    <div style="background: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; color: #374151; margin: 0 0 24px;">Hi ${data.userName}! Here's what I found this week:</p>
      
      ${data.emtlCount > 0 ? `
      <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin-bottom: 16px; border-radius: 0 8px 8px 0;">
        <h3 style="margin: 0 0 8px; color: #166534; font-size: 14px;">💳 EMTL Charges</h3>
        <p style="margin: 0; color: #15803d; font-size: 18px; font-weight: 600;">${data.emtlCount} transfer${data.emtlCount > 1 ? 's' : ''} × ₦50 = ₦${data.totalEMTL.toFixed(2)}</p>
        <p style="margin: 4px 0 0; color: #166534; font-size: 12px;">✅ Deductible as business expense</p>
      </div>
      ` : ''}
      
      ${data.bankChargesCount > 0 ? `
      <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 16px; border-radius: 0 8px 8px 0;">
        <h3 style="margin: 0 0 8px; color: #1e40af; font-size: 14px;">🏦 Bank Charges</h3>
        <p style="margin: 0; color: #1d4ed8; font-size: 18px; font-weight: 600;">${data.bankChargesCount} charge${data.bankChargesCount > 1 ? 's' : ''} = ₦${data.totalBankCharges.toFixed(2)}</p>
        <p style="margin: 4px 0 0; color: #1e40af; font-size: 12px;">✅ Input VAT credit: ₦${data.totalVAT.toFixed(2)}</p>
      </div>
      ` : ''}
      
      ${data.illegalCount > 0 && data.potentialRefund > 0 ? `
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 16px; border-radius: 0 8px 8px 0;">
        <h3 style="margin: 0 0 8px; color: #92400e; font-size: 14px;">⚠️ Illegal Charges Detected</h3>
        <p style="margin: 0; color: #b45309; font-size: 18px; font-weight: 600;">${data.illegalCount} charge${data.illegalCount > 1 ? 's' : ''} = ₦${data.potentialRefund.toFixed(2)}</p>
        <p style="margin: 4px 0 0; color: #92400e; font-size: 12px;">💡 You can request a refund from your bank!</p>
      </div>
      ` : ''}
      
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; border-radius: 12px; margin-top: 24px;">
        <h3 style="margin: 0 0 16px; color: white; font-size: 16px;">💰 Your Total Tax Savings</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; color: rgba(255,255,255,0.9);">
            <span>VAT credit:</span>
            <span>₦${data.totalVAT.toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; color: rgba(255,255,255,0.9);">
            <span>CIT deduction (24%):</span>
            <span>₦${((data.totalEMTL + data.totalBankCharges) * 0.24).toFixed(2)}</span>
          </div>
          <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.3); margin: 8px 0;">
          <div style="display: flex; justify-content: space-between; color: white; font-weight: 700; font-size: 20px;">
            <span>Total Saved:</span>
            <span>₦${totalSavings.toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      ${data.potentialRefund > 0 ? `
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin-top: 24px;">
        <h4 style="margin: 0 0 8px; color: #991b1b; font-size: 14px;">🎯 Action Required</h4>
        <p style="margin: 0; color: #dc2626; font-size: 14px;">
          Contact your bank to request ₦${data.potentialRefund.toFixed(2)} refund.<br>
          <em>Reference: Section 185, Tax Act 2025</em>
        </p>
      </div>
      ` : ''}
      
      <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">📈 Keep uploading receipts to maximize your savings!</p>
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          This email was sent by PRISM Tax Assistant<br>
          You're receiving this because you're subscribed to weekly savings alerts.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("[Weekly Savings Email] Request received");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request - can be triggered for specific user or all users
    let targetUserId: string | null = null;
    try {
      const body = await req.json();
      targetUserId = body.userId || null;
    } catch {
      // No body - process all active users
    }

    // Get date range for last week
    const today = new Date();
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - 7);

    // Get users to process
    let usersQuery = supabase
      .from("users")
      .select("id, email, full_name, business_name")
      .eq("is_active", true)
      .not("email", "is", null);

    if (targetUserId) {
      usersQuery = usersQuery.eq("id", targetUserId);
    }

    const { data: users, error: usersError } = await usersQuery;

    if (usersError) {
      console.error("[Weekly Savings Email] Error fetching users:", usersError);
      throw usersError;
    }

    if (!users || users.length === 0) {
      console.log("[Weekly Savings Email] No eligible users found");
      return new Response(
        JSON.stringify({ success: true, message: "No eligible users", emailsSent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Weekly Savings Email] Processing ${users.length} users`);

    let emailsSent = 0;
    let emailsFailed = 0;
    const results: Array<{ userId: string; status: string; error?: string }> = [];

    for (const user of users) {
      try {
        console.log(`[Weekly Savings Email] Processing user ${user.id}`);

        // Get EMTL charges from last week
        const { data: emtlCharges } = await supabase
          .from("emtl_charges")
          .select("*")
          .eq("user_id", user.id)
          .gte("detected_at", lastWeekStart.toISOString());

        // Get bank charges from last week
        const { data: bankCharges } = await supabase
          .from("bank_charges")
          .select("*")
          .eq("user_id", user.id)
          .gte("detected_at", lastWeekStart.toISOString());

        // Calculate totals
        const totalEMTL = (emtlCharges || []).reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const totalBankCharges = (bankCharges || []).reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const totalVAT = (bankCharges || []).reduce((sum, c) => sum + parseFloat(c.vat_amount || 0), 0);

        // Get illegal EMTL charges
        const illegalEMTL = (emtlCharges || []).filter(c => c.status === "exempt_illegal");
        const potentialRefund = illegalEMTL.reduce((sum, c) => sum + parseFloat(c.amount), 0);

        // Skip if no charges
        if (totalEMTL === 0 && totalBankCharges === 0) {
          console.log(`[Weekly Savings Email] No charges for user ${user.id}, skipping`);
          results.push({ userId: user.id, status: "skipped", error: "No charges detected" });
          continue;
        }

        const savingsData: SavingsData = {
          userName: user.full_name || user.business_name || "there",
          userEmail: user.email!,
          totalEMTL,
          totalBankCharges,
          totalVAT,
          potentialRefund,
          emtlCount: (emtlCharges || []).length,
          bankChargesCount: (bankCharges || []).length,
          illegalCount: illegalEMTL.length,
        };

        // Send email
        const emailResponse = await resend.emails.send({
          from: "PRISM Tax <alerts@prism.tax>",
          to: [user.email!],
          subject: `💰 Your Weekly Tax Savings: ₦${(totalVAT + (totalEMTL + totalBankCharges) * 0.24).toFixed(0)} saved!`,
          html: generateEmailHTML(savingsData),
        });

        console.log(`[Weekly Savings Email] Email sent to ${user.email}:`, emailResponse);

        // Track analytics event
        await supabase.from("analytics_events").insert({
          user_id: user.id,
          event_type: "weekly_savings_email_sent",
          metadata: {
            totalEMTL,
            totalBankCharges,
            totalVAT,
            potentialRefund,
            email: user.email,
          },
        });

        emailsSent++;
        results.push({ userId: user.id, status: "sent" });
      } catch (userError: any) {
        console.error(`[Weekly Savings Email] Error for user ${user.id}:`, userError);
        emailsFailed++;
        results.push({ userId: user.id, status: "failed", error: userError.message });
      }
    }

    console.log(`[Weekly Savings Email] Complete: ${emailsSent} sent, ${emailsFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent,
        emailsFailed,
        totalProcessed: users.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Weekly Savings Email] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
