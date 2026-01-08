import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FAQItem {
    id: string;
    category: string;
    question: string;
    answer: string;
    display_order: number;
    is_published: boolean;
    updated_at: string;
}

export function useFAQItems() {
    return useQuery({
        queryKey: ['faq-items'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('faq_items')
                .select('*')
                .eq('is_published', true)
                .order('category')
                .order('display_order');

            if (error) throw error;
            return data as FAQItem[];
        },
        staleTime: 1000 * 60 * 30, // 30 minutes
    });
}

// Group FAQ items by category
export function groupFAQByCategory(items: FAQItem[]): Record<string, FAQItem[]> {
    return items.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, FAQItem[]>);
}
