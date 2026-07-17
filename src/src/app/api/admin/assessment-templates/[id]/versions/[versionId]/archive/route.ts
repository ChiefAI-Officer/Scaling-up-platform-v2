/**
 * Wave ED8 (spec 19ak §5) — archive / unarchive an AssessmentTemplateVersion.
 *
 * POST = archive. Serves BOTH the UI's "Roll back…" on the Active row and
 * "Archive" on Superseded rows — the distinction is UI copy only; the server
 * just archives. DELETE = unarchive.
 *
 * Guard chain (house): withRateLimit → getApiActor 401 → isPrivilegedRole 403
 * → flag OFF opaque 404 (Wave S benchmarks pattern; the capability does not
 * exist) → 404 missing / template-mismatch.
 *
 * Archive state guards (each an explicit 409):
 *   - NOT_PUBLISHED           draft versions are deleted, not archived
 *   - ALREADY_ARCHIVED        idempotence guard
 *   - LAST_PUBLISHED_VERSION  the last active (published, non-archived)
 *     version for this (templateId, language) pair can never be archived —
 *     per-language: archiving the last enUS version is blocked even if an
 *     esES published version exists.
 *
 * Race hardening (co-validate C2 — BLOCKER): the state guards + the update
 * run inside ONE Serializable transaction — a plain transaction under default
 * isolation would let two concurrent archives of the last two published
 * versions both pass the sibling count. On a serialization failure (Prisma
 * P2034) the WHOLE transaction (guards included) is retried exactly once; a
 * second failure falls through to the generic 500 handler.
 *
 * The update sets ONLY `archivedAt` — the DB immutability trigger (T2)
 * rejects any other column change on a published row.
 *
 * Unarchive has no sibling invariant (it can only ADD an eligible version),
 * so a plain transaction suffices; it still sets ONLY `archivedAt: null`.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { isVersionLifecycleEnabled } from "@/lib/assessments/wave-ed8-flags";
import { activePublishedWhere } from "@/lib/assessments/active-version";

type Actor = NonNullable<Awaited<ReturnType<typeof getApiActor>>>;

/**
 * Shared guard chain: rate limit → auth 401 → privileged 403 → flag 404.
 * Auth runs BEFORE the flag check (house order — the opaque 404 never leaks
 * the capability's existence to unauthenticated/unprivileged callers, and
 * authenticated ones get proper 401/403 semantics regardless of the flag).
 */
async function runGuardChain(
  request: NextRequest,
): Promise<{ actor: Actor } | { response: NextResponse }> {
  const rate = await withRateLimit(request, RateLimits.standard);
  if (!rate.allowed) {
    return {
      response: NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rate.headers },
      ),
    };
  }

  const actor = await getApiActor();
  if (!actor) {
    return {
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      ),
    };
  }
  if (!isPrivilegedRole(actor.role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      ),
    };
  }

  // Flag OFF ⇒ the capability does not exist (opaque 404, zero DB reads).
  if (!isVersionLifecycleEnabled()) {
    return {
      response: NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      ),
    };
  }

  return { actor };
}

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === code
  );
}

