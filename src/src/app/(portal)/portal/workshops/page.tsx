import { db } from "@/lib/db";
import { requireCoach } from "@/lib/authorization";
import Link from "next/link";
import { PlusCircle, Search, SlidersHorizontal, CheckCircle2, Circle } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";

/**
 * My Workshops Page
 * Lists all workshops for the authenticated coach.
 * Sprint 2: Adds "Validated" and "Approved" columns per Figma requirements.
 * Sprint 3: Uses StatusPill component, revenue data hidden (only attendee counts).
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

            {/* Filters & Search */}
            <div className="flex gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search workshops..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                    <SlidersHorizontal className="w-4 h-4" /> Filters
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Workshop</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Registrations</th>
                            {/* Validated and Approved columns per Figma */}
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Validated</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Approved</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {workshops.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                    No workshops found. Request your first one above!
                                </td>
                            </tr>
                        ) : (
                            workshops.map((workshop) => {
                                const isValidated = ["VALIDATING", "APPROVED", "SCHEDULED", "LIVE", "COMPLETED"].includes(workshop.status);
                                const isApproved = ["APPROVED", "SCHEDULED", "LIVE", "COMPLETED"].includes(workshop.status);

                                return (
                                    <tr key={workshop.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{workshop.title}</div>
                                            <div className="text-sm text-gray-500">{workshop.workshopType.name}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {new Date(workshop.eventDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {/* Sprint 3: Revenue hidden - only show attendee count */}
                                            <div className="font-medium">{workshop._count.registrations}</div>
                                            <div className="text-xs text-gray-400">of {workshop.maxAttendees} max</div>
                                        </td>

                                        {/* Validated Column */}
                                        <td className="px-6 py-4 text-center">
                                            {isValidated ? (
                                                <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                                            ) : (
                                                <Circle className="w-5 h-5 text-gray-300 mx-auto" />
                                            )}
                                        </td>

                                        {/* Approved Column */}
                                        <td className="px-6 py-4 text-center">
                                            {isApproved ? (
                                                <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                                            ) : (
                                                <Circle className="w-5 h-5 text-gray-300 mx-auto" />
                                            )}
                                        </td>

                                        {/* Sprint 3: Using StatusPill component */}
                                        <td className="px-6 py-4">
                                            <StatusPill status={workshop.status} />
                                        </td>

                                        <td className="px-6 py-4 text-right">
                                            <Link
                                                href={`/portal/workshops/${workshop.id}`}
                                                className="text-sm font-medium text-blue-600 hover:text-blue-700"
                                            >
                                                Manage
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
