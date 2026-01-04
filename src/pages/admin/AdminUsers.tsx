import { useState, useEffect, useRef } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel
} from "@tanstack/react-table";
import { 
  Search, 
  MoreHorizontal, 
  ArrowUpDown, 
  UserPlus, 
  Ban, 
  CheckCircle, 
  Clock,
  Eye,
  RefreshCw,
  Trash2,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | "support";
  status: "active" | "suspended" | "pending";
  lastActive: string;
  platform: string;
};

const columnHelper = createColumnHelper<User>();

function UserActionMenu({ 
  user, 
  onAction 
}: { 
  user: User; 
  onAction: (action: string, user: User) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const actions = [
    { label: "View Profile", icon: Eye, action: "view" },
    { label: "Send Message", icon: MessageSquare, action: "message" },
    { label: "Reset Onboarding", icon: RefreshCw, action: "reset-onboarding" },
    { 
      label: user.status === "suspended" ? "Unblock User" : "Block User", 
      icon: Ban, 
      action: "toggle-block" 
    },
    { label: "Delete User", icon: Trash2, action: "delete", danger: true }
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setOpen(!open)}
        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50">
          {actions.map((item) => (
            <button
              key={item.action}
              onClick={() => {
                onAction(item.action, user);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-accent first:rounded-t-lg last:rounded-b-lg",
                item.danger && "text-red-500 hover:text-red-400"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          first_name,
          last_name,
          email,
          whatsapp_number,
          telegram_id,
          telegram_username,
          platform,
          onboarding_completed,
          is_blocked,
          subscription_tier,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Also check user_roles for admin status
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

      setUsers(
        (data || []).map(u => ({
          id: u.id,
          name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.telegram_username || u.whatsapp_number || 'Unknown',
          email: u.email || u.whatsapp_number || u.telegram_id || '-',
          role: (roleMap.get(u.id) as "admin" | "user" | "support") || 'user',
          status: u.is_blocked ? 'suspended' as const : (u.onboarding_completed ? 'active' as const : 'pending' as const),
          lastActive: u.updated_at ? formatRelativeTime(u.updated_at) : 'Never',
          platform: u.platform || 'unknown'
        }))
      );
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ title: "Error", description: "Failed to fetch users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  }

  async function handleUserAction(action: string, user: User) {
    switch (action) {
      case 'view':
        toast({ title: "View Profile", description: `Viewing ${user.name}'s profile` });
        // TODO: Open profile modal
        break;
      
      case 'message':
        toast({ title: "Send Message", description: `Opening message dialog for ${user.name}` });
        // TODO: Open message dialog
        break;
      
      case 'toggle-block':
        try {
          const newBlockedStatus = user.status !== 'suspended';
          await supabase
            .from('users')
            .update({ 
              is_blocked: newBlockedStatus,
              blocked_at: newBlockedStatus ? new Date().toISOString() : null
            })
            .eq('id', user.id);
          
          toast({ 
            title: newBlockedStatus ? "User Blocked" : "User Unblocked", 
            description: `${user.name} has been ${newBlockedStatus ? 'blocked' : 'unblocked'}` 
          });
          fetchUsers();
        } catch (error) {
          console.error("Error toggling block status:", error);
          toast({ title: "Error", description: "Failed to update user", variant: "destructive" });
        }
        break;
      
      case 'reset-onboarding':
        try {
          // Reset user's onboarding status
          await supabase
            .from('users')
            .update({ 
              onboarding_completed: false,
              onboarding_step: 1 
            })
            .eq('id', user.id);
          
          // Delete onboarding progress
          await supabase
            .from('onboarding_progress')
            .delete()
            .eq('user_id', user.id);
          
          // Clear chatbot session
          await supabase
            .from('chatbot_sessions')
            .delete()
            .eq('user_id', user.id);
          
          toast({ 
            title: "Onboarding Reset", 
            description: `${user.name}'s onboarding has been reset` 
          });
          fetchUsers();
        } catch (error) {
          console.error("Error resetting onboarding:", error);
          toast({ title: "Error", description: "Failed to reset onboarding", variant: "destructive" });
        }
        break;
      
      case 'delete':
        if (confirm(`Are you sure you want to delete ${user.name}? This cannot be undone.`)) {
          try {
            await supabase
              .from('users')
              .delete()
              .eq('id', user.id);
            
            toast({ title: "User Deleted", description: `${user.name} has been deleted` });
            fetchUsers();
          } catch (error) {
            console.error("Error deleting user:", error);
            toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
          }
        }
        break;
    }
  }

  const columns = [
    columnHelper.accessor("name", {
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Name <ArrowUpDown className="w-4 h-4" />
        </button>
      ),
      cell: (info) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-muted-foreground">
            {info.getValue().charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="font-medium text-foreground block">{info.getValue()}</span>
            <span className="text-xs text-muted-foreground capitalize">{info.row.original.platform}</span>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor("email", {
      header: "Contact",
      cell: (info) => <span className="text-muted-foreground text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor("role", {
      header: "Role",
      cell: (info) => {
        const role = info.getValue();
        return (
          <span className={cn("px-2 py-1 rounded-full text-xs font-medium border",
            role === "admin" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
            role === "support" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
            "bg-accent text-muted-foreground border-border"
          )}>{role}</span>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();
        return (
          <div className="flex items-center gap-2">
            {status === "active" && <CheckCircle className="w-4 h-4 text-green-500" />}
            {status === "suspended" && <Ban className="w-4 h-4 text-red-500" />}
            {status === "pending" && <Clock className="w-4 h-4 text-yellow-500" />}
            <span className={cn("capitalize text-sm",
              status === "active" ? "text-green-400" : status === "suspended" ? "text-red-400" : "text-yellow-400"
            )}>{status}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("lastActive", {
      header: "Last Active",
      cell: (info) => <span className="text-muted-foreground text-sm">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => (
        <UserActionMenu user={row.original} onAction={handleUserAction} />
      ),
    }),
  ];

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage system users and permissions</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchUsers}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5 text-muted-foreground" />
          </button>
          <button className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
            <UserPlus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search users..."
              className="w-full bg-background border border-border rounded-lg py-2 pl-9 pr-4 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-accent/50 text-muted-foreground text-sm font-medium">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-6 py-3 border-b border-border">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-accent/50 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-6 py-4 text-sm">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {table.getRowModel().rows.length} of {users.length} users</span>
          <div className="flex items-center gap-2">
            <button 
              className="px-3 py-1 border border-border rounded hover:bg-accent disabled:opacity-50" 
              onClick={() => table.previousPage()} 
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </button>
            <button 
              className="px-3 py-1 border border-border rounded hover:bg-accent disabled:opacity-50" 
              onClick={() => table.nextPage()} 
              disabled={!table.getCanNextPage()}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}