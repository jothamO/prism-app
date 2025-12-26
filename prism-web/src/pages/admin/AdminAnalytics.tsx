import { BarChart3 } from "lucide-react";

export default function AdminAnalytics() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
                <p className="text-slate-400 text-sm mt-1">Detailed system performance and usage metrics</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-64 flex items-center justify-center">
                    <div className="text-center">
                        <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400">Revenue Chart Placeholder</p>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-64 flex items-center justify-center">
                    <div className="text-center">
                        <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400">User Growth Placeholder</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
