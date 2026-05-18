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
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import type { Prisma } from "@prisma/client";
import { splitName } from "@/lib/assessments/respondent-csv";
import { normalizeEmail } from "@/app/api/organizations/[id]/respondents/route";

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

    const where: Prisma.AssessmentCampaignWhereInput = {};
    if (!isPrivilegedRole(actor.role)) {
      if (!actor.coachId) {
        return NextResponse.json({ success: true, data: [] });
      }
      where.createdByCoachId = actor.coachId;
    }

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
    const version = await db.assessmentTemplateVersion.findFirst({
      where: {
        templateId: data.templateId,
        language: CAMPAIGN_LANGUAGE_DEFAULT,
        publishedAt: { not: null },
      },
      orderBy: { versionNumber: "desc" },
    });
    if (!version) {
      return NextResponse.json(
        {
          success: false,
          error: "No published version found for this template/language",
        },
        { status: 409 }
      );
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

    const openAtDate = new Date(data.openAt);
    if (Number.isNaN(openAtDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "openAt must be a valid ISO date" },
        { status: 400 }
      );
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

    // Try the natural alias first; on P2002 (collision), fall back to
    // aliasBase + short random suffix.
    let campaign;
    try {
      campaign = await db.assessmentCampaign.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          templateId: data.templateId,
          versionId: version.id,
          organizationId: data.organizationId,
          language: version.language,
          alias: aliasBase,
          status: "DRAFT",
          openAt: openAtDate,
          endMode: data.endMode,
          closeAt: closeAtDate,
          createdBy: actor.userId,
          createdByCoachId: actor.coachId,
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        const aliasFallback = `${aliasBase}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        campaign = await db.assessmentCampaign.create({
          data: {
            name: data.name,
            description: data.description ?? null,
            templateId: data.templateId,
            versionId: version.id,
            organizationId: data.organizationId,
            language: version.language,
            alias: aliasFallback,
            status: "DRAFT",
            openAt: openAtDate,
            endMode: data.endMode,
            closeAt: closeAtDate,
            createdBy: actor.userId,
            createdByCoachId: actor.coachId,
          },
        });
      } else {
        throw error;
      }
    }

    // Task M — process optional bulkRespondents payload from the wizard
    // CSV import. Best-effort: any per-row failure is recorded as an error
    // and returned to the client; the campaign itself stays created.
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
        bulkRespondentsCreated: bulkResult?.created.length ?? 0,
        bulkRespondentsSkipped: bulkResult?.skipped.length ?? 0,
        bulkRespondentsErrors: bulkResult?.errors.length ?? 0,
      },
    });

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
            const createdTeam = await tx.orgTeam.create({
              data: {
                organizationId,
                name: segment,
                parentTeamId: parentId,
              },
              select: { id: true, name: true, parentTeamId: true },
            });
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
