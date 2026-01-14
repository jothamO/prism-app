import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DeveloperAccessRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeveloperAccessRequestForm({
  open,
  onOpenChange,
  onSuccess,
}: DeveloperAccessRequestFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    company_website: "",
    technical_contact_name: "",
    technical_contact_email: "",
    use_case_description: "",
    expected_monthly_requests: "",
    target_api_tier: "starter",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.use_case_description.length < 50) {
      toast({
        title: "Use case too short",
        description: "Please provide at least 50 characters describing your use case.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user record
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (userError || !userData) throw new Error("User not found");

      const { error } = await supabase.from("developer_access_requests").insert({
        user_id: userData.id,
        company_name: formData.company_name || null,
        company_website: formData.company_website || null,
        technical_contact_name: formData.technical_contact_name || null,
        technical_contact_email: formData.technical_contact_email || null,
        use_case_description: formData.use_case_description,
        expected_monthly_requests: formData.expected_monthly_requests 
          ? parseInt(formData.expected_monthly_requests) 
          : null,
        target_api_tier: formData.target_api_tier,
      });

      if (error) throw error;

      toast({
        title: "Application submitted",
        description: "We'll review your request and get back to you soon.",
      });

      onSuccess?.();
    } catch (error: any) {
      console.error("Error submitting request:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit application",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply for Developer API Access</DialogTitle>
          <DialogDescription>
            Tell us about your use case to get access to the PRISM Tax API
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-foreground">Company Details</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  placeholder="Your company"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_website">Website</Label>
                <Input
                  id="company_website"
                  placeholder="https://example.com"
                  value={formData.company_website}
                  onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="technical_contact_name">Technical Contact</Label>
                <Input
                  id="technical_contact_name"
                  placeholder="Full name"
                  value={formData.technical_contact_name}
                  onChange={(e) => setFormData({ ...formData, technical_contact_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="technical_contact_email">Contact Email</Label>
                <Input
                  id="technical_contact_email"
                  type="email"
                  placeholder="dev@example.com"
                  value={formData.technical_contact_email}
                  onChange={(e) => setFormData({ ...formData, technical_contact_email: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-sm text-foreground">Use Case</h4>
            
            <div className="space-y-2">
              <Label htmlFor="use_case_description">
                Describe your use case <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="use_case_description"
                placeholder="Tell us how you plan to use the PRISM Tax API. What problems are you solving? What's your expected integration?"
                rows={4}
                value={formData.use_case_description}
                onChange={(e) => setFormData({ ...formData, use_case_description: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Minimum 50 characters ({formData.use_case_description.length}/50)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expected_monthly_requests">Expected Monthly Requests</Label>
                <Select
                  value={formData.expected_monthly_requests}
                  onValueChange={(value) => setFormData({ ...formData, expected_monthly_requests: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select volume" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1000">Less than 1,000</SelectItem>
                    <SelectItem value="10000">1,000 - 10,000</SelectItem>
                    <SelectItem value="100000">10,000 - 100,000</SelectItem>
                    <SelectItem value="500000">100,000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_api_tier">Target Tier</Label>
                <Select
                  value={formData.target_api_tier}
                  onValueChange={(value) => setFormData({ ...formData, target_api_tier: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Application
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
