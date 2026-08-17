/**
 * Assessment v7.6 — service-layer helpers for campaign creation.
 *
 * Phase D2.1 (Codex round 4 guardrail #1): the draft-version block lives
 * in the AUTHORITATIVE server mutation — not just the route wrapper —
 * so any future code that calls into the campaign-create service
 * directly cannot bypass it.
 *
 * `resolvePublishedTemplateVersion` returns the latest ACTIVE version —
 * published AND non-archived (Wave ED8, spec 19ak §4) — for a
 * (templateId, language) pair OR throws `CampaignCreateError` with
 * code `TEMPLATE_VERSION_NOT_PUBLISHED` when no such version exists
 * (never published, or every published version archived).
 * The API route layer catches this and maps it to 422.
 *
 * Wave-Q doctrine: archived-exclusion is PERSISTED admin intent — it lives
 * in the DB `where` (`activePublishedWhere`) and is NEVER flag-gated.
 */

import { activePublishedWhere } from "@/lib/assessments/active-version";
import type {
  AssessmentCampaignAccessMode,
  AssessmentTemplateDeliveryType,
} from "@prisma/client";
import { isTemplateCompatibleWithAccessMode } from "@/lib/assessments/template-delivery-policy";

export type CampaignCreateCode =
  | "TEMPLATE_VERSION_NOT_PUBLISHED"
  | "TEMPLATE_DELIVERY_TYPE_MISMATCH";

export class CampaignCreateError extends Error {
  constructor(
    public readonly code: CampaignCreateCode,
    public readonly details: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CampaignCreateError";
    Object.setPrototypeOf(this, CampaignCreateError.prototype);
  }
}

export function assertTemplateDeliveryCompatible(
  deliveryType: AssessmentTemplateDeliveryType,
  accessMode: AssessmentCampaignAccessMode,
): void {
  if (!isTemplateCompatibleWithAccessMode(deliveryType, accessMode)) {
    throw new CampaignCreateError(
      "TEMPLATE_DELIVERY_TYPE_MISMATCH",
      { deliveryType, accessMode },
      "This template cannot be used with the selected campaign type.",
    );
  }
}

// Minimal Prisma-shape client; mirrors the AccessControlDb pattern in
// access-control.ts so unit tests can stub without pulling in @prisma/client.
export interface CampaignCreateDb {
  assessmentTemplateVersion: {
    findFirst: (args: {
      where: {
        templateId: string;
        language: string;
        publishedAt: { not: null };
        archivedAt: null;
      };
      orderBy: { versionNumber: "desc" };
    }) => Promise<{
      id: string;
      language: string;
      versionNumber: number;
      publishedAt: Date | null;
    } | null>;
  };
}

/**
 * Return the latest ACTIVE (published + non-archived) version for the
 * (templateId, language) pair. Throws
 * `CampaignCreateError("TEMPLATE_VERSION_NOT_PUBLISHED")` when no row
 * satisfies `publishedAt IS NOT NULL AND archivedAt IS NULL` — an archived
 * Active falls through to the previous published version; an all-archived
 * template throws exactly like a never-published one (Wave ED8).
 */
export async function resolvePublishedTemplateVersion(
  db: CampaignCreateDb,
  templateId: string,
  language: string,
): Promise<{
  id: string;
  language: string;
  versionNumber: number;
  publishedAt: Date | null;
}> {
  const version = await db.assessmentTemplateVersion.findFirst({
    where: {
      templateId,
      language,
      // Wave ED8 — Active = published + non-archived. Archived-exclusion is
      // PERSISTED admin intent (Wave-Q doctrine): expressed in the DB where,
      // NEVER flag-gated.
      ...activePublishedWhere,
    },
    orderBy: { versionNumber: "desc" },
  });
  if (!version) {
    throw new CampaignCreateError("TEMPLATE_VERSION_NOT_PUBLISHED", {
      templateId,
      language,
    });
  }
  return version;
}
