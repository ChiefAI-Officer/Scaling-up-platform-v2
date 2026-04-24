import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import {
  CoachRegistrationView,
  RegistrationsClient,
  SORT_ALLOWLIST,
} from "./registrations-client";
import { FadeUp } from "@/components/ui/animated";

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { coach } = await requireCoach();
  const params = await searchParams;

  // Strict allowlist — fall back to default on invalid values
  const rawSort = params.sort ?? "createdAt";
  const sortField = SORT_ALLOWLIST.includes(rawSort as (typeof SORT_ALLOWLIST)[number])
    ? (rawSort as (typeof SORT_ALLOWLIST)[number])
    : "createdAt";

  // Map sort field to Prisma orderBy
  type OrderByField = "createdAt" | "firstName" | "lastName" | "amountPaidCents";
  const orderByField: OrderByField =
    sortField === "amountPaidCents" ? "amountPaidCents" :
    sortField === "firstName" ? "firstName" :
    sortField === "lastName" ? "lastName" :
    "createdAt";
  const sortDir = sortField === "createdAt" ? "desc" : "asc";

  const registrations = await db.registration.findMany({
    where: {
      workshop: {
        coachId: coach.id,
      },
      paymentStatus: { not: "PENDING" },
    },
    orderBy: {
      [orderByField]: sortDir,
    },
    include: {
      workshop: {
        select: {
          id: true,
          title: true,
          eventDate: true,
        },
      },
    },
  });

  const rows: CoachRegistrationView[] = registrations.map((registration) => ({
    id: registration.id,
    workshopId: registration.workshop.id,
    workshopTitle: registration.workshop.title,
    workshopDate: registration.workshop.eventDate?.toISOString() ?? "",
    firstName: registration.firstName,
    lastName: registration.lastName,
    email: registration.email,
    company: registration.company,
    paymentStatus: registration.paymentStatus,
    amountPaidCents: registration.amountPaidCents ?? 0,
    status: registration.status,
    attended: registration.attended,
    registeredAt: registration.createdAt.toISOString(),
  }));

  return <FadeUp><RegistrationsClient registrations={rows} currentSort={sortField} /></FadeUp>;
}
