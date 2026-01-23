import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  RefreshCw,
  Scale,
  ToggleLeft,
  ToggleRight,
  FileText,
  Filter,
  ChevronRight,
  CheckSquare,
  Square,
  XCircle,
  AlertTriangle,
  Clock,
  Copy,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ComplianceRule {
  id: string;
  rule_name: string;
  rule_type: string;
  rule_code: string | null;
  description: string | null;
  is_active: boolean | null;
  effective_from: string | null;
  effective_to: string | null;
  priority: number | null;
  document_id: string | null;
  provision_id: string | null;
  applies_to: string[] | null;
  tax_types: string[] | null;
  created_at: string | null;
  document?: { title: string };
}

interface DuplicateRule {
  rule_code_1: string;
  rule_name_1: string;
  rule_code_2: string;
  rule_name_2: string;
  similarity_score: number;
  duplicate_reason: string;
}

const RULE_TYPES = [
  { value: "all", label: "All Types" },
  { value: "tax_rate", label: "Tax Rate" },
  { value: "threshold", label: "Threshold" },
  { value: "threshold_check", label: "Threshold Check" },
  { value: "exemption", label: "Exemption" },
  { value: "deadline", label: "Deadline" },
  { value: "filing_deadline", label: "Filing Deadline" },
  { value: "penalty_calculation", label: "Penalty" },
  { value: "relief", label: "Relief" },
  { value: "levy", label: "Levy" },
  { value: "reporting_requirement", label: "Reporting" },
];

