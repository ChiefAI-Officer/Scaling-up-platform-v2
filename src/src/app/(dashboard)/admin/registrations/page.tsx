export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RegistrationsTable } from "./registrations-table";
import { Button } from "@/components/ui/button";

export default async function AdminRegistrationsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const role = session.user?.role;
  if (!role || (role !== "ADMIN" && role !== "STAFF")) {
    redirect("/unauthorized");
  }

  const registrations = await db.registration.findMany({
    where: { paymentStatus: { not: "PENDING" } },
    include: {
      workshop: {
        select: {
          title: true,
          eventDate: true,
          coach: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            All confirmed registrations across all workshops.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/registrations/export">Export All</a>
        </Button>
      </div>
      <RegistrationsTable registrations={registrations} />
    </div>
  );
}
