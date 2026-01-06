import { useState, useEffect } from "react";
import {
    FileText,
    Building2,
    Scale,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Upload,
    RefreshCw,
    ChevronRight,
    BookOpen,
    Gavel,
    Search,
    Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ComplianceSearchPanel from "@/components/admin/ComplianceSearchPanel";
import ComplianceNotificationCenter from "@/components/admin/ComplianceNotificationCenter";

interface Stats {
    regulatoryBodies: number;
    activeDocuments: number;
    pendingReview: number;
    provisions: number;
    rules: number;
    recentChanges: number;
}

interface RegulatoryBody {
    id: string;
    abbreviation: string;
    name: string;
    document_count?: number;
}

interface RecentDocument {
    id: string;
    title: string;
    document_type: string;
    status: string;
    created_at: string;
}

export default function AdminCompliance() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<Stats>({
        regulatoryBodies: 0,
        activeDocuments: 0,
        pendingReview: 0,
        provisions: 0,
        rules: 0,
        recentChanges: 0,
    });
    const [regulatoryBodies, setRegulatoryBodies] = useState<RegulatoryBody[]>([]);
    const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
    const [activeTab, setActiveTab] = useState<"overview" | "search" | "notifications">("overview");
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
        getCurrentUser();
    }, []);

    async function getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);
    }

    async function fetchData() {
        setLoading(true);
        try {
            // Fetch regulatory bodies
            const { data: bodies, count: bodiesCount } = await supabase
                .from("regulatory_bodies")
                .select("id, abbreviation, name", { count: "exact" });

            // Fetch document stats
            const { count: activeDocsCount } = await supabase
                .from("legal_documents")
                .select("*", { count: "exact", head: true })
                .eq("status", "active");

            const { count: pendingCount } = await supabase
                .from("legal_documents")
                .select("*", { count: "exact", head: true })
                .eq("needs_human_review", true);

            // Fetch provisions count
            const { count: provisionsCount } = await supabase
                .from("legal_provisions")
                .select("*", { count: "exact", head: true });

            // Fetch rules count
            const { count: rulesCount } = await supabase
                .from("compliance_rules")
                .select("*", { count: "exact", head: true })
                .eq("is_active", true);

            // Fetch recent changes
            const { count: changesCount } = await supabase
                .from("compliance_change_log")
                .select("*", { count: "exact", head: true })
                .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

            // Fetch recent documents
            const { data: recentDocs } = await supabase
                .from("legal_documents")
                .select("id, title, document_type, status, created_at")
                .order("created_at", { ascending: false })
                .limit(5);

            setStats({
                regulatoryBodies: bodiesCount || 0,
                activeDocuments: activeDocsCount || 0,
                pendingReview: pendingCount || 0,
                provisions: provisionsCount || 0,
                rules: rulesCount || 0,
                recentChanges: changesCount || 0,
            });
            setRegulatoryBodies(bodies || []);
            setRecentDocuments(recentDocs || []);
        } catch (error) {
            console.error("Error fetching compliance data:", error);
        } finally {
            setLoading(false);
        }
    }

    const handleDocumentSelect = (documentId: string) => {
        window.location.href = `/admin/compliance/documents/${documentId}`;
    };

    const handleProvisionSelect = (provisionId: string, documentId: string) => {
        window.location.href = `/admin/compliance/documents/${documentId}?provision=${provisionId}`;
    };

    const statCards = [
        { label: "Active Regulations", value: stats.activeDocuments, icon: FileText, color: "text-blue-500" },
        { label: "Pending Review", value: stats.pendingReview, icon: Clock, color: "text-yellow-500" },
        { label: "Provisions", value: stats.provisions, icon: BookOpen, color: "text-purple-500" },
        { label: "Active Rules", value: stats.rules, icon: Gavel, color: "text-green-500" },
        { label: "Recent Changes", value: stats.recentChanges, icon: RefreshCw, color: "text-orange-500", subLabel: "Last 30 days" },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Compliance Knowledge Management</h1>
                    <p className="text-muted-foreground">Manage Nigerian tax laws and regulations for PRISM AI</p>
                </div>
                <button
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    onClick={() => window.location.href = "/admin/compliance/documents?action=new"}
                >
                    <Upload className="w-4 h-4" />
                    Add New Regulation
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-accent/50 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab("overview")}
                    className={cn(
                        "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                        activeTab === "overview"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab("search")}
                    className={cn(
                        "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                        activeTab === "search"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Search className="w-4 h-4" />
                    Semantic Search
                </button>
                <button
                    onClick={() => setActiveTab("notifications")}
                    className={cn(
                        "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                        activeTab === "notifications"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Bell className="w-4 h-4" />
                    Notifications
                </button>
            </div>

            {/* Search Tab */}
            {activeTab === "search" && (
                <ComplianceSearchPanel
                    onDocumentSelect={handleDocumentSelect}
                    onProvisionSelect={handleProvisionSelect}
                />
            )}

            {/* Notifications Tab */}
            {activeTab === "notifications" && currentUserId && (
                <ComplianceNotificationCenter userId={currentUserId} />
            )}

            {/* Overview Tab */}
            {activeTab === "overview" && (
                <>
                    {/* Urgent Actions */}
                    {stats.pendingReview > 0 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                <div className="flex-1">
                                    <p className="font-medium text-foreground">
                                        {stats.pendingReview} regulation{stats.pendingReview !== 1 ? "s" : ""} awaiting review
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Review and approve new regulations to activate them in PRISM
                                    </p>
                                </div>
                                <button
                                    className="px-3 py-1.5 bg-yellow-500/20 text-yellow-600 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm font-medium"
                                    onClick={() => window.location.href = "/admin/compliance/documents?filter=pending"}
                                >
                                    View Pending
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {statCards.map((stat) => (
                            <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <stat.icon className={cn("w-4 h-4", stat.color)} />
                                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                                </div>
                                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                                {stat.subLabel && <p className="text-xs text-muted-foreground mt-1">{stat.subLabel}</p>}
                            </div>
                        ))}
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Regulatory Bodies */}
                        <div className="bg-card border border-border rounded-lg">
                            <div className="p-4 border-b border-border">
                                <h2 className="font-semibold text-foreground flex items-center gap-2">
                                    <Building2 className="w-4 h-4" />
                                    Regulatory Bodies
                                </h2>
                            </div>
                            <div className="p-4 space-y-2">
                                {regulatoryBodies.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No regulatory bodies found. Run the migration to seed data.</p>
                                ) : (
                                    regulatoryBodies.map((body) => (
                                        <div
                                            key={body.id}
                                            className="flex items-center justify-between p-3 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                                            onClick={() => window.location.href = `/admin/compliance/documents?body=${body.abbreviation}`}
                                        >
                                            <div>
                                                <p className="font-medium text-foreground">{body.abbreviation}</p>
                                                <p className="text-sm text-muted-foreground">{body.name}</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Recent Documents */}
                        <div className="bg-card border border-border rounded-lg">
                            <div className="p-4 border-b border-border flex items-center justify-between">
                                <h2 className="font-semibold text-foreground flex items-center gap-2">
                                    <Scale className="w-4 h-4" />
                                    Recent Documents
                                </h2>
                                <button
                                    className="text-sm text-primary hover:underline"
                                    onClick={() => window.location.href = "/admin/compliance/documents"}
                                >
                                    View All
                                </button>
                            </div>
                            <div className="p-4 space-y-2">
                                {recentDocuments.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No documents yet. Upload your first regulation.</p>
                                ) : (
                                    recentDocuments.map((doc) => (
                                        <div
                                            key={doc.id}
                                            className="flex items-center justify-between p-3 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                                            onClick={() => window.location.href = `/admin/compliance/documents/${doc.id}`}
                                        >
                                            <div>
                                                <p className="font-medium text-foreground text-sm">{doc.title}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {doc.document_type} · {new Date(doc.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                                    doc.status === "active"
                                                        ? "bg-green-500/20 text-green-500"
                                                        : doc.status === "pending"
                                                            ? "bg-yellow-500/20 text-yellow-500"
                                                            : "bg-gray-500/20 text-gray-500"
                                                )}
                                            >
                                                {doc.status}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-card border border-border rounded-lg p-4">
                        <h2 className="font-semibold text-foreground mb-4">Quick Actions</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <button
                                className="flex items-center gap-2 p-3 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors text-left"
                                onClick={() => window.location.href = "/admin/compliance/documents"}
                            >
                                <FileText className="w-5 h-5 text-blue-500" />
                                <div>
                                    <p className="font-medium text-foreground text-sm">Documents</p>
                                    <p className="text-xs text-muted-foreground">Manage regulations</p>
                                </div>
                            </button>
                            <button
                                className="flex items-center gap-2 p-3 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors text-left"
                                onClick={() => setActiveTab("search")}
                            >
                                <Search className="w-5 h-5 text-purple-500" />
                                <div>
                                    <p className="font-medium text-foreground text-sm">Search</p>
                                    <p className="text-xs text-muted-foreground">Semantic search</p>
                                </div>
                            </button>
                            <button
                                className="flex items-center gap-2 p-3 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors text-left"
                                onClick={() => window.location.href = "/admin/compliance/rules"}
                            >
                                <Gavel className="w-5 h-5 text-green-500" />
                                <div>
                                    <p className="font-medium text-foreground text-sm">Rules</p>
                                    <p className="text-xs text-muted-foreground">AI-readable rules</p>
                                </div>
                            </button>
                            <button
                                className="flex items-center gap-2 p-3 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors text-left"
                                onClick={() => window.location.href = "/admin/compliance/changelog"}
                            >
                                <RefreshCw className="w-5 h-5 text-orange-500" />
                                <div>
                                    <p className="font-medium text-foreground text-sm">Change Log</p>
                                    <p className="text-xs text-muted-foreground">Track updates</p>
                                </div>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
