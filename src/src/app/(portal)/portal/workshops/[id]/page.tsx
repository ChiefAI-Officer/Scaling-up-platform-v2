export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { CancelWorkshopDialog } from "@/components/workshops/cancel-workshop-dialog";
import { ResubmitWorkshop } from "@/components/workshops/resubmit-workshop";
import { CounterOfferCard } from "@/components/workshops/counter-offer-card";
import { CopyUrlButton } from "@/components/ui/copy-url-button";
import { InlineEditDescription } from "@/components/workshops/inline-edit-description";
import { getSessionDownloadPath } from "@/lib/files/file-download-path";
import { getWorkshopStatusExplanation, formatTimestamp, formatEventDateUTC, formatTimeWithZone } from "@/lib/utils";
import { formatStepLabel } from "@/lib/workflows/workflow-types";
import {
  calculateWorkshopRevenueSplit,
  formatUsdFromCents,
} from "@/lib/workshops/workshop-financials";
import { ApprovalThread } from "@/components/approvals/approval-thread";
import { CoachReplyForm } from "@/components/approvals/coach-reply-form";

const APP_URL = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";

interface WorkshopDetailsPageProps {
  params: Promise<{ id: string }>;
}

function executionStatusColor(status: string) {
  switch (status) {
    case "SENT":
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "destructive";
    case "SCHEDULED":
      return "warning";
    default:
      return "secondary";
  }
}

export default async function WorkshopDetailsPage({
  params,
}: WorkshopDetailsPageProps) {
  const { id } = await params;
  const { coach } = await requireCoach();

  const [workshop, workflowAssignments, surveyCount, latestDenial, workshopFiles, registrationFinancials, infoRequestedApproval, fallbackLandingPage, pendingPriceChange, approvalHistory] = await Promise.all([
    db.workshop.findFirst({
      where: { id, coachId: coach.id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        format: true,
        eventDate: true,
        eventTime: true,
        timezone: true,
        venueName: true,
        venueAddress: true,
        virtualLink: true,
        categoryId: true,
        landingPageSlug: true,
        maxAttendees: true,
        isFree: true,
        priceCents: true,
        pricingTierId: true,
        pricingTier: { select: { name: true, amountCents: true } },
        workshopType: { select: { name: true } },
        _count: { select: { registrations: { where: { paymentStatus: { not: "PENDING" } } } } },
        // ENH-MAY6-1: read-only registration list for the coach portal — same
        // columns as admin's table but no Cancel/Refund/Remove actions.
        registrations: {
          where: { paymentStatus: { not: "PENDING" } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true,
            paymentStatus: true,
            attended: true,
            attendedAt: true,
            createdAt: true,
            amountPaidCents: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    db.workflowAssignment.findMany({
      where: { workshopId: id },
      include: {
        workflow: {
          include: {
            steps: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
              include: {
                executions: {
                  // ENH-MAY6-10: filter to parent rows only — coach must never
                  // see per-recipient child rows (admin-only PII boundary).
                  where: { workshopId: id, parentId: null },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    }),
    db.survey.count({
      where: { workshopId: id, completedAt: { not: null } },
    }),
    db.approvalQueue.findFirst({
      where: {
        workshopId: id,
        // CANCELLATION denials are excluded: workshop stays active when cancellation is rejected (status is PRE_EVENT, not INFO_REQUESTED)
        type: { in: ["WORKSHOP_REQUEST", "CUSTOM_PRICING"] },
        status: "DENIED",
      },
      orderBy: { respondedAt: "desc" },
      select: {
        responseReason: true,
        notes: true,
        respondedAt: true,
      },
    }),
    // MR-29: Workshop files for download
    db.fileAttachment.findMany({
      where: { workshopId: id },
      select: { id: true, filename: true, contentType: true, sizeBytes: true, category: true },
      orderBy: { createdAt: "desc" },
    }),
    // MR-32: Financial summary from paid registrations
    db.registration.findMany({
      where: { workshopId: id, paymentStatus: "COMPLETED" },
      select: { amountPaidCents: true },
    }),
    // MR-33: INFO_REQUESTED approval for coach response form + thread
    db.approvalQueue.findFirst({
      where: { workshopId: id, status: "INFO_REQUESTED" },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true,
        notes: true,
        coachResponse: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    }),
    // Sprint 3: Fallback landing page URL in case landingPageSlug not yet set on workshop
    db.landingPage.findFirst({
      where: { workshopId: id },
      select: { slug: true },
      orderBy: { createdAt: "asc" },
    }),
    // FIG-007 + Counter-Offer: Check for pending or counter-offered CUSTOM_PRICING approval
    db.approvalQueue.findFirst({
      where: { workshopId: id, type: "CUSTOM_PRICING", status: { in: ["PENDING", "COUNTER_OFFERED"] } },
      select: { id: true, requestData: true, requestedAt: true, status: true, counterOfferCents: true, counterOfferNote: true },
      orderBy: { requestedAt: "desc" },
    }),
    // BUG-06–08: Full approval conversation history for coach view. The
    // earlier `status !== INFO_REQUESTED` filter de-duplicated against the
    // active info_requested view above, but it also dropped the message
    // thread for any approval still in INFO_REQUESTED. The helper-driven
    // wire-ups now seed messages into every approval, so de-dupe by the
    // active row's id instead.
    db.approvalQueue.findMany({
      where: {
        workshopId: id,
        type: { in: ["WORKSHOP_REQUEST", "CUSTOM_PRICING"] },
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { requestedAt: "asc" },
    }),
  ]);

  if (!workshop) {
    notFound();
  }

  const totalPaidCents = registrationFinancials.reduce(
    (sum, registration) => sum + (registration.amountPaidCents ?? 0),
    0
  );
  const revenueSplit = calculateWorkshopRevenueSplit(totalPaidCents);

  const priceChangeRequestData = (() => {
    try { return JSON.parse(pendingPriceChange?.requestData ?? "{}") as { newPriceCents?: number }; }
    catch { return {}; }
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{workshop.title}</h1>
          <p className="text-muted-foreground">{workshop.workshopType?.name}</p>
        </div>
        <div className="text-right">
          <StatusPill status={workshop.status} />
          <p className="text-xs text-muted-foreground mt-1">
            {getWorkshopStatusExplanation(workshop.status)}
          </p>
        </div>
      </div>

      {/* Fix #2: Post-approval lockdown banner */}
      {["PRE_EVENT", "POST_EVENT", "COMPLETED"].includes(workshop.status) && (
        <div className="rounded-xl border border-border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            This workshop is approved. Only attendee management is available.
            For other changes, contact your admin.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Event Details
          </h2>
          <div className="space-y-2 text-sm text-foreground">
            <p>
              <span className="font-medium">Date:</span>{" "}
              {formatEventDateUTC(workshop.eventDate)}
            </p>
            <p>
              <span className="font-medium">Time:</span>{" "}
              {formatTimeWithZone(workshop.eventTime, workshop.eventDate, workshop.timezone)}
            </p>
            <p>
              <span className="font-medium">Format:</span> {workshop.format}
            </p>
            <p>
              <span className="font-medium">Price:</span>{" "}
              {workshop.isFree
                ? "Free"
                : workshop.priceCents !== null && workshop.priceCents !== undefined
                  ? workshop.pricingTier
                    ? `${formatUsdFromCents(workshop.priceCents)} — ${workshop.pricingTier.name}`
                    : formatUsdFromCents(workshop.priceCents)
                  : workshop.pricingTier
                    ? workshop.pricingTier.name
                    : "TBD"}
            </p>
            {workshop.format !== "VIRTUAL" && (
              <p>
                <span className="font-medium">Venue:</span>{" "}
                {workshop.venueName || "To be announced"}
              </p>
            )}
            {workshop.virtualLink && (
              <p>
                <span className="font-medium">Meeting URL:</span>{" "}
                <a
                  href={workshop.virtualLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline break-all"
                >
                  {workshop.virtualLink}
                </a>
              </p>
            )}
          </div>
          {["PRE_EVENT", "POST_EVENT", "COMPLETED"].includes(workshop.status) &&
            (workshop.landingPageSlug || fallbackLandingPage?.slug) && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-1">Landing Page URL</p>
              <div className="flex items-center gap-2">
                <CopyUrlButton url={`${APP_URL}/workshop/${workshop.landingPageSlug ?? fallbackLandingPage!.slug}`} />
                <a
                  href={`${APP_URL}/workshop/${workshop.landingPageSlug ?? fallbackLandingPage!.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:text-primary/80 underline"
                >
                  Open ↗
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Registrations
          </h2>
          <p className="text-3xl font-semibold text-foreground">
            {workshop._count.registrations}
          </p>
          <p className="text-sm text-muted-foreground">of {workshop.maxAttendees} max attendees</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </h2>
        {["REQUESTED", "AWAITING_APPROVAL", "INFO_REQUESTED", "DENIED"].includes(workshop.status) ? (
          <InlineEditDescription
            workshopId={workshop.id}
            initialValue={workshop.description || ""}
          />
        ) : (
          <p className="text-sm text-foreground">
            {workshop.description || "No workshop description provided yet."}
          </p>
        )}
      </div>

      {/* MR-32: Financials card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Financials
        </h2>
        {workshop.isFree ? (
          <p className="text-sm text-muted-foreground">This is a free workshop</p>
        ) : registrationFinancials.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed payments yet</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-semibold text-foreground">
                {formatUsdFromCents(revenueSplit.grossRevenueCents)}
              </p>
              <p className="text-sm text-muted-foreground">
                Gross revenue
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Scaling Up (25%)
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {formatUsdFromCents(revenueSplit.scalingUpShareCents)}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Coach (75%)
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {formatUsdFromCents(revenueSplit.coachShareCents)}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {registrationFinancials.length} paid registration{registrationFinancials.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* FIG-007 + Counter-Offer: Pending price change or counter-offer */}
      {pendingPriceChange?.status === "COUNTER_OFFERED" && pendingPriceChange.counterOfferCents && (
        <CounterOfferCard
          approvalId={pendingPriceChange.id}
          originalPriceCents={priceChangeRequestData.newPriceCents ?? 0}
          counterOfferCents={pendingPriceChange.counterOfferCents}
          counterOfferNote={pendingPriceChange.counterOfferNote}
        />
      )}
      {pendingPriceChange?.status === "PENDING" && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-warning">Price Change Pending Approval</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You have a price change request awaiting admin review. The current pricing remains active until approved.
            </p>
          </div>
          <Badge variant="warning">Pending</Badge>
        </div>
      )}

      {/* BUG-06–08: Full conversation history. De-dupe against the active
          info_requested approval (rendered separately above) by id. */}
      {approvalHistory.some(
        (r) => r.messages.length > 0 && r.id !== infoRequestedApproval?.id
      ) && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Conversation History
          </h2>
          <div className="space-y-6">
            {approvalHistory
              .filter((record) => record.id !== infoRequestedApproval?.id)
              .map((record) => {
              const msgs = record.messages.map((m) => ({
                ...m,
                createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
              }));
              if (!msgs.length) return null;
              return (
                <div key={record.id}>
                  <p className="text-xs text-muted-foreground mb-1">
                    {record.requestedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {record.type === "CUSTOM_PRICING" && (
                      <span className="ml-2 font-medium">(Custom Pricing Request)</span>
                    )}
                  </p>
                  <ApprovalThread messages={msgs} perspective="coach" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FIG-009: Full edit form for INFO_REQUESTED status — includes conversation thread */}
      {workshop.status === "INFO_REQUESTED" && infoRequestedApproval && !latestDenial && (
        <>
          <ApprovalThread
            messages={(infoRequestedApproval.messages ?? []).map((m) => ({
              ...m,
              createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
            }))}
          />
          <CoachReplyForm approvalId={infoRequestedApproval.id} />
          <ResubmitWorkshop
            variant="info_requested"
            workshopId={workshop.id}
            approvalId={infoRequestedApproval.id}
            adminMessage={infoRequestedApproval.notes ?? null}
            title={workshop.title}
            description={workshop.description}
            eventDate={workshop.eventDate.toISOString()}
            eventTime={workshop.eventTime}
            timezone={workshop.timezone}
            venueName={workshop.venueName}
            venueAddress={workshop.venueAddress}
            virtualLink={workshop.virtualLink}
            categoryId={workshop.categoryId}
            format={workshop.format}
            priceCents={workshop.priceCents}
            isFree={workshop.isFree}
            pricingTierId={workshop.pricingTierId}
          />
        </>
      )}

      {/* ENH-MAY6-1: read-only registrations list — coach can see who registered for their workshop, no Cancel/Refund/Remove actions (admin-only). */}
      {workshop.registrations.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Registrations ({workshop.registrations.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Company</th>
                  <th className="pb-2 pr-4">Payment</th>
                  <th className="pb-2 pr-4">Attended</th>
                  <th className="pb-2">Registered</th>
                </tr>
              </thead>
              <tbody>
                {workshop.registrations.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground truncate max-w-[200px]">{r.email}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.company || "—"}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.paymentStatus === "COMPLETED" || r.paymentStatus === "FREE"
                            ? "bg-success/10 text-success"
                            : r.paymentStatus === "FAILED"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.paymentStatus}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {r.attended ? "✓" : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {formatTimestamp(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MR-29: Workshop files for download */}
      {workshopFiles.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Workshop Files
          </h2>
          <div className="space-y-2">
            {workshopFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between text-sm">
                <div>
                  <a
                    href={getSessionDownloadPath(file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:text-primary/80"
                  >
                    {file.filename}
                  </a>
                  {file.category && (
                    <span className="ml-2 text-xs text-muted-foreground">[{file.category}]</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {file.sizeBytes < 1024 * 1024
                    ? `${(file.sizeBytes / 1024).toFixed(1)} KB`
                    : `${(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CHG-01: DENIED + CANCELED workshops no longer support resubmit. Coach
          must submit a fresh request via /portal/request so the original
          workshop's history stays intact for audit. */}
      {(workshop.status === "CANCELED" || workshop.status === "DENIED") && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-semibold text-destructive">
              {workshop.status === "DENIED" ? "Denied" : "Canceled"}
            </span>
            <h2 className="text-sm font-semibold text-destructive">
              {workshop.status === "DENIED" ? "Workshop denied" : "Workshop canceled"}
            </h2>
          </div>
          {workshop.status === "DENIED" && (latestDenial?.responseReason || latestDenial?.notes) && (
            <div className="text-sm text-destructive bg-white/60 rounded-lg p-3 border border-destructive/20">
              <span className="font-medium">Reason: </span>
              {latestDenial?.responseReason || latestDenial?.notes}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            This workshop can&apos;t be re-opened. To run a similar event, please submit a new workshop request.
          </p>
          <Link
            href="/portal/request"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90"
          >
            Submit a new request
          </Link>
        </div>
      )}

      {/* Workflow Status Timeline */}
      {workflowAssignments.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Workflow Status
          </h2>
          <div className="space-y-4">
            {workflowAssignments.map((assignment) => (
              <div key={assignment.id}>
                <h3 className="text-sm font-medium text-foreground mb-2">
                  {assignment.workflow.name}
                </h3>
                {assignment.workflow.steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No steps configured</p>
                ) : (
                  <div className="space-y-2">
                    {assignment.workflow.steps.map((step, index) => {
                      const execution = step.executions[0];
                      const status = execution?.status ?? "PENDING";
                      return (
                        <div key={step.id} className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground w-6 text-right">
                            {index + 1}.
                          </span>
                          <span className="flex-1 text-foreground">
                            {formatStepLabel(step)}
                          </span>
                          <Badge variant={executionStatusColor(status)}>
                            {status}
                          </Badge>
                          {execution?.scheduledFor && status === "SCHEDULED" && (
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(execution.scheduledFor)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/portal/workshops"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Back to Workshops
        </Link>
        {["PRE_EVENT", "POST_EVENT", "COMPLETED"].includes(workshop.status) && (
          <Link
            href="/portal/registrations"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            View Registrations
          </Link>
        )}
        {surveyCount > 0 && (
          <Link
            href={`/portal/workshops/${workshop.id}/surveys`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Survey Results ({surveyCount})
          </Link>
        )}
        {["INFO_REQUESTED", "AWAITING_APPROVAL", "DENIED"].includes(workshop.status) && (
          <CancelWorkshopDialog
            workshopId={workshop.id}
            workshopTitle={workshop.title}
            eventDate={workshop.eventDate.toISOString()}
          />
        )}
      </div>
    </div>
  );
}
