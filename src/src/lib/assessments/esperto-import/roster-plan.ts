/**
 * Esperto historical import — Phase 1 ROSTER plan builder (PURE — no DB).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §5 (roster field map
 * + match/merge + blocks); plan 12a step 7, S1, edges 14 + 14b.
 *
 * `buildRosterImportPlan` turns parsed Esperto Members rows + the caller-resolved
 * existing org/respondents into a deterministic create / backfill / skip / block
 * plan. It performs ZERO DB work — the route resolves `existing` upstream and
 * `commit.ts` (the only writer) re-validates inside its transaction. Keeping the
 * decision logic pure makes every branch unit-testable against fixtures.
 *
 * SAFETY (S1): the plan is additive + non-overwriting by construction —
 *   - new identity            → `creates`
 *   - existing same identity   → no-op (never overwrites existing fields)
 *   - email-keyed row, no extId → `backfills` (set `externalId` only)
 *   - any ambiguity            → `blocks` (never a silent merge)
 *
 * Match rule (D5): per member, look up existing rows by `externalId === memberid`
 * first, then by `normalizedEmail`. A clean email-only match with no existing
 * external identity is backfilled. A conflicting external id on the email row, or
 * an external-match and email-match resolving to DIFFERENT rows, is a
 * resolver-split BLOCK (edge 14b) — we never guess.
 *
 * In-file ambiguity (edge 14): a duplicate `memberid` or duplicate
 * `normalizedEmail` within the SAME payload invalidates the plan (blocking
 * errors; no creates emitted) — there is no last-writer-wins collapse.
 */

import type { EspertoMember } from "./types";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

/** A respondent the plan will INSERT (matches the live OrgRespondent dedupe). */
export interface NewRespondent {
  /** Esperto memberid — kept so commit can re-resolve identity in-tx. */
  memberid: string;
  email: string;
  normalizedEmail: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  roleType: string | null;
  externalId: string;
  /** Always "external" for imported rows (externalId is always present). */
  dedupeSource: "external";
  /** Always the memberid (= externalId). */
  dedupeValue: string;
}

/** A null→value `externalId` backfill onto an existing email-keyed row. */
export interface RosterBackfill {
  id: string;
  externalId: string;
}

/** A member skipped (not imported) with a machine-readable reason. */
export interface RosterSkip {
  memberid: string;
  reason: "testuser" | "inactive";
}

/** A blocking error. A non-empty `blocks` array makes the whole plan invalid. */
export interface RosterBlock {
  /** Present for per-member blocks; absent for whole-file blocks. */
  memberid?: string;
  reason: "resolver-split" | "duplicate-memberid" | "duplicate-email";
}

/** The minimal existing-respondent projection the resolver needs. */
export interface ExistingRespondent {
  id: string;
  externalId: string | null;
  normalizedEmail: string | null;
}

export interface BuildRosterImportPlanInput {
  parsedMembers: EspertoMember[];
  ownerCoachId: string;
  companyName: string;
  existing: {
    /** Resolved org id (by ownerCoachId + normalizedName) or null if none. */
    orgId: string | null;
    respondents: ExistingRespondent[];
  };
}

export interface RosterImportPlan {
  companyName: string;
  ownerCoachId: string;
  orgAction: "create" | "match";
  /** Present only when orgAction === "match". */
  orgId?: string;
  creates: NewRespondent[];
  backfills: RosterBackfill[];
  skips: RosterSkip[];
  blocks: RosterBlock[];
}

// ────────────────────────────────────────────────────────────────────────
// Field map
// ────────────────────────────────────────────────────────────────────────

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toNewRespondent(m: EspertoMember): NewRespondent {
  const lastName = m.lastname.trim() === "" ? "—" : m.lastname;
  const jobTitle = m.title.trim() === "" ? null : m.title;
  const roleType = m.level.trim() === "" ? null : m.level; // passthrough unknown slugs
  return {
    memberid: m.memberid,
    email: m.email,
    normalizedEmail: normalizeEmail(m.email),
    firstName: m.firstname,
    lastName: lastName,
    jobTitle,
    roleType,
    externalId: m.memberid,
    dedupeSource: "external",
    dedupeValue: m.memberid,
  };
}