type ArchiveOutcome =
  | { kind: "NOT_FOUND" }
  | { kind: "NOT_PUBLISHED" }
  | { kind: "ALREADY_ARCHIVED" }
  | { kind: "LAST_PUBLISHED_VERSION" }
  | {
      kind: "ARCHIVED";
      archivedAt: Date;
      versionNumber: number;
      language: string;
    };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const guard = await runGuardChain(request);
    if ("response" in guard) return guard.response;
    const { actor } = guard;

    const { id: templateId, versionId } = await params;

    // Every state guard is (re-)evaluated INSIDE the transaction, so the
    // P2034 retry re-runs them against committed concurrent state.
    const runArchiveTxn = (): Promise<ArchiveOutcome> =>
      db.$transaction(
        async (tx) => {
          const version = await tx.assessmentTemplateVersion.findUnique({
            where: { id: versionId },
            select: {
              id: true,
              templateId: true,
              language: true,
              versionNumber: true,
              publishedAt: true,
              archivedAt: true,
            },
          });
          if (!version || version.templateId !== templateId) {
            return { kind: "NOT_FOUND" } as const;
          }
          if (version.publishedAt === null) {
            return { kind: "NOT_PUBLISHED" } as const;
          }
          if (version.archivedAt !== null) {
            return { kind: "ALREADY_ARCHIVED" } as const;
          }

          // Per-language sibling guard: another active (published,
          // non-archived) version of the SAME language must remain.
          const siblingCount = await tx.assessmentTemplateVersion.count({
            where: {
              templateId,
              language: version.language,
              ...activePublishedWhere,
              id: { not: versionId },
            },
          });
          if (siblingCount === 0) {
            return { kind: "LAST_PUBLISHED_VERSION" } as const;
          }

          const archivedAt = new Date();
          // ONLY archivedAt — the DB trigger rejects any other change on a
          // published row.
          await tx.assessmentTemplateVersion.update({
            where: { id: versionId },
            data: { archivedAt },
          });
          return {
            kind: "ARCHIVED",
            archivedAt,
            versionNumber: version.versionNumber,
            language: version.language,
          } as const;
        },
        { isolationLevel: "Serializable" },
      );

    let outcome: ArchiveOutcome;
    try {
      outcome = await runArchiveTxn();
    } catch (error) {
      // P2034 = serialization failure — retry the WHOLE transaction once
      // (guards included). A second failure propagates to the 500 handler.
      if (!hasPrismaErrorCode(error, "P2034")) throw error;
      outcome = await runArchiveTxn();
    }

    if (outcome.kind === "NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 },
      );
    }
    if (outcome.kind !== "ARCHIVED") {
      return NextResponse.json(
        { success: false, error: outcome.kind },
        { status: 409 },
      );
    }

    // Audit AFTER the transaction commits (never inside it).
    await logAudit({
      entityType: "AssessmentTemplateVersion",
      entityId: versionId,
      action: "TEMPLATE_VERSION_ARCHIVED",
      performedBy: actor.email ?? actor.userId,
      changes: {
        templateId,
        versionNumber: outcome.versionNumber,
        language: outcome.language,
      },
    });

    return NextResponse.json({
      success: true,
      data: { versionId, archivedAt: outcome.archivedAt },
    });
  } catch (error) {
    console.error("Error archiving template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to archive version" },
      { status: 500 },
    );
  }
}

type UnarchiveOutcome =
  | { kind: "NOT_FOUND" }
  | { kind: "NOT_ARCHIVED" }
  | { kind: "UNARCHIVED"; versionNumber: number; language: string };

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const guard = await runGuardChain(request);
    if ("response" in guard) return guard.response;
    const { actor } = guard;

    const { id: templateId, versionId } = await params;

    // No sibling invariant (unarchiving only ADDS an eligible version) —
    // plain transaction, guards still evaluated inside it.
    const outcome: UnarchiveOutcome = await db.$transaction(async (tx) => {
      const version = await tx.assessmentTemplateVersion.findUnique({
        where: { id: versionId },
        select: {
          id: true,
          templateId: true,
          language: true,
          versionNumber: true,
          archivedAt: true,
        },
      });
      if (!version || version.templateId !== templateId) {
        return { kind: "NOT_FOUND" } as const;
      }
      if (version.archivedAt === null) {
        return { kind: "NOT_ARCHIVED" } as const;
      }

      // ONLY archivedAt — same DB-trigger constraint as the archive path.
      await tx.assessmentTemplateVersion.update({
        where: { id: versionId },
        data: { archivedAt: null },
      });
      return {
        kind: "UNARCHIVED",
        versionNumber: version.versionNumber,
        language: version.language,
      } as const;
    });

    if (outcome.kind === "NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 },
      );
    }
    if (outcome.kind === "NOT_ARCHIVED") {
      return NextResponse.json(
        { success: false, error: "NOT_ARCHIVED" },
        { status: 409 },
      );
    }

    await logAudit({
      entityType: "AssessmentTemplateVersion",
      entityId: versionId,
      action: "TEMPLATE_VERSION_UNARCHIVED",
      performedBy: actor.email ?? actor.userId,
      changes: {
        templateId,
        versionNumber: outcome.versionNumber,
        language: outcome.language,
      },
    });

    return NextResponse.json({
      success: true,
      data: { versionId },
    });
  } catch (error) {
    console.error("Error unarchiving template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to unarchive version" },
      { status: 500 },
    );
  }
}
