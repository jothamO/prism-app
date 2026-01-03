import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ClassificationPattern {
  id: string;
  business_id: string;
  item_pattern: string;
  category: string;
  confidence: number;
  occurrence_count: number;
  correct_predictions: number;
  total_amount: number;
  last_used_at: string;
  created_at: string;
  business_name?: string;
}

interface PatternFilters {
  category?: string;
  minConfidence?: number;
  maxConfidence?: number;
  searchTerm?: string;
}

export function usePatternManagement(filters?: PatternFilters) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all patterns with business names
  const patterns = useQuery({
    queryKey: ['classification-patterns', filters],
    queryFn: async (): Promise<ClassificationPattern[]> => {
      let query = supabase
        .from('business_classification_patterns')
        .select(`
          *,
          businesses!inner(name)
        `)
        .order('last_used_at', { ascending: false });
      
      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.minConfidence !== undefined) {
        query = query.gte('confidence', filters.minConfidence);
      }
      if (filters?.maxConfidence !== undefined) {
        query = query.lte('confidence', filters.maxConfidence);
      }
      if (filters?.searchTerm) {
        query = query.ilike('item_pattern', `%${filters.searchTerm}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []).map(p => ({
        ...p,
        business_name: (p.businesses as any)?.name || 'Unknown'
      }));
    },
    staleTime: 30 * 1000,
  });

  // Get unique categories
  const categories = useQuery({
    queryKey: ['pattern-categories'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('business_classification_patterns')
        .select('category')
        .order('category');
      
      if (error) throw error;
      
      const unique = [...new Set(data?.map(d => d.category) || [])];
      return unique;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Create pattern
  const createPattern = useMutation({
    mutationFn: async (pattern: { 
      business_id: string;
      item_pattern: string;
      category: string;
      confidence?: number;
    }) => {
      const { data, error } = await supabase
        .from('business_classification_patterns')
        .insert({
          business_id: pattern.business_id,
          item_pattern: pattern.item_pattern.toLowerCase().trim(),
          category: pattern.category,
          confidence: pattern.confidence ?? 0.5,
          occurrence_count: 1,
          correct_predictions: 1
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Pattern Created", description: "New classification pattern added" });
      queryClient.invalidateQueries({ queryKey: ['classification-patterns'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: String(error), variant: "destructive" });
    }
  });

  // Update pattern
  const updatePattern = useMutation({
    mutationFn: async ({ id, updates }: { 
      id: string;
      updates: Partial<ClassificationPattern>;
    }) => {
      const { data, error } = await supabase
        .from('business_classification_patterns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Pattern Updated" });
      queryClient.invalidateQueries({ queryKey: ['classification-patterns'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: String(error), variant: "destructive" });
    }
  });

  // Delete pattern
  const deletePattern = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('business_classification_patterns')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Pattern Deleted" });
      queryClient.invalidateQueries({ queryKey: ['classification-patterns'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: String(error), variant: "destructive" });
    }
  });

  // Bulk delete patterns
  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('business_classification_patterns')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast({ title: "Patterns Deleted", description: `Removed ${ids.length} patterns` });
      queryClient.invalidateQueries({ queryKey: ['classification-patterns'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: String(error), variant: "destructive" });
    }
  });

  // Bulk update confidence (approve = 1.0, reset = 0.5)
  const bulkUpdateConfidence = useMutation({
    mutationFn: async ({ ids, confidence }: { ids: string[]; confidence: number }) => {
      const { error } = await supabase
        .from('business_classification_patterns')
        .update({ confidence })
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: (_, { ids, confidence }) => {
      const action = confidence >= 0.9 ? 'Approved' : 'Reset';
      toast({ title: `Patterns ${action}`, description: `Updated ${ids.length} patterns` });
      queryClient.invalidateQueries({ queryKey: ['classification-patterns'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: String(error), variant: "destructive" });
    }
  });

  // Bulk change category
  const bulkChangeCategory = useMutation({
    mutationFn: async ({ ids, category }: { ids: string[]; category: string }) => {
      const { error } = await supabase
        .from('business_classification_patterns')
        .update({ category })
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: (_, { ids }) => {
      toast({ title: "Categories Updated", description: `Changed ${ids.length} patterns` });
      queryClient.invalidateQueries({ queryKey: ['classification-patterns'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: String(error), variant: "destructive" });
    }
  });

  // Get pattern stats
  const stats = useQuery({
    queryKey: ['pattern-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_classification_patterns')
        .select('category, confidence, occurrence_count');
      
      if (error) throw error;
      
      const totalPatterns = data?.length || 0;
      const avgConfidence = data?.reduce((sum, p) => sum + p.confidence, 0) / totalPatterns || 0;
      const highConfidence = data?.filter(p => p.confidence >= 0.8).length || 0;
      const lowConfidence = data?.filter(p => p.confidence < 0.5).length || 0;
      
      const byCategory: Record<string, number> = {};
      data?.forEach(p => {
        byCategory[p.category] = (byCategory[p.category] || 0) + 1;
      });
      
      return {
        totalPatterns,
        avgConfidence,
        highConfidence,
        lowConfidence,
        byCategory
      };
    },
    staleTime: 60 * 1000,
  });

  return {
    patterns,
    categories,
    stats,
    createPattern,
    updatePattern,
    deletePattern,
    bulkDelete,
    bulkUpdateConfidence,
    bulkChangeCategory,
    isLoading: patterns.isLoading,
    error: patterns.error
  };
}