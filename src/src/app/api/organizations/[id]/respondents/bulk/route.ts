/**
 * Assessment v7.6 — Task M.
 *
 * POST /api/organizations/[id]/respondents/bulk
 *
 * Body: { rows: Array<{ name, email, teamPath: string[] }>, mode: 'skip' | 'merge' }
 *   - rows  : pre-parsed by `parseRespondentCsv` on the client (the server
 *             re-validates). Cap = 500 (matches the parser).
 *   - mode  : when an OrgRespondent already exists for the same
 *             (organizationId, dedupeSource, dedupeValue):
 *               'skip'  → no-op
 *               'merge' → update firstName/lastName/teamId
 *
 * Auth: 401 unauthenticated; 404 if canAccessOrganization() === false
 * (avoids leaking org existence).
 *
 * Returns:
 *   {
 *     success: true,
 *     data: {
 *       created : Array<{ id, email }>,
 *       updated : Array<{ id, email }>,
 *       skipped : Array<{ email }>,
 *       errors  : Array<{ row, reason }>,
 *     }
 *   }
 *
 * Audit: one summary row per request, action="CREATE",
 * entityType="OrgRespondent", entityId=organizationId.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canAccessOrganization,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { MAX_ROWS, splitName } from "@/lib/assessments/respondent-csv";

import { normalizeEmail } from "@/app/api/organizations/[id]/respondents/route";

const RowSchema = z.object({
  name: z.string().min(1).max(400),
  email: z.string().email().max(320),
  teamPath: z.array(z.string().min(1).max(200)).max(20),
});

const BulkBodySchema = z.object({
  rows: z.array(RowSchema),
  mode: z.enum(["skip", "merge"]),
});

interface OrgRespondentRefRow {
  id: string;
  email: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers },
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id: organizationId } = await params;
    const allowed = await canAccessOrganization(
      asAccessDb(db),
      actor,
      organizationId,
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = BulkBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues },
        { status: 400 },
      );
    }

    const { rows, mode } = parsed.data;
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many rows; max is ${MAX_ROWS}`,
        },
        { status: 422 },
      );
    }
    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: {
            created: [],
            updated: [],
            skipped: [],
            errors: [],
          },
        },
        { status: 200 },
      );
    }

    // Dedupe within the request payload as a defense-in-depth (the client
    // parser also dedupes, but a malicious client could bypass it). First
    // occurrence wins. Track 1-indexed row positions so error reasons line
    // up with the client preview.
    const seen = new Set<string>();
    const deduped: Array<{ row: number; name: string; email: string; teamPath: string[] }> = [];
    const errors: Array<{ row: number; reason: string }> = [];
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
      deduped.push({
        row: i + 1,
        name: r.name,
        email: r.email,
        teamPath: r.teamPath,
      });
    }

    const created: OrgRespondentRefRow[] = [];
    const updated: OrgRespondentRefRow[] = [];
    const skipped: Array<{ email: string }> = [];

    // Single transaction so that a partial Prisma failure rolls back the
    // whole batch — predictable client-side retry semantics.
    await db.$transaction(async (tx) => {
      // Pre-load the team forest for this org. Mutate it as we create
      // missing teams so siblings created in the same batch deduplicate.
      type TeamRow = {
        id: string;
        name: string;
        parentTeamId: string | null;
      };
      const existingTeams = (await tx.orgTeam.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true, parentTeamId: true },
      })) as TeamRow[];

      // Build a (parentId|null, name.toLowerCase()) → team lookup.
      const teamByParentName = new Map<string, TeamRow>();
      const teamKey = (parentId: string | null, name: string) =>
        `${parentId ?? "__root__"}::${name.toLowerCase()}`;
      for (const t of existingTeams) {
        teamByParentName.set(teamKey(t.parentTeamId, t.name), t);
      }

      async function resolveTeamPath(
        path: string[],
        rowIdx: number,
      ): Promise<{ ok: true; teamId: string | null } | { ok: false; reason: string }> {
        if (path.length === 0) return { ok: true, teamId: null };
        let parentId: string | null = null;
        for (const segment of path) {
          const key = teamKey(parentId, segment);
          let team = teamByParentName.get(key);
          if (!team) {
            try {
              const created: TeamRow = (await tx.orgTeam.create({
                data: {
                  organizationId,
                  name: segment,
                  parentTeamId: parentId,
                },
                select: { id: true, name: true, parentTeamId: true },
              })) as TeamRow;
              team = created;
              teamByParentName.set(key, team);
            } catch {
              return {
                ok: false,
                reason: `failed to create team "${segment}" at row ${rowIdx}`,
              };
            }
          }
          parentId = team.id;
        }
        return { ok: true, teamId: parentId };
      }

      for (const r of deduped) {
        const teamResult = await resolveTeamPath(r.teamPath, r.row);
        if (!teamResult.ok) {
          errors.push({ row: r.row, reason: teamResult.reason });
          continue;
        }
        const teamId = teamResult.teamId;

        const norm = normalizeEmail(r.email);
        // dedupeSource is always "email" for the bulk path — we don't accept
        // externalId in the CSV.
        const dedupeSource = "email";
        const dedupeValue = norm;

        const existing = await tx.orgRespondent.findFirst({
          where: {
            organizationId,
            dedupeSource,
            dedupeValue,
          },
          select: { id: true, email: true, deletedAt: true },
        });

        const { firstName, lastName } = splitName(r.name);

        if (existing) {
          if (existing.deletedAt !== null) {
            // Soft-deleted: revive on merge; skip on skip.
            if (mode === "skip") {
              skipped.push({ email: existing.email });
              continue;
            }
            try {
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
              updated.push(revived);
            } catch {
              errors.push({
                row: r.row,
                reason: "failed to revive existing respondent",
              });
            }
            continue;
          }
          if (mode === "skip") {
            skipped.push({ email: existing.email });
            continue;
          }
          try {
            const updatedRow = await tx.orgRespondent.update({
              where: { id: existing.id },
              data: {
                firstName,
                lastName,
                teamId,
              },
              select: { id: true, email: true },
            });
            updated.push(updatedRow);
          } catch {
            errors.push({
              row: r.row,
              reason: "failed to update existing respondent",
            });
          }
          continue;
        }

        try {
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
          // Most likely a unique-constraint conflict caused by a duplicate
          // we didn't catch in pre-dedupe (e.g. another concurrent insert).
          // Re-query and report as updated/skipped based on mode.
          const code =
            typeof err === "object" && err !== null && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2002") {
            const post = await tx.orgRespondent.findFirst({
              where: {
                organizationId,
                dedupeSource,
                dedupeValue,
              },
              select: { id: true, email: true },
            });
            if (post) {
              if (mode === "skip") {
                skipped.push({ email: post.email });
              } else {
                // Best-effort merge after race; not strictly atomic.
                try {
                  const merged = await tx.orgRespondent.update({
                    where: { id: post.id },
                    data: { firstName, lastName, teamId },
                    select: { id: true, email: true },
                  });
                  updated.push(merged);
                } catch {
                  errors.push({
                    row: r.row,
                    reason: "concurrent insert conflict; could not merge",
                  });
                }
              }
              continue;
            }
          }
          errors.push({
            row: r.row,
            reason: "failed to create respondent",
          });
        }
      }
    });

    await logAudit({
      entityType: "OrgRespondent",
      entityId: organizationId,
      action: "CREATE",
      performedBy: actor.email,
      changes: {
        bulk: true,
        mode,
        createdCount: created.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          created,
          updated,
          skipped,
          errors,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error bulk-creating respondents:", error);
    return NextResponse.json(
      { success: false, error: "Failed to bulk-create respondents" },
      { status: 500 },
    );
  }
}
