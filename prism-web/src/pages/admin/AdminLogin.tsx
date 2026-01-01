import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, Loader2 } from "lucide-react";
import api from '@/lib/api';
import maxtonImg from '@/assets/maxton.png';

interface LoginResponse {
    token: string;
    refreshToken: string;
    expiresAt: number;
    user: {
        id: string;
        email: string;
        role: string;
    };
}

export default function AdminLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const response = await api.post<LoginResponse>('/auth/login', { email, password });
            const { token, refreshToken, user } = response.data;

            // Verify user has admin role
            if (user.role !== 'admin') {
                setError("Access denied: Admin privileges required");
                setIsLoading(false);
                return;
            }

            // Store tokens securely
            localStorage.setItem('admin_token', token);
            localStorage.setItem('admin_refresh_token', refreshToken);
            localStorage.setItem('admin_user', JSON.stringify(user));

            navigate('/admin');
        } catch (err: any) {
            console.error("Login error:", err?.response?.status);
            
            if (err.response) {
                const status = err.response.status;
                const message = err.response.data?.error || err.response.data?.message;
                
                if (status === 401) {
                    setError("Invalid email or password");
                } else if (status === 403) {
                    setError("Access denied: Admin privileges required");
                } else if (status >= 500) {
                    setError("Server error. Please try again later.");
                } else {
                    setError(message || "An error occurred during login");
                }
            } else if (err.request) {
                setError("Unable to connect to server. Please check your connection.");
            } else {
                setError("An unexpected error occurred");
            }
        } finally {
            setIsLoading(false);
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
                                disabled={isLoading}
                                required
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
                                disabled={isLoading}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Signing in...
                            </>
                        ) : (
                            "Sign In"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
