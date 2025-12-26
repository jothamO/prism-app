import { BarChart3 } from "lucide-react";

export default function AdminAnalytics() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Detailed system performance and usage metrics</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6 h-64 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Revenue Chart Placeholder</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 h-64 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">User Growth Placeholder</p>
          </div>
        </div>
      </div>
    </div>
  );
}