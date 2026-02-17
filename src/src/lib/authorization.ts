/**
 * Authorization Helpers — Sprint 1
 * 
 * Server-side utilities for:
 * - Getting logged-in user's coach profile
 * - Scoped data queries (coaches see only their own workshops)
 * - Role-based access control
 */

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import {
    ApiActor,
    normalizeRole,
    canManageCoachData,
    isPrivilegedRole,
} from "@/lib/access-control";

// Extend NextAuth session type to include user id and role
export interface ExtendedSession extends Session {
    user: Session["user"] & {
        id: string;
        role: string;
        email: string;
    };
}

/**
 * Get the current session, redirecting to login if not authenticated
 */
export async function requireAuth(): Promise<ExtendedSession> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        redirect("/api/auth/signin");
    }

    return session as ExtendedSession;
}

/**
 * Require admin role - redirects to portal if not admin
 */
export async function requireAdmin(): Promise<ExtendedSession> {
    const session = await requireAuth();

    if (session.user.role !== "ADMIN") {
        redirect("/portal/home");
    }

    return session;
}

/**
 * Get the coach profile for the currently logged-in user
 * Returns null if user is not a coach (i.e., admin or staff)
 */
export async function getCoachForSession() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return null;
    }

    // First try to find coach linked via userId
    const user = await db.user.findUnique({
        where: { email: session.user.email },
        include: { coachProfile: true },
    });

    if (user?.coachProfile) {
        return user.coachProfile;
    }

    // Fallback: Find coach by matching email (for backwards compatibility)
    const coachByEmail = await db.coach.findUnique({
        where: { email: session.user.email },
    });

    return coachByEmail;
}

/**
 * Get the coach profile or redirect to error page
 */
export async function requireCoach() {
    const session = await requireAuth();
    const coach = await getCoachForSession();

    if (!coach) {
        // User is authenticated but not a coach - redirect to appropriate dashboard
        if (session.user.role === "ADMIN") {
            redirect("/dashboard");
        }
        redirect("/unauthorized");
    }

    return { session, coach };
}

/**
 * Generate a Prisma "where" clause scoped to the current coach
 * Use this to prevent cross-coach data access
 */
export function scopedWorkshopWhere(coachId: string) {
    return {
        coachId,
    };
}

/**
 * Check if a workshop belongs to the logged-in coach
 */
export async function canAccessWorkshop(workshopId: string): Promise<boolean> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return false;
    }

    // Admins can access all workshops
    const user = await db.user.findUnique({
        where: { email: session.user.email },
    });

    if (user?.role === "ADMIN") {
        return true;
    }

    // Coaches can only access their own workshops
    const coach = await getCoachForSession();
    if (!coach) {
        return false;
    }

    const workshop = await db.workshop.findFirst({
        where: {
            id: workshopId,
            coachId: coach.id,
        },
    });

    return !!workshop;
}

/**
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return false;
    }

    const user = await db.user.findUnique({
        where: { email: session.user.email },
    });

    return user?.role === "ADMIN";
}

/**
 * Check if workshop is locked (48h before event or manually locked)
 */
export async function isWorkshopLocked(workshopId: string): Promise<boolean> {
    const workshop = await db.workshop.findUnique({
        where: { id: workshopId },
        select: {
            isLocked: true,
            eventDate: true,
        },
    });

    if (!workshop) {
        return false;
    }

    // If manually locked, return true
    if (workshop.isLocked) {
        return true;
    }

    // Check if event is within 48 hours
    const now = new Date();
    const eventTime = new Date(workshop.eventDate);
    const hoursUntilEvent = (eventTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Auto-lock if within 48 hours
    if (hoursUntilEvent <= 48 && hoursUntilEvent > 0) {
        await db.workshop.update({
            where: { id: workshopId },
            data: {
                isLocked: true,
                lockedAt: new Date(),
                lockedBy: "SYSTEM",
            },
        });
        return true;
    }

    return false;
}

/**
 * Get detailed lock status for UI display
 */
export interface WorkshopLockStatus {
    isLocked: boolean;
    lockedAt: Date | null;
    lockedBy: string | null;
    reason: "manual" | "48h_rule" | "past_event" | null;
    hoursUntilEvent: number | null;
    canRequestEdit: boolean;
}

export async function getWorkshopLockStatus(workshopId: string): Promise<WorkshopLockStatus | null> {
    const workshop = await db.workshop.findUnique({
        where: { id: workshopId },
        select: {
            isLocked: true,
            lockedAt: true,
            lockedBy: true,
            eventDate: true,
            status: true,
        },
    });

    if (!workshop) {
        return null;
    }

    const now = new Date();
    const eventTime = new Date(workshop.eventDate);
    const hoursUntilEvent = (eventTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Determine lock reason
    let reason: WorkshopLockStatus["reason"] = null;
    if (hoursUntilEvent <= 0) {
        reason = "past_event";
    } else if (workshop.isLocked && workshop.lockedBy === "SYSTEM") {
        reason = "48h_rule";
    } else if (workshop.isLocked) {
        reason = "manual";
    }

    // Auto-lock check (updates DB if needed)
    const locked = await isWorkshopLocked(workshopId);

    return {
        isLocked: locked,
        lockedAt: workshop.lockedAt,
        lockedBy: workshop.lockedBy,
        reason: locked ? (reason || "48h_rule") : null,
        hoursUntilEvent: hoursUntilEvent > 0 ? hoursUntilEvent : null,
        canRequestEdit: locked && hoursUntilEvent > 0 && workshop.status !== "CANCELED",
    };
}

/**
 * Get user with full role info for API routes
 */
export async function getUserForApiRoute() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return null;
    }

    const user = await db.user.findUnique({
        where: { email: session.user.email },
        include: { coachProfile: true },
    });

    return user;
}

export async function getApiActor(): Promise<ApiActor | null> {
    const user = await getUserForApiRoute();

    if (!user) {
        return null;
    }

    return {
        userId: user.id,
        email: user.email,
        role: normalizeRole(user.role),
        coachId: user.coachProfile?.id ?? null,
    };
}

export type { ApiActor, ApiUserRole } from "@/lib/access-control";
export { canManageCoachData, isPrivilegedRole };

