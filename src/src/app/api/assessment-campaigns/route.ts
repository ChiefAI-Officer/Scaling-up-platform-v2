/**
 * Assessment v7.6 — Campaign collection routes.
 *
 * Spec refs:
 *  - docs/specs/v7.6/01-schema.md (AssessmentCampaign + createdByCoachId)
 *  - docs/specs/v7.6/02-service-layer-rules.md (canCreateCampaign,
 *    canAccessOrganization, INTERSECTION RBAC)
 *
 * Auth:
 *  - GET — admin/staff see all; coach sees only campaigns they created.
 *  - POST — caller MUST have a coachId. canCreateCampaign gates template
 *    access (INTERSECTION) AND certification. canAccessOrganization gates
 *    ownership of the target org.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAssessmentCampaignSchema } from "@/lib/validations";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canAccessOrganization,
  canCreateCampaign,
} from "@/lib/assessments/access-control";
import { liveCampaignWhere } from "@/lib/assessments/campaign-live";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import type { Prisma } from "@prisma/client";
import {
  CampaignCreateError,
  resolvePublishedTemplateVersion,
} from "@/lib/assessments/campaign-create-service";
import { splitName } from "@/lib/assessments/respondent-csv";
import { normalizeEmail } from "@/app/api/organizations/[id]/respondents/route";
import { buildTeamPath } from "@/app/api/assessment-campaigns/[id]/participants/route";
import {
  waveDAutoSendEnabled,
  waveDCustomHtmlEmailEnabled,
} from "@/lib/assessments/wave-d-feature-flags";
import {
  validateInvitationHtml,
  MAX_INVITATION_HTML_LENGTH,
} from "@/lib/assessments/email-html-sanitizer";
import { inngest } from "@/inngest/client";
// Import the event name from the side-effect-free constants module (NOT the
// fan-out function module) so the route never evaluates inngest.createFunction.
import { ASSESSMENT_SEND_INVITES_EVENT } from "@/inngest/functions/assessment-invite-fanout-event";

const CAMPAIGN_LANGUAGE_DEFAULT = "enUS";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function buildAliasTimestamp(d: Date): string {
  // YYMMDDHHMMSS in UTC; deterministic and short.
  const yy = (d.getUTCFullYear() % 100).toString().padStart(2, "0");
  return (
    yy +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds())
  );
}

function slugifyForAlias(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      // strip non-ascii letters/digits → underscore separators
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "x"
  );
}

export async function GET(request: NextRequest) {
  try {
    // Touch request.url so the unused-arg lint stays happy and to keep the
    // call shape consistent with Next.js route handler signatures.
    void request.url;
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // SEC-M6: soft-deleted campaigns (deletedAt set) are hidden from the
    // list for everyone — the live guard is baked in via liveCampaignWhere.
    const extra: Prisma.AssessmentCampaignWhereInput = {};
    if (!isPrivilegedRole(actor.role)) {
      if (!actor.coachId) {
        return NextResponse.json({ success: true, data: [] });
      }
      extra.createdByCoachId = actor.coachId;
    }
    const where = liveCampaignWhere(extra);

    const campaigns = await db.assessmentCampaign.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, alias: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    console.error("Error listing campaigns:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Coach-only creation route in v1. Admin-on-behalf is a future
    // PUBLIC-campaign flow (createdByCoachId=null) deferred to Wave 5.
    if (!actor.coachId) {
      return NextResponse.json(
        { success: false, error: "Only coaches can create campaigns" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const validation = createAssessmentCampaignSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }
    const data = validation.data;

    // ─────────────────────────────────────────────────────────────────────
    // Task 12 (#20) — per-campaign FULL-HTML invitation body: validate-on-save.
    //
    //   - Flag OFF → the field is IGNORED (legacy behavior, stored null).
    //   - Flag ON  → enforce a 50KB length cap, then run the token-PLACEMENT
    //                validator on the RAW bytes (PRE-interpolation). Reject
    //                400 with the validator `reason`. Store the RAW validated
    //                HTML — sanitization happens at RENDER (post-interpolation)
    //                so the stored bytes match what the validator saw.
    // ─────────────────────────────────────────────────────────────────────
    let invitationBodyHtmlToStore: string | null = null;
    if (waveDCustomHtmlEmailEnabled()) {
      const rawHtml = data.invitationBodyHtml;
      if (typeof rawHtml === "string" && rawHtml.trim().length > 0) {
        if (rawHtml.length > MAX_INVITATION_HTML_LENGTH) {
          return NextResponse.json(
            {
              success: false,
              error: `Invitation HTML exceeds the ${MAX_INVITATION_HTML_LENGTH}-character limit.`,
            },
            { status: 400 }
          );
        }
        const placement = validateInvitationHtml(rawHtml);
        if (!placement.ok) {
          return NextResponse.json(
            { success: false, error: placement.reason },
            { status: 400 }
          );
        }
        invitationBodyHtmlToStore = rawHtml; // RAW (sanitize at render, not at rest)
      }
    }

    // Organization ownership check.
    const orgAllowed = await canAccessOrganization(
      asAccessDb(db),
      actor,
      data.organizationId
    );
    if (!orgAllowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    // canCreateCampaign — certification + INTERSECTION template gate.
    const canCreate = await canCreateCampaign(
      asAccessDb(db),
      actor,
      data.templateId
    );
    if (!canCreate) {
      return NextResponse.json(
        { success: false, error: "Not authorized to create campaign for this template" },
        { status: 403 }
      );
    }

    // Resolve latest published version for templateId + language.
    // D2.1 (Codex round 4 guardrail #1): the draft-version block lives in
    // the service-layer helper. Maps the CampaignCreateError code →
    // HTTP 422 with explicit `TEMPLATE_VERSION_NOT_PUBLISHED` error code.
    let version: Awaited<
      ReturnType<typeof resolvePublishedTemplateVersion>
    >;
    try {
      version = await resolvePublishedTemplateVersion(
        db,
        data.templateId,
        CAMPAIGN_LANGUAGE_DEFAULT,
      );
    } catch (err) {
      if (
        err instanceof CampaignCreateError &&
        err.code === "TEMPLATE_VERSION_NOT_PUBLISHED"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "TEMPLATE_VERSION_NOT_PUBLISHED",
            details: err.details,
          },
          { status: 422 },
        );
      }
      throw err;
    }

    const template = await db.assessmentTemplate.findUnique({
      where: { id: data.templateId },
      select: { id: true, alias: true },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 }
      );
    }

    const org = await db.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    const orgSlug = slugifyForAlias(org.name);
    const tmplSlug = slugifyForAlias(template.alias || template.id);
    const ts = buildAliasTimestamp(new Date());
    const aliasBase = `${orgSlug}_${tmplSlug}_${ts}`;

    // ─────────────────────────────────────────────────────────────────────
    // Task 9 (Wave D) — distinguish a Wave-D create from a legacy create.
    //
    // A Wave-D create is marked by ANY of: `inviteTiming` present, `waveD:
    // true`, or a non-empty `participantIds` array. It does: atomic create +
    // in-tx participant re-auth (SEC-M3) + lifecycle + post-commit auto-send.
    // Absence of all three = legacy create: DRAFT, no participants attached
    // here (coaches attach later via the participants route), no auto-send.
    // ─────────────────────────────────────────────────────────────────────
    const isWaveDCreate =
      data.inviteTiming !== undefined ||
      data.waveD === true ||
      (Array.isArray(data.participantIds) && data.participantIds.length > 0);
    const inviteTiming = data.inviteTiming ?? "IMMEDIATELY";
    const autoSendOn = waveDAutoSendEnabled();
    // IMMEDIATELY + flag ON: open now and send right away. Everything else
    // (ON_OPEN, OR the flag off) is DRAFT and never auto-sends from the route.
    const goesActiveAndSends =
      isWaveDCreate && inviteTiming === "IMMEDIATELY" && autoSendOn;

    const now = new Date();
    // For a Wave-D IMMEDIATELY create, openAt = NOW (R1-H1) — the campaign
    // opens immediately, so a client-sent openAt is ignored (and may be
    // omitted). This holds whether or not the flag is on: flag-off still
    // opens-now, it just stays DRAFT and doesn't auto-send (dark). All other
    // paths (ON_OPEN, legacy) use the client openAt and require it.
    const immediateOpen = isWaveDCreate && inviteTiming === "IMMEDIATELY";
    // openAt is optional in the schema ONLY for the immediate-open path (it's
    // ignored there). On every other path the schema's superRefine guarantees
    // it's present; the `?? ""` keeps the type honest and yields an Invalid
    // Date that the NaN guard below rejects with a 400 (defense in depth).
    const openAtDate = immediateOpen ? now : new Date(data.openAt ?? "");
    if (Number.isNaN(openAtDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "openAt must be a valid ISO date" },
        { status: 400 }
      );
    }
    // ON_OPEN requires a FUTURE openAt (the cron sends at openAt — a past
    // openAt would never trigger a send and silently strand the campaign).
    if (isWaveDCreate && inviteTiming === "ON_OPEN" && autoSendOn) {
      if (openAtDate.getTime() <= now.getTime()) {
        return NextResponse.json(
          {
            success: false,
            error: "openAt must be in the future when inviteTiming is ON_OPEN",
          },
          { status: 400 }
        );
      }
    }
    const closeAtDate =
      data.endMode === "ENDS_AFTER" && data.closeAt
        ? new Date(data.closeAt)
        : null;
    if (closeAtDate && Number.isNaN(closeAtDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "closeAt must be a valid ISO date" },
        { status: 400 }
      );
    }
    // Lifecycle: ACTIVE only when we open + send now; everything else DRAFT.
    const initialStatus: "ACTIVE" | "DRAFT" = goesActiveAndSends
      ? "ACTIVE"
      : "DRAFT";

    // Narrow `actor` for the closure below: the 401 + coach guards above
    // already proved non-null + non-null coachId, but TS control-flow
    // narrowing does not flow into a nested function declaration, so bind
    // the fields to locals here.
    const createdByUserId = actor.userId;
    const createdByCoachId = actor.coachId;
    // Shared create payload. `alias` is overridden on the P2002 fallback path.
    function campaignCreateData(alias: string) {
      return {
        name: data.name,
        description: data.description ?? null,
        templateId: data.templateId,
        versionId: version.id,
        organizationId: data.organizationId,
        language: version.language,
        alias,
        status: initialStatus,
        inviteTiming,
        openAt: openAtDate,
        endMode: data.endMode,
        closeAt: closeAtDate,
        invitationSubject: data.invitationSubject ?? null,
        invitationBodyMarkdown: data.invitationBodyMarkdown ?? null,
        invitationBodyHtml: invitationBodyHtmlToStore,
        sendResultsToRespondent: data.sendResultsToRespondent,
        notifyCoachOnCompletion: data.notifyCoachOnCompletion,
        createdBy: createdByUserId,
        createdByCoachId,
      };
    }
    function isP2002(error: unknown): boolean {
      return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      );
    }

    let campaign;
    if (isWaveDCreate) {
      // ───────────────────────────────────────────────────────────────────
      // Task 9 (Wave D) — ATOMIC create + in-tx participant re-auth (SEC-M3).
      //
      // The campaign create AND the participant attach happen in ONE
      // db.$transaction so a failure can't leave orphan participants or a
      // campaign missing its participants. Participant IDs are re-verified
      // INSIDE the tx against the campaign's org (anti-IDOR) — the client's
      // IDs are never trusted blindly.
      // ───────────────────────────────────────────────────────────────────
      const participantIds = data.participantIds ?? [];
      const ceoRespondentId = data.ceoRespondentId ?? null;

      // Load + re-authorize the respondents BEFORE the tx so a foreign/deleted
      // ID is a clean 400 (no campaign created). The same org-scoped + count
      // checks are the security core. Skipped when no participants submitted.
      let verified: Array<{
        id: string;
        teamId: string | null;
        firstName: string;
        lastName: string;
      }> = [];
      if (participantIds.length > 0) {
        verified = await db.orgRespondent.findMany({
          where: {
            id: { in: participantIds },
            organizationId: data.organizationId,
            deletedAt: null,
          },
          select: { id: true, teamId: true, firstName: true, lastName: true },
        });
        // SEC-M3: a missing / foreign-org / deleted ID → loaded count differs
        // from the submitted count → reject. No campaign, no participants.
        if (verified.length !== participantIds.length) {
          return NextResponse.json(
            {
              success: false,
              error:
                "One or more participantIds do not belong to this campaign's organization",
            },
            { status: 400 }
          );
        }
        // CEO (if any) must be among the verified IDs (schema already checks
        // membership in the submitted list; this confirms it survived re-auth).
        if (ceoRespondentId && !verified.some((r) => r.id === ceoRespondentId)) {
          return NextResponse.json(
            {
              success: false,
              error: "ceoRespondentId must be a verified participant",
            },
            { status: 400 }
          );
        }
      }

      // Org teams for the teamPathAtAdd snapshot (immutable add-time copy).
      const teams = (await db.orgTeam.findMany({
        where: { organizationId: data.organizationId },
        select: { id: true, name: true, parentTeamId: true, deletedAt: true },
      })) as Array<{
        id: string;
        name: string;
        parentTeamId: string | null;
        deletedAt: Date | null;
      }>;
      const teamsById = new Map(teams.map((t) => [t.id, t]));

      async function createWaveD(alias: string) {
        return db.$transaction(async (tx) => {
          const created = await tx.assessmentCampaign.create({
            data: campaignCreateData(alias),
          });
          for (const r of verified) {
            const path = buildTeamPath(r.teamId, teamsById);
            await tx.assessmentCampaignParticipant.create({
              data: {
                campaignId: created.id,
                respondentId: r.id,
                isCEO: ceoRespondentId === r.id,
                teamPathAtAdd: path.ids,
                teamLabelsAtAdd: path.labels,
              },
            });
          }
          return created;
        });
      }

      try {
        campaign = await createWaveD(aliasBase);
      } catch (error) {
        if (isP2002(error)) {
          const aliasFallback = `${aliasBase}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          campaign = await createWaveD(aliasFallback);
        } else {
          throw error;
        }
      }
    } else {
      // ───────────────────────────────────────────────────────────────────
      // Legacy create — unchanged behavior: DRAFT, no participant attach here,
      // no auto-send. (initialStatus is DRAFT on this path by construction.)
      // ───────────────────────────────────────────────────────────────────
      try {
        campaign = await db.assessmentCampaign.create({
          data: campaignCreateData(aliasBase),
        });
      } catch (error) {
        if (isP2002(error)) {
          const aliasFallback = `${aliasBase}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          campaign = await db.assessmentCampaign.create({
            data: campaignCreateData(aliasFallback),
          });
        } else {
          throw error;
        }
      }
    }

    // deprecated: Task M wizard CSV import. The setup-first flip (Slice 1)
    // stopped the wizard from sending bulkRespondents — coaches now pick
    // EXISTING members. Kept intact (optional, now unused by the UI) so older
    // drafts/clients that still POST bulkRespondents keep working.
    let bulkResult: {
      created: Array<{ id: string; email: string }>;
      skipped: Array<{ email: string }>;
      errors: Array<{ row: number; reason: string }>;
    } | null = null;

    if (data.bulkRespondents && data.bulkRespondents.length > 0) {
      bulkResult = await processBulkRespondentsForCreate(
        campaign.organizationId,
        data.bulkRespondents,
      );
    }

    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: campaign.id,
      action: "CREATE",
      performedBy: actor.email,
      changes: {
        templateId: campaign.templateId,
        organizationId: campaign.organizationId,
        versionId: campaign.versionId,
        alias: campaign.alias,
        status: campaign.status,
        inviteTiming,
        waveD: isWaveDCreate,
        participantsAttached: isWaveDCreate
          ? (data.participantIds?.length ?? 0)
          : 0,
        autoSendEmitted: goesActiveAndSends,
        bulkRespondentsCreated: bulkResult?.created.length ?? 0,
        bulkRespondentsSkipped: bulkResult?.skipped.length ?? 0,
        bulkRespondentsErrors: bulkResult?.errors.length ?? 0,
      },
    });

    // ───────────────────────────────────────────────────────────────────────
    // Task 9 (Wave D) — POST-COMMIT, guarded auto-send emit (IMMEDIATELY only).
    //
    // The emit is AFTER the tx commits (never inside) and best-effort: if
    // inngest.send throws (outage/misconfig) the campaign is already durable
    // and the stale-claim cron is the backstop, so we MUST NOT fail the
    // request. ON_OPEN / flag-off / legacy never emit here (the cron sends
    // ON_OPEN at openAt; flag-off/legacy stay DRAFT). SEC-M5: payload is
    // `{ campaignId }` ONLY — never tokens, emails, or URLs.
    // ───────────────────────────────────────────────────────────────────────
    if (goesActiveAndSends) {
      try {
        await inngest.send({
          name: ASSESSMENT_SEND_INVITES_EVENT,
          data: { campaignId: campaign.id },
        });
      } catch (sendErr) {
        console.error(
          "assessment invite fan-out emit failed (cron backstop will retry):",
          sendErr,
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: campaign,
        bulkRespondents: bulkResult,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Task M — bulk-respondent helper (wizard-create path)
// ────────────────────────────────────────────────────────────────────────
//
// deprecated: the campaign wizard no longer sends `bulkRespondents` (Slice 1
// setup-first flip — coaches pick EXISTING members). This helper + the
// `bulkRespondents` field on `createAssessmentCampaignSchema` are retained,
// optional and functional, for backward-compat with older drafts/clients.
//
// Idempotent skip-on-conflict semantics: if an OrgRespondent already
// exists (same org + dedupeValue), the row is reported in `skipped` and
// left untouched. Teams in `teamPath` are auto-created if missing.
// Errors are per-row so a single bad row never blocks the rest.
//
// Wrapped in a single Prisma transaction.

async function processBulkRespondentsForCreate(
  organizationId: string,
  rows: Array<{ name: string; email: string; teamPath: string[] }>,
): Promise<{
  created: Array<{ id: string; email: string }>;
  skipped: Array<{ email: string }>;
  errors: Array<{ row: number; reason: string }>;
}> {
  const created: Array<{ id: string; email: string }> = [];
  const skipped: Array<{ email: string }> = [];
  const errors: Array<{ row: number; reason: string }> = [];

  // Dedupe by lowercased email within the payload; first row wins.
  const seen = new Set<string>();
  const deduped: Array<{ row: number; name: string; email: string; teamPath: string[] }> = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const norm = normalizeEmail(r.email);
    if (seen.has(norm)) {
      errors.push({
        row: i + 1,
        reason: `duplicate email "${norm}" — earlier row in the payload wins`,
      });
      continue;
    }
    seen.add(norm);
    deduped.push({ row: i + 1, name: r.name, email: r.email, teamPath: r.teamPath });
  }

  await db.$transaction(async (tx) => {
    type TeamRow = {
      id: string;
      name: string;
      parentTeamId: string | null;
    };
    const existingTeams = (await tx.orgTeam.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, parentTeamId: true },
    })) as TeamRow[];
    const teamByParentName = new Map<string, TeamRow>();
    const teamKey = (parentId: string | null, name: string) =>
      `${parentId ?? "__root__"}::${name.toLowerCase()}`;
    for (const t of existingTeams) {
      teamByParentName.set(teamKey(t.parentTeamId, t.name), t);
    }

    async function resolveTeamPath(
      path: string[],
    ): Promise<{ ok: true; teamId: string | null } | { ok: false; reason: string }> {
      if (path.length === 0) return { ok: true, teamId: null };
      let parentId: string | null = null;
      for (const segment of path) {
        const key = teamKey(parentId, segment);
        let team = teamByParentName.get(key);
        if (!team) {
          try {
            const createdTeam: TeamRow = (await tx.orgTeam.create({
              data: {
                organizationId,
                name: segment,
                parentTeamId: parentId,
              },
              select: { id: true, name: true, parentTeamId: true },
            })) as TeamRow;
            team = createdTeam;
            teamByParentName.set(key, team);
          } catch {
            return {
              ok: false,
              reason: `failed to create team "${segment}"`,
            };
          }
        }
        parentId = team.id;
      }
      return { ok: true, teamId: parentId };
    }

    for (const r of deduped) {
      const teamResult = await resolveTeamPath(r.teamPath);
      if (!teamResult.ok) {
        errors.push({ row: r.row, reason: teamResult.reason });
        continue;
      }
      const teamId = teamResult.teamId;
      const norm = normalizeEmail(r.email);
      const dedupeSource = "email";
      const dedupeValue = norm;
      const existing = await tx.orgRespondent.findFirst({
        where: { organizationId, dedupeSource, dedupeValue },
        select: { id: true, email: true, deletedAt: true },
      });
      if (existing && existing.deletedAt === null) {
        skipped.push({ email: existing.email });
        continue;
      }
      const { firstName, lastName } = splitName(r.name);
      try {
        if (existing && existing.deletedAt !== null) {
          // Revive soft-deleted — the wizard's "skip on conflict" semantics
          // imply "do nothing", but a soft-deleted row is invisible to the
          // coach, so we treat revival as the create-path behavior.
          const revived = await tx.orgRespondent.update({
            where: { id: existing.id },
            data: {
              deletedAt: null,
              firstName,
              lastName,
              teamId,
            },
            select: { id: true, email: true },
          });
          created.push(revived);
          continue;
        }
        const createdRow = await tx.orgRespondent.create({
          data: {
            organizationId,
            teamId,
            email: r.email,
            normalizedEmail: norm,
            firstName,
            lastName,
            jobTitle: null,
            externalId: null,
            dedupeSource,
            dedupeValue,
          },
          select: { id: true, email: true },
        });
        created.push(createdRow);
      } catch (err) {
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? (err as { code: string }).code
            : "";
        if (code === "P2002") {
          // Race: another concurrent insert beat us. Re-read and report
          // as skipped (consistent with idempotent semantics).
          const post = await tx.orgRespondent.findFirst({
            where: { organizationId, dedupeSource, dedupeValue },
            select: { email: true },
          });
          if (post) {
            skipped.push({ email: post.email });
            continue;
          }
        }
        errors.push({ row: r.row, reason: "failed to create respondent" });
      }
    }
  });

  return { created, skipped, errors };
}
