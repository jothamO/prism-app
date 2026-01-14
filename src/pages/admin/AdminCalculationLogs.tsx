import { useState, useEffect } from "react";
import {
    Search,
    Filter,
    Download,
    RefreshCw,
    Calculator,
    User,
    Clock,
    ChevronDown,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface CalculationLog {
    id: string;
    user_id: string;
    api_key_id: string | null;
    tax_type: string;
    input: Record<string, any>;
    output: Record<string, any>;
    source: string;
    response_time_ms: number | null;
    created_at: string;
    users?: { email: string; full_name: string };
}

const TAX_TYPES = ['pit', 'cit', 'vat', 'wht', 'cgt', 'stamp', 'levy', 'metr'];
const SOURCES = ['web_chat', 'telegram', 'whatsapp', 'api', 'admin'];

export default function AdminCalculationLogs() {
    const [logs, setLogs] = useState<CalculationLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [taxTypeFilter, setTaxTypeFilter] = useState<string>("all");
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [stats, setStats] = useState({ total: 0, today: 0, avgTime: 0 });

    useEffect(() => {
        fetchLogs();
        fetchStats();
    }, [taxTypeFilter, sourceFilter]);

    async function fetchLogs() {
        setLoading(true);
        try {
            let query = supabase
                .from('calculation_logs')
                .select(`
                    *,
                    users:user_id (email, full_name)
                `)
                .order('created_at', { ascending: false })
                .limit(100);

            if (taxTypeFilter !== 'all') {
                query = query.eq('tax_type', taxTypeFilter);
            }
            if (sourceFilter !== 'all') {
                query = query.eq('source', sourceFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchStats() {
        try {
            const today = new Date().toISOString().split('T')[0];

            const { count: total } = await supabase
                .from('calculation_logs')
                .select('*', { count: 'exact', head: true });

            const { count: todayCount } = await supabase
                .from('calculation_logs')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', today);

            const { data: avgData } = await supabase
                .from('calculation_logs')
                .select('response_time_ms')
                .not('response_time_ms', 'is', null)
                .limit(1000);

            const avgTime = avgData?.length
                ? avgData.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / avgData.length
                : 0;

            setStats({
                total: total || 0,
                today: todayCount || 0,
                avgTime: Math.round(avgTime)
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

    function formatTaxType(type: string): string {
        const labels: Record<string, string> = {
            pit: 'Personal Income Tax',
            cit: 'Corporate Tax',
            vat: 'VAT',
            wht: 'Withholding Tax',
            cgt: 'Capital Gains',
            stamp: 'Stamp Duty',
            levy: 'Dev Levy',
            metr: 'Min ETR'
        };
        return labels[type] || type.toUpperCase();
    }

    function getSourceBadge(source: string) {
        const colors: Record<string, string> = {
            web_chat: 'bg-blue-100 text-blue-800',
            telegram: 'bg-cyan-100 text-cyan-800',
            whatsapp: 'bg-green-100 text-green-800',
            api: 'bg-purple-100 text-purple-800',
            admin: 'bg-gray-100 text-gray-800'
        };
        return <Badge className={colors[source] || 'bg-gray-100'}>{source}</Badge>;
    }

    const filteredLogs = logs.filter(log => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            log.users?.email?.toLowerCase().includes(term) ||
            log.tax_type.includes(term) ||
            JSON.stringify(log.input).toLowerCase().includes(term)
        );
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Calculation Logs</h1>
                    <p className="text-muted-foreground">Audit trail of all tax calculations</p>
                </div>
                <Button onClick={fetchLogs} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Calculations</CardDescription>
                        <CardTitle className="text-3xl">{stats.total.toLocaleString()}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Today</CardDescription>
                        <CardTitle className="text-3xl">{stats.today.toLocaleString()}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Avg Response Time</CardDescription>
                        <CardTitle className="text-3xl">{stats.avgTime}ms</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                    <Input
                        placeholder="Search by user, tax type, or input..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                    />
                </div>
                <Select value={taxTypeFilter} onValueChange={setTaxTypeFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Tax Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {TAX_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{formatTaxType(t)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        {SOURCES.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Logs Table */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No calculation logs found
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredLogs.map((log) => (
                                <div key={log.id} className="p-4">
                                    <div
                                        className="flex items-center justify-between cursor-pointer"
                                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                                    >
                                        <div className="flex items-center gap-4">
                                            {expandedId === log.id ? (
                                                <ChevronDown className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4" />
                                            )}
                                            <Calculator className="w-5 h-5 text-muted-foreground" />
                                            <div>
                                                <div className="font-medium">{formatTaxType(log.tax_type)}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {log.users?.email || 'Anonymous'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {getSourceBadge(log.source)}
                                            {log.response_time_ms && (
                                                <span className="text-sm text-muted-foreground">
                                                    {log.response_time_ms}ms
                                                </span>
                                            )}
                                            <span className="text-sm text-muted-foreground">
                                                {new Date(log.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    {expandedId === log.id && (
                                        <div className="mt-4 pl-12 grid grid-cols-2 gap-4">
                                            <div>
                                                <h4 className="text-sm font-medium mb-2">Input</h4>
                                                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">
                                                    {JSON.stringify(log.input, null, 2)}
                                                </pre>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-medium mb-2">Output</h4>
                                                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">
                                                    {JSON.stringify(log.output, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
