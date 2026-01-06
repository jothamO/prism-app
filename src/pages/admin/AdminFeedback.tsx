import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, CheckCircle, AlertTriangle, RefreshCw, TrendingUp, Database, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface FeedbackStats {
  total: number;
  confirmations: number;
  partialEdits: number;
  overrides: number;
  accuracy: number;
  untrained: number;
}

interface PatternStats {
  totalPatterns: number;
  avgConfidence: number;
  topCategories: { category: string; count: number }[];
}

export default function AdminFeedback() {
  const { toast } = useToast();
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats>({
    total: 0,
    confirmations: 0,
    partialEdits: 0,
    overrides: 0,
    accuracy: 0,
    untrained: 0,
  });
  const [patternStats, setPatternStats] = useState<PatternStats>({
    totalPatterns: 0,
    avgConfidence: 0,
    topCategories: [],
  });
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [recentFeedback, setRecentFeedback] = useState<any[]>([]);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  const seedMLData = async () => {
    setShowSeedConfirm(false);
    
    setSeeding(true);
    try {
      const response = await supabase.functions.invoke("seed-ml-data");
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const result = response.data;
      
      if (result.success) {
        toast({
          title: "ML Data Seeded Successfully!",
          description: `Created ${result.seeded.feedbackRecords} feedback records and ${result.seeded.patternRecords} patterns.`,
        });
        await fetchStats();
      } else {
        throw new Error(result.error || "Seeding failed");
      }
    } catch (error: any) {
      toast({
        title: "Seeding Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Fetch TOTAL untrained feedback count (not limited by query limit)
      const { count: totalUntrainedCount, error: untrainedError } = await supabase
        .from("ai_feedback")
        .select("id", { count: "exact", head: true })
        .eq("used_in_training", false);

      if (untrainedError) throw untrainedError;

      // Fetch feedback stats (limited for display purposes)
      const { data: feedback, error: feedbackError } = await supabase
        .from("ai_feedback")
        .select("correction_type, used_in_training, created_at, item_description")
        .order("created_at", { ascending: false })
        .limit(100);

      if (feedbackError) throw feedbackError;

      const total = feedback?.length || 0;
      const confirmations = feedback?.filter(f => f.correction_type === "confirmation").length || 0;
      const partialEdits = feedback?.filter(f => f.correction_type === "partial_edit").length || 0;
      const overrides = feedback?.filter(f => f.correction_type === "full_override").length || 0;
      const accuracy = total > 0 ? ((confirmations + partialEdits * 0.5) / total) * 100 : 0;

      setFeedbackStats({ total, confirmations, partialEdits, overrides, accuracy, untrained: totalUntrainedCount || 0 });
      setRecentFeedback(feedback?.slice(0, 10) || []);

      // Fetch pattern stats
      const { data: patterns, error: patternError } = await supabase
        .from("business_classification_patterns")
        .select("category, confidence, occurrence_count");

      if (patternError) throw patternError;

      const totalPatterns = patterns?.length || 0;
      const avgConfidence = totalPatterns > 0
        ? patterns.reduce((sum, p) => sum + Number(p.confidence), 0) / totalPatterns
        : 0;

      // Group by category
      const categoryMap = new Map<string, number>();
      patterns?.forEach(p => {
        categoryMap.set(p.category, (categoryMap.get(p.category) || 0) + 1);
      });
      const topCategories = Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setPatternStats({ totalPatterns, avgConfidence, topCategories });
    } catch (error) {
      console.error("Error fetching feedback stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const getCorrectionTypeColor = (type: string) => {
    switch (type) {
      case "confirmation": return "text-green-500";
      case "partial_edit": return "text-yellow-500";
      case "full_override": return "text-red-500";
      default: return "text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Feedback & Learning</h1>
          <p className="text-muted-foreground">Monitor AI accuracy and learned business patterns</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSeedConfirm(true)}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {seeding ? "Seeding..." : "Seed Test Data"}
          </button>
          <button
            onClick={fetchStats}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Seed ML Data Confirmation Dialog */}
      <ConfirmDialog
        open={showSeedConfirm}
        onOpenChange={setShowSeedConfirm}
        title="Seed ML Training Data"
        description="This will create approximately 50 feedback records and 30 classification patterns for testing purposes."
        confirmText="Seed Data"
        variant="warning"
        onConfirm={seedMLData}
        loading={seeding}
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Feedback</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Brain className="w-6 h-6 text-primary" />
              {feedbackStats.total}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI Accuracy</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-green-500" />
              {feedbackStats.accuracy.toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Learned Patterns</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Database className="w-6 h-6 text-blue-500" />
              {patternStats.totalPatterns}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Untrained Feedback</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              {feedbackStats.untrained}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Correction Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Correction Breakdown</CardTitle>
            <CardDescription>How users interact with AI predictions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>Confirmations</span>
              </div>
              <span className="font-semibold">{feedbackStats.confirmations}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${feedbackStats.total > 0 ? (feedbackStats.confirmations / feedbackStats.total) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <span>Partial Edits</span>
              </div>
              <span className="font-semibold">{feedbackStats.partialEdits}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-yellow-500 h-2 rounded-full"
                style={{ width: `${feedbackStats.total > 0 ? (feedbackStats.partialEdits / feedbackStats.total) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-red-500" />
                <span>Full Overrides</span>
              </div>
              <span className="font-semibold">{feedbackStats.overrides}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full"
                style={{ width: `${feedbackStats.total > 0 ? (feedbackStats.overrides / feedbackStats.total) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Categories</CardTitle>
            <CardDescription>Most learned business patterns by category</CardDescription>
          </CardHeader>
          <CardContent>
            {patternStats.topCategories.length > 0 ? (
              <div className="space-y-3">
                {patternStats.topCategories.map((cat, idx) => (
                  <div key={cat.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{idx + 1}.</span>
                      <span className="font-medium">{cat.category}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{cat.count} patterns</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No patterns learned yet</p>
            )}
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Average Pattern Confidence: <span className="font-semibold text-foreground">{(patternStats.avgConfidence * 100).toFixed(1)}%</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Feedback */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Feedback</CardTitle>
          <CardDescription>Latest user corrections on AI predictions</CardDescription>
        </CardHeader>
        <CardContent>
          {recentFeedback.length > 0 ? (
            <div className="space-y-2">
              {recentFeedback.map((fb, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex-1 truncate">
                    <span className="text-sm">{fb.item_description}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-medium ${getCorrectionTypeColor(fb.correction_type)}`}>
                      {fb.correction_type?.replace("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(fb.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No feedback recorded yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
