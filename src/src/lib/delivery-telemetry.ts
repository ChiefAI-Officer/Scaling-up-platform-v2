import { db } from "@/lib/db";

export type DeliveryEventStatus = "SENT" | "FAILED" | "MOCK" | "SKIPPED";

export interface DeliveryTelemetryEvent {
  recipient: string;
  subject: string;
  status: DeliveryEventStatus;
  provider?: string;
  workshopId?: string;
  workshopCode?: string;
  workflowId?: string;
  workflowStepId?: string;
  registrationId?: string;
  recipientRole?: "STAFF" | "COACH" | "ATTENDEE" | "CUSTOM";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export async function recordDeliveryTelemetry(event: DeliveryTelemetryEvent): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        entityType: "EMAIL_DELIVERY",
        entityId: event.workflowStepId || event.workshopId || "unscoped",
        action: event.status,
        performedBy: "SYSTEM",
        changes: JSON.stringify({
          recipient: event.recipient,
          recipientRole: event.recipientRole ?? null,
          subject: event.subject,
          provider: event.provider ?? null,
          workshopId: event.workshopId ?? null,
          workshopCode: event.workshopCode ?? null,
          workflowId: event.workflowId ?? null,
          workflowStepId: event.workflowStepId ?? null,
          registrationId: event.registrationId ?? null,
          errorMessage: event.errorMessage ?? null,
          metadata: event.metadata ?? null,
          timestamp: new Date().toISOString(),
        }),
      },
    });
  } catch (error) {
    // Telemetry must never break delivery flow.
    console.error("[delivery-telemetry] failed to persist event", error);
  }
}
