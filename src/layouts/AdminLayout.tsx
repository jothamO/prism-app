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
  Link2
} from "lucide-react";

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const navItems = [
    { name: "Dashboard", path: "/admin", icon: LayoutDashboard },
    { name: "Users", path: "/admin/users", icon: Users },
    { name: "Review Queue", path: "/admin/reviews", icon: ShieldAlert },
    { name: "Related Parties", path: "/admin/related-parties", icon: Link2 },
    { name: "Filings", path: "/admin/filings", icon: FileText },
    { name: "Invoices", path: "/admin/invoices", icon: FileText },
    { name: "Analytics", path: "/admin/analytics", icon: BarChart3 },
    { name: "Messaging", path: "/admin/messaging", icon: MessageSquare },
    { name: "Payments", path: "/admin/payments", icon: CreditCard },
    { name: "Simulator", path: "/admin/simulator", icon: Smartphone },
    { name: "VAT Testing", path: "/admin/vat-testing", icon: FlaskConical },
    { name: "Settings", path: "/admin/settings", icon: Settings },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const userInitial = user?.email?.charAt(0).toUpperCase() || 'A';

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            PRISM Admin
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
          <h2 className="text-lg font-medium text-foreground">
            {navItems.find(i => i.path === location.pathname)?.name || "Dashboard"}
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
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
