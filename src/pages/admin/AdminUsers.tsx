import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
  RowSelectionState,
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
import { UserProfileModal } from "@/components/admin/UserProfileModal";
import { SendMessageModal } from "@/components/admin/SendMessageModal";
import { AddUserModal } from "@/components/admin/AddUserModal";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import { BulkConfirmModal } from "@/components/admin/BulkConfirmModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | "support" | "moderator";
  status: "active" | "suspended" | "pending";
  lastActive: string;
  platform: string;
  telegramId?: string | null;
  whatsappNumber?: string | null;
  authUserId?: string | null;
};

type BulkAction = "block" | "unblock" | "delete" | "assign_role";

const columnHelper = createColumnHelper<User>();

function UserActionMenu({ 
  user, 
  onAction 
}: { 
  user: User; 
  onAction: (action: string, user: User) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close menu on scroll or resize
  useEffect(() => {
    if (!open) return;
    const handleClose = () => setOpen(false);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    return () => {
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 180, // menu width ~180px
      });
    }
    setOpen(!open);
  };

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
    <>
      <button 
        ref={buttonRef}
        onClick={handleToggle}
        className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && createPortal(
        <div 
          ref={menuRef}
          className="fixed min-w-[180px] bg-card border border-border rounded-lg shadow-lg z-[9999]"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
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
        </div>,
        document.body
      )}
    </>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messageUser, setMessageUser] = useState<User | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Bulk action state
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkRoleValue, setBulkRoleValue] = useState<string | undefined>();
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      // Fetch web-registered users from profiles (single source of truth)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch bot session data to enrich profiles with connected channels
      const { data: botUsersData } = await supabase
        .from('users')
        .select(`
          id,
          whatsapp_number,
          telegram_id,
          telegram_username,
          onboarding_completed,
          is_blocked,
          updated_at,
          auth_user_id
        `);

      // Create a map of auth_user_id -> bot session data
      const botSessionMap = new Map<string, {
        telegramId?: string | null;
        whatsappNumber?: string | null;
        isBlocked?: boolean;
        botUserId?: string;
      }>();
      
      (botUsersData || []).forEach(u => {
        if (u.auth_user_id) {
          botSessionMap.set(u.auth_user_id, {
            telegramId: u.telegram_id,
            whatsappNumber: u.whatsapp_number,
            isBlocked: u.is_blocked,
            botUserId: u.id,
          });
        }
      });

      // Fetch all user roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      // Create role map - prioritize admin role if user has multiple
      const roleMap = new Map<string, "admin" | "user" | "support" | "moderator">();
      roles?.forEach(r => {
        const existingRole = roleMap.get(r.user_id);
        if (!existingRole || r.role === 'admin') {
          roleMap.set(r.user_id, r.role as "admin" | "user" | "support" | "moderator");
        }
      });

      // Map profiles with enriched bot session data
      const mappedUsers: User[] = (profilesData || []).map(p => {
        const botSession = botSessionMap.get(p.id);
        return {
          id: p.id,
          name: p.full_name || p.email || 'Unknown',
          email: p.email || '-',
          role: roleMap.get(p.id) || 'user',
          status: botSession?.isBlocked ? 'suspended' as const : 'active' as const,
          lastActive: p.updated_at ? formatRelativeTime(p.updated_at) : 'Never',
          platform: 'web',
          telegramId: botSession?.telegramId,
          whatsappNumber: botSession?.whatsappNumber,
          authUserId: p.id,
        };
      });

      setUsers(mappedUsers);
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
        setSelectedUser(user);
        break;
      
      case 'message':
        setMessageUser(user);
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
        setDeleteUser(user);
        break;
    }
  }

  async function executeDeleteUser() {
    if (!deleteUser) return;
    
    setDeleteLoading(true);
    try {
      // Use edge function for full cascade delete (handles both bot users and web profiles)
      const { data, error } = await supabase.functions.invoke('admin-bot-messaging', {
        body: {
          action: 'delete-user',
          userId: deleteUser.id,
        },
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || 'Delete failed');
      }

      // Also delete from profiles table if this is a web user or has auth_user_id
      if (deleteUser.platform === 'web') {
        await supabase.from('profiles').delete().eq('id', deleteUser.id);
        // Delete from user_roles as well
        await supabase.from('user_roles').delete().eq('user_id', deleteUser.id);
      } else if (deleteUser.authUserId) {
        await supabase.from('profiles').delete().eq('id', deleteUser.authUserId);
        await supabase.from('user_roles').delete().eq('user_id', deleteUser.authUserId);
      }
      
      toast({ title: "User Deleted", description: `${deleteUser.name} and all related data have been deleted` });
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to delete user", 
        variant: "destructive" 
      });
    } finally {
      setDeleteLoading(false);
      setDeleteUser(null);
    }
  }

  // Get selected users
  const selectedUserIds = Object.keys(rowSelection).filter(k => rowSelection[k]);
  const selectedUsers = users.filter((_, index) => rowSelection[index.toString()]);

  // Handle bulk actions
  function handleBulkAction(action: BulkAction, roleValue?: string) {
    setBulkAction(action);
    setBulkRoleValue(roleValue);
  }

  async function executeBulkAction() {
    if (!bulkAction || selectedUsers.length === 0) return;
    
    setBulkLoading(true);
    try {
      for (const user of selectedUsers) {
        switch (bulkAction) {
          case 'block':
            if (user.platform === 'web') {
              // Web users don't have is_blocked, skip or handle differently
            } else {
              await supabase
                .from('users')
                .update({ is_blocked: true, blocked_at: new Date().toISOString() })
                .eq('id', user.id);
            }
            break;
          
          case 'unblock':
            if (user.platform !== 'web') {
              await supabase
                .from('users')
                .update({ is_blocked: false, blocked_at: null })
                .eq('id', user.id);
            }
            break;
          
          case 'delete':
            // Use the delete logic
            try {
              await supabase.functions.invoke('admin-bot-messaging', {
                body: { action: 'delete-user', userId: user.id },
              });
              
              if (user.platform === 'web') {
                await supabase.from('profiles').delete().eq('id', user.id);
                await supabase.from('user_roles').delete().eq('user_id', user.id);
              } else if (user.authUserId) {
                await supabase.from('profiles').delete().eq('id', user.authUserId);
                await supabase.from('user_roles').delete().eq('user_id', user.authUserId);
              }
            } catch {
              // Continue with other users even if one fails
            }
            break;
          
          case 'assign_role':
            if (bulkRoleValue) {
              const targetUserId = user.platform === 'web' ? user.id : (user.authUserId || user.id);
              // Remove existing role of the same type and add new one
              await supabase
                .from('user_roles')
                .upsert({ user_id: targetUserId, role: bulkRoleValue }, { onConflict: 'user_id,role' });
            }
            break;
        }
      }

      // Log bulk action to audit_log
      await supabase.from('audit_log').insert({
        action: `bulk_${bulkAction}`,
        entity_type: 'users',
        new_values: { 
          affected_users: selectedUsers.map(u => u.id),
          role: bulkRoleValue 
        },
      });

      toast({ 
        title: "Bulk Action Complete", 
        description: `${bulkAction.replace('_', ' ')} applied to ${selectedUsers.length} users` 
      });
      
      setRowSelection({});
      fetchUsers();
    } catch (error) {
      console.error("Bulk action error:", error);
      toast({ title: "Error", description: "Some actions failed", variant: "destructive" });
    } finally {
      setBulkLoading(false);
      setBulkAction(null);
      setBulkRoleValue(undefined);
    }
  }

  const columns = [
    // Selection column
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="w-4 h-4 rounded border-border"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          className="w-4 h-4 rounded border-border"
        />
      ),
    }),
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
            role === "moderator" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
            role === "support" ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" :
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
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
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
    <>
    {selectedUser && (
      <UserProfileModal 
        userId={selectedUser.id}
        platform={selectedUser.platform}
        onClose={() => setSelectedUser(null)} 
      />
    )}
    {messageUser && (
      <SendMessageModal
        userId={messageUser.id}
        userName={messageUser.name}
        userPlatform={messageUser.platform}
        telegramId={messageUser.telegramId}
        whatsappNumber={messageUser.whatsappNumber}
        onClose={() => setMessageUser(null)}
      />
    )}
    {showAddModal && (
      <AddUserModal
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchUsers}
      />
    )}
    {bulkAction && (
      <BulkConfirmModal
        action={bulkAction}
        roleValue={bulkRoleValue}
        users={selectedUsers.map(u => ({ id: u.id, name: u.name, email: u.email }))}
        onConfirm={executeBulkAction}
        onCancel={() => {
          setBulkAction(null);
          setBulkRoleValue(undefined);
        }}
        loading={bulkLoading}
      />
    )}
    <BulkActionBar
      selectedCount={selectedUsers.length}
      onAction={handleBulkAction}
      onClear={() => setRowSelection({})}
    />
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
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl">
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
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr 
                    key={row.id} 
                    className={cn(
                      "hover:bg-accent/50 transition-colors",
                      row.getIsSelected() && "bg-primary/10"
                    )}
                  >
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
          <span>
            {selectedUsers.length > 0 
              ? `${selectedUsers.length} selected · ` 
              : ''
            }
            Showing {table.getRowModel().rows.length} of {users.length} users
          </span>
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

      {/* Delete User Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
        title="Delete User"
        description={`Are you sure you want to delete ${deleteUser?.name || 'this user'}? This will permanently remove all their data and cannot be undone.`}
        confirmText="Delete User"
        variant="destructive"
        onConfirm={executeDeleteUser}
        loading={deleteLoading}
      />
    </div>
    </>
  );
}