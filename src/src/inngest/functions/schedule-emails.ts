import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendEmailTemplate } from "@/services/email-sender";

/**
 * Inngest Function: Schedule Email Sequence
 * Triggered when a registration is created.
 * Schedules the 5-email sequence based on workshop date.
 */
export const scheduleEmailSequence = inngest.createFunction(
    { id: "schedule-email-sequence" },
    { event: "registration/created" },
    async ({ event, step }) => {
        const { registrationId, workshopId, email, firstName } = event.data;

        // Step 1: Fetch workshop and registration details
        const workshop = await step.run("fetch-workshop", async () => {
            return await db.workshop.findUnique({
                where: { id: workshopId },
                include: {
                    coach: true,
                    workshopType: true,
                }
            });
        });

        if (!workshop) {
            throw new Error(`Workshop not found: ${workshopId}`);
        }

        const eventDate = new Date(workshop.eventDate);

        // Step 2: Registration confirmation email sent by dedicated handlers:
        //   FREE → handleRegistrationCreatedFree (with ICS)
        //   PAID → processPaymentCompleted chain (with ICS)

        // Step 3: Schedule "5 Days Before" email
        const fiveDaysBefore = new Date(eventDate.getTime() - 5 * 24 * 60 * 60 * 1000);
        if (fiveDaysBefore > new Date()) {
            await step.sleepUntil("wait-for-5-days-before", fiveDaysBefore);
            await step.run("send-5-days-before", async () => {
                await sendEmailTemplate({
                    to: email,
                    templateId: "pre-event-5-days",
                    variables: {
                        first_name: firstName,
                        workshop_name: workshop.title,
                        event_date: formatTimestamp(eventDate),
                        days_until: "5",
                    }
                });
            });
        }

        // Step 4: Schedule "1 Day Before" email
        const oneDayBefore = new Date(eventDate.getTime() - 1 * 24 * 60 * 60 * 1000);
        if (oneDayBefore > new Date()) {
            await step.sleepUntil("wait-for-1-day-before", oneDayBefore);
            await step.run("send-1-day-before", async () => {
                await sendEmailTemplate({
                    to: email,
                    templateId: "pre-event-1-day",
                    variables: {
                        first_name: firstName,
                        workshop_name: workshop.title,
                        venue_name: workshop.venueName || "TBD",
                        venue_address: workshop.venueAddress || "See registration confirmation for details",
                    }
                });
            });
        }

        // Step 5: Schedule "2 Hours Before" email
        const twoHoursBefore = new Date(eventDate.getTime() - 2 * 60 * 60 * 1000);
        if (twoHoursBefore > new Date()) {
            await step.sleepUntil("wait-for-2-hours-before", twoHoursBefore);
            await step.run("send-2-hours-before", async () => {
                await sendEmailTemplate({
                    to: email,
                    templateId: "pre-event-2-hours",
                    variables: {
                        first_name: firstName,
                        workshop_name: workshop.title,
                    }
                });
            });
        }

        // Step 6: Schedule "Post-Workshop" email (1 day after)
        const oneDayAfter = new Date(eventDate.getTime() + 1 * 24 * 60 * 60 * 1000);
        await step.sleepUntil("wait-for-post-event", oneDayAfter);
        await step.run("send-post-event", async () => {
            // Use default survey URL
            const surveyUrl = `${process.env.TYPEFORM_BASE_URL}/workshop-feedback`;

            await sendEmailTemplate({
                to: email,
                templateId: "post-event-survey",
                variables: {
                    first_name: firstName,
                    workshop_name: workshop.title,
                    coach_name: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
                    survey_url: surveyUrl,
                }
            });
        });

        return {
            success: true,
            emailsScheduled: 5,
            registrationId
        };
    }
);

function formatTimestamp(date: Date): string {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

export default scheduleEmailSequence;
