import { Clock, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function AwaitingApproval() {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/auth");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto">
          <Clock className="w-10 h-10 text-amber-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Account Pending Approval
          </h1>
          <p className="text-muted-foreground">
            Your account is awaiting admin approval. You'll receive a notification
            once your access is confirmed.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 text-left">
          <h3 className="font-medium text-foreground mb-2">What happens next?</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              An administrator will review your registration
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              You'll be notified via email when approved
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              Once approved, you can access all PRISM features
            </li>
          </ul>
        </div>

        <div className="pt-4">
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
