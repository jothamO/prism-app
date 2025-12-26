import { AlertTriangle, Search, Check, X, Eye } from "lucide-react";

export default function AdminReviews() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
          <p className="text-muted-foreground text-sm mt-1">Transactions requiring manual classification</p>
        </div>
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-lg text-yellow-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>5 items need attention</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input placeholder="Search transactions..." className="w-full bg-background border border-border rounded-lg py-2 pl-9 pr-4 text-sm text-foreground focus:outline-none focus:border-primary" />
          </div>
        </div>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Review queue items will appear here</p>
        </div>
      </div>
    </div>
  );
}