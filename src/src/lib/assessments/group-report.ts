/**
 * Assessment v7.6 Wave F #22 — getCampaignGroupReport (the authorized DB LOADER).
 *
 * Fetches everything `buildGroupReportModel` needs from Postgres in ONE
 * consistent snapshot, gates it through the STRICTER `canViewGroupReport`
 * predicate, and stamps provenance (counts + a deterministic contentHash +
 * the rendered submission ids for the audit trail).
 *
 * This loader is READ-ONLY (find queries + a count). It does NOT render
 * (T7) and does NOT write the `GROUP_REPORT_VIEW` audit (the route, T8).
 *
 * Design (mirrors `getRespondentReport`):
 *   - Authorization AND the entire fetch run inside a SINGLE `$transaction`
 *     so the campaign / participants / submissions / invitation counts share
 *     one instant. We pin `RepeatableRead` so all reads observe the same
 *     snapshot (the registration-service uses Serializable for a write path;
 *     a read-only report needs only RepeatableRead).
 *   - Authz returns `false` → `{kind:"forbidden"}` (matches getRespondentReport's
 *     return-not-throw convention).
 *   - `generatedAt` is INJECTED by the caller — the loader NEVER calls
 *     `new Date()`, so it is deterministic given the same DB snapshot + clock.
 *
 * Usage:
 *   const res = await getCampaignGroupReport(db, actor, campaignId, new Date());
 *   if (res.kind === "ok") { renderGroupReport(res.report); auditView(res.provenance); }
 */

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

import type { ApiActor } from "@/lib/auth/access-control";
import {
  canViewGroupReport,
  asAccessDb,
} from "@/lib/assessments/access-control";
import {
  isGroupReportAlias,
  isGroupReportEnabled,
} from "@/lib/assessments/wave-f-flags";
import {
  buildGroupReportModel,
  type CampaignGroupReport,
  type GroupReportInput,
  type GroupReportParticipantInput,
  type GroupReportSubmissionInput,
} from "@/lib/assessments/group-report-model";

// ─── DB interface (narrow — accepts the full Prisma client OR a tx) ───────────

interface CampaignFindFirst {
  findFirst: (args: {
    where: { id: string; deletedAt?: Date | null };
    select: Record<string, unknown>;
  }) => Promise<RawCampaign | null>;
}

interface ParticipantFindMany {
  findMany: (args: {
    where: { campaignId: string };
    select: Record<string, unknown>;
  }) => Promise<RawParticipant[]>;
}

interface SubmissionFindMany {
  findMany: (args: {
    where: Record<string, unknown>;
    select: Record<string, unknown>;
  }) => Promise<RawSubmission[]>;
}

interface InvitationCount {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
}

interface GroupReportTx {
  assessmentCampaign: CampaignFindFirst;
  assessmentCampaignParticipant: ParticipantFindMany;
  assessmentSubmission: SubmissionFindMany;
  assessmentInvitation: InvitationCount;
}

