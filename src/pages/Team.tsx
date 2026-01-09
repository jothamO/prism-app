import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users,
    UserPlus,
    Mail,
    Clock,
    CheckCircle2,
    XCircle,
    Copy,
    Loader2,
    Shield,
    Eye,
    Edit3,
    MoreVertical,
    Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TeamMember {
    id: string;
    member_email: string;
    member_user_id: string | null;
    role: 'owner' | 'admin' | 'member' | 'accountant';
    status: 'pending' | 'active' | 'revoked';
    invite_token: string | null;
    invited_at: string;
    accepted_at: string | null;
}

const ROLE_INFO = {
    owner: { label: 'Owner', color: 'bg-purple-100 text-purple-700', icon: Shield },
    admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700', icon: Edit3 },
    member: { label: 'Member', color: 'bg-green-100 text-green-700', icon: Eye },
    accountant: { label: 'Accountant', color: 'bg-amber-100 text-amber-700', icon: Eye },
};

export default function Team() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState(false);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'accountant'>('accountant');
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        fetchTeam();
    }, []);

    const fetchTeam = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('auth_user_id', user.id)
                .single();

            if (!userData) {
                setLoading(false);
                return;
            }

            setUserId(userData.id);

            const { data: members, error } = await supabase
                .from('team_members')
                .select('*')
                .eq('user_id', userData.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTeamMembers(members || []);

        } catch (error) {
            console.error('Error fetching team:', error);
        } finally {
            setLoading(false);
        }
    };

    const sendInvite = async () => {
        if (!inviteEmail || !inviteRole) return;

        setInviting(true);
        setInviteLink(null);

        try {
            const { data, error } = await supabase.functions.invoke('team-invite', {
                body: { email: inviteEmail, role: inviteRole },
            });

            if (error) throw error;

            if (data.inviteLink) {
                setInviteLink(data.inviteLink);
            }

            toast({
                title: data.emailSent ? 'Invitation Sent!' : 'Invite Created',
                description: data.message,
            });

            setInviteEmail('');
            fetchTeam();

        } catch (error) {
            console.error('Invite error:', error);
            toast({
                title: 'Error',
                description: 'Failed to send invitation',
                variant: 'destructive',
            });
        } finally {
            setInviting(false);
        }
    };

    const revokeAccess = async (memberId: string) => {
        try {
            const { error } = await supabase
                .from('team_members')
                .update({ status: 'revoked' })
                .eq('id', memberId);

            if (error) throw error;

            toast({
                title: 'Access Revoked',
                description: 'Team member access has been removed',
            });

            fetchTeam();
        } catch (error) {
            console.error('Revoke error:', error);
            toast({
                title: 'Error',
                description: 'Failed to revoke access',
                variant: 'destructive',
            });
        }
    };

    const copyInviteLink = async (link: string) => {
        try {
            await navigator.clipboard.writeText(link);
            toast({
                title: 'Link Copied',
                description: 'Invite link copied to clipboard',
            });
        } catch {
            toast({
                title: 'Copy Failed',
                description: 'Please copy the link manually',
                variant: 'destructive',
            });
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge className="bg-green-100 text-green-700">Active</Badge>;
            case 'pending':
                return <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>;
            case 'revoked':
                return <Badge className="bg-red-100 text-red-700">Revoked</Badge>;
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <Users className="h-8 w-8 text-indigo-600" />
                            <h1 className="text-xl font-bold text-gray-900">Team Management</h1>
                        </div>
                        <Button variant="outline" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                {/* Invite Form */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5" />
                            Invite Team Member
                        </CardTitle>
                        <CardDescription>
                            Add an accountant, admin, or team member to help manage your taxes
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1">
                                <Label htmlFor="email" className="sr-only">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="colleague@example.com"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                />
                            </div>
                            <Select value={inviteRole} onValueChange={(v: 'admin' | 'member' | 'accountant') => setInviteRole(v)}>
                                <SelectTrigger className="w-full sm:w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="accountant">Accountant</SelectItem>
                                    <SelectItem value="member">Member</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button onClick={sendInvite} disabled={inviting || !inviteEmail}>
                                {inviting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4 mr-2" />
                                )}
                                Invite
                            </Button>
                        </div>

                        {inviteLink && (
                            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <p className="text-sm text-green-800 font-medium mb-2">Invite link generated:</p>
                                <div className="flex gap-2">
                                    <Input value={inviteLink} readOnly className="text-xs" />
                                    <Button variant="outline" size="sm" onClick={() => copyInviteLink(inviteLink)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Role Permissions Guide */}
                        <div className="mt-4 pt-4 border-t">
                            <p className="text-sm text-gray-500 mb-2">Role permissions:</p>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="p-2 bg-amber-50 rounded">
                                    <strong className="text-amber-700">Accountant</strong>
                                    <p className="text-gray-600">View transactions, download reports, add notes</p>
                                </div>
                                <div className="p-2 bg-green-50 rounded">
                                    <strong className="text-green-700">Member</strong>
                                    <p className="text-gray-600">View & edit transactions, generate reports</p>
                                </div>
                                <div className="p-2 bg-blue-50 rounded">
                                    <strong className="text-blue-700">Admin</strong>
                                    <p className="text-gray-600">Full access except billing</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Team Members List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Team Members ({teamMembers.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {teamMembers.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>No team members yet</p>
                                <p className="text-sm">Invite an accountant or team member to get started</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Owner (You) */}
                                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center">
                                            <Shield className="h-5 w-5 text-purple-700" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">You (Owner)</p>
                                            <p className="text-sm text-gray-500">Full account access</p>
                                        </div>
                                    </div>
                                    <Badge className="bg-purple-100 text-purple-700">Owner</Badge>
                                </div>

                                {/* Team Members */}
                                {teamMembers.map((member) => {
                                    const roleInfo = ROLE_INFO[member.role];
                                    const RoleIcon = roleInfo?.icon || Eye;

                                    return (
                                        <div
                                            key={member.id}
                                            className={`flex items-center justify-between p-3 rounded-lg border ${member.status === 'revoked' ? 'bg-gray-50 opacity-60' : 'bg-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                                    <Mail className="h-5 w-5 text-gray-500" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900">{member.member_email}</p>
                                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                                        {member.status === 'pending' && (
                                                            <>
                                                                <Clock className="h-3 w-3" />
                                                                Invited {new Date(member.invited_at).toLocaleDateString()}
                                                            </>
                                                        )}
                                                        {member.status === 'active' && member.accepted_at && (
                                                            <>
                                                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                                                Joined {new Date(member.accepted_at).toLocaleDateString()}
                                                            </>
                                                        )}
                                                        {member.status === 'revoked' && (
                                                            <>
                                                                <XCircle className="h-3 w-3 text-red-500" />
                                                                Access revoked
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge className={roleInfo?.color || 'bg-gray-100'}>
                                                    {roleInfo?.label || member.role}
                                                </Badge>
                                                {getStatusBadge(member.status)}
                                                {member.status !== 'revoked' && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            {member.status === 'pending' && member.invite_token && (
                                                                <DropdownMenuItem
                                                                    onClick={() => copyInviteLink(`${window.location.origin}/invite/${member.invite_token}`)}
                                                                >
                                                                    <Copy className="h-4 w-4 mr-2" />
                                                                    Copy Invite Link
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem
                                                                onClick={() => revokeAccess(member.id)}
                                                                className="text-red-600"
                                                            >
                                                                <XCircle className="h-4 w-4 mr-2" />
                                                                Revoke Access
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
