import { Request, Response } from 'express';
import { supabase } from '../config/database';

export const authController = {
    /**
     * Login endpoint that authenticates users via Supabase Auth.
     * Returns a session token on successful authentication.
     */
    login: async (req: Request, res: Response) => {
        try {
            const { email, password } = req.body;

            // Log login attempt without sensitive data
            console.log('Login attempt:', { 
                email, 
                timestamp: new Date().toISOString(),
                ip: req.ip 
            });

            // Validate input
            if (!email || !password) {
                return res.status(400).json({ 
                    error: 'Email and password are required' 
                });
            }

            // Authenticate with Supabase Auth
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.warn('Login failed:', { 
                    email, 
                    error: error.message,
                    timestamp: new Date().toISOString() 
                });
                return res.status(401).json({ 
                    error: 'Invalid credentials' 
                });
            }

            if (!data.session || !data.user) {
                return res.status(401).json({ 
                    error: 'Authentication failed' 
                });
            }

            // Check if user has admin role for admin login
            const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
                _user_id: data.user.id,
                _role: 'admin'
            });

            if (roleError) {
                console.error('Role check error:', roleError);
            }

            // Return the session token and user info
            return res.json({
                token: data.session.access_token,
                refreshToken: data.session.refresh_token,
                expiresAt: data.session.expires_at,
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    role: isAdmin ? 'admin' : 'user'
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ 
                error: 'An error occurred during authentication' 
            });
        }
    },

    /**
     * Logout endpoint that invalidates the current session.
     */
    logout: async (req: Request, res: Response) => {
        try {
            const authHeader = req.headers.authorization;
            
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split('Bearer ')[1];
                
                // Sign out from Supabase
                const { error } = await supabase.auth.signOut();
                
                if (error) {
                    console.warn('Logout warning:', error.message);
                }
            }

            return res.json({ message: 'Logged out successfully' });
        } catch (error) {
            console.error('Logout error:', error);
            return res.status(500).json({ 
                error: 'An error occurred during logout' 
            });
        }
    },

    /**
     * Refresh token endpoint to get a new access token.
     */
    refresh: async (req: Request, res: Response) => {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({ 
                    error: 'Refresh token is required' 
                });
            }

            const { data, error } = await supabase.auth.refreshSession({
                refresh_token: refreshToken
            });

            if (error || !data.session) {
                return res.status(401).json({ 
                    error: 'Invalid refresh token' 
                });
            }

            return res.json({
                token: data.session.access_token,
                refreshToken: data.session.refresh_token,
                expiresAt: data.session.expires_at
            });
        } catch (error) {
            console.error('Token refresh error:', error);
            return res.status(500).json({ 
                error: 'An error occurred during token refresh' 
            });
        }
    },

    /**
     * Verify token endpoint to check if a token is valid.
     */
    verify: async (req: Request, res: Response) => {
        try {
            const authHeader = req.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ 
                    valid: false, 
                    error: 'No token provided' 
                });
            }

            const token = authHeader.split('Bearer ')[1];
            const { data: { user }, error } = await supabase.auth.getUser(token);

            if (error || !user) {
                return res.status(401).json({ 
                    valid: false, 
                    error: 'Invalid token' 
                });
            }

            // Check admin role
            const { data: isAdmin } = await supabase.rpc('has_role', {
                _user_id: user.id,
                _role: 'admin'
            });

            return res.json({
                valid: true,
                user: {
                    id: user.id,
                    email: user.email,
                    role: isAdmin ? 'admin' : 'user'
                }
            });
        } catch (error) {
            console.error('Token verification error:', error);
            return res.status(500).json({ 
                valid: false, 
                error: 'Verification failed' 
            });
        }
    }
};
