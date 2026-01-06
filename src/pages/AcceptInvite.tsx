import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Users, Loader2, AlertCircle } from 'lucide-react';

interface InviteDetails {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedBy: string;
  invitedByEmail: string;
  createdAt: string;
}

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchInviteDetails();
    }
  }, [token]);

  const fetchInviteDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('team_members')
        .select(`
          id,
          email,
          role,
          status,
          created_at,
          invited_by,
          users!team_members_invited_by_fkey (
            full_name,
            email
          )
        `)
        .eq('invite_token', token)
        .single();

      if (fetchError || !data) {
        setError('Invalid or expired invitation link.');
        return;
      }

      if (data.status !== 'pending') {
        setError('This invitation has already been used or cancelled.');
        return;
      }

      const inviterData = data.users as { full_name: string | null; email: string | null } | null;

      setInvite({
        id: data.id,
        email: data.email,
        role: data.role,
        status: data.status,
        invitedBy: inviterData?.full_name || 'Unknown',
        invitedByEmail: inviterData?.email || '',
        createdAt: data.created_at,
      });
    } catch (err) {
      console.error('Error fetching invite:', err);
      setError('Failed to load invitation details.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!invite || !user) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to accept this invitation.',
        variant: 'destructive',
      });
      navigate('/auth', { state: { returnTo: `/invite/${token}` } });
      return;
    }

    try {
      setProcessing(true);

      // Update the team member record
      const { error: updateError } = await supabase
        .from('team_members')
        .update({
          user_id: user.id,
          status: 'active',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      if (updateError) throw updateError;

      // Log the activity
      await supabase.from('team_activity').insert({
        user_id: invite.invitedBy,
        actor_id: user.id,
        action: 'invite_accepted',
        details: { role: invite.role, email: invite.email },
      });

      toast({
        title: 'Invitation Accepted',
        description: `You have joined the team as ${invite.role}.`,
      });

      navigate('/dashboard');
    } catch (err) {
      console.error('Error accepting invite:', err);
      toast({
        title: 'Error',
        description: 'Failed to accept invitation. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!invite) return;

    try {
      setProcessing(true);

      const { error: updateError } = await supabase
        .from('team_members')
        .update({ status: 'declined' })
        .eq('id', invite.id);

      if (updateError) throw updateError;

      toast({
        title: 'Invitation Declined',
        description: 'You have declined the team invitation.',
      });

      navigate('/');
    } catch (err) {
      console.error('Error declining invite:', err);
      toast({
        title: 'Error',
        description: 'Failed to decline invitation. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatRole = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading invitation...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => navigate('/')}>Go to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto p-3 rounded-full bg-primary/10 w-fit mb-4">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Team Invitation</CardTitle>
          <CardDescription>
            You've been invited to join a team on PRISM
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Invited by</span>
              <span className="font-medium">{invite?.invitedBy}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Your role</span>
              <Badge variant="secondary">{formatRole(invite?.role || '')}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm">{invite?.email}</span>
            </div>
          </div>

          {!user && (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                You'll need to sign in or create an account to accept this invitation.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDecline}
              disabled={processing}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Decline
            </Button>
            <Button
              className="flex-1"
              onClick={handleAccept}
              disabled={processing}
            >
              {processing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Accept
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
