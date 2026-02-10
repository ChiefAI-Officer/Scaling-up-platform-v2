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

function formatDate(value: Date): string {
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
        <h1 className="text-2xl font-bold text-gray-900">BIO</h1>
        <p className="text-gray-600">Manage each coach&apos;s bio profile and landing-page details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coach Bio Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {coaches.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No coaches found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Coach
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Title / Credentials
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Last Updated
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {coaches.map((coach) => (
                    <tr key={coach.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {coach.profileImage ? (
                            <img
                              src={coach.profileImage}
                              alt={`${coach.firstName} ${coach.lastName}`}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
                              {coach.firstName[0]}
                              {coach.lastName[0]}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">
                              {coach.firstName} {coach.lastName}
                            </p>
                            <p className="text-sm text-gray-500">{coach.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {coach.company || "Not set"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formatDate(coach.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/bio/${coach.id}`}
                          className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
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

