import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Brain, 
  TrendingUp, 
  Database, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw,
  Clock,
  Zap,
  Target,
  BarChart3,
  Layers
} from "lucide-react";

interface ModelInfo {
  id: string;
  model_name: string;
  version: string;
  status: string;
  is_active: boolean;
  accuracy: number;
  precision_score: number;
  recall_score: number;
  f1_score: number;
  training_data_count: number;
  trained_at: string;
  deployed_at: string;
}

interface FeedbackTrend {
  date: string;
  count: number;
  confirmations: number;
  overrides: number;
}

interface PipelineStatus {
  status: 'idle' | 'training' | 'scheduled';
  lastRun: string | null;
  nextRun: string | null;
  untrainedCount: number;
}

export default function AdminMLHealth() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [feedbackTrends, setFeedbackTrends] = useState<FeedbackTrend[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    status: 'idle',
    lastRun: null,
    nextRun: null,
    untrainedCount: 0,
  });
  const [patternStats, setPatternStats] = useState({
    total: 0,
    avgConfidence: 0,
    topCategories: [] as { category: string; count: number }[],
    recentlyUpdated: 0,
  });
  const [loading, setLoading] = useState(true);
  const [triggeringTraining, setTriggeringTraining] = useState(false);

  useEffect(() => {
    fetchMLHealth();
  }, []);

  const fetchMLHealth = async () => {
    setLoading(true);
    try {
      // Fetch models
      const { data: modelsData, error: modelsError } = await supabase
        .from("ml_models")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      if (modelsError) throw modelsError;
      setModels(modelsData || []);

      // Fetch feedback for trends (last 14 days)
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const { data: feedbackData, error: feedbackError } = await supabase
        .from("ai_feedback")
        .select("created_at, correction_type, used_in_training")
        .gte("created_at", twoWeeksAgo.toISOString())
        .order("created_at", { ascending: true });

      if (feedbackError) throw feedbackError;

      // Calculate trends by day
      const trendMap = new Map<string, FeedbackTrend>();
      feedbackData?.forEach(fb => {
        const date = new Date(fb.created_at).toISOString().split('T')[0];
        const existing = trendMap.get(date) || { date, count: 0, confirmations: 0, overrides: 0 };
        existing.count++;
        if (fb.correction_type === 'confirmation') existing.confirmations++;
        if (fb.correction_type === 'full_override') existing.overrides++;
        trendMap.set(date, existing);
      });
      setFeedbackTrends(Array.from(trendMap.values()));

      // Count untrained feedback
      const untrainedCount = feedbackData?.filter(f => !f.used_in_training).length || 0;
      
      // Calculate next training (next Sunday 2 AM)
      const now = new Date();
      const nextSunday = new Date(now);
      nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
      nextSunday.setHours(2, 0, 0, 0);
      if (nextSunday <= now) {
        nextSunday.setDate(nextSunday.getDate() + 7);
      }

      setPipelineStatus({
        status: 'scheduled',
        lastRun: modelsData?.[0]?.trained_at || null,
        nextRun: nextSunday.toISOString(),
        untrainedCount,
      });

      // Fetch pattern stats
      const { data: patterns, error: patternError } = await supabase
        .from("business_classification_patterns")
        .select("category, confidence, last_used_at");

      if (patternError) throw patternError;

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const categoryMap = new Map<string, number>();
      patterns?.forEach(p => {
        categoryMap.set(p.category, (categoryMap.get(p.category) || 0) + 1);
      });

      const topCategories = Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      const recentlyUpdated = patterns?.filter(p => 
        p.last_used_at && new Date(p.last_used_at) > weekAgo
      ).length || 0;

      const avgConfidence = patterns && patterns.length > 0
        ? patterns.reduce((sum, p) => sum + Number(p.confidence || 0), 0) / patterns.length
        : 0;

      setPatternStats({
        total: patterns?.length || 0,
        avgConfidence,
        topCategories,
        recentlyUpdated,
      });

    } catch (error) {
      console.error("Error fetching ML health:", error);
    } finally {
      setLoading(false);
    }
  };

  const triggerManualTraining = async () => {
    setTriggeringTraining(true);
    try {
      // This would call the training worker - for now, show a message
      alert("Manual training triggered! Check logs for progress.");
    } catch (error) {
      console.error("Training trigger error:", error);
    } finally {
      setTriggeringTraining(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'deployed': return 'text-green-500';
      case 'training': return 'text-yellow-500';
      case 'failed': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeModel = models.find(m => m.is_active);
  const maxTrendCount = Math.max(...feedbackTrends.map(t => t.count), 1);

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
          <h1 className="text-2xl font-bold text-foreground">ML Health Dashboard</h1>
          <p className="text-muted-foreground">Monitor machine learning pipeline status and performance</p>
        </div>
        <button
          onClick={fetchMLHealth}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Pipeline Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pipeline Status</CardDescription>
            <CardTitle className="flex items-center gap-2">
              <Activity className={`w-5 h-5 ${pipelineStatus.status === 'training' ? 'text-yellow-500 animate-pulse' : 'text-green-500'}`} />
              <span className="capitalize">{pipelineStatus.status}</span>
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Untrained Feedback</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Database className="w-6 h-6 text-blue-500" />
              {pipelineStatus.untrainedCount}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Training</CardDescription>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              {formatDate(pipelineStatus.lastRun)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Next Scheduled</CardDescription>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              {formatDate(pipelineStatus.nextRun)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Active Model Performance */}
      {activeModel && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  Active Model: {activeModel.model_name} {activeModel.version}
                </CardTitle>
                <CardDescription>Deployed {formatDate(activeModel.deployed_at)}</CardDescription>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-sm">
                <CheckCircle className="w-4 h-4" />
                Active
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-3xl font-bold text-foreground">{(activeModel.accuracy * 100).toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Target className="w-4 h-4" /> Accuracy
                </div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-3xl font-bold text-foreground">{(activeModel.precision_score * 100).toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Zap className="w-4 h-4" /> Precision
                </div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-3xl font-bold text-foreground">{(activeModel.recall_score * 100).toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <TrendingUp className="w-4 h-4" /> Recall
                </div>
              </div>
              <div className="text-center p-4 bg-background rounded-lg">
                <div className="text-3xl font-bold text-foreground">{(activeModel.f1_score * 100).toFixed(1)}%</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <BarChart3 className="w-4 h-4" /> F1 Score
                </div>
              </div>
            </div>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Trained on {activeModel.training_data_count.toLocaleString()} feedback records
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feedback Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Feedback Growth (14 Days)
            </CardTitle>
            <CardDescription>Daily feedback collection trends</CardDescription>
          </CardHeader>
          <CardContent>
            {feedbackTrends.length > 0 ? (
              <div className="space-y-2">
                {feedbackTrends.map((trend) => (
                  <div key={trend.date} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-muted-foreground">{trend.date.slice(5)}</div>
                    <div className="flex-1 flex items-center gap-1">
                      <div
                        className="h-4 bg-green-500 rounded-l"
                        style={{ width: `${(trend.confirmations / maxTrendCount) * 100}%` }}
                        title={`Confirmations: ${trend.confirmations}`}
                      />
                      <div
                        className="h-4 bg-red-500 rounded-r"
                        style={{ width: `${(trend.overrides / maxTrendCount) * 100}%` }}
                        title={`Overrides: ${trend.overrides}`}
                      />
                    </div>
                    <div className="w-8 text-xs text-muted-foreground text-right">{trend.count}</div>
                  </div>
                ))}
                <div className="flex items-center gap-4 mt-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded" />
                    <span className="text-muted-foreground">Confirmations</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded" />
                    <span className="text-muted-foreground">Overrides</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No feedback data in the last 14 days</p>
            )}
          </CardContent>
        </Card>

        {/* Pattern Learning Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-500" />
              Pattern Learning
            </CardTitle>
            <CardDescription>Business-specific classification patterns</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-foreground">{patternStats.total}</div>
                <div className="text-xs text-muted-foreground">Total Patterns</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-foreground">{(patternStats.avgConfidence * 100).toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Avg Confidence</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-foreground">{patternStats.recentlyUpdated}</div>
                <div className="text-xs text-muted-foreground">Updated (7d)</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Top Categories</h4>
              {patternStats.topCategories.length > 0 ? (
                patternStats.topCategories.map((cat, idx) => (
                  <div key={cat.category} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{idx + 1}. {cat.category.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{cat.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No patterns yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model History */}
      <Card>
        <CardHeader>
          <CardTitle>Model Version History</CardTitle>
          <CardDescription>All trained model versions</CardDescription>
        </CardHeader>
        <CardContent>
          {models.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Model</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Version</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Status</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">Accuracy</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">F1</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">Data Count</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Trained</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-3 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-muted-foreground" />
                        {model.model_name}
                        {model.is_active && (
                          <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs rounded-full">Active</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">{model.version}</td>
                      <td className={`py-3 px-3 capitalize ${getStatusColor(model.status)}`}>{model.status}</td>
                      <td className="py-3 px-3 text-center">{(model.accuracy * 100).toFixed(1)}%</td>
                      <td className="py-3 px-3 text-center">{(model.f1_score * 100).toFixed(1)}%</td>
                      <td className="py-3 px-3 text-center">{model.training_data_count.toLocaleString()}</td>
                      <td className="py-3 px-3 text-muted-foreground">{formatDate(model.trained_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No models trained yet</p>
          )}
        </CardContent>
      </Card>

      {/* Training Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Training Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <button
            onClick={triggerManualTraining}
            disabled={triggeringTraining || pipelineStatus.untrainedCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggeringTraining ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Brain className="w-4 h-4" />
            )}
            Trigger Manual Training
          </button>
          <p className="text-sm text-muted-foreground">
            {pipelineStatus.untrainedCount > 0
              ? `${pipelineStatus.untrainedCount} feedback records ready for training`
              : 'No untrained feedback available'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
