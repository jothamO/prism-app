import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Settings,
  LogOut,
  MessageSquare,
  BarChart3,
  ShieldAlert,
  Smartphone,
  FlaskConical,
  Link2,
  Brain,
  FolderKanban,
  Bot,
  Activity,
  Sparkles,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  FileStack,
  ScrollText,
  Scale
} from "lucide-react";

interface NavGroup {
  name: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

interface NavItem {
  name: string;
  path: string;
  icon: typeof LayoutDashboard;
}

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("admin-sidebar-collapsed");
    return saved === "true";
  });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("admin-sidebar-groups");
    return saved ? JSON.parse(saved) : {
      "Main": true,
      "User Management": true,
      "Compliance": true,
      "AI & Learning": true,
      "Finance": true,
      "Communication": true,
      "Testing": false,
      "Settings": true
    };
  });

  useEffect(() => {
    localStorage.setItem("admin-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-groups", JSON.stringify(openGroups));
  }, [openGroups]);

  const navGroups: NavGroup[] = [
    {
      name: "Main",
      defaultOpen: true,
      items: [
        { name: "Dashboard", path: "/admin", icon: LayoutDashboard },
      ]
    },
    {
      name: "User Management",
      defaultOpen: true,
      items: [
        { name: "Users", path: "/admin/users", icon: Users },
        { name: "Tax Profiles", path: "/admin/profiles", icon: Users },
      ]
    },
    {
      name: "Compliance",
      defaultOpen: true,
      items: [
        { name: "Knowledge Base", path: "/admin/compliance", icon: Scale },
        { name: "Documents", path: "/admin/compliance/documents", icon: FileText },
        { name: "Rules", path: "/admin/compliance/rules", icon: Scale },
        { name: "Change Log", path: "/admin/compliance/changelog", icon: ScrollText },
        { name: "Review Queue", path: "/admin/reviews", icon: ShieldAlert },
        { name: "Related Parties", path: "/admin/related-parties", icon: Link2 },
        { name: "Filings", path: "/admin/filings", icon: FileText },
      ]
    },
    {
      name: "AI & Learning",
      defaultOpen: true,
      items: [
        { name: "ML Health", path: "/admin/ml-health", icon: Activity },
        { name: "AI Feedback", path: "/admin/feedback", icon: Brain },
        { name: "Patterns", path: "/admin/patterns", icon: Sparkles },
        { name: "Documents", path: "/admin/documents", icon: FileStack },
        { name: "System Logs", path: "/admin/logs", icon: ScrollText },
      ]
    },
    {
      name: "Finance",
      defaultOpen: true,
      items: [
        { name: "Invoices", path: "/admin/invoices", icon: FileText },
        { name: "Payments", path: "/admin/payments", icon: CreditCard },
        { name: "Analytics", path: "/admin/analytics", icon: BarChart3 },
      ]
    },
    {
      name: "Communication",
      defaultOpen: true,
      items: [
        { name: "Chatbots", path: "/admin/chatbots", icon: Bot },
        { name: "Messaging", path: "/admin/messaging", icon: MessageSquare },
      ]
    },
    {
      name: "Testing",
      defaultOpen: false,
      items: [
        { name: "Simulator", path: "/admin/simulator", icon: Smartphone },
        { name: "NLU Testing", path: "/admin/nlu-testing", icon: Brain },
        { name: "VAT Testing", path: "/admin/vat-testing", icon: FlaskConical },
        { name: "Classification", path: "/admin/classification-testing", icon: FlaskConical },
      ]
    },
    {
      name: "Settings",
      defaultOpen: true,
      items: [
        { name: "Settings", path: "/admin/settings", icon: Settings },
      ]
    },
  ];

  const toggleGroup = (groupName: string) => {
    setOpenGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const userInitial = user?.email?.charAt(0).toUpperCase() || 'A';

  // Find current page name
  const currentPageName = navGroups
    .flatMap(g => g.items)
    .find(i => i.path === location.pathname)?.name || "Dashboard";

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className={cn(
        "border-r border-border bg-card flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}>
        {/* Header */}
        <div className={cn(
          "p-4 border-b border-border flex items-center",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              PRISM Admin
            </h1>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navGroups.map((group) => {
            const isOpen = openGroups[group.name] ?? group.defaultOpen;
            const hasActiveItem = group.items.some(item => location.pathname === item.path);

            return (
              <div key={group.name} className="mb-2">
                {/* Group Header - Only show if not collapsed and more than one item */}
                {!collapsed && group.items.length > 1 && (
                  <button
                    onClick={() => toggleGroup(group.name)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors",
                      hasActiveItem ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span>{group.name}</span>
                    {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                )}

                {/* Group Items */}
                {(collapsed || isOpen || group.items.length === 1) && (
                  <div className={cn("space-y-1", !collapsed && group.items.length > 1 && "ml-2")}>
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          title={collapsed ? item.name : undefined}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                            collapsed && "justify-center"
                          )}
                        >
                          <item.icon className="w-5 h-5 flex-shrink-0" />
                          {!collapsed && <span className="truncate">{item.name}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-border">
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-3 px-3 py-2 w-full text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10",
              collapsed && "justify-center"
            )}
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
          <h2 className="text-lg font-medium text-foreground">{currentPageName}</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
              {userInitial}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-background">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
