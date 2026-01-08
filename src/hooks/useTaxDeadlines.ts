import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TaxDeadline {
    id: string;
    deadline_type: string;
    title: string;
    description: string | null;
    recurrence: string | null;
    day_of_month: number | null;
    month_of_year: number | null;
    specific_date: string | null;
    is_active: boolean;
}

export function useTaxDeadlines() {
    return useQuery({
        queryKey: ['tax-deadlines'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tax_deadlines')
                .select('*')
                .eq('is_active', true)
                .order('deadline_type');

            if (error) throw error;
            return data as TaxDeadline[];
        },
        staleTime: 1000 * 60 * 30, // 30 minutes
    });
}

// Generate actual deadline dates from recurrence rules
export function generateDeadlineDates(deadlines: TaxDeadline[], year: number): Array<{
    id: string;
    title: string;
    description: string;
    date: Date;
    type: string;
    recurring: boolean;
}> {
    const result: Array<{
        id: string;
        title: string;
        description: string;
        date: Date;
        type: string;
        recurring: boolean;
    }> = [];

    for (const deadline of deadlines) {
        if (deadline.recurrence === 'monthly' && deadline.day_of_month) {
            // Generate for each month
            for (let month = 0; month < 12; month++) {
                result.push({
                    id: `${deadline.id}-${year}-${month}`,
                    title: deadline.title,
                    description: deadline.description || '',
                    date: new Date(year, month, deadline.day_of_month),
                    type: deadline.deadline_type,
                    recurring: true,
                });
            }
        } else if (deadline.recurrence === 'annual' && deadline.month_of_year && deadline.day_of_month) {
            result.push({
                id: `${deadline.id}-${year}`,
                title: deadline.title,
                description: deadline.description || '',
                date: new Date(year, deadline.month_of_year - 1, deadline.day_of_month),
                type: deadline.deadline_type,
                recurring: false,
            });
        } else if (deadline.specific_date) {
            const specificDate = new Date(deadline.specific_date);
            if (specificDate.getFullYear() === year) {
                result.push({
                    id: deadline.id,
                    title: deadline.title,
                    description: deadline.description || '',
                    date: specificDate,
                    type: deadline.deadline_type,
                    recurring: false,
                });
            }
        }
    }

    return result;
}
