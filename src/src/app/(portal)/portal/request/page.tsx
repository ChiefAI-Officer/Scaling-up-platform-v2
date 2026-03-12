import { requireCoach } from "@/lib/authorization";
import { db } from "@/lib/db";
import { NewWorkshopForm } from "@/app/(dashboard)/workshops/new/page";

export default async function RequestWorkshopPage() {
    const { coach } = await requireCoach();

    // Fetch coach with certifications server-side (avoids client fetching full coaches list)
    const coachWithCerts = await db.coach.findUnique({
        where: { id: coach.id },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            certifications: {
                select: { workshopTypeId: true, status: true },
            },
        },
    });

    if (!coachWithCerts) {
        return (
            <div className="max-w-3xl mx-auto p-6">
                <p className="text-destructive">No coach profile found for your account. Please contact admin.</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            <NewWorkshopForm isCoachPortal={true} prefilledCoach={coachWithCerts} />
        </div>
    );
}
