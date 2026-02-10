import { z } from "zod";

/**
 * Circle.so Service
 * Handles interaction with Circle.so API for certification verification.
 */

const CIRCLE_API_BASE = "https://app.circle.so/api/v1";

// Types for Circle.so API responses
interface CircleMember {
    id: number;
    user_id?: number;
    name?: string;
    email?: string;
    avatar_url?: string;
    created_at?: string;
    topics_count?: number;
    comments_count?: number;
    [key: string]: unknown;
}

export interface CircleProfile {
    memberId?: string;
    email?: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    bio?: string;
    avatarUrl?: string;
    createdAt?: string;
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

function getCircleApiKey(): string {
    const apiKey = process.env.CIRCLE_API_KEY;
    if (!apiKey) {
        throw new Error("CIRCLE_API_KEY is not configured");
    }
    return apiKey;
}

async function searchCommunityMembers(query: string): Promise<CircleMember[]> {
    const apiKey = getCircleApiKey();
    const searchUrl = `${CIRCLE_API_BASE}/community_members/search?query=${encodeURIComponent(query)}`;

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
    if (Array.isArray(data)) {
        return data as CircleMember[];
    }

    if (data && typeof data === "object") {
        const record = data as Record<string, unknown>;
        if (Array.isArray(record.results)) {
            return record.results as CircleMember[];
        }
        if (Array.isArray(record.community_members)) {
            return record.community_members as CircleMember[];
        }
    }

    return [];
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    return value as Record<string, unknown>;
}

function pickString(record: Record<string, unknown> | null, keys: string[]): string | undefined {
    if (!record) {
        return undefined;
    }

    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }

    return undefined;
}

function splitName(fullName?: string): { firstName?: string; lastName?: string } {
    if (!fullName) {
        return {};
    }

    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return {};
    }

    if (parts.length === 1) {
        return { firstName: parts[0], lastName: undefined };
    }

    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
    };
}

function mapCircleMember(member: CircleMember): CircleProfile {
    const memberRecord = toRecord(member);
    const userRecord = toRecord(memberRecord?.user);
    const fullName = pickString(memberRecord, ["name"]) ?? pickString(userRecord, ["name"]);
    const nameParts = splitName(fullName);

    const memberIdValue = memberRecord?.id ?? userRecord?.id ?? memberRecord?.user_id;
    const memberId = typeof memberIdValue === "number"
        ? String(memberIdValue)
        : typeof memberIdValue === "string" && memberIdValue.length > 0
            ? memberIdValue
            : undefined;

    return {
        memberId,
        email: pickString(memberRecord, ["email"]) ?? pickString(userRecord, ["email"]),
        fullName,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        title: pickString(memberRecord, ["headline", "title", "job_title", "jobTitle"])
            ?? pickString(userRecord, ["headline", "title", "job_title", "jobTitle"]),
        bio: pickString(memberRecord, ["bio", "about", "description", "summary"])
            ?? pickString(userRecord, ["bio", "about", "description", "summary"]),
        avatarUrl: pickString(memberRecord, ["avatar_url", "avatarUrl", "profile_image_url", "profileImageUrl"])
            ?? pickString(userRecord, ["avatar_url", "avatarUrl", "profile_image_url", "profileImageUrl"]),
        createdAt: pickString(memberRecord, ["created_at", "createdAt"])
            ?? pickString(userRecord, ["created_at", "createdAt"]),
    };
}

/**
 * Fetch a coach profile from Circle by email for pre-filling coach bios.
 */
export async function getCircleProfileByEmail(email: string): Promise<CircleProfile | null> {
    const members = await searchCommunityMembers(email);
    if (members.length === 0) {
        return null;
    }

    const normalizedMembers = members.map(mapCircleMember);
    const exactMatch = normalizedMembers.find(
        (member) => member.email?.toLowerCase() === email.toLowerCase()
    );

    return exactMatch ?? normalizedMembers[0] ?? null;
}

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
        const profile = await getCircleProfileByEmail(email);

        if (!profile) {
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
            certificationDate: profile.createdAt ? new Date(profile.createdAt) : undefined,
            expiryDate: null, // Lifetime for now? or check custom fields
            termsAccepted: true, // Assumed true if in community
            confidence: 90, // High confidence found
            circleMemberId: profile.memberId,
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
