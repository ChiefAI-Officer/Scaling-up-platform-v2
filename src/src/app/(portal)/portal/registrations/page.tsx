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

  const queryArgs = {
    where: {
      workshop: { coachId: coach.id },
      paymentStatus: { not: "PENDING" as const },
    },
    orderBy: { [orderByField]: sortDir } as Record<string, string>,
    include: {
      workshop: {
        select: { id: true, title: true, eventDate: true },
      },
    },
  } as const;

  type RegistrationRow = Awaited<ReturnType<typeof db.registration.findMany<typeof queryArgs>>>[number];

  let registrations: RegistrationRow[] = [];
  try {
    registrations = await db.registration.findMany(queryArgs);
  } catch (err) {
    console.error("[RegistrationsPage] db.registration.findMany failed:", err);
  }

  let rows: CoachRegistrationView[] = [];
  try {
    rows = registrations
      .filter((reg) => reg.workshop != null)
      .map((registration) => ({
        id: registration.id,
        workshopId: registration.workshop!.id,
        workshopTitle: registration.workshop!.title,
        workshopDate: registration.workshop!.eventDate?.toISOString() ?? "",
        firstName: registration.firstName,
        lastName: registration.lastName,
        email: registration.email,
        company: registration.company,
        paymentStatus: registration.paymentStatus,
        amountPaidCents: registration.amountPaidCents ?? 0,
        status: registration.status,
        attended: registration.attended ?? false,
        registeredAt: registration.createdAt?.toISOString() ?? "",
      }));
  } catch (err) {
    console.error("[RegistrationsPage] registration transform failed:", err);
    // rows stays [] — page renders empty rather than crashing
  }

  try {
    return <FadeUp><RegistrationsClient registrations={rows} currentSort={sortField} /></FadeUp>;
  } catch (err) {
    console.error("[RegistrationsPage] render failed:", err);
    return (
      <FadeUp>
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          <p className="text-sm">Unable to display registrations. Please refresh the page.</p>
        </div>
      </FadeUp>
    );
  }
}
