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

import type { AssessmentInvitationStatus } from "@prisma/client";

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
    templateName: string;
    organizationName: string;
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
}

interface CampaignWithRels {
  id: string;
  name: string;
  alias: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  openAt: Date;
  closeAt: Date | null;
  createdAt: Date;
  template: { id: string; name: string };
  organization: { id: string; name: string };
}

interface ParticipantWithRespondent {
  id: string;
  isCEO: boolean;
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
  const campaign = await db.assessmentCampaign.findUnique({
    where: { id: campaignId },
    include: {
      template: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
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

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      alias: campaign.alias,
      status: campaign.status,
      openAt: campaign.openAt,
      closeAt: campaign.closeAt,
      createdAt: campaign.createdAt,
      templateName: campaign.template.name,
      organizationName: campaign.organization.name,
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

export function asCampaignDetailDb(prisma: unknown): CampaignDetailDb {
  return prisma as CampaignDetailDb;
}
