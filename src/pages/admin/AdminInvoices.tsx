import { FileText, Plus } from "lucide-react";

export default function AdminInvoices() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
                    <p className="text-muted-foreground text-sm mt-1">Manage client invoices and billing</p>
                </div>
                <button className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                    <Plus className="w-4 h-4" />
                    Create Invoice
                </button>
            </div>

            <div className="bg-card border border-border rounded-xl p-8 text-center">
                <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No invoices found</h3>
                <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                    Get started by creating a new invoice for your clients.
                </p>
            </div>
        </div>
    );
}