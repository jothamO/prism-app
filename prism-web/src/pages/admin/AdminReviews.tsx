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
    Check,
    X,
    AlertTriangle,
    ArrowUpDown,
    Search,
    Eye
} from "lucide-react";
import { cn } from "@/lib/utils";

type ReviewItem = {
    id: string;
    date: string;
    amount: number;
    narration: string;
    aiClassification: string;
    confidence: number;
    status: "pending" | "reviewed";
};

const MOCK_REVIEWS: ReviewItem[] = [
    { id: "1", date: "2024-03-20", amount: 150000, narration: "TRF FROM JUMIA PAY", aiClassification: "sale", confidence: 0.85, status: "pending" },
    { id: "2", date: "2024-03-19", amount: 50000, narration: "ATM WDL LEKKI PHASE 1", aiClassification: "expense", confidence: 0.92, status: "pending" },
    { id: "3", date: "2024-03-18", amount: 1200000, narration: "TO ADEWALE OJO - LOAN", aiClassification: "loan", confidence: 0.65, status: "pending" },
    { id: "4", date: "2024-03-18", amount: 4500, narration: "UBER TRIP TO AIRPORT", aiClassification: "expense", confidence: 0.88, status: "pending" },
    { id: "5", date: "2024-03-17", amount: 250000, narration: "UNKNOWN CREDIT 23489", aiClassification: "unknown", confidence: 0.20, status: "pending" },
];

const columnHelper = createColumnHelper<ReviewItem>();

export default function AdminReviews() {
    const [sorting, setSorting] = useState<SortingState>([]);

    const columns = [
        columnHelper.accessor("date", {
            header: "Date",
            cell: (info) => <span className="text-slate-400">{info.getValue()}</span>,
        }),
        columnHelper.accessor("narration", {
            header: "Narration",
            cell: (info) => <span className="text-slate-200 font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor("amount", {
            header: ({ column }) => {
                return (
                    <button
                        className="flex items-center gap-1 hover:text-white"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Amount
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                );
            },
            cell: (info) => (
                <span className="text-slate-200 font-mono">
                    ₦{info.getValue().toLocaleString()}
                </span>
            ),
        }),
        columnHelper.accessor("aiClassification", {
            header: "AI Suggestion",
            cell: (info) => {
                const value = info.getValue();
                return (
                    <span className={cn(
                        "px-2 py-1 rounded-full text-xs font-medium border capitalize",
                        value === "sale" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                            value === "expense" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                "bg-slate-800 text-slate-400 border-slate-700"
                    )}>
                        {value}
                    </span>
                );
            },
        }),
        columnHelper.accessor("confidence", {
            header: "Confidence",
            cell: (info) => {
                const value = info.getValue();
                return (
                    <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full",
                                    value > 0.8 ? "bg-green-500" : value > 0.5 ? "bg-yellow-500" : "bg-red-500"
                                )}
                                style={{ width: `${value * 100}%` }}
                            />
                        </div>
                        <span className="text-xs text-slate-500">{(value * 100).toFixed(0)}%</span>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: "actions",
            header: "Actions",
            cell: () => (
                <div className="flex items-center gap-2">
                    <button className="p-1.5 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors" title="Approve">
                        <Check className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors" title="Reject/Edit">
                        <X className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors" title="View Details">
                        <Eye className="w-4 h-4" />
                    </button>
                </div>
            ),
        }),
    ];

    const table = useReactTable({
        data: MOCK_REVIEWS,
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
                    <h1 className="text-2xl font-bold text-slate-100">Review Queue</h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Transactions requiring manual classification or confirmation
                    </p>
                </div>
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-lg text-yellow-400 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    <span>5 items need attention</span>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            placeholder="Search transactions..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                    </div>
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
