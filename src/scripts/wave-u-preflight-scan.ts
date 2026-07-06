/**
 * Wave U — D19 preflight scan (spec 19u §5 step 0). READ-ONLY.
 *
 * Scans EVERY AssessmentTemplateVersion's questions JSON (published AND
 * drafts) against the Wave U publish-time findings validation, so the new
 * non-killable checks can't newly block an unrelated future publish
 * (the risk path is Duplicate-from-published hydration carrying legacy
 * stray fields into a new draft).
 *
 * Checks (mirrors spec U-2 publish tier):
 *   1. `recommendations` present on a TEXT question
 *   2. malformed band (non-numeric min/max, missing text) on SLIDER/NUMBER
 *   3. band max < min
 *   4. overlapping bands (SLIDER/NUMBER)
 *   5. slider bands present but NOT tiling the scale (informational —
 *      published rows never re-validate, but duplication carries content
 *      into future drafts whose publish would fail)
 *   6. MULTI_CHOICE rule with non-string optionKey / missing text
 *   7. MULTI_CHOICE duplicate rule optionKeys
 *   8. MULTI_CHOICE rule optionKey not among the question's options
 *   9. rule text longer than 2,000 chars
 *
 * Usage: npx tsx scripts/wave-u-preflight-scan.ts   (from src/; SELECT-only)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type Issue = {
  templateId: string;
  versionId: string;
  versionNumber: number;
  publishedAt: string | null;
  questionKey: string;
  problem: string;
};

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

async function main() {
  const versions = await db.assessmentTemplateVersion.findMany({
    select: {
      id: true,
      templateId: true,
      versionNumber: true,
      publishedAt: true,
      questions: true,
      template: { select: { alias: true, name: true } },
    },
  });

  const issues: Issue[] = [];
  let versionCount = 0;
  let questionCount = 0;
  let ruleBearing = 0;

  for (const v of versions) {
    versionCount++;
    const qs = Array.isArray(v.questions) ? (v.questions as unknown[]) : [];
    for (const raw of qs) {
      if (!raw || typeof raw !== "object") continue;
      const q = raw as Record<string, unknown>;
      questionCount++;
      const key = typeof q.stableKey === "string" ? q.stableKey : "<no-key>";
      const type = typeof q.type === "string" ? q.type : "<no-type>";
      const recs = q.recommendations;
      if (recs === undefined || recs === null) continue;
      ruleBearing++;
      const push = (problem: string) =>
        issues.push({
          templateId: `${v.template?.alias ?? v.templateId}`,
          versionId: v.id,
          versionNumber: v.versionNumber,
          publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
          questionKey: key,
          problem,
        });

      if (!Array.isArray(recs)) {
        push(`recommendations is not an array (${typeof recs})`);
        continue;
      }
      if (type === "TEXT") push(`recommendations present on TEXT (${recs.length} rules)`);

      if (type === "SLIDER_LIKERT" || type === "NUMBER") {
        const bands = recs
          .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
          .map((b) => ({ min: b.minScore, max: b.maxScore, text: b.text }));
        if (bands.length !== recs.length) push("non-object band entries");
        for (const [i, b] of bands.entries()) {
          if (!isNum(b.min) || !isNum(b.max)) push(`band ${i}: non-numeric min/max`);
          else if (b.max < b.min) push(`band ${i}: max < min (${b.max} < ${b.min})`);
          if (typeof b.text !== "string") push(`band ${i}: missing text`);
          else if (b.text.length > 2000) push(`band ${i}: text ${b.text.length} chars (>2000)`);
        }
        const numeric = bands.filter((b) => isNum(b.min) && isNum(b.max)) as Array<{
          min: number;
          max: number;
        }>;
        const sorted = [...numeric].sort((a, b) => a.min - b.min);
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i + 1].min <= sorted[i].max)
            push(`bands overlap: [${sorted[i].min},${sorted[i].max}] vs [${sorted[i + 1].min},${sorted[i + 1].max}]`);
        }
        if (type === "SLIDER_LIKERT" && sorted.length > 0) {
          const scale = (q.scale ?? {}) as Record<string, unknown>;
          if (isNum(scale.min) && isNum(scale.max)) {
            const isInt = scale.step === 1;
            let tiled =
              sorted[0].min === scale.min && sorted[sorted.length - 1].max === scale.max;
            for (let i = 0; tiled && i < sorted.length - 1; i++) {
              const expected = isInt ? sorted[i].max + 1 : sorted[i].max;
              if (sorted[i + 1].min !== expected) tiled = false;
            }
            if (!tiled) push("slider bands do not tile the scale (INFO — future-publish risk)");
          }
        }
      }

      if (type === "MULTI_CHOICE") {
        const optionKeys = new Set(
          (Array.isArray(q.options) ? (q.options as unknown[]) : [])
            .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
            .map((o) => o.key)
            .filter((k): k is string => typeof k === "string")
        );
        const seen = new Set<string>();
        for (const [i, r] of recs.entries()) {
          if (!r || typeof r !== "object") {
            push(`rule ${i}: non-object`);
            continue;
          }
          const rr = r as Record<string, unknown>;
          if (typeof rr.optionKey !== "string") push(`rule ${i}: non-string optionKey`);
          else {
            if (seen.has(rr.optionKey)) push(`rule ${i}: duplicate optionKey "${rr.optionKey}"`);
            seen.add(rr.optionKey);
            if (!optionKeys.has(rr.optionKey))
              push(`rule ${i}: optionKey "${rr.optionKey}" not among options`);
          }
          if (typeof rr.text !== "string") push(`rule ${i}: missing text`);
          else if (rr.text.length > 2000) push(`rule ${i}: text ${rr.text.length} chars (>2000)`);
        }
      }
    }
  }

  console.log(
    `Scanned ${versionCount} versions / ${questionCount} questions; ${ruleBearing} rule-bearing questions.`
  );
  if (issues.length === 0) {
    console.log("PREFLIGHT CLEAN — no payload would trip the Wave U publish checks.");
  } else {
    console.log(`PREFLIGHT FOUND ${issues.length} issue(s):`);
    for (const i of issues) {
      console.log(
        `  [${i.templateId} v${i.versionNumber} ${i.publishedAt ? "PUBLISHED" : "draft"} ${i.versionId}] ${i.questionKey}: ${i.problem}`
      );
    }
  }
}

main()
  .catch((e) => {
    console.error("scan failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
