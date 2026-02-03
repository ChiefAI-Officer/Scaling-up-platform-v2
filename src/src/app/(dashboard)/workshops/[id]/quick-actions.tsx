"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface QuickActionsProps {
    workshopId: string;
    landingPageSlug: string | null;
    landingPages: Array<{
        id: string;
        slug: string;
        status: string;
    }>;
}

export function QuickActions({
    workshopId,
    landingPageSlug,
    landingPages,
}: QuickActionsProps) {
    const router = useRouter();
    const publishedPage = landingPages.find((p) => p.status === "PUBLISHED" && p.slug === landingPageSlug);

    const handleViewLandingPage = () => {
        if (landingPageSlug && publishedPage) {
            window.open(`/workshop/${landingPageSlug}`, "_blank");
        } else {
            // Redirect to editor if not published or no slug
            router.push(`/workshops/${workshopId}/landing-pages`);
        }
    };

    const handleExport = () => {
        alert("Configuration Required\n\nExport functionality requires active Mailgun and AWS S3 configuration.");
    };

    const handleReminder = () => {
        alert("Configuration Required\n\nSending reminders requires active HubSpot and Mailgun integration.");
    };

    return (
        <div className="space-y-2">
            <Button
                onClick={handleViewLandingPage}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
                {landingPageSlug && publishedPage ? "View Landing Page" : "Edit Landing Page"}
            </Button>

            <Button
                variant="secondary"
                onClick={handleExport}
                className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200 border-0 justify-center"
            >
                Export Registrations
            </Button>

            <Button
                variant="secondary"
                onClick={handleReminder}
                className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200 border-0 justify-center"
            >
                Send Reminder Email
            </Button>
        </div>
    );
}
