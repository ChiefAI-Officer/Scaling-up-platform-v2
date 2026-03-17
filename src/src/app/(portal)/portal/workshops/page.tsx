import { db } from "@/lib/db";
import { requireCoach } from "@/lib/authorization";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { PortalWorkshopList } from "@/components/workshops/workshop-list-filters";
import { FadeUp } from "@/components/ui/animated";

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
            landingPages: { select: { slug: true }, take: 1 },
            pricingTier: { select: { name: true, amountCents: true } },
            // FIG-007: Check for pending CUSTOM_PRICING approvals
            approvals: {
                where: { type: "CUSTOM_PRICING", status: "PENDING" },
                select: { id: true },
                take: 1,
            },
        },
    });

    const APP_URL = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";

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
        landingPageUrl: w.landingPages[0]?.slug
            ? `${APP_URL}/workshop/${w.landingPages[0].slug}`
            : null,
        // FIG-007: Pricing display
        isFree: w.isFree,
        priceCents: w.priceCents,
        pricingTier: w.pricingTier ? { name: w.pricingTier.name, amountCents: w.pricingTier.amountCents } : null,
        hasPendingPriceChange: w.approvals.length > 0,
    }));

    return (
        <div className="space-y-6">
            <FadeUp>
              <div className="flex justify-between items-center">
                  <div>
                      <h1 className="text-2xl font-bold text-foreground">My Workshops</h1>
                      <p className="text-muted-foreground">Manage your upcoming and past events.</p>
                  </div>
                  <Link
                      href="/portal/request"
                      className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                  >
                      <PlusCircle className="w-5 h-5" /> Request New
                  </Link>
              </div>
            </FadeUp>

            <FadeUp delay={0.1}>
              <PortalWorkshopList workshops={serialized} />
            </FadeUp>
        </div>
    );
}
