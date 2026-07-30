/**
 * Assessment v7.6 — Coach campaign detail service helpers (Task F).
 *
 * Backs the `/portal/assessments/[id]` page and the
 * `/api/assessment-campaigns/[id]/respondents` API route. Pure
 * read-side aggregation; no mutations, no side-effects.
 *
 * Spec refs:
 *  - docs/specs/v7.6 — campaign detail "ops dashboard".
 *  - Wireframes 06-campaign-detail-overview.html, 07-campaign-detail-respondents.html.
 *
 * Design notes
 * ────────────
 * - DB shape narrowed to the delegates this module actually reads so tests
 *   can stub it cleanly (matches the convention in access-control.ts and
 *   aggregate-report.ts).
 * - Stats are derived from the in-memory participant + invitation join
 *   rather than from independent COUNT queries. Two reasons:
 *     1) v1 scale is < ~50 participants per campaign; a single fetch is
 *        cheaper than 4 round-trips.
 *     2) Stats and the table are always rendered together — they must
 *        agree by construction, not via separate queries that can drift.
 * - "invited", "viewed", "submitted" are MONOTONIC over the invitation
 *   status enum, per the v7.6 status semantics (SUBMITTED implies VIEWED
 *   implies SENT). The stat groupings reflect that.
 * - completionPct rounds to the nearest integer percent. Zero participants
 *   → 0% (not NaN).
 */

import { activePublishedWhere } from "./active-version";
import {
  resolveEditionStanding,
  type EditionStanding,
} from "./edition-standing";
import type { AssessmentInvitationStatus, PrismaClient } from "@prisma/client";

// ────────────────────────────────────────────────────────────────────────
// Public types (consumed by the API route + UI client component).
// ────────────────────────────────────────────────────────────────────────

export interface CampaignRespondentRow {
  participantId: string;
  respondent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string | null;
  };
  teamSnapshot: {
    pathIds: string[];
    pathLabels: string[];
  };
  isCEO: boolean;
  invitation: {
    id: string;
    status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED";
    sentAt: Date | null;
    submittedAt: Date | null;
    expiresAt: Date;
    resentCount: number;
    revokedAt: Date | null;
  } | null;
  hasSubmission: boolean;
  submissionId: string | null;
  submittedAt: Date | null;
}

