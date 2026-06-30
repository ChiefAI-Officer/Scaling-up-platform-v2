/**
 * Assessment v7.6 — Campaign detail routes.
 * GET: canManageCampaign mode="read" (creator coach OR admin).
 * PATCH: canManageCampaign mode="write" (creator coach with current
 * template+org access OR admin) AND status === DRAFT.
 * DELETE (Wave D, #1): soft-delete (sets deletedAt). Authorization is a
 * DISTINCT ownership predicate — admin/privileged OR the campaign creator
 * coach (createdByCoachId === actor.coachId) — NOT canManageCampaign,
 * because delete is ownership cleanup that must survive a later loss of
 * template/org access. Deletable in ANY state (DRAFT/ACTIVE/CLOSED).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateAssessmentCampaignSchema } from "@/lib/validations";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import { loadLiveCampaign } from "@/lib/assessments/campaign-live";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { waveDCustomHtmlEmailEnabled } from "@/lib/assessments/wave-d-feature-flags";
import {
  validateInvitationHtml,
  MAX_INVITATION_HTML_LENGTH,
} from "@/lib/assessments/email-html-sanitizer";
import { isCustomSlidesEnabled } from "@/lib/assessments/wave-m-flags";
import {
  prepareCustomSlidesForSave,
  sectionStableKeysOf,
  slidesAuditMeta,
} from "@/lib/assessments/custom-slides-write";
import { Prisma } from "@prisma/client";

/**
 * Wave M CAS — canonical deep-equality for the JSON `customSlides` value vs the
 * client's `expectedCustomSlides` sentinel. Order-sensitive (arrays + object
 * keys), null/undefined-tolerant (DB null ↔ a missing/null sentinel both read
 * as "no slides"). Used instead of a Prisma JSON `where` (whose equality on
 * JSON columns is unreliable).
 */
