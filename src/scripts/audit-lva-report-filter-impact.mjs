#!/usr/bin/env node
/**
 * audit-lva-report-filter-impact.mjs — READ-ONLY pre-merge impact audit.
 *
 * Wave I (Spec 17 #29 / Spec 18i), Task 0. This script does NOT ship behavior;
 * it quantifies the RETROACTIVE impact of the upcoming Wave I LVA per-respondent
 * report filter before deploy, so the change can be approved on real numbers.
 *
 * ── What Wave I changes (and why this audit exists) ──────────────────────────
 * The LVA per-respondent report will, on deploy, (a) drop the `S3_strengths`
 * section and (b) render `S5_why_<factor>` ("Why is X a hindrance?") follow-ups
 * ONLY for factors the respondent CHECKED in `S4_biggest_obstacles`. This is
 * retroactive — existing reports re-render under the new filter. Some existing
 * respondents typed an `S5_why_<f>` explanation for a factor they did NOT check;
 * after Wave I that explanation is HIDDEN. This script counts, over existing
 * production submissions, how many reports lose >=1 obstacle explanation
 * (the "hide rate"), plus the fail-open population (no usable S4 gate).
 *
 * ── SAFETY (R2-M2) ───────────────────────────────────────────────────────────
 * READ-ONLY. Requires its OWN env var `AUDIT_READONLY_URL` (no fall-back to
 * DATABASE_URL / DIRECT_URL). All reads run inside a single
 * `SET TRANSACTION READ ONLY` transaction; only SELECTs are issued; nothing is
 * written. The connection string is NEVER printed (host-only, redacted).
 *
 * ── Output (NON-PII) ─────────────────────────────────────────────────────────
 * IDs and integers only — no names, no emails, no answer text. Per campaign and
 * as grand totals:
 *   (a) completed LVA submissions          (all lose the S3 matrix — sanity)
 *   (b) submissions with >=1 hidden S5_why_ (the HIDE RATE) + a hidden-count histogram
 *   (c) submissions with NO usable S4_biggest_obstacles (the fail-open population)
 * Plus an id-only sample for (b) and (c), and a one-line HIDE RATE summary.
 *
 * Usage (point ONLY at a read-only/replica connection string):
 *   AUDIT_READONLY_URL="postgres://...readonly..." node scripts/audit-lva-report-filter-impact.mjs
 *
 * Exit codes:
 *   0  Ran successfully.
 *   1  Misuse (missing env) or error.
 */

import { PrismaClient } from "@prisma/client";

