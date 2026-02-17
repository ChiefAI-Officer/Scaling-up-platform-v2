import { db } from "@/lib/db";
import { requireCoach } from "@/lib/authorization";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { PortalWorkshopList } from "@/components/workshops/workshop-list-filters";

/**
 * My Workshops Page
 * Lists all workshops for the authenticated coach.
 * Sprint 2: Search + filter + Validated/Approved columns.
 */
export default async function MyWorkshopsPage() {
    const { coach } = await requireCoach();

    const workshops = await db.workshop.findMany({
        where: { coachId: coach.id },
        orderBy: { eventDate: "desc" },
        include: {
            workshopType: true,
            _count: { select: { registrations: true } },
        },
    });

    // Serialize dates for client component
    const serialized = workshops.map((w) => ({
        id: w.id,
        title: w.title,
        workshopCode: w.workshopCode,
        status: w.status,
        eventDate: w.eventDate.toISOString(),
        maxAttendees: w.maxAttendees,
        workshopType: w.workshopType ? { name: w.workshopType.name } : null,
        _count: w._count,
    }));

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Workshops</h1>
                    <p className="text-gray-500">Manage your upcoming and past events.</p>
                </div>
                <Link
                    href="/portal/request"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                    <PlusCircle className="w-5 h-5" /> Request New
                </Link>
            </div>

            <PortalWorkshopList workshops={serialized} />
        </div>
    );
}
