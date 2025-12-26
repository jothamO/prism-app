import { useState } from "react";
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    getSortedRowModel,
    SortingState
} from "@tanstack/react-table";
import {
    Download,
    FileText,
    CheckCircle,
    Clock,
    AlertCircle,
    Search,
    Filter
} from "lucide-react";
import { cn } from "@/lib/utils";

type Filing = {
    id: string;
    period: string;
    type: "VAT" | "CIT" | "WHT";
    amount: number;
    dueDate: string;
    status: "filed" | "pending" | "overdue";
    filedDate?: string;
    receiptUrl?: string;
};

const MOCK_FILINGS: Filing[] = [
    { id: "1", period: "Feb 2024", type: "VAT", amount: 45231.89, dueDate: "2024-03-21", status: "filed", filedDate: "2024-03-20", receiptUrl: "#" },
    { id: "2", period: "Jan 2024", type: "VAT", amount: 38900.50, dueDate: "2024-02-21", status: "filed", filedDate: "2024-02-21", receiptUrl: "#" },
    { id: "3", period: "Dec 2023", type: "VAT", amount: 52100.00, dueDate: "2024-01-21", status: "filed", filedDate: "2024-01-20", receiptUrl: "#" },
    { id: "4", period: "2023", type: "CIT", amount: 1500000.00, dueDate: "2024-06-30", status: "pending" },
    { id: "5", period: "Mar 2024", type: "WHT", amount: 12500.00, dueDate: "2024-04-21", status: "overdue" },
];

const columnHelper = createColumnHelper<Filing>();

export default function AdminFilings() {
    const [sorting, setSorting] = useState<SortingState>([]);

    const columns = [
        columnHelper.accessor("period", {
            header: "Period",
            cell: (info) => <span className="font-medium text-slate-200">{info.getValue()}</span>,
        }),
        columnHelper.accessor("type", {
            header: "Type",
            cell: (info) => (
                <span className="px-2 py-1 bg-slate-800 rounded text-xs font-medium text-slate-300">
                    {info.getValue()}
                </span>
            ),
        }),
        columnHelper.accessor("amount", {
            header: "Amount",
            cell: (info) => (
                <span className="font-mono text-slate-200">
                    ₦{info.getValue().toLocaleString()}
                </span>
            ),
        }),
        columnHelper.accessor("dueDate", {
            header: "Due Date",
            cell: (info) => <span className="text-slate-400">{info.getValue()}</span>,
        }),
        columnHelper.accessor("status", {
            header: "Status",
            cell: (info) => {
                const status = info.getValue();
                return (
                    <div className="flex items-center gap-2">
                        {status === "filed" && <CheckCircle className="w-4 h-4 text-green-500" />}
                        {status === "pending" && <Clock className="w-4 h-4 text-yellow-500" />}
                        {status === "overdue" && <AlertCircle className="w-4 h-4 text-red-500" />}
                        <span className={cn(
                            "capitalize text-sm",
                            status === "filed" ? "text-green-400" :
                                status === "pending" ? "text-yellow-400" :
                                    "text-red-400"
                        )}>
                            {status}
                        </span>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: "actions",
            header: "Receipt",
            cell: (info) => {
                const receiptUrl = info.row.original.receiptUrl;
                if (receiptUrl) {
                    return (
                        <button className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors text-sm">
                            <Download className="w-4 h-4" />
                            Download
                        </button>
                    );
                }
                return <span className="text-slate-600 text-sm">-</span>;
            },
        }),
    ];

    const table = useReactTable({
        data: MOCK_FILINGS,
        columns,
        state: {
            sorting,
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Filings Management</h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Track and manage tax filings and compliance
                    </p>
                </div>
                <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                    <FileText className="w-4 h-4" />
                    New Filing
                </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            placeholder="Search filings..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-3 py-2 border border-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                        <Filter className="w-4 h-4" />
                        Filter
                    </button>
                </div>

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
            </div>
        </div>
    );
}
