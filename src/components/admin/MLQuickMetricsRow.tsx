import { useMLQuickMetrics } from "@/hooks/useMLQuickMetrics";
import { 
  Brain, 
  MessageSquare, 
  Target, 
  Users,
  RefreshCw,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

export function MLQuickMetricsRow() {
  const { metrics, loading, error, refetch } = useMLQuickMetrics();

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
            <div className="h-20 bg-accent/50 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-center text-muted-foreground">
        <AlertCircle className="w-6 h-6 mx-auto mb-2" />
        <p>Unable to load ML metrics</p>
      </div>
    );
  }

  const cards = [
    {
      title: "ML Model Health",
      icon: Brain,
      value: metrics.modelHealth.accuracy ? `${metrics.modelHealth.accuracy}%` : "—",
      subtitle: metrics.modelHealth.status,
      subtext: metrics.modelHealth.lastTrained 
        ? `Trained ${new Date(metrics.modelHealth.lastTrained).toLocaleDateString()}`
        : "No training data",
      color: metrics.modelHealth.accuracy && metrics.modelHealth.accuracy >= 80 
        ? "text-green-400" 
        : metrics.modelHealth.accuracy && metrics.modelHealth.accuracy >= 60 
          ? "text-yellow-400" 
          : "text-muted-foreground",
      bg: "bg-purple-400/10"
    },
    {
      title: "AI Feedback Queue",
      icon: MessageSquare,
      value: metrics.feedbackQueue.pending.toString(),
      subtitle: "Pending Training",
      subtext: `${metrics.feedbackQueue.trainedThisWeek} trained this week`,
      color: metrics.feedbackQueue.pending > 100 ? "text-yellow-400" : "text-blue-400",
      bg: "bg-blue-400/10"
    },
    {
      title: "Classification Confidence",
      icon: Target,
      value: `${metrics.classificationConfidence.average}%`,
      subtitle: "Average Confidence",
      subtext: `${metrics.classificationConfidence.high} high / ${metrics.classificationConfidence.medium} med / ${metrics.classificationConfidence.low} low`,
      color: metrics.classificationConfidence.average >= 70 
        ? "text-green-400" 
        : metrics.classificationConfidence.average >= 50 
          ? "text-yellow-400" 
          : "text-red-400",
      bg: "bg-green-400/10"
    },
    {
      title: "Onboarding Funnel",
      icon: Users,
      value: metrics.onboardingFunnel.activeSessions.toString(),
      subtitle: "Active Sessions",
      subtext: `${metrics.onboardingFunnel.completionRate}% completion · ${metrics.onboardingFunnel.avgConfidence}% avg confidence`,
      color: "text-orange-400",
      bg: "bg-orange-400/10"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.title} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className={cn("p-2 rounded-lg", card.bg)}>
              <card.icon className={cn("w-5 h-5", card.color)} />
            </div>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <h4 className="text-xs text-muted-foreground font-medium">{card.title}</h4>
          <p className={cn("text-2xl font-bold mt-1", card.color)}>{card.value}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {card.subtitle}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {card.subtext}
          </p>
        </div>
      ))}
    </div>
  );
}
