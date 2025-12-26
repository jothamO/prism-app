import { CreditCard, Download } from "lucide-react";

export default function AdminPayments() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Payments</h1>
                    <p className="text-slate-400 text-sm mt-1">Transaction history and payouts</p>
                </div>
                <button className="px-4 py-2 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 flex items-center gap-2 transition-colors">
                    <Download className="w-4 h-4" />
                    Export CSV
                </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-200">No transactions yet</h3>
                <p className="text-slate-400 mt-2">
                    Recent payments will appear here.
                </p>
            </div>
        </div>
    );
}
