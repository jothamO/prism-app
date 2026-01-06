import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Trash2, Users, Building2, UserCheck, RefreshCw } from "lucide-react";

interface RelatedParty {
  id: string;
  user_id: string;
  party_name: string;
  party_tin: string | null;
  relationship_type: string;
  notes: string | null;
  created_at: string;
}

const RELATIONSHIP_TYPES = [
  { value: 'family', label: 'Family Member', icon: Users },
  { value: 'partner', label: 'Business Partner', icon: UserCheck },
  { value: 'controlled_entity', label: 'Controlled Entity', icon: Building2 },
  { value: 'trust', label: 'Trust/Foundation', icon: Building2 },
  { value: 'director', label: 'Director/Officer', icon: UserCheck },
  { value: 'shareholder', label: 'Shareholder (>20%)', icon: Users },
];

export default function AdminRelatedParties() {
  const { toast } = useToast();
  const [relatedParties, setRelatedParties] = useState<RelatedParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletePartyId, setDeletePartyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newParty, setNewParty] = useState({
    party_name: '',
    party_tin: '',
    relationship_type: 'family',
    notes: '',
  });

  useEffect(() => {
    fetchRelatedParties();
  }, []);

  const fetchRelatedParties = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('related_parties')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch related parties",
        variant: "destructive",
      });
    } else {
      setRelatedParties(data || []);
    }
    setLoading(false);
  };

  const handleAddParty = async () => {
    if (!newParty.party_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Party name is required",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from('related_parties')
      .insert({
        user_id: user.id,
        party_name: newParty.party_name.trim(),
        party_tin: newParty.party_tin.trim() || null,
        relationship_type: newParty.relationship_type,
        notes: newParty.notes.trim() || null,
      });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add related party",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Related party added successfully",
      });
      setNewParty({ party_name: '', party_tin: '', relationship_type: 'family', notes: '' });
      setShowAddForm(false);
      fetchRelatedParties();
    }
  };

  const handleDeleteParty = async () => {
    if (!deletePartyId) return;
    
    setDeleting(true);
    const { error } = await supabase
      .from('related_parties')
      .delete()
      .eq('id', deletePartyId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete related party",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Related party removed",
      });
      fetchRelatedParties();
    }
    setDeleting(false);
    setDeletePartyId(null);
  };

  const getRelationshipLabel = (type: string) => {
    return RELATIONSHIP_TYPES.find(r => r.value === type)?.label || type;
  };

  const getRelationshipIcon = (type: string) => {
    const RelIcon = RELATIONSHIP_TYPES.find(r => r.value === type)?.icon || Users;
    return <RelIcon className="w-4 h-4" />;
  };

  const partyToDelete = relatedParties.find(p => p.id === deletePartyId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Related Parties</h1>
          <p className="text-muted-foreground">
            Declare connected persons for automatic anti-avoidance detection (Section 191)
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Related Party
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletePartyId}
        onOpenChange={(open) => !open && setDeletePartyId(null)}
        title="Delete Related Party"
        description={`Are you sure you want to remove "${partyToDelete?.party_name}"? This will stop automatic detection for transactions with this party.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteParty}
        loading={deleting}
      />

      {showAddForm && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg">Add Related Party</CardTitle>
            <CardDescription>
              Transactions with these parties will be automatically flagged for arm's length review
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Party Name *</label>
                <Input
                  placeholder="e.g., ABC Holdings Ltd"
                  value={newParty.party_name}
                  onChange={(e) => setNewParty({ ...newParty, party_name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">TIN (Optional)</label>
                <Input
                  placeholder="Tax Identification Number"
                  value={newParty.party_tin}
                  onChange={(e) => setNewParty({ ...newParty, party_tin: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Relationship Type</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {RELATIONSHIP_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setNewParty({ ...newParty, relationship_type: type.value })}
                    className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                      newParty.relationship_type === type.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 text-muted-foreground'
                    }`}
                  >
                    <type.icon className="w-4 h-4" />
                    <span className="text-sm">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Notes (Optional)</label>
              <Input
                placeholder="Additional details about the relationship"
                value={newParty.notes}
                onChange={(e) => setNewParty({ ...newParty, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddParty}>Save Related Party</Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Declared Related Parties</CardTitle>
          <CardDescription>
            {relatedParties.length} connected {relatedParties.length === 1 ? 'party' : 'parties'} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : relatedParties.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No related parties declared yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Add connected persons to enable automatic anti-avoidance detection
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {relatedParties.map((party) => (
                <div
                  key={party.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      {getRelationshipIcon(party.relationship_type)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{party.party_name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                          {getRelationshipLabel(party.relationship_type)}
                        </span>
                        {party.party_tin && (
                          <span>TIN: {party.party_tin}</span>
                        )}
                      </div>
                      {party.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{party.notes}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeletePartyId(party.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">What is a Connected Person?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Under Section 191 of the Nigeria Tax Act, connected persons include:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                <li>Relatives (spouse, parent, child, sibling)</li>
                <li>Companies you control or have significant interest in (≥20%)</li>
                <li>Partners in a partnership</li>
                <li>Trustees of a trust where you're a beneficiary</li>
                <li>Directors or officers of companies you're associated with</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Transactions with connected persons must be at arm's length (market value).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
