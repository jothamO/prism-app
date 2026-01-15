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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProvisionLinksDisplay } from "@/components/admin/ProvisionLinksDisplay";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Link2,
  BookOpen,
  RefreshCw,
  Sparkles,
  Loader2,
} from "lucide-react";

interface EducationArticle {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  content: string;
  category: string;
  read_time: string | null;
  is_published: boolean;
  needs_review: boolean;
  suggested_by_ai: boolean;
  source_provisions: string[] | null;
  linked_provision_ids: string[] | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  last_edited_by: string | null;
}

interface LegalProvision {
  id: string;
  title: string | null;
  section_number: string | null;
  document_id: string;
}

const CATEGORIES = [
  "basics",
  "vat",
  "paye",
  "withholding",
  "cit",
  "compliance",
  "filing",
  "exemptions",
  "penalties",
  "other",
];

const READ_TIMES = ["2 min", "5 min", "10 min", "15 min", "20 min"];

export default function AdminEducation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [articles, setArticles] = useState<EducationArticle[]>([]);
  const [provisions, setProvisions] = useState<LegalProvision[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<EducationArticle | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    content: "",
    category: "basics",
    read_time: "5 min",
    is_published: false,
    needs_review: false,
    linked_provision_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);

  // Track document context from URL
  const [sourceDocumentId, setSourceDocumentId] = useState<string | null>(null);

  // Check for prefill params from Summary tab
  useEffect(() => {
    const prefill = searchParams.get("prefill");
    const topic = searchParams.get("topic");
    const provisionIds = searchParams.get("provision_ids");
    const category = searchParams.get("category");
    const documentId = searchParams.get("document_id");
    const generateAi = searchParams.get("generate_ai");

    if (prefill === "true") {
      const linkedIds = provisionIds ? provisionIds.split(",").filter(Boolean) : [];
      setFormData((prev) => ({
        ...prev,
        title: topic ? decodeURIComponent(topic) : "",
        slug: topic ? generateSlug(decodeURIComponent(topic)) : "",
        category: category || "basics",
        linked_provision_ids: linkedIds,
      }));
      setSourceDocumentId(documentId || null);
      setIsModalOpen(true);
      
      // Clear the URL params
      navigate("/admin/education", { replace: true });

      // Auto-generate if requested
      if (generateAi === "true" && topic) {
        setTimeout(() => {
          handleGenerateContent(decodeURIComponent(topic), category || "basics", linkedIds, documentId || undefined);
        }, 500);
      }
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    fetchArticles();
    fetchProvisions();
  }, []);

  async function fetchArticles() {
    setLoading(true);
    const { data, error } = await supabase
      .from("education_articles")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading articles", description: error.message, variant: "destructive" });
    } else {
      setArticles(data || []);
    }
    setLoading(false);
  }

  async function fetchProvisions() {
    const { data } = await supabase
      .from("legal_provisions")
      .select("id, title, section_number, document_id")
      .order("section_number");
    setProvisions(data || []);
  }

  function generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleTitleChange(title: string) {
    setFormData((prev) => ({
      ...prev,
      title,
      slug: editingArticle ? prev.slug : generateSlug(title),
    }));
  }

  async function handleGenerateContent(
    topic?: string,
    category?: string,
    provisionIds?: string[],
    documentId?: string
  ) {
    const useTopic = topic || formData.title;
    const useCategory = category || formData.category;
    const useProvisionIds = provisionIds || formData.linked_provision_ids;
    const useDocumentId = documentId || sourceDocumentId;

    if (!useTopic) {
      toast({ title: "Enter a title first", variant: "destructive" });
      return;
    }

    setGeneratingContent(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-article-content", {
        body: {
          topic: useTopic,
          category: useCategory,
          provisionIds: useProvisionIds,
          documentId: useDocumentId,
        },
      });

      if (error) throw error;

      if (data?.content) {
        setFormData((prev) => ({
          ...prev,
          content: data.content,
          description: data.description || prev.description,
          read_time: data.read_time || prev.read_time,
        }));
        toast({ title: "Content generated!", description: `Used ${data.provisions_used || 0} legal provisions` });
      } else {
        throw new Error("No content generated");
      }
    } catch (error) {
      console.error("Generate content error:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setGeneratingContent(false);
    }
  }

  async function handleSave() {
    if (!formData.title || !formData.content) {
      toast({ title: "Title and content are required", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      title: formData.title,
      slug: formData.slug,
      description: formData.description || null,
      content: formData.content,
      category: formData.category,
      read_time: formData.read_time,
      is_published: formData.is_published,
      needs_review: formData.needs_review,
      linked_provision_ids: formData.linked_provision_ids,
      last_edited_by: user?.id,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editingArticle) {
      ({ error } = await supabase
        .from("education_articles")
        .update(payload)
        .eq("id", editingArticle.id));
    } else {
      ({ error } = await supabase.from("education_articles").insert({
        ...payload,
        created_by: user?.id,
        suggested_by_ai: generatingContent || formData.content.includes("##"),
      }));
    }

    if (error) {
      toast({ title: "Error saving article", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingArticle ? "Article updated" : "Article created" });
      setIsModalOpen(false);
      resetForm();
      fetchArticles();
    }
    setSaving(false);
  }

  async function executeDelete() {
    if (!deleteConfirmId) return;
    setDeleting(true);
    
    const { error } = await supabase.from("education_articles").delete().eq("id", deleteConfirmId);
    if (error) {
      toast({ title: "Error deleting article", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Article deleted" });
      fetchArticles();
    }
    
    setDeleting(false);
    setDeleteConfirmId(null);
  }

  async function togglePublish(article: EducationArticle) {
    const { error } = await supabase
      .from("education_articles")
      .update({ is_published: !article.is_published, updated_at: new Date().toISOString() })
      .eq("id", article.id);

    if (error) {
      toast({ title: "Error updating article", description: error.message, variant: "destructive" });
    } else {
      fetchArticles();
    }
  }

  function openEditModal(article: EducationArticle) {
    setEditingArticle(article);
    setFormData({
      title: article.title,
      slug: article.slug,
      description: article.description || "",
      content: article.content,
      category: article.category,
      read_time: article.read_time || "5 min",
      is_published: article.is_published || false,
      needs_review: article.needs_review || false,
      linked_provision_ids: article.linked_provision_ids || [],
    });
    setIsModalOpen(true);
  }

  function resetForm() {
    setEditingArticle(null);
    setSourceDocumentId(null);
    setFormData({
      title: "",
      slug: "",
      description: "",
      content: "",
      category: "basics",
      read_time: "5 min",
      is_published: false,
      needs_review: false,
      linked_provision_ids: [],
    });
  }

  function toggleProvisionLink(provisionId: string) {
    setFormData((prev) => ({
      ...prev,
      linked_provision_ids: prev.linked_provision_ids.includes(provisionId)
        ? prev.linked_provision_ids.filter((id) => id !== provisionId)
        : [...prev.linked_provision_ids, provisionId],
    }));
  }

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || article.category === filterCategory;
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "published" && article.is_published) ||
      (filterStatus === "draft" && !article.is_published) ||
      (filterStatus === "review" && article.needs_review);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Education Center
          </h1>
          <p className="text-muted-foreground">
            Manage educational articles for users. Published content syncs with chatbots.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Article
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="review">Needs Review</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchArticles}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Articles Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Provisions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredArticles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No articles found
                  </TableCell>
                </TableRow>
              ) : (
                filteredArticles.map((article) => (
                  <TableRow key={article.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {article.title}
                          {article.suggested_by_ai && (
                            <Sparkles className="h-3 w-3 text-amber-500" />
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{article.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{article.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {article.linked_provision_ids && article.linked_provision_ids.length > 0 ? (
                        <Badge variant="secondary" className="gap-1">
                          <Link2 className="h-3 w-3" />
                          {article.linked_provision_ids.length}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {article.is_published ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-200">
                            Published
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                        {article.needs_review && (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">
                            Review
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(article.updated_at || article.created_at || "").toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => togglePublish(article)}
                          title={article.is_published ? "Unpublish" : "Publish"}
                        >
                          {article.is_published ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(article)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(article.id)}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingArticle ? "Edit Article" : "Create New Article"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Article title"
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={formData.slug}
                  onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                  placeholder="article-slug"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Read Time</Label>
                <Select
                  value={formData.read_time}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, read_time: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {READ_TIMES.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
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

            {/* AI Generate Button */}
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-200/50">
              <Button
                variant="outline"
                onClick={() => handleGenerateContent()}
                disabled={generatingContent || !formData.title}
                className="gap-2"
              >
                {generatingContent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-purple-500" />
                )}
                {generatingContent ? "Generating..." : "Generate with AI"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {formData.linked_provision_ids.length > 0
                  ? `Uses ${formData.linked_provision_ids.length} linked provision(s) for context`
                  : "Add provisions below for better content"}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Content (Markdown)</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="## What is VAT?&#10;&#10;Value Added Tax (VAT) is..."
                rows={12}
                className="font-mono text-sm"
              />
            </div>

            {/* Visual Provision Links Display */}
            {formData.linked_provision_ids.length > 0 && (
              <ProvisionLinksDisplay
                provisionIds={formData.linked_provision_ids}
                variant="compact"
                showSource
              />
            )}

            {/* Linked Provisions */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link Legal Provisions
              </Label>
              <div className="border rounded-md p-3 max-h-[150px] overflow-y-auto space-y-2">
                {provisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No provisions available</p>
                ) : (
                  provisions.slice(0, 30).map((prov) => (
                    <div key={prov.id} className="flex items-center gap-2">
                      <Checkbox
                        id={prov.id}
                        checked={formData.linked_provision_ids.includes(prov.id)}
                        onCheckedChange={() => toggleProvisionLink(prov.id)}
                      />
                      <label htmlFor={prov.id} className="text-sm cursor-pointer">
                        {prov.section_number ? `§${prov.section_number} - ` : ""}
                        {prov.title || "Untitled"}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Status Options */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_published"
                  checked={formData.is_published}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_published: !!checked }))
                  }
                />
                <Label htmlFor="is_published">Published</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="needs_review"
                  checked={formData.needs_review}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, needs_review: !!checked }))
                  }
                />
                <Label htmlFor="needs_review">Needs Review</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingArticle ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        title="Delete Article"
        description="Are you sure you want to delete this article? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={executeDelete}
      />
    </div>
  );
}
