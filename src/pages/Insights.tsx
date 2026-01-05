import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Wallet,
  FileText,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserInsights, Insight } from '@/hooks/useUserInsights';

const typeIcons: Record<string, typeof Lightbulb> = {
  deduction: Wallet,
  threshold: TrendingUp,
  deadline: Calendar,
  compliance: FileText,
  vat_refund: Wallet,
  registration: Building2,
  default: Lightbulb,
};

const priorityColors: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-primary/10 text-primary border-primary/20',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function InsightCard({ 
  insight, 
  onMarkAsRead, 
  onMarkAsActedOn 
}: { 
  insight: Insight;
  onMarkAsRead: (id: string) => void;
  onMarkAsActedOn: (id: string) => void;
}) {
  const Icon = typeIcons[insight.type] || typeIcons.default;

  return (
    <Card className={`transition-all ${!insight.isRead ? 'ring-2 ring-primary/20' : ''} ${insight.isActedOn ? 'opacity-60' : ''}`}>
      <CardContent className="pt-4">
        <div className="flex gap-4">
          <div className={`p-3 rounded-lg shrink-0 ${priorityColors[insight.priority]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground">{insight.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
              </div>
              <Badge variant="outline" className={`shrink-0 ${priorityColors[insight.priority]}`}>
                {insight.priority}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {insight.potentialSavings && insight.potentialSavings > 0 && (
                <span className="text-sm font-medium text-emerald-600">
                  Save {formatCurrency(insight.potentialSavings)}
                </span>
              )}
              {insight.deadline && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Due: {new Date(insight.deadline).toLocaleDateString()}
                </span>
              )}
            </div>

            {!insight.isActedOn && (
              <div className="flex gap-2 mt-4">
                {insight.action && (
                  <Button 
                    size="sm" 
                    onClick={() => onMarkAsActedOn(insight.id)}
                  >
                    {insight.action}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
                {!insight.isRead && (
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => onMarkAsRead(insight.id)}
                  >
                    Mark as read
                  </Button>
                )}
              </div>
            )}

            {insight.isActedOn && (
              <div className="flex items-center gap-2 mt-3 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">Completed</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Insights() {
  const navigate = useNavigate();
  const {
    insights,
    loading,
    generating,
    generateInsights,
    markAsRead,
    markAsActedOn,
    unreadCount,
    highPriorityCount,
    totalPotentialSavings,
  } = useUserInsights();

  const [filter, setFilter] = useState<'all' | 'high' | 'unread'>('all');

  const filteredInsights = insights.filter(i => {
    if (filter === 'high') return i.priority === 'high' && !i.isActedOn;
    if (filter === 'unread') return !i.isRead;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading insights...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Financial Insights
            </h1>
            <p className="text-muted-foreground mt-1">
              Personalized recommendations to optimize your taxes
            </p>
          </div>
        </div>
        <Button 
          onClick={generateInsights} 
          disabled={generating}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating...' : 'Refresh'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{insights.length}</div>
            {unreadCount > 0 && (
              <p className="text-sm text-primary">{unreadCount} unread</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              High Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{highPriorityCount}</div>
            <p className="text-sm text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Potential Savings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totalPotentialSavings)}
            </div>
            <p className="text-sm text-muted-foreground">If you act on insights</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({insights.length})
        </Button>
        <Button
          variant={filter === 'high' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('high')}
        >
          High Priority ({highPriorityCount})
        </Button>
        <Button
          variant={filter === 'unread' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </Button>
      </div>

      {/* Insights List */}
      {filteredInsights.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {filter === 'all' ? 'No insights yet' : 'No matching insights'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {filter === 'all' 
                ? 'Connect your bank and generate insights to get personalized recommendations.'
                : 'Try changing the filter to see more insights.'}
            </p>
            {filter === 'all' && (
              <Button onClick={generateInsights} disabled={generating}>
                Generate Insights
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredInsights.map(insight => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onMarkAsRead={markAsRead}
              onMarkAsActedOn={markAsActedOn}
            />
          ))}
        </div>
      )}
    </div>
  );
}
