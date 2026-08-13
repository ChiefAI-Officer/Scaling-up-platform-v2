"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CopyUrlButton } from "@/components/ui/copy-url-button";
import {
  ResponsiveActionsItem,
  ResponsiveActionsMenu,
} from "@/components/ui/responsive-actions-menu";
import { WorkshopApprovalActions } from "@/components/workshops/workshop-approval-actions";
import {
  formatCurrency,
  formatEventDateUTC,
  formatTimeWithZone,
  formatTimestamp,
  getWorkshopStatusColor,
  getWorkshopStatusLabel,
} from "@/lib/utils";

export interface AdminWorkshopRecord {
  id: string;
  title: string;
  status: string;
  eventDate: Date | string;
  eventTime: string | null;
  timezone: string | null;
  createdAt: Date | string;
  format: string;
  maxAttendees: number;
  isFree: boolean;
  priceCents: number | null;
  earlyBirdPriceCents: number | null;
  landingPageSlug: string | null;
  coach: { firstName: string; lastName: string };
  workshopType: { name: string } | null;
  pricingTier: { name: string } | null;
  _count: { registrations: number };
}

function formatStartTime(workshop: AdminWorkshopRecord): string {
  if (!workshop.eventTime) return "TBD";
  const [start] = workshop.eventTime.split("-").map((value) => value.trim());
  return formatTimeWithZone(start || workshop.eventTime, workshop.eventDate, workshop.timezone);
}

function costLabel(workshop: AdminWorkshopRecord): string {
  if (workshop.isFree) return "Free";
  return formatCurrency(workshop.earlyBirdPriceCents ?? workshop.priceCents ?? 0);
}

function formatWorkshopMode(format: string): string {
  if (format === "VIRTUAL") return "Virtual";
  if (format === "HYBRID") return "Hybrid";
  return "In-Person";
}

export function AdminWorkshopRecordCard({
  workshop,
  appUrl,
  pendingApprovalId,
}: {
  workshop: AdminWorkshopRecord;
  appUrl: string;
  pendingApprovalId: string | null;
}) {
  return (
    <article role="listitem" className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/workshops/${workshop.id}`}
            className="inline-flex min-h-11 min-w-11 items-center break-words font-semibold text-primary"
            data-touch-target
          >
            {workshop.title}
          </Link>
          <p className="text-sm text-muted-foreground">
            {workshop.coach.firstName} {workshop.coach.lastName}
          </p>
        </div>
        <ResponsiveActionsMenu label="More workshop actions">
          {pendingApprovalId ? (
            <WorkshopApprovalActions
              approvalId={pendingApprovalId}
              workshopTitle={workshop.title}
              menuItems
            />
          ) : (
            <ResponsiveActionsItem asChild>
              <Link
                href={`/workshops/${workshop.id}/landing-pages`}
                className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm outline-none focus:bg-muted"
                data-touch-target
              >
                Edit workshop
              </Link>
            </ResponsiveActionsItem>
          )}
        </ResponsiveActionsMenu>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-sm min-[400px]:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Submitted</dt>
          <dd>{formatTimestamp(workshop.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Start date</dt>
          <dd>{formatEventDateUTC(workshop.eventDate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Start time</dt>
          <dd>{formatStartTime(workshop)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Category</dt>
          <dd>{workshop.workshopType?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Workshop type</dt>
          <dd>{workshop.pricingTier?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cost</dt>
          <dd>{costLabel(workshop)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Format</dt>
          <dd>{formatWorkshopMode(workshop.format)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Registrations</dt>
          <dd>
            <Link
              href={`/workshops/${workshop.id}#registrations`}
              className="inline-flex min-h-11 items-center text-primary hover:underline"
              data-touch-target
            >
              {workshop._count.registrations} / {workshop.maxAttendees}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="pt-1">
            <Badge
              className={`${getWorkshopStatusColor(workshop.status)} inline-block max-w-full whitespace-normal break-words`}
              variant="secondary"
            >
              {getWorkshopStatusLabel(workshop.status)}
            </Badge>
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-3 text-sm [&_button]:inline-flex [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:items-center [&_button]:justify-center">
        <span className="text-muted-foreground">Landing page</span>
        {workshop.landingPageSlug ? (
          <CopyUrlButton url={`${appUrl}/workshop/${workshop.landingPageSlug}`} />
        ) : (
          <span className="text-xs text-muted-foreground">Not published</span>
        )}
      </div>
    </article>
  );
}
