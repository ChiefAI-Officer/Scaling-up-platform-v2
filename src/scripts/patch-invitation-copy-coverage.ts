/**
 * Shared ADR-0025 receipt for the per-template invitation-copy patch scripts.
 *
 * ADR-0025 requires a patch run to report what a TEMPLATE-ROW update does not
 * cover. Two things:
 *
 *  1. **Version staleness.** `ensureTemplateVersionContent` hashes the STORED
 *     invitation values for an already-seeded template, so patching the row makes
 *     the latest version's `contentHash` stale. What the next re-seed then does
 *     depends on the latest version AND on the seed's own opt-in:
 *       - latest PUBLISHED           → appends a new DRAFT (no failure).
 *       - latest unpublished DRAFT   → the helper FAILS CLOSED …unless that seed
 *                                      passes `forceSupersedeDraft`, in which case
 *                                      it supersedes the draft instead.
 *     `seedSupersedesDraft` is therefore per-script: seed-scaling-up-full passes
 *     the flag, seed-five-dysfunctions / seed-rockefeller / seed-lva do not.
 *     Never rewrite a published version's hash — report and move on.
 *
 *  2. **Override inventory.** Campaign-level `invitationSubject` /
 *     `invitationBodyMarkdown` / `invitationBodyHtml` take precedence over the
 *     template row, so those campaigns keep their own copy and a template patch
 *     never reaches them. A full-HTML override additionally bypasses the branded
 *     shell entirely (no coach logo, no coach-forward body) when
 *     `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` is on — which is how Jeff's #76 QSP
 *     sighting arose. Not inferred: prod `EMAIL_DELIVERY` telemetry records four
 *     `renderer: "custom_html"` invitation sends on 2026-07-10 (the day of his
 *     report), all from campaign "2026 QSP Q2" (qsp-v2, HTML override set, since
 *     soft-deleted). The qsp-v2 template row was coach-forward throughout.
 *     The bypass itself is tracked in GH issue #220.
 *
 * Read-only: this only ever queries. Extracted after the third copy (LVA #61,
 * Rockefeller #69, SU-Full/Five-Dysfunctions #76/#80), following the existing
 * script-helper precedent (`scripts/snapshot-prod-helpers.mjs`).
 *
 * Scope note — the CAS control flow itself is deliberately NOT extracted here,
 * though it is near-identical across the scripts. Each is a spent, one-shot
 * production mutation whose audit value depends on being readable end-to-end in a
 * single file (the Rockefeller header pins its as-run text via `git show`).
 * Reporting behaviour is shared because it is the part that keeps changing;
 * the mutation is not, because it must stay individually auditable.
 */
import type { PrismaClient } from "@prisma/client";

export interface CoverageOptions {
  /**
   * Whether THIS template's seed passes `forceSupersedeDraft: true`. Decides
   * what the receipt tells the operator a re-seed will do when the latest
   * version is an unpublished draft.
   */
  seedSupersedesDraft: boolean;
  /**
   * Version language to inspect. Must match the `language` the seed passes to
   * `ensureTemplateVersionContent`, which scopes its version lookup by it —
   * otherwise the receipt predicts a different version than the seeder sees.
   */
  language?: string;
}

export async function reportCoverage(
  db: PrismaClient,
  alias: string,
  opts: CoverageOptions,
): Promise<void> {
  const language = opts.language ?? "enUS";

  const tpl = await db.assessmentTemplate.findUnique({
    where: { alias },
    select: { id: true },
  });
  if (!tpl) return;

  // Same scope as ensureTemplateVersionContent: { templateId, language }.
  const latest = await db.assessmentTemplateVersion.findFirst({
    where: { templateId: tpl.id, language },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true, publishedAt: true },
  });

  if (!latest) {
    console.log(`  versions (${language}): none`);
  } else if (latest.publishedAt !== null) {
    console.log(
      `  versions (${language}): latest v${latest.versionNumber} published ${latest.publishedAt.toISOString()} — hash left stale-but-documented (ADR-0025); a later re-seed appends a new DRAFT.`,
    );
  } else if (opts.seedSupersedesDraft) {
    console.log(
      `  versions (${language}): latest v${latest.versionNumber} is an UNPUBLISHED DRAFT — its contentHash goes stale on patch. This seed passes forceSupersedeDraft, so a re-seed SUPERSEDES that draft (appends a new one) rather than failing.`,
    );
  } else {
    console.log(
      `  versions (${language}): latest v${latest.versionNumber} is an UNPUBLISHED DRAFT — its contentHash goes stale on patch, and this seed does NOT pass forceSupersedeDraft, so the next re-seed FAILS CLOSED. Publish it, or re-run the seed with the flag.`,
    );
  }

  const campaigns = await db.assessmentCampaign.findMany({
    where: { templateId: tpl.id },
    select: {
      name: true,
      deletedAt: true,
      invitationSubject: true,
      invitationBodyMarkdown: true,
      invitationBodyHtml: true,
    },
  });
  const overrides = campaigns.filter(
    (c) =>
      c.invitationSubject !== null ||
      c.invitationBodyMarkdown !== null ||
      c.invitationBodyHtml !== null,
  );
  const liveOverrides = overrides.filter((c) => c.deletedAt === null);
  console.log(
    `  campaigns: ${campaigns.length} total, ${overrides.length} with an invitation override (${liveOverrides.length} live) — overrides are NOT patched.`,
  );
  for (const o of liveOverrides) {
    console.log(
      `    ! live override kept: "${o.name}"${o.invitationBodyHtml !== null ? " (full HTML — bypasses the branded shell entirely)" : ""}`,
    );
  }
}
