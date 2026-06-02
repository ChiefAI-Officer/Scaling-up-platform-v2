# Assessment Content Re-seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder/approximated content in the 5 seeded assessment templates with the real Esperto instrument content (questions + scoring), shipped as new DRAFT versions for human publish.

**Architecture:** A shared version-aware seeder helper appends a new DRAFT `AssessmentTemplateVersion` (vN+1) per template when content changes — never mutating existing (published) rows, so it is safe against the immutability trigger and existing campaigns. Each of the 5 seed scripts is reworked to define real content + a real (or neutral) `scoringConfig` and call the helper. Per-assessment vertical slices; Rockefeller first (pilot, validates the helper), Scaling Up Full last.

**Tech Stack:** TypeScript, Prisma 6 (Neon Postgres), Zod (scoring schema), Jest. Seeds run via `npx tsx prisma/seed-<name>.ts` from `src/`. Spec: [docs/specs/v7.6/09-assessment-content-reseed.md](docs/specs/v7.6/09-assessment-content-reseed.md). Decisions: ADR-0001/0002/0003. Domain language: CONTEXT.md.

**Verified source-of-truth:** Per-assessment question lists, types, scales, and scoring were extracted and adversarially verified (spec §4). Implementers MUST transcribe verbatim question text from the cited source files in `From Jeff/APP_scaling up assessemnt/` (not paraphrase), and lock the transcription with the per-task verification assertions below. Question *content* is sourced data verified by tests; this plan specifies the *logic, structure, scoring, and counts* in full.

---

## File structure

- **Create** `src/src/lib/assessments/seed-template-version.ts` — shared `ensureTemplateVersionContent()` helper (append-DRAFT-vN+1-on-change; access-group link). One responsibility: idempotent version creation.
- **Create** `src/src/__tests__/seed/seed-template-version.test.ts` — unit tests for the helper (mock Prisma tx).
- **Modify** the 5 seed scripts (rework content + call the helper):
  - `src/prisma/seed-rockefeller-assessment.ts`
  - `src/prisma/seed-qsp-v1-assessment.ts`
  - `src/prisma/seed-qsp-v2-assessment.ts`
  - `src/prisma/seed-lva-assessment.ts`
  - `src/prisma/seed-scaling-up-full-assessment.ts`
- **Create/extend** per-assessment content tests in `src/src/__tests__/seed/`.
- **Create** `docs/specs/v7.6/09b-publish-review-checklist.md` — items Jeff confirms at publish (Task 8).

No Prisma migration (`scoringConfig`/`questions`/`sections` are `Json`). No engine change (`TEXT`/`NUMBER`/`MULTI_CHOICE` + per-question recommendations already supported).

---

## Task 0: Read-only prod verification (no code; gather facts)

**Goal:** Per template, learn the current latest `versionNumber`, its `publishedAt`, and the existing `stableKey` set — so the helper appends the correct next number and Rockefeller reuses its published keys (ADR-0001).

- [ ] **Step 1: Run a read-only query against prod** (via `dotenv-cli` + `.env.production.local`; do NOT mutate). From `src/`:
```bash
npx dotenv-cli -e .env.production.local -- npx tsx -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const aliases = ["RockHabits","qsp-v1","qsp-v2","leadership-vision-alignment","scaling-up-full"];
for (const alias of aliases) {
  const t = await db.assessmentTemplate.findUnique({ where: { alias }, select: { id: true } });
  if (!t) { console.log(alias, "MISSING"); continue; }
  const vs = await db.assessmentTemplateVersion.findMany({ where: { templateId: t.id, language: "enUS" }, select: { versionNumber: true, publishedAt: true, questions: true }, orderBy: { versionNumber: "desc" } });
  console.log(alias, JSON.stringify(vs.map(v => ({ v: v.versionNumber, published: !!v.publishedAt }))));
  if (alias === "RockHabits" && vs[0]) console.log("RockHabits stableKeys:", (vs[0].questions as any[]).map((q:any)=>q.stableKey).join(","));
}
await db.$disconnect();
'
```
Expected: prints latest versionNumber + published flag per template, and Rockefeller's existing stableKeys.

- [ ] **Step 2: Record findings** in `docs/specs/v7.6/09b-publish-review-checklist.md` (create it) under "Prod baseline (read-only)". Commit:
```bash
git add docs/specs/v7.6/09b-publish-review-checklist.md
git commit -m "docs(assessment): record prod version baseline before re-seed"
```

---

## Task 1: Shared version-aware seeder helper

**Files:** Create `src/src/lib/assessments/seed-template-version.ts`; Test `src/src/__tests__/seed/seed-template-version.test.ts`.

Replaces the per-seed "STATE A creates v1 / STATE C throws on hash mismatch" logic with: **append the next `versionNumber` as DRAFT when no existing version matches the content hash; no-op when one matches.** Never updates or deletes a version.

- [ ] **Step 1: Write the failing test**
```ts
// src/src/__tests__/seed/seed-template-version.test.ts
import { ensureTemplateVersionContent } from "@/lib/assessments/seed-template-version";

function makeTx(opts: { template?: { id: string } | null; versions?: Array<{ versionNumber: number; contentHash: string; publishedAt: Date | null }>; }) {
  const created: any[] = [];
  return {
    created,
    tx: {
      $executeRawUnsafe: async () => 0,
      assessmentTemplate: {
        findUnique: async () => opts.template ?? null,
        create: async ({ data }: any) => ({ id: "tmpl-new", ...data }),
      },
      assessmentTemplateVersion: {
        findMany: async () => opts.versions ?? [],
        create: async ({ data }: any) => { created.push(data); return { id: "ver-new", ...data }; },
      },
    } as any,
  };
}

const CONTENT = {
  alias: "X", name: "X", description: "d", invitationSubject: "s", invitationBodyMarkdown: "b", language: "enUS",
  sections: [{ stableKey: "S1", title: "S1", order: 0 }],
  questions: [{ stableKey: "Q1", type: "SLIDER_LIKERT", label: "L", sectionKey: "S1", order: 0, scale: { min: 0, max: 3 } }],
  scoringConfig: { tierMetric: "countAchieved", passThreshold: 2, tiers: [{ minMetric: 0, maxMetric: 1, label: "x", message: "m" }] },
};

test("appends versionNumber 2 as DRAFT when latest published version has a different hash", async () => {
  const { tx, created } = makeTx({ template: { id: "tmpl-1" }, versions: [{ versionNumber: 1, contentHash: "OLDHASH", publishedAt: new Date() }] });
  const res = await ensureTemplateVersionContent(tx as any, "sys-user", CONTENT as any);
  expect(res.action).toBe("created");
  expect(res.versionNumber).toBe(2);
  expect(created).toHaveLength(1);
  expect(created[0].publishedAt).toBeNull();
  expect(created[0].versionNumber).toBe(2);
});

test("no-ops when an existing version already matches the content hash", async () => {
  const first = makeTx({ template: { id: "t" }, versions: [] });
  const r1 = await ensureTemplateVersionContent(first.tx as any, "sys", CONTENT as any);
  const second = makeTx({ template: { id: "t" }, versions: [{ versionNumber: 1, contentHash: r1.contentHash, publishedAt: new Date() }] });
  const r2 = await ensureTemplateVersionContent(second.tx as any, "sys", CONTENT as any);
  expect(r2.action).toBe("noop");
  expect(second.created).toHaveLength(0);
});

test("creates version 1 when the template does not exist yet", async () => {
  const { tx, created } = makeTx({ template: null, versions: [] });
  const res = await ensureTemplateVersionContent(tx as any, "sys", CONTENT as any);
  expect(res.versionNumber).toBe(1);
  expect(created[0].publishedAt).toBeNull();
});
```

- [ ] **Step 2: Run test, verify it fails** — `npx jest src/__tests__/seed/seed-template-version.test.ts` → FAIL (not found).

- [ ] **Step 3: Implement the helper**
```ts
// src/src/lib/assessments/seed-template-version.ts
import { createHash } from "crypto";

export interface SeedContent {
  alias: string; name: string; description: string;
  invitationSubject: string; invitationBodyMarkdown: string;
  language: string; sections: unknown[]; questions: unknown[];
  scoringConfig: unknown; reportConfig?: unknown; aggregationMode?: string;
}
export interface SeedResult {
  action: "created" | "noop"; templateId: string; versionId: string; versionNumber: number; contentHash: string;
}

export function computeContentHash(c: SeedContent): string {
  const canonical = {
    questions: c.questions, sections: c.sections, scoringConfig: c.scoringConfig,
    reportConfig: c.reportConfig ?? null, invitationSubject: c.invitationSubject, invitationBodyMarkdown: c.invitationBodyMarkdown,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export async function ensureTemplateVersionContent(tx: any, systemUserId: string, c: SeedContent): Promise<SeedResult> {
  const contentHash = computeContentHash(c);
  let template = await tx.assessmentTemplate.findUnique({ where: { alias: c.alias }, select: { id: true } });
  if (!template) {
    template = await tx.assessmentTemplate.create({
      data: {
        name: c.name, alias: c.alias, description: c.description,
        invitationSubject: c.invitationSubject, invitationBodyMarkdown: c.invitationBodyMarkdown,
        aggregationMode: c.aggregationMode ?? "FULL_VISIBILITY", createdBy: systemUserId,
      }, select: { id: true },
    });
  }
  const versions = await tx.assessmentTemplateVersion.findMany({
    where: { templateId: template.id, language: c.language },
    select: { versionNumber: true, contentHash: true, publishedAt: true },
    orderBy: { versionNumber: "desc" },
  });
  const match = versions.find((v: any) => v.contentHash === contentHash);
  if (match) return { action: "noop", templateId: template.id, versionId: "", versionNumber: match.versionNumber, contentHash };

  const nextNumber = versions.length === 0 ? 1 : versions[0].versionNumber + 1;
  const version = await tx.assessmentTemplateVersion.create({
    data: {
      templateId: template.id, versionNumber: nextNumber, language: c.language,
      questions: c.questions as object, sections: c.sections as object, scoringConfig: c.scoringConfig as object,
      reportConfig: (c.reportConfig as object) ?? undefined, contentHash, publishedAt: null, publishedBy: null,
    }, select: { id: true },
  });
  return { action: "created", templateId: template.id, versionId: version.id, versionNumber: nextNumber, contentHash };
}
```

- [ ] **Step 4: Run tests, verify pass** — `npx jest src/__tests__/seed/seed-template-version.test.ts` → PASS (3/3).

- [ ] **Step 5: Commit**
```bash
git add src/src/lib/assessments/seed-template-version.ts src/src/__tests__/seed/seed-template-version.test.ts
git commit -m "feat(assessment): version-aware seeder helper (append DRAFT vN+1 on content change)"
```

---

## Task 2: Rockefeller (pilot — validates the helper)

**Files:** Modify `src/prisma/seed-rockefeller-assessment.ts`; add `src/src/__tests__/seed/rockefeller-content.test.ts`.

**Reality (spec §4.1):** questions + 0–3 scale + 3 scoring bands with verbatim messages are ALREADY correct. Fixes: (a) drop invented `anchorMin: "Not true"` / `anchorMax: "Completely true"`, (b) drop the trailing period on Q1_1 ("…priorities, and styles"), (c) section-7 straight double quotes around "alive". Reuse the existing published stableKeys (Task 0). Band edges 0–16/17–32/33–40 stay (provisional). Switch the script to `ensureTemplateVersionContent` (anchor removal changes the hash → appends DRAFT vN+1). Source: `From Jeff/APP_scaling up assessemnt/APP_Rockerfeller/Rockerfeller questions.xlsx`.

- [ ] **Step 1: Write the failing content test**
```ts
// src/src/__tests__/seed/rockefeller-content.test.ts
import { buildRockefellerContent } from "@/../prisma/seed-rockefeller-assessment";

test("Rockefeller content: 10 sections, 40 questions, 0-3 scale, no worded anchors", () => {
  const c = buildRockefellerContent();
  expect(c.sections).toHaveLength(10);
  expect(c.questions).toHaveLength(40);
  for (const q of c.questions as any[]) {
    expect(q.type).toBe("SLIDER_LIKERT");
    expect(q.scale).toEqual({ min: 0, max: 3 });
    expect(q.anchorMin).toBeUndefined();
    expect(q.anchorMax).toBeUndefined();
  }
  const q11 = (c.questions as any[]).find((q) => q.stableKey === "Q1_1");
  expect(q11.label.endsWith("styles")).toBe(true);
});

test("Rockefeller scoring: countAchieved, 3 verbatim-message tiers", () => {
  const sc = buildRockefellerContent().scoringConfig as any;
  expect(sc.tierMetric).toBe("countAchieved");
  expect(sc.passThreshold).toBe(2);
  expect(sc.tiers.map((t: any) => t.message)).toEqual([
    "That is a very low overall score.",
    "You're doing quite okay, and have a lot to improve further upon.",
    "That is a great overall score.",
  ]);
});
```

- [ ] **Step 2: Run, verify fails** — `npx jest src/__tests__/seed/rockefeller-content.test.ts` → FAIL (`buildRockefellerContent` not exported).

- [ ] **Step 3: Refactor the seed script.** Export a pure `buildRockefellerContent(): SeedContent`. Remove `anchorMin`/`anchorMax` from `QuestionPayload` + `buildSectionsAndQuestions`. Fix the Q1_1 label + section-7 quotes verbatim per the xlsx. Replace the `main()` STATE A–F block with: acquire advisory lock → `resolveSystemUser` → `ensureTemplateVersionContent(tx, sys.id, buildRockefellerContent())` → `ensureAccessGroupAndTemplateLink`. Keep stableKeys identical to the prod baseline (Task 0).

- [ ] **Step 4: Run tests + build gate** — `npx jest src/__tests__/seed/` → PASS; `CI=true npx next build --turbopack` → clean.

- [ ] **Step 5: Dry-run the seed against a dev/preview DB** (NOT prod): `npx tsx prisma/seed-rockefeller-assessment.ts` → appends DRAFT v(N+1); re-run is a no-op. Verify the new version has `publishedAt = null` and the prior published version is untouched.

- [ ] **Step 6: Commit**
```bash
git add src/prisma/seed-rockefeller-assessment.ts src/src/__tests__/seed/rockefeller-content.test.ts
git commit -m "feat(assessment): Rockefeller real-content fixes + version-aware seeder (DRAFT vN+1)"
```

---

## Task 3: QSP v1 (aggregation-only)

**Files:** Modify `src/prisma/seed-qsp-v1-assessment.ts`; add `src/src/__tests__/seed/qsp-v1-content.test.ts`.

**Reality (spec §4.2):** ~8 sections; 1 `NUMBER` (overall rating 1–10, 1 decimal) + 7 `SLIDER_LIKERT` (six-item 1–10 grid + 1 methodology slider; emoji/no-text anchors) + TEXT, with the core-values question as **3 separate TEXT boxes**. **No scoring** → neutral tier (ADR-0002). Transcribe verbatim from the 18 screenshots in `qtr session prep v1.xlsx` (`xl/media/image1–18.png`).

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/qsp-v1-content.test.ts
import { buildQspV1Content } from "@/../prisma/seed-qsp-v1-assessment";

test("QSP v1: mixed types, single neutral tier", () => {
  const c = buildQspV1Content();
  const types = new Set((c.questions as any[]).map((q) => q.type));
  expect(types.has("NUMBER")).toBe(true);
  expect(types.has("SLIDER_LIKERT")).toBe(true);
  expect(types.has("TEXT")).toBe(true);
  const sc = c.scoringConfig as any;
  expect(sc.tiers).toHaveLength(1);
  expect(sc.tiers[0].minMetric).toBe(1);
  expect(sc.tiers[0].maxMetric).toBe(10);
});

test("QSP v1: core-values stories modeled as 3 TEXT boxes", () => {
  const cv = (buildQspV1Content().questions as any[]).filter((q) => q.stableKey.startsWith("S4_core_values_role_model"));
  expect(cv).toHaveLength(3);
});
```

- [ ] **Step 2: Run, verify fails.**

- [ ] **Step 3: Rewrite the seed.** Replace fabricated content with the verbatim QSP v1 structure (spec §4.2). Neutral `scoringConfig`:
```ts
const SCORING_CONFIG = {
  tierMetric: "overallAvg",
  tiers: [{ minMetric: 1, maxMetric: 10, label: "Submitted",
    message: "Thank you — your responses have been recorded and shared with your facilitator to prepare the quarterly session." }],
} as const;
```
Export `buildQspV1Content()`; wire `main()` to `ensureTemplateVersionContent`. Emoji sliders → omit anchor labels. NUMBER overall-rating uses the existing NUMBER question shape.

- [ ] **Step 4: Run tests + build gate** → PASS / clean.
- [ ] **Step 5: Dry-run seed on dev DB** → appends DRAFT v(N+1).
- [ ] **Step 6: Commit** — `feat(assessment): QSP v1 real content (aggregation-only, neutral tier)`

---

## Task 4: QSP v2 (clean re-transcription)

**Files:** Modify `src/prisma/seed-qsp-v2-assessment.ts`; add `src/src/__tests__/seed/qsp-v2-content.test.ts`.

**Reality (spec §4.3):** ONE instrument, Parts 1–5, ~12–13 questions. ⚠️ Transcribe verbatim from the **correctly-numbered** survey screens `image9`–`image22` in `qtr session prep v2.xlsx` (the rejected first-pass map mis-numbered them — do NOT reuse it). Structure: P1 (NUMBER rating + TEXT explain + **5**-item slider matrix using "rocks" wording, **no** "the way you have performed" + TEXT leadership-rocks view + 3-box core-values) · Start/Stop/Continue (3 company TEXT, no department) · P2 Personal Check-in (slider + TEXT) · P3 Growth Challenge (3 TEXT incl. "Where do you believe the solution lies?") · P4 Focus (Critical Number + Top Priorities) · P5 Closing (1 TEXT). **No scoring** → neutral tier.

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/qsp-v2-content.test.ts
import { buildQspV2Content } from "@/../prisma/seed-qsp-v2-assessment";

test("QSP v2: P1 matrix has exactly 5 sliders (no self-performance item)", () => {
  const matrix = (buildQspV2Content().questions as any[]).filter((q) => q.stableKey.startsWith("P1_rate_"));
  expect(matrix).toHaveLength(5);
  expect(matrix.some((q) => /you have performed/i.test(q.label))).toBe(false);
});

test("QSP v2: no department start/stop/continue, no Rockefeller-methodology block, single neutral tier", () => {
  const c = buildQspV2Content();
  const labels = (c.questions as any[]).map((q) => q.label.toLowerCase());
  expect(labels.some((l) => l.includes("your department should"))).toBe(false);
  expect(labels.some((l) => l.includes("rockefeller habits/scaling up methodology now serving"))).toBe(false);
  expect((c.scoringConfig as any).tiers).toHaveLength(1);
});
```

- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Rewrite the seed** with verbatim Parts 1–5 content (transcribed from image9–22) + the neutral `scoringConfig` shape from Task 3. Export `buildQspV2Content()`; wire to `ensureTemplateVersionContent`.
- [ ] **Step 4: Run tests + build gate.**
- [ ] **Step 5: Dry-run seed on dev DB.**
- [ ] **Step 6: Commit** — `feat(assessment): QSP v2 real content (Parts 1-5, neutral tier)`

---

## Task 5: Leadership Vision Alignment

**Files:** Modify `src/prisma/seed-lva-assessment.ts`; add `src/src/__tests__/seed/lva-content.test.ts`.

