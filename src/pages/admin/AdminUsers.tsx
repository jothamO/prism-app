import { useState } from "react";
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
    Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

type User = {
    id: string;
    name: string;
    email: string;
    role: "admin" | "user" | "support";
    status: "active" | "suspended" | "pending";
    joinedDate: string;
    lastActive: string;
};

const MOCK_USERS: User[] = [
    { id: "1", name: "Chidi Okeke", email: "chidi@example.com", role: "user", status: "active", joinedDate: "2024-01-15", lastActive: "2 mins ago" },
    { id: "2", name: "Amaka Igwe", email: "amaka@example.com", role: "admin", status: "active", joinedDate: "2023-11-20", lastActive: "1 hour ago" },
    { id: "3", name: "Tunde Bakare", email: "tunde@example.com", role: "user", status: "suspended", joinedDate: "2024-02-10", lastActive: "5 days ago" },
    { id: "4", name: "Bisi Adebayo", email: "bisi@example.com", role: "support", status: "active", joinedDate: "2024-03-05", lastActive: "Just now" },
    { id: "5", name: "Emeka Okafor", email: "emeka@example.com", role: "user", status: "pending", joinedDate: "2024-03-20", lastActive: "Never" },
];

const columnHelper = createColumnHelper<User>();

export default function AdminUsers() {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState("");

    const columns = [
        columnHelper.accessor("name", {
            header: ({ column }) => {
                return (
                    <button
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Name
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                );
            },
            cell: (info) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {info.getValue().charAt(0)}
                    </div>
                    <span className="font-medium text-foreground">{info.getValue()}</span>
                </div>
            ),
        }),
        columnHelper.accessor("email", {
            header: "Email",
            cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
        }),
        columnHelper.accessor("role", {
            header: "Role",
            cell: (info) => {
                const role = info.getValue();
                return (
                    <span className={cn(
                        "px-2 py-1 rounded-full text-xs font-medium border",
                        role === "admin" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                            role === "support" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                "bg-accent text-muted-foreground border-border"
                    )}>
                        {role}
                    </span>
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
                        <span className={cn(
                            "capitalize text-sm",
                            status === "active" ? "text-green-400" :
                                status === "suspended" ? "text-red-400" :
                                    "text-yellow-400"
                        )}>
                            {status}
                        </span>
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
            cell: () => (
                <button className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                </button>
            ),
        }),
    ];

    const table = useReactTable({
        data: MOCK_USERS,
        columns,
        state: {
            sorting,
            globalFilter,
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">User Management</h1>
                    <p className="text-muted-foreground text-sm mt-1">Manage system users and permissions</p>
                </div>
                <button className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                    <UserPlus className="w-4 h-4" />
                    Add User
                </button>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border flex items-center gap-4">
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
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-border">
                            {table.getRowModel().rows.map((row) => (
                                <tr key={row.id} className="hover:bg-accent/50 transition-colors">
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="px-6 py-4 text-sm">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        Showing {table.getRowModel().rows.length} of {MOCK_USERS.length} users
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
        </div>
    );
}