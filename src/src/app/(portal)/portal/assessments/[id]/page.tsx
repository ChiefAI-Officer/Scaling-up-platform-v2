/**
 * Assessment v7.6 — Coach campaign detail page (Task F).
 *
 * Server component. Resolves auth, gates access via canManageCampaign,
 * fetches the initial overview + respondents via the service helpers,
 * then hands off to the client component. Wave 1 placeholder removed.
 */

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { normalizeRole } from "@/lib/auth/access-control";
import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canManageCampaign,
  canViewGroupReport,
} from "@/lib/assessments/access-control";
import {
  asCampaignDetailDb,
  getCampaignOverview,
  getCampaignRespondents,
} from "@/lib/assessments/campaign-detail";
import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import { waveDCustomHtmlEmailEnabled } from "@/lib/assessments/wave-d-feature-flags";
import {
  isGroupReportEnabled,
  isGroupReportAlias,
} from "@/lib/assessments/wave-f-flags";
import { isCustomSlidesEnabled } from "@/lib/assessments/wave-m-flags";
import {
  hasComparableLongitudinal,
  asLongitudinalEligibilityDb,
} from "@/lib/assessments/longitudinal-eligibility";
import type { CustomSlide } from "@/lib/assessments/custom-slides";
import type { CustomSlidesPanelSection } from "@/components/assessments/CustomSlidesPanel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { coach, session } = await requireCoach();
  const { id } = await params;

  const actor: ApiActor = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: normalizeRole(session.user.role ?? "COACH"),
    coachId: coach.id,
  };

  const allowed = await canManageCampaign(
    asAccessDb(db),
    actor,
    id,
    "read"
  );
  if (!allowed) {
    redirect("/portal/assessments");
  }

  const detailDb = asCampaignDetailDb(db);
  const [overview, respondents] = await Promise.all([
    getCampaignOverview(detailDb, id),
    getCampaignRespondents(detailDb, id),
  ]);

  // Wave F #22 (T10) — gate the campaign-level "View group report" entry
  // point. The group report is a bulk-PII surface (claudex R3-M2), so the
  // entry point is shown ONLY when: the campaign is INVITED, the report is
  // enabled for this actor+campaign (flag/canary), AND the actor passes the
  // strict group-report currency check. Computed SERVER-side; the client
  // receives ONLY the boolean (never recomputes auth). The campaign metadata
  // needed for the flag (accessMode + ownership pointers) is loaded directly
  // since the overview loader does not carry them.
  const campaignForFlag = await db.assessmentCampaign.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      accessMode: true,
      createdByCoachId: true,
      organizationId: true,
      // Wave M (#19): the stored (already-sanitized) slides feed the editor's
      // initial value AND its CAS sentinel; versionId resolves the section
      // anchors for the "Before section" picker.
      customSlides: true,
      template: { select: { alias: true } },
      // Wave J (J-3): the SU-Full-scoped publish guard reads publishedAt so the
      // entry-point link is gated lock-step with the loader (never show a link
      // that would land on the loader's `notApplicable(unpublished)` panel).
      // Wave M: also read the version's sections for the slide-position picker.
      version: { select: { id: true, publishedAt: true, sections: true } },
    },
  });
  const canShowGroupReport =
    campaignForFlag !== null &&
    campaignForFlag.accessMode === "INVITED" &&
    // Allowlisted surface — LVA (Jeff 2026-06-18) + SU-Full (Wave J J-3).
    isGroupReportAlias(campaignForFlag.template?.alias) &&
    // SU-Full-SCOPED publish guard, lock-step with the loader (R3-H1). A DRAFT
    // SU-Full version hides the link; LVA is NEVER gated on publishedAt.
    (campaignForFlag.template?.alias !== "scaling-up-full" ||
      campaignForFlag.version?.publishedAt != null) &&
    isGroupReportEnabled(actor, campaignForFlag) &&
    (await canViewGroupReport(asAccessDb(db), actor, id));

  // Wave M (#19) — custom-slides editor. Gated by the per-campaign flag
  // (canary/global/kill) AND status ∈ {DRAFT, ACTIVE} (CLOSED is read-only,
  // mirrors the PATCH route's 409). Computed SERVER-side; the client receives a
  // boolean + the stored slides (initial value + CAS sentinel) + the version's
  // sections (the "Before section" picker).
  const slidesStatus = campaignForFlag?.status ?? null;
  const customSlidesEnabled =
    campaignForFlag !== null &&
    (slidesStatus === "DRAFT" || slidesStatus === "ACTIVE") &&
    isCustomSlidesEnabled(id);
  const initialCustomSlides = customSlidesEnabled
    ? toCustomSlides(campaignForFlag?.customSlides)
    : [];
  const customSlidesSections = customSlidesEnabled
    ? projectSections(campaignForFlag?.version?.sections)
    : [];

  // Wave N (#23) — per-row "over time" eligibility. Each submitted respondent
  // gets a longitudinal entry link ONLY when `hasComparableLongitudinal` is
  // true (flag on, scored template, current template access, ≥2 scored
  // submissions for that person on this template). Computed SERVER-side here;
  // the client receives ONLY the eligible id set + the templateId/org for the
  // URL, and never recomputes auth. The flag short-circuits cheaply (no DB)
  // when off, so the common dark state costs nothing.
  //
  // N+1 NOTE (accepted for v1 per the 18mn plan item 14): when the flag is ON
  // this issues up to 2 reads per SUBMITTED respondent (an org-bind findFirst +
  // a count, plus one findMany when an email is present). v1 rosters are small;
  // a batched eligibility query is the documented follow-up if rosters grow.
  // Only rows that have a submission in THIS campaign are evaluated — a person
  // with no submission here would resolve false anyway, so we skip the work.
  const longitudinalEligibilityDb = asLongitudinalEligibilityDb(db);
  const longitudinalRespondentIds: string[] = [];
  for (const row of respondents) {
    if (!row.hasSubmission) continue;
    // hasComparableLongitudinal documents a "never throws → no link" contract,
    // but guard the call site anyway: a throw here would otherwise kill the whole
    // Server Component render (→ 500). On any throw, treat the row as ineligible.
    let eligible = false;
    try {
      eligible = await hasComparableLongitudinal(
        longitudinalEligibilityDb,
        actor,
        {
          organizationId: overview.campaign.organizationId,
          respondentId: row.respondent.id,
          // overview.campaign.alias is the CAMPAIGN slug, not the template alias.
          // Use the template alias selected on campaignForFlag so the scored-only
          // scope gate evaluates correctly (a wrong alias → unknown → default
          // "scored", letting qualitative templates wrongly hit the DB path).
          templateId: overview.campaign.templateId,
          templateAlias: campaignForFlag?.template?.alias,
        },
      );
    } catch (err) {
      // No PII — just the campaign + respondent ids for context.
      console.error(
        `[campaign-detail] longitudinal eligibility check failed (campaign=${id}, respondent=${row.respondent.id}):`,
        err,
      );
    }
    if (eligible) longitudinalRespondentIds.push(row.respondent.id);
  }

  return (
    <CampaignDetail
      initialOverview={overview}
      initialRespondents={respondents}
      customHtmlEmailEnabled={waveDCustomHtmlEmailEnabled()}
      canViewGroupReport={canShowGroupReport}
      groupReportHref={`/assessments/${id}/report`}
      customSlidesEnabled={customSlidesEnabled}
      initialCustomSlides={initialCustomSlides}
      customSlidesSections={customSlidesSections}
      longitudinalRespondentIds={longitudinalRespondentIds}
    />
  );
}

