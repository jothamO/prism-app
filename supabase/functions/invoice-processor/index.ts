import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


const STANDARD_RATE = 0.075;

// Simulated OCR extraction patterns
const MOCK_OCR_TEMPLATES = [
  {
    pattern: 'retail',
    customerName: 'Cash Customer',
    items: [
      { description: 'Merchandise', quantity: 1, unitPrice: 50000 }
    ]
  },
  {
    pattern: 'wholesale',
    customerName: 'ABC Distributors Ltd',
    items: [
      { description: 'Bulk goods', quantity: 10, unitPrice: 25000 }
    ]
  },
  {
    pattern: 'services',
    customerName: 'XYZ Corporation',
    items: [
      { description: 'Consulting services', quantity: 1, unitPrice: 150000 }
    ]
  },
  {
    pattern: 'food',
    customerName: 'Restaurant Supplies Inc',
    items: [
      { description: 'Rice (50kg bags)', quantity: 5, unitPrice: 30000 },
      { description: 'Cooking oil (25L)', quantity: 2, unitPrice: 15000 }
    ]
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ===== AUTHENTICATION CHECK =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[invoice-processor] Missing authorization header');
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create client with user's token for auth check
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.log('[invoice-processor] Invalid token:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[invoice-processor] User authenticated:', user.id);
    // ===== END AUTHENTICATION CHECK =====

    // Use service role for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, userId, businessId, invoiceData, mockType } = await req.json();

    // Validate that user can only access their own data (or admin can access all)
    const { data: isAdmin } = await supabaseAuth.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    const targetUserId = userId || user.id;
    if (!isAdmin && targetUserId !== user.id) {
      console.log('[invoice-processor] User trying to access other user data');
      return new Response(JSON.stringify({ error: 'Forbidden - Cannot access other user data' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    switch (action) {
      case 'process-ocr': {
        // Simulate OCR processing with random confidence
        const confidence = 0.75 + Math.random() * 0.2; // 75-95%
        const template = MOCK_OCR_TEMPLATES.find(t => t.pattern === mockType) || MOCK_OCR_TEMPLATES[0];
        
        const items = template.items.map(item => ({
          ...item,
          amount: item.quantity * item.unitPrice
        }));

        const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
        const vatAmount = Math.round(subtotal * STANDARD_RATE * 100) / 100;
        const total = subtotal + vatAmount;

        const ocrResult = {
          success: true,
          confidence,
          needsReview: confidence < 0.85,
          reviewReasons: confidence < 0.85 ? ['Low confidence extraction'] : [],
          extractedData: {
            invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
            date: new Date().toISOString().split('T')[0],
            customerName: template.customerName,
            items,
            subtotal,
            vatAmount,
            total
          }
        };

        console.log('OCR Processing Result:', ocrResult);

        return new Response(JSON.stringify(ocrResult), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'create-invoice': {
        const period = invoiceData.date.substring(0, 7); // YYYY-MM

        const { data: invoice, error } = await supabase
          .from('invoices')
          .insert({
            user_id: targetUserId,
            business_id: businessId,
            invoice_number: invoiceData.invoiceNumber,
            date: invoiceData.date,
            customer_name: invoiceData.customerName,
            items: invoiceData.items,
            subtotal: invoiceData.subtotal,
            vat_amount: invoiceData.vatAmount,
            total: invoiceData.total,
            period,
            source: 'test_simulator',
            confidence_score: invoiceData.confidence,
            needs_review: invoiceData.needsReview,
            review_reasons: invoiceData.reviewReasons,
            status: invoiceData.needsReview ? 'pending_review' : 'pending_remittance'
          })
          .select()
          .single();

        if (error) throw error;

        // If needs review, add to review queue
        if (invoiceData.needsReview) {
          await supabase
            .from('review_queue')
            .insert({
              user_id: targetUserId,
              invoice_id: invoice.id,
              reasons: invoiceData.reviewReasons || ['Needs verification'],
              priority: invoiceData.confidence < 0.7 ? 'high' : 'medium',
              priority_score: 1 - invoiceData.confidence,
              status: 'pending'
            });
        }

        return new Response(JSON.stringify({ success: true, invoice }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'list-invoices': {
        let query = supabase
          .from('invoices')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (targetUserId) query = query.eq('user_id', targetUserId);
        if (businessId) query = query.eq('business_id', businessId);

        const { data, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ invoices: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Invoice Processor Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});