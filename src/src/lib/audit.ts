import { db } from "./db";

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'DENY' | 'LOGIN' | 'LOGOUT' | 'RESET_TO_PENDING' | 'INFO_REQUESTED' | 'COACH_RESPONSE' | 'COUNTER_OFFER' | 'ACCEPT_COUNTER' | 'DECLINE_COUNTER' | 'CLOSE' | 'EXPORT' | 'ASSESSMENT_VERSION_SEEDED' | 'GROUP_REPORT_VIEW' | 'VIEW_REPORT' | 'RESPONDENT_LONGITUDINAL_VIEW' | 'TEMPLATE_RESULTS_DEFAULT_CHANGED' | 'TEMPLATE_DISABLED' | 'TEMPLATE_ENABLED' | 'ADMIN_USER_REMOVED' | 'BENCHMARKS_RECONCILED' | 'TEMPLATE_VERSION_ARCHIVED' | 'TEMPLATE_VERSION_UNARCHIVED' | 'TEMPLATE_VERSION_DELETED';

interface AuditLogParams {
    entityType: string;
    entityId: string;
    action: AuditAction;
    performedBy: string; // Email or user ID
    changes?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}

async function createAuditLog(params: AuditLogParams): Promise<void> {
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
}

/**
 * Create an audit log entry
 * This is a "fire and forget" operation that shouldn't block the main thread.
 * In a high-scale system, this would be pushed to a queue (Inngest).
 * For MVP/V2, writing directly to DB is fine.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
    try {
        await createAuditLog(params);
    } catch (error) {
        // Fail silently to avoiding crashing the app request
        console.error("Failed to create audit log:", error);
    }
}

/**
 * Audit variant for sensitive exports: callers must fail the request when the
 * audit row cannot be persisted.
 */
export async function logAuditStrict(params: AuditLogParams): Promise<void> {
    await createAuditLog(params);
}