// ────────────────────────────────────────────────────────────────────────
// buildRosterImportPlan
// ────────────────────────────────────────────────────────────────────────

export function buildRosterImportPlan(
  input: BuildRosterImportPlanInput,
): RosterImportPlan {
  const { parsedMembers, ownerCoachId, companyName, existing } = input;

  const orgAction: "create" | "match" = existing.orgId ? "match" : "create";

  const plan: RosterImportPlan = {
    companyName,
    ownerCoachId,
    orgAction,
    ...(existing.orgId ? { orgId: existing.orgId } : {}),
    creates: [],
    backfills: [],
    skips: [],
    blocks: [],
  };

  // ── Filter first (testuser / inactive). Skipped rows are excluded from the
  //    in-file duplicate scan below — they are not being imported. ──────────
  const importable: EspertoMember[] = [];
  for (const m of parsedMembers) {
    if (m.testuser === true) {
      plan.skips.push({ memberid: m.memberid, reason: "testuser" });
      continue;
    }
    if (m.status !== "active") {
      plan.skips.push({ memberid: m.memberid, reason: "inactive" });
      continue;
    }
    importable.push(m);
  }

  // ── In-file ambiguity (edge 14): duplicate memberid / normalizedEmail.
  //    Any duplicate invalidates the WHOLE plan — emit blocks, no creates. ──
  const memberidCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  for (const m of importable) {
    memberidCounts.set(m.memberid, (memberidCounts.get(m.memberid) ?? 0) + 1);
    const ne = normalizeEmail(m.email);
    emailCounts.set(ne, (emailCounts.get(ne) ?? 0) + 1);
  }
  const dupMemberids = [...memberidCounts.entries()].filter(([, n]) => n > 1);
  const dupEmails = [...emailCounts.entries()].filter(([, n]) => n > 1);

  if (dupMemberids.length > 0 || dupEmails.length > 0) {
    for (const [memberid] of dupMemberids) {
      plan.blocks.push({ memberid, reason: "duplicate-memberid" });
    }
    for (const [] of dupEmails) {
      // Email blocks are file-scoped (no single memberid owns the conflict).
      plan.blocks.push({ reason: "duplicate-email" });
    }
    // Invalid plan: do NOT emit creates/backfills.
    return plan;
  }

  // ── Resolve each importable member against existing rows. ────────────────
  const byExternalId = new Map<string, ExistingRespondent>();
  const byEmail = new Map<string, ExistingRespondent>();
  for (const r of existing.respondents) {
    if (r.externalId) byExternalId.set(r.externalId, r);
    if (r.normalizedEmail) byEmail.set(r.normalizedEmail, r);
  }

  for (const m of importable) {
    const ne = normalizeEmail(m.email);
    const extMatch = byExternalId.get(m.memberid) ?? null;
    const emailMatch = byEmail.get(ne) ?? null;

    // Resolver split (edge 14b): the two lookups disagree, or the email row
    // already carries a conflicting external identity → block, never guess.
    if (extMatch && emailMatch && extMatch.id !== emailMatch.id) {
      plan.blocks.push({ memberid: m.memberid, reason: "resolver-split" });
      continue;
    }
    if (
      emailMatch &&
      emailMatch.externalId !== null &&
      emailMatch.externalId !== m.memberid
    ) {
      plan.blocks.push({ memberid: m.memberid, reason: "resolver-split" });
      continue;
    }

    if (extMatch) {
      // Same identity already imported → no-op (never overwrite existing fields).
      continue;
    }

    if (emailMatch) {
      // Email-only match with no external identity → backfill externalId only.
      // (emailMatch.externalId is null here — non-null-conflict blocked above;
      //  non-null-equal would have matched on externalId already.)
      plan.backfills.push({ id: emailMatch.id, externalId: m.memberid });
      continue;
    }

    // Brand-new identity → create.
    plan.creates.push(toNewRespondent(m));
  }

  return plan;
}
