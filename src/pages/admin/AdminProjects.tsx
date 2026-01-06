import { useState, useEffect } from "react";
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
import { Search, MoreHorizontal, ArrowUpDown, FolderPlus, CheckCircle, Clock, AlertTriangle, Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Project = {
  id: string;
  name: string;
  source_person: string;
  source_relationship: string;
  budget: number;
  spent: number;
  status: "active" | "completed" | "closed";
  tax_treatment: string;
  is_agency_fund: boolean;
  created_at: string;
  user_email?: string;
};

const columnHelper = createColumnHelper<Project>();

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AdminProjects() {
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleNewProject = () => {
    toast({
      title: "Coming Soon",
      description: "Project creation will be available in a future update. Projects are created via WhatsApp.",
    });
  };

  const handleGenerateStatement = () => {
    toast({
      title: "Coming Soon",
      description: "Statement generation will be available in a future update.",
    });
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          profiles:user_id (email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((p: any) => ({
        ...p,
        user_email: p.profiles?.email || 'Unknown',
      }));
      setProjects(formatted);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  }

  const columns = [
    columnHelper.accessor("name", {
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Project Name <ArrowUpDown className="w-4 h-4" />
        </button>
      ),
      cell: (info) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{info.getValue()}</span>
          <span className="text-xs text-muted-foreground">{info.row.original.user_email}</span>
        </div>
      ),
    }),
    columnHelper.accessor("source_person", {
      header: "Source",
      cell: (info) => (
        <div className="flex flex-col">
          <span className="text-foreground">{info.getValue()}</span>
          <span className="text-xs text-muted-foreground capitalize">{info.row.original.source_relationship}</span>
        </div>
      ),
    }),
    columnHelper.accessor("budget", {
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Budget <ArrowUpDown className="w-4 h-4" />
        </button>
      ),
      cell: (info) => <span className="text-foreground font-medium">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor("spent", {
      header: "Spent",
      cell: (info) => {
        const spent = info.getValue();
        const budget = info.row.original.budget;
        const percentage = budget > 0 ? (spent / budget) * 100 : 0;
        const isOverBudget = percentage > 100;
        
        return (
          <div className="flex flex-col gap-1">
            <span className={cn("font-medium", isOverBudget ? "text-red-400" : "text-foreground")}>
              {formatCurrency(spent)}
            </span>
            <div className="w-24 h-1.5 bg-accent rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all", isOverBudget ? "bg-red-500" : "bg-primary")}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{percentage.toFixed(0)}% used</span>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "balance",
      header: "Balance",
      cell: ({ row }) => {
        const balance = row.original.budget - row.original.spent;
        const isNegative = balance < 0;
        return (
          <span className={cn("font-medium", isNegative ? "text-red-400" : "text-green-400")}>
            {formatCurrency(balance)}
          </span>
        );
      },
    }),
    columnHelper.accessor("tax_treatment", {
      header: "Tax Treatment",
      cell: (info) => {
        const treatment = info.getValue();
        const isAgency = info.row.original.is_agency_fund;
        return (
          <div className="flex flex-col gap-1">
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border w-fit",
              treatment === 'non_taxable' 
                ? "bg-green-500/10 text-green-400 border-green-500/20" 
                : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
            )}>
              {treatment === 'non_taxable' ? 'Non-Taxable' : 'Taxable Excess'}
            </span>
            {isAgency && (
              <span className="text-xs text-muted-foreground">Section 5 - Agency</span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();
        return (
          <div className="flex items-center gap-2">
            {status === "active" && <Clock className="w-4 h-4 text-blue-500" />}
            {status === "completed" && <CheckCircle className="w-4 h-4 text-green-500" />}
            {status === "closed" && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
            <span className={cn("capitalize text-sm",
              status === "active" ? "text-blue-400" : 
              status === "completed" ? "text-green-400" : "text-yellow-400"
            )}>{status}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("created_at", {
      header: "Created",
      cell: (info) => (
        <span className="text-muted-foreground text-sm">
          {new Date(info.getValue()).toLocaleDateString('en-NG', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
          })}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              setSelectedProject(row.original);
              setShowDetails(true);
            }}
            className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button 
            onClick={handleGenerateStatement}
            className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            title="Generate Statement"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: projects,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Calculate summary stats
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const totalSpent = projects.reduce((sum, p) => sum + (p.spent || 0), 0);
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const completedProjects = projects.filter(p => p.status === 'completed').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Funds</h1>
          <p className="text-muted-foreground text-sm mt-1">Track third-party agency funds (Section 5 compliance)</p>
        </div>
        <button 
          onClick={handleNewProject}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FolderPlus className="w-4 h-4" /> New Project
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Total Budget</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalBudget)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Total Spent</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Active Projects</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{activeProjects}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Completed</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{completedProjects}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-background border border-border rounded-lg py-2 pl-9 pr-4 text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <select className="bg-background border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="closed">Closed</option>
            </select>
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
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-muted-foreground">
                    No projects found. Projects created via WhatsApp will appear here.
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
          <span>Showing {table.getRowModel().rows.length} of {projects.length} projects</span>
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

      {/* Project Details Modal */}
      {showDetails && selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDetails(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">{selectedProject.name}</h2>
              <button 
                onClick={() => setShowDetails(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-muted-foreground text-sm">Source</p>
                <p className="text-foreground font-medium">{selectedProject.source_person}</p>
                <p className="text-muted-foreground text-xs capitalize">{selectedProject.source_relationship}</p>
              </div>
              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-muted-foreground text-sm">Status</p>
                <p className="text-foreground font-medium capitalize">{selectedProject.status}</p>
              </div>
              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-muted-foreground text-sm">Budget</p>
                <p className="text-foreground font-medium">{formatCurrency(selectedProject.budget)}</p>
              </div>
              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-muted-foreground text-sm">Spent</p>
                <p className="text-foreground font-medium">{formatCurrency(selectedProject.spent)}</p>
              </div>
              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-muted-foreground text-sm">Balance</p>
                <p className={cn("font-medium", (selectedProject.budget - selectedProject.spent) < 0 ? "text-red-400" : "text-green-400")}>
                  {formatCurrency(selectedProject.budget - selectedProject.spent)}
                </p>
              </div>
              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-muted-foreground text-sm">Tax Treatment</p>
                <p className="text-foreground font-medium">
                  {selectedProject.is_agency_fund ? 'Agency Fund (Section 5)' : 'Standard'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button 
                onClick={handleGenerateStatement}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <FileText className="w-4 h-4" /> Generate Statement
              </button>
              <button 
                onClick={() => setShowDetails(false)}
                className="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-accent transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
