/**
 * Sample data for template preview rendering.
 * Used when editing PageTemplate content — replaces {{variable}} placeholders
 * with realistic sample values so editors can preview the result.
 */
export const TEMPLATE_PREVIEW_DATA: Record<string, string> = {
    // snake_case — matches {{placeholder}} format
    coach_name: "Jane Smith",
    coach_first_name: "Jane",
    coach_last_name: "Smith",
    coach_bio: "Jane is a certified Scaling Up coach with 15 years of experience helping businesses scale from startup to enterprise.",
    coach_email: "jane@example.com",
    coach_linkedin: "https://linkedin.com/in/jane-smith",
    coach_photo: "/globe.svg",
    coach_company: "Smith Consulting LLC",
    coach_title: "Scaling Up Certified Coach",
    workshop_title: "Sample: Scaling Up Masterclass",
    workshop_description: "An intensive workshop on the Rockefeller Habits methodology for scaling businesses.",
    event_day: "Thursday",
    event_date: "January 15, 2027",
    workshop_date: "January 15, 2027",
    event_time: "9:00 AM - 12:00 PM",
    workshop_time: "9:00 AM - 12:00 PM",
    workshop_format: "IN_PERSON",
    workshop_code: "WS-2027-DEMO",
    venue_name: "Grand Conference Center",
    venue_address: "123 Business Blvd, Suite 500, New York, NY 10001",
    venue_instructions: "Enter through the main lobby. Parking in Lot B.",
    virtual_link: "https://zoom.us/j/example",
    category_name: "AI Workshop",
    price: "$349",
    pricing_tier_name: "Half-Day Workshop",
    registration_url: "https://example.com/register",
    partner_name: "Strategic Partners Group",
    partner_logo_url: "/globe.svg",
    partner_tagline: "Supporting growth leaders worldwide",
    // camelCase — matches JSON field names in editor content
    coachName: "Jane Smith",
    coachPhoto: "/globe.svg",
    coachTitle: "Scaling Up Certified Coach",
    workshopTitle: "Sample: Scaling Up Masterclass",
    eventDate: "January 15, 2027",
    eventTime: "9:00 AM - 12:00 PM",
    venueName: "Grand Conference Center",
    venueAddress: "123 Business Blvd, Suite 500, New York, NY 10001",
    partnerName: "Strategic Partners Group",
    partnerLogoUrl: "/globe.svg",
    partnerTagline: "Supporting growth leaders worldwide",
    // Structured JSON field mappings
    heroTitle: "Sample: Scaling Up Masterclass",
    heroSubtitle: "An intensive workshop on the Rockefeller Habits methodology for scaling businesses.",
    aboutDescription: "An intensive workshop on the Rockefeller Habits methodology for scaling businesses.",
};
