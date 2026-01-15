import { useState, useEffect } from "react";
import {
    FileCode,
    RefreshCw,
    GitBranch,
    Check,
    Clock,
    AlertTriangle,
    History,
    XCircle,
    Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface ComplianceRule {
    id: string;
    rule_name: string;
    rule_code: string | null;
    rule_type: string;
    version: number;
    is_active: boolean;
    effective_from: string;
    effective_to: string | null;
    created_at: string;
    description: string | null;
    sector: string | null;
}

type RuleStatus = 'active' | 'upcoming' | 'expired' | 'inactive';

export default function AdminRuleVersions() {
    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState<ComplianceRule[]>([]);
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [ruleTypes, setRuleTypes] = useState<string[]>([]);

    useEffect(() => {
        fetchRules();
    }, [typeFilter]);

    async function fetchRules() {
        setLoading(true);
        try {
            let query = supabase
                .from('compliance_rules')
                .select('id, rule_name, rule_code, rule_type, version, is_active, effective_from, effective_to, created_at, description, sector')
                .order('effective_from', { ascending: false });

            if (typeFilter !== 'all') {
                query = query.eq('rule_type', typeFilter);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching rules:', error);
                return;
            }

            setRules(data || []);

            // Extract unique rule types for filter
            if (typeFilter === 'all' && data) {
                const types = [...new Set(data.map(r => r.rule_type))];
                setRuleTypes(types);
            }
        } catch (error) {
            console.error('Failed to fetch rules:', error);
        } finally {
            setLoading(false);
        }
    }

    function getRuleStatus(rule: ComplianceRule): RuleStatus {
        const now = new Date();
        const effectiveFrom = new Date(rule.effective_from);
        const effectiveTo = rule.effective_to ? new Date(rule.effective_to) : null;

        if (!rule.is_active) return 'inactive';
        if (effectiveFrom > now) return 'upcoming';
        if (effectiveTo && effectiveTo < now) return 'expired';
        return 'active';
    }

    function getStatusBadge(status: RuleStatus) {
        const config: Record<RuleStatus, { style: string; icon: JSX.Element; label: string }> = {
            active: {
                style: 'bg-green-100 text-green-800',
                icon: <Check className="w-3 h-3" />,
                label: 'Active'
            },
            upcoming: {
                style: 'bg-blue-100 text-blue-800',
                icon: <Clock className="w-3 h-3" />,
                label: 'Upcoming'
            },
            expired: {
                style: 'bg-gray-100 text-gray-800',
                icon: <AlertTriangle className="w-3 h-3" />,
                label: 'Expired'
            },
            inactive: {
                style: 'bg-red-100 text-red-800',
                icon: <XCircle className="w-3 h-3" />,
                label: 'Inactive'
            },
        };
        const { style, icon, label } = config[status];
        return (
            <Badge className={`${style} gap-1`}>
                {icon}
                {label}
            </Badge>
        );
    }

    function getTypeBadge(ruleType: string) {
        const colors: Record<string, string> = {
            'tax_rate': 'bg-purple-100 text-purple-800',
            'threshold': 'bg-amber-100 text-amber-800',
            'deadline': 'bg-blue-100 text-blue-800',
            'relief': 'bg-green-100 text-green-800',
            'exemption': 'bg-teal-100 text-teal-800',
            'penalty': 'bg-red-100 text-red-800',
        };
        return (
            <Badge variant="outline" className={colors[ruleType] || 'bg-gray-100 text-gray-800'}>
                {ruleType.replace('_', ' ')}
            </Badge>
        );
    }

    // Calculate stats
    const activeCount = rules.filter(r => getRuleStatus(r) === 'active').length;
    const upcomingCount = rules.filter(r => getRuleStatus(r) === 'upcoming').length;
    const inactiveCount = rules.filter(r => getRuleStatus(r) === 'inactive').length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Compliance Rules</h1>
                    <p className="text-muted-foreground">Tax rules from the Central Rules Engine</p>
                </div>
                <Button onClick={fetchRules} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <FileCode className="w-4 h-4" />
                            Total Rules
                        </CardDescription>
                        <CardTitle className="text-2xl">{rules.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-500" />
                            Active
                        </CardDescription>
                        <CardTitle className="text-2xl text-green-600">{activeCount}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            Upcoming
                        </CardDescription>
                        <CardTitle className="text-2xl text-blue-600">{upcomingCount}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-500" />
                            Inactive
                        </CardDescription>
                        <CardTitle className="text-2xl text-red-600">{inactiveCount}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filter */}
            <div className="flex gap-4">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {ruleTypes.map(type => (
                            <SelectItem key={type} value={type}>
                                {type.replace('_', ' ')}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Rules List */}
            <Card>
                <CardHeader>
                    <CardTitle>Tax Rule Registry</CardTitle>
                    <CardDescription>Rules from compliance_rules table with effective dates</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                    ) : rules.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <FileCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No rules found</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {rules.map((rule) => {
                                const status = getRuleStatus(rule);
                                return (
                                    <div key={rule.id} className="py-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-primary/10 rounded-lg">
                                                    <GitBranch className="w-5 h-5 text-primary" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium">{rule.rule_name}</span>
                                                        {getStatusBadge(status)}
                                                        {getTypeBadge(rule.rule_type)}
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                                        {rule.rule_code && (
                                                            <>
                                                                <code className="bg-muted px-1 py-0.5 rounded text-xs">{rule.rule_code}</code>
                                                                <span>•</span>
                                                            </>
                                                        )}
                                                        <span>v{rule.version}</span>
                                                        <span>•</span>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            <span>
                                                                {new Date(rule.effective_from).toLocaleDateString()}
                                                                {rule.effective_to && (
                                                                    <> → {new Date(rule.effective_to).toLocaleDateString()}</>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {rule.description && (
                                                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                                            {rule.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right text-xs text-muted-foreground shrink-0">
                                                {rule.sector && (
                                                    <Badge variant="outline" className="mb-1">{rule.sector}</Badge>
                                                )}
                                                <div>Created {new Date(rule.created_at).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Coming Soon */}
            <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                    <History className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Version History & Diff Coming Soon</p>
                    <p className="text-sm mt-1">View change history and compare rule versions</p>
                </CardContent>
            </Card>
        </div>
    );
}
