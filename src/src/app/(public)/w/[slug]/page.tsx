import { LandingPageRenderer } from "@/components/templates/landing-page-renderer";
import { LandingPageData } from "@/types/landing-page";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";

// Mock Data Storage for Demo
const MOCK_PAGES: Record<string, LandingPageData> = {
    "rob-williams-solo": {
        type: "SOLO",
        title: "Exit Workshop: Preparing Your Business for Scale & Sale",
        subtitle: "A comprehensive workshop for diverse founders looking to maximize value.",
        coaches: [
            {
                name: "Rob Williams",
                title: "Scaling Up Certified Coach",
                bio: "Rob is a seasoned entrepreneur with over 20 years of experience...",
                imageUrl: "/images/rob-williams.jpg",
                company: "IronGate"
            }
        ],
        workshop: {
            title: "Exit Workshop",
            date: "March 4, 2026",
            time: "9:00 AM - 5:00 PM EST",
            description: "Join us for an immersive day...",
            learningOutcomes: [
                "Understand the 4 Pillars of Scaling Up",
                "Develop a One-Page Strategic Plan",
                "Master Your Cash Flow",
                "Calculate Your Valuation"
            ],
            features: []
        }
    },
    "jeff-lisa-duo": {
        type: "DUO",
        title: "AI & Leadership: The New Frontier",
        subtitle: "Learn how to leverage Artificial Intelligence while maintaining human-centric leadership.",
        ctaText: "Join the Masterclass",
        coaches: [
            {
                name: "Jeff Donaldson",
                title: "CEO & Growth Coach",
                bio: "Jeff has helped over 50 companies scale past $10M...",
                imageUrl: "/images/jeff.jpg",
                company: "Scaling Up"
            },
            {
                name: "Lisa Foulger",
                title: "Leadership Expert",
                bio: "Lisa specializes in executive team alignment and culture...",
                imageUrl: "/images/lisa.jpg",
                company: "Leadership Solutions"
            }
        ],
        workshop: {
            title: "AI & Leadership Workshop",
            date: "December 16, 2025",
            time: "1:00 PM - 4:00 PM EST",
            description: "This duo workshop combines tech and touch...",
            learningOutcomes: [
                "AI Implementation Strategy",
                "Leading Remote Teams",
                "Ethical AI Usage",
                "Change Management"
            ],
            features: []
        }
    },
    "claire-mula-bio": {
        type: "BIO",
        title: "Claire Mula - Profile",
        coaches: [
            {
                name: "Claire Mula",
                title: "Senior Strategy Coach",
                bio: "Claire brings a unique perspective to scaling...",
                imageUrl: "/images/claire.jpg",
                company: "Growth Partners"
            }
        ],
        workshop: { // Dummy needed for type
            title: "", date: "", time: "", description: "", learningOutcomes: [], features: []
        }
    },
    "thank-you-demo": {
        type: "THANK_YOU",
        title: "Exit Workshop",
        coaches: [],
        workshop: {
            title: "Exit Workshop",
            date: "March 4, 2026",
            time: "9:00 AM - 5:00 PM EST",
            description: "",
            learningOutcomes: [],
            features: []
        }
    }
};

interface PageProps {
    params: Promise<{ slug: string }>;
}

export default async function LandingPageComponent(props: PageProps) {
    const params = await props.params;
    const slug = params.slug;

    // 1. Try real DB — redirect to canonical URL if found and published
    const landingPage = await db.landingPage.findUnique({
        where: { slug },
        select: { slug: true, status: true },
    });
    if (landingPage?.status === "PUBLISHED") {
        redirect(`/workshop/${slug}`);
    }

    // 2. Fall back to demo mock data
    const mockData = MOCK_PAGES[slug];
    if (mockData) {
        return <LandingPageRenderer data={mockData} />;
    }

    return notFound();
}
