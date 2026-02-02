/**
 * Email Template Type Definitions
 * Shared types for all email templates.
 */

export interface EmailTemplateProps {
    attendeeName: string;
    workshopTitle: string;
    coachName: string;
    eventDate: string;
    eventTime: string;
    surveyLink?: string;
    zoomLink?: string;
    workshopId?: string;
    registrationId?: string;
}

export interface EmailSequenceConfig {
    templates: {
        reminder5Days: {
            subject: string;
            trigger: { daysBefore: number };
        };
        reminder24Hours: {
            subject: string;
            trigger: { hoursBefore: number };
        };
        zoomLink: {
            subject: string;
            trigger: { hoursBefore: number };
        };
        reminder2Hours: {
            subject: string;
            trigger: { hoursBefore: number };
        };
        postWorkshop: {
            subject: string;
            trigger: { daysAfter: number };
        };
    };
}

/**
 * Default email sequence configuration
 * Matches the 5-email sequence from Kajabi screenshots
 */
export const defaultEmailSequence: EmailSequenceConfig = {
    templates: {
        reminder5Days: {
            subject: "Reminder: Your Workshop is in 5 Days",
            trigger: { daysBefore: 5 },
        },
        reminder24Hours: {
            subject: "It's almost here! Your AI Workshop is just around the corner",
            trigger: { hoursBefore: 24 },
        },
        zoomLink: {
            subject: "Your Zoom Link for the Scaling Up with AI Workshop Tomorrow",
            trigger: { hoursBefore: 24 },
        },
        reminder2Hours: {
            subject: "We start in 2 hours!",
            trigger: { hoursBefore: 2 },
        },
        postWorkshop: {
            subject: "Scaling Up with AI - Post-Workshop Survey",
            trigger: { daysAfter: 1 },
        },
    },
};
