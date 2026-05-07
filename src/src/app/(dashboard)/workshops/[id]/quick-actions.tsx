"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const PRE_EVENT_AND_LATER = ["PRE_EVENT", "POST_EVENT", "COMPLETED"];

interface QuickActionsProps {
    workshopId: string;
    workshopStatus: string;
    landingPageSlug: string | null;
    landingPages: Array<{
        id: string;
        slug: string;
        status: string;
    }>;
}

export function QuickActions({
    workshopId,
    workshopStatus,
    landingPageSlug,
    landingPages,
}: QuickActionsProps) {
    const router = useRouter();

    const publishedPage = landingPages.find(
        (p) => p.status === "PUBLISHED" && p.slug === landingPageSlug
    );

    const showViewPublicPage =
        PRE_EVENT_AND_LATER.includes(workshopStatus) &&
        !!publishedPage &&
        !!landingPageSlug;

    const handleEditLandingPage = () => {
        router.push(`/workshops/${workshopId}/landing-pages`);
    };

    const handleViewSurveyResults = () => {
        router.push(`/workshops/${workshopId}/surveys`);
    };

    const handleViewPublicPage = () => {
        window.open(`/workshop/${landingPageSlug}`, "_blank");
    };

    const handleExport = () => {
        alert("Configuration Required\n\nExport functionality requires active Mailgun and AWS S3 configuration.");
    };

    return (
        <div className="space-y-2">
            <Button
                onClick={handleEditLandingPage}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
                Edit Landing Page
            </Button>

            {showViewPublicPage && (
                <Button
                    variant="secondary"
                    onClick={handleViewPublicPage}
                    className="w-full bg-muted text-foreground hover:bg-accent border-0 justify-center"
                >
                    View Public Page
                </Button>
            )}

            {/* BUG-MAY6-8: parity with coach — admin can now view per-workshop survey results */}
            <Button
                variant="secondary"
                onClick={handleViewSurveyResults}
                className="w-full bg-muted text-foreground hover:bg-accent border-0 justify-center"
            >
                View Survey Results
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
