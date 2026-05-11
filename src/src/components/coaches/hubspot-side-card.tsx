/**
 * Q-MAY6-2: HubSpot side card on admin coach detail.
 *
 * Renders distinct UI per `kind`:
 *   - unconfigured: render nothing (component caller can render null)
 *   - not_found: "Not found in HubSpot" muted
 *   - error: "HubSpot lookup failed" with subtle hint, no raw details
 *   - found: Card with lifecycle stage + last modified + "View in HubSpot" link
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { HubSpotLookupResult } from "@/services/hubspot";

interface Props {
  lookup: HubSpotLookupResult;
  portalId: string | null;
}

function formatRelativeDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    dateStyle: "medium",
  });
}

export function HubSpotSideCard({ lookup, portalId }: Props) {
  if (lookup.kind === "unconfigured") {
    return null;
  }

  if (lookup.kind === "not_found") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">HubSpot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not found in HubSpot.</p>
        </CardContent>
      </Card>
    );
  }

  if (lookup.kind === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">HubSpot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            HubSpot lookup failed. Check logs and retry.
          </p>
        </CardContent>
      </Card>
    );
  }

  const c = lookup.contact;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">HubSpot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Lifecycle stage</div>
          {c.properties.lifecyclestage ? (
            <Badge variant="secondary" className="capitalize">
              {c.properties.lifecyclestage}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Last modified</div>
          <div className="text-sm">{formatRelativeDate(c.properties.lastmodifieddate)}</div>
        </div>
        {portalId && c.id && (
          <a
            href={`https://app.hubspot.com/contacts/${portalId}/contact/${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline"
          >
            View in HubSpot ↗
          </a>
        )}
      </CardContent>
    </Card>
  );
}
