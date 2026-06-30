/**
 * Wave M (#19) — GET /api/assessment-templates/[id]/version-sections.
 *
 * Lightweight read-only helper for the coach CustomSlides authoring UI: returns
 * the resolved PUBLISHED version's id + its section list (stableKey + name), so
 * the campaign wizard can (a) populate the "Before section" position picker and
 * (b) post `expectedVersionId` for the server's anchor-validation on create.
 *
 * Auth:
 *   - 401 if not authenticated.
 *   - 404 if the actor cannot access the template (canAccessTemplate; admin
 *     bypass) — same opaque 404 the templates surfaces use, so a coach probing
 *     other templates can't distinguish "no access" from "doesn't exist".
 *   - 404 if no PUBLISHED version exists for (templateId, "en").
 *
 * Returns ONLY non-PII section metadata (stableKey + display name); never the
 * questions/scoring JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { asAccessDb, canAccessTemplate } from "@/lib/assessments/access-control";

const CAMPAIGN_LANGUAGE_DEFAULT = "en";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id: templateId } = await params;

    const allowed = await canAccessTemplate(asAccessDb(db), actor, templateId);
    if (!allowed) {
      // Opaque 404 — never reveal a template the actor cannot access.
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }

    // Latest PUBLISHED version for (templateId, language) — mirrors the
    // campaign-create resolver so the wizard's expectedVersionId matches what
    // the create route will resolve.
    const version = await db.assessmentTemplateVersion.findFirst({
      where: {
        templateId,
        language: CAMPAIGN_LANGUAGE_DEFAULT,
        publishedAt: { not: null },
      },
      orderBy: { versionNumber: "desc" },
      select: { id: true, sections: true },
    });

    if (!version) {
      return NextResponse.json(
        { success: false, error: "No published version for this template" },
        { status: 404 },
      );
    }

    // Defensively project sections → [{ stableKey, name }], sorted by sortOrder.
    const sections = projectSections(version.sections);

    return NextResponse.json({
      success: true,
      data: { versionId: version.id, sections },
    });
  } catch (error) {
    console.error("Error loading template version sections:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load version sections" },
      { status: 500 },
    );
  }
}

/**
 * Project a version's `sections` JSON (Prisma `Json` ⇒ `unknown`) to the
 * minimal `{ stableKey, name }[]` the picker needs, ordered by `sortOrder`.
 * Over-permissive (drops malformed rows) — a section without a string
 * stableKey can never be a valid slide anchor anyway.
 */
function projectSections(
  sectionsJson: unknown,
): Array<{ stableKey: string; name: string }> {
  if (!Array.isArray(sectionsJson)) return [];
  const rows: Array<{ stableKey: string; name: string; sortOrder: number }> = [];
  for (const s of sectionsJson) {
    if (!s || typeof s !== "object") continue;
    const rec = s as {
      stableKey?: unknown;
      name?: unknown;
      sortOrder?: unknown;
    };
    if (typeof rec.stableKey !== "string") continue;
    const key = rec.stableKey.trim();
    if (key.length === 0) continue;
    rows.push({
      stableKey: key,
      name: typeof rec.name === "string" && rec.name.trim() !== "" ? rec.name : key,
      sortOrder: typeof rec.sortOrder === "number" ? rec.sortOrder : 0,
    });
  }
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(({ stableKey, name }) => ({ stableKey, name }));
}