export interface GroupReportDb {
  $transaction: <T>(
    cb: (tx: GroupReportTx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => Promise<T>;
}

// ─── Raw Prisma shapes ────────────────────────────────────────────────────────

interface RawRespondentProfile {
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
}

interface RawCampaign {
  id: string;
  accessMode: "INVITED" | "PUBLIC";
  organizationId: string;
  // Ownership pointer — read so the alias-aware enablement decision (LVA's
  // coach/org canary) can run INSIDE the loader after the rate limiter, with
  // NO pre-rate-limit DB lookup (Wave J J-3 single source of truth).
  createdByCoachId: string | null;
  templateId: string;
  versionId: string;
  // Display names threaded through provenance for the T8 renderer — read in
  // the SAME snapshot (no second un-snapshotted round-trip).
  organization: { name: string };
  template: { alias: string; name: string };
  // Wave K: the creator coach's logo (Coach.profileImage) + name for the
  // <img alt>, read in the same snapshot. Null on admin PUBLIC campaigns.
  creatorCoach: {
    profileImage: string | null;
    firstName: string;
    lastName: string;
  } | null;
  version: {
    id: string;
    versionNumber: number;
    // Wave J (J-3): NULL until an admin publishes. The SU-Full-scoped publish
    // guard reads this; LVA is never gated on it (legacy/imported LVA versions
    // may legitimately carry a null publishedAt).
    publishedAt: Date | null;
    questions: unknown;
    sections: unknown;
    scoringConfig: unknown;
  };
}

interface RawParticipant {
  id: string;
  isCEO: boolean;
  respondentId: string;
  respondent: RawRespondentProfile | null;
}

interface RawSubmission {
  id: string;
  respondentId: string | null;
  answers: unknown;
  result: unknown;
  respondent: RawRespondentProfile | null;
}

// ─── Public output types ──────────────────────────────────────────────────────

export interface GroupReportProvenance {
  /** INJECTED by the caller (route) — never `new Date()` inside the loader. */
  generatedAt: Date;
  /** Completed (SUBMITTED, non-null respondentId) submissions in the cohort. */
  completedCount: number;
  /** Non-revoked invitations on the campaign. */
  invitedCount: number;
  versionId: string;
  templateAlias: string;
  /** The participant row flagged isCEO (or null). */
  ceoParticipantId: string | null;
  /**
   * Stable sha256 over the model INPUTS (sorted submission ids + their
   * answers/results, versionId, alias). Same inputs ⇒ same hash; EXCLUDES
   * `generatedAt`. For the audit trail + as-of reproducibility.
   */
  contentHash: string;
  /** The rendered submission ids (for the audit trail, T8). */
  submissionIds: string[];
  /** Owning organization's display name (campaign.organization.name). */
  companyName: string;
  /** Instrument title (campaign.template.name) — for the report header. */
  assessmentName: string;
  /** Pinned version label "<alias>-v<versionNumber>" for the "as of" line. */
  versionLabel: string;
  /**
   * Wave K — the creator coach's logo URL (Coach.profileImage), shown on the
   * group report cover + footer-left. Null when there is no creator coach or
   * no profileImage (admin PUBLIC campaigns) → SU-logo-only fallback.
   */
  coachLogoUrl: string | null;
  /** Wave K — the coach's display name, used as the logo `<img alt>`. */
  coachName: string | null;
  /**
   * Wave J / J-2 — Peers benchmark application metadata, copied from the BUILT
   * model (NOT a fresh `benchmarksFor` call) so it reflects ACTUAL application:
   *  - `benchmarkVersion` is set ONLY when ≥1 peer row was attached to the
   *    scored report (undefined for non-SU-Full, an empty cohort, or a key
   *    mismatch),
   *  - `benchmarkKeyMismatch` is true when the report carried a key the
   *    benchmark does not cover — the launch-blocking, fail-closed signal
   *    (Peers are then cleared in the model) that flows to the audit/metric.
   * Both stay absent on the `empty` branch (no model is built there).
   */
  benchmarkVersion?: string;
  benchmarkKeyMismatch?: boolean;
}

export type GroupReportResult =
  | {
      kind: "notApplicable";
      /**
       * Why the report does not apply. `public`/`unsupported-template` are
       * pre-existing; `unpublished` (Wave J J-3) is the SU-Full-scoped publish
       * guard — an OBSERVABLE state (the page shows a panel + the metric), it
       * must NEVER collapse into a dark 404.
       */
      reason: "public" | "unsupported-template" | "unpublished";
      /** The campaign's template alias (for the page copy + the metric). */
      templateAlias: string;
    }
  // Wave J (J-3): the alias-aware feature-flag decision is made HERE (single
  // source of truth) — moved off the gate's pre-rate-limit flagGate so the rate
  // limiter runs FIRST and the decision can see template.alias without an
  // unauthenticated pre-rate-limit lookup. The gate's classify maps this to a
  // SILENT `not-found` (dark 404, enumeration-safe, no audit, no model build).
  | { kind: "notEnabled" }
  | { kind: "forbidden" }
  | { kind: "empty"; provenance: GroupReportProvenance }
  | { kind: "ok"; report: CampaignGroupReport; provenance: GroupReportProvenance };

// ─── contentHash (deterministic; EXCLUDES generatedAt) ────────────────────────

/**
 * Deterministic sha256 over a STABLE serialization of the model inputs.
 * Submissions are sorted by id so DB row order never perturbs the hash.
 * `generatedAt` is intentionally NOT part of the input.
 */
function computeContentHash(
  versionId: string,
  alias: string,
  submissions: RawSubmission[],
): string {
  const sorted = [...submissions].sort((a, b) => a.id.localeCompare(b.id));
  const canonical = JSON.stringify({
    versionId,
    alias,
    submissions: sorted.map((s) => ({
      id: s.id,
      respondentId: s.respondentId,
      answers: s.answers,
      result: s.result,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ─── Main loader ──────────────────────────────────────────────────────────────

/**
 * Loads + gates + assembles the campaign group report in one consistent snapshot.
 *
 *  1. SINGLE snapshot: campaign (+ template.alias + version), participants,
 *     completed submissions, and the non-revoked invitation count are all read
 *     inside one RepeatableRead $transaction.
 *  2. Authorize via the STRICTER `canViewGroupReport` (admin/staff bypass;
 *     coach CURRENCY checks) — inside the tx, mirroring getRespondentReport.
 *  3. INVITED-only: a PUBLIC campaign → notApplicable (no model build).
 *  4. "Completed" = SUBMITTED submissions with a non-null respondentId.
 *     invitedCount = non-revoked invitations. 0 completed → empty.
 *  5. Build the model via buildGroupReportModel.
 *  6. contentHash over a stable serialization of the inputs (no generatedAt).
 *  7. ceoParticipantId = the participant row with isCEO === true (or null).
 */
export async function getCampaignGroupReport(
  db: GroupReportDb,
  actor: ApiActor | null,
  campaignId: string,
  generatedAt: Date,
): Promise<GroupReportResult> {
  return db.$transaction(
    async (tx): Promise<GroupReportResult> => {
      // Load the LIVE campaign (deletedAt:null) with everything the model needs.
      const campaign = await tx.assessmentCampaign.findFirst({
        where: { id: campaignId, deletedAt: null },
        select: {
          id: true,
          accessMode: true,
          organizationId: true,
          createdByCoachId: true,
          templateId: true,
          versionId: true,
          organization: { select: { name: true } },
          template: { select: { alias: true, name: true } },
          // Wave K: coach logo (no migration — reuses Coach.profileImage).
          creatorCoach: {
            select: {
              profileImage: true,
              firstName: true,
              lastName: true,
            },
          },
          version: {
            select: {
              id: true,
              versionNumber: true,
              publishedAt: true,
              questions: true,
              sections: true,
              scoringConfig: true,
            },
          },
        },
      });

      // Not-found (or soft-deleted) → forbidden for everyone (mirrors the
      // access-control predicates' LIVE-only posture).
      if (!campaign) {
        return { kind: "forbidden" } as const;
      }

      // Wave J (J-3) — ALIAS-AWARE FEATURE-FLAG GATE (single source of truth).
      // This is the dark on/off switch (WAVE_F_* for LVA, independent WAVE_J_*
      // for SU-Full + the campaign-id canary). It lives HERE (not on the gate's
      // pre-rate-limit flagGate) so: (a) the rate limiter — which the route runs
      // BEFORE this loader — always fires first, and (b) the decision can see
      // template.alias + the ownership pointers without any pre-rate-limit DB
      // lookup. Disabled → `notEnabled`, which the gate's classify maps to a
      // SILENT 404 (enumeration-safe; no authz consult, no cohort load, no
      // model build, no audit). Run BEFORE authz so a disabled campaign is dark
      // to everyone, including admins.
      if (
        !isGroupReportEnabled(actor, {
          id: campaign.id,
          createdByCoachId: campaign.createdByCoachId,
          organizationId: campaign.organizationId,
          template: { alias: campaign.template.alias },
        })
      ) {
        return { kind: "notEnabled" } as const;
      }

      // Authorization — STRICTER bulk-PII gate (admin/staff bypass; coach
      // currency checks). actor may be null (unauthenticated) → forbidden.
      const allowed = actor
        ? await canViewGroupReport(asAccessDb(tx), actor, campaignId)
        : false;
      if (!allowed) {
        return { kind: "forbidden" } as const;
      }

      // INVITED-only: a PUBLIC campaign has no team group report.
      if (campaign.accessMode !== "INVITED") {
        return {
          kind: "notApplicable",
          reason: "public",
          templateAlias: campaign.template.alias,
        } as const;
      }

      // Allowlisted surface: LVA (Jeff 2026-06-18) + SU-Full (Wave J J-3). The
      // generic scored engine stays built but unreachable for any other alias;
      // gate here so a non-allowlisted INVITED campaign never builds/audits a
      // group report.
      if (!isGroupReportAlias(campaign.template.alias)) {
        return {
          kind: "notApplicable",
          reason: "unsupported-template",
          templateAlias: campaign.template.alias,
        } as const;
      }

      // Wave J (J-3) — ENFORCED PUBLISH GUARD, SU-Full-SCOPED (R3-H1). A DRAFT /
      // unpublished SU-Full version (publishedAt == null) must NOT surface the
      // group report — even when the flag is on. This is OBSERVABLE
      // (notApplicable, not a 404): the page shows a panel + emits a metric. It
      // is deliberately scoped to SU-Full so a legacy/imported LVA version with
      // a null publishedAt is NEVER regressed (LVA stays byte-for-byte).
      if (
        campaign.template.alias === "scaling-up-full" &&
        campaign.version.publishedAt == null
      ) {
        return {
          kind: "notApplicable",
          reason: "unpublished",
          templateAlias: campaign.template.alias,
        } as const;
      }

      // Participants — the source of isCEO + the canonical name snapshot.
      const participantRows = await tx.assessmentCampaignParticipant.findMany({
        where: { campaignId },
        select: {
          id: true,
          isCEO: true,
          respondentId: true,
          respondent: {
            select: { firstName: true, lastName: true, jobTitle: true },
          },
        },
      });

      // Completed submissions — SUBMITTED (its invitation's status) AND a
      // non-null respondentId (PUBLIC/keyless rows can't key into the cohort).
      const submissionRows = await tx.assessmentSubmission.findMany({
        where: {
          campaignId,
          respondentId: { not: null },
          invitation: { status: "SUBMITTED" },
        },
        select: {
          id: true,
          respondentId: true,
          answers: true,
          result: true,
          respondent: {
            select: { firstName: true, lastName: true, jobTitle: true },
          },
        },
      });

      // invitedCount = non-revoked invitations on the campaign.
      const invitedCount = await tx.assessmentInvitation.count({
        where: { campaignId, revokedAt: null },
      });

      const templateAlias = campaign.template.alias;
      const versionId = campaign.version.id;
      const ceoParticipantId =
        participantRows.find((p) => p.isCEO === true)?.id ?? null;
      const submissionIds = submissionRows.map((s) => s.id);
      const contentHash = computeContentHash(
        versionId,
        templateAlias,
        submissionRows,
      );

      // Wave K: coach logo — reuse Coach.profileImage. Null on admin PUBLIC
      // campaigns (no creator coach) or when the coach has no profileImage.
      const creatorCoach = campaign.creatorCoach;
      const coachLogoUrl = creatorCoach?.profileImage ?? null;
      const coachName = creatorCoach
        ? `${creatorCoach.firstName} ${creatorCoach.lastName}`
        : null;

      const provenance: GroupReportProvenance = {
        generatedAt,
        completedCount: submissionRows.length,
        invitedCount,
        versionId,
        templateAlias,
        ceoParticipantId,
        contentHash,
        submissionIds,
        companyName: campaign.organization.name,
        assessmentName: campaign.template.name,
        versionLabel: `${templateAlias}-v${campaign.version.versionNumber}`,
        coachLogoUrl,
        coachName,
      };

      // 0 completed → empty (provenance still carries the invitation counts).
      if (submissionRows.length === 0) {
        return { kind: "empty", provenance } as const;
      }

      // Denormalize into the pure model's input shape.
      const participants: GroupReportParticipantInput[] = participantRows.map(
        (p) => ({
          respondentId: p.respondentId,
          isCEO: p.isCEO,
          respondent: p.respondent ?? {},
        }),
      );
      const submissions: GroupReportSubmissionInput[] = submissionRows.map(
        (s) => ({
          respondentId: s.respondentId,
          answers: s.answers,
          result: s.result,
          respondent: s.respondent,
        }),
      );

      const input: GroupReportInput = {
        alias: templateAlias,
        version: {
          questions: campaign.version.questions,
          sections: campaign.version.sections,
          scoringConfig: campaign.version.scoringConfig,
        },
        participants,
        submissions,
      };

      const report = buildGroupReportModel(input);

      // Wave J / J-2 — copy the Peers benchmark application metadata from the
      // BUILT model (NOT a fresh benchmarksFor call) so provenance reflects what
      // ACTUALLY applied: version set only when ≥1 peer row attached; mismatch
      // true (and version undefined) when the report's keys drifted from the
      // benchmark. Both stay undefined when nothing applied (non-SU-Full / empty).
      provenance.benchmarkVersion = report.benchmarkVersion;
      provenance.benchmarkKeyMismatch = report.benchmarkKeyMismatch;

      return { kind: "ok", report, provenance } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