/**
 * Coerce the persisted `customSlides` JSON (Prisma `Json` ⇒ `unknown`) to a
 * `CustomSlide[]` the editor can load. Defensive: a malformed row is dropped.
 * The stored shape IS the editor shape (id, title?, html [sanitized], position,
 * sortOrder); the editor sends back the unchanged stored value as the CAS
 * sentinel, so we must pass through the stored value faithfully.
 */
function toCustomSlides(json: unknown): CustomSlide[] {
  if (!Array.isArray(json)) return [];
  const out: CustomSlide[] = [];
  for (const s of json) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    if (typeof rec.id !== "string") continue;
    if (typeof rec.html !== "string") continue;
    if (typeof rec.sortOrder !== "number") continue;
    const pos = rec.position;
    if (!pos || typeof pos !== "object") continue;
    out.push(rec as unknown as CustomSlide);
  }
  return out;
}

/** Project a version's `sections` JSON to `{ stableKey, name }[]`, sorted. */
function projectSections(sectionsJson: unknown): CustomSlidesPanelSection[] {
  if (!Array.isArray(sectionsJson)) return [];
  const rows: Array<{ stableKey: string; name: string; sortOrder: number }> = [];
  for (const s of sectionsJson) {
    if (!s || typeof s !== "object") continue;
    const rec = s as { stableKey?: unknown; name?: unknown; sortOrder?: unknown };
    if (typeof rec.stableKey !== "string") continue;
    const key = rec.stableKey.trim();
    if (key.length === 0) continue;
    rows.push({
      stableKey: key,
      name:
        typeof rec.name === "string" && rec.name.trim() !== "" ? rec.name : key,
      sortOrder: typeof rec.sortOrder === "number" ? rec.sortOrder : 0,
    });
  }
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map(({ stableKey, name }) => ({ stableKey, name }));
}
