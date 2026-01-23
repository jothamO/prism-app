import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Search, Check, X, Eye, Shield, ChevronDown, ChevronUp, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

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
    items: unknown;
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
  const [selectedReview, setSelectedReview] = useState<ReviewItem | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("review_queue")
      .select(`
        *,
        invoice:invoices(invoice_number, customer_name, total, vat_amount, date, items),
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
  }, []);

  // Subscribe to realtime updates for review queue
  useRealtimeSubscription({
    table: 'review_queue',
    queryKeys: [],
    onInsert: fetchReviews,
    onUpdate: fetchReviews,
    onDelete: fetchReviews,
  });

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  async function handleApprove(id: string) {
    const { error } = await supabase
      .from("review_queue")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      setReviews(reviews.filter(r => r.id !== id));
      setSelectedReview(null);
    }
  }

  async function handleReject(id: string) {
    const { error } = await supabase
      .from("review_queue")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      setReviews(reviews.filter(r => r.id !== id));
      setSelectedReview(null);
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
            <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-xs font-medium">
              <Radio className="h-3 w-3 animate-pulse" />
              Live
            </span>
          </div>
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
                      onClick={() => setSelectedReview(review)}
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

      {/* Detail Modal */}
      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Details</DialogTitle>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-6">
              {/* Invoice Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Number</p>
                  <p className="text-sm font-medium text-foreground">{selectedReview.invoice?.invoice_number || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="text-sm font-medium text-foreground">{selectedReview.invoice?.customer_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="text-sm font-medium text-foreground">₦{selectedReview.invoice?.total?.toLocaleString() || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">VAT Amount</p>
                  <p className="text-sm font-medium text-foreground">₦{selectedReview.invoice?.vat_amount?.toLocaleString() || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm font-medium text-foreground">
                    {selectedReview.invoice?.date ? new Date(selectedReview.invoice.date).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Business</p>
                  <p className="text-sm font-medium text-foreground">{selectedReview.user?.business_name || "—"}</p>
                </div>
              </div>

              {/* Risk Assessment */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Risk Assessment</p>
                <span className={`px-2 py-1 text-xs font-medium rounded border ${getRiskBadgeStyles(selectedReview.priority)}`}>
                  {selectedReview.priority.toUpperCase()} RISK (Score: {selectedReview.priority_score})
                </span>
              </div>

              {/* Reasons */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Flagged Reasons</p>
                <div className="space-y-2">
                  {selectedReview.reasons.map((reason, idx) => {
                    const taxRef = getTaxActReference(reason);
                    return (
                      <div key={idx} className="flex items-start gap-2 p-2 bg-muted/30 rounded">
                        <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground flex-1">{reason}</span>
                        {taxRef && (
                          <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                            NTA 2025 {taxRef}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI Notes */}
              {selectedReview.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">AI Recommendation</p>
                  <p className="text-sm text-foreground p-3 bg-muted/30 rounded">{selectedReview.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => handleReject(selectedReview.id)}
                  className="text-red-400 border-red-500/20 hover:bg-red-500/10"
                >
                  <X className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={() => handleApprove(selectedReview.id)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
