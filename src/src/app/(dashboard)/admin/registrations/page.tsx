export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RegistrationsTable } from "./registrations-table";
import { Button } from "@/components/ui/button";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";

export default async function AdminRegistrationsPage() {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
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
    <div className={mobileResponsiveEnabled ? "min-w-0 max-w-full space-y-6" : "space-y-6"}>
      {mobileResponsiveEnabled ? <PageHeader responsiveEnabled title="Contacts" description="All confirmed registrations across all workshops." actions={<Button asChild variant="outline" className="min-h-11"><Link href="/api/registrations/export">Export All</Link></Button>} /> : <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            All confirmed registrations across all workshops.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/api/registrations/export">Export All</Link>
        </Button>
      </div>}
      <RegistrationsTable registrations={registrations} responsiveEnabled={mobileResponsiveEnabled} />
    </div>
  );
}
