import { db } from "./db";

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'DENY' | 'LOGIN' | 'LOGOUT' | 'RESET_TO_PENDING' | 'INFO_REQUESTED' | 'COACH_RESPONSE' | 'COUNTER_OFFER' | 'ACCEPT_COUNTER' | 'DECLINE_COUNTER' | 'CLOSE' | 'EXPORT' | 'ASSESSMENT_VERSION_SEEDED' | 'GROUP_REPORT_VIEW';

interface AuditLogParams {
    entityType: string;
    entityId: string;
    action: AuditAction;
    performedBy: string; // Email or user ID
    changes?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Create an audit log entry
 * This is a "fire and forget" operation that shouldn't block the main thread.
 * In a high-scale system, this would be pushed to a queue (Inngest).
 * For MVP/V2, writing directly to DB is fine.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
    try {
        await db.auditLog.create({
            data: {
                entityType: params.entityType,
                entityId: params.entityId,
                action: params.action,
                performedBy: params.performedBy,
                changes: JSON.stringify(params.changes || {}),
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
            },
        });
    } catch (error) {
        // Fail silently to avoiding crashing the app request
        console.error("Failed to create audit log:", error);
    }
}
