import { useState } from "react";
import { 
  Sparkles, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Download,
  Search,
  Filter,
  CheckSquare,
  Square,
  RotateCcw,
  Tag,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { usePatternManagement, ClassificationPattern } from "@/hooks/usePatternManagement";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function AdminPatterns() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ category: "", confidence: 0.5 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deletePatternId, setDeletePatternId] = useState<string | null>(null);

  const { 
    patterns, 
    categories, 
    stats, 
    createPattern, 
    updatePattern, 
    deletePattern, 
    bulkDelete, 
    bulkUpdateConfidence,
    bulkChangeCategory
  } = usePatternManagement({ searchTerm, category: categoryFilter || undefined });

  const allPatterns = patterns.data || [];
  const allCategories = categories.data || [];
  const patternStats = stats.data;

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === allPatterns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPatterns.map(p => p.id)));
    }
  };

  const startEdit = (pattern: ClassificationPattern) => {
    setEditingId(pattern.id);
    setEditForm({ category: pattern.category, confidence: pattern.confidence });
  };

  const saveEdit = () => {
    if (editingId) {
      updatePattern.mutate({ id: editingId, updates: editForm });
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ category: "", confidence: 0.5 });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size > 0) {
      setShowBulkDeleteConfirm(true);
    }
  };

  const executeBulkDelete = () => {
    bulkDelete.mutate(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleBulkApprove = () => {
    if (selectedIds.size > 0) {
      bulkUpdateConfidence.mutate({ ids: Array.from(selectedIds), confidence: 1.0 });
      setSelectedIds(new Set());
    }
  };

  const handleBulkReset = () => {
    if (selectedIds.size > 0) {
      bulkUpdateConfidence.mutate({ ids: Array.from(selectedIds), confidence: 0.5 });
      setSelectedIds(new Set());
    }
  };

  const handleBulkChangeCategory = () => {
    if (selectedIds.size > 0 && newCategory) {
      bulkChangeCategory.mutate({ ids: Array.from(selectedIds), category: newCategory });
      setSelectedIds(new Set());
      setShowBulkCategoryModal(false);
      setNewCategory("");
    }
  };

  const exportPatterns = () => {
    const csv = [
      ['Pattern', 'Category', 'Confidence', 'Occurrences', 'Business', 'Last Used'].join(','),
      ...allPatterns.map(p => [
        `"${p.item_pattern}"`,
        p.category,
        p.confidence.toFixed(2),
        p.occurrence_count,
        `"${p.business_name}"`,
        p.last_used_at
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patterns-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500 bg-green-500/10';
    if (confidence >= 0.5) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
  };

  const getAccuracy = (pattern: ClassificationPattern) => {
    if (pattern.occurrence_count === 0) return 0;
    return (pattern.correct_predictions / pattern.occurrence_count) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pattern Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage learned business classification patterns</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPatterns}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Pattern
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Sparkles className="w-4 h-4" />
            Total Patterns
          </div>
          <p className="text-2xl font-bold text-foreground">{patternStats?.totalPatterns || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <TrendingUp className="w-4 h-4" />
            Avg Confidence
          </div>
          <p className="text-2xl font-bold text-foreground">{((patternStats?.avgConfidence || 0) * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Check className="w-4 h-4 text-green-500" />
            High Confidence
          </div>
          <p className="text-2xl font-bold text-green-500">{patternStats?.highConfidence || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Low Confidence
          </div>
          <p className="text-2xl font-bold text-red-500">{patternStats?.lowConfidence || 0}</p>
        </div>
      </div>

      {/* Filters & Bulk Actions */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search patterns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Categories</option>
          {allCategories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-lg">
            <span className="text-sm text-primary font-medium">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkApprove}
              className="p-1.5 hover:bg-primary/20 rounded text-green-500"
              title="Approve (set confidence to 100%)"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={handleBulkReset}
              className="p-1.5 hover:bg-primary/20 rounded text-yellow-500"
              title="Reset confidence to 50%"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowBulkCategoryModal(true)}
              className="p-1.5 hover:bg-primary/20 rounded text-blue-500"
              title="Change category"
            >
              <Tag className="w-4 h-4" />
            </button>
            <button
              onClick={handleBulkDelete}
              className="p-1.5 hover:bg-primary/20 rounded text-red-500"
              title="Delete selected"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Patterns Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="p-3 text-left">
                  <button onClick={toggleSelectAll} className="p-1 hover:bg-muted rounded">
                    {selectedIds.size === allPatterns.length && allPatterns.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Pattern</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Category</th>
                <th className="p-3 text-left text-sm font-medium text-muted-foreground">Business</th>
                <th className="p-3 text-center text-sm font-medium text-muted-foreground">Confidence</th>
                <th className="p-3 text-center text-sm font-medium text-muted-foreground">Accuracy</th>
                <th className="p-3 text-center text-sm font-medium text-muted-foreground">Uses</th>
                <th className="p-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {patterns.isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">Loading patterns...</td>
                </tr>
              ) : allPatterns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">No patterns found</td>
                </tr>
              ) : (
                allPatterns.map(pattern => (
                  <tr key={pattern.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <button onClick={() => toggleSelect(pattern.id)} className="p-1 hover:bg-muted rounded">
                        {selectedIds.has(pattern.id) ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="p-3">
                      <code className="text-sm bg-muted px-2 py-1 rounded">{pattern.item_pattern}</code>
                    </td>
                    <td className="p-3">
                      {editingId === pattern.id ? (
                        <select
                          value={editForm.category}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          className="bg-background border border-border rounded px-2 py-1 text-sm"
                        >
                          {allCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded">{pattern.category}</span>
                      )}
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">{pattern.business_name}</td>
                    <td className="p-3 text-center">
                      {editingId === pattern.id ? (
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.1"
                          value={editForm.confidence}
                          onChange={(e) => setEditForm({ ...editForm, confidence: parseFloat(e.target.value) })}
                          className="w-16 bg-background border border-border rounded px-2 py-1 text-sm text-center"
                        />
                      ) : (
                        <span className={`text-sm px-2 py-1 rounded ${getConfidenceColor(pattern.confidence)}`}>
                          {(pattern.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-sm ${getAccuracy(pattern) >= 80 ? 'text-green-500' : getAccuracy(pattern) >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {getAccuracy(pattern).toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-3 text-center text-sm text-muted-foreground">{pattern.occurrence_count}</td>
                    <td className="p-3 text-right">
                      {editingId === pattern.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={saveEdit} className="p-1.5 hover:bg-green-500/10 rounded text-green-500">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEdit} className="p-1.5 hover:bg-red-500/10 rounded text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(pattern)} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeletePatternId(pattern.id)} 
                            className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Pattern Modal */}
      {showCreateModal && (
        <CreatePatternModal 
          categories={allCategories}
          onClose={() => setShowCreateModal(false)}
          onCreate={(data) => {
            createPattern.mutate(data);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Bulk Category Change Modal */}
      {showBulkCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">Change Category</h3>
            <p className="text-sm text-muted-foreground mb-4">Select new category for {selectedIds.size} patterns:</p>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 mb-4"
            >
              <option value="">Select category...</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBulkCategoryModal(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkChangeCategory}
                disabled={!newCategory}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                Change Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title="Delete Patterns"
        description={`This will permanently delete ${selectedIds.size} selected patterns. This action cannot be undone.`}
        confirmText="Delete Patterns"
        variant="destructive"
        onConfirm={executeBulkDelete}
        loading={bulkDelete.isPending}
      />

      {/* Single Pattern Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletePatternId}
        onOpenChange={(open) => !open && setDeletePatternId(null)}
        title="Delete Pattern"
        description="Are you sure you want to delete this pattern? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deletePatternId) {
            deletePattern.mutate(deletePatternId);
            setDeletePatternId(null);
          }
        }}
        loading={deletePattern.isPending}
      />
    </div>
  );
}

// Create Pattern Modal Component
function CreatePatternModal({ 
  categories, 
  onClose, 
  onCreate 
}: { 
  categories: string[];
  onClose: () => void;
  onCreate: (data: { business_id: string; item_pattern: string; category: string; confidence?: number }) => void;
}) {
  const [form, setForm] = useState({
    business_id: "",
    item_pattern: "",
    category: "",
    confidence: 0.5
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-foreground mb-4">Create Pattern</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Business ID</label>
            <input
              type="text"
              value={form.business_id}
              onChange={(e) => setForm({ ...form, business_id: e.target.value })}
              placeholder="UUID of the business"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Pattern Text</label>
            <input
              type="text"
              value={form.item_pattern}
              onChange={(e) => setForm({ ...form, item_pattern: e.target.value })}
              placeholder="e.g., transfer from john"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select category...</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="sale">sale</option>
              <option value="expense">expense</option>
              <option value="transfer">transfer</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Initial Confidence</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={form.confidence}
              onChange={(e) => setForm({ ...form, confidence: parseFloat(e.target.value) })}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground text-center">{(form.confidence * 100).toFixed(0)}%</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(form)}
            disabled={!form.business_id || !form.item_pattern || !form.category}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            Create Pattern
          </button>
        </div>
      </div>
    </div>
  );
}