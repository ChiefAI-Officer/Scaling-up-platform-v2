#!/usr/bin/env node
/**
 * diff-lva-source.mjs — READ-ONLY structured diff: seeded LVA content vs Jeff's source xlsx.
 *
 * Wave E, Task 12 (investigation half) — Spec 17 #29 ("Vision Alignment questions,
 * esp. 'Obstacles and Challenges', don't match Jeff's source").
 *
 * This tool DOES NOT touch the database and DOES NOT modify the seed. It reads:
 *   1. OUR seed source  : prisma/seed-lva-assessment.ts  (regex-extracted, no DB)
 *   2. JEFF'S source    : the Esperto xlsx export of a FILLED LVA assessment
 * and emits a human-reviewable, per-section divergence report to stdout AND to
 *   docs/specs/v7.6/17e-lva-source-diff.md
 *
 * ── xlsx parser approach ─────────────────────────────────────────────────────
 * No `xlsx` / `exceljs` package is installed. `python3` + `openpyxl` IS available,
 * so we shell out (via execFileSync — NO shell, no injection surface) to a tiny
 * inline python helper that returns the "Questions" sheet as a JSON list of
 * {coord,row,col,value} cells — STRUCTURE PRESERVED (sheet name + cell coordinates),
 * not a flat sharedStrings dump. We record openpyxl's version.
 *
 * ── question / answer strip heuristic (documented) ───────────────────────────
 * The "Questions" sheet of this Esperto export is laid out in columns:
 *   - Column A  : the STATIC QUESTION PROMPT (what we want). Trailing " *" = required.
 *                 Some col-A cells are section intro / instruction prose, not questions
 *                 (detected by known leading markers).
 *   - Column B  : the RESPONDENT'S FILLED-IN ANSWER (e.g. "save money", "100",
 *                 "be largest blah org in country"). We STRIP every column-B value.
 *   - Column C+ : an input-type / unit hint ("million ...", "%", "Open text",
 *                 "Check box selections", "Strong/Average/Weak" headers) or an "x"
 *                 marking the respondent's slider / checkbox selection — also an ANSWER,
 *                 also stripped for the question-text comparison.
 * So: questions = column-A static prompts only. Everything in B and C..F is treated
 * as respondent answer / input metadata and excluded from the question set.
 *
 * Run (from src/):  node scripts/diff-lva-source.mjs
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dirname, ".."); // scripts/ -> src/
const REPO_ROOT = resolve(SRC_ROOT, ".."); // src/ -> repo root
const SEED_TS = resolve(SRC_ROOT, "prisma/seed-lva-assessment.ts");
const XLSX_PATH =
  "/Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_leadership vision alignment assessment/leadership visin alignment assement.xlsx";
// docs/specs/v7.6 lives at the repo root, not under src/.
const OUT_MD = resolve(REPO_ROOT, "docs/specs/v7.6/17e-lva-source-diff.md");

// ── helpers ──────────────────────────────────────────────────────────────────
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const norm = (s) =>
  String(s ?? "")
    .replace(/ /g, " ") // NBSP -> space
    .replace(/\s+/g, " ")
    .trim();
/** Normalised key for fuzzy matching: lowercase, strip trailing required *, punctuation, collapse ws. */
const matchKey = (s) =>
  norm(s)
    .toLowerCase()
    .replace(/\s*\*\s*$/, "")
    .replace(/[?.:;,'"()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Cheap token-overlap similarity (Jaccard on word sets) for near-match detection.
function similarity(a, b) {
  const sa = new Set(matchKey(a).split(" ").filter(Boolean));
  const sb = new Set(matchKey(b).split(" ").filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// ── 1. read + hash the xlsx, parse via python/openpyxl ─────────────────────────
function parseXlsx() {
  if (!existsSync(XLSX_PATH)) {
    throw new Error(`Source xlsx not found: ${XLSX_PATH}`);
  }
  const xlsxBuf = readFileSync(XLSX_PATH);
  const xlsxSha = sha256(xlsxBuf);

  // Inline python helper. The only interpolated value is the constant XLSX_PATH,
  // embedded as a JSON string literal. Invoked with execFileSync (argv array, NO
  // shell) so there is no command-injection surface.
  const py = `
import json, openpyxl
path = ${JSON.stringify(XLSX_PATH)}
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
sheet = "Questions"
ws = wb[sheet]
cells = []
for row in ws.iter_rows():
    for c in row:
        if c.value is None: continue
        v = str(c.value)
        if v.strip() == "": continue
        cells.append({"coord": c.coordinate, "row": c.row, "col": c.column, "value": v})
print(json.dumps({"openpyxl": openpyxl.__version__, "sheet": sheet,
                  "sheetnames": wb.sheetnames, "cells": cells}))
`;
  const stdout = execFileSync("python3", ["-c", py], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  return {
    xlsxSha,
    parser: `python3 openpyxl ${parsed.openpyxl} (read_only, data_only)`,
    sheet: parsed.sheet,
    sheetnames: parsed.sheetnames,
    cells: parsed.cells,
  };
}

/**
 * Extract source question prompts from the parsed cells.
 * Strip heuristic (see file header): keep column-A prompts; drop B (answers) and C+ (hints/marks).
 * Also classify each col-A row so the reviewer sees prose/instructions vs real prompts.
 */
function extractSourceQuestions(cells) {
  const byRowCol = new Map(); // `${row}:${col}` -> value
  for (const c of cells) byRowCol.set(`${c.row}:${c.col}`, norm(c.value));

  const colA = cells.filter((c) => c.col === 1).sort((a, b) => a.row - b.row);

  const SECTION_FACTORS = new Set([
    // The 16 strength factors appear as bare col-A rows in BOTH the slider matrix
    // (rows 31-46) and the checkbox list (rows 49-64). They are option labels, not
    // standalone questions — flagged as "factor-option" rows.
    "recruitment of new employees",
    "retaining staff",
    "leadership team",
    "the leadership",
    "culture",
    "internal communications",
    "strategy",
    "execution and operational processes",
    "marketing",
    "sales",
    "technology",
    "scalability",
    "innovation",
    "financial processes",
    "cash",
    "growth financing",
  ]);

  const out = [];
  for (const c of colA) {
    const text = norm(c.value);
    const key = matchKey(text);
    const answer = byRowCol.get(`${c.row}:2`) ?? null; // col B
    const hintC = byRowCol.get(`${c.row}:3`) ?? null; // col C

    let kind = "question";
    const lower = text.toLowerCase();
    if (SECTION_FACTORS.has(key)) {
      kind = "factor-option"; // slider matrix row OR checkbox option
    } else if (
      lower.startsWith("welcome to the") ||
      lower.startsWith("this is the last page") ||
      lower.startsWith("this puts in boxes") ||
      lower.startsWith("now we'd like to ask you") ||
      lower.startsWith("leadership vision alignment assessment")
    ) {
      kind = "instruction"; // section intro / prose, not a question
    } else if (!/[?:*]\s*$/.test(text) && text.length < 40 && !hintC) {
      kind = "fragment";
    }

    out.push({
      coord: c.coord,
      row: c.row,
      kind,
      required: /\*\s*$/.test(text),
      text,
      key,
      answer, // stripped from comparison; shown for transparency
      hint: hintC,
    });
  }
  return out;
}

// ── 2. load our seed (regex-extract — robust + dependency-free, no DB) ──────────
function loadSeed() {
  const tsSrc = readFileSync(SEED_TS, "utf8");

  // Section list: stableKey + name from the SectionPayload[] literal.
  const sections = [];
  const secRe = /stableKey:\s*"(S\d_[a-z]+)"[\s\S]*?name:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = secRe.exec(tsSrc)) !== null) {
    sections.push({ stableKey: m[1], name: m[2].replace(/\\"/g, '"') });
  }

  // Questions: each object literal that has type + label + sectionStableKey.
  const questions = [];
  const qBlockRe =
    /\{[^{}]*?type:\s*"[A-Z_]+"[^{}]*?sectionStableKey:\s*"S\d_[a-z]+"[^{}]*?\}/gs;
  for (const block of tsSrc.match(qBlockRe) ?? []) {
    const label = block.match(/label:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    const type = block.match(/type:\s*"([A-Z_]+)"/)?.[1];
    const section = block.match(/sectionStableKey:\s*"(S\d_[a-z]+)"/)?.[1];
    const required = /isRequired:\s*true/.test(block);
    if (label && type && section) {
      questions.push({
        label: label.replace(/\\"/g, '"'),
        type,
        section,
        required,
        key: matchKey(label),
      });
    }
  }

  // The 16 SLIDER (S3) + 16 "why" (S5) labels are GENERATED in loops — recover them
  // from FACTORS_FOR_MATRIX so the diff sees the full question set.
  const factorsBlock = tsSrc.match(
    /const FACTORS_FOR_MATRIX = \[([\s\S]*?)\] as const;/
  )?.[1];
  const factors = factorsBlock
    ? [...factorsBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1])
    : [];

  for (const f of factors) {
    questions.push({
      label: f,
      type: "SLIDER_LIKERT",
      section: "S3_strengths",
      required: true,
      key: matchKey(f),
      generated: true,
    });
  }
  for (const f of factors) {
    const label = `Why is ${f} a hindrance?`;
    questions.push({
      label,
      type: "TEXT",
      section: "S5_explained",
      required: false,
      key: matchKey(label),
      generated: true,
    });
  }

  return { sections, questions, factors };
}

// ── 3. build the diff ──────────────────────────────────────────────────────────
// Map each xlsx col-A row to the seed section it belongs to, by its row range,
// mirroring the seed's own header comments (which cite the xlsx row indices).
function sourceRowToSection(row) {
  if (row <= 4) return "S0_welcome";
  if (row >= 6 && row <= 14) return "S1_financials";
  if (row >= 17 && row <= 26) return "S2_vision";
  if (row >= 29 && row <= 46) return "S3_strengths";
  if (row >= 48 && row <= 64) return "S4_obstacles";
  if (row >= 66 && row <= 73) return "S5_explained";
  if (row >= 75 && row <= 105) return "S6_focus";
  return "S7_completion";
}

const SECTION_ORDER = [
  "S0_welcome",
  "S1_financials",
  "S2_vision",
  "S3_strengths",
  "S4_obstacles",
  "S5_explained",
  "S6_focus",
  "S7_completion",
];

function buildDiff(seed, source) {
  const srcQuestions = source.questions.filter(
    (q) => q.kind === "question" || q.kind === "factor-option"
  );
  for (const q of srcQuestions) q.section = sourceRowToSection(q.row);

  const SIM_THRESHOLD = 0.55;
  const perSection = {};
  for (const sk of SECTION_ORDER) {
    perSection[sk] = { seedOnly: [], sourceOnly: [], nearMatches: [], exact: [] };
  }

  const seedBySection = {};
  const srcBySection = {};
  for (const sk of SECTION_ORDER) {
    seedBySection[sk] = [];
    srcBySection[sk] = [];
  }
  for (const q of seed.questions) (seedBySection[q.section] ??= []).push(q);
  for (const q of srcQuestions) (srcBySection[q.section] ??= []).push(q);

  for (const sk of SECTION_ORDER) {
    const seedQs = seedBySection[sk] ?? [];
    const srcQs = srcBySection[sk] ?? [];
    const srcMatched = new Set();

    for (const sq of seedQs) {
      const exactIdx = srcQs.findIndex(
        (x, i) => !srcMatched.has(i) && x.key === sq.key
      );
      if (exactIdx >= 0) {
        srcMatched.add(exactIdx);
        perSection[sk].exact.push({ seed: sq, source: srcQs[exactIdx] });
        continue;
      }
      let best = { sim: 0, idx: -1 };
      srcQs.forEach((x, i) => {
        if (srcMatched.has(i)) return;
        const s = similarity(sq.label, x.text);
        if (s > best.sim) best = { sim: s, idx: i };
      });
      if (best.sim >= SIM_THRESHOLD) {
        srcMatched.add(best.idx);
        perSection[sk].nearMatches.push({
          seed: sq,
          source: srcQs[best.idx],
          sim: Number(best.sim.toFixed(2)),
        });
      } else {
        perSection[sk].seedOnly.push(sq);
      }
    }
    srcQs.forEach((x, i) => {
      if (!srcMatched.has(i)) perSection[sk].sourceOnly.push(x);
    });
  }

  return perSection;
}

// ── 4. render markdown ──────────────────────────────────────────────────────────
const SECTION_TITLE = {
  S0_welcome: "S0 Welcome",
  S1_financials: "S1 The Company in Three Years — Financials & Scale",
  S2_vision: "S2 Vision on the Future",
  S3_strengths: "S3 Organizational Strengths and Weaknesses",
  S4_obstacles: "S4 Biggest Obstacles to Growth",
  S5_explained: "S5 Obstacles and Challenges Explained  <- #29 FLAGGED AREA",
  S6_focus: "S6 Important Focus Areas",
  S7_completion: "S7 Completion",
};

function renderMarkdown(seed, source, diff, prov) {
  const L = [];
  const p = (s = "") => L.push(s);

  p("# LVA Seed <-> Jeff Source Workbook — Structured Divergence (READ-ONLY)");
  p();
  p("> Generated by `src/scripts/diff-lva-source.mjs` for Spec 17 #29");
  p("> (\"Vision Alignment questions, esp. 'Obstacles and Challenges', don't match Jeff's source\").");
  p("> **This is a diagnostic only — the seed is NOT modified. Reconcile is a separate, human-gated step.**");
  p();
  p("## Provenance (R3-L1)");
  p();
  p("| Artifact | Value |");
  p("| --- | --- |");
  p(`| Source xlsx | \`${XLSX_PATH}\` |`);
  p(`| Source xlsx SHA-256 | \`${prov.xlsxSha}\` |`);
  p(`| Parser | ${prov.parser} |`);
  p(`| xlsx sheets | ${source.sheetnames.map((s) => `\`${s}\``).join(", ")} |`);
  p(`| Parsed sheet | \`${source.sheet}\` |`);
  p(`| Seed source | \`prisma/seed-lva-assessment.ts\` |`);
  p(`| Generated at | ${new Date().toISOString()} |`);
  p(`| Diff text SHA-256 | \`__DIFF_SHA__\` (self-hash of body below, computed post-render) |`);
  p();
  p("### Strip heuristic (question vs answer)");
  p();
  p("The `Questions` sheet is column-structured: **col A = static question prompt**");
  p("(trailing ` *` = required), **col B = the respondent's filled-in answer**, **col C+ =");
  p("input-type/unit hint or an `x` marking a slider/checkbox selection**. Only col-A");
  p("prompts are compared; all col-B answers and col-C+ hints/marks are stripped. Col-A");
  p("rows that are section prose (`Welcome to the...`, `This is the last page...`) or bare");
  p("16-factor option labels are classified separately so they don't masquerade as questions.");
  p();

  let totSeedOnly = 0, totSrcOnly = 0, totNear = 0, totExact = 0;
  for (const sk of SECTION_ORDER) {
    totSeedOnly += diff[sk].seedOnly.length;
    totSrcOnly += diff[sk].sourceOnly.length;
    totNear += diff[sk].nearMatches.length;
    totExact += diff[sk].exact.length;
  }
  const srcCompared = source.questions.filter(
    (q) => q.kind === "question" || q.kind === "factor-option"
  ).length;
  p("## Headline");
  p();
  p(`- Seed questions total: **${seed.questions.length}**`);
  p(`- Source question/option rows compared: **${srcCompared}**`);
  p(`- Exact matches: **${totExact}** · Near-matches (differing wording): **${totNear}** · Seed-only: **${totSeedOnly}** · Source-only: **${totSrcOnly}**`);
  p();

  for (const sk of SECTION_ORDER) {
    const d = diff[sk];
    p(`## ${SECTION_TITLE[sk]}`);
    p();
    const hasDelta =
      d.seedOnly.length || d.sourceOnly.length || d.nearMatches.length;
    if (!hasDelta) {
      p(`_${d.exact.length} question(s); all match exactly. No divergence._`);
      p();
      continue;
    }
    if (d.nearMatches.length) {
      p("**Near-matches — same intent, DIFFERENT WORDING (review):**");
      p();
      for (const n of d.nearMatches) {
        p(`- sim ${n.sim} · type \`${n.seed.type}\``);
        p(`  - SEED:   ${JSON.stringify(n.seed.label)}`);
        p(`  - SOURCE: ${JSON.stringify(n.source.text)} _(xlsx ${n.source.coord})_`);
      }
      p();
    }
    if (d.seedOnly.length) {
      p("**In SEED but NOT found in source (seed-invented / restructured):**");
      p();
      for (const q of d.seedOnly) {
        p(`- \`${q.type}\`${q.generated ? " _(loop-generated)_" : ""}: ${JSON.stringify(q.label)}`);
      }
      p();
    }
    if (d.sourceOnly.length) {
      p("**In SOURCE but NOT matched to a seed question (missing from seed / extra):**");
      p();
      for (const q of d.sourceOnly) {
        const ans = q.answer ? `  _(sample answer stripped: ${JSON.stringify(q.answer)})_` : "";
        p(`- _(xlsx ${q.coord}, kind=${q.kind})_: ${JSON.stringify(q.text)}${ans}`);
      }
      p();
    }
    if (d.exact.length) {
      p(`<sub>(${d.exact.length} other question(s) in this section matched exactly.)</sub>`);
      p();
    }
  }

  // Raw extracted source list — so a human can map by hand if needed.
  p("## Appendix A — RAW extracted source question rows (col A only, answers stripped)");
  p();
  p("| xlsx | kind | req | prompt | (stripped) sample answer |");
  p("| --- | --- | --- | --- | --- |");
  for (const q of source.questions) {
    const a = q.answer ? q.answer.replace(/\|/g, "\\|") : "";
    p(`| ${q.coord} | ${q.kind} | ${q.required ? "*" : ""} | ${q.text.replace(/\|/g, "\\|")} | ${a} |`);
  }
  p();

  p("## Appendix B — Seed question inventory (by section)");
  p();
  for (const sk of SECTION_ORDER) {
    const qs = seed.questions.filter((q) => q.section === sk);
    if (!qs.length) {
      p(`### ${SECTION_TITLE[sk]} — (no questions)`);
      p();
      continue;
    }
    p(`### ${SECTION_TITLE[sk]} — ${qs.length} question(s)`);
    p();
    for (const q of qs) {
      p(`- \`${q.type}\`${q.required ? " *" : ""}: ${JSON.stringify(q.label)}`);
    }
    p();
  }

  let body = L.join("\n");
  const diffSha = sha256(body);
  body = body.replace("__DIFF_SHA__", diffSha);
  return { body, diffSha };
}

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  const source = parseXlsx();
  const extracted = extractSourceQuestions(source.cells);
  source.questions = extracted;

  const seed = loadSeed();
  const diff = buildDiff(seed, source);

  const { body, diffSha } = renderMarkdown(seed, source, diff, {
    xlsxSha: source.xlsxSha,
    parser: source.parser,
  });

  writeFileSync(OUT_MD, body + "\n", "utf8");

  console.log(body);
  console.log("\n────────────────────────────────────────────────────────");
  console.log("PROVENANCE (R3-L1):");
  console.log(`  source xlsx SHA-256 : ${source.xlsxSha}`);
  console.log(`  parser              : ${source.parser}`);
  console.log(`  diff text SHA-256   : ${diffSha}`);
  console.log(`  written to          : ${OUT_MD}`);
  console.log("  (READ-ONLY — no DB touched, seed not modified.)");
}

main();
