import { useState, useEffect } from "react";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

const RULE_TYPES = [
  { value: "all", label: "All Types" },
  { value: "rate", label: "Rate" },
  { value: "threshold", label: "Threshold" },
  { value: "exemption", label: "Exemption" },
  { value: "deadline", label: "Deadline" },
  { value: "penalty", label: "Penalty" },
  { value: "calculation", label: "Calculation" },
  { value: "reporting", label: "Reporting" },
];

export default function AdminComplianceRules() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

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

  const filteredRules = rules.filter((rule) => {
    const matchesSearch = 
      rule.rule_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.rule_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === "all" || rule.rule_type === filterType;
    
    const matchesActive = 
      filterActive === "all" ||
      (filterActive === "active" && rule.is_active) ||
      (filterActive === "inactive" && !rule.is_active);

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
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-500/10 border border-gray-500/20 rounded-lg text-gray-500 text-sm">
            <ToggleLeft className="w-4 h-4" />
            {inactiveCount} inactive
          </div>
        </div>
      </div>

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
          onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")}
          className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
        >
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {/* Rules List */}
      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border">
          <p className="text-sm text-muted-foreground">{filteredRules.length} rules</p>
        </div>
        <div className="divide-y divide-border">
          {filteredRules.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No rules found matching your criteria
            </div>
          ) : (
            filteredRules.map((rule) => (
              <div key={rule.id} className="p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <Scale className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-foreground">{rule.rule_name}</span>
                      {rule.rule_code && (
                        <span className="text-xs font-mono text-muted-foreground">[{rule.rule_code}]</span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground mb-2 ml-7">{rule.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground ml-7">
                      <span className="px-2 py-0.5 bg-muted rounded">{rule.rule_type}</span>
                      {rule.priority != null && <span>Priority: {rule.priority}</span>}
                      {rule.effective_from && (
                        <span>From: {new Date(rule.effective_from).toLocaleDateString()}</span>
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
