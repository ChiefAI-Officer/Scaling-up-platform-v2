import { requireCoach } from "@/lib/authorization";
import { NewWorkshopForm } from "@/app/(dashboard)/workshops/new/page";

export default async function RequestWorkshopPage() {
    await requireCoach();

    return (
        <div className="max-w-3xl mx-auto">
            <NewWorkshopForm isCoachPortal={true} />
        </div>
    );
}
