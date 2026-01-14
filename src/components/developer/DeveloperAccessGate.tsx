import { useEffect, useState } from "react";
import { Code, Clock, XCircle, Loader2, ArrowRight, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { DeveloperAccessRequestForm } from "./DeveloperAccessRequestForm";

interface GateStatus {
  hasAccess: boolean;
  requestStatus: "none" | "pending" | "approved" | "rejected";
  rejectionReason?: string;
  companyName?: string;
  createdAt?: string;
}

interface DeveloperAccessGateProps {
  children: React.ReactNode;
}

export function DeveloperAccessGate({ children }: DeveloperAccessGateProps) {
  const [status, setStatus] = useState<GateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("id, has_developer_access")
        .eq("auth_user_id", user.id)
        .single();

      if (!userData) return;

      if (userData.has_developer_access) {
        setStatus({ hasAccess: true, requestStatus: "approved" });
        return;
      }

      const { data: requestData } = await supabase
        .from("developer_access_requests")
        .select("id, status, rejection_reason, company_name, created_at")
        .eq("user_id", userData.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (requestData) {
        setStatus({
          hasAccess: false,
          requestStatus: requestData.status as "pending" | "approved" | "rejected",
          rejectionReason: requestData.rejection_reason || undefined,
          companyName: requestData.company_name || undefined,
          createdAt: requestData.created_at,
        });
      } else {
        setStatus({ hasAccess: false, requestStatus: "none" });
      }
    } catch (error) {
      console.error("Error fetching developer access status:", error);
      setStatus({ hasAccess: false, requestStatus: "none" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // User has access - show the portal
  if (status?.hasAccess) {
    return <>{children}</>;
  }

  // User doesn't have access - show appropriate gate screen
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          {status?.requestStatus === "none" && (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Code className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Developer API Access</CardTitle>
              <CardDescription>
                Apply for access to integrate with the PRISM Tax API
              </CardDescription>
            </>
          )}

          {status?.requestStatus === "pending" && (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <CardTitle className="text-2xl">Application Under Review</CardTitle>
              <CardDescription>
                Your developer access request is being reviewed by our team
              </CardDescription>
            </>
          )}

          {status?.requestStatus === "rejected" && (
            <>
              <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-2xl">Application Not Approved</CardTitle>
              <CardDescription>
                Unfortunately, your request was not approved
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {status?.requestStatus === "none" && (
            <>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Submit Application</p>
                    <p className="text-sm text-muted-foreground">
                      Tell us about your company and use case
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Review Process</p>
                    <p className="text-sm text-muted-foreground">
                      Our team will review your application within 2-3 business days
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Get Access</p>
                    <p className="text-sm text-muted-foreground">
                      Once approved, create API keys and start integrating
                    </p>
                  </div>
                </div>
              </div>

              <Button className="w-full" size="lg" onClick={() => setShowRequestForm(true)}>
                Apply for Developer Access
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          {status?.requestStatus === "pending" && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                {status.companyName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{status.companyName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    Pending Review
                  </Badge>
                  {status.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      Submitted {new Date(status.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                We'll notify you via email once your application has been reviewed.
                This typically takes 2-3 business days.
              </p>
            </div>
          )}

          {status?.requestStatus === "rejected" && (
            <div className="space-y-4">
              {status.rejectionReason && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                    Reason:
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {status.rejectionReason}
                  </p>
                </div>
              )}
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setShowRequestForm(true)}
              >
                Submit New Application
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <DeveloperAccessRequestForm
        open={showRequestForm}
        onOpenChange={setShowRequestForm}
        onSuccess={() => {
          setShowRequestForm(false);
          fetchStatus();
        }}
      />
    </div>
  );
}
