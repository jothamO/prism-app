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
    useApplyProposal,
    useGenerateProposals,
    useQueueStats,
    CodeProposal,
} from '@/hooks/useCodeProposals';
import {
    Code,
    CheckCircle,
    XCircle,
    Clock,
    Copy,
    FileCode,
    GitBranch,
    Zap,
    AlertTriangle,
    Database,
    MessageSquare,
    RefreshCw,
    Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const priorityColors = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    high: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    critical: 'bg-destructive/20 text-destructive',
};

const riskColors = {
    low: 'bg-green-500/20 text-green-700 dark:text-green-400',
    medium: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    high: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    critical: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

const changeTypeIcons = {
    db_only: Database,
    prompt_only: MessageSquare,
    code_and_db: Code,
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
    const { data: queueStats } = useQueueStats();
    const updateStatus = useUpdateProposalStatus();
    const applyProposal = useApplyProposal();
    const generateProposals = useGenerateProposals();
    const { toast } = useToast();

    const handleCopyCode = (code: string, filename: string) => {
        navigator.clipboard.writeText(typeof code === 'string' ? code : JSON.stringify(code, null, 2));
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

    const handleAutoApply = async (proposal: CodeProposal) => {
        try {
            const result = await applyProposal.mutateAsync({ proposalId: proposal.id });
            toast({
                title: 'Proposal Applied',
                description: result.result?.message || 'Successfully applied',
            });
            setSelectedProposal(null);
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to apply proposal',
                variant: 'destructive',
            });
        }
    };

    const handleGenerateProposals = async () => {
        try {
            const result = await generateProposals.mutateAsync();
            toast({
                title: 'Generation Complete',
                description: `Processed ${result.processed || 0} items, ${result.completed || 0} proposals created`,
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to generate proposals',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Code Change Proposals</h1>
                    <p className="text-muted-foreground">
                        AI-generated code suggestions when tax rules change
                    </p>
                </div>
                <Button
                    onClick={handleGenerateProposals}
                    disabled={generateProposals.isPending}
                >
                    {generateProposals.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Generate Proposals
                </Button>
            </div>

            {/* Queue Status */}
            {queueStats && (queueStats.pending > 0 || queueStats.processing > 0) && (
                <Card className="border-blue-500/50 bg-blue-500/10">
                    <CardContent className="py-3">
                        <div className="flex items-center gap-4">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                            <span>
                                Queue: {queueStats.pending} pending, {queueStats.processing} processing
                            </span>
                            <Button variant="outline" size="sm" onClick={handleGenerateProposals}>
                                Process Now
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Pending</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.pending || 0}</div>
                        {stats?.autoApplyEligible ? (
                            <p className="text-xs text-green-600">{stats.autoApplyEligible} auto-apply eligible</p>
                        ) : null}
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
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">By Risk</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-1 text-xs">
                            <Badge className={riskColors.low}>{stats?.byRisk?.low || 0}</Badge>
                            <Badge className={riskColors.medium}>{stats?.byRisk?.medium || 0}</Badge>
                            <Badge className={riskColors.high}>{stats?.byRisk?.high || 0}</Badge>
                            <Badge className={riskColors.critical}>{stats?.byRisk?.critical || 0}</Badge>
                        </div>
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
                        {filter === 'pending' && (
                            <Button variant="outline" className="mt-4" onClick={handleGenerateProposals}>
                                Generate from Queue
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {proposals?.map((proposal) => {
                        const StatusIcon = statusIcons[proposal.status];
                        const ChangeTypeIcon = changeTypeIcons[proposal.change_type] || Code;
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
                                            {proposal.auto_apply_eligible && proposal.status === 'pending' && (
                                                <Badge className="bg-green-500/20 text-green-700">
                                                    <Zap className="h-3 w-3 mr-1" />
                                                    Auto-Apply
                                                </Badge>
                                            )}
                                            <Badge className={riskColors[proposal.risk_level] || riskColors.medium}>
                                                {proposal.risk_level || 'medium'}
                                            </Badge>
                                            <Badge variant="outline" className="flex items-center gap-1">
                                                <ChangeTypeIcon className="h-3 w-3" />
                                                {proposal.change_type?.replace('_', ' ') || 'unknown'}
                                            </Badge>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <FileCode className="h-4 w-4" />
                                            {proposal.affected_files?.length || 0} file(s)
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
                                {/* Risk & Type Badges */}
                                <div className="flex gap-2">
                                    <Badge className={riskColors[selectedProposal.risk_level] || riskColors.medium}>
                                        Risk: {selectedProposal.risk_level || 'medium'}
                                    </Badge>
                                    <Badge variant="outline">
                                        Type: {selectedProposal.change_type?.replace('_', ' ') || 'unknown'}
                                    </Badge>
                                    {selectedProposal.auto_apply_eligible && (
                                        <Badge className="bg-green-500/20 text-green-700">
                                            <Zap className="h-3 w-3 mr-1" />
                                            Auto-Apply Eligible
                                        </Badge>
                                    )}
                                </div>

                                {/* DB-Only Notice */}
                                {selectedProposal.change_type === 'db_only' && (
                                    <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3">
                                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                            <Database className="h-5 w-5" />
                                            <span className="font-medium">Database-Only Change</span>
                                        </div>
                                        <p className="text-sm mt-1 text-muted-foreground">
                                            No code changes required. Values are read from compliance_rules table at runtime via rules-client.ts.
                                        </p>
                                    </div>
                                )}

                                {/* Affected Files */}
                                <div>
                                    <h4 className="font-medium mb-2">Affected Files</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedProposal.affected_files?.map((file) => (
                                            <Badge key={file} variant="secondary">
                                                <FileCode className="h-3 w-3 mr-1" />
                                                {file}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                {/* Code Diff or Changes */}
                                <div>
                                    <h4 className="font-medium mb-2">Changes</h4>
                                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-64">
                                        <code>
                                            {JSON.stringify(selectedProposal.code_diff, null, 2)}
                                        </code>
                                    </pre>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="mt-2"
                                        onClick={() =>
                                            handleCopyCode(
                                                JSON.stringify(selectedProposal.code_diff, null, 2),
                                                'changes.json'
                                            )
                                        }
                                    >
                                        <Copy className="h-4 w-4 mr-1" />
                                        Copy JSON
                                    </Button>
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
                                        {selectedProposal.auto_apply_eligible && (
                                            <Button
                                                variant="outline"
                                                className="border-green-500 text-green-700 hover:bg-green-500/10"
                                                onClick={() => handleAutoApply(selectedProposal)}
                                                disabled={applyProposal.isPending}
                                            >
                                                {applyProposal.isPending ? (
                                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                ) : (
                                                    <Zap className="h-4 w-4 mr-1" />
                                                )}
                                                Auto-Apply
                                            </Button>
                                        )}
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
                                    <div className="flex justify-end gap-2">
                                        {selectedProposal.auto_apply_eligible && (
                                            <Button
                                                variant="outline"
                                                className="border-green-500 text-green-700 hover:bg-green-500/10"
                                                onClick={() => handleAutoApply(selectedProposal)}
                                                disabled={applyProposal.isPending}
                                            >
                                                {applyProposal.isPending ? (
                                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                ) : (
                                                    <Zap className="h-4 w-4 mr-1" />
                                                )}
                                                Apply Now
                                            </Button>
                                        )}
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
