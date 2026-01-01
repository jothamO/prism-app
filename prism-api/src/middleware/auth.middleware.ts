import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database';

/**
 * Extended Request interface with authenticated user
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

/**
 * Authentication middleware that validates Supabase JWT tokens.
 * Rejects requests without valid tokens.
 */
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.warn('Auth middleware: Invalid token', { error: error?.message });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

/**
 * Admin middleware that checks if the authenticated user has the 'admin' role.
 * Must be used after authMiddleware.
 */
export const adminMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if user has admin role using the has_role function
    const { data: isAdmin, error } = await supabase.rpc('has_role', {
      _user_id: req.user.id,
      _role: 'admin'
    });

    if (error) {
      console.error('Admin role check error:', error);
      return res.status(500).json({ error: 'Error checking admin privileges' });
    }

    if (!isAdmin) {
      console.warn('Admin middleware: Access denied for user', { userId: req.user.id });
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    req.user.role = 'admin';
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({ error: 'Authorization error' });
  }
};

/**
 * Optional authentication middleware that attaches user if token is present,
 * but doesn't reject requests without tokens.
 */
export const optionalAuthMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          req.user = {
            id: user.id,
            email: user.email
          };
        }
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};
