import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MLQuickMetrics {
  modelHealth: {
    accuracy: number | null;
    status: string;
    lastTrained: string | null;
    modelName: string | null;
  };
  feedbackQueue: {
    pending: number;
    trainedThisWeek: number;
    total: number;
  };
  classificationConfidence: {
    average: number;
    high: number;
    medium: number;
    low: number;
  };
  onboardingFunnel: {
    activeSessions: number;
    completionRate: number;
    avgConfidence: number;
  };
}

export function useMLQuickMetrics() {
  const [metrics, setMetrics] = useState<MLQuickMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  async function fetchMetrics() {
    try {
      // Fetch all data in parallel
      const [modelRes, feedbackRes, trainedRes, patternsRes, onboardingRes, sessionsRes] = await Promise.all([
        // ML Model health
        supabase
          .from("ml_models")
          .select("accuracy, status, trained_at, model_name")
          .eq("is_active", true)
          .maybeSingle(),
        
        // AI Feedback queue (untrained)
        supabase
          .from("ai_feedback")
          .select("id", { count: "exact", head: true })
          .eq("used_in_training", false),
        
        // Trained this week
        supabase
          .from("ai_feedback")
          .select("id", { count: "exact", head: true })
          .eq("used_in_training", true)
          .gte("trained_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        
        // Classification patterns confidence
        supabase
          .from("business_classification_patterns")
          .select("confidence")
          .not("confidence", "is", null),
        
        // Onboarding progress
        supabase
          .from("onboarding_progress")
          .select("completed, profile_confidence"),
        
        // Active chatbot sessions (last 24 hours)
        supabase
          .from("chatbot_sessions")
          .select("user_id", { count: "exact", head: true })
          .gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ]);

      // Process pattern confidence
      const patterns = patternsRes.data || [];
      const confidences = patterns.map(p => p.confidence || 0);
      const avgConfidence = confidences.length > 0 
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
        : 0;
      const high = confidences.filter(c => c >= 75).length;
      const medium = confidences.filter(c => c >= 50 && c < 75).length;
      const low = confidences.filter(c => c < 50).length;

      // Process onboarding
      const onboarding = onboardingRes.data || [];
      const completed = onboarding.filter(o => o.completed).length;
      const total = onboarding.length;
      const completionRate = total > 0 ? (completed / total) * 100 : 0;
      const profileConfidences = onboarding
        .map(o => o.profile_confidence || 0)
        .filter(c => c > 0);
      const avgProfileConfidence = profileConfidences.length > 0
        ? profileConfidences.reduce((a, b) => a + b, 0) / profileConfidences.length
        : 0;

      setMetrics({
        modelHealth: {
          accuracy: modelRes.data?.accuracy || null,
          status: modelRes.data?.status || "no model",
          lastTrained: modelRes.data?.trained_at || null,
          modelName: modelRes.data?.model_name || null
        },
        feedbackQueue: {
          pending: feedbackRes.count || 0,
          trainedThisWeek: trainedRes.count || 0,
          total: (feedbackRes.count || 0) + (trainedRes.count || 0)
        },
        classificationConfidence: {
          average: Math.round(avgConfidence),
          high,
          medium,
          low
        },
        onboardingFunnel: {
          activeSessions: sessionsRes.count || 0,
          completionRate: Math.round(completionRate),
          avgConfidence: Math.round(avgProfileConfidence)
        }
      });
    } catch (err) {
      console.error("Error fetching ML metrics:", err);
      setError("Failed to load ML metrics");
    } finally {
      setLoading(false);
    }
  }

  return { metrics, loading, error, refetch: fetchMetrics };
}
