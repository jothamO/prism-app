import { useState } from "react";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RotateCcw,
  Banknote,
  Briefcase,
  Home,
  Wallet,
  Building2,
  ShieldCheck,
  UserCheck,
  History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceGauge } from "./ConfidenceGauge";
import { useProfileLearning, LearningHistory } from "@/hooks/useProfileLearning";
import { useToast } from "@/hooks/use-toast";

interface ProfileLearningTabProps {
  userId: string;
}

export function ProfileLearningTab({ userId }: ProfileLearningTabProps) {
  const { data, loading, error, confirmProfile, resetLearning, refetch } = useProfileLearning(userId);
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Brain className="w-6 h-6 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No learning data available for this user</p>
      </div>
    );
  }

  const handleConfirmProfile = async () => {
    setActionLoading("confirm");
    try {
      await confirmProfile();
      toast({ title: "Profile Confirmed", description: "User profile has been confirmed" });
    } catch {
      toast({ title: "Error", description: "Failed to confirm profile", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetLearning = async () => {
    if (!confirm("Are you sure you want to reset all learning data for this user? This cannot be undone.")) {
      return;
    }
    setActionLoading("reset");
    try {
      await resetLearning();
      toast({ title: "Learning Reset", description: "All learning data has been cleared" });
    } catch {
      toast({ title: "Error", description: "Failed to reset learning", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const incomeIcons: Record<string, typeof Banknote> = {
    salary: Banknote,
    freelance: Briefcase,
    business: Building2,
    rental: Home,
    pension: Wallet
  };

  return (
    <div className="space-y-6">
      {/* Header with Confidence Gauge */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <ConfidenceGauge value={data.profileConfidence} size="lg" />
        </div>
        
        {/* Learning Metrics */}
        <div className="flex-1 space-y-3">
          <div className="bg-accent/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              Transactions Analyzed
            </div>
            <p className="text-xl font-bold text-foreground">{data.totalTransactionsAnalyzed}</p>
          </div>
          
          <div className="bg-accent/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Brain className="w-4 h-4" />
              Corrections Made
            </div>
            <p className="text-xl font-bold text-foreground">
              {data.correctionsCount}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({data.correctionRate.toFixed(1)}% rate)
              </span>
            </p>
          </div>
          
          {data.lastLearningUpdate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              Last update: {new Date(data.lastLearningUpdate).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Detected Income Sources */}
      <div className="bg-background border border-border rounded-lg p-4">
        <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          Detected Income Sources
        </h4>
        {data.incomeSourcesDetected.length === 0 ? (
          <p className="text-sm text-muted-foreground">No income sources detected yet</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {data.incomeSourcesDetected.map((source) => {
              const Icon = incomeIcons[source.toLowerCase()] || Wallet;
              const metrics = data.patternMetrics;
              const count = metrics?.[`${source.toLowerCase()}Count` as keyof typeof metrics] as number || 0;
              const total = metrics?.[`${source.toLowerCase()}Total` as keyof typeof metrics] as number || 0;
              
              return (
                <div key={source} className="flex items-center gap-3 p-2 bg-accent/30 rounded-lg">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">{source}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} txns · ₦{total?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tax Profile Summary */}
      {data.taxProfile && (
        <div className="bg-background border border-border rounded-lg p-4">
          <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Tax Profile Summary
            {data.taxProfile.userConfirmed && (
              <span className="ml-auto text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Confirmed
              </span>
            )}
          </h4>
          
          <div className="grid grid-cols-2 gap-3">
            <ProfileField label="User Type" value={data.taxProfile.userType} />
            <ProfileField label="Employment" value={data.taxProfile.employmentStatus} />
            <ProfileField label="Industry" value={data.taxProfile.industryType} />
            <ProfileField 
              label="AI Confidence" 
              value={data.taxProfile.aiConfidence ? `${data.taxProfile.aiConfidence}%` : null} 
            />
          </div>
          
          {/* Special Flags */}
          <div className="flex flex-wrap gap-2 mt-3">
            {data.taxProfile.isPensioner && (
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
                Pensioner
              </span>
            )}
            {data.taxProfile.isSeniorCitizen && (
              <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full">
                Senior Citizen
              </span>
            )}
            {data.taxProfile.hasDiplomaticImmunity && (
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full">
                Diplomatic Immunity
              </span>
            )}
            {data.taxProfile.incomeTypes.map((type) => (
              <span key={type} className="text-xs bg-accent text-muted-foreground px-2 py-1 rounded-full capitalize">
                {type}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Learning History Timeline */}
      <div className="bg-background border border-border rounded-lg p-4">
        <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          Learning History
        </h4>
        
        {data.learningHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No learning history recorded yet
          </p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {data.learningHistory.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleConfirmProfile}
          disabled={actionLoading !== null || data.taxProfile?.userConfirmed}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors",
            data.taxProfile?.userConfirmed
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          <UserCheck className="w-4 h-4" />
          {actionLoading === "confirm" ? "Confirming..." : data.taxProfile?.userConfirmed ? "Profile Confirmed" : "Confirm Profile"}
        </button>
        
        <button
          onClick={handleResetLearning}
          disabled={actionLoading !== null}
          className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          {actionLoading === "reset" ? "Resetting..." : "Reset Learning"}
        </button>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-accent/30 rounded-lg p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground capitalize">{value || "—"}</p>
    </div>
  );
}

function HistoryItem({ item }: { item: LearningHistory }) {
  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="flex items-start gap-3 p-2 hover:bg-accent/30 rounded-lg transition-colors">
      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground capitalize">
            {item.field_name.replace(/_/g, " ")}
          </p>
          {item.confidence !== null && (
            <span className="text-xs text-muted-foreground">
              {item.confidence}% conf
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatValue(item.old_value)} → {formatValue(item.new_value)}
        </p>
        {item.reason && (
          <p className="text-xs text-muted-foreground mt-1 italic">"{item.reason}"</p>
        )}
        <p className="text-xs text-muted-foreground/60 mt-1">
          {new Date(item.created_at).toLocaleString()} · via {item.source}
        </p>
      </div>
    </div>
  );
}
