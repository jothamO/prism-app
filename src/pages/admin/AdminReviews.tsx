import { useState, useEffect } from "react";
import { AlertTriangle, Search, Check, X, Eye, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface ReviewItem {
  id: string;
  invoice_id: string;
  user_id: string;
  reasons: string[];
  priority: string;
  priority_score: number;
  status: string;
  notes: string | null;
  created_at: string;
  invoice?: {
    invoice_number: string;
    customer_name: string;
    total: number;
    vat_amount: number;
    date: string;
  };
  user?: {
    business_name: string;
    whatsapp_number: string;
  };
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchReviews();
  }, []);

  async function fetchReviews() {
    setLoading(true);
    const { data, error } = await supabase
      .from("review_queue")
      .select(`
        *,
        invoice:invoices(invoice_number, customer_name, total, vat_amount, date),
        user:users(business_name, whatsapp_number)
      `)
      .eq("status", "pending")
      .order("priority_score", { ascending: false });

    if (error) {
      console.error("Error fetching reviews:", error);
    } else {
      setReviews((data as unknown as ReviewItem[]) || []);
    }
    setLoading(false);
  }

  async function handleApprove(id: string) {
    const { error } = await supabase
      .from("review_queue")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      setReviews(reviews.filter(r => r.id !== id));
    }
  }

  async function handleReject(id: string) {
    const { error } = await supabase
      .from("review_queue")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      setReviews(reviews.filter(r => r.id !== id));
    }
  }

  const filteredReviews = reviews.filter(r => 
    r.invoice?.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.invoice?.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.user?.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const highRiskCount = reviews.filter(r => r.priority === "high").length;
  const mediumRiskCount = reviews.filter(r => r.priority === "medium").length;

  function getRiskBadgeStyles(priority: string) {
    switch (priority) {
      case "high":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      default:
        return "bg-green-500/10 text-green-400 border-green-500/20";
    }
  }

  function getTaxActReference(reason: string): string | null {
    if (reason.includes("connected person") || reason.includes("arm's length")) {
      return "Section 191";
    }
    if (reason.includes("artificial") || reason.includes("gift") || reason.includes("capital")) {
      return "Section 192";
    }
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
          <p className="text-muted-foreground text-sm mt-1">Transactions requiring manual classification</p>
        </div>
        <div className="flex items-center gap-3">
          {highRiskCount > 0 && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg text-red-400 text-sm">
              <Shield className="w-4 h-4" />
              <span>{highRiskCount} high risk</span>
            </div>
          )}
          {mediumRiskCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-lg text-yellow-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>{mediumRiskCount} need attention</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              placeholder="Search transactions..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-lg py-2 pl-9 pr-4 text-sm text-foreground focus:outline-none focus:border-primary" 
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">Loading review queue...</p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">No items in review queue</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredReviews.map((review) => (
              <div key={review.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getRiskBadgeStyles(review.priority)}`}>
                        {review.priority.toUpperCase()} RISK
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {review.invoice?.invoice_number || "No invoice #"}
                      </span>
                      <span className="text-sm text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">
                        {review.user?.business_name}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-foreground font-medium">
                        {review.invoice?.customer_name || "Unknown customer"}
                      </span>
                      <span className="text-foreground">
                        ₦{review.invoice?.total?.toLocaleString() || 0}
                      </span>
                      <span className="text-muted-foreground">
                        VAT: ₦{review.invoice?.vat_amount?.toLocaleString() || 0}
                      </span>
                    </div>

                    {/* Anti-avoidance warnings */}
                    <div className="mt-3 space-y-1">
                      {review.reasons.map((reason, idx) => {
                        const taxRef = getTaxActReference(reason);
                        return (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{reason}</span>
                            {taxRef && (
                              <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                                {taxRef}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Expandable notes */}
                    {review.notes && (
                      <button
                        onClick={() => setExpandedId(expandedId === review.id ? null : review.id)}
                        className="flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
                      >
                        {expandedId === review.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Recommendation
                      </button>
                    )}
                    {expandedId === review.id && review.notes && (
                      <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                        {review.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApprove(review.id)}
                      className="text-green-400 border-green-500/20 hover:bg-green-500/10"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(review.id)}
                      className="text-red-400 border-red-500/20 hover:bg-red-500/10"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
