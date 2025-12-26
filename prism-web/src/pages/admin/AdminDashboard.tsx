import {
    Users,
    DollarSign,
    FileText,
    ShieldAlert,
    ArrowUpRight,
    Activity
} from "lucide-react";

export default function AdminDashboard() {
    const metrics = [
        {
            title: "Total Users",
            value: "3,247",
            change: "+12%",
            icon: Users,
            color: "text-blue-400",
            bg: "bg-blue-400/10"
        },
        {
            title: "Monthly Revenue",
            value: "₦6.5M",
            change: "+18%",
            icon: DollarSign,
            color: "text-green-400",
            bg: "bg-green-400/10"
        },
        {
            title: "Filings This Month",
            value: "2,890",
            change: "89% Auto",
            icon: FileText,
            color: "text-purple-400",
            bg: "bg-purple-400/10"
        },
        {
            title: "Review Queue",
            value: "47",
            change: "8 High Priority",
            icon: ShieldAlert,
            color: "text-orange-400",
            bg: "bg-orange-400/10"
        }
    ];

    return (
        <div className="space-y-6">
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {metrics.map((metric) => (
                    <div key={metric.title} className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-lg ${metric.bg}`}>
                                <metric.icon className={`w-6 h-6 ${metric.color}`} />
                            </div>
                            <span className="text-sm font-medium text-green-400 flex items-center gap-1">
                                {metric.change} <ArrowUpRight className="w-4 h-4" />
                            </span>
                        </div>
                        <h3 className="text-slate-400 text-sm font-medium">{metric.title}</h3>
                        <p className="text-2xl font-bold text-slate-100 mt-1">{metric.value}</p>
                    </div>
                ))}
            </div>

            {/* Charts Section Placeholder */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 h-96">
                    <h3 className="text-lg font-medium text-slate-200 mb-4">Revenue Overview</h3>
                    <div className="flex items-center justify-center h-full text-slate-500">
                        Chart Component (Recharts)
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-96">
                    <h3 className="text-lg font-medium text-slate-200 mb-4">User Growth</h3>
                    <div className="flex items-center justify-center h-full text-slate-500">
                        Chart Component
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-medium text-slate-200 mb-6 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    Recent Activity
                </h3>
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-slate-400" />
                                </div>
                                <div>
                                    <p className="text-slate-200 font-medium">New user registration</p>
                                    <p className="text-sm text-slate-500">Chidi Electronics joined the platform</p>
                                </div>
                            </div>
                            <span className="text-sm text-slate-500">2 mins ago</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
