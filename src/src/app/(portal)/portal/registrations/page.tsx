import { db } from "@/lib/db";
import { requireCoach } from "@/lib/authorization";
import {
  CoachRegistrationView,
  RegistrationsClient,
} from "./registrations-client";
import { FadeUp } from "@/components/ui/animated";

export default async function RegistrationsPage() {
  const { coach } = await requireCoach();

  const registrations = await db.registration.findMany({
    where: {
      workshop: {
        coachId: coach.id,
      },
    },
    orderBy: {
      createdAt: "desc",
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
    workshopDate: registration.workshop.eventDate.toISOString(),
    firstName: registration.firstName,
    lastName: registration.lastName,
    email: registration.email,
    company: registration.company,
    paymentStatus: registration.paymentStatus,
    status: registration.status,
    registeredAt: registration.createdAt.toISOString(),
  }));

  return <FadeUp><RegistrationsClient registrations={rows} /></FadeUp>;
}
