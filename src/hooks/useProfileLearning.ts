import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LearningHistory {
  id: string;
  field_name: string;
  old_value: any;
  new_value: any;
  reason: string | null;
  confidence: number | null;
  source: string;
  created_at: string;
}

export interface ProfileLearningData {
  // From onboarding_progress
  profileConfidence: number;
  patternMetrics: {
    salaryCount?: number;
    salaryTotal?: number;
    freelanceCount?: number;
    freelanceTotal?: number;
    businessCount?: number;
    businessTotal?: number;
    rentalCount?: number;
    rentalTotal?: number;
    pensionCount?: number;
    pensionTotal?: number;
    totalTransactions?: number;
    corrections?: number;
  } | null;
  incomeSourcesDetected: string[];
  extractedProfile: any;
  lastLearningUpdate: string | null;
  
  // From user_tax_profiles
  taxProfile: {
    userType: string | null;
    employmentStatus: string | null;
    isPensioner: boolean;
    isSeniorCitizen: boolean;
    hasDiplomaticImmunity: boolean;
    industryType: string | null;
    aiConfidence: number | null;
    userConfirmed: boolean;
    incomeTypes: string[];
  } | null;
  
  // Learning history
  learningHistory: LearningHistory[];
  
  // Computed metrics
  totalTransactionsAnalyzed: number;
  correctionsCount: number;
  correctionRate: number;
}

export function useProfileLearning(userId: string | null) {
  const [data, setData] = useState<ProfileLearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    fetchProfileLearning();
  }, [userId]);

  async function fetchProfileLearning() {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch all data in parallel
      const [onboardingRes, taxProfileRes, historyRes, feedbackRes] = await Promise.all([
        supabase
          .from("onboarding_progress")
          .select("profile_confidence, pattern_metrics, income_sources_detected, extracted_profile, last_learning_update")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_tax_profiles")
          .select("user_type, employment_status, is_pensioner, is_senior_citizen, has_diplomatic_immunity, industry_type, ai_confidence, user_confirmed, income_types")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("profile_learning_history")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("ai_feedback")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
      ]);

      const onboarding = onboardingRes.data;
      const taxProfile = taxProfileRes.data;
      const history = historyRes.data || [];
      const feedbackCount = feedbackRes.count || 0;

      // Parse pattern metrics safely
      let patternMetrics: ProfileLearningData["patternMetrics"] = null;
      if (onboarding?.pattern_metrics) {
        try {
          patternMetrics = typeof onboarding.pattern_metrics === 'string' 
            ? JSON.parse(onboarding.pattern_metrics)
            : onboarding.pattern_metrics;
        } catch {
          patternMetrics = null;
        }
      }

      // Parse income types
      let incomeTypes: string[] = [];
      if (taxProfile?.income_types) {
        incomeTypes = Array.isArray(taxProfile.income_types) 
          ? taxProfile.income_types 
          : [];
      }

      const totalTransactions = patternMetrics?.totalTransactions || 0;
      const corrections = feedbackCount;
      const correctionRate = totalTransactions > 0 ? (corrections / totalTransactions) * 100 : 0;

      setData({
        profileConfidence: onboarding?.profile_confidence || 0,
        patternMetrics,
        incomeSourcesDetected: onboarding?.income_sources_detected || [],
        extractedProfile: onboarding?.extracted_profile,
        lastLearningUpdate: onboarding?.last_learning_update,
        taxProfile: taxProfile ? {
          userType: taxProfile.user_type,
          employmentStatus: taxProfile.employment_status,
          isPensioner: taxProfile.is_pensioner || false,
          isSeniorCitizen: taxProfile.is_senior_citizen || false,
          hasDiplomaticImmunity: taxProfile.has_diplomatic_immunity || false,
          industryType: taxProfile.industry_type,
          aiConfidence: taxProfile.ai_confidence,
          userConfirmed: taxProfile.user_confirmed || false,
          incomeTypes
        } : null,
        learningHistory: history as LearningHistory[],
        totalTransactionsAnalyzed: totalTransactions,
        correctionsCount: corrections,
        correctionRate
      });
    } catch (err) {
      console.error("Error fetching profile learning data:", err);
      setError("Failed to load profile learning data");
    } finally {
      setLoading(false);
    }
  }

  async function confirmProfile() {
    if (!userId) return;
    
    try {
      await supabase
        .from("user_tax_profiles")
        .update({ user_confirmed: true })
        .eq("user_id", userId);
      
      await fetchProfileLearning();
    } catch (err) {
      console.error("Error confirming profile:", err);
      throw err;
    }
  }

  async function resetLearning() {
    if (!userId) return;
    
    try {
      // Reset pattern metrics and confidence
      await supabase
        .from("onboarding_progress")
        .update({ 
          pattern_metrics: null,
          profile_confidence: 0,
          income_sources_detected: [],
          last_learning_update: null
        })
        .eq("user_id", userId);
      
      // Clear learning history
      await supabase
        .from("profile_learning_history")
        .delete()
        .eq("user_id", userId);
      
      // Reset tax profile confirmation
      await supabase
        .from("user_tax_profiles")
        .update({ 
          user_confirmed: false,
          ai_confidence: 0
        })
        .eq("user_id", userId);
      
      await fetchProfileLearning();
    } catch (err) {
      console.error("Error resetting learning:", err);
      throw err;
    }
  }

  return {
    data,
    loading,
    error,
    refetch: fetchProfileLearning,
    confirmProfile,
    resetLearning
  };
}
