import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  RefreshCw,
  Bell,
  Link2,
  AlertCircle,
} from "lucide-react";

interface TaxDeadline {
  id: string;
  deadline_type: string;
  title: string;
  description: string | null;
  recurrence: string;
  day_of_month: number | null;
  month_of_year: number | null;
  specific_date: string | null;
  source_rule_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  notification_config: {
    days_before: number[];
    message_template: string | null;
  } | null;
  linked_provision_ids: string[] | null;
}

interface LegalProvision {
  id: string;
  title: string | null;
  section_number: string | null;
}

const DEADLINE_TYPES = ["vat", "paye", "wht", "cit", "annual", "emtl", "other"];
const RECURRENCE_TYPES = ["monthly", "annual", "specific_date"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function AdminTaxCalendar() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [deadlines, setDeadlines] = useState<TaxDeadline[]>([]);
  const [provisions, setProvisions] = useState<LegalProvision[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("all");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<TaxDeadline | null>(null);
  const [formData, setFormData] = useState({
    deadline_type: "vat",
    title: "",
    description: "",
    recurrence: "monthly",
    day_of_month: 21,
    month_of_year: 1,
    specific_date: "",
    is_active: true,
    notification_days: [7, 3, 1] as number[],
    message_template: "",
    linked_provision_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // Check for prefill params from Summary tab
  useEffect(() => {
    const prefill = searchParams.get("prefill");
    const title = searchParams.get("title");
    const date = searchParams.get("date");
    const description = searchParams.get("description");
    const type = searchParams.get("type");

    if (prefill === "true") {
      setFormData((prev) => ({
        ...prev,
        title: title ? decodeURIComponent(title) : "",
        description: description ? decodeURIComponent(description) : "",
        deadline_type: type || "other",
        recurrence: date ? "specific_date" : "monthly",
        specific_date: date || "",
      }));
      setIsModalOpen(true);
      navigate("/admin/tax-calendar", { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    fetchDeadlines();
    fetchProvisions();
  }, []);

  async function fetchDeadlines() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tax_deadlines")
      .select("*")
      .order("deadline_type")
      .order("day_of_month");

    if (error) {
      toast({ title: "Error loading deadlines", description: error.message, variant: "destructive" });
    } else {
      setDeadlines(data || []);
    }
    setLoading(false);
  }

  async function fetchProvisions() {
    const { data } = await supabase
      .from("legal_provisions")
      .select("id, title, section_number")
      .order("section_number");
    setProvisions(data || []);
  }

  function getNextDeadlineDate(deadline: TaxDeadline): string {
    const now = new Date();
    
    if (deadline.recurrence === "specific_date" && deadline.specific_date) {
      return new Date(deadline.specific_date).toLocaleDateString();
    }
    
    if (deadline.recurrence === "monthly" && deadline.day_of_month) {
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), deadline.day_of_month);
      if (thisMonth > now) {
        return thisMonth.toLocaleDateString();
      }
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, deadline.day_of_month);
      return nextMonth.toLocaleDateString();
    }
    
    if (deadline.recurrence === "annual" && deadline.day_of_month && deadline.month_of_year) {
      const thisYear = new Date(now.getFullYear(), deadline.month_of_year - 1, deadline.day_of_month);
      if (thisYear > now) {
        return thisYear.toLocaleDateString();
      }
      const nextYear = new Date(now.getFullYear() + 1, deadline.month_of_year - 1, deadline.day_of_month);
      return nextYear.toLocaleDateString();
    }
    
    return "—";
  }

  async function handleSave() {
    if (!formData.title) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      deadline_type: formData.deadline_type,
      title: formData.title,
      description: formData.description || null,
      recurrence: formData.recurrence,
      day_of_month: formData.recurrence !== "specific_date" ? formData.day_of_month : null,
      month_of_year: formData.recurrence === "annual" ? formData.month_of_year : null,
      specific_date: formData.recurrence === "specific_date" ? formData.specific_date : null,
      is_active: formData.is_active,
      notification_config: {
        days_before: formData.notification_days,
        message_template: formData.message_template || null,
      },
      linked_provision_ids: formData.linked_provision_ids,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editingDeadline) {
      ({ error } = await supabase
        .from("tax_deadlines")
        .update(payload)
        .eq("id", editingDeadline.id));
    } else {
      ({ error } = await supabase.from("tax_deadlines").insert({
        ...payload,
        created_by: user?.id,
      }));
    }

    if (error) {
      toast({ title: "Error saving deadline", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingDeadline ? "Deadline updated" : "Deadline created" });
      setIsModalOpen(false);
      resetForm();
      fetchDeadlines();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this deadline?")) return;

    const { error } = await supabase.from("tax_deadlines").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting deadline", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deadline deleted" });
      fetchDeadlines();
    }
  }

  async function toggleActive(deadline: TaxDeadline) {
    const { error } = await supabase
      .from("tax_deadlines")
      .update({ is_active: !deadline.is_active, updated_at: new Date().toISOString() })
      .eq("id", deadline.id);

    if (error) {
      toast({ title: "Error updating deadline", description: error.message, variant: "destructive" });
    } else {
      fetchDeadlines();
    }
  }

  function openEditModal(deadline: TaxDeadline) {
    setEditingDeadline(deadline);
    const config = deadline.notification_config || { days_before: [7, 3, 1], message_template: null };
    setFormData({
      deadline_type: deadline.deadline_type,
      title: deadline.title,
      description: deadline.description || "",
      recurrence: deadline.recurrence,
      day_of_month: deadline.day_of_month || 21,
      month_of_year: deadline.month_of_year || 1,
      specific_date: deadline.specific_date || "",
      is_active: deadline.is_active,
      notification_days: config.days_before || [7, 3, 1],
      message_template: config.message_template || "",
      linked_provision_ids: deadline.linked_provision_ids || [],
    });
    setIsModalOpen(true);
  }

  function resetForm() {
    setEditingDeadline(null);
    setFormData({
      deadline_type: "vat",
      title: "",
      description: "",
      recurrence: "monthly",
      day_of_month: 21,
      month_of_year: 1,
      specific_date: "",
      is_active: true,
      notification_days: [7, 3, 1],
      message_template: "",
      linked_provision_ids: [],
    });
  }

  function toggleNotificationDay(day: number) {
    setFormData((prev) => ({
      ...prev,
      notification_days: prev.notification_days.includes(day)
        ? prev.notification_days.filter((d) => d !== day)
        : [...prev.notification_days, day].sort((a, b) => b - a),
    }));
  }

  function toggleProvisionLink(provisionId: string) {
    setFormData((prev) => ({
      ...prev,
      linked_provision_ids: prev.linked_provision_ids.includes(provisionId)
        ? prev.linked_provision_ids.filter((id) => id !== provisionId)
        : [...prev.linked_provision_ids, provisionId],
    }));
  }

  const filteredDeadlines = deadlines.filter((deadline) => {
    const matchesType = filterType === "all" || deadline.deadline_type === filterType;
    const matchesActive =
      filterActive === "all" ||
      (filterActive === "active" && deadline.is_active) ||
      (filterActive === "inactive" && !deadline.is_active);
    return matchesType && matchesActive;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Tax Calendar Management
          </h1>
          <p className="text-muted-foreground">
            Manage tax deadlines and automated notifications. Syncs with user calendars and chatbots.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Deadline
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {DEADLINE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchDeadlines}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Deadlines Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Recurrence</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Notifications</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredDeadlines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No deadlines found
                  </TableCell>
                </TableRow>
              ) : (
                filteredDeadlines.map((deadline) => (
                  <TableRow key={deadline.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {deadline.title}
                          {deadline.source_rule_id && (
                            <Badge variant="outline" className="text-xs">
                              Auto
                            </Badge>
                          )}
                        </div>
                        {deadline.description && (
                          <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {deadline.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{deadline.deadline_type.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{deadline.recurrence.replace("_", " ")}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {getNextDeadlineDate(deadline)}
                    </TableCell>
                    <TableCell>
                      {deadline.notification_config?.days_before?.length ? (
                        <div className="flex gap-1">
                          {deadline.notification_config.days_before.map((d) => (
                            <Badge key={d} variant="secondary" className="text-xs">
                              {d}d
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {deadline.is_active ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-200">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleActive(deadline)}
                          title={deadline.is_active ? "Deactivate" : "Activate"}
                        >
                          <AlertCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(deadline)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(deadline.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDeadline ? "Edit Deadline" : "Create New Deadline"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Deadline title"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={formData.deadline_type}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, deadline_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEADLINE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Recurrence</Label>
              <Select
                value={formData.recurrence}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, recurrence: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "specific_date" ? "One-time" : type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.recurrence === "monthly" && (
              <div className="space-y-2">
                <Label>Day of Month</Label>
                <Select
                  value={String(formData.day_of_month)}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, day_of_month: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.recurrence === "annual" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select
                    value={String(formData.month_of_year)}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, month_of_year: parseInt(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month, i) => (
                        <SelectItem key={i} value={String(i + 1)}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select
                    value={String(formData.day_of_month)}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, day_of_month: parseInt(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={String(day)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {formData.recurrence === "specific_date" && (
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.specific_date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, specific_date: e.target.value }))}
                />
              </div>
            )}

            {/* Notification Settings */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notification Settings
              </Label>
              <div className="border rounded-md p-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {[14, 7, 3, 1].map((day) => (
                    <Button
                      key={day}
                      type="button"
                      variant={formData.notification_days.includes(day) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleNotificationDay(day)}
                    >
                      {day} day{day > 1 ? "s" : ""} before
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Custom Message Template (optional)</Label>
                  <Textarea
                    value={formData.message_template}
                    onChange={(e) => setFormData((prev) => ({ ...prev, message_template: e.target.value }))}
                    placeholder="Your {deadline_type} filing is due on {date}. Current estimated liability: {amount}"
                    rows={2}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Variables: {"{deadline_type}"}, {"{date}"}, {"{amount}"}, {"{title}"}
                  </p>
                </div>
              </div>
            </div>

            {/* Linked Provisions */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Linked Legal Provisions
              </Label>
              <div className="border rounded-md p-3 max-h-[120px] overflow-y-auto space-y-2">
                {provisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No provisions available</p>
                ) : (
                  provisions.slice(0, 15).map((prov) => (
                    <div key={prov.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`prov-${prov.id}`}
                        checked={formData.linked_provision_ids.includes(prov.id)}
                        onCheckedChange={() => toggleProvisionLink(prov.id)}
                      />
                      <label htmlFor={`prov-${prov.id}`} className="text-sm cursor-pointer">
                        {prov.section_number ? `§${prov.section_number} - ` : ""}
                        {prov.title || "Untitled"}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <Label>Active</Label>
                <p className="text-sm text-muted-foreground">
                  Active deadlines appear in user calendars
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingDeadline ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
