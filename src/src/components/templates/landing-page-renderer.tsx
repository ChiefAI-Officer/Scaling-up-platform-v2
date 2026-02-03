import { LandingPageData } from "@/types/landing-page";
import { SoloLandingPage } from "./solo-landing-page";
import { DuoLandingPage } from "./duo-landing-page";
import { BioLandingPage } from "./bio-landing-page";
import { ThankYouLandingPage } from "./thank-you-landing-page";

export function LandingPageRenderer({ data }: { data: LandingPageData }) {
    switch (data.type) {
        case "SOLO":
            return <SoloLandingPage data={data} />;
        case "DUO":
            return <DuoLandingPage data={data} />;
        case "BIO":
            return <BioLandingPage data={data} />;
        case "THANK_YOU":
            return <ThankYouLandingPage data={data} />;
        default:
            return <div>Unknown Template Type</div>;
    }
}
