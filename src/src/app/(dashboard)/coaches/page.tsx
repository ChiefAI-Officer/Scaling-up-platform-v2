export const dynamic = 'force-dynamic';

import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";

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
      return "bg-green-100 text-green-800";
    case "PENDING":
      return "bg-yellow-100 text-yellow-800";
    case "EXPIRED":
      return "bg-red-100 text-red-800";
    case "SUSPENDED":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case "CURRENT":
      return "bg-green-100 text-green-800";
    case "PENDING":
      return "bg-yellow-100 text-yellow-800";
    case "OVERDUE":
      return "bg-red-100 text-red-800";
    case "GRACE_PERIOD":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default async function CoachesPage() {
  const coaches = await getCoaches();

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Coaches</h1>
            <p className="text-gray-600">Manage certified coaches</p>
          </div>
          <Link
            href="/coaches/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Add Coach
          </Link>
        </div>
      </FadeUp>

      {/* Stats */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Total Coaches</p>
              <p className="text-2xl font-bold">{coaches.length}</p>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {coaches.filter((c) => c.certificationStatus === "ACTIVE").length}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {coaches.filter((c) => c.certificationStatus === "PENDING").length}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Payment Overdue</p>
              <p className="text-2xl font-bold text-red-600">
                {coaches.filter((c) => c.paymentStatus === "OVERDUE").length}
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
            <p className="text-gray-500 text-center py-8">
              No coaches yet.{" "}
              <Link href="/coaches/new" className="text-blue-600 hover:underline">
                Add your first coach
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Coach
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Certification
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Payment
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Certifications
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Workshops
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {coaches.map((coach) => (
                    <tr key={coach.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600">
                              {coach.firstName[0]}
                              {coach.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <Link
                              href={`/coaches/${coach.id}`}
                              className="font-medium text-gray-900 hover:text-blue-600"
                            >
                              {coach.firstName} {coach.lastName}
                            </Link>
                            <p className="text-sm text-gray-500">{coach.email}</p>
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
                        <Badge
                          className={getPaymentStatusColor(coach.paymentStatus)}
                          variant="secondary"
                        >
                          {coach.paymentStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {coach.certifications.length === 0 ? (
                            <span className="text-gray-400 text-sm">None</span>
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
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {coach._count.workshops}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </FadeUp>
    </div>
  );
}
