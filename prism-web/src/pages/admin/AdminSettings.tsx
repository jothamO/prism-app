import { Settings, User, Bell, Shield } from "lucide-react";

export default function AdminSettings() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
                <p className="text-slate-400 text-sm mt-1">Manage your account and application preferences</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-2">
                    <button className="w-full text-left px-4 py-2 rounded-lg bg-slate-800 text-white font-medium flex items-center gap-3">
                        <User className="w-4 h-4" /> Profile
                    </button>
                    <button className="w-full text-left px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors flex items-center gap-3">
                        <Bell className="w-4 h-4" /> Notifications
                    </button>
                    <button className="w-full text-left px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors flex items-center gap-3">
                        <Shield className="w-4 h-4" /> Security
                    </button>
                    <button className="w-full text-left px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-colors flex items-center gap-3">
                        <Settings className="w-4 h-4" /> General
                    </button>
                </div>

                <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-lg font-medium text-slate-200 mb-4">Profile Settings</h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">First Name</label>
                                <input className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200" defaultValue="Jotham" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">Last Name</label>
                                <input className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200" defaultValue="Ossai" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Email Address</label>
                            <input className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200" defaultValue="jothamossai@gmail.com" />
                        </div>
                        <div className="pt-4">
                            <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
