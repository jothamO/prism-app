import { useState, useEffect } from "react";
import {
    FileCode,
    RefreshCw,
    GitBranch,
    Check,
    Clock,
    AlertTriangle,
    History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface RuleVersion {
    id: string;
    rule_name: string;
    version: string;
    status: 'draft' | 'active' | 'deprecated';
    effective_date: string;
    expiry_date: string | null;
    created_by: string;
    created_at: string;
    changes_description: string;
}

const MOCK_RULES: RuleVersion[] = [
    {
        id: '1',
        rule_name: 'PAYE Tax Bands 2024',
        version: '2024.1.0',
        status: 'active',
        effective_date: '2024-01-01',
        expiry_date: null,
        created_by: 'System',
        created_at: '2023-12-15',
        changes_description: 'Updated tax bands per 2024 Finance Act'
    },
    {
        id: '2',
        rule_name: 'VAT Rate',
        version: '2020.1.0',
        status: 'active',
        effective_date: '2020-02-01',
        expiry_date: null,
        created_by: 'System',
        created_at: '2020-01-15',
        changes_description: 'VAT increased from 5% to 7.5%'
    },
    {
        id: '3',
        rule_name: 'Withholding Tax Rates',
        version: '2024.1.0',
        status: 'active',
        effective_date: '2024-01-01',
        expiry_date: null,
        created_by: 'System',
        created_at: '2023-12-20',
        changes_description: 'Updated WHT rates per new guidelines'
    },
    {
        id: '4',
        rule_name: 'EMTL Rules',
        version: '2024.2.0',
        status: 'active',
        effective_date: '2024-06-01',
        expiry_date: null,
        created_by: 'Admin',
        created_at: '2024-05-25',
        changes_description: 'Added exemption for own-account transfers'
    },
    {
        id: '5',
        rule_name: 'CIT Rates',
        version: '2024.1.0',
        status: 'active',
        effective_date: '2024-01-01',
        expiry_date: null,
        created_by: 'System',
        created_at: '2023-12-15',
        changes_description: 'Turnover-based tiered rates (0%, 20%, 30%)'
    },
];

export default function AdminRuleVersions() {
    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState<RuleVersion[]>([]);

    useEffect(() => {
        fetchRules();
    }, []);

    async function fetchRules() {
        setLoading(true);
        try {
            // Check if rule_versions table exists
            const { data, error } = await supabase
                .from('rule_versions')
                .select('*')
                .order('effective_date', { ascending: false });

            if (!error && data?.length > 0) {
                setRules(data);
            } else {
                // Use mock data for now
                setRules(MOCK_RULES);
            }
        } catch (error) {
            // Table may not exist, use mock data
            setRules(MOCK_RULES);
        } finally {
            setLoading(false);
        }
    }

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            active: 'bg-green-100 text-green-800',
            draft: 'bg-blue-100 text-blue-800',
            deprecated: 'bg-gray-100 text-gray-800',
        };
        const icons: Record<string, JSX.Element> = {
            active: <Check className="w-3 h-3" />,
            draft: <Clock className="w-3 h-3" />,
            deprecated: <AlertTriangle className="w-3 h-3" />,
        };
        return (
            <Badge className={`${styles[status] || styles.draft} gap-1`}>
                {icons[status]}
                {status}
            </Badge>
        );
    };

    const activeCount = rules.filter(r => r.status === 'active').length;
    const draftCount = rules.filter(r => r.status === 'draft').length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Rule Versions</h1>
                    <p className="text-muted-foreground">Tax rule version history and management</p>
                </div>
                <Button onClick={fetchRules} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
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
                            Draft
                        </CardDescription>
                        <CardTitle className="text-2xl text-blue-600">{draftCount}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Rules List */}
            <Card>
                <CardHeader>
                    <CardTitle>Tax Rule Registry</CardTitle>
                    <CardDescription>Version-controlled tax calculation rules</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="divide-y">
                            {rules.map((rule) => (
                                <div key={rule.id} className="py-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className="p-2 bg-primary/10 rounded-lg">
                                                <GitBranch className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{rule.rule_name}</span>
                                                    {getStatusBadge(rule.status)}
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                                    <span className="font-mono">{rule.version}</span>
                                                    <span>•</span>
                                                    <span>Effective: {new Date(rule.effective_date).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-2">
                                                    {rule.changes_description}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right text-xs text-muted-foreground">
                                            <div>Created by {rule.created_by}</div>
                                            <div>{new Date(rule.created_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Coming Soon */}
            <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                    <History className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Rule Comparison & Rollback Coming Soon</p>
                    <p className="text-sm mt-1">Compare versions and rollback to previous rules</p>
                </CardContent>
            </Card>
        </div>
    );
}
