import { useState } from "react";
import {
  Code2,
  Database,
  Calendar,
  BookOpen,
  Bell,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Save,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PRISMImpactItem {
  category: 'code_changes' | 'database_updates' | 'user_notification' | 'tax_calendar' | 'education_center' | 'no_action';
  description: string;
  priority: 'high' | 'medium' | 'low';
  completed?: boolean;
}

interface PRISMImpactAnalysis {
  summary: string;
  prism_changes_required: PRISMImpactItem[];
  tax_calendar_updates: { deadline: string; description: string; type?: string; provision_ids?: string[]; created?: boolean }[];
  education_center_updates: { topic: string; category?: string; provision_ids?: string[]; suggested: boolean; created?: boolean }[];
  user_notifications: { required: boolean; message: string };
  ai_confidence: number;
  ai_generated_at: string;
}

type Criticality = 'breaking_change' | 'rate_update' | 'new_requirement' | 'procedural_update' | 'advisory';

interface PRISMImpactSummaryTabProps {
  documentId: string;
  documentTitle: string;
  rawText: string | null;
  documentType: string;
  prismImpactAnalysis: PRISMImpactAnalysis | null;
  criticality: Criticality | null;
  impactReviewed: boolean;
  impactReviewedAt: string | null;
  onRefresh: () => void;
}

const CRITICALITY_CONFIG: Record<Criticality, { label: string; color: string; bgColor: string }> = {
  breaking_change: { label: 'Breaking Change', color: 'text-red-500', bgColor: 'bg-red-500/20' },
  rate_update: { label: 'Rate Update', color: 'text-orange-500', bgColor: 'bg-orange-500/20' },
  new_requirement: { label: 'New Requirement', color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  procedural_update: { label: 'Procedural Update', color: 'text-gray-500', bgColor: 'bg-gray-500/20' },
  advisory: { label: 'Advisory', color: 'text-green-500', bgColor: 'bg-green-500/20' },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Code2; color: string }> = {
  code_changes: { label: 'Code Changes', icon: Code2, color: 'text-purple-500' },
  database_updates: { label: 'Database Updates', icon: Database, color: 'text-blue-500' },
  tax_calendar: { label: 'Tax Calendar', icon: Calendar, color: 'text-green-500' },
  education_center: { label: 'Education Center', icon: BookOpen, color: 'text-orange-500' },
  user_notification: { label: 'User Notifications', icon: Bell, color: 'text-yellow-500' },
  no_action: { label: 'No Action Needed', icon: CheckCircle, color: 'text-gray-500' },
};

export default function PRISMImpactSummaryTab({
  documentId,
  documentTitle,
  rawText,
  documentType,
  prismImpactAnalysis,
  criticality,
  impactReviewed,
  impactReviewedAt,
  onRefresh,
}: PRISMImpactSummaryTabProps) {
  const { toast } = useToast();
  const [localAnalysis, setLocalAnalysis] = useState<PRISMImpactAnalysis | null>(prismImpactAnalysis);
  const [localCriticality, setLocalCriticality] = useState<Criticality | null>(criticality);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(prismImpactAnalysis?.summary || '');

  const handleCriticalityChange = (newCrit: Criticality) => {
    setLocalCriticality(newCrit);
  };

  const handleItemCompletedToggle = (index: number) => {
    if (!localAnalysis) return;
    const updated = { ...localAnalysis };
    updated.prism_changes_required = [...updated.prism_changes_required];
    updated.prism_changes_required[index] = {
      ...updated.prism_changes_required[index],
      completed: !updated.prism_changes_required[index].completed,
    };
    setLocalAnalysis(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedAnalysis = localAnalysis ? {
        ...localAnalysis,
        summary: editedSummary || localAnalysis.summary,
      } : null;

      const { error } = await supabase
        .from('legal_documents')
        .update({
          prism_impact_analysis: updatedAnalysis,
          criticality: localCriticality,
        })
        .eq('id', documentId);

      if (error) throw error;

      setLocalAnalysis(updatedAnalysis);
      setIsEditing(false);
      toast({ title: 'Changes saved', description: 'Impact analysis has been updated' });
    } catch (error) {
      console.error('Error saving:', error);
      toast({ title: 'Error', description: 'Failed to save changes', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReviewed = async () => {
    setSaving(true);
    try {
      const updatedAnalysis = localAnalysis ? {
        ...localAnalysis,
        summary: editedSummary || localAnalysis.summary,
      } : null;

      const { error } = await supabase
        .from('legal_documents')
        .update({
          prism_impact_analysis: updatedAnalysis,
          criticality: localCriticality,
          impact_reviewed: true,
          impact_reviewed_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (error) throw error;

      toast({ title: 'Review complete', description: 'Impact analysis marked as reviewed' });
      onRefresh();
    } catch (error) {
      console.error('Error marking reviewed:', error);
      toast({ title: 'Error', description: 'Failed to mark as reviewed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!rawText) {
      toast({ title: 'Cannot regenerate', description: 'No raw text available', variant: 'destructive' });
      return;
    }

    setRegenerating(true);
    try {
      const { error } = await supabase.functions.invoke('process-compliance-document', {
        body: {
          documentId,
          extractedText: rawText,
          documentType,
          title: documentTitle,
        },
      });

      if (error) throw error;

      toast({ title: 'Regeneration complete', description: 'Impact analysis has been regenerated' });
      onRefresh();
    } catch (error) {
      console.error('Error regenerating:', error);
      toast({ title: 'Regeneration failed', description: 'Please try again', variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  // Build URL for education article creation with AI
  const buildEducationUrl = (item: { topic: string; category?: string; provision_ids?: string[] }, withAi: boolean) => {
    const params = new URLSearchParams({
      prefill: 'true',
      topic: item.topic,
      document_id: documentId,
    });
    if (item.category) params.append('category', item.category);
    if (item.provision_ids?.length) params.append('provision_ids', item.provision_ids.join(','));
    if (withAi) params.append('generate_ai', 'true');
    return `/admin/education?${params.toString()}`;
  };

  // Build URL for tax calendar creation with AI
  const buildCalendarUrl = (item: { deadline: string; description: string; type?: string; provision_ids?: string[] }, withAi: boolean) => {
    const params = new URLSearchParams({
      prefill: 'true',
      title: item.description,
      date: item.deadline,
      description: item.description,
      document_id: documentId,
    });
    if (item.type) params.append('type', item.type);
    if (item.provision_ids?.length) params.append('provision_ids', item.provision_ids.join(','));
    if (withAi) params.append('generate_ai', 'true');
    return `/admin/tax-calendar?${params.toString()}`;
  };

  const groupedActions = localAnalysis?.prism_changes_required?.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, PRISMImpactItem[]>) || {};

  if (!localAnalysis) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground mb-4">No PRISM impact analysis available</p>
        <Button onClick={handleRegenerate} disabled={regenerating || !rawText}>
          <RefreshCw className={cn("w-4 h-4 mr-2", regenerating && "animate-spin")} />
          {regenerating ? 'Generating...' : 'Generate Analysis'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with status badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">PRISM Impact Analysis</h3>
          {impactReviewed ? (
            <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-500 rounded text-xs">
              <CheckCircle className="w-3 h-3" />
              Admin Reviewed
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-500 rounded text-xs">
              <Sparkles className="w-3 h-3" />
              AI Generated
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Confidence: {Math.round((localAnalysis.ai_confidence || 0) * 100)}%
        </div>
      </div>

      {/* Criticality selector */}
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Criticality Level</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CRITICALITY_CONFIG) as Criticality[]).map((crit) => {
            const config = CRITICALITY_CONFIG[crit];
            return (
              <button
                key={crit}
                onClick={() => handleCriticalityChange(crit)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                  localCriticality === crit
                    ? `${config.bgColor} ${config.color} border-current`
                    : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
                )}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Impact Summary */}
      <div className="bg-muted/30 rounded-lg p-4">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground">Impact Summary</h4>
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? 'Cancel' : 'Edit'}
          </Button>
        </div>
        {isEditing ? (
          <textarea
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            className="w-full min-h-[100px] p-3 bg-background border border-border rounded-lg text-sm text-foreground resize-y"
            placeholder="Describe how this regulation affects PRISM..."
          />
        ) : (
          <p className="text-sm text-muted-foreground">{localAnalysis.summary}</p>
        )}
      </div>

      {/* Required Actions by Category */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">Required Actions</h4>
        <div className="space-y-4">
          {Object.entries(groupedActions).map(([category, items]) => {
            const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.no_action;
            const Icon = config.icon;
            return (
              <div key={category} className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={cn("w-4 h-4", config.color)} />
                  <span className="font-medium text-foreground">{config.label}</span>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const globalIdx = localAnalysis.prism_changes_required.indexOf(item);
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-start gap-3 p-2 rounded transition-colors",
                          item.completed ? "bg-green-500/10" : "hover:bg-muted/50"
                        )}
                      >
                        <button
                          onClick={() => handleItemCompletedToggle(globalIdx)}
                          className={cn(
                            "w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center mt-0.5",
                            item.completed
                              ? "bg-green-500 border-green-500 text-white"
                              : "border-border hover:border-primary"
                          )}
                        >
                          {item.completed && <CheckCircle className="w-3 h-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm",
                            item.completed ? "text-muted-foreground line-through" : "text-foreground"
                          )}>
                            {item.description}
                          </p>
                        </div>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded flex-shrink-0",
                          item.priority === 'high' ? "bg-red-500/20 text-red-500" :
                          item.priority === 'medium' ? "bg-yellow-500/20 text-yellow-500" :
                          "bg-gray-500/20 text-gray-500"
                        )}>
                          {item.priority}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {Object.keys(groupedActions).length === 0 && (
            <div className="bg-muted/30 rounded-lg p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No actions required</p>
            </div>
          )}
        </div>
      </div>

      {/* Tax Calendar Updates */}
      {localAnalysis.tax_calendar_updates?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-500" />
            Suggested Tax Calendar Updates
          </h4>
          <div className="space-y-2">
            {localAnalysis.tax_calendar_updates.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm text-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground">Deadline: {item.deadline}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" asChild className="gap-1">
                    <a href={buildCalendarUrl(item, true)}>
                      <Sparkles className="w-3 h-3 text-green-500" />
                      Add with AI
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="gap-1">
                    <a href={buildCalendarUrl(item, false)}>
                      <ExternalLink className="w-3 h-3" />
                      Add
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education Center Updates */}
      {localAnalysis.education_center_updates?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-orange-500" />
            Suggested Education Articles
          </h4>
          <div className="space-y-2">
            {localAnalysis.education_center_updates.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm text-foreground">{item.topic}</p>
                  {item.category && (
                    <p className="text-xs text-muted-foreground">Category: {item.category}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" asChild className="gap-1">
                    <a href={buildEducationUrl(item, true)}>
                      <Sparkles className="w-3 h-3 text-purple-500" />
                      Create with AI
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="gap-1">
                    <a href={buildEducationUrl(item, false)}>
                      <ExternalLink className="w-3 h-3" />
                      Create
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Notifications */}
      {localAnalysis.user_notifications?.required && (
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-yellow-500" />
            User Notification Required
          </h4>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <p className="text-sm text-foreground">{localAnalysis.user_notifications.message}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button
          variant="outline"
          onClick={handleRegenerate}
          disabled={regenerating || !rawText}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", regenerating && "animate-spin")} />
          {regenerating ? 'Regenerating...' : 'Regenerate Analysis'}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
          {!impactReviewed && (
            <Button onClick={handleMarkReviewed} disabled={saving}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark Review Complete
            </Button>
          )}
        </div>
      </div>

      {/* Review timestamp */}
      {impactReviewedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Reviewed on {new Date(impactReviewedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
