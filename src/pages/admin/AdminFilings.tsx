import { FileText, Plus } from "lucide-react";

export default function AdminFilings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Filings Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage tax filings</p>
        </div>
        <button className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New Filing
        </button>
      </div>
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground">No filings found</h3>
        <p className="text-muted-foreground mt-2">Tax filings will appear here.</p>
      </div>
    </div>
  );
}