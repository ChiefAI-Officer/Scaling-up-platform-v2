import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/authorization";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { CancelWorkshopDialog } from "@/components/workshops/cancel-workshop-dialog";
import { ResubmitWorkshop } from "@/components/workshops/resubmit-workshop";

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

  const [workshop, workflowAssignments, surveyCount, latestDenial] = await Promise.all([
    db.workshop.findFirst({
      where: { id, coachId: coach.id },
      include: {
        workshopType: true,
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
  ]);

  if (!workshop) {
    notFound();
  }

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
            <p>
              <span className="font-medium">Venue:</span>{" "}
              {workshop.venueName || "To be announced"}
            </p>
          </div>
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
        {["REQUESTED", "AWAITING_APPROVAL", "PRE_EVENT"].includes(workshop.status) && (
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
