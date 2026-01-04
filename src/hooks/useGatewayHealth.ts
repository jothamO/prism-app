import { useState, useEffect, useCallback } from "react";

export interface GatewayHealth {
  status: "healthy" | "degraded" | "offline" | "unknown";
  responseTime: number | null;
  lastCheck: Date | null;
  error: string | null;
}

export function useGatewayHealth(pollInterval = 30000) {
  const [health, setHealth] = useState<GatewayHealth>({
    status: "unknown",
    responseTime: null,
    lastCheck: null,
    error: null
  });
  const [loading, setLoading] = useState(true);

  const checkHealth = useCallback(async () => {
    const gatewayUrl = import.meta.env.VITE_RAILWAY_GATEWAY_URL;
    
    if (!gatewayUrl) {
      setHealth({
        status: "unknown",
        responseTime: null,
        lastCheck: new Date(),
        error: "Gateway URL not configured"
      });
      setLoading(false);
      return;
    }

    try {
      const startTime = performance.now();
      const response = await fetch(`${gatewayUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      if (response.ok) {
        setHealth({
          status: responseTime < 500 ? "healthy" : "degraded",
          responseTime,
          lastCheck: new Date(),
          error: null
        });
      } else {
        setHealth({
          status: "degraded",
          responseTime,
          lastCheck: new Date(),
          error: `HTTP ${response.status}`
        });
      }
    } catch (err) {
      setHealth({
        status: "offline",
        responseTime: null,
        lastCheck: new Date(),
        error: err instanceof Error ? err.message : "Connection failed"
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, pollInterval);
    return () => clearInterval(interval);
  }, [checkHealth, pollInterval]);

  return { health, loading, refetch: checkHealth };
}
