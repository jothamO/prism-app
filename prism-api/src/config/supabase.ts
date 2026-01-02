// Re-export supabase client for backwards compatibility
// Some services import from '../config/supabase' instead of '../config/database'
export { supabase } from './database';
