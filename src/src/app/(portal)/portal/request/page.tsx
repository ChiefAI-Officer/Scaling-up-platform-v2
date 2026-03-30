import Link from "next/link";
import { requireCoach } from "@/lib/authorization";
import { db } from "@/lib/db";
import { getCoachBioMissingFields } from "@/lib/validations";
import { NewWorkshopForm } from "@/app/(dashboard)/workshops/new/page";

export default async function RequestWorkshopPage() {
    const { coach } = await requireCoach();

    const coachWithCerts = await db.coach.findUnique({
        where: { id: coach.id },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            title: true,
            linkedinUrl: true,
            bio: true,
            profileImage: true,
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

    const missingFields = getCoachBioMissingFields(coachWithCerts);

    if (missingFields.length > 0) {
        return (
            <div className="max-w-3xl mx-auto p-6 space-y-4">
                <h1 className="text-2xl font-bold text-foreground">Complete Your Profile First</h1>
                <p className="text-muted-foreground">
                    You must complete your coach profile before requesting a workshop.
                </p>
                <ul className="list-disc pl-5 text-sm text-destructive space-y-1">
                    {missingFields.map((msg, i) => (
                        <li key={i}>{msg}</li>
                    ))}
                </ul>
                <Link
                    href="/portal/settings"
                    className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Go to Settings
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            <NewWorkshopForm isCoachPortal={true} prefilledCoach={coachWithCerts} />
        </div>
    );
}
