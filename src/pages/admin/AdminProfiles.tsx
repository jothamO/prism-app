import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UserCircle,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  Shield,
  Clock,
  Brain,
  Edit,
  Save,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UserTaxProfile {
  id: string;
  user_id: string;
  user_type: string;
  employment_status: string | null;
  income_types: string[];
  is_pensioner: boolean;
  is_senior_citizen: boolean;
  is_disabled: boolean;
  has_diplomatic_immunity: boolean;
  industry_type: string | null;
  is_professional_services: boolean;
  ai_confidence: number | null;
  user_confirmed: boolean;
  created_at: string;
  updated_at: string;
  users?: {
    business_name: string;
    whatsapp_number: string;
    age: number | null;
  };
}

interface ProfileStats {
  total: number;
  confirmed: number;
  pensioners: number;
  seniorCitizens: number;
  diplomatic: number;
  avgConfidence: number;
}

export default function AdminProfiles() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<UserTaxProfile[]>([]);
  const [stats, setStats] = useState<ProfileStats>({
    total: 0,
    confirmed: 0,
    pensioners: 0,
    seniorCitizens: 0,
    diplomatic: 0,
    avgConfidence: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<UserTaxProfile>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_tax_profiles")
        .select(`
          *,
          users!user_tax_profiles_user_id_fkey (
            business_name,
            whatsapp_number,
            age
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const profileData = (data || []) as UserTaxProfile[];
      setProfiles(profileData);

      // Calculate stats
      const total = profileData.length;
      const confirmed = profileData.filter(p => p.user_confirmed).length;
      const pensioners = profileData.filter(p => p.is_pensioner).length;
      const seniorCitizens = profileData.filter(p => p.is_senior_citizen).length;
      const diplomatic = profileData.filter(p => p.has_diplomatic_immunity).length;
      const avgConfidence = total > 0
        ? profileData.reduce((sum, p) => sum + (Number(p.ai_confidence) || 0), 0) / total
        : 0;

      setStats({ total, confirmed, pensioners, seniorCitizens, diplomatic, avgConfidence });
    } catch (error) {
      console.error("Error fetching profiles:", error);
      toast({
        title: "Error",
        description: "Failed to fetch tax profiles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (profile: UserTaxProfile) => {
    setEditingId(profile.id);
    setEditForm({
      is_pensioner: profile.is_pensioner,
      is_senior_citizen: profile.is_senior_citizen,
      is_disabled: profile.is_disabled,
      has_diplomatic_immunity: profile.has_diplomatic_immunity,
      employment_status: profile.employment_status,
      user_confirmed: true
    });
  };

  const handleSave = async (profileId: string) => {
    try {
      const { error } = await supabase
        .from("user_tax_profiles")
        .update({
          ...editForm,
          user_confirmed: true,
          updated_at: new Date().toISOString()
        })
        .eq("id", profileId);

      if (error) throw error;

      toast({
        title: "Profile Updated",
        description: "Tax profile has been confirmed and saved"
      });

      setEditingId(null);
      setEditForm({});
      fetchProfiles();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive"
      });
    }
  };

  const handleConfirm = async (profileId: string) => {
    setConfirmingId(profileId);
    try {
      const { error } = await supabase
        .from("user_tax_profiles")
        .update({
          user_confirmed: true,
          updated_at: new Date().toISOString()
        })
        .eq("id", profileId);

      if (error) throw error;

      toast({
        title: "Profile Confirmed",
        description: "AI-detected profile has been confirmed"
      });

      fetchProfiles();
    } catch (error) {
      console.error("Error confirming profile:", error);
      toast({
        title: "Error",
        description: "Failed to confirm profile",
        variant: "destructive"
      });
    } finally {
      setConfirmingId(null);
    }
  };

  const filteredProfiles = profiles.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    return (
      p.users?.business_name?.toLowerCase().includes(searchLower) ||
      p.users?.whatsapp_number?.includes(searchLower) ||
      p.employment_status?.toLowerCase().includes(searchLower)
    );
  });

  const getConfidenceColor = (confidence: number | null) => {
    if (!confidence) return "text-muted-foreground";
    if (confidence >= 0.9) return "text-green-500";
    if (confidence >= 0.7) return "text-yellow-500";
    return "text-red-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Tax Profiles</h1>
          <p className="text-muted-foreground">Manage AI-detected tax profiles and exemptions</p>
        </div>
        <Button onClick={fetchProfiles} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Profiles</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-primary" />
              {stats.total}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Confirmed</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              {stats.confirmed}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pensioners</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              {stats.pensioners}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Senior Citizens</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-purple-500" />
              {stats.seniorCitizens}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Diplomatic</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              {stats.diplomatic}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI Confidence</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Brain className="w-5 h-5 text-cyan-500" />
              {(stats.avgConfidence * 100).toFixed(0)}%
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by business name or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Profiles Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Profiles</CardTitle>
          <CardDescription>View and manage user tax classification profiles</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredProfiles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-muted-foreground">User</th>
                    <th className="pb-3 font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 font-medium text-muted-foreground">Exemptions</th>
                    <th className="pb-3 font-medium text-muted-foreground">AI Confidence</th>
                    <th className="pb-3 font-medium text-muted-foreground">Confirmed</th>
                    <th className="pb-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((profile) => (
                    <tr key={profile.id} className="border-b border-border last:border-0">
                      <td className="py-3">
                        <div>
                          <p className="font-medium">{profile.users?.business_name || "N/A"}</p>
                          <p className="text-sm text-muted-foreground">{profile.users?.whatsapp_number}</p>
                          {profile.users?.age && (
                            <p className="text-xs text-muted-foreground">Age: {profile.users.age}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        {editingId === profile.id ? (
                          <select
                            value={editForm.employment_status || ""}
                            onChange={(e) => setEditForm({ ...editForm, employment_status: e.target.value })}
                            className="bg-background border border-border rounded px-2 py-1 text-sm"
                          >
                            <option value="">Select...</option>
                            <option value="salaried">Salaried</option>
                            <option value="self_employed">Self Employed</option>
                            <option value="retired">Retired</option>
                            <option value="unemployed">Unemployed</option>
                          </select>
                        ) : (
                          <span className="text-sm capitalize">
                            {profile.employment_status?.replace("_", " ") || "Unknown"}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        {editingId === profile.id ? (
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editForm.is_pensioner || false}
                                onChange={(e) => setEditForm({ ...editForm, is_pensioner: e.target.checked })}
                              />
                              Pensioner
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editForm.is_senior_citizen || false}
                                onChange={(e) => setEditForm({ ...editForm, is_senior_citizen: e.target.checked })}
                              />
                              Senior
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editForm.has_diplomatic_immunity || false}
                                onChange={(e) => setEditForm({ ...editForm, has_diplomatic_immunity: e.target.checked })}
                              />
                              Diplomatic
                            </label>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {profile.is_pensioner && (
                              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 text-xs rounded-full">
                                Pensioner
                              </span>
                            )}
                            {profile.is_senior_citizen && (
                              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-500 text-xs rounded-full">
                                Senior
                              </span>
                            )}
                            {profile.is_disabled && (
                              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-500 text-xs rounded-full">
                                Disabled
                              </span>
                            )}
                            {profile.has_diplomatic_immunity && (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-xs rounded-full">
                                Diplomatic
                              </span>
                            )}
                            {!profile.is_pensioner && !profile.is_senior_citizen && !profile.is_disabled && !profile.has_diplomatic_immunity && (
                              <span className="text-sm text-muted-foreground">None</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3">
                        <span className={`font-medium ${getConfidenceColor(profile.ai_confidence)}`}>
                          {profile.ai_confidence
                            ? `${(Number(profile.ai_confidence) * 100).toFixed(0)}%`
                            : "N/A"}
                        </span>
                      </td>
                      <td className="py-3">
                        {profile.user_confirmed ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-muted-foreground" />
                        )}
                      </td>
                      <td className="py-3">
                        {editingId === profile.id ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSave(profile.id)}
                            >
                              <Save className="w-3 h-3 mr-1" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(null);
                                setEditForm({});
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(profile)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            {!profile.user_confirmed && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleConfirm(profile.id)}
                                disabled={confirmingId === profile.id}
                              >
                                {confirmingId === profile.id ? (
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                )}
                                Confirm
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <UserCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No tax profiles found</p>
              <p className="text-sm">Profiles are created when users interact with the tax calculator</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}