import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Insight {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string | null;
  potentialSavings: number | null;
  deadline: string | null;
  isRead: boolean;
  isActedOn: boolean;
  createdAt: string;
  month: string;
}

interface UseUserInsightsReturn {
  insights: Insight[];
  loading: boolean;
  generating: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  generateInsights: () => Promise<void>;
  markAsRead: (insightId: string) => Promise<void>;
  markAsActedOn: (insightId: string) => Promise<void>;
  unreadCount: number;
  highPriorityCount: number;
  totalPotentialSavings: number;
}

export function useUserInsights(): UseUserInsightsReturn {
  const { user } = useAuth();
  const { toast } = useToast();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Query by auth_user_id for frontend compatibility (auth.users.id = profiles.id)
      const { data, error: fetchError } = await supabase
        .from('user_insights')
        .select('*')
        .eq('auth_user_id', user.id)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const mapped: Insight[] = (data || []).map((insight) => ({
        id: insight.id,
        type: insight.type,
        priority: insight.priority as 'high' | 'medium' | 'low',
        title: insight.title,
        description: insight.description,
        action: insight.action,
        potentialSavings: insight.potential_savings,
        deadline: insight.deadline,
        isRead: insight.is_read ?? false,
        isActedOn: insight.is_acted_on ?? false,
        createdAt: insight.created_at,
        month: insight.month,
      }));

      setInsights(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch insights';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const generateInsights = useCallback(async () => {
    if (!user?.id) return;

    try {
      setGenerating(true);

      // First, look up the users table ID from auth_user_id
      const { data: userRecord, error: lookupError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (lookupError || !userRecord) {
        throw new Error('User profile not found. Please complete registration first.');
      }

      // Call generate-insights with the correct users.id
      const { error: genError } = await supabase.functions.invoke('generate-insights', {
        body: { userId: userRecord.id, saveInsights: true },
      });

      if (genError) throw genError;

      toast({
        title: 'Insights Generated',
        description: 'Your financial insights have been updated.',
      });

      await fetchInsights();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate insights';
      toast({
        title: 'Generation Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  }, [user?.id, toast, fetchInsights]);

  const markAsRead = useCallback(async (insightId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('user_insights')
        .update({ is_read: true })
        .eq('id', insightId);

      if (updateError) throw updateError;

      setInsights(prev => 
        prev.map(i => i.id === insightId ? { ...i, isRead: true } : i)
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  }, []);

  const markAsActedOn = useCallback(async (insightId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('user_insights')
        .update({ is_acted_on: true, is_read: true })
        .eq('id', insightId);

      if (updateError) throw updateError;

      setInsights(prev => 
        prev.map(i => i.id === insightId ? { ...i, isActedOn: true, isRead: true } : i)
      );

      toast({
        title: 'Action Recorded',
        description: 'This insight has been marked as completed.',
      });
    } catch (err) {
      console.error('Failed to mark as acted on:', err);
    }
  }, [toast]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const unreadCount = insights.filter(i => !i.isRead).length;
  const highPriorityCount = insights.filter(i => i.priority === 'high' && !i.isActedOn).length;
  const totalPotentialSavings = insights
    .filter(i => !i.isActedOn && i.potentialSavings)
    .reduce((sum, i) => sum + (i.potentialSavings || 0), 0);

  return {
    insights,
    loading,
    generating,
    error,
    refetch: fetchInsights,
    generateInsights,
    markAsRead,
    markAsActedOn,
    unreadCount,
    highPriorityCount,
    totalPotentialSavings,
  };
}
