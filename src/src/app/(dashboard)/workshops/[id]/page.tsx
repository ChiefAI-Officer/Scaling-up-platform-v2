export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  formatDate,
  formatEventDate,
  formatCurrency,
  getWorkshopStatusColor,
  getWorkshopStatusLabel,
  parseJsonField,
  VenueAddress,
} from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CopyUrlButton } from "@/components/ui/copy-url-button";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";

const APP_URL =
  process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";
import { WorkshopActions } from "./workshop-actions";
import { QuickActions } from "./quick-actions";
import { RegistrationRemoveButton } from "./registration-remove-button";
import { WorkshopInlineEditForm } from "@/components/workshops/WorkshopInlineEditForm";
import { requireAuth } from "@/lib/authorization";

function executionStatusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
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

interface WorkshopDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkshopDetailPage({
  params,
}: WorkshopDetailPageProps) {
  const session = await requireAuth();
  const { id } = await params;

  const [workshop, categories, workflowAssignments] = await Promise.all([
    db.workshop.findUnique({
      where: { id },
      include: {
        coach: true,
        workshopType: true,
        pricingTier: { select: { name: true, amountCents: true } },
        registrations: {
          orderBy: { createdAt: "desc" },
        },
        tasks: {
          orderBy: { createdAt: "desc" },
        },
        landingPages: {
          select: {
            id: true,
            slug: true,
            status: true,
            template: true,
          },
        },
      },
    }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
  ]);

  if (!workshop) {
    notFound();
  }

  const completedPayments = workshop.registrations.filter(
    (r) => r.paymentStatus === "COMPLETED" || r.paymentStatus === "FREE"
  );
  const totalRevenue = workshop.registrations.reduce(
    (sum, r) => sum + (r.amountPaidCents || 0),
    0
  );

  // S3-08: Auto-lock 48h before event
  // eslint-disable-next-line react-hooks/purity
  const hoursUntilEvent = (new Date(workshop.eventDate).getTime() - Date.now()) / (1000 * 60 * 60);
  const isLocked = workshop.isLocked || (hoursUntilEvent >= 0 && hoursUntilEvent <= 48);

  return (
    <div className="space-y-6">
      {/* Header */}
      <FadeUp>
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/workshops"
              className="text-muted-foreground hover:text-foreground"
            >
              &larr; Workshops
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{workshop.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            {workshop.workshopCode && (
              <span className="font-mono text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {workshop.workshopCode}
              </span>
            )}
            <Badge
              className={getWorkshopStatusColor(workshop.status)}
              variant="secondary"
            >
              {getWorkshopStatusLabel(workshop.status)}
            </Badge>
            {isLocked && (
              <Badge className="bg-destructive/10 text-destructive" variant="secondary">
                Locked
              </Badge>
            )}
            <span className="text-muted-foreground">{workshop.workshopType?.name}</span>
          </div>
        </div>
        <WorkshopActions workshop={workshop} userRole={session.user.role} />
      </div>
      </FadeUp>

      {/* Warning: Workshop approved but no landing pages created */}
      {(workshop.status === "PRE_EVENT" || workshop.status === "APPROVED") && workshop.landingPages.length === 0 && (
        <Alert variant="warning" className="mt-4">
          <AlertTitle>No landing pages created</AlertTitle>
          <AlertDescription>
            This workshop was approved but no landing pages were generated during auto-build.
            Ensure active <Link href="/templates" className="underline font-medium">page templates</Link> exist, then re-trigger the build or create pages manually.
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Stats */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Event Date</p>
              <p className="text-xl font-semibold">{formatEventDate(workshop.eventDate)}</p>
              {workshop.eventTime && (
                <p className="text-muted-foreground">{workshop.eventTime}</p>
              )}
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Registrations</p>
              <p className="text-xl font-semibold">
                {workshop.registrations.filter(r => r.paymentStatus !== "PENDING").length} / {workshop.maxAttendees}
              </p>
              <p className="text-muted-foreground">
                {workshop.maxAttendees - workshop.registrations.filter(r => r.paymentStatus !== "PENDING").length} spots left
              </p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Revenue</p>
              <p className="text-xl font-semibold text-success">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="text-muted-foreground">{completedPayments.length} paid</p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Format</p>
              <p className="text-xl font-semibold">
                {workshop.format === "VIRTUAL"
                  ? "Virtual"
                  : workshop.format === "HYBRID"
                    ? "Hybrid"
                    : "In-Person"}
              </p>
              <p className="text-muted-foreground">{workshop.duration}</p>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      <FadeUp delay={0.15}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Workshop Details */}
          <Card>
            <CardHeader>
              <CardTitle>Workshop Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {workshop.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Description</p>
                  <p className="text-foreground whitespace-pre-wrap">
                    {workshop.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Coach</p>
                  <p className="text-foreground">
                    {workshop.coach.firstName} {workshop.coach.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">{workshop.coach.email}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pricing</p>
                  <p className="text-foreground">
                    {workshop.isFree
                      ? "Free"
                      : formatCurrency(workshop.priceCents || 0)}
                  </p>
                  {workshop.earlyBirdPriceCents && workshop.earlyBirdDeadline && (
                    <p className="text-sm text-muted-foreground">
                      Early bird: {formatCurrency(workshop.earlyBirdPriceCents)}{" "}
                      until {formatDate(workshop.earlyBirdDeadline)}
                    </p>
                  )}
                </div>
              </div>

              {workshop.format !== "VIRTUAL" && workshop.venueName && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Location</p>
                  <p className="text-foreground">{workshop.venueName}</p>
                  {workshop.venueAddress && (() => {
                    const address = parseJsonField<VenueAddress>(workshop.venueAddress);
                    return address && (
                      <p className="text-sm text-muted-foreground">
                        {address.street && <>{address.street}, </>}
                        {address.city}, {address.state} {address.zip}
                      </p>
                    );
                  })()}
                </div>
              )}

              {(() => {
                const soloPage = workshop.landingPages?.find((p) => p.template === "SOLO_LANDING");
                const copySlug = soloPage?.slug ?? workshop.landingPageSlug;
                return copySlug ? (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Landing Page</p>
                    <CopyUrlButton url={`${APP_URL}/workshop/${copySlug}`} />
                  </div>
                ) : null;
              })()}

              {session.user.role === "ADMIN" && (
                <WorkshopInlineEditForm
                  workshopId={workshop.id}
                  title={workshop.title}
                  description={workshop.description}
                  categoryId={workshop.categoryId}
                  format={workshop.format}
                  pricingTier={workshop.pricingTier ? { name: workshop.pricingTier.name, amountCents: workshop.pricingTier.amountCents } : null}
                  eventDate={workshop.eventDate.toISOString()}
                  eventTime={workshop.eventTime}
                  timezone={workshop.timezone}
                  virtualLink={workshop.virtualLink}
                  venueName={workshop.venueName}
                  venueAddress={workshop.venueAddress}
                  categories={categories}
                />
              )}
            </CardContent>
          </Card>

          {/* Registrations */}
          <Card id="registrations">
            <CardHeader>
              <CardTitle>Registrations ({workshop.registrations.filter((r) => r.status !== "PENDING_PAYMENT").length})</CardTitle>
            </CardHeader>
            <CardContent>
              {workshop.registrations.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No registrations yet
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Name
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Payment
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Date
                        </th>
                        {session.user.role === "ADMIN" && (
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {workshop.registrations.map((reg) => (
                        <tr key={reg.id}>
                          <td className="px-4 py-3">
                            {reg.firstName} {reg.lastName}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {reg.email}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={reg.status === "PENDING_PAYMENT" ? "warning" : "secondary"}>
                              {reg.status === "PENDING_PAYMENT" ? "Awaiting Payment" : reg.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                reg.paymentStatus === "COMPLETED" ||
                                  reg.paymentStatus === "FREE"
                                  ? "success"
                                  : "warning"
                              }
                            >
                              {reg.paymentStatus}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {formatDate(reg.createdAt)}
                          </td>
                          {session.user.role === "ADMIN" && (
                            <td className="px-4 py-3">
                              {reg.status !== "CANCELLED" && (
                                <RegistrationRemoveButton
                                  registrationId={reg.id}
                                  firstName={reg.firstName}
                                  lastName={reg.lastName}
                                  email={reg.email}
                                />
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Automation Tasks */}
          <Card>
            <CardHeader>
              <CardTitle>Automation Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {workshop.tasks.length === 0 ? (
                <p className="text-muted-foreground text-sm">No automation tasks yet</p>
              ) : (
                <div className="space-y-3">
                  {workshop.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-foreground">{task.taskType}</span>
                      <Badge
                        variant={
                          task.status === "COMPLETED"
                            ? "success"
                            : task.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workflow Status */}
          {workflowAssignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Workflow Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {workflowAssignments.map((assignment) => (
                    <div key={assignment.id}>
                      <p className="text-sm font-medium text-foreground mb-2">
                        {assignment.workflow.name}
                      </p>
                      {assignment.workflow.steps.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No steps</p>
                      ) : (
                        <div className="space-y-2">
                          {assignment.workflow.steps.map((step, index) => {
                            const execution = step.executions[0];
                            const status = execution?.status ?? "PENDING";
                            return (
                              <div key={step.id} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground mr-2">{index + 1}.</span>
                                <span className="flex-1 text-foreground truncate">
                                  {step.subject || step.stepType}
                                </span>
                                <Badge variant={executionStatusVariant(status)}>
                                  {status}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <QuickActions
                workshopId={workshop.id}
                workshopStatus={workshop.status}
                landingPageSlug={workshop.landingPageSlug}
                landingPages={workshop.landingPages}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      </FadeUp>
    </div>
  );
}
