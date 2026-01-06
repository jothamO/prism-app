import { CreditCard, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminPayments() {
  const { toast } = useToast();

  const handleExportCSV = () => {
    toast({
      title: "Coming Soon",
      description: "CSV export will be available once there are payments to export.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-muted-foreground text-sm mt-1">Transaction history and payouts</p>
        </div>
        <button 
          onClick={handleExportCSV}
          className="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-accent flex items-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
          <CreditCard className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground">No transactions yet</h3>
        <p className="text-muted-foreground mt-2">Recent payments will appear here.</p>
      </div>
    </div>
  );
}
