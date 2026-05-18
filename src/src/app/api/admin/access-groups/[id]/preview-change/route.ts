/**
 * Assessment v7.6 — Admin AccessGroup preview-change route.
 *
 * Spec ref: docs/wireframes-phase2/wave5/22-admin-access-group-detail.md —
 * evaluateAccessChange preview panel.
 *
 * DRY-RUN — computes the BEFORE/AFTER effective-template snapshot for each
 * coach affected by the proposed change. Does NOT mutate the database and
 * does NOT write any audit logs. Used by the preview modal in the detail
 * UI to render the diff before the admin commits.
 *
 * Behavior:
 *  - For ADD_/REMOVE_COACH_FROM_GROUP: affected = [coachId].
 *  - For ADD_/REMOVE_TEMPLATE_FROM_GROUP: affected = all coaches in group.
 *  - Each coach's BEFORE = INTERSECTION across their non-archived groups.
 *    AFTER simulates the change in memory and recomputes the intersection.
 *  - Flags `wouldDropToZero` = AFTER set is empty AND they own DRAFT/ACTIVE
 *    campaigns (matches evaluateAccessChange's block criterion).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ADD_COACH_TO_GROUP"),
    coachId: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal("REMOVE_COACH_FROM_GROUP"),
    coachId: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal("ADD_TEMPLATE_TO_GROUP"),
    templateId: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal("REMOVE_TEMPLATE_FROM_GROUP"),
    templateId: z.string().trim().min(1),
  }),
]);

type PreviewBody = z.infer<typeof bodySchema>;

interface CoachDiff {
  coachId: string;
  firstName: string;
  lastName: string;
  email: string;
  beforeTemplates: TemplateRef[];
  afterTemplates: TemplateRef[];
  addedTemplateIds: string[];
  removedTemplateIds: string[];
  beforeCount: number;
  afterCount: number;
  wouldDropToZero: boolean;
  ownsActiveCampaigns: boolean;
}

interface TemplateRef {
  id: string;
  name: string;
  alias: string;
}

interface PreviewResponse {
  kind: PreviewBody["kind"];
  accessGroupId: string;
  affectedCoachIds: string[];
  forcedZeroCoachIds: string[];
  coaches: CoachDiff[];
  wouldBlock: boolean;
}

function intersection(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  const [first, ...rest] = sets;
  const out = new Set<string>();
  for (const t of first) {
    if (rest.every((s) => s.has(t))) out.add(t);
  }
  return out;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const { id: accessGroupId } = await context.params;
    const rawBody = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const group = await db.accessGroup.findUnique({
      where: { id: accessGroupId },
      select: { id: true, deletedAt: true },
    });
    if (!group || group.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Access group not found" },
        { status: 404 },
      );
    }

    // Step 1: determine affected coach set.
    let affectedCoachIds: string[];
    if (
      body.kind === "ADD_COACH_TO_GROUP" ||
      body.kind === "REMOVE_COACH_FROM_GROUP"
    ) {
      affectedCoachIds = [body.coachId];
    } else {
      const rows = await db.accessGroupCoach.findMany({
        where: { accessGroupId },
        select: { coachId: true },
      });
      affectedCoachIds = Array.from(new Set(rows.map((r) => r.coachId)));
    }

    if (affectedCoachIds.length === 0) {
      const empty: PreviewResponse = {
        kind: body.kind,
        accessGroupId,
        affectedCoachIds: [],
        forcedZeroCoachIds: [],
        coaches: [],
        wouldBlock: false,
      };
      return NextResponse.json({ success: true, data: empty });
    }

    // Step 2: load coach detail rows.
    const coachRows = await db.coach.findMany({
      where: { id: { in: affectedCoachIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });
    const coachById = new Map(coachRows.map((c) => [c.id, c]));

    // Step 3: load every (non-archived) group those coaches belong to.
    const coachGroupRows = await db.accessGroupCoach.findMany({
      where: { coachId: { in: affectedCoachIds } },
      select: {
        coachId: true,
        accessGroupId: true,
        accessGroup: { select: { id: true, deletedAt: true } },
      },
    });

    const coachGroups = new Map<string, Set<string>>();
    for (const cid of affectedCoachIds) coachGroups.set(cid, new Set());
    for (const r of coachGroupRows) {
      if (r.accessGroup.deletedAt !== null) continue;
      const set = coachGroups.get(r.coachId);
      if (set) set.add(r.accessGroupId);
    }

    // Step 4: load template grants for every involved group + the target
    // group (the target group must exist even if it has zero grants).
    const allGroupIds = new Set<string>([accessGroupId]);
    for (const set of coachGroups.values()) {
      for (const g of set) allGroupIds.add(g);
    }
    const groupTemplateRows = await db.accessGroupTemplate.findMany({
      where: { accessGroupId: { in: Array.from(allGroupIds) } },
      select: {
        accessGroupId: true,
        templateId: true,
        template: { select: { id: true, name: true, alias: true } },
      },
    });

    const groupTemplates = new Map<string, Set<string>>();
    const templateRefById = new Map<string, TemplateRef>();
    for (const r of groupTemplateRows) {
      const set = groupTemplates.get(r.accessGroupId) ?? new Set<string>();
      set.add(r.templateId);
      groupTemplates.set(r.accessGroupId, set);
      if (r.template && !templateRefById.has(r.templateId)) {
        templateRefById.set(r.templateId, {
          id: r.template.id,
          name: r.template.name,
          alias: r.template.alias,
        });
      }
    }

    // For an ADD_TEMPLATE preview the proposed templateId may not yet
    // exist in any group; load its metadata directly so the AFTER diff
    // can render the name + alias.
    if (
      (body.kind === "ADD_TEMPLATE_TO_GROUP" ||
        body.kind === "REMOVE_TEMPLATE_FROM_GROUP") &&
      !templateRefById.has(body.templateId)
    ) {
      const t = await db.assessmentTemplate.findUnique({
        where: { id: body.templateId },
        select: { id: true, name: true, alias: true },
      });
      if (t) templateRefById.set(t.id, t);
    }

    // Step 5: simulate the change against an in-memory copy.
    const afterCoachGroups = new Map<string, Set<string>>(
      Array.from(coachGroups.entries()).map(([k, v]) => [k, new Set(v)]),
    );
    const afterGroupTemplates = new Map<string, Set<string>>(
      Array.from(groupTemplates.entries()).map(([k, v]) => [k, new Set(v)]),
    );

    switch (body.kind) {
      case "ADD_COACH_TO_GROUP": {
        const set = afterCoachGroups.get(body.coachId) ?? new Set<string>();
        set.add(accessGroupId);
        afterCoachGroups.set(body.coachId, set);
        break;
      }
      case "REMOVE_COACH_FROM_GROUP": {
        const set = afterCoachGroups.get(body.coachId);
        if (set) set.delete(accessGroupId);
        break;
      }
      case "ADD_TEMPLATE_TO_GROUP": {
        const set = afterGroupTemplates.get(accessGroupId) ?? new Set();
        set.add(body.templateId);
        afterGroupTemplates.set(accessGroupId, set);
        break;
      }
      case "REMOVE_TEMPLATE_FROM_GROUP": {
        const set = afterGroupTemplates.get(accessGroupId);
        if (set) set.delete(body.templateId);
        break;
      }
    }

    // Step 6: per-coach BEFORE/AFTER intersection.
    const activeCampaignCounts = await db.assessmentCampaign.groupBy({
      by: ["createdByCoachId"],
      where: {
        createdByCoachId: { in: affectedCoachIds },
        status: { in: ["DRAFT", "ACTIVE"] },
      },
      _count: { _all: true },
    });
    const activeByCoach = new Map<string, number>();
    for (const row of activeCampaignCounts) {
      if (row.createdByCoachId) {
        activeByCoach.set(row.createdByCoachId, row._count._all);
      }
    }

    const diffs: CoachDiff[] = [];
    const forcedZero: string[] = [];

    for (const cid of affectedCoachIds) {
      const beforeGroups = coachGroups.get(cid) ?? new Set<string>();
      const afterGroups = afterCoachGroups.get(cid) ?? new Set<string>();
      const beforeSets = Array.from(beforeGroups).map(
        (g) => groupTemplates.get(g) ?? new Set<string>(),
      );
      const afterSets = Array.from(afterGroups).map(
        (g) => afterGroupTemplates.get(g) ?? new Set<string>(),
      );
      const beforeIds = intersection(beforeSets);
      const afterIds = intersection(afterSets);

      const added: string[] = [];
      const removed: string[] = [];
      for (const t of afterIds) if (!beforeIds.has(t)) added.push(t);
      for (const t of beforeIds) if (!afterIds.has(t)) removed.push(t);

      const ownsActive = (activeByCoach.get(cid) ?? 0) > 0;
      const wouldDropToZero = afterIds.size === 0 && ownsActive;
      if (wouldDropToZero) forcedZero.push(cid);

      const coachRow = coachById.get(cid);
      diffs.push({
        coachId: cid,
        firstName: coachRow?.firstName ?? "",
        lastName: coachRow?.lastName ?? "",
        email: coachRow?.email ?? "",
        beforeTemplates: Array.from(beforeIds).map(
          (id) =>
            templateRefById.get(id) ?? {
              id,
              name: "(unknown template)",
              alias: "",
            },
        ),
        afterTemplates: Array.from(afterIds).map(
          (id) =>
            templateRefById.get(id) ?? {
              id,
              name: "(unknown template)",
              alias: "",
            },
        ),
        addedTemplateIds: added,
        removedTemplateIds: removed,
        beforeCount: beforeIds.size,
        afterCount: afterIds.size,
        wouldDropToZero,
        ownsActiveCampaigns: ownsActive,
      });
    }

    const response: PreviewResponse = {
      kind: body.kind,
      accessGroupId,
      affectedCoachIds,
      forcedZeroCoachIds: forcedZero,
      coaches: diffs,
      wouldBlock: forcedZero.length > 0,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error("Error previewing access change:", error);
    return NextResponse.json(
      { success: false, error: "Failed to preview change" },
      { status: 500 },
    );
  }
}
