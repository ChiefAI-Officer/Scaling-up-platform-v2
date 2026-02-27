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
            window.open(`${window.location.origin}/workshop/${landingPageSlug}`, "_blank");
        } else {
            // Redirect to editor if not published or no slug
            router.push(`/workshops/${workshopId}/landing-pages`);
        }
    };

    const handleExport = () => {
        alert("Configuration Required\n\nExport functionality requires active Mailgun and AWS S3 configuration.");
    };

    return (
        <div className="space-y-2">
            <Button
                onClick={handleViewLandingPage}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
                {landingPageSlug && publishedPage ? "View Landing Page" : "Edit Landing Page"}
            </Button>

            <Button
                variant="secondary"
                onClick={handleExport}
                className="w-full bg-muted text-foreground hover:bg-accent border-0 justify-center"
            >
                Export Registrations
            </Button>
        </div>
    );
}