export default function AdminComplianceRules() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive" | "duplicates">("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Bulk selection state
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [bulkActivating, setBulkActivating] = useState(false);

  // Expiring rules alert (V9 Fact-Grounded AI)
  const [expiringRules, setExpiringRules] = useState<{
    id: string;
    rule_code: string;
    rule_name: string;
    expiration_date: string;
    days_until_expiration: number;
  }[]>([]);

  // Duplicate rules detection
  const [duplicateRules, setDuplicateRules] = useState<DuplicateRule[]>([]);

  // Create a Set of duplicate rule codes for quick lookup
  const duplicateRuleCodes = useMemo(() => {
    const codes = new Set<string>();
    duplicateRules.forEach(dup => {
      if (dup.rule_code_1) codes.add(dup.rule_code_1);
      if (dup.rule_code_2) codes.add(dup.rule_code_2);
    });
    return codes;
  }, [duplicateRules]);

  // Helper to find duplicate match for a rule
  const getDuplicateMatch = (ruleCode: string | null): DuplicateRule & { matchCode: string; matchName: string } | null => {
    if (!ruleCode) return null;
    const match = duplicateRules.find(
      d => d.rule_code_1 === ruleCode || d.rule_code_2 === ruleCode
    );
    if (!match) return null;
    return {
      ...match,
      matchCode: match.rule_code_1 === ruleCode ? match.rule_code_2 : match.rule_code_1,
      matchName: match.rule_code_1 === ruleCode ? match.rule_name_2 : match.rule_name_1,
    };
  };

  useEffect(() => {
    fetchRules();
    fetchExpiringRules();
    fetchDuplicateRules();
  }, []);

  async function fetchDuplicateRules() {
    try {
      const { data, error } = await supabase.rpc('find_duplicate_rules');
      if (!error && data) {
        setDuplicateRules(data);
      }
    } catch (e) {
      console.log('Duplicate detection function may not exist yet');
    }
  }

  async function fetchExpiringRules() {
    try {
      const { data, error } = await supabase.rpc('get_expiring_rules', { p_days_ahead: 30 });
      if (!error && data) {
        setExpiringRules(data);
      }
    } catch (e) {
      console.log('Expiring rules function may not exist yet');
    }
  }

  async function fetchRules() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("compliance_rules")
        .select(`
          *,
          document:legal_documents(title)
        `)
        .order("priority", { ascending: false });

      if (error) throw error;
      setRules((data as ComplianceRule[]) || []);
    } catch (error) {
      console.error("Error fetching rules:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRule(ruleId: string, currentActive: boolean) {
    setTogglingId(ruleId);
    try {
      const { error } = await supabase
        .from("compliance_rules")
        .update({ is_active: !currentActive })
        .eq("id", ruleId);

      if (error) throw error;

      setRules(rules.map(r =>
        r.id === ruleId ? { ...r, is_active: !currentActive } : r
      ));

      toast({
        title: !currentActive ? "Rule activated" : "Rule deactivated",
        description: `The rule has been ${!currentActive ? "activated" : "deactivated"}`,
      });
    } catch (error) {
      console.error("Error toggling rule:", error);
      toast({
        title: "Error",
        description: "Failed to update rule",
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  }

  // Bulk toggle rules
  async function bulkToggleRules(activate: boolean) {
    if (selectedRules.size === 0) return;

    setBulkActivating(true);
    try {
      const { error } = await supabase
        .from("compliance_rules")
        .update({ is_active: activate })
        .in("id", Array.from(selectedRules));

      if (error) throw error;

      // Update local state
      setRules(rules.map(r =>
        selectedRules.has(r.id) ? { ...r, is_active: activate } : r
      ));

      const count = selectedRules.size;
      setSelectedRules(new Set());

      toast({
        title: activate ? "Rules activated" : "Rules deactivated",
        description: `${count} rule(s) have been ${activate ? "activated" : "deactivated"}`,
      });
    } catch (error) {
      console.error("Error bulk updating rules:", error);
      toast({
        title: "Error",
        description: "Failed to update rules",
        variant: "destructive",
      });
    } finally {
      setBulkActivating(false);
    }
  }

  // Toggle selection for a single rule
  function toggleSelection(ruleId: string) {
    const newSelected = new Set(selectedRules);
    if (newSelected.has(ruleId)) {
      newSelected.delete(ruleId);
    } else {
      newSelected.add(ruleId);
    }
    setSelectedRules(newSelected);
  }

  // Select all visible rules
  function selectAllVisible() {
    const newSelected = new Set(selectedRules);
    filteredRules.forEach(r => newSelected.add(r.id));
    setSelectedRules(newSelected);
  }

  // Get unique document IDs for quick selection
  const uniqueDocuments = [...new Set(rules.filter(r => r.document_id).map(r => ({
    id: r.document_id!,
    title: r.document?.title || 'Unknown Document'
  })))].reduce((acc, doc) => {
    if (!acc.find(d => d.id === doc.id)) {
      acc.push(doc);
    }
    return acc;
  }, [] as { id: string; title: string }[]);

  const filteredRules = rules.filter((rule) => {
    const matchesSearch =
      rule.rule_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.rule_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === "all" || rule.rule_type === filterType;

    const matchesActive =
      filterActive === "all" ||
      (filterActive === "active" && rule.is_active) ||
      (filterActive === "inactive" && !rule.is_active) ||
      (filterActive === "duplicates" && duplicateRuleCodes.has(rule.rule_code || ""));

    return matchesSearch && matchesType && matchesActive;
  });

  const activeCount = rules.filter(r => r.is_active).length;
  const inactiveCount = rules.filter(r => !r.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/compliance" className="hover:text-foreground">Knowledge Base</Link>
        <span>/</span>
        <span className="text-foreground">Rules</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance Rules</h1>
          <p className="text-muted-foreground">AI-generated rules from legal documents</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500 text-sm">
            <ToggleRight className="w-4 h-4" />
            {activeCount} active
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-lg text-muted-foreground text-sm">
            <ToggleLeft className="w-4 h-4" />
            {inactiveCount} inactive
          </div>
          {duplicateRules.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              <Copy className="w-4 h-4" />
              {duplicateRules.length} duplicates
            </div>
          )}
        </div>
      </div>

      {/* Expiring Rules Alert */}
      {expiringRules.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-500">Rules Expiring Soon</h3>
              <p className="text-sm text-muted-foreground mb-2">
                {expiringRules.length} rule(s) will expire within 30 days
              </p>
              <div className="flex flex-wrap gap-2">
                {expiringRules.slice(0, 5).map((rule) => (
                  <span key={rule.id} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/20 rounded text-xs">
                    <Clock className="w-3 h-3 text-amber-500" />
                    <span className="font-mono">{rule.rule_code || rule.rule_name.substring(0, 20)}</span>
                    <span className="text-muted-foreground">({rule.days_until_expiration}d)</span>
                  </span>
                ))}
                {expiringRules.length > 5 && (
                  <span className="text-xs text-muted-foreground py-1">+{expiringRules.length - 5} more</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Rules Alert Banner */}
      {duplicateRules.length > 0 && filterActive !== "duplicates" && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Copy className="w-5 h-5 text-destructive" />
              <div>
                <h3 className="font-medium text-destructive">
                  {duplicateRules.length} Duplicate Pair{duplicateRules.length > 1 ? 's' : ''} Detected
                </h3>
                <p className="text-sm text-muted-foreground">
                  Rules with ≥80% similarity that may cause conflicts. Consider deactivating one from each pair.
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setFilterActive("duplicates")}
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Filter className="w-4 h-4 mr-2" />
              Show Duplicates Only
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
        >
          {RULE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive" | "duplicates")}
          className={cn(
            "px-4 py-2 bg-background border rounded-lg text-foreground",
            filterActive === "duplicates" ? "border-destructive text-destructive" : "border-border"
          )}
        >
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
          {duplicateRules.length > 0 && (
            <option value="duplicates">⚠️ Duplicates ({duplicateRuleCodes.size})</option>
          )}
        </select>
      </div>

      {/* Bulk Action Bar */}
      {selectedRules.size > 0 && (
        <div className="flex items-center gap-4 p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-foreground">
            {selectedRules.size} rule(s) selected
          </span>
          <Button
            size="sm"
            onClick={() => bulkToggleRules(true)}
            disabled={bulkActivating}
            className="bg-green-600 hover:bg-green-700"
          >
            <ToggleRight className="w-4 h-4 mr-2" />
            Activate All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkToggleRules(false)}
            disabled={bulkActivating}
          >
            <ToggleLeft className="w-4 h-4 mr-2" />
            Deactivate All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedRules(new Set())}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Clear Selection
          </Button>
        </div>
      )}

      {/* Quick Select by Document */}
      {uniqueDocuments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground py-1">Quick select:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={selectAllVisible}
          >
            <CheckSquare className="w-3 h-3 mr-1" />
            All Visible ({filteredRules.length})
          </Button>
          {uniqueDocuments.slice(0, 3).map(doc => {
            const docRules = rules.filter(r => r.document_id === doc.id);
            return (
              <Button
                key={doc.id}
                variant="outline"
                size="sm"
                onClick={() => {
                  const newSelected = new Set(selectedRules);
                  docRules.forEach(r => newSelected.add(r.id));
                  setSelectedRules(newSelected);
                }}
              >
                {doc.title.substring(0, 20)}... ({docRules.length})
              </Button>
            );
          })}
        </div>
      )}

      {/* Rules List */}
      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{filteredRules.length} rules</p>
          {filteredRules.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (selectedRules.size === filteredRules.length) {
                  setSelectedRules(new Set());
                } else {
                  selectAllVisible();
                }
              }}
            >
              {selectedRules.size === filteredRules.length ? (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Select All
                </>
              )}
            </Button>
          )}
        </div>
        <div className="divide-y divide-border">
          {filteredRules.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No rules found matching your criteria
            </div>
          ) : (
            filteredRules.map((rule) => {
              const isDuplicate = duplicateRuleCodes.has(rule.rule_code || "");
              const duplicateMatch = isDuplicate ? getDuplicateMatch(rule.rule_code) : null;
              
              return (
              <div
                key={rule.id}
                className={cn(
                  "p-4 hover:bg-accent/30 transition-colors",
                  selectedRules.has(rule.id) && "bg-primary/5",
                  isDuplicate && "border-l-4 border-l-destructive bg-destructive/5"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <Checkbox
                    checked={selectedRules.has(rule.id)}
                    onCheckedChange={() => toggleSelection(rule.id)}
                    className="mt-1"
                  />

                  <div className="flex-1">
                    {/* Duplicate Badge */}
                    {isDuplicate && (
                      <div className="mb-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-destructive/20 text-destructive rounded text-xs font-medium">
                          <Copy className="w-3 h-3" />
                          Potential Duplicate
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 mb-1">
                      <Scale className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-foreground">{rule.rule_name}</span>
                      {rule.rule_code && (
                        <span className={cn(
                          "text-xs font-mono",
                          isDuplicate ? "text-destructive" : "text-muted-foreground"
                        )}>[{rule.rule_code}]</span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground mb-2 ml-7">{rule.description}</p>
                    )}
                    
                    {/* Duplicate Match Info */}
                    {isDuplicate && duplicateMatch && (
                      <div className="ml-7 mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-destructive font-medium">Matches:</span>
                          <span className="font-mono text-destructive">{duplicateMatch.matchCode}</span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground truncate max-w-[200px]">{duplicateMatch.matchName}</span>
                          <span className="px-1.5 py-0.5 bg-destructive/20 text-destructive rounded">
                            {Math.round(duplicateMatch.similarity_score)}% similar
                          </span>
                        </div>
                        {rule.is_active && (
                          <div className="mt-2 pt-2 border-t border-destructive/20">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => toggleRule(rule.id, true)}
                              disabled={togglingId === rule.id}
                            >
                              <ToggleLeft className="w-3 h-3 mr-1" />
                              Deactivate This Rule
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground ml-7">
                      <span className="px-2 py-0.5 bg-muted rounded">{rule.rule_type}</span>
                      {rule.priority != null && <span>Priority: {rule.priority}</span>}
                      {rule.effective_from && (
                        <span className="text-amber-600">
                          Effective: {new Date(rule.effective_from).toLocaleDateString()}
                        </span>
                      )}
                      {rule.document && (
                        <Link
                          to={`/admin/compliance/documents/${rule.document_id}`}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <FileText className="w-3 h-3" />
                          {rule.document.title.substring(0, 30)}...
                        </Link>
                      )}
                    </div>
                    {rule.tax_types && rule.tax_types.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 ml-7">
                        {rule.tax_types.map((t, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={togglingId === rule.id}
                      onClick={() => toggleRule(rule.id, rule.is_active || false)}
                      className={cn(
                        rule.is_active ? "text-green-500" : "text-gray-500"
                      )}
                    >
                      {rule.is_active ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )})
          )}
        </div>
      </div>
    </div>
  );
}
