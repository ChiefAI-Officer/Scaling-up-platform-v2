/**
 * Wave V — D3 preflight tier scan (spec 19v §5 step 3). READ-ONLY.
 *
 * Scans EVERY AssessmentTemplateVersion (published AND drafts — Codex C3:
 * "live submissions succeed daily" only proves versions WITH traffic; a
 * freshly published zero-submission version has never exercised step 2)
 * against the NEW global tier-tiling publish gate (`checkGlobalTierTiling`),
 * reporting any version whose global `scoringConfig.tiers` don't tile its
 * metric domain — i.e. any version that would 400 INVALID_SCORING_CONFIG on
 * submit (the Wave U walk-found gap) and, for drafts, would now fail publish.
 *
 * Report-only: findings are Jeff-fixable in the editor (Duplicate → fix
 * tiers → publish). Nothing is mutated.
 *
 * Usage: npx tsx scripts/wave-v-preflight-tier-scan.ts   (from src/; SELECT-only)
 */
import { PrismaClient } from "@prisma/client";
import { TemplateVersionForPublishSchema } from "../src/lib/assessments/scoring";

const db = new PrismaClient();

type Finding = {
  templateAlias: string;
  templateName: string;
  versionId: string;
  versionNumber: number;
  publishedAt: string | null;
  kind: "global-tier-gap" | "unparseable";
  messages: string[];
};

async function main() {
  const versions = await db.assessmentTemplateVersion.findMany({
    select: {
      id: true,
      templateId: true,
      versionNumber: true,
      publishedAt: true,
      questions: true,
      sections: true,
      scoringConfig: true,
      template: { select: { alias: true, name: true } },
    },
  });

  const findings: Finding[] = [];
  let scanned = 0;

  for (const v of versions) {
    scanned++;
    const parsed = TemplateVersionForPublishSchema.safeParse({
      questions: v.questions,
      sections: v.sections,
      scoringConfig: v.scoringConfig,
    });
    if (parsed.success) continue;

    // The GLOBAL tier-tiling check routes issues under exactly
    // ["scoringConfig", "tiers", ...]; the per-domain check routes under
    // ["scoringConfig", "domains", ...]. Filter to the new gate only.
    const globalTierIssues = parsed.error.issues.filter(
      (i) => i.path[0] === "scoringConfig" && i.path[1] === "tiers",
    );
    if (globalTierIssues.length === 0) continue; // fails OTHER publish checks — out of scope here

    findings.push({
      templateAlias: v.template.alias,
      templateName: v.template.name,
      versionId: v.id,
      versionNumber: v.versionNumber,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      kind: "global-tier-gap",
      messages: globalTierIssues.map((i) => i.message),
    });
  }

  console.log(`Wave V preflight tier scan — ${scanned} versions scanned.`);
  if (findings.length === 0) {
    console.log("CLEAN: no version fails the global tier-tiling gate.");
  } else {
    console.log(`${findings.length} version(s) fail the global tier-tiling gate:`);
    for (const f of findings) {
      const state = f.publishedAt
        ? `PUBLISHED ${f.publishedAt} — submits 400 TODAY`
        : "DRAFT — publish would now be blocked";
      console.log(
        `\n- ${f.templateName} (${f.templateAlias}) v${f.versionNumber} [${state}]\n  version ${f.versionId}`,
      );
      for (const m of f.messages) console.log(`    · ${m}`);
    }
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
