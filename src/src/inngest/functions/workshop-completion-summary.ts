/**
 * Workshop Completion Summary (Sprint 6)
 *
 * Triggered when a workshop status changes to COMPLETED.
 * Sends admin an email summary with attendee list + revenue total.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendWorkshopCompletionSummary } from "@/services/notifications";

export const workshopCompletionSummary = inngest.createFunction(
    { id: "workshop-completion-summary", retries: 2 },
    { event: "workshop/completed" },
    async ({ event, step }) => {
        const { workshopId } = event.data;

        const summary = await step.run("build-summary", async () => {
            const workshop = await db.workshop.findUnique({
                where: { id: workshopId },
                include: {
                    coach: {
                        select: { firstName: true, lastName: true, email: true },
                    },
                    registrations: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true,
                            company: true,
                            paymentStatus: true,
                            amountPaidCents: true,
                            attended: true,
                        },
                        orderBy: { lastName: "asc" },
                    },
                },
            });

            if (!workshop) throw new Error(`Workshop ${workshopId} not found`);

            const totalRegistrations = workshop.registrations.length;
            const attended = workshop.registrations.filter((r) => r.attended).length;
            const totalRevenueCents = workshop.registrations.reduce(
                (sum, r) => sum + (r.amountPaidCents || 0),
                0
            );
            const paidCount = workshop.registrations.filter(
                (r) => r.paymentStatus === "COMPLETED"
            ).length;
            const freeCount = workshop.registrations.filter(
                (r) => r.paymentStatus === "FREE"
            ).length;

            return {
                workshopId: workshop.id,
                workshopTitle: workshop.title,
                workshopCode: workshop.workshopCode,
                eventDate: workshop.eventDate.toISOString(),
                coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
                totalRegistrations,
                attended,
                paidCount,
                freeCount,
                totalRevenueCents,
                attendees: workshop.registrations.map((r) => ({
                    name: `${r.firstName} ${r.lastName}`,
                    email: r.email,
                    company: r.company || "",
                    paid: r.paymentStatus === "COMPLETED",
                    amount: r.amountPaidCents || 0,
                    attended: r.attended,
                })),
            };
        });

        await step.run("send-summary-email", async () => {
            await sendWorkshopCompletionSummary(summary);
        });

        return {
            workshopId,
            totalRegistrations: summary.totalRegistrations,
            totalRevenueCents: summary.totalRevenueCents,
        };
    }
);
