import type { ApiActor } from "@/lib/auth/access-control";
import { isCoachCurrentlyCertified } from "@/lib/auth/coach-status";

type RemovalOutcome = "removed" | "forbidden" | "not-found";

interface RemovalTransaction {
  coach: {
    findUnique: (args: {
      where: { id: string };
      select: {
        certificationStatus: true;
        certificationExpiry: true;
      };
    }) => Promise<{
      certificationStatus: string;
      certificationExpiry: Date | null;
    } | null>;
  };
  assessmentSubmission: {
    updateMany: (args: {
      where: {
        id: string;
        referringCoachId: string;
        referredResultsDeletedAt: null;
        campaign: {
          accessMode: "PUBLIC";
          deletedAt: null;
        };
      };
      data: { referredResultsDeletedAt: Date };
    }) => Promise<{ count: number }>;
  };
  auditLog: {
    create: (args: {
      data: {
        entityType: "AssessmentSubmission";
        entityId: string;
        action: "DELETE";
        performedBy: string;
        changes: string;
        ipAddress?: string;
        userAgent?: string;
      };
    }) => Promise<unknown>;
  };
}

export interface ReferredResultsRemovalDb {
  $transaction: <T>(
    callback: (tx: RemovalTransaction) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
}

export interface ReferredResultsRemovalContext {
  now: Date;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function removeReferredResult(
  db: ReferredResultsRemovalDb,
  actor: ApiActor,
  submissionId: string,
  context: ReferredResultsRemovalContext,
): Promise<RemovalOutcome> {
  if (actor.role !== "COACH" || !actor.coachId) {
    return "forbidden";
  }
  const coachId = actor.coachId;

  return db.$transaction(
    async (tx) => {
      const coach = await tx.coach.findUnique({
        where: { id: coachId },
        select: {
          certificationStatus: true,
          certificationExpiry: true,
        },
      });
      if (!isCoachCurrentlyCertified(coach, context.now)) {
        return "forbidden";
      }

      const changed = await tx.assessmentSubmission.updateMany({
        where: {
          id: submissionId,
          referringCoachId: coachId,
          referredResultsDeletedAt: null,
          campaign: {
            accessMode: "PUBLIC",
            deletedAt: null,
          },
        },
        data: { referredResultsDeletedAt: context.now },
      });
      if (changed.count !== 1) {
        return "not-found";
      }

      await tx.auditLog.create({
        data: {
          entityType: "AssessmentSubmission",
          entityId: submissionId,
          action: "DELETE",
          performedBy: actor.email,
          changes: JSON.stringify({
            kind: "referred-results-removal",
            softDelete: true,
            requestId: context.requestId,
          }),
          ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });

      return "removed";
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}
