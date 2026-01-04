import { useGatewayHealth } from "@/hooks/useGatewayHealth";
import { Link } from "react-router-dom";
import { 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  Clock, 
  Zap, 
  RefreshCw,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

export function GatewayHealthWidget() {
  const { health, loading, refetch } = useGatewayHealth();

  const statusConfig = {
    healthy: {
      icon: Wifi,
      color: "text-green-500",
      bg: "bg-green-500/10",
      label: "Healthy"
    },
    degraded: {
      icon: AlertTriangle,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      label: "Degraded"
    },
    offline: {
      icon: WifiOff,
      color: "text-red-500",
      bg: "bg-red-500/10",
      label: "Offline"
    },
    unknown: {
      icon: AlertTriangle,
      color: "text-muted-foreground",
      bg: "bg-muted",
      label: "Unknown"
    }
  };

  const config = statusConfig[health.status];
  const StatusIcon = config.icon;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Gateway Status
        </h3>
        <button
          onClick={refetch}
          disabled={loading}
          className="p-1 hover:bg-accent rounded transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loading && "animate-spin")} />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className={cn("p-3 rounded-lg", config.bg)}>
          <StatusIcon className={cn("w-6 h-6", config.color)} />
        </div>
        
        <div className="flex-1">
          <p className={cn("text-lg font-semibold", config.color)}>
            {config.label}
          </p>
          {health.responseTime !== null && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {health.responseTime}ms response
            </p>
          )}
          {health.error && health.status !== "healthy" && (
            <p className="text-xs text-destructive mt-1">{health.error}</p>
          )}
        </div>
      </div>

      {health.lastCheck && (
        <p className="text-xs text-muted-foreground mt-3">
          Last check: {health.lastCheck.toLocaleTimeString()}
        </p>
      )}

      <Link 
        to="/admin/simulator"
        className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Open Simulator <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}
