import React from "react";
import { Users, Clock, Mail, Eye, CheckCircle2 } from "lucide-react";
import type { CampaignStatusMetrics } from "@/lib/assessments/campaign-status-metrics";

export interface CampaignStatusMetricsProps {
  metrics: CampaignStatusMetrics;
  emptyHint?: string;
  className?: string;
  compact?: boolean;
  testIdPrefix?: string;
}

const TILES = [
  {
    band: "total",
    label: "Total",
    Icon: Users,
    tileClass: "bg-muted text-foreground ring-border",
  },
  {
    band: "new",
    label: "New",
    Icon: Clock,
    tileClass: "bg-muted text-muted-foreground ring-border",
  },
  {
    band: "invited",
    label: "Invited",
    Icon: Mail,
    tileClass: "bg-primary/10 text-primary ring-primary/20",
  },
  {
    band: "started",
    label: "Started",
    Icon: Eye,
    tileClass: "bg-warning/10 text-warning ring-warning/20",
  },
  {
    band: "completed",
    label: "Completed",
    Icon: CheckCircle2,
    tileClass: "bg-success/10 text-success ring-success/20",
  },
] as const;

export function CampaignStatusMetrics({
  metrics,
  emptyHint,
  className,
  compact = false,
  testIdPrefix = "campaign-status-metrics",
}: CampaignStatusMetricsProps): React.JSX.Element {
  const containerClass = [
    "flex flex-wrap gap-2",
    compact ? "text-[10px]" : "text-xs",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (metrics.total === 0 && emptyHint) {
    return (
      <div data-testid={testIdPrefix} className={containerClass}>
        <span className="text-muted-foreground">{emptyHint}</span>
      </div>
    );
  }

  return (
    <div data-testid={testIdPrefix} className={containerClass}>
      {TILES.map(({ band, label, Icon, tileClass }) => (
        <div
          key={band}
          data-testid={`${testIdPrefix}-${band}`}
          className={`inline-flex items-center gap-1 font-medium px-2 py-1 rounded-md ring-1 ${tileClass}`}
        >
          <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          <span>{label}:</span>
          <span>{metrics[band]}</span>
        </div>
      ))}
    </div>
  );
}
