import { ExternalLink, Link2, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProvisionDetails, type ProvisionDetail } from "@/hooks/useProvisionDetails";
import { cn } from "@/lib/utils";

interface ProvisionLinksDisplayProps {
  provisionIds: string[];
  variant?: "compact" | "detailed" | "inline";
  showSource?: boolean;
  onProvisionClick?: (provision: ProvisionDetail) => void;
  className?: string;
}

export function ProvisionLinksDisplay({
  provisionIds,
  variant = "compact",
  showSource = false,
  onProvisionClick,
  className,
}: ProvisionLinksDisplayProps) {
  const { provisions, loading, error } = useProvisionDetails(provisionIds);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="text-xs">Loading provisions...</span>
      </div>
    );
  }

  if (error || provisions.length === 0) {
    return null;
  }

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex flex-wrap gap-1", className)}>
        {provisions.map((prov) => (
          <a
            key={prov.id}
            href={`/admin/compliance/documents/${prov.document_id}?tab=provisions&highlight=${prov.id}`}
            className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
            onClick={(e) => {
              if (onProvisionClick) {
                e.preventDefault();
                onProvisionClick(prov);
              }
            }}
          >
            §{prov.section_number || "N/A"}
          </a>
        ))}
      </span>
    );
  }

  if (variant === "detailed") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Link2 className="w-4 h-4" />
          <span>Legal References ({provisions.length})</span>
        </div>
        <div className="space-y-2">
          {provisions.map((prov) => (
            <a
              key={prov.id}
              href={`/admin/compliance/documents/${prov.document_id}?tab=provisions&highlight=${prov.id}`}
              className="block p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
              onClick={(e) => {
                if (onProvisionClick) {
                  e.preventDefault();
                  onProvisionClick(prov);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-blue-600">
                      §{prov.section_number || "N/A"}
                    </span>
                    {prov.title && (
                      <span className="text-sm text-foreground truncate">
                        {prov.title}
                      </span>
                    )}
                  </div>
                  {showSource && prov.document_title && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <FileText className="w-3 h-3" />
                      {prov.document_title}
                    </div>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  }

  // Compact variant (default)
  return (
    <div className={cn("bg-muted/30 rounded-lg p-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
        <Link2 className="w-4 h-4" />
        <span>Linked Provisions</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {provisions.map((prov) => (
          <Badge
            key={prov.id}
            variant="outline"
            className="cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
            onClick={() => {
              if (onProvisionClick) {
                onProvisionClick(prov);
              } else {
                window.location.href = `/admin/compliance/documents/${prov.document_id}?tab=provisions&highlight=${prov.id}`;
              }
            }}
          >
            <span className="font-mono text-blue-600">§{prov.section_number || "N/A"}</span>
            {prov.title && (
              <span className="ml-1 text-muted-foreground max-w-[120px] truncate">
                {prov.title}
              </span>
            )}
            <ExternalLink className="w-3 h-3 ml-1 text-muted-foreground" />
          </Badge>
        ))}
      </div>
      {showSource && provisions[0]?.document_title && (
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <FileText className="w-3 h-3" />
          Source: {provisions[0].document_title}
        </div>
      )}
    </div>
  );
}
