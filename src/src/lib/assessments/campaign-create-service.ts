/**
 * Assessment v7.6 — service-layer helpers for campaign creation.
 *
 * Phase D2.1 (Codex round 4 guardrail #1): the draft-version block lives
 * in the AUTHORITATIVE server mutation — not just the route wrapper —
 * so any future code that calls into the campaign-create service
 * directly cannot bypass it.
 *
 * `resolvePublishedTemplateVersion` returns the latest PUBLISHED version
 * for a (templateId, language) pair OR throws `CampaignCreateError` with
 * code `TEMPLATE_VERSION_NOT_PUBLISHED` when no published version exists.
 * The API route layer catches this and maps it to 422.
 */

export type CampaignCreateCode = "TEMPLATE_VERSION_NOT_PUBLISHED";

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

// Minimal Prisma-shape client; mirrors the AccessControlDb pattern in
// access-control.ts so unit tests can stub without pulling in @prisma/client.
export interface CampaignCreateDb {
  assessmentTemplateVersion: {
    findFirst: (args: {
      where: {
        templateId: string;
        language: string;
        publishedAt: { not: null };
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
 * Return the latest PUBLISHED version for the (templateId, language) pair.
 * Throws `CampaignCreateError("TEMPLATE_VERSION_NOT_PUBLISHED")` when no
 * row satisfies `publishedAt IS NOT NULL`.
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
      publishedAt: { not: null },
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
