import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit,
  Trash2,
  Rocket,
  Download,
  Github,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
} from "lucide-react";
import {
  useReleases,
  useRelease,
  useCreateRelease,
  useUpdateRelease,
  useDeleteRelease,
  useCreateEntry,
  useUpdateEntry,
  useDeleteEntry,
  usePublishRelease,
  generateChangelogMarkdown,
  type AppRelease,
  type ChangelogEntry,
  type ReleaseWithEntries,
} from "@/hooks/useChangelog";

const ENTRY_TYPES = [
  { value: "added", label: "Added", color: "bg-green-500" },
  { value: "changed", label: "Changed", color: "bg-blue-500" },
  { value: "fixed", label: "Fixed", color: "bg-yellow-500" },
  { value: "removed", label: "Removed", color: "bg-red-500" },
  { value: "security", label: "Security", color: "bg-purple-500" },
  { value: "deprecated", label: "Deprecated", color: "bg-orange-500" },
];

const COMPONENTS = [
  "web",
  "gateway",
  "api",
  "admin",
  "chatbot",
  "edge-functions",
  "database",
];

export default function AdminChangelog() {
  const { toast } = useToast();
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [expandedReleases, setExpandedReleases] = useState<Set<string>>(new Set());
  const [showNewRelease, setShowNewRelease] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ChangelogEntry | null>(null);

  const { data: releases, isLoading } = useReleases(true);
  const { data: selectedRelease } = useRelease(selectedReleaseId);

  const createRelease = useCreateRelease();
  const updateRelease = useUpdateRelease();
  const deleteRelease = useDeleteRelease();
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const publishRelease = usePublishRelease();

  const [newRelease, setNewRelease] = useState({
    version: "",
    title: "",
    summary: "",
    is_major: false,
    is_breaking: false,
  });

  const [newEntry, setNewEntry] = useState({
    entry_type: "added" as ChangelogEntry["entry_type"],
    title: "",
    description: "",
    component: "",
    pull_request_url: "",
    commit_hash: "",
    contributor: "",
  });

  const handleCreateRelease = async () => {
    try {
      await createRelease.mutateAsync(newRelease);
      toast({ title: "Release created successfully" });
      setShowNewRelease(false);
      setNewRelease({ version: "", title: "", summary: "", is_major: false, is_breaking: false });
    } catch (error) {
      toast({ title: "Failed to create release", variant: "destructive" });
    }
  };

  const handleCreateEntry = async () => {
    if (!selectedReleaseId) return;
    try {
      await createEntry.mutateAsync({
        ...newEntry,
        release_id: selectedReleaseId,
        component: newEntry.component || null,
        description: newEntry.description || null,
        pull_request_url: newEntry.pull_request_url || null,
        commit_hash: newEntry.commit_hash || null,
        contributor: newEntry.contributor || null,
      });
      toast({ title: "Entry added successfully" });
      setShowNewEntry(false);
      setNewEntry({
        entry_type: "added",
        title: "",
        description: "",
        component: "",
        pull_request_url: "",
        commit_hash: "",
        contributor: "",
      });
    } catch (error) {
      toast({ title: "Failed to add entry", variant: "destructive" });
    }
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;
    try {
      await updateEntry.mutateAsync({
        id: editingEntry.id,
        release_id: editingEntry.release_id,
        entry_type: editingEntry.entry_type,
        title: editingEntry.title,
        description: editingEntry.description,
        component: editingEntry.component,
        pull_request_url: editingEntry.pull_request_url,
        commit_hash: editingEntry.commit_hash,
        contributor: editingEntry.contributor,
      });
      toast({ title: "Entry updated successfully" });
      setEditingEntry(null);
    } catch (error) {
      toast({ title: "Failed to update entry", variant: "destructive" });
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await publishRelease.mutateAsync(id);
      toast({ title: "Release published successfully" });
    } catch (error) {
      toast({ title: "Failed to publish release", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this release?")) return;
    try {
      await deleteRelease.mutateAsync(id);
      if (selectedReleaseId === id) setSelectedReleaseId(null);
      toast({ title: "Release deleted successfully" });
    } catch (error) {
      toast({ title: "Failed to delete release", variant: "destructive" });
    }
  };

  const handleDeleteEntry = async (id: string, releaseId: string) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await deleteEntry.mutateAsync({ id, release_id: releaseId });
      toast({ title: "Entry deleted" });
    } catch (error) {
      toast({ title: "Failed to delete entry", variant: "destructive" });
    }
  };

  const handleGenerateMarkdown = () => {
    if (!releases?.length) return;

    const releasesWithEntries: ReleaseWithEntries[] = releases
      .filter((r) => r.status === "published")
      .map((r) => ({
        ...r,
        entries: selectedRelease?.id === r.id ? selectedRelease.entries : [],
      }));

    const markdown = generateChangelogMarkdown(releasesWithEntries);
    navigator.clipboard.writeText(markdown);
    toast({ title: "Changelog copied to clipboard" });
  };

  const handleDownloadMarkdown = async () => {
    // Fetch all entries for published releases
    const publishedReleases = releases?.filter((r) => r.status === "published") || [];
    
    // For now, generate with available data
    const releasesWithEntries: ReleaseWithEntries[] = publishedReleases.map((r) => ({
      ...r,
      entries: selectedRelease?.id === r.id ? selectedRelease.entries : [],
    }));

    const markdown = generateChangelogMarkdown(releasesWithEntries);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CHANGELOG.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpandedReleases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedReleaseId(id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Published</Badge>;
      case "draft":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Draft</Badge>;
      case "deprecated":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Deprecated</Badge>;
      default:
        return null;
    }
  };

  const getEntryTypeBadge = (type: string) => {
    const config = ENTRY_TYPES.find((t) => t.value === type);
    return (
      <Badge className={`${config?.color}/20 border-${config?.color}/30`}>
        {config?.label}
      </Badge>
    );
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Application Changelog</h1>
          <p className="text-muted-foreground">Manage release notes and version history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadMarkdown}>
            <Download className="w-4 h-4 mr-2" />
            Download MD
          </Button>
          <Button variant="outline" onClick={handleGenerateMarkdown}>
            <Copy className="w-4 h-4 mr-2" />
            Copy MD
          </Button>
          <Dialog open={showNewRelease} onOpenChange={setShowNewRelease}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Release
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Release</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Version</Label>
                    <Input
                      placeholder="1.0.0"
                      value={newRelease.version}
                      onChange={(e) => setNewRelease({ ...newRelease, version: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Title</Label>
                    <Input
                      placeholder="Release title"
                      value={newRelease.title}
                      onChange={(e) => setNewRelease({ ...newRelease, title: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Summary</Label>
                  <Textarea
                    placeholder="Brief description of this release"
                    value={newRelease.summary}
                    onChange={(e) => setNewRelease({ ...newRelease, summary: e.target.value })}
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={newRelease.is_major}
                      onCheckedChange={(v) => setNewRelease({ ...newRelease, is_major: !!v })}
                    />
                    <Label>Major Release</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={newRelease.is_breaking}
                      onCheckedChange={(v) => setNewRelease({ ...newRelease, is_breaking: !!v })}
                    />
                    <Label>Breaking Changes</Label>
                  </div>
                </div>
                <Button onClick={handleCreateRelease} disabled={!newRelease.version || !newRelease.title}>
                  Create Release
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-foreground">{releases?.length || 0}</div>
            <div className="text-sm text-muted-foreground">Total Releases</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-400">
              {releases?.filter((r) => r.status === "published").length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Published</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-400">
              {releases?.filter((r) => r.status === "draft").length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Drafts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-400">
              {releases?.filter((r) => r.is_major).length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Major Releases</div>
          </CardContent>
        </Card>
      </div>

      {/* Release List */}
      <div className="space-y-4">
        {releases?.map((release) => {
          const isExpanded = expandedReleases.has(release.id);
          const isSelected = selectedReleaseId === release.id;

          return (
            <Card key={release.id} className={isSelected ? "border-primary" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => toggleExpand(release.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg text-foreground">
                          v{release.version}
                        </span>
                        {getStatusBadge(release.status)}
                        {release.is_major && (
                          <Badge variant="outline" className="border-blue-500/30 text-blue-400">
                            Major
                          </Badge>
                        )}
                        {release.is_breaking && (
                          <Badge variant="outline" className="border-red-500/30 text-red-400">
                            Breaking
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {release.title} • {new Date(release.release_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {release.status === "draft" && (
                      <Button
                        size="sm"
                        onClick={() => handlePublish(release.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Rocket className="w-4 h-4 mr-1" />
                        Publish
                      </Button>
                    )}
                    {release.github_release_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(release.github_release_url!, "_blank")}
                      >
                        <Github className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(release.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent>
                  {release.summary && (
                    <p className="text-muted-foreground mb-4">{release.summary}</p>
                  )}

                  {/* Entries */}
                  <div className="space-y-2 mb-4">
                    {selectedRelease?.entries?.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {getEntryTypeBadge(entry.entry_type)}
                            {entry.component && (
                              <Badge variant="outline" className="text-xs">
                                {entry.component}
                              </Badge>
                            )}
                          </div>
                          <div className="font-medium text-foreground">{entry.title}</div>
                          {entry.description && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {entry.description}
                            </div>
                          )}
                          {(entry.pull_request_url || entry.commit_hash) && (
                            <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                              {entry.pull_request_url && (
                                <a
                                  href={entry.pull_request_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  PR
                                </a>
                              )}
                              {entry.commit_hash && (
                                <span className="font-mono">{entry.commit_hash.slice(0, 7)}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingEntry(entry)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteEntry(entry.id, release.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {(!selectedRelease?.entries || selectedRelease.entries.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        No entries yet. Add your first changelog entry.
                      </div>
                    )}
                  </div>

                  {/* Add Entry Button */}
                  <Dialog open={showNewEntry} onOpenChange={setShowNewEntry}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Entry
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Changelog Entry</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Type</Label>
                            <Select
                              value={newEntry.entry_type}
                              onValueChange={(v) =>
                                setNewEntry({ ...newEntry, entry_type: v as ChangelogEntry["entry_type"] })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ENTRY_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Component</Label>
                            <Select
                              value={newEntry.component}
                              onValueChange={(v) => setNewEntry({ ...newEntry, component: v })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select component" />
                              </SelectTrigger>
                              <SelectContent>
                                {COMPONENTS.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label>Title</Label>
                          <Input
                            placeholder="Brief description of the change"
                            value={newEntry.title}
                            onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Description (optional)</Label>
                          <Textarea
                            placeholder="Additional details"
                            value={newEntry.description}
                            onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>PR URL (optional)</Label>
                            <Input
                              placeholder="https://github.com/..."
                              value={newEntry.pull_request_url}
                              onChange={(e) =>
                                setNewEntry({ ...newEntry, pull_request_url: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label>Commit Hash (optional)</Label>
                            <Input
                              placeholder="abc1234"
                              value={newEntry.commit_hash}
                              onChange={(e) => setNewEntry({ ...newEntry, commit_hash: e.target.value })}
                            />
                          </div>
                        </div>
                        <Button onClick={handleCreateEntry} disabled={!newEntry.title}>
                          Add Entry
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              )}
            </Card>
          );
        })}

        {(!releases || releases.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No releases yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first release to start tracking changes.
              </p>
              <Button onClick={() => setShowNewRelease(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Release
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select
                    value={editingEntry.entry_type}
                    onValueChange={(v) =>
                      setEditingEntry({ ...editingEntry, entry_type: v as ChangelogEntry["entry_type"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTRY_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Component</Label>
                  <Select
                    value={editingEntry.component || ""}
                    onValueChange={(v) => setEditingEntry({ ...editingEntry, component: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select component" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPONENTS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={editingEntry.title}
                  onChange={(e) => setEditingEntry({ ...editingEntry, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editingEntry.description || ""}
                  onChange={(e) => setEditingEntry({ ...editingEntry, description: e.target.value })}
                />
              </div>
              <Button onClick={handleUpdateEntry}>Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
