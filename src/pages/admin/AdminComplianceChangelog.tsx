import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  History,
  FileText,
  Scale,
  Plus,
  Edit,
  Trash2,
  Calendar,
  User,
  Filter,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

interface ChangeLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  change_type: string;
  old_values: Json | null;
  new_values: Json | null;
  change_reason: string | null;
  changed_by: string | null;
  source_document_id: string | null;
  created_at: string | null;
  source_document?: { title: string } | null;
}

const CHANGE_TYPES = [
  { value: "all", label: "All Changes" },
  { value: "create", label: "Created" },
  { value: "update", label: "Updated" },
  { value: "delete", label: "Deleted" },
];

const ENTITY_TYPES = [
  { value: "all", label: "All Entities" },
  { value: "document", label: "Documents" },
  { value: "provision", label: "Provisions" },
  { value: "rule", label: "Rules" },
];

export default function AdminComplianceChangelog() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [filterChangeType, setFilterChangeType] = useState("all");
  const [filterEntityType, setFilterEntityType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    fetchChangelog();
  }, [filterChangeType, filterEntityType, dateFrom, dateTo]);

  async function fetchChangelog() {
    setLoading(true);
    try {
      let query = supabase
        .from("compliance_change_log")
        .select(`
          *,
          source_document:legal_documents(title)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filterChangeType !== "all") {
        query = query.eq("change_type", filterChangeType);
      }
      if (filterEntityType !== "all") {
        query = query.eq("entity_type", filterEntityType);
      }
      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("created_at", dateTo + "T23:59:59");
      }

      const { data, error } = await query;

      if (error) throw error;
      setEntries((data as ChangeLogEntry[]) || []);
    } catch (error) {
      console.error("Error fetching changelog:", error);
    } finally {
      setLoading(false);
    }
  }

  function getChangeIcon(changeType: string) {
    switch (changeType) {
      case "create": return <Plus className="w-4 h-4 text-green-500" />;
      case "update": return <Edit className="w-4 h-4 text-blue-500" />;
      case "delete": return <Trash2 className="w-4 h-4 text-red-500" />;
      default: return <History className="w-4 h-4 text-muted-foreground" />;
    }
  }

  function getEntityIcon(entityType: string) {
    switch (entityType) {
      case "document": return <FileText className="w-4 h-4" />;
      case "provision": return <FileText className="w-4 h-4" />;
      case "rule": return <Scale className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  }

  function getChangeBadgeColor(changeType: string) {
    switch (changeType) {
      case "create": return "bg-green-500/20 text-green-500";
      case "update": return "bg-blue-500/20 text-blue-500";
      case "delete": return "bg-red-500/20 text-red-500";
      default: return "bg-muted text-muted-foreground";
    }
  }

  function exportChangelog() {
    const csvContent = [
      ["Date", "Entity Type", "Change Type", "Reason", "Changed By"].join(","),
      ...entries.map(e => [
        e.created_at ? new Date(e.created_at).toISOString() : "",
        e.entity_type,
        e.change_type,
        `"${(e.change_reason || "").replace(/"/g, '""')}"`,
        e.changed_by || "",
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-changelog-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Exported",
      description: "Changelog has been exported to CSV",
    });
  }

  // Group entries by date
  const groupedEntries = entries.reduce((acc, entry) => {
    const date = entry.created_at ? new Date(entry.created_at).toLocaleDateString() : "Unknown";
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, ChangeLogEntry[]>);

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
        <span className="text-foreground">Change Log</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Regulatory Change Log</h1>
          <p className="text-muted-foreground">Track all changes to compliance documents and rules</p>
        </div>
        <Button variant="outline" onClick={exportChangelog}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        <select
          value={filterChangeType}
          onChange={(e) => setFilterChangeType(e.target.value)}
          className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground"
        >
          {CHANGE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        <select
          value={filterEntityType}
          onChange={(e) => setFilterEntityType(e.target.value)}
          className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground"
        >
          {ENTITY_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground"
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {Object.keys(groupedEntries).length === 0 ? (
          <div className="p-8 text-center text-muted-foreground bg-card border border-border rounded-lg">
            No changes found matching your criteria
          </div>
        ) : (
          Object.entries(groupedEntries).map(([date, dayEntries]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <h3 className="text-sm font-semibold text-foreground">{date}</h3>
                <span className="text-xs text-muted-foreground">({dayEntries.length} changes)</span>
              </div>
              <div className="ml-1.5 border-l-2 border-border pl-6 space-y-4">
                {dayEntries.map((entry) => (
                  <div key={entry.id} className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{getChangeIcon(entry.change_type)}</div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium capitalize",
                              getChangeBadgeColor(entry.change_type)
                            )}>
                              {entry.change_type}
                            </span>
                            <span className="flex items-center gap-1 text-sm text-muted-foreground">
                              {getEntityIcon(entry.entity_type)}
                              {entry.entity_type}
                            </span>
                          </div>
                          {entry.change_reason && (
                            <p className="text-sm text-foreground">{entry.change_reason}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            {entry.created_at && (
                              <span>{new Date(entry.created_at).toLocaleTimeString()}</span>
                            )}
                            {entry.changed_by && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {entry.changed_by}
                              </span>
                            )}
                            {entry.source_document && (
                              <Link
                                to={`/admin/compliance/documents/${entry.source_document_id}`}
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <FileText className="w-3 h-3" />
                                {entry.source_document.title.substring(0, 40)}...
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
