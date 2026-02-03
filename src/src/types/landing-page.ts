export type LandingPageType = 'SOLO' | 'DUO' | 'BIO' | 'THANK_YOU';

export interface CoachProfile {
    name: string;
    title: string;
    bio: string;
    imageUrl: string;
    company?: string;
}

export interface WorkshopDetails {
    title: string;
    date: string;
    time: string;
    location?: string;
    price?: string;
    description: string;
    learningOutcomes: string[];
    features: string[];
}

export interface LandingPageData {
    type: LandingPageType;
    heroImage?: string;
    title: string;
    subtitle?: string;
    coaches: CoachProfile[];
    workshop?: WorkshopDetails;
    // Specific sections text
    aboutText?: string;
    whoShouldAttendText?: string;
    ctaText?: string;
}