export interface CampaignOverview {
  campaign: {
    id: string;
    name: string;
    alias: string;
    status: "DRAFT" | "ACTIVE" | "CLOSED";
    openAt: Date;
    closeAt: Date | null;
    createdAt: Date;
    templateId: string;
    templateName: string;
    organizationId: string;
    organizationName: string;
    invitationSubject: string | null;
    invitationBodyMarkdown: string | null;
    invitationBodyHtml: string | null;
    /**
     * Wave OSR (#71) — whether respondents see their own report on screen at
     * submit. Surfaced so the screen can both SHOW and CHANGE the setting: it
     * shipped create-only, which left the production flag surfacing nothing on
     * any campaign that already existed.
     *
     * Optional, matching `isImported` / `edition` above: older fixtures stay
     * valid, and absent ⇒ off, which is both fail-closed AND the column default —
     * so an omission cannot produce a wrong disclosure, only the safe one.
     */
    showResultsOnScreen?: boolean;
    /**
     * Wave V (V-3) — true when this campaign is a Wave O historical Esperto
     * import (`importManifest != null`). Boolean ONLY (the manifest payload
     * never leaves the server); optional so older fixtures stay valid —
     * absent ⇒ no badge (fail-closed).
     */
    isImported?: boolean;
    /**
     * Wave EV — which EDITION of the template this campaign is serving, and
     * whether a newer one has since been published. A campaign pins a version at
     * creation and can never move off it, so without this the screen silently
     * shows frozen content (the cause of Jeff's #40/#43 re-reports).
     *
     * Optional, and null when the pinned version is unpublished — older fixtures
     * stay valid and the tile renders as it does today (fail-quiet).
     */
    edition?: EditionStanding | null;
  };
  stats: {
    totalParticipants: number;
    invited: number; // status IN (SENT, VIEWED, SUBMITTED)
    viewed: number; // status IN (VIEWED, SUBMITTED)
    submitted: number; // status = SUBMITTED
    completionPct: number;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Narrow Prisma-shape DB interface. The full Prisma client is a superset.
// ────────────────────────────────────────────────────────────────────────

export interface CampaignDetailDb {
  assessmentCampaign: {
    findUnique: (args: {
      where: { id: string };
      include?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => Promise<CampaignWithRels | null>;
  };
  assessmentCampaignParticipant: {
    findMany: (args: {
      where: { campaignId: string };
      include?: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }) => Promise<ParticipantWithRespondent[]>;
  };
  assessmentInvitation: {
    findMany: (args: {
      where: { campaignId: string };
    }) => Promise<InvitationRow[]>;
  };
  assessmentSubmission: {
    findMany: (args: {
      where: { campaignId: string };
      select?: Record<string, unknown>;
    }) => Promise<SubmissionRow[]>;
  };
  /**
   * Wave EV — sibling versions, for the newer-edition check.
   *
   * REQUIRED, not optional. An optional delegate would make the hole silent for
   * the next author: add `version` to a mock and you'd get a confident, wrong
   * "no newer edition" with no compiler complaint. Same reasoning as Wave OSR's
   * F4, where making `RespondentReport.templateAlias` required was itself the fix
   * — requiring the field is what lets the compiler find the omission.
   */
  assessmentTemplateVersion: {
    findMany: (args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => Promise<TemplateVersionRow[]>;
  };
}

/** Wave EV — the sibling-version shape the edition check reads. */
export interface TemplateVersionRow {
  templateId: string;
  versionNumber: number;
  language: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

interface CampaignWithRels {
  id: string;
  name: string;
  alias: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  openAt: Date;
  closeAt: Date | null;
  createdAt: Date;
  invitationSubject: string | null;
  invitationBodyMarkdown: string | null;
  invitationBodyHtml: string | null;
  /**
   * Wave OSR (#71) — whether this campaign shows each respondent their own report
   * on screen at submit. Optional so older fixtures stay valid; absent ⇒ treated
   * as off (fail-closed).
   */
  showResultsOnScreen?: boolean;
  /** Wave V (V-3): Wave O import-round manifest; non-null ⇒ historical import. */
  importManifest?: unknown;
  template: { id: string; name: string };
  organization: { id: string; name: string };
  /** Wave EV — the pinned version. Optional so older fixtures stay valid. */
  version?: {
    templateId: string;
    versionNumber: number;
    publishedAt: Date | null;
    language: string;
  } | null;
}

interface ParticipantWithRespondent {
  id: string;
  isCEO: boolean;
  teamPathAtAdd: string[] | null;
  teamLabelsAtAdd: string[] | null;
  respondent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string | null;
  };
}

interface InvitationRow {
  id: string;
  respondentId: string;
  status: AssessmentInvitationStatus;
  sentAt: Date | null;
  submittedAt: Date | null;
  expiresAt: Date;
  resentCount: number;
  revokedAt: Date | null;
}

interface SubmissionRow {
  id: string;
  respondentId: string | null;
  submittedAt: Date;
}

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

const INVITED_STATUSES = new Set(["SENT", "VIEWED", "SUBMITTED"]);
const VIEWED_STATUSES = new Set(["VIEWED", "SUBMITTED"]);

function computeStats(
  participants: ParticipantWithRespondent[],
  invitations: InvitationRow[],
): CampaignOverview["stats"] {
  const totalParticipants = participants.length;
  if (totalParticipants === 0) {
    return {
      totalParticipants: 0,
      invited: 0,
      viewed: 0,
      submitted: 0,
      completionPct: 0,
    };
  }

  // Build invitation lookup keyed by respondentId. Revoked invitations
  // collapse to "not invited" for the stats — they no longer represent a
  // live send. (The respondent table still shows the revokedAt timestamp
  // and re-invite affordance is handled at the API layer.)
  const inviteByRespondent = new Map<string, InvitationRow>();
  for (const inv of invitations) {
    if (inv.revokedAt !== null) continue;
    inviteByRespondent.set(inv.respondentId, inv);
  }

  let invited = 0;
  let viewed = 0;
  let submitted = 0;
  for (const p of participants) {
    const inv = inviteByRespondent.get(p.respondent.id);
    if (!inv) continue;
    if (INVITED_STATUSES.has(inv.status)) invited += 1;
    if (VIEWED_STATUSES.has(inv.status)) viewed += 1;
    if (inv.status === "SUBMITTED") submitted += 1;
  }

  const completionPct = Math.round((submitted / totalParticipants) * 100);

  return { totalParticipants, invited, viewed, submitted, completionPct };
}

// ────────────────────────────────────────────────────────────────────────
// Public entry points
// ────────────────────────────────────────────────────────────────────────

export async function getCampaignOverview(
  db: CampaignDetailDb,
  campaignId: string,
): Promise<CampaignOverview> {
  // SEC-M6: soft-delete is enforced UPSTREAM — every caller of this loader
  // (the detail page + the respondents API route) first gates on
  // canManageCampaign, which rejects (deletedAt set) campaigns as not-found.
  // This read therefore only ever runs against a campaign already proven
  // live, so keying by id alone is safe here.
  const campaign = await db.assessmentCampaign.findUnique({
    where: { id: campaignId },
    include: {
      template: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
      // Wave EV — the pinned edition, so the screen can say which one it serves.
      version: {
        // templateId comes from the VERSION, not the campaign: the two are
        // independent FKs with no composite constraint tying them together.
        // Sourcing it here gives the sibling QUERY the right comparison SCOPE —
        // a mis-pinned campaign's served edition is compared against its own
        // template's lineage, not another instrument's numbering.
        //
        // It does NOT make the templateId re-check in resolveEditionStanding
        // able to fire: the query filters on this same value, so that check is
        // tautological in production and is defense-in-depth against a future
        // loosening of the query only.
        select: {
          templateId: true,
          versionNumber: true,
          publishedAt: true,
          language: true,
        },
      },
    },
  });
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const [participants, invitations] = await Promise.all([
    db.assessmentCampaignParticipant.findMany({
      where: { campaignId },
      include: {
        respondent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        },
      },
    }),
    db.assessmentInvitation.findMany({ where: { campaignId } }),
  ]);

  const stats = computeStats(participants, invitations);

  // Wave EV — resolve the pinned edition + whether a newer one exists. Fully
  // fail-quiet: no version on the row, no sibling query available, or a query
  // failure all yield `null`, which renders the tile exactly as it did before.
  // A campaign screen must never fail to load over a decorative badge.
  let edition: EditionStanding | null = null;
  if (campaign.version != null) {
    const pinned = {
      templateId: campaign.version.templateId,
      versionNumber: campaign.version.versionNumber,
      publishedAt: campaign.version.publishedAt,
      language: campaign.version.language,
    };
    try {
      const siblings: TemplateVersionRow[] =
        await db.assessmentTemplateVersion.findMany({
          where: {
            templateId: pinned.templateId,
            language: pinned.language,
            versionNumber: { gt: pinned.versionNumber },
            // The ONE definition of published-and-not-retired lives in
            // active-version.ts. A sibling counts as newer only if it is what
            // campaign-create would actually offer, so this filter has to be the
            // same object create resolves through — otherwise a future ED8
            // predicate would stop create offering a version while this badge
            // kept pointing a coach at an edition they cannot get.
            ...activePublishedWhere,
          },
          select: {
            templateId: true,
            versionNumber: true,
            language: true,
            publishedAt: true,
            archivedAt: true,
          },
        });
      edition = resolveEditionStanding(pinned, siblings);
    } catch (err) {
      // Leave `edition` NULL — never claim currency we did not verify.
      //
      // The tempting shape here is `siblings = []` on failure, but that makes
      // resolveEditionStanding return `newerEditionAvailable: false`, which the
      // tile renders as an affirmative "you are on the newest edition". A
      // transient read failure would then tell a tester exactly the falsehood
      // this feature exists to prevent. Null renders no edition info at all.
      console.error("[campaign-detail] edition sibling lookup failed:", err);
    }
  }

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      alias: campaign.alias,
      status: campaign.status,
      openAt: campaign.openAt,
      closeAt: campaign.closeAt,
      createdAt: campaign.createdAt,
      templateId: campaign.template.id,
      templateName: campaign.template.name,
      organizationId: campaign.organization.id,
      organizationName: campaign.organization.name,
      invitationSubject: campaign.invitationSubject,
      invitationBodyMarkdown: campaign.invitationBodyMarkdown,
      invitationBodyHtml: campaign.invitationBodyHtml,
      // Wave OSR (#71) — absent ⇒ off (fail-closed), matching the column default.
      showResultsOnScreen: campaign.showResultsOnScreen === true,
      // Wave V (V-3): boolean only — the manifest payload stays server-side.
      isImported: campaign.importManifest != null,
      // Wave EV — null ⇒ nothing rendered (unpublished pin, or lookup degraded).
      edition,
    },
    stats,
  };
}

export async function getCampaignRespondents(
  db: CampaignDetailDb,
  campaignId: string,
): Promise<CampaignRespondentRow[]> {
  const [participants, invitations, submissions] = await Promise.all([
    db.assessmentCampaignParticipant.findMany({
      where: { campaignId },
      include: {
        respondent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        },
      },
      orderBy: { addedAt: "asc" },
    }),
    db.assessmentInvitation.findMany({ where: { campaignId } }),
    db.assessmentSubmission.findMany({
      where: { campaignId },
      select: { id: true, respondentId: true, submittedAt: true },
    }),
  ]);

  // For invitation lookup we WANT to see revoked rows so the UI can render
  // the "revoked" affordance. For stats we drop them; for the row table we
  // keep them.
  const inviteByRespondent = new Map<string, InvitationRow>();
  for (const inv of invitations) {
    // Defensive: if there were multiple rows for the same respondent (the
    // schema's @@unique should prevent this, but stub-driven tests can
    // produce it) take the latest.
    const existing = inviteByRespondent.get(inv.respondentId);
    if (!existing || (inv.sentAt && existing.sentAt && inv.sentAt > existing.sentAt)) {
      inviteByRespondent.set(inv.respondentId, inv);
    } else if (!existing) {
      inviteByRespondent.set(inv.respondentId, inv);
    }
  }

  const submissionByRespondent = new Map<string, SubmissionRow>();
  for (const sub of submissions) {
    if (sub.respondentId === null) continue;
    submissionByRespondent.set(sub.respondentId, sub);
  }

  return participants.map((p) => {
    const inv = inviteByRespondent.get(p.respondent.id) ?? null;
    const sub = submissionByRespondent.get(p.respondent.id) ?? null;
    return {
      participantId: p.id,
      respondent: p.respondent,
      teamSnapshot: {
        pathIds: p.teamPathAtAdd ?? [],
        pathLabels: p.teamLabelsAtAdd ?? [],
      },
      isCEO: p.isCEO,
      invitation: inv
        ? {
            id: inv.id,
            status: inv.status as "PENDING" | "SENT" | "VIEWED" | "SUBMITTED",
            sentAt: inv.sentAt,
            submittedAt: inv.submittedAt,
            expiresAt: inv.expiresAt,
            resentCount: inv.resentCount,
            revokedAt: inv.revokedAt,
          }
        : null,
      hasSubmission: sub !== null,
      submissionId: sub?.id ?? null,
      submittedAt: sub?.submittedAt ?? null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// asCampaignDetailDb — bridge the real Prisma client to the narrow type.
// ────────────────────────────────────────────────────────────────────────

/**
 * Compile-time check that the REAL Prisma client carries every delegate this
 * module names.
 *
 * Why this exists: the cast below cannot be checked. `CampaignDetailDb`'s methods
 * deliberately return our own narrow row shapes, which do not overlap Prisma's
 * generic delegate signatures, so `prisma as CampaignDetailDb` is rejected and a
 * double cast is unavoidable. That means declaring a delegate REQUIRED on the
 * interface constrains test mocks only — it buys nothing at the four call sites
 * that go through the bridge (three reach getCampaignOverview; export.csv uses
 * getCampaignRespondents).
 *
 * `Pick` closes the half that actually matters: a typo'd or removed delegate
 * NAME fails the build here. Signatures stay intentionally unchecked.
 */
type RequiredDelegates = keyof CampaignDetailDb;
// The type's EXISTENCE is the assertion: `Pick` fails to compile if any delegate
// name is missing from PrismaClient. Nothing consumes it at runtime, by design —
// hence the disable directive on the declaration itself.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _DelegatesExistOnPrismaClient = Pick<PrismaClient, RequiredDelegates>;

export function asCampaignDetailDb(prisma: PrismaClient): CampaignDetailDb {
  // Double cast is required — see the note above. The parameter type is what
  // stops an arbitrary object being passed in place of the client.
  return prisma as unknown as CampaignDetailDb;
}