**Reality (spec §4.4, ADR-0003):** 9 `NUMBER` labeled **"in three years"** + 8 future-vision `TEXT` (required) + 16-factor matrix as **16 `SLIDER_LIKERT` 1–3** (scaleLabels Weak/Average/Strong) + 1 `MULTI_CHOICE` obstacle (pick 3 of 16) + 16 optional `TEXT` "Why is {factor} a hindrance?" + 2 always-on obstacle `TEXT` + 1 rehire-% `NUMBER` + 14 focus-area `TEXT` (required). **No overall tiers** → neutral tier; group factor-bar report out of scope. Transcribe verbatim from `leadership visin alignment assement.xlsx`.

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/lva-content.test.ts
import { buildLvaContent } from "@/../prisma/seed-lva-assessment";

test("LVA: 16-factor matrix as 1-3 sliders with Weak/Average/Strong labels", () => {
  const matrix = (buildLvaContent().questions as any[]).filter((q) => q.stableKey.startsWith("S4_"));
  expect(matrix).toHaveLength(16);
  for (const q of matrix) {
    expect(q.type).toBe("SLIDER_LIKERT");
    expect(q.scale).toEqual({ min: 1, max: 3 });
    expect(q.scaleLabels).toEqual(["Weak", "Average", "Strong"]);
  }
});

test("LVA: financials framed 'in three years'; obstacle MULTI_CHOICE of 16; neutral tier", () => {
  const c = buildLvaContent();
  const fin = (c.questions as any[]).filter((q) => q.stableKey.startsWith("S1_"));
  expect(fin.every((q) => q.type === "NUMBER")).toBe(true);
  expect(fin.some((q) => /three years/i.test(q.label))).toBe(true);
  const obstacle = (c.questions as any[]).find((q) => q.type === "MULTI_CHOICE");
  expect(obstacle.options).toHaveLength(16);
  expect((c.scoringConfig as any).tiers).toHaveLength(1);
});
```

- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Rewrite the seed** with verbatim LVA content; financials labeled "in three years"; qualitative TEXT `isRequired: true`, NUMBER intake optional; matrix as 16 sliders 1–3 with Weak/Average/Strong; obstacle MULTI_CHOICE (`maxChoices: 3`) + 16 optional why-TEXT; neutral `scoringConfig` (same shape as Task 3, full metric range). Remove the fabricated Developing/Building/Scaling tiers. Export `buildLvaContent()`; wire to helper.
- [ ] **Step 4: Run tests + build gate.**
- [ ] **Step 5: Dry-run seed on dev DB.**
- [ ] **Step 6: Commit** — `feat(assessment): LVA real content (3-year framing, matrix sliders, neutral tier)`

---

## Task 6: Scaling Up Full (provisional scoring, flagged)

**Files:** Modify `src/prisma/seed-scaling-up-full-assessment.ts`; add `src/src/__tests__/seed/scaling-up-full-content.test.ts`.

**Reality (spec §4.5, decision §1.5):** 61 `SLIDER_LIKERT` 0–10, 10 sections, 5 domains (People/Strategy/Execution/Cash/You). Keep the verbatim question labels + per-question recommendations already in the seed. **Remove** the fabricated per-domain tiers + `meanOfDomains` rollup. Add the 3 overall ScaleUp Score bands with **provisional** cutoffs + verbatim messages. Flag the Esperto-dependent gaps in Task 8.

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/scaling-up-full-content.test.ts
import { buildScalingUpFullContent } from "@/../prisma/seed-scaling-up-full-assessment";

test("SU Full: 61 sliders 0-10 across 5 domains", () => {
  const c = buildScalingUpFullContent();
  expect((c.questions as any[]).filter((q) => q.type === "SLIDER_LIKERT")).toHaveLength(61);
  const domains = (c.scoringConfig as any).domains.map((d: any) => d.name).sort();
  expect(domains).toEqual(["Cash", "Execution", "People", "Strategy", "You"]);
});

test("SU Full: 3 overall ScaleUp tiers; no Critical/At Risk placeholder tiers", () => {
  const tiers = (buildScalingUpFullContent().scoringConfig as any).tiers;
  expect(tiers).toHaveLength(3);
  expect(tiers.some((t: any) => /Critical|At Risk|On Track|Strong/.test(t.label))).toBe(false);
});
```

- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Rework the scoringConfig.** Keep questions + per-question `recommendations`. Replace the tier block with the 3 ScaleUp bands (cutoffs labeled provisional):
```ts
// PROVISIONAL cutoffs — confirmed: <=28 LOW, 47-62 GOOD, >=73 TOP.
// 40/65 are interpolations pending Esperto's weighting spec (Task 8).
const SCALEUP_TIERS = [
  { minMetric: 0,  maxMetric: 40,  label: "Not ready",
    message: "You have still a lot of focus areas on which you can work within your company. If you want to grow quickly, then your organization is probably not ready yet." },
  { minMetric: 40, maxMetric: 65,  label: "On the way",
    message: "A great score. You are pretty well on the way to becoming a strong growth organization." },
  { minMetric: 65, maxMetric: 100, label: "Exemplary",
    message: "You are doing extremely well and are perhaps an example for others! However, in order to reach the next phase, there is still room for improvement." },
] as const;
```
Set `tierMetric`/`rollup` to the form the publish schema accepts for a 0–100 overall metric; verify `validateTierTiling` tiles [0,40)/[40,65)/[65,100]. Export `buildScalingUpFullContent()`; wire to helper.

- [ ] **Step 4: Run tests + build gate; confirm publish-schema validation passes** for the new tiers.
- [ ] **Step 5: Dry-run seed on dev DB.**
- [ ] **Step 6: Commit** — `feat(assessment): Scaling Up Full provisional ScaleUp bands + remove placeholder domain tiers`

---

## Task 7: Integration verification (all 5)

- [ ] **Step 1:** From `src/`, run all 5 seed scripts against a dev/preview DB in order; confirm each appends one DRAFT version and a second run is a no-op (hash match).
- [ ] **Step 2:** For each new DRAFT version, load it in the admin editor + render the public quiz route; confirm every question/type/scale renders and publish-schema validation passes (tiers tile; recommendations valid).
- [ ] **Step 3:** Run the affected suite: `npx jest src/__tests__/seed src/__tests__/lib/assessments` → green. Build gate clean.
- [ ] **Step 4: Commit** test additions — `test(assessment): integration coverage for re-seeded versions`

---

## Task 8: Publish-review checklist for Jeff

- [ ] **Step 1:** Fill `docs/specs/v7.6/09b-publish-review-checklist.md` with the items Jeff confirms before publishing each DRAFT: Rockefeller exact band edges (17/33); SU Full weighting formula + full 5-stop recommendation text + exact ScaleUp cutoffs (provisional 40/65) + non-scored profile inputs; slider endpoint labels. Note which templates are safe to publish as-is (QSP v1/v2 neutral, LVA neutral) vs need Jeff input (SU Full).
- [ ] **Step 2: Commit** — `docs(assessment): publish-review checklist for Jeff`

---

## Self-review (writing-plans checklist)

1. **Spec coverage:** §1 decisions → Tasks 1–6 + neutral-tier (ADR-0002) in Tasks 3/4/5; §3 architecture → Task 1 helper; §4 per-assessment → Tasks 2–6; §5 open items → Task 8; versioning/staged-DRAFT → helper (`publishedAt: null`). ✓
2. **Placeholder scan:** seeder + scoringConfigs are full code; verbatim question text is intentionally sourced-from-file with verification assertions (content is data, not logic) — called out explicitly. ✓
3. **Type consistency:** `ensureTemplateVersionContent` / `SeedContent` / `build<Name>Content()` consistent across tasks; `scoringConfig` shapes match `scoring.ts` (`tierMetric`, `tiers[].{minMetric,maxMetric,label,message}`, `domains[]`). ✓
