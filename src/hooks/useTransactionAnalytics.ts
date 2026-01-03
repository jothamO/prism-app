import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TransactionBreakdown {
  ussd_count: number;
  pos_count: number;
  mobile_money_count: number;
  foreign_currency_count: number;
  bank_charge_count: number;
  emtl_count: number;
  standard_count: number;
  total_count: number;
}

interface VATSummary {
  total_vat: number;
  vat_applicable_count: number;
  total_transactions: number;
  total_credits: number;
  total_debits: number;
}

interface ClassificationBreakdown {
  ai_count: number;
  rule_based_count: number;
  pattern_count: number;
  unclassified_count: number;
  avg_confidence: number;
}

interface MobileMoneyProvider {
  provider: string;
  count: number;
}

export function useTransactionAnalytics(days: number = 30) {
  // Fetch Nigerian transaction type breakdown
  const transactionBreakdown = useQuery({
    queryKey: ['transaction-breakdown', days],
    queryFn: async (): Promise<TransactionBreakdown> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('is_ussd_transaction, is_pos_transaction, is_mobile_money, is_foreign_currency, is_bank_charge, is_emtl')
        .gte('transaction_date', startDate.toISOString().split('T')[0]);
      
      if (error) throw error;
      
      const breakdown: TransactionBreakdown = {
        ussd_count: 0,
        pos_count: 0,
        mobile_money_count: 0,
        foreign_currency_count: 0,
        bank_charge_count: 0,
        emtl_count: 0,
        standard_count: 0,
        total_count: data?.length || 0
      };
      
      data?.forEach(tx => {
        if (tx.is_ussd_transaction) breakdown.ussd_count++;
        if (tx.is_pos_transaction) breakdown.pos_count++;
        if (tx.is_mobile_money) breakdown.mobile_money_count++;
        if (tx.is_foreign_currency) breakdown.foreign_currency_count++;
        if (tx.is_bank_charge) breakdown.bank_charge_count++;
        if (tx.is_emtl) breakdown.emtl_count++;
        if (!tx.is_ussd_transaction && !tx.is_pos_transaction && !tx.is_mobile_money && !tx.is_foreign_currency) {
          breakdown.standard_count++;
        }
      });
      
      return breakdown;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch VAT summary
  const vatSummary = useQuery({
    queryKey: ['vat-summary', days],
    queryFn: async (): Promise<VATSummary> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('vat_applicable, vat_amount, credit, debit')
        .gte('transaction_date', startDate.toISOString().split('T')[0]);
      
      if (error) throw error;
      
      return {
        total_vat: data?.reduce((sum, tx) => sum + (tx.vat_applicable ? (tx.vat_amount || 0) : 0), 0) || 0,
        vat_applicable_count: data?.filter(tx => tx.vat_applicable).length || 0,
        total_transactions: data?.length || 0,
        total_credits: data?.reduce((sum, tx) => sum + (tx.credit || 0), 0) || 0,
        total_debits: data?.reduce((sum, tx) => sum + (tx.debit || 0), 0) || 0
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch classification breakdown
  const classificationBreakdown = useQuery({
    queryKey: ['classification-breakdown', days],
    queryFn: async (): Promise<ClassificationBreakdown> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('classification_source, confidence')
        .gte('transaction_date', startDate.toISOString().split('T')[0]);
      
      if (error) throw error;
      
      const breakdown: ClassificationBreakdown = {
        ai_count: 0,
        rule_based_count: 0,
        pattern_count: 0,
        unclassified_count: 0,
        avg_confidence: 0
      };
      
      let totalConfidence = 0;
      let confidenceCount = 0;
      
      data?.forEach(tx => {
        switch (tx.classification_source) {
          case 'ai': breakdown.ai_count++; break;
          case 'rule_based': breakdown.rule_based_count++; break;
          case 'pattern': breakdown.pattern_count++; break;
          default: breakdown.unclassified_count++;
        }
        if (tx.confidence) {
          totalConfidence += tx.confidence;
          confidenceCount++;
        }
      });
      
      breakdown.avg_confidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
      
      return breakdown;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch mobile money provider breakdown
  const mobileMoneyProviders = useQuery({
    queryKey: ['mobile-money-providers', days],
    queryFn: async (): Promise<MobileMoneyProvider[]> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('mobile_money_provider')
        .eq('is_mobile_money', true)
        .gte('transaction_date', startDate.toISOString().split('T')[0]);
      
      if (error) throw error;
      
      const providerCounts: Record<string, number> = {};
      data?.forEach(tx => {
        const provider = tx.mobile_money_provider || 'Unknown';
        providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      });
      
      return Object.entries(providerCounts)
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch daily trends
  const dailyTrends = useQuery({
    queryKey: ['daily-trends', days],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('transaction_date, is_ussd_transaction, is_pos_transaction, is_mobile_money, vat_amount, vat_applicable')
        .gte('transaction_date', startDate.toISOString().split('T')[0])
        .order('transaction_date', { ascending: true });
      
      if (error) throw error;
      
      // Group by date
      const grouped: Record<string, { 
        date: string;
        ussd: number;
        pos: number;
        mobile_money: number;
        vat: number;
        total: number;
      }> = {};
      
      data?.forEach(tx => {
        const date = tx.transaction_date;
        if (!grouped[date]) {
          grouped[date] = { date, ussd: 0, pos: 0, mobile_money: 0, vat: 0, total: 0 };
        }
        grouped[date].total++;
        if (tx.is_ussd_transaction) grouped[date].ussd++;
        if (tx.is_pos_transaction) grouped[date].pos++;
        if (tx.is_mobile_money) grouped[date].mobile_money++;
        if (tx.vat_applicable) grouped[date].vat += tx.vat_amount || 0;
      });
      
      return Object.values(grouped);
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    transactionBreakdown,
    vatSummary,
    classificationBreakdown,
    mobileMoneyProviders,
    dailyTrends,
    isLoading: transactionBreakdown.isLoading || vatSummary.isLoading || classificationBreakdown.isLoading,
    error: transactionBreakdown.error || vatSummary.error || classificationBreakdown.error
  };
}