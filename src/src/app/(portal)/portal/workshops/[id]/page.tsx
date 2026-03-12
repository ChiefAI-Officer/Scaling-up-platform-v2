import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/authorization";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { CancelWorkshopDialog } from "@/components/workshops/cancel-workshop-dialog";
import { ResubmitWorkshop } from "@/components/workshops/resubmit-workshop";
import { CopyUrlButton } from "@/components/ui/copy-url-button";
import { CoachResponseForm } from "@/components/workshops/coach-response-form";
import { getSessionDownloadPath } from "@/lib/file-download-path";
import {
  calculateWorkshopRevenueSplit,
  formatUsdFromCents,
} from "@/lib/workshop-financials";

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

  const [workshop, workflowAssignments, surveyCount, latestDenial, workshopFiles, registrationFinancials, infoRequestedApproval, fallbackLandingPage] = await Promise.all([
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
        venueName: true,
        virtualLink: true,
        landingPageSlug: true,
        maxAttendees: true,
        isFree: true,
        workshopType: { select: { name: true } },
        _count: { select: { registrations: true } },
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
                  where: { workshopId: id },
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
        decision: "DENIED",
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
    // MR-33: INFO_REQUESTED approval for coach response form
    db.approvalQueue.findFirst({
      where: { workshopId: id, status: "INFO_REQUESTED" },
      orderBy: { requestedAt: "desc" },
      select: { id: true, notes: true, coachResponse: true },
    }),
    // Sprint 3: Fallback landing page URL in case landingPageSlug not yet set on workshop
    db.landingPage.findFirst({
      where: { workshopId: id },
      select: { slug: true },
      orderBy: { createdAt: "asc" },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{workshop.title}</h1>
          <p className="text-muted-foreground">{workshop.workshopType?.name}</p>
        </div>
        <StatusPill status={workshop.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Event Details
          </h2>
          <div className="space-y-2 text-sm text-foreground">
            <p>
              <span className="font-medium">Date:</span>{" "}
              {new Date(workshop.eventDate).toLocaleDateString()}
            </p>
            <p>
              <span className="font-medium">Time:</span> {workshop.eventTime || "TBD"}
            </p>
            <p>
              <span className="font-medium">Format:</span> {workshop.format}
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
          {(workshop.landingPageSlug || fallbackLandingPage?.slug) && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-1">Landing Page URL</p>
              <CopyUrlButton url={`${APP_URL}/workshop/${workshop.landingPageSlug ?? fallbackLandingPage!.slug}`} />
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
        <p className="text-sm text-foreground">
          {workshop.description || "No workshop description provided yet."}
        </p>
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

      {/* MR-33: Coach response to INFO_REQUESTED */}
      {workshop.status === "INFO_REQUESTED" && infoRequestedApproval && (
        <CoachResponseForm
          approvalId={infoRequestedApproval.id}
          existingResponse={infoRequestedApproval.coachResponse ?? null}
          adminQuestion={infoRequestedApproval.notes ?? null}
        />
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

      {/* Rejection + Resubmit */}
      {["CANCELED", "DENIED"].includes(workshop.status) && (
        <ResubmitWorkshop
          workshopId={workshop.id}
          rejectionReason={latestDenial?.responseReason || latestDenial?.notes || null}
          title={workshop.title}
          description={workshop.description}
          eventDate={workshop.eventDate.toISOString()}
          eventTime={workshop.eventTime}
          venueName={workshop.venueName}
        />
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
                            {step.subject || step.stepType}
                          </span>
                          <Badge variant={executionStatusColor(status)}>
                            {status}
                          </Badge>
                          {execution?.scheduledFor && status === "SCHEDULED" && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(execution.scheduledFor).toLocaleDateString()}
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
        <Link
          href="/portal/registrations"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          View Registrations
        </Link>
        {surveyCount > 0 && (
          <Link
            href={`/portal/workshops/${workshop.id}/surveys`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Survey Results ({surveyCount})
          </Link>
        )}
        {["INFO_REQUESTED", "AWAITING_APPROVAL", "PRE_EVENT"].includes(workshop.status) && (
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
