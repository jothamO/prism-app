import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EducationArticle {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    category: string;
    content: string;
    read_time: string | null;
    is_published: boolean;
    version: number;
    updated_at: string;
}

export function useEducationArticles() {
    return useQuery({
        queryKey: ['education-articles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('education_articles')
                .select('*')
                .eq('is_published', true)
                .order('category');

            if (error) throw error;
            return data as EducationArticle[];
        },
        staleTime: 1000 * 60 * 30, // 30 minutes
    });
}