function jsonDeepEqual(a: unknown, b: unknown): boolean {
  // Treat DB-null and an absent/null sentinel as equal "no slides".
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) return an && bn;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => jsonDeepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length) return false;
  if (!ak.every((k, i) => k === bk[i])) return false;
  return ak.every((k) => jsonDeepEqual(ao[k], bo[k]));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      id,
      "read"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
        template: {
          select: { id: true, name: true, alias: true, aggregationMode: true },
        },
        participants: {
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
        },
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      id,
      "write"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id },
      // Wave M: also load versionId (anchor-validation) + customSlides (CAS).
      select: {
        id: true,
        status: true,
        versionId: true,
        customSlides: true,
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }
    // Wave M Q2: CLOSED is read-only; DRAFT + ACTIVE are both editable (slides
    // are content read at survey-load, so an ACTIVE edit only affects new loads).
    if (campaign.status === "CLOSED") {
      return NextResponse.json(
        { success: false, error: "Closed campaigns cannot be edited" },
        { status: 409 }
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

    const validation = updateAssessmentCampaignSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }
    const data = validation.data;

    const updateData: {
      name?: string;
      description?: string | null;
      openAt?: Date;
      endMode?: "OPEN_END" | "ENDS_AFTER";
      closeAt?: Date | null;
      invitationSubject?: string | null;
      invitationBodyMarkdown?: string | null;
      invitationBodyHtml?: string | null;
    } = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.invitationSubject !== undefined)
      updateData.invitationSubject = data.invitationSubject;
    if (data.invitationBodyMarkdown !== undefined)
      updateData.invitationBodyMarkdown = data.invitationBodyMarkdown;
    // Task 12 (#20) — full-HTML invitation body: validate-on-save (flag-gated).
    //   - Flag OFF → field IGNORED (not written).
    //   - Flag ON  → empty/whitespace clears the override (→ null); otherwise
    //                enforce the 50KB cap + token-PLACEMENT validation on the
    //                RAW bytes, then store the RAW validated HTML (sanitize at
    //                render, not at rest, so stored bytes match the validator's).
    if (data.invitationBodyHtml !== undefined && waveDCustomHtmlEmailEnabled()) {
      const rawHtml = data.invitationBodyHtml;
      if (rawHtml === null || rawHtml.trim().length === 0) {
        updateData.invitationBodyHtml = null;
      } else {
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
        updateData.invitationBodyHtml = rawHtml;
      }
    }
    if (data.openAt !== undefined) {
      const d = new Date(data.openAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: "openAt must be a valid ISO date" },
          { status: 400 }
        );
      }
      updateData.openAt = d;
    }
    if (data.endMode !== undefined) updateData.endMode = data.endMode;
    if (data.closeAt !== undefined) {
      if (data.closeAt === null) {
        updateData.closeAt = null;
      } else {
        const d = new Date(data.closeAt);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { success: false, error: "closeAt must be a valid ISO date" },
            { status: 400 }
          );
        }
        updateData.closeAt = d;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Wave M (#19) — custom slides on PATCH (flag-gated WRITE + REQUIRED CAS).
    //
    //   - Flag OFF (`!isCustomSlidesEnabled(id)`) → the `customSlides` field is
    //     IGNORED (not written) — a hidden/stale client cannot persist
    //     participant-facing HTML (R1-High-1). DRAFT + ACTIVE are editable;
    //     CLOSED was already rejected (409) above.
    //   - Flag ON  → require a value-compare CAS sentinel `expectedCustomSlides`
    //     (R1-Med-5, mirrors Wave B): if the stored slides ≠ the sentinel ⇒ 409
    //     (concurrent edit / stale editor). Then validate + caps + anchor-validate
    //     (R2-High-1) against the campaign's pinned version + sanitize-on-save.
    //     The CAS re-check + update + `tx.auditLog.create` run in ONE
    //     db.$transaction, rolling back the write if the audit insert fails
    //     (R2-Med-1) — NOT the shared swallowing logAudit.
    // ─────────────────────────────────────────────────────────────────────
    const rawBodyObj = (body ?? {}) as Record<string, unknown>;
    let slidesToStore:
      | { value: Prisma.InputJsonValue | typeof Prisma.JsonNull; strippedAny: boolean; auditMeta: ReturnType<typeof slidesAuditMeta> }
      | null = null;
    if (isCustomSlidesEnabled(id) && rawBodyObj.customSlides !== undefined) {
      // REQUIRED CAS sentinel — the key MUST be present (even if explicitly
      // null) so two editors cannot silently clobber each other.
      if (!("expectedCustomSlides" in rawBodyObj)) {
        return NextResponse.json(
          {
            success: false,
            error: "expectedCustomSlides is required to update custom slides",
          },
          { status: 400 }
        );
      }
      // Value-compare CAS: stored slides must equal the sentinel the editor
      // loaded. JSON is compared canonically in app code (Prisma JSON `where`
      // equality is unreliable); re-checked inside the tx below for atomicity.
      if (
        !jsonDeepEqual(campaign.customSlides, rawBodyObj.expectedCustomSlides)
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Custom slides changed since you opened them — reload and re-apply.",
          },
          { status: 409 }
        );
      }

      // Anchor-validate against the campaign's PINNED version's sections.
      const versionForAnchors = await db.assessmentTemplateVersion.findUnique({
        where: { id: campaign.versionId },
        select: { sections: true },
      });
      const knownSectionKeys = sectionStableKeysOf(versionForAnchors?.sections);
      const prepared = prepareCustomSlidesForSave(
        rawBodyObj.customSlides,
        knownSectionKeys
      );
      if (!prepared.ok) {
        return NextResponse.json(
          { success: false, error: prepared.error },
          { status: prepared.status }
        );
      }
      slidesToStore = {
        // Persist the sanitized array (an empty array clears the slides while
        // keeping the column non-null — distinct from "never set"). The cast
        // satisfies the `Json?` column type.
        value: prepared.slides as unknown as Prisma.InputJsonValue,
        strippedAny: prepared.strippedAny,
        auditMeta: slidesAuditMeta(prepared.slides),
      };
    }

    // No slides being written: the legacy single-update + post-commit logAudit
    // path is byte-for-byte unchanged.
    if (slidesToStore === null) {
      const updated = await db.assessmentCampaign.update({
        where: { id },
        data: updateData,
      });

      await logAudit({
        entityType: "AssessmentCampaign",
        entityId: id,
        action: "UPDATE",
        performedBy: actor.email,
        changes: updateData as Record<string, unknown>,
      });

      return NextResponse.json({ success: true, data: updated });
    }

    // Slides being written: CAS re-check + update + audit in ONE tx (R2-Med-1).
    const expectedSlides = rawBodyObj.expectedCustomSlides;
    const slideValue = slidesToStore.value;
    const auditChanges: Record<string, unknown> = {
      ...(updateData as Record<string, unknown>),
      customSlides: slidesToStore.auditMeta,
      customSlidesSanitizerStripped: slidesToStore.strippedAny,
      previousCustomSlidesCount: Array.isArray(campaign.customSlides)
        ? (campaign.customSlides as unknown[]).length
        : 0,
    };

    const saved = await db.$transaction(async (tx) => {
      // Re-read inside the tx and re-compare for atomicity (no JSON `where`).
      const current = await tx.assessmentCampaign.findUnique({
        where: { id },
        select: { customSlides: true },
      });
      if (!current || !jsonDeepEqual(current.customSlides, expectedSlides)) {
        return null; // stale — caller maps to 409
      }
      const row = await tx.assessmentCampaign.update({
        where: { id },
        data: { ...updateData, customSlides: slideValue },
      });
      await tx.auditLog.create({
        data: {
          entityType: "AssessmentCampaign",
          entityId: id,
          action: "UPDATE",
          performedBy: actor.email,
          changes: JSON.stringify(auditChanges),
        },
      });
      return row;
    });

    if (!saved) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Custom slides changed since you opened them — reload and re-apply.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Load the LIVE campaign (soft-deleted → null → 404). A deleted or
    // non-existent campaign is treated identically.
    const campaign = await loadLiveCampaign<{
      id: string;
      createdByCoachId: string | null;
      status: "DRAFT" | "ACTIVE" | "CLOSED";
    }>(db.assessmentCampaign, id, {
      select: { id: true, createdByCoachId: true, status: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Distinct OWNERSHIP predicate (not canManageCampaign): admin/privileged
    // OR the creator coach. This deliberately ignores current template/org
    // access — delete is ownership cleanup, so a creator coach who later lost
    // template access (H-8 path) can still delete their own campaign.
    const isOwner =
      campaign.createdByCoachId !== null &&
      actor.coachId !== null &&
      campaign.createdByCoachId === actor.coachId;
    if (!isPrivilegedRole(actor.role) && !isOwner) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    // Soft-delete only — responses/invitations are preserved. Deletable in
    // ANY state (DRAFT/ACTIVE/CLOSED).
    await db.assessmentCampaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: id,
      action: "DELETE",
      performedBy: actor.email,
      changes: { softDelete: true, status: campaign.status },
    });

    return NextResponse.json({ success: true, message: "Campaign deleted" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
