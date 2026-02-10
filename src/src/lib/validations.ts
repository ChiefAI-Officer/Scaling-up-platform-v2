/**
 * Zod Validation Schemas
 * Centralized validation for all API endpoints
 */

import { z } from "zod";

// ============================================================
// Common Schemas
// ============================================================

export const emailSchema = z.string().email("Invalid email address");

export const phoneSchema = z.string().regex(
    /^[\d\s\-\+\(\)]+$/,
    "Invalid phone number"
).optional();

export const dateSchema = z.coerce.date();

export const idSchema = z.string().min(1, "ID is required");

export const strongPasswordSchema = z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must be 128 characters or less")
    .regex(/[a-z]/, "Password must include at least one lowercase letter")
    .regex(/[A-Z]/, "Password must include at least one uppercase letter")
    .regex(/[0-9]/, "Password must include at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must include at least one special character");

// ============================================================
// Workshop Schemas
// ============================================================

export const workshopFormatSchema = z.enum(["IN_PERSON", "VIRTUAL", "HYBRID"]);

export const workshopStatusSchema = z.enum([
    "REQUESTED",
    "VALIDATING",
    "APPROVED",
    "SETUP_IN_PROGRESS",
    "MARKETING_ACTIVE",
    "REGISTRATION_OPEN",
    "REGISTRATION_CLOSED",
    "COMPLETED",
    "CANCELLED",
]);

export const createWorkshopSchema = z.object({
    workshopTypeId: idSchema,
    coachId: idSchema, // Required for workshop creation
    title: z.string().min(5, "Title must be at least 5 characters"),
    description: z.string().optional(),
    format: workshopFormatSchema,
    duration: z.string().optional(), // 'full-day', 'half-day', 'virtual-2hr'
    eventDate: dateSchema,
    eventTime: z.string().optional(),
    timezone: z.string().default("America/New_York"),

    // Location (for in-person)
    venueName: z.string().optional(),
    venueAddress: z.string().optional(),
    parkingInstructions: z.string().optional(),

    // Virtual (for online)
    virtualPlatform: z.enum(["zoom", "teams", "meet"]).optional(),
    virtualLink: z.string().url().optional(),

    // Pricing
    isFree: z.boolean().default(false),
    priceCents: z.number().int().min(0).optional(),
    earlyBirdPriceCents: z.number().int().min(0).optional(),
    earlyBirdDeadline: dateSchema.optional(),

    // Capacity
    maxAttendees: z.number().int().min(1).max(500).default(50),
});

export const updateWorkshopSchema = createWorkshopSchema.partial();

// ============================================================
// Workshop Type Schemas
// ============================================================

export const createWorkshopTypeSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    durationOptions: z.string(), // JSON string
    materials: z.string().optional(), // JSON string
    marketingTemplates: z.string().optional(), // JSON string
    pricingTiers: z.string().optional(), // JSON string
    preWorkshopInstructions: z.string().optional(),
    isActive: z.boolean().default(true),
});

export const updateWorkshopTypeSchema = createWorkshopTypeSchema.partial();

// ============================================================
// Registration Schemas
// ============================================================

export const createRegistrationSchema = z.object({
    workshopId: idSchema,
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: emailSchema,
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    phone: phoneSchema,
});

export const updateRegistrationSchema = z.object({
    status: z.enum(["REGISTERED", "CANCELLED", "ATTENDED", "NO_SHOW"]).optional(),
    paymentStatus: z.enum(["PENDING", "COMPLETED", "REFUNDED"]).optional(),
    checkedInAt: dateSchema.optional(),
});

// ============================================================
// Approval Schemas
// ============================================================

export const approvalTypeSchema = z.enum([
    "WORKSHOP_REQUEST",
    "CUSTOM_PRICING",
    "CANCELLATION",
    "DATE_CHANGE",
    "REFUND",
    "CERTIFICATION_EDGE_CASE",
]);

export const approvalStatusSchema = z.enum([
    "PENDING",
    "APPROVED",
    "DENIED",
    "EXPIRED",
]);

export const createApprovalSchema = z.object({
    type: approvalTypeSchema,
    coachId: idSchema,
    coachEmail: emailSchema,
    workshopId: idSchema.optional(),
    workshopTypeSlug: z.string().optional(),
    details: z.string().optional(),
    requestedBy: z.string().min(1, "Requester name is required"),
    amount: z.number().int().min(0).optional(), // For refunds
});