// ── Filter config constants — MUST match the Wave I report filter config ─────
// Source of truth: src/lib/assessments/qualitative-report-model.ts
//   "leadership-vision-alignment": {
//     suppressSections: ["S3_strengths"],
//     conditionalFollowups: { gateKey: "S4_biggest_obstacles", followupPrefix: "S5_why_" },
//   }
const LVA_TEMPLATE_ALIAS = "leadership-vision-alignment";
const S4_GATE_KEY = "S4_biggest_obstacles";
const S5_PREFIX = "S5_why_";
const SAMPLE_LIMIT = 20; // id-only sample cap per bucket

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Redact a Postgres connection string to host (+ db name) only. Never throws. */
function redactConnString(raw) {
  if (!raw) return "(unset)";
  try {
    const u = new URL(raw);
    const db = u.pathname && u.pathname !== "/" ? u.pathname : "";
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${db}`;
  } catch {
    // Could not parse — do NOT echo the raw value (it may contain credentials).
    return "(redacted — unparseable connection string)";
  }
}

/**
 * Pull the checked-factor SET from the S4 answer object.
 * Handles BOTH `value: string[]` and `selectedKeys: string[]`. Returns null when
 * neither shape yields a usable array (the fail-open signal).
 */
function extractCheckedFactors(s4Answer) {
  if (!s4Answer || typeof s4Answer !== "object") return null;
  const fromValue = Array.isArray(s4Answer.value) ? s4Answer.value : null;
  const fromSelected = Array.isArray(s4Answer.selectedKeys)
    ? s4Answer.selectedKeys
    : null;
  const arr = fromValue ?? fromSelected;
  if (!arr) return null;
  const set = new Set();
  for (const v of arr) {
    if (typeof v === "string" && v.trim().length > 0) set.add(v.trim());
  }
  return set;
}

/** "present" = a non-empty trimmed string in `value` or `textValue`. */
function answerHasText(answer) {
  if (!answer || typeof answer !== "object") return false;
  const v = answer.value;
  const t = answer.textValue;
  if (typeof v === "string" && v.trim().length > 0) return true;
  if (typeof t === "string" && t.trim().length > 0) return true;
  return false;
}

/**
 * Analyze one submission's answers array.
 * Returns { hiddenCount, hasS4Gate } where:
 *   - hasS4Gate: a usable S4_biggest_obstacles array was present (fail-open = false)
 *   - hiddenCount: number of present S5_why_<f> whose <f> is NOT in the checked set.
 *     If the S4 gate is missing, Wave I fails OPEN (renders all follow-ups), so
 *     hiddenCount is 0 for that submission — it loses no explanation.
 */
function analyzeSubmission(answers) {
  if (!Array.isArray(answers)) {
    return { hiddenCount: 0, hasS4Gate: false };
  }

  let s4Answer = null;
  const s5Present = []; // factor keys (after the prefix) with present text
  for (const a of answers) {
    if (!a || typeof a !== "object" || typeof a.stableKey !== "string") continue;
    const key = a.stableKey;
    if (key === S4_GATE_KEY) {
      s4Answer = a;
    } else if (key.startsWith(S5_PREFIX)) {
      if (answerHasText(a)) {
        s5Present.push(key.slice(S5_PREFIX.length));
      }
    }
  }

  const checked = extractCheckedFactors(s4Answer);
  const hasS4Gate = checked !== null;

  // Fail-open: with no usable gate, Wave I renders every follow-up → nothing hidden.
  if (!hasS4Gate) {
    return { hiddenCount: 0, hasS4Gate: false };
  }

  let hiddenCount = 0;
  for (const factor of s5Present) {
    if (!checked.has(factor)) hiddenCount += 1;
  }
  return { hiddenCount, hasS4Gate: true };
}

/** Bucket a hidden count into the histogram label. */
function histoBucket(n) {
  if (n <= 0) return null;
  if (n === 1) return "1";
  if (n === 2) return "2";
  return "3+";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const readonlyUrl = process.env.AUDIT_READONLY_URL;
  if (!readonlyUrl || readonlyUrl.trim().length === 0) {
    console.error(
      "ERROR: AUDIT_READONLY_URL is required and must be set to a READ-ONLY " +
        "(replica or read-only-role) Postgres connection string.\n" +
        "This script will NOT fall back to DATABASE_URL or DIRECT_URL.\n\n" +
        "Usage:\n" +
        '  AUDIT_READONLY_URL="postgres://...readonly..." \\\n' +
        "    node scripts/audit-lva-report-filter-impact.mjs",
    );
    process.exit(1);
  }

  console.log("LVA report-filter impact audit (READ-ONLY)");
  console.log(`  target           : ${redactConnString(readonlyUrl)}`);
  console.log(`  template alias   : ${LVA_TEMPLATE_ALIAS}`);
  console.log(`  S4 gate key      : ${S4_GATE_KEY}`);
  console.log(`  S5 prefix        : ${S5_PREFIX}`);
  console.log("");

  const prisma = new PrismaClient({
    datasources: { db: { url: readonlyUrl } },
  });

  try {
    const submissionRows = await prisma.$transaction(async (tx) => {
      // The very first statement enforces read-only for the whole transaction.
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

      // Completed LVA submissions. Mirrors the canonical "completed" predicate
      // in src/lib/assessments/group-report.ts (~L281-287):
      //   respondentId non-null AND invitation.status === "SUBMITTED"
      // scoped here to campaigns whose TEMPLATE alias is the LVA instrument.
      return tx.assessmentSubmission.findMany({
        where: {
          respondentId: { not: null },
          invitation: { status: "SUBMITTED" },
          campaign: { template: { alias: LVA_TEMPLATE_ALIAS } },
        },
        select: {
          id: true,
          campaignId: true,
          answers: true,
        },
      });
    });

    // Per-campaign + grand-total accumulators.
    /** @type {Map<string, {
     *   completed: number, hideCount: number, failOpen: number,
     *   histo: Record<string, number>, hideSample: string[], failOpenSample: string[],
     * }>} */
    const byCampaign = new Map();

    const grand = {
      completed: 0,
      hideCount: 0,
      failOpen: 0,
      histo: { 1: 0, 2: 0, "3+": 0 },
      hideSample: [],
      failOpenSample: [],
    };

    function bucketFor(campaignId) {
      let b = byCampaign.get(campaignId);
      if (!b) {
        b = {
          completed: 0,
          hideCount: 0,
          failOpen: 0,
          histo: { 1: 0, 2: 0, "3+": 0 },
          hideSample: [],
          failOpenSample: [],
        };
        byCampaign.set(campaignId, b);
      }
      return b;
    }

    for (const row of submissionRows) {
      const b = bucketFor(row.campaignId);
      b.completed += 1;
      grand.completed += 1;

      const { hiddenCount, hasS4Gate } = analyzeSubmission(row.answers);

      if (!hasS4Gate) {
        b.failOpen += 1;
        grand.failOpen += 1;
        if (b.failOpenSample.length < SAMPLE_LIMIT) b.failOpenSample.push(row.id);
        if (grand.failOpenSample.length < SAMPLE_LIMIT)
          grand.failOpenSample.push(row.id);
      }

      if (hiddenCount > 0) {
        b.hideCount += 1;
        grand.hideCount += 1;
        const bucket = histoBucket(hiddenCount);
        if (bucket) {
          b.histo[bucket] += 1;
          grand.histo[bucket] += 1;
        }
        if (b.hideSample.length < SAMPLE_LIMIT) b.hideSample.push(row.id);
        if (grand.hideSample.length < SAMPLE_LIMIT) grand.hideSample.push(row.id);
      }
    }

    // ── Per-campaign report ──────────────────────────────────────────────────
    console.log("=== Per-campaign ===");
    if (byCampaign.size === 0) {
      console.log("  (no completed LVA submissions found)");
    }
    const campaignIds = [...byCampaign.keys()].sort();
    for (const cid of campaignIds) {
      const b = byCampaign.get(cid);
      console.log(`\ncampaign ${cid}`);
      console.log(`  (a) completed LVA submissions      : ${b.completed}`);
      console.log(
        `  (b) reports losing >=1 explanation : ${b.hideCount}` +
          `  [hidden-count histogram: 1=${b.histo["1"]}, 2=${b.histo["2"]}, 3+=${b.histo["3+"]}]`,
      );
      if (b.hideSample.length > 0) {
        console.log(
          `      sample (b) submission ids        : ${b.hideSample.join(", ")}` +
            (b.hideCount > b.hideSample.length ? " …" : ""),
        );
      }
      console.log(`  (c) no usable S4 gate (fail-open)  : ${b.failOpen}`);
      if (b.failOpenSample.length > 0) {
        console.log(
          `      sample (c) submission ids        : ${b.failOpenSample.join(", ")}` +
            (b.failOpen > b.failOpenSample.length ? " …" : ""),
        );
      }
    }

    // ── Grand totals ───────────────────────────────────────────────────────────
    console.log("\n=== Grand totals ===");
    console.log(`  (a) completed LVA submissions      : ${grand.completed}`);
    console.log(
      `  (b) reports losing >=1 explanation : ${grand.hideCount}` +
        `  [hidden-count histogram: 1=${grand.histo["1"]}, 2=${grand.histo["2"]}, 3+=${grand.histo["3+"]}]`,
    );
    if (grand.hideSample.length > 0) {
      console.log(
        `      sample (b) submission ids        : ${grand.hideSample.join(", ")}` +
          (grand.hideCount > grand.hideSample.length ? " …" : ""),
      );
    }
    console.log(`  (c) no usable S4 gate (fail-open)  : ${grand.failOpen}`);
    if (grand.failOpenSample.length > 0) {
      console.log(
        `      sample (c) submission ids        : ${grand.failOpenSample.join(", ")}` +
          (grand.failOpen > grand.failOpenSample.length ? " …" : ""),
      );
    }

    console.log("");
    console.log(
      `HIDE RATE: ${grand.hideCount} of ${grand.completed} completed LVA ` +
        "reports will lose >=1 obstacle explanation.",
    );

    process.exitCode = 0;
  } catch (err) {
    console.error(`ERROR: audit failed — ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
