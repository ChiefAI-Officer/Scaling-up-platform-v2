import { db } from "@/lib/db";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { Metadata } from "next";
import { FadeUp } from "@/components/ui/animated";
import { PageHeader } from "@/components/ui/page-header";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export const metadata: Metadata = {
    title: "Contacts | Scaling Up Platform",
    description: "Manage your contacts and leads",
};

export default async function ContactsPage() {
    const mobileResponsiveEnabled = isMobileResponsiveEnabled();
    const contacts = await db.contact.findMany({
        orderBy: { addedAt: 'desc' },
        take: 1000 // Limit for now
    });

    return (
        <div className={mobileResponsiveEnabled ? "min-w-0 flex-1 space-y-4 p-4 pt-6 sm:p-8" : "flex-1 space-y-4 p-8 pt-6"}>
            <FadeUp>
                {mobileResponsiveEnabled ? (
                    <PageHeader responsiveEnabled title="Contacts" />
                ) : (
                    <div className="flex items-center justify-between space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight">Contacts</h2>
                    </div>
                )}
            </FadeUp>
            <FadeUp delay={0.1}>
                <div className={mobileResponsiveEnabled ? "min-w-0 h-full flex-1 flex-col space-y-8" : "hidden h-full flex-1 flex-col space-y-8 md:flex"}>
                    <ContactsTable data={contacts} responsiveEnabled={mobileResponsiveEnabled} />
                </div>
            </FadeUp>
        </div>
    );
}
