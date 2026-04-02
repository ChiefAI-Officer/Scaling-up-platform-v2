import { LandingPageData } from "@/types/landing-page";
import { SoloLandingPageTemplate } from "./solo-landing-page-template";
import { DuoLandingPageTemplate } from "./duo-landing-page-template";
import { BioPageTemplate } from "./bio-page-template";
import { ThankYouPageTemplate } from "./thank-you-page-template";

export function LandingPageRenderer({ data }: { data: LandingPageData }) {
    const coach = data.coaches?.[0];
    const workshop = data.workshop;

    switch (data.type) {
        case "SOLO":
            return (
                <SoloLandingPageTemplate
                    content={{
                        heroTitle: data.title,
                        heroSubtitle: data.subtitle,
                        coachName: coach?.name,
                        coachTitle: coach?.title,
                        coachPhoto: coach?.imageUrl,
                        aboutTitle: workshop?.title,
                        aboutDescription: workshop?.description,
                        benefits: workshop?.learningOutcomes,
                        eventDate: workshop?.date,
                        eventTime: workshop?.time,
                        registrationUrl: "#",
                    }}
                    workshop={{
                        id: "legacy",
                        title: data.title,
                        isFree: true,
                        priceCents: null,
                    }}
                    isPreview={false}
                />
            );

        case "DUO": {
            const coach2 = data.coaches?.[1];
            return (
                <DuoLandingPageTemplate
                    content={{
                        heroTitle: data.title,
                        subtitle: data.subtitle,
                        description: workshop?.description,
                        coach1: coach ? { name: coach.name, title: coach.title, photo: coach.imageUrl } : undefined,
                        coach2: coach2 ? { name: coach2.name, title: coach2.title, photo: coach2.imageUrl } : undefined,
                        eventDate: workshop?.date,
                        eventTime: workshop?.time,
                        whatItIs: workshop?.learningOutcomes,
                        ctaText: data.ctaText,
                        registrationUrl: "#",
                    }}
                    workshop={{
                        id: "legacy",
                        title: data.title,
                        isFree: true,
                        priceCents: null,
                    }}
                    isPreview={false}
                />
            );
        }

        case "BIO":
            return (
                <BioPageTemplate
                    content={{
                        coachName: coach?.name,
                        coachTitle: coach?.title,
                        biography: coach?.bio,
                        profileImageUrl: coach?.imageUrl,
                        showCtaButton: true,
                        ctaButtonText: data.ctaText || "Book a Call",
                    }}
                    isPreview={false}
                />
            );

        case "THANK_YOU":
            return (
                <ThankYouPageTemplate
                    content={{
                        headline: `You're Registered for ${data.title}!`,
                        subheadline: data.subtitle,
                    }}
                    workshop={{
                        id: "legacy",
                        title: data.title,
                        eventDate: workshop?.date || new Date().toISOString(),
                        eventTime: workshop?.time,
                        timezone: "UTC",
                        format: "VIRTUAL",
                        isFree: true,
                    }}
                    isPreview={false}
                />
            );

        default:
            return <div>Unknown Template Type</div>;
    }
}
