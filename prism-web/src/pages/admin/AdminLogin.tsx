import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import api from '@/lib/api';
import maxtonImg from '@/assets/maxton.png';

export default function AdminLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(""); // Clear previous errors
        try {
            console.log("Attempting login with:", { email });
            const response = await api.post<{ token: string }>('/auth/login', { email, password });
            console.log("Login success:", response.data);
            const token = response.data.token;
            localStorage.setItem('admin_token', token);
            navigate('/admin');
        } catch (err: any) {
            console.error("Login error details:", err);
            if (err.response) {
                // Server responded with a status code outside 2xx
                setError(err.response.data?.message || `Server error: ${err.response.status}`);
            } else if (err.request) {
                // Request was made but no response received
                setError("Network error: No response from server. Is the backend running?");
            } else {
                // Something happened in setting up the request
                setError(`Error: ${err.message}`);
            }
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 rounded-xl border border-slate-800 p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <img src={maxtonImg} alt="Maxton theme" className="mx-auto mb-4 w-24 h-24 object-contain" />
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                        PRISM Admin
                    </h1>
                    <p className="text-slate-400 mt-2">Sign in to access the dashboard</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                                placeholder="admin@prism.ng"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 rounded-lg transition-colors shadow-lg shadow-purple-500/20"
                    >
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    );
}

