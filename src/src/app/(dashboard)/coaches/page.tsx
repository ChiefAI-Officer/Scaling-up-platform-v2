export const dynamic = 'force-dynamic';

import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
  ResponsiveRecord,
  ResponsiveRecordActions,
  ResponsiveRecordHeader,
  ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";
import { ResponsiveActionsItem } from "@/components/ui/responsive-actions-menu";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

async function getCoaches() {
  return db.coach.findMany({
    include: {
      certifications: {
        include: {
          workshopType: true,
        },
      },
      _count: {
        select: { workshops: true },
      },
    },
    orderBy: { lastName: "asc" },
  });
}

function getCertificationStatusColor(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-success/10 text-success";
    case "PENDING":
      return "bg-warning/10 text-warning";
    case "EXPIRED":
      return "bg-destructive/10 text-destructive";
    case "SUSPENDED":
      return "bg-muted text-foreground";
    default:
      return "bg-muted text-foreground";
  }
}


export default async function CoachesPage() {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  const coaches = await getCoaches();

  return (
    <div className={mobileResponsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"}>
      <FadeUp>
        {mobileResponsiveEnabled ? (
          <PageHeader
            responsiveEnabled
            title="Coaches"
            description="Manage certified coaches"
            actions={
              <Link
                href="/coaches/new"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                + Add Coach
              </Link>
            }
          />
        ) : (
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Coaches</h1>
              <p className="text-muted-foreground">Manage certified coaches</p>
            </div>
            <Link
              href="/coaches/new"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              + Add Coach
            </Link>
          </div>
        )}
      </FadeUp>

      {/* Stats */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Coaches</p>
              <p className="text-2xl font-bold">{coaches.length}</p>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-success">
                {coaches.filter((c) => c.certificationStatus === "ACTIVE").length}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-warning">
                {coaches.filter((c) => c.certificationStatus === "PENDING").length}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Coaches Table */}
      <FadeUp delay={0.15}>
      <Card>
        <CardHeader>
          <CardTitle>All Coaches</CardTitle>
        </CardHeader>
        <CardContent>
          {coaches.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No coaches yet.{" "}
              <Link href="/coaches/new" className="text-primary hover:underline">
                Add your first coach
              </Link>
            </p>
          ) : (
            <ResponsiveDataView
              enabled={mobileResponsiveEnabled}
              label="Coaches"
              wideFrom="md"
              compact={
                <div className="space-y-3">
                  {coaches.map((coach) => (
                    <ResponsiveRecord key={coach.id}>
                      <ResponsiveRecordHeader
                        title={`${coach.firstName} ${coach.lastName}`}
                        status={
                          <Badge
                            className={getCertificationStatusColor(coach.certificationStatus)}
                            variant="secondary"
                          >
                            {coach.certificationStatus}
                          </Badge>
                        }
                      />
                      <ResponsiveRecordMeta
                        items={[
                          { label: "Email", value: coach.email },
                          { label: "Workshops", value: coach._count.workshops },
                        ]}
                      />
                      <ResponsiveRecordActions
                        primary={
                          <Link
                            href={`/coaches/${coach.id}`}
                            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            View coach
                          </Link>
                        }
                        menuLabel={`More actions for ${coach.firstName} ${coach.lastName}`}
                        secondary={
                          <ResponsiveActionsItem asChild>
                            <Link
                              href={`/coaches/${coach.id}/edit`}
                              className="flex min-h-11 w-full items-center px-3 text-sm"
                            >
                              Edit coach
                            </Link>
                          </ResponsiveActionsItem>
                        }
                      />
                    </ResponsiveRecord>
                  ))}
                </div>
              }
              wide={
                <div
                  className="overflow-x-auto"
                  role={mobileResponsiveEnabled ? "region" : undefined}
                  aria-label={mobileResponsiveEnabled ? "Coaches table" : undefined}
                  tabIndex={mobileResponsiveEnabled ? 0 : undefined}
                >
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Coach
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Certification
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Certifications
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Workshops
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coaches.map((coach) => (
                    <tr key={coach.id} className="hover:bg-accent">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {coach.firstName[0]}
                              {coach.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <Link
                              href={`/coaches/${coach.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {coach.firstName} {coach.lastName}
                            </Link>
                            <p className="text-sm text-muted-foreground">{coach.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          className={getCertificationStatusColor(
                            coach.certificationStatus
                          )}
                          variant="secondary"
                        >
                          {coach.certificationStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {coach.certifications.length === 0 ? (
                            <span className="text-muted-foreground text-sm">None</span>
                          ) : (
                            coach.certifications.map((cert) => (
                              <Badge
                                key={cert.id}
                                variant="outline"
                                className="text-xs"
                              >
                                {cert.workshopType.name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {coach._count.workshops}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              }
            />
          )}
        </CardContent>
      </Card>
      </FadeUp>
    </div>
  );
}
