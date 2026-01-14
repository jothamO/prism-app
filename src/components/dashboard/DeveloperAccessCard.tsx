import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Code, Clock, CheckCircle, XCircle, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { DeveloperAccessRequestForm } from "@/components/developer/DeveloperAccessRequestForm";

interface DeveloperAccessStatus {
  hasAccess: boolean;
  requestStatus: "none" | "pending" | "approved" | "rejected";
  rejectionReason?: string;
  requestId?: string;
}

export function DeveloperAccessCard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DeveloperAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user record
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

      // Check for pending/rejected requests
      const { data: requestData } = await supabase
        .from("developer_access_requests")
        .select("id, status, rejection_reason")
        .eq("user_id", userData.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (requestData) {
        setStatus({
          hasAccess: false,
          requestStatus: requestData.status as "pending" | "approved" | "rejected",
          rejectionReason: requestData.rejection_reason || undefined,
          requestId: requestData.id,
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
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const statusConfig = {
    none: {
      icon: <Code className="h-5 w-5 text-muted-foreground" />,
      badge: null,
      title: "Developer API Access",
      description: "Build integrations with the PRISM Tax API",
    },
    pending: {
      icon: <Clock className="h-5 w-5 text-amber-500" />,
      badge: <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Pending Review</Badge>,
      title: "Application Pending",
      description: "Your developer access request is being reviewed",
    },
    approved: {
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      badge: <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Approved</Badge>,
      title: "Developer Access Active",
      description: "You have full access to the Developer Portal",
    },
    rejected: {
      icon: <XCircle className="h-5 w-5 text-red-500" />,
      badge: <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Rejected</Badge>,
      title: "Application Rejected",
      description: status.rejectionReason || "Your request was not approved",
    },
  };

  const config = statusConfig[status.requestStatus];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              {config.icon}
              {config.title}
            </CardTitle>
            {config.badge}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{config.description}</p>
          
          {status.requestStatus === "none" && (
            <Button className="w-full" onClick={() => setShowRequestForm(true)}>
              Apply for Developer Access
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          
          {status.requestStatus === "pending" && (
            <div className="text-center py-2">
              <p className="text-xs text-muted-foreground">
                We'll notify you once your application is reviewed
              </p>
            </div>
          )}
          
          {status.requestStatus === "approved" && (
            <Button className="w-full" onClick={() => navigate("/developers")}>
              Open Developer Portal
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          
          {status.requestStatus === "rejected" && (
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => setShowRequestForm(true)}
            >
              Submit New Application
            </Button>
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
    </>
  );
}
