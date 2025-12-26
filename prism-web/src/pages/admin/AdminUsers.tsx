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
    Shield,
    Ban,
    CheckCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data Type
type User = {
    id: string;
    name: string;
    email: string;
    role: "admin" | "user" | "support";
    status: "active" | "suspended" | "pending";
    joinedDate: string;
    lastActive: string;
};

// Mock Data
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
                        className="flex items-center gap-1 hover:text-white"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Name
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                );
            },
            cell: (info) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                        {info.getValue().charAt(0)}
                    </div>
                    <span className="font-medium text-slate-200">{info.getValue()}</span>
                </div>
            ),
        }),
        columnHelper.accessor("email", {
            header: "Email",
            cell: (info) => <span className="text-slate-400">{info.getValue()}</span>,
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
                                "bg-slate-800 text-slate-400 border-slate-700"
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
                        {status === "pending" && <Activity className="w-4 h-4 text-yellow-500" />}
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
            cell: (info) => <span className="text-slate-500 text-sm">{info.getValue()}</span>,
        }),
        columnHelper.display({
            id: "actions",
            cell: () => (
                <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
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
                    <h1 className="text-2xl font-bold text-slate-100">User Management</h1>
                    <p className="text-slate-400 text-sm mt-1">Manage system users and permissions</p>
                </div>
                <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                    <UserPlus className="w-4 h-4" />
                    Add User
                </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-800 flex items-center gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            value={globalFilter ?? ""}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            placeholder="Search users..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Filter buttons could go here */}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-950/50 text-slate-400 text-sm font-medium">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th key={header.id} className="px-6 py-3 border-b border-slate-800">
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
                        <tbody className="divide-y divide-slate-800">
                            {table.getRowModel().rows.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-800/50 transition-colors">
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

                {/* Pagination */}
                <div className="p-4 border-t border-slate-800 flex items-center justify-between text-sm text-slate-400">
                    <span>
                        Showing {table.getRowModel().rows.length} of {MOCK_USERS.length} users
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            className="px-3 py-1 border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-50"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            Previous
                        </button>
                        <button
                            className="px-3 py-1 border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-50"
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

// Helper for status icon
function Activity({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    )
}
