import { db } from "@/lib/db";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Contacts | Scaling Up Platform",
    description: "Manage your contacts and leads",
};

export default async function ContactsPage() {
    const contacts = await db.contact.findMany({
        orderBy: { addedAt: 'desc' },
        take: 1000 // Limit for now
    });

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Contacts</h2>
            </div>
            <div className="hidden h-full flex-1 flex-col space-y-8 md:flex">
                <ContactsTable data={contacts} />
            </div>
        </div>
    );
}
