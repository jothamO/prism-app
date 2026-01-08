import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    useCodeProposals,
    useUpdateProposalStatus,
    useProposalStats,
    CodeProposal,
} from '@/hooks/useCodeProposals';
import {
    Code,
    CheckCircle,
    XCircle,
    Clock,
    AlertTriangle,
    Copy,
    FileCode,
    GitBranch,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const priorityColors = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    high: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    critical: 'bg-destructive/20 text-destructive',
};

const statusIcons = {
    pending: Clock,
    approved: CheckCircle,
    rejected: XCircle,
    implemented: GitBranch,
};

export default function AdminCodeProposals() {
    const [filter, setFilter] = useState<string>('pending');
    const [selectedProposal, setSelectedProposal] = useState<CodeProposal | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');

    const { data: proposals, isLoading } = useCodeProposals(filter === 'all' ? undefined : filter);
    const { data: stats } = useProposalStats();
    const updateStatus = useUpdateProposalStatus();
    const { toast } = useToast();

    const handleCopyCode = (code: string, filename: string) => {
        navigator.clipboard.writeText(code);
        toast({
            title: 'Code copied',
            description: `Code for ${filename} copied to clipboard`,
        });
    };

    const handleStatusUpdate = async (status: 'approved' | 'rejected' | 'implemented') => {
        if (!selectedProposal) return;

        try {
            await updateStatus.mutateAsync({
                id: selectedProposal.id,
                status,
                notes: reviewNotes,
            });
            toast({
                title: 'Proposal updated',
                description: `Proposal marked as ${status}`,
            });
            setSelectedProposal(null);
            setReviewNotes('');
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to update proposal',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Code Change Proposals</h1>
                <p className="text-muted-foreground">
                    AI-generated code suggestions when tax rules change
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Pending</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.pending || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Approved</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.approved || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Implemented</CardTitle>
                        <GitBranch className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.implemented || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Rejected</CardTitle>
                        <XCircle className="h-4 w-4 text-destructive" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.rejected || 0}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
                {['pending', 'approved', 'implemented', 'rejected', 'all'].map((status) => (
                    <Button
                        key={status}
                        variant={filter === status ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter(status)}
                    >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                ))}
            </div>

            {/* Proposals List */}
            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading proposals...</div>
            ) : proposals?.length === 0 ? (
                <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                        <Code className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p>No {filter !== 'all' ? filter : ''} proposals found</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {proposals?.map((proposal) => {
                        const StatusIcon = statusIcons[proposal.status];
                        return (
                            <Card
                                key={proposal.id}
                                className="cursor-pointer hover:border-primary/50 transition-colors"
                                onClick={() => setSelectedProposal(proposal)}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                <StatusIcon className="h-5 w-5" />
                                                {proposal.title}
                                            </CardTitle>
                                            <CardDescription>{proposal.description}</CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge className={priorityColors[proposal.priority]}>
                                                {proposal.priority}
                                            </Badge>
                                            <Badge variant="outline">{proposal.status}</Badge>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <FileCode className="h-4 w-4" />
                                            {proposal.affected_files.length} file(s)
                                        </span>
                                        <span>
                                            Generated:{' '}
                                            {new Date(proposal.created_at).toLocaleDateString()}
                                        </span>
                                        {proposal.generated_by && (
                                            <span>By: {proposal.generated_by}</span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Detail Dialog */}
            <Dialog open={!!selectedProposal} onOpenChange={() => setSelectedProposal(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    {selectedProposal && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Code className="h-5 w-5" />
                                    {selectedProposal.title}
                                </DialogTitle>
                                <DialogDescription>
                                    {selectedProposal.description}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                {/* Affected Files */}
                                <div>
                                    <h4 className="font-medium mb-2">Affected Files</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedProposal.affected_files.map((file) => (
                                            <Badge key={file} variant="secondary">
                                                <FileCode className="h-3 w-3 mr-1" />
                                                {file}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                {/* Code Diffs */}
                                <div>
                                    <h4 className="font-medium mb-2">Code Changes</h4>
                                    {Object.entries(selectedProposal.code_diff).map(
                                        ([filename, diff]) => (
                                            <div key={filename} className="mb-4">
                                                <div className="flex items-center justify-between bg-muted px-3 py-2 rounded-t-md">
                                                    <span className="font-mono text-sm">
                                                        {filename}
                                                    </span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() =>
                                                            handleCopyCode(diff.after, filename)
                                                        }
                                                    >
                                                        <Copy className="h-4 w-4 mr-1" />
                                                        Copy New
                                                    </Button>
                                                </div>
                                                <div className="grid md:grid-cols-2 gap-2 p-2 bg-card border rounded-b-md">
                                                    <div>
                                                        <p className="text-xs text-muted-foreground mb-1">
                                                            Before
                                                        </p>
                                                        <pre className="text-xs bg-destructive/10 p-2 rounded overflow-x-auto max-h-48">
                                                            <code>{diff.before}</code>
                                                        </pre>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-muted-foreground mb-1">
                                                            After
                                                        </p>
                                                        <pre className="text-xs bg-green-500/10 p-2 rounded overflow-x-auto max-h-48">
                                                            <code>{diff.after}</code>
                                                        </pre>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>

                                {/* Review Notes */}
                                {selectedProposal.status === 'pending' && (
                                    <div>
                                        <h4 className="font-medium mb-2">Review Notes</h4>
                                        <Textarea
                                            placeholder="Add notes about this proposal..."
                                            value={reviewNotes}
                                            onChange={(e) => setReviewNotes(e.target.value)}
                                        />
                                    </div>
                                )}

                                {/* Existing Notes */}
                                {selectedProposal.notes && (
                                    <div className="bg-muted p-3 rounded-md">
                                        <h4 className="font-medium mb-1">Notes</h4>
                                        <p className="text-sm">{selectedProposal.notes}</p>
                                    </div>
                                )}

                                {/* Actions */}
                                {selectedProposal.status === 'pending' && (
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="destructive"
                                            onClick={() => handleStatusUpdate('rejected')}
                                            disabled={updateStatus.isPending}
                                        >
                                            <XCircle className="h-4 w-4 mr-1" />
                                            Reject
                                        </Button>
                                        <Button
                                            variant="default"
                                            onClick={() => handleStatusUpdate('approved')}
                                            disabled={updateStatus.isPending}
                                        >
                                            <CheckCircle className="h-4 w-4 mr-1" />
                                            Approve
                                        </Button>
                                    </div>
                                )}

                                {selectedProposal.status === 'approved' && (
                                    <div className="flex justify-end">
                                        <Button
                                            onClick={() => handleStatusUpdate('implemented')}
                                            disabled={updateStatus.isPending}
                                        >
                                            <GitBranch className="h-4 w-4 mr-1" />
                                            Mark as Implemented
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
