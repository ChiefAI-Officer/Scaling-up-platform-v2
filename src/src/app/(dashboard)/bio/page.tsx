export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
  ResponsiveRecord,
  ResponsiveRecordActions,
  ResponsiveRecordHeader,
  ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { getCoachBioMissingFields } from "@/lib/validations";

async function getCoaches() {
  return db.coach.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      title: true,
      company: true,
      profileImage: true,
      bio: true,
      linkedinUrl: true,
      updatedAt: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default async function BioPageIndex() {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  const coaches = await getCoaches();

  return (
    <div className={mobileResponsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"}>
      {mobileResponsiveEnabled ? (
        <PageHeader
          responsiveEnabled
          title="BIO"
          description="Manage each coach's bio profile and landing-page details."
        />
      ) : (
      <div>
        <h1 className="text-2xl font-bold text-foreground">BIO</h1>
        <p className="text-muted-foreground">Manage each coach&apos;s bio profile and landing-page details.</p>
      </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Coach Bio Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {coaches.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No coaches found.</p>
          ) : mobileResponsiveEnabled ? (
            <ResponsiveDataView
              enabled
              label="Coach bio profiles"
              wideFrom="md"
              compact={
                <div className="space-y-3">
                  {coaches.map((coach) => {
                    const name = `${coach.firstName} ${coach.lastName}`;
                    const complete = getCoachBioMissingFields(coach).length === 0;

                    return (
                      <ResponsiveRecord key={coach.id}>
                        <ResponsiveRecordHeader
                          title={name}
                          status={
                            <Badge variant={complete ? "success" : "warning"}>
                              {complete ? "Complete" : "Incomplete"}
                            </Badge>
                          }
                        />
                        <ResponsiveRecordMeta
                          items={[
                            { label: "Title", value: coach.title || "—" },
                            { label: "Company", value: coach.company || "—" },
                          ]}
                        />
                        <ResponsiveRecordActions
                          primary={
                            <Link
                              href={`/bio/${coach.id}`}
                              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              View bio
                            </Link>
                          }
                        />
                      </ResponsiveRecord>
                    );
                  })}
                </div>
              }
              wide={
                <Table responsiveEnabled regionLabel="Coach bio profiles table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Coach</TableHead>
                      <TableHead>Professional Title</TableHead>
                      <TableHead>Company Name</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coaches.map((coach) => (
                      <TableRow key={coach.id}>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-3">
                            {coach.profileImage ? (
                              <img
                                src={coach.profileImage}
                                alt={`${coach.firstName} ${coach.lastName}`}
                                className="h-10 w-10 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                {coach.firstName[0]}{coach.lastName[0]}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="break-words font-medium text-foreground">{coach.firstName} {coach.lastName}</p>
                              <p className="break-all text-sm text-muted-foreground">{coach.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{coach.title || "—"}</TableCell>
                        <TableCell>{coach.company || "—"}</TableCell>
                        <TableCell>{formatTimestamp(coach.updatedAt)}</TableCell>
                        <TableCell>
                          <Link href={`/bio/${coach.id}`} className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            Edit Bio
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Coach
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Professional Title
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Company Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Last Updated
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coaches.map((coach) => (
                    <tr key={coach.id} className="hover:bg-accent">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {coach.profileImage ? (
                            <img
                              src={coach.profileImage}
                              alt={`${coach.firstName} ${coach.lastName}`}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                              {coach.firstName[0]}
                              {coach.lastName[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-foreground">
                              {coach.firstName} {coach.lastName}
                            </p>
                            <p className="text-sm text-muted-foreground">{coach.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {coach.title || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {coach.company || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {formatTimestamp(coach.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/bio/${coach.id}`}
                          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Edit Bio
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
