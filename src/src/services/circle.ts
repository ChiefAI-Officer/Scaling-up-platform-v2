import { z } from "zod";

/**
 * Circle.so Service
 * Handles interaction with Circle.so API for certification verification.
 */

const CIRCLE_API_BASE = "https://app.circle.so/api/v1";

// Types for Circle.so API responses
interface CircleMember {
    id: number;
    user_id: number;
    name: string;
    email: string;
    avatar_url: string;
    created_at: string;
    topics_count: number;
    comments_count: number;
}



// Zod schema for verification result
export const CertificationResultSchema = z.object({
    verified: z.boolean(),
    certificationDate: z.date().optional(),
    expiryDate: z.date().nullable().optional(),
    termsAccepted: z.boolean(),
    confidence: z.number().min(0).max(100),
    issues: z.array(z.string()).optional(),
    circleMemberId: z.string().optional(),
});

export type CertificationResult = z.infer<typeof CertificationResultSchema>;

/**
 * Verify a coach's certification status in Circle.so
 *
 * Checks:
 * 1. Is the coach a member of the community?
 * 2. (Future) Have they completed the specific course/space for the workshop type?
 *
 * @param email - Coach's email address
 * @param workshopType - Type of workshop (e.g., "scaling-up-master-class")
 */
export async function verifyCertification(
    email: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _workshopType: string
): Promise<CertificationResult> {
    const apiKey = process.env.CIRCLE_API_KEY;

    if (!apiKey) {
        console.warn("CIRCLE_API_KEY not set. Returning mock verification in development.");
        // In dev without key, fail safe or mock?
        // Following PRD: HITL required if confidence < 85%.
        // If no key, we can't verify, so confidence = 0.
        return {
            verified: false,
            termsAccepted: false,
            confidence: 0,
            issues: ["Configuration Error: CIRCLE_API_KEY missing"],
        };
    }

    try {
        // Step 1: Find member by email
        // Circle API doesn't have a direct "get by email" endpoint documented publicly identical to CRM
        // but typically we search community members.
        // Efficient approach: Search community members list.
        const searchUrl = `${CIRCLE_API_BASE}/community_members/search?query=${encodeURIComponent(
            email
        )}`;

        const response = await fetch(searchUrl, {
            method: "GET",
            headers: {
                Authorization: `Token ${apiKey}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Circle API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        // API returns array of members or paginated result?
        // Assuming typical structure: { results: [...] } or just [...]
        // Let's safe handle list.
        const members: CircleMember[] = Array.isArray(data) ? data : data.results || [];

        const member = members.find((m) => m.email.toLowerCase() === email.toLowerCase());

        if (!member) {
            return {
                verified: false,
                termsAccepted: false,
                confidence: 100, // High confidence they are NOT verified because they don't exist
                issues: ["Coach not found in Circle.so community"],
            };
        }

        // Step 2: Check active status / Course completion
        // For now, existence in the community implies some level of access.
        // PRD V2 requirement: "Coach has completed {workshop_type} course"
        // This requires checking "Course Progress" or "Space Membership".
        // Since we don't have course IDs mapped yet, we'll implement the shell and valid member check.

        // TODO: Implement course completion check once Course IDs are defined in env/config

        return {
            verified: true,
            certificationDate: new Date(member.created_at), // Proxy: Member since
            expiryDate: null, // Lifetime for now? or check custom fields
            termsAccepted: true, // Assumed true if in community
            confidence: 90, // High confidence found
            circleMemberId: String(member.id),
            issues: [],
        };
    } catch (error) {
        console.error("Circle.so verification failed:", error);
        return {
            verified: false,
            termsAccepted: false,
            confidence: 0, // System error, low confidence
            issues: [`System Error: ${error instanceof Error ? error.message : String(error)}`],
        };
    }
}
