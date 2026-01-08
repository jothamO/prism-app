import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar as CalendarIcon,
    Clock,
    ChevronLeft,
    ChevronRight,
    FileText,
    Receipt,
    Building2,
    DollarSign,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTaxDeadlines, generateDeadlineDates } from '@/hooks/useTaxDeadlines';

interface CalendarDeadline {
    id: string;
    title: string;
    description: string;
    date: Date;
    type: string;
    recurring: boolean;
}

// Fallback deadlines if DB is unavailable
const generateFallbackDeadlines = (year: number): CalendarDeadline[] => {
    const deadlines: CalendarDeadline[] = [];
    for (let month = 0; month < 12; month++) {
        deadlines.push({
            id: `vat-${year}-${month}`,
            title: 'VAT Return',
            description: 'Monthly VAT filing due to FIRS',
            date: new Date(year, month, 21),
            type: 'vat',
            recurring: true,
        });
        deadlines.push({
            id: `paye-${year}-${month}`,
            title: 'PAYE Remittance',
            description: 'Monthly PAYE tax remittance',
            date: new Date(year, month, 10),
            type: 'paye',
            recurring: true,
        });
    }
    deadlines.push({
        id: `annual-${year}`,
        title: 'Annual Tax Return',
        description: 'Personal/Corporate income tax filing',
        date: new Date(year, 2, 31),
        type: 'annual',
        recurring: false,
    });
    return deadlines;
};

const getTypeIcon = (type: string) => {
    switch (type) {
        case 'vat': return Receipt;
        case 'paye': return DollarSign;
        case 'annual': return FileText;
        default: return Building2;
    }
};

export default function TaxCalendar() {
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    
    const { data: dbDeadlines, isLoading } = useTaxDeadlines();

    // Generate deadline dates from DB or fallback
    const deadlines = useMemo(() => {
        const currentYear = currentDate.getFullYear();
        if (dbDeadlines && dbDeadlines.length > 0) {
            return [
                ...generateDeadlineDates(dbDeadlines, currentYear),
                ...generateDeadlineDates(dbDeadlines, currentYear + 1),
            ];
        }
        return [
            ...generateFallbackDeadlines(currentYear),
            ...generateFallbackDeadlines(currentYear + 1),
        ];
    }, [dbDeadlines, currentDate]);

    const getDaysInMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const navigateMonth = (direction: 'prev' | 'next') => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            if (direction === 'prev') {
                newDate.setMonth(prev.getMonth() - 1);
            } else {
                newDate.setMonth(prev.getMonth() + 1);
            }
            return newDate;
        });
    };

    const getDeadlinesForDate = (date: Date) => {
        return deadlines.filter(d =>
            d.date.getFullYear() === date.getFullYear() &&
            d.date.getMonth() === date.getMonth() &&
            d.date.getDate() === date.getDate()
        );
    };

    const getUpcomingDeadlines = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return deadlines
            .filter(d => d.date >= today)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .slice(0, 5);
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const getDaysUntil = (date: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = date.getTime() - today.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'vat': return 'bg-green-500';
            case 'paye': return 'bg-blue-500';
            case 'annual': return 'bg-purple-500';
            default: return 'bg-gray-500';
        }
    };

    const getTypeBadgeColor = (type: string) => {
        switch (type) {
            case 'vat': return 'bg-green-100 text-green-700';
            case 'paye': return 'bg-blue-100 text-blue-700';
            case 'annual': return 'bg-purple-100 text-purple-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Build calendar grid
    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
        calendarDays.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        calendarDays.push(i);
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <CalendarIcon className="h-8 w-8 text-indigo-600" />
                            <h1 className="text-xl font-bold text-gray-900">Tax Calendar</h1>
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                        </div>
                        <Button variant="outline" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Calendar */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>{monthName}</CardTitle>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {/* Days header */}
                            <div className="grid grid-cols-7 gap-1 mb-2">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {/* Calendar grid */}
                            <div className="grid grid-cols-7 gap-1">
                                {calendarDays.map((day, index) => {
                                    if (!day) {
                                        return <div key={`empty-${index}`} className="h-20" />;
                                    }

                                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                                    const dayDeadlines = getDeadlinesForDate(date);
                                    const isCurrentDay = isToday(date);

                                    return (
                                        <button
                                            key={day}
                                            onClick={() => setSelectedDate(date)}
                                            className={`h-20 p-1 border rounded-lg text-left transition-colors hover:bg-gray-50 ${isCurrentDay ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                                                } ${selectedDate?.getTime() === date.getTime() ? 'ring-2 ring-indigo-500' : ''}`}
                                        >
                                            <span className={`text-sm font-medium ${isCurrentDay ? 'text-indigo-600' : 'text-gray-700'}`}>
                                                {day}
                                            </span>
                                            <div className="flex flex-wrap gap-0.5 mt-1">
                                                {dayDeadlines.slice(0, 3).map((d, i) => (
                                                    <div
                                                        key={i}
                                                        className={`h-1.5 w-1.5 rounded-full ${getTypeColor(d.type)}`}
                                                        title={d.title}
                                                    />
                                                ))}
                                                {dayDeadlines.length > 3 && (
                                                    <span className="text-[10px] text-gray-400">+{dayDeadlines.length - 3}</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Legend */}
                            <div className="flex gap-4 mt-4 pt-4 border-t text-sm">
                                <div className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full bg-green-500" />
                                    <span>VAT</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                                    <span>PAYE</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full bg-purple-500" />
                                    <span>Annual</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Selected Date Details */}
                        {selectedDate && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">
                                        {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {getDeadlinesForDate(selectedDate).length === 0 ? (
                                        <p className="text-sm text-gray-500">No deadlines on this date</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {getDeadlinesForDate(selectedDate).map(d => {
                                                const Icon = getTypeIcon(d.type);
                                                return (
                                                    <div key={d.id} className="p-3 bg-gray-50 rounded-lg">
                                                        <div className="flex items-center gap-2">
                                                            <Icon className="h-4 w-4 text-gray-600" />
                                                            <span className="font-medium text-sm">{d.title}</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1">{d.description}</p>
                                                        <Badge variant="secondary" className={`mt-2 text-xs ${getTypeBadgeColor(d.type)}`}>
                                                            {d.type.toUpperCase()}
                                                        </Badge>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Upcoming Deadlines */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Upcoming Deadlines
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {getUpcomingDeadlines().map(d => {
                                        const daysUntil = getDaysUntil(d.date);
                                        return (
                                            <div
                                                key={d.id}
                                                className={`p-3 rounded-lg border ${daysUntil <= 3 ? 'border-red-200 bg-red-50' :
                                                        daysUntil <= 7 ? 'border-amber-200 bg-amber-50' :
                                                            'border-gray-200 bg-gray-50'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-sm">{d.title}</span>
                                                    <Badge variant="outline" className={
                                                        daysUntil <= 3 ? 'text-red-600 border-red-300' :
                                                            daysUntil <= 7 ? 'text-amber-600 border-amber-300' :
                                                                'text-gray-600'
                                                    }>
                                                        {daysUntil === 0 ? 'Today' :
                                                            daysUntil === 1 ? 'Tomorrow' :
                                                                `${daysUntil} days`}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
