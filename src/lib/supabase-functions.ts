import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://rjajxabpndmpcgssymxw.supabase.co";

/**
 * Call a Supabase Edge Function with automatic authentication and error handling.
 * 
 * @param functionName - The name of the edge function to call
 * @param body - The request body to send
 * @param requireAuth - Whether to require authentication (default: true)
 * @returns The parsed JSON response
 * @throws Error if the request fails or returns a non-OK status
 */
export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  requireAuth: boolean = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add auth token if required
  if (requireAuth) {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  // Handle non-OK responses
  if (!response.ok) {
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    
    try {
      const text = await response.text();
      // Try to parse as JSON for structured error message
      try {
        const json = JSON.parse(text);
        errorMessage = json.error || json.message || errorMessage;
      } catch {
        // If not JSON, use first 200 chars of text
        if (text && text.length > 0) {
          errorMessage = text.substring(0, 200);
        }
      }
    } catch {
      // Ignore read errors
    }
    
    throw new Error(errorMessage);
  }

  // Parse and return JSON response
  return response.json();
}

/**
 * Call an edge function without authentication requirement.
 * Useful for public endpoints.
 */
export async function callPublicEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  return callEdgeFunction<T>(functionName, body, false);
}
