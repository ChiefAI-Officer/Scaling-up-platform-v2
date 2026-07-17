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
 *   - 404 if no ACTIVE (published + non-archived) version exists for
 *     (templateId, DEFAULT_TEMPLATE_LANGUAGE).
 *
 * C4 (Wave ED8, spec 19ak): this route used to default the language to a
 * local `"en"` constant while campaign-create defaulted to `"enUS"` — against
 * real data (every seeded published version is `"enUS"`) `"en"` resolved a
 * DIFFERENT (empty) row set, breaking the wizard's expectedVersionId
 * hand-off. The version is now resolved through the SHARED
 * `resolveActiveVersion` helper, guaranteeing where + ordering + language
 * parity with the campaign-create resolver BY CONSTRUCTION. Archived
 * versions are excluded there too (persisted admin intent — never
 * flag-gated).
 *
 * Returns ONLY non-PII section metadata (stableKey + display name); never the
 * questions/scoring JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { asAccessDb, canAccessTemplate } from "@/lib/assessments/access-control";
import {
  DEFAULT_TEMPLATE_LANGUAGE,
  resolveActiveVersion,
} from "@/lib/assessments/active-version";

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

    // ACTIVE version for (templateId, language) — resolved via the SHARED
    // helper (C4) so the wizard's expectedVersionId matches what the create
    // route will resolve BY CONSTRUCTION (same where — published AND
    // non-archived — same versionNumber-desc ordering, same enUS default
    // language). Archived-exclusion is persisted admin intent (Wave-Q
    // doctrine) — never flag-gated.
    const active = await resolveActiveVersion(
      db,
      templateId,
      DEFAULT_TEMPLATE_LANGUAGE,
    );

    if (!active) {
      return NextResponse.json(
        { success: false, error: "No published version for this template" },
        { status: 404 },
      );
    }

    // The helper returns metadata only; fetch the (potentially large)
    // sections JSON for just the resolved row.
    const version = await db.assessmentTemplateVersion.findUnique({
      where: { id: active.id },
      select: { sections: true },
    });

    if (!version) {
      // Row vanished between the two reads — treat as not published.
      return NextResponse.json(
        { success: false, error: "No published version for this template" },
        { status: 404 },
      );
    }

    // Defensively project sections → [{ stableKey, name }], sorted by sortOrder.
    const sections = projectSections(version.sections);

    return NextResponse.json({
      success: true,
      data: { versionId: active.id, sections },
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
