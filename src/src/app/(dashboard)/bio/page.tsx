export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function getCoaches() {
  return db.coach.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      company: true,
      profileImage: true,
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
  const coaches = await getCoaches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">BIO</h1>
        <p className="text-muted-foreground">Manage each coach&apos;s bio profile and landing-page details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coach Bio Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {coaches.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No coaches found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Coach
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Title / Credentials
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
                        {coach.company || "Not set"}
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

