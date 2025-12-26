import { FileText, Plus } from "lucide-react";

export default function AdminInvoices() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Invoices</h1>
                    <p className="text-slate-400 text-sm mt-1">Manage client invoices and billing</p>
                </div>
                <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                    <Plus className="w-4 h-4" />
                    Create Invoice
                </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-200">No invoices found</h3>
                <p className="text-slate-400 mt-2 max-w-sm mx-auto">
                    Get started by creating a new invoice for your clients.
                </p>
            </div>
        </div>
    );
}