export const respondApprovalSchema = z.object({
    decision: z.enum(["APPROVED", "DENIED"]),
    notes: z.string().optional(),
    token: z.string().optional(), // Signed URL token
});

// ============================================================
// Coach Schemas
// ============================================================

export const createCoachSchema = z.object({
    email: emailSchema,
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    phone: phoneSchema,
    company: z.string().optional(),
    bio: z.string().optional(),
    profileImage: z.string().optional(),
    territory: z.string().optional(),
    hubspotId: z.string().optional(),
    circleId: z.string().optional(),
});

export const updateCoachSchema = createCoachSchema.partial();

export const coachSignupSchema = z
    .object({
        email: emailSchema,
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        company: z.string().optional(),
        phone: phoneSchema,
        password: strongPasswordSchema,
        confirmPassword: z.string().min(1, "Please confirm your password"),
    })
    .refine((data) => data.password === data.confirmPassword, {
        path: ["confirmPassword"],
        message: "Passwords do not match",
    });

export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: strongPasswordSchema,
        confirmNewPassword: z.string().min(1, "Please confirm your new password"),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
        path: ["confirmNewPassword"],
        message: "New passwords do not match",
    });

export const forgotPasswordSchema = z.object({
    email: emailSchema,
});

export const resetPasswordSchema = z
    .object({
        email: emailSchema,
        token: z.string().min(1, "Reset token is required"),
        newPassword: strongPasswordSchema,
        confirmNewPassword: z.string().min(1, "Please confirm your new password"),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
        path: ["confirmNewPassword"],
        message: "New passwords do not match",
    });

// ============================================================
// Landing Page Schemas
// ============================================================

export const generateLandingPageSchema = z.object({
    workshopId: idSchema,
    regenerate: z.boolean().default(false),
});

export const updateLandingPageSchema = z.object({
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]),
    content: z.record(z.string(), z.any()).optional(),
});

// ============================================================
// Checkout Schemas
// ============================================================

export const createCheckoutSchema = z.object({
    workshopId: idSchema,
    registrationId: idSchema.optional(),
    email: emailSchema,
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
});

// ============================================================
// Webhook Schemas
// ============================================================

export const stripeWebhookSchema = z.object({
    id: z.string(),
    type: z.string(),
    data: z.object({
        object: z.record(z.string(), z.any()),
    }),
});

// ============================================================
// Query Param Schemas
// ============================================================

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const workshopQuerySchema = paginationSchema.extend({
    status: workshopStatusSchema.optional(),
    coachId: idSchema.optional(),
    upcoming: z.coerce.boolean().optional(),
});

export const approvalQuerySchema = paginationSchema.extend({
    status: approvalStatusSchema.optional(),
    type: approvalTypeSchema.optional(),
    coachId: idSchema.optional(),
});

export const registrationQuerySchema = paginationSchema.extend({
    workshopId: idSchema.optional(),
    status: z.enum(["REGISTERED", "CANCELLED", "ATTENDED", "NO_SHOW"]).optional(),
    paymentStatus: z.enum(["PENDING", "COMPLETED", "REFUNDED"]).optional(),
});

// ============================================================
// Helper Functions
// ============================================================

/**
 * Validate request body with Zod schema
 * Returns parsed data or throws validation error
 */
export async function validateBody<T>(
    request: Request,
    schema: z.ZodSchema<T>
): Promise<T> {
    const body = await request.json();
    return schema.parse(body);
}

/**
 * Validate query params from URL
 */
export function validateQuery<T>(
    url: URL | string,
    schema: z.ZodSchema<T>
): T {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const params = Object.fromEntries(urlObj.searchParams);
    return schema.parse(params);
}

/**
 * Safe validation that returns result object instead of throwing
 */
export function safeValidate<T>(
    data: unknown,
    schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; errors: z.ZodError } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, errors: result.error };
}

/**
 * Format Zod errors for API response
 */
export function formatZodErrors(error: z.ZodError): Record<string, string[]> {
    const formatted: Record<string, string[]> = {};

    for (const issue of error.issues) {
        const path = issue.path.join(".") || "root";
        if (!formatted[path]) {
            formatted[path] = [];
        }
        formatted[path].push(issue.message);
    }

    return formatted;
}
