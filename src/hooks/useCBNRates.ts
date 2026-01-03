import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CBNRate {
  id: string;
  currency: string;
  rate: number;
  rate_date: string;
  source: string;
  created_at: string;
  updated_at: string;
}

interface RateLog {
  id: string;
  fetch_date: string;
  currencies_updated: number;
  source: string;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export function useCBNRates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current rates
  const currentRates = useQuery({
    queryKey: ['cbn-rates-current'],
    queryFn: async (): Promise<CBNRate[]> => {
      // Get the most recent rate for each currency
      const { data, error } = await supabase
        .from('cbn_exchange_rates')
        .select('*')
        .order('rate_date', { ascending: false });
      
      if (error) throw error;
      
      // Deduplicate by currency (keep most recent)
      const latestByCurrency: Record<string, CBNRate> = {};
      data?.forEach(rate => {
        if (!latestByCurrency[rate.currency] || rate.rate_date > latestByCurrency[rate.currency].rate_date) {
          latestByCurrency[rate.currency] = rate;
        }
      });
      
      return Object.values(latestByCurrency);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch rate history for USD
  const rateHistory = useQuery({
    queryKey: ['cbn-rate-history'],
    queryFn: async (): Promise<CBNRate[]> => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data, error } = await supabase
        .from('cbn_exchange_rates')
        .select('*')
        .eq('currency', 'USD')
        .gte('rate_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('rate_date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch rate logs
  const rateLogs = useQuery({
    queryKey: ['cbn-rate-logs'],
    queryFn: async (): Promise<RateLog[]> => {
      const { data, error } = await supabase
        .from('cbn_rate_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000,
  });

  // Trigger rate fetch
  const triggerFetch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cbn-rate-fetcher');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Rates Updated",
        description: data.message || "Exchange rates have been refreshed",
      });
      queryClient.invalidateQueries({ queryKey: ['cbn-rates-current'] });
      queryClient.invalidateQueries({ queryKey: ['cbn-rate-history'] });
      queryClient.invalidateQueries({ queryKey: ['cbn-rate-logs'] });
    },
    onError: (error) => {
      toast({
        title: "Fetch Failed",
        description: String(error),
        variant: "destructive",
      });
    }
  });

  // Get freshness status
  const getFreshness = () => {
    const latestRate = currentRates.data?.find(r => r.currency === 'USD');
    if (!latestRate) return { status: 'stale', message: 'No rates available' };
    
    const rateDate = new Date(latestRate.rate_date);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - rateDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return { status: 'fresh', message: "Today's rate" };
    if (diffDays === 1) return { status: 'recent', message: "Yesterday's rate" };
    if (diffDays <= 7) return { status: 'stale', message: `${diffDays} days old` };
    return { status: 'outdated', message: `${diffDays} days old - refresh recommended` };
  };

  return {
    currentRates,
    rateHistory,
    rateLogs,
    triggerFetch,
    getFreshness,
    isLoading: currentRates.isLoading,
    error: currentRates.error
  };
}