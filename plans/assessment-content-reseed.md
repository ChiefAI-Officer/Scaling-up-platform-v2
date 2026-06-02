# Assessment Content Re-seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder/approximated content in the 5 seeded assessment templates with the real Esperto instrument content (questions + scoring), shipped as new DRAFT versions for human publish.

**Architecture:** A shared version-aware seeder helper appends a new DRAFT `AssessmentTemplateVersion` (vN+1) per template when content changes — never mutating existing (published) rows, so it is safe against the immutability trigger and existing campaigns. Each of the 5 seed scripts is reworked to define real content + a real (or neutral) `scoringConfig` and call the helper. Per-assessment vertical slices; Rockefeller first (pilot, validates the helper), Scaling Up Full last.

**Tech Stack:** TypeScript, Prisma 6 (Neon Postgres), Zod (scoring schema), Jest. Seeds run via `npx tsx prisma/seed-<name>.ts` from `src/`. Spec: [docs/specs/v7.6/09-assessment-content-reseed.md](docs/specs/v7.6/09-assessment-content-reseed.md). Decisions: ADR-0001/0002/0003. Domain language: CONTEXT.md.

**Verified source-of-truth:** Per-assessment question lists, types, scales, and scoring were extracted and adversarially verified (spec §4). Implementers MUST transcribe verbatim question text from the cited source files in `From Jeff/APP_scaling up assessemnt/` (not paraphrase), and lock it with **full expected-array / verbatim-message assertions** (not just counts — see "Test rigor").

**Schema facts the plan obeys (verified against `src/src/lib/assessments/scoring.ts`):**
- `SliderLikertScaleSchema` requires **all** of `{ min, max, step, anchorMin, anchorMax }` (step `int().positive()`; anchors `z.string()` — empty string allowed). There is **no** `scaleLabels` field.
- `ScoringConfigBase` requires `tierMetric` + **`passThreshold` (required)** + `tiers.min(1)`. `DomainDefSchema` requires `tiers.min(1)` per domain.
- `scaleUpScore: true` requires `rollup.overall` set **and** every question on a 0–10 scale; the **global tier resolves against the 0–10 rollup value**, not a 0–100 score. The 0–100 ScaleUp Score is emitted separately for display.
- `scoreSubmission`'s required-answer check (scoring.ts ~L1024-1037) only collects missing **SLIDER_LIKERT** required keys — qualitative required answers are not enforced server-side (Task 1b fixes this).
- Public quiz page + submit route reject `publishedAt = null`; campaign creation selects only published versions — so DRAFT verification is component/scorer/publish-schema level, not the live route (Task 7).
- Shared hash: `computeTemplateContentHash()` in `src/src/lib/assessments/template-content-hash.ts` hashes `{questions, sections, scoringConfig, reportConfig, invitationSubject, invitationBodyMarkdown}` — the seeder reuses it.

**Test rigor (every slice):** content tests assert the **complete** ordered array of question labels per section (or a sha256 checksum of it), the **exact** option lists, and the **verbatim** tier/recommendation messages — not just counts/types. A swapped or paraphrased question must fail a test.

---

## File structure

- **Create** `src/src/lib/assessments/seed-template-version.ts` — `ensureTemplateVersionContent()` (append-DRAFT-only-when-latest-differs; reuses `computeTemplateContentHash`; syncs template metadata).
- **Create** `src/src/__tests__/seed/seed-template-version.test.ts`.
- **Modify** `src/src/lib/assessments/scoring.ts` (Task 1b: extend required-answer check to all types) + its test.
- **Modify** the 5 seed scripts + add per-assessment content tests in `src/src/__tests__/seed/`.
- **Create** `docs/specs/v7.6/09b-publish-review-checklist.md` (Task 0 baseline + Task 8 Jeff checklist).

No Prisma migration (`scoringConfig`/`questions`/`sections` are `Json`).

---

## Task 0: Read-only prod verification (no code; gather facts)

**Goal:** Per template, learn the latest `versionNumber` + `publishedAt`, AND dump the **stableKey→label map of the latest PUBLISHED version for all five templates** (ADR-0001 needs the published mapping to prove unchanged questions reuse keys and changed ones don't).

- [ ] **Step 1: Read-only prod query.** Prefer a **read-only DB role/URL** if one exists (see `docs/runbooks/database-protection.md`); regardless, wrap the read in a read-only transaction so a write can't slip through. From `src/`:
```bash
npx dotenv-cli -e .env.production.local -- npx tsx -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const aliases = ["RockHabits","qsp-v1","qsp-v2","leadership-vision-alignment","scaling-up-full"];
// Enforce read-only: prefer a read-only Neon role/branch; AND wrap in ONE
// interactive transaction whose first statement is SET TRANSACTION READ ONLY
// (a standalone SET does not persist across separate Prisma queries — round-3 fix).
await db.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  for (const alias of aliases) {
    const t = await tx.assessmentTemplate.findUnique({ where: { alias }, select: { id: true } });
    if (!t) { console.log(alias, "MISSING"); continue; }
    const all = await tx.assessmentTemplateVersion.findMany({ where: { templateId: t.id, language: "enUS" }, select: { versionNumber: true, publishedAt: true, questions: true }, orderBy: { versionNumber: "desc" } });
    const pub = all.find(v => v.publishedAt);
    console.log(alias, "versions:", JSON.stringify(all.map(v => ({ v: v.versionNumber, published: !!v.publishedAt }))));
    if (pub) console.log(alias, "PUBLISHED v"+pub.versionNumber, "keys:", JSON.stringify((pub.questions as any[]).map((q:any)=>({k:q.stableKey,l:q.label}))));
    else console.log(alias, "NO PUBLISHED VERSION (draft only)");
  }
});
await db.$disconnect();
'
```

- [ ] **Step 2: Emit machine-readable fixtures + record.** Write one committed fixture per template at `src/src/__tests__/seed/fixtures/published-keys-<alias>.json` = the latest-published `[{ key, label }]` array (empty array if no published version). These drive per-slice key-continuity tests (Tasks 2–6): unchanged label ⇒ same key; changed/new label ⇒ new key; no key reused for a different label (or an explicit reviewed allowlist entry). Also record per template — starting versionNumber, publish state — in `docs/specs/v7.6/09b-publish-review-checklist.md` (create it) under "Prod baseline (read-only)". Commit:
```bash
git add docs/specs/v7.6/09b-publish-review-checklist.md src/src/__tests__/seed/fixtures/published-keys-*.json
git commit -m "docs(assessment): record prod version + stableKey baseline (fixtures) before re-seed"
```

---

## Task 1: Shared version-aware seeder helper

**Files:** Create `src/src/lib/assessments/seed-template-version.ts`; Test `src/src/__tests__/seed/seed-template-version.test.ts`.

Appends the next `versionNumber` as DRAFT **only when the LATEST (highest-numbered) version's hash differs** — an abandoned lower-numbered draft with a matching hash must not suppress a fresh latest draft. Reuses `computeTemplateContentHash`. Keeps template-level metadata in sync (the hash includes invitation fields).

- [ ] **Step 1: Failing test**
```ts
// src/src/__tests__/seed/seed-template-version.test.ts
import { ensureTemplateVersionContent } from "@/lib/assessments/seed-template-version";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";

function makeTx(opts: { template?: { id: string } | null; versions?: Array<{ versionNumber: number; contentHash: string; publishedAt: Date | null }>; }) {
  const created: any[] = []; const updated: any[] = [];
  return { created, updated, tx: {
    $executeRawUnsafe: async () => 0,
    assessmentTemplate: {
      findUnique: async () => opts.template ?? null,
      create: async ({ data }: any) => ({ id: "tmpl-new", ...data }),
      update: async ({ data }: any) => { updated.push(data); return { id: "tmpl-1", ...data }; },
    },
    assessmentTemplateVersion: {
      findMany: async () => opts.versions ?? [],
      create: async ({ data }: any) => { created.push(data); return { id: "ver-new", ...data }; },
    },
  } as any };
}

const CONTENT = {
  alias: "X", name: "X", description: "d", invitationSubject: "s", invitationBodyMarkdown: "b", language: "enUS",
  sections: [{ stableKey: "S1", title: "S1", sortOrder: 0 }],
  questions: [{ stableKey: "Q1", type: "SLIDER_LIKERT", label: "L", sectionStableKey: "S1", sortOrder: 0, isRequired: true, scale: { min: 0, max: 3, step: 1, anchorMin: "", anchorMax: "" } }],
  scoringConfig: { tierMetric: "countAchieved", passThreshold: 2, tiers: [{ minMetric: 0, maxMetric: 1, label: "x", message: "m" }] },
  reportConfig: null,
};
const HASH = computeTemplateContentHash(CONTENT as any);

test("appends versionNumber 2 as DRAFT when the LATEST version has a different hash", async () => {
  const { tx, created } = makeTx({ template: { id: "tmpl-1" }, versions: [{ versionNumber: 1, contentHash: "OLD", publishedAt: new Date() }] });
  const res = await ensureTemplateVersionContent(tx as any, "sys", CONTENT as any);
  expect(res.action).toBe("created"); expect(res.versionNumber).toBe(2);
  expect(created[0].publishedAt).toBeNull();
});

test("no-ops only when the LATEST version already matches the hash", async () => {
  const { tx, created } = makeTx({ template: { id: "t" }, versions: [{ versionNumber: 2, contentHash: HASH, publishedAt: null }, { versionNumber: 1, contentHash: "OLD", publishedAt: new Date() }] });
  const res = await ensureTemplateVersionContent(tx as any, "sys", CONTENT as any);
  expect(res.action).toBe("noop"); expect(created).toHaveLength(0);
});

test("still appends a fresh latest draft when only an ABANDONED LOWER version matches", async () => {
  const { tx, created } = makeTx({ template: { id: "t" }, versions: [
    { versionNumber: 3, contentHash: "NEWER", publishedAt: null },
    { versionNumber: 1, contentHash: HASH, publishedAt: null },
  ] });
  const res = await ensureTemplateVersionContent(tx as any, "sys", CONTENT as any);
  expect(res.action).toBe("created"); expect(res.versionNumber).toBe(4);
});

test("syncs template-level invitation metadata on an existing template", async () => {
  const { tx, updated } = makeTx({ template: { id: "tmpl-1" }, versions: [{ versionNumber: 1, contentHash: "OLD", publishedAt: new Date() }] });
  await ensureTemplateVersionContent(tx as any, "sys", CONTENT as any);
  expect(updated[0]).toMatchObject({ invitationSubject: "s", invitationBodyMarkdown: "b" });
});

test("creates version 1 when the template does not exist yet", async () => {
  const { tx, created } = makeTx({ template: null, versions: [] });
  const res = await ensureTemplateVersionContent(tx as any, "sys", CONTENT as any);
  expect(res.versionNumber).toBe(1); expect(created[0].publishedAt).toBeNull();
});
```

- [ ] **Step 2: Run, verify fails** — `npx jest src/__tests__/seed/seed-template-version.test.ts` → FAIL (not found).

- [ ] **Step 3: Implement** (`assertSeedContentIntegrity` covers round-2 H3; invitation handling covers H1; fail-closed covers M5; audit covers M6; soft-delete covers L9)
```ts
// src/src/lib/assessments/seed-template-version.ts
import { computeTemplateContentHash } from "./template-content-hash";

export interface SeedContent {
  alias: string; name: string; description: string;
  invitationSubject: string; invitationBodyMarkdown: string;
  language: string; sections: any[]; questions: any[];
  scoringConfig: unknown; reportConfig?: unknown; aggregationMode?: string;
}
export interface SeedResult { action: "created" | "noop"; templateId: string; versionId: string; versionNumber: number; contentHash: string; }

// H3 — referential integrity: throw before persisting bad content.
export function assertSeedContentIntegrity(c: SeedContent): void {
  const sKeys = c.sections.map((s) => s.stableKey);
  if (new Set(sKeys).size !== sKeys.length) throw new Error(`[seed:${c.alias}] duplicate section stableKey`);
  const qKeys = c.questions.map((q) => q.stableKey);
  if (new Set(qKeys).size !== qKeys.length) throw new Error(`[seed:${c.alias}] duplicate question stableKey`);
  const orders = c.questions.map((q) => q.sortOrder);
  if (new Set(orders).size !== orders.length) throw new Error(`[seed:${c.alias}] duplicate question sortOrder`);
  const sectionSet = new Set(sKeys);
  for (const q of c.questions) {
    if (q.sectionStableKey && !sectionSet.has(q.sectionStableKey)) throw new Error(`[seed:${c.alias}] dangling sectionStableKey ${q.sectionStableKey}`);
    if (q.type === "MULTI_CHOICE" && q.options) {
      const ok = q.options.map((o: any) => o.key);
      if (new Set(ok).size !== ok.length) throw new Error(`[seed:${c.alias}] duplicate option key in ${q.stableKey}`);
    }
  }
}

// Caller contract: run inside an interactive transaction that FIRST acquires
// pg_advisory_xact_lock(hashtext('assessment-<alias>-seed')) — serializes
// concurrent seed/deploy/admin callers (M4). Catch a unique-constraint
// conflict on (templateId, versionNumber, language) by re-reading + retrying.
export async function ensureTemplateVersionContent(
  tx: any, systemUserId: string, c: SeedContent,
  opts: { forceSupersedeDraft?: boolean; seedRunId?: string } = {},
): Promise<SeedResult> {
  assertSeedContentIntegrity(c);

  const template = await tx.assessmentTemplate.findUnique({
    where: { alias: c.alias },
    select: { id: true, deletedAt: true, invitationSubject: true, invitationBodyMarkdown: true },
  });
  if (template?.deletedAt) throw new Error(`[seed:${c.alias}] template is soft-deleted; refusing to append (L9).`);

  // H1 — invitation subject/body are TEMPLATE-level and feed LIVE campaign
  // invite/reminder emails. NEVER mutate them on a draft append. Hash the
  // version against the STORED invitation for existing templates (so the
  // hash reflects reality + matches admin's computeTemplateContentHash, with
  // no drift and no live-email change). Use the seed's invitation copy ONLY
  // when first creating the template.
  const invitationSubject = template ? template.invitationSubject : c.invitationSubject;
  const invitationBodyMarkdown = template ? template.invitationBodyMarkdown : c.invitationBodyMarkdown;
  const contentHash = computeTemplateContentHash({
    questions: c.questions, sections: c.sections, scoringConfig: c.scoringConfig,
    reportConfig: c.reportConfig ?? null, invitationSubject, invitationBodyMarkdown,
  } as any);

  let templateId: string;
  if (!template) {
    const created = await tx.assessmentTemplate.create({
      data: {
        name: c.name, alias: c.alias, description: c.description,
        invitationSubject: c.invitationSubject, invitationBodyMarkdown: c.invitationBodyMarkdown,
        aggregationMode: c.aggregationMode ?? "FULL_VISIBILITY", createdBy: systemUserId,
      }, select: { id: true },
    });
    templateId = created.id;
  } else {
    templateId = template.id; // do NOT update template-level invitation fields
  }

  const versions = await tx.assessmentTemplateVersion.findMany({
    where: { templateId, language: c.language },
    select: { versionNumber: true, contentHash: true, publishedAt: true },
    orderBy: { versionNumber: "desc" },
  });
  const latest = versions[0];
  if (latest && latest.contentHash === contentHash) {
    return { action: "noop", templateId, versionId: "", versionNumber: latest.versionNumber, contentHash };
  }
  // M5 — fail closed if the latest is an unpublished DRAFT that differs: it may
  // hold human review edits we'd silently bury. Require an explicit override.
  if (latest && !latest.publishedAt && !opts.forceSupersedeDraft) {
    throw new Error(`[seed:${c.alias}] latest version v${latest.versionNumber} is an unpublished DRAFT with different content (possible reviewer edits). Re-run with forceSupersedeDraft to append a new draft and supersede it.`);
  }
  const nextNumber = latest ? latest.versionNumber + 1 : 1;
  const version = await tx.assessmentTemplateVersion.create({
    data: {
      templateId, versionNumber: nextNumber, language: c.language,
      questions: c.questions as object, sections: c.sections as object, scoringConfig: c.scoringConfig as object,
      reportConfig: (c.reportConfig as object) ?? undefined, contentHash, publishedAt: null, publishedBy: null,
    }, select: { id: true },
  });
  // M6 — audit provenance in the same transaction (append "ASSESSMENT_VERSION_SEEDED"
  // to the AuditAction union in lib/audit.ts if it is a closed union).
  await tx.auditLog.create({ data: {
    entityType: "AssessmentTemplateVersion", entityId: version.id, action: "ASSESSMENT_VERSION_SEEDED", performedBy: systemUserId,
    metadata: { alias: c.alias, versionNumber: nextNumber, previousLatest: latest?.versionNumber ?? null, contentHash, seedRunId: opts.seedRunId ?? null },
  } });
  return { action: "created", templateId, versionId: version.id, versionNumber: nextNumber, contentHash };
}
```

- [ ] **Step 4: Run tests, verify pass** → PASS. Add tests for: fail-closed on edited unpublished draft (latest draft, differing hash, no force → throws); `forceSupersedeDraft: true` appends anyway; soft-deleted template throws; existing-template path does NOT call `assessmentTemplate.update` (no live invitation mutation) and hashes against stored invitation; `assertSeedContentIntegrity` throws on duplicate keys / dangling sectionStableKey / duplicate option keys; an audit row is created on append.
- [ ] **Step 5: Commit** — `feat(assessment): version-aware seeder helper (latest-only no-op, fail-closed drafts, integrity, audit, no live-invite mutation)`

> **Caller contract (every seed `main()`):** open an interactive transaction and FIRST acquire the per-template lock with `SELECT pg_try_advisory_xact_lock(hashtext('assessment-<alias>-seed'))` (try-lock + a statement_timeout, so the operator gets a clear "another seed run holds the lock" failure rather than an indefinite block — round-3 R3-L). Then call `ensureTemplateVersionContent(tx, sys.id, build<Name>Content())`, then `ensureAccessGroupAndTemplateLink(...)` (preserve the existing access-group link + soft-delete safeguards). Catch a unique-constraint conflict on `(templateId, versionNumber, language)` by re-reading and no-oping/retrying (M4). The advisory lock only serializes concurrent *seed* callers — it does not block admin edits/publish or live campaigns (verified safe: campaigns + quiz use only published versions; active campaigns pin a fixed `versionId`).

---

## Task 1b: Server-side answer validation for ALL question types (required + value-shape)

**Files:** Modify `src/src/lib/assessments/scoring.ts` (required-answer check ~L1024-1037) AND the quiz + org-survey submit routes (`src/src/app/api/quiz/[campaignAlias]/submit/route.ts`, `src/src/app/api/organizations/.../me` submit, `src/src/app/api/surveys/[id]/submit/route.ts`); Test `src/src/__tests__/lib/assessments/scoring-required-all-types.test.ts` + submit-route tests.

The re-seed (a) marks many qualitative questions `isRequired` and (b) introduces `MULTI_CHOICE` with `maxChoices` + `NUMBER` intake — but the current missing-required check only collects SLIDER_LIKERT keys, and the submit routes accept `value: unknown`. Two gaps:
1. **Required presence** — extend the missing-required check to every `isRequired` question (present = key in answer set with a non-empty string / non-empty array / finite number).
2. **Value shape (H2 — adversarial)** — before scoring/storage, validate each answer against its question: TEXT = string with a sane max length; NUMBER = finite number within any declared bounds; MULTI_CHOICE = array of **allowed option keys**, length ≤ `maxChoices`, no duplicates; SLIDER_LIKERT = integer within `scale.min..max`. Reject (422) otherwise. Cap total payload size. Cover adversarial payloads (object/array where a scalar is expected, unknown option key, over-`maxChoices`, oversized text, non-finite number) in BOTH the public and invited submit routes.

- [ ] **Step 1: Failing test**
```ts
// src/src/__tests__/lib/assessments/scoring-required-all-types.test.ts
import { scoreSubmission } from "@/lib/assessments/scoring";
const version = {
  language: "enUS",
  sections: [{ stableKey: "S1", title: "S1", sortOrder: 0 }],
  questions: [
    { stableKey: "T1", type: "TEXT", label: "req text", sectionStableKey: "S1", sortOrder: 0, isRequired: true },
    { stableKey: "SL1", type: "SLIDER_LIKERT", label: "s", sectionStableKey: "S1", sortOrder: 1, isRequired: true, scale: { min: 0, max: 3, step: 1, anchorMin: "", anchorMax: "" } },
  ],
  scoringConfig: { tierMetric: "countAchieved", passThreshold: 2, tiers: [{ minMetric: 0, maxMetric: 2, label: "x", message: "m" }] },
} as any;
test("missing required TEXT answer is reported (not just SLIDER_LIKERT)", () => {
  const res = scoreSubmission(version, [{ stableKey: "SL1", value: 3 }]);
  expect(JSON.stringify(res)).toContain("T1");
});
```

- [ ] **Step 2: Run, verify fails** (T1 not reported).
- [ ] **Step 3: Implement** — extend the required-key collection to all `isRequired` questions regardless of type, preserving the `MISSING_REQUIRED_KEY` shape. Keep one source of truth (scorer OR submit route).
- [ ] **Step 4: Run tests + build gate** → PASS / clean.
- [ ] **Step 5: Commit** — `fix(assessment): enforce required answers for TEXT/NUMBER/MULTI_CHOICE`

---

## Task 2: Rockefeller (pilot — validates the helper)

**Files:** Modify `src/prisma/seed-rockefeller-assessment.ts`; add `src/src/__tests__/seed/rockefeller-content.test.ts`.

**Reality (spec §4.1):** 40 questions, 10 sections, scale 0–3, 3 bands with verbatim messages — already correct. Fixes: (a) source has no worded anchors but the schema requires them → `anchorMin: ""`, `anchorMax: ""`, `step: 1` (faithful: no invented labels; do NOT remove the fields); (b) drop trailing period on Q1_1 ("…priorities, and styles"); (c) section-7 straight double quotes around "alive". **Reuse the published stableKeys** (Task 0). Band edges 0–16/17–32/33–40 stay (provisional). Switch to `ensureTemplateVersionContent`. Source: `From Jeff/APP_scaling up assessemnt/APP_Rockerfeller/Rockerfeller questions.xlsx`.

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/rockefeller-content.test.ts
import { buildRockefellerContent } from "@/../prisma/seed-rockefeller-assessment";

test("Rockefeller: 10 sections, 40 questions, 0-3 scale w/ empty anchors + step 1, no scaleLabels", () => {
  const c = buildRockefellerContent();
  expect(c.sections).toHaveLength(10);
  expect(c.questions).toHaveLength(40);
  for (const q of c.questions as any[]) {
    expect(q.type).toBe("SLIDER_LIKERT");
    expect(q.scale).toEqual({ min: 0, max: 3, step: 1, anchorMin: "", anchorMax: "" });
    expect("scaleLabels" in q).toBe(false);
  }
  expect((c.questions as any[]).find((q) => q.stableKey === "Q1_1").label.endsWith("styles")).toBe(true);
});

test("Rockefeller scoring: countAchieved, passThreshold 2, 3 verbatim tiers", () => {
  const sc = buildRockefellerContent().scoringConfig as any;
  expect(sc.tierMetric).toBe("countAchieved");
  expect(sc.passThreshold).toBe(2);
  expect(sc.tiers.map((t: any) => t.message)).toEqual([
    "That is a very low overall score.",
    "You're doing quite okay, and have a lot to improve further upon.",
    "That is a great overall score.",
  ]);
});

test("Rockefeller: full ordered label array matches the xlsx fixture (verbatim guard)", () => {
  const expected = require("./fixtures/rockefeller-labels.json"); // 40 labels, in order, from the xlsx
  expect((buildRockefellerContent().questions as any[]).map((q) => q.label)).toEqual(expected);
});
```

- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Refactor seed** — export `buildRockefellerContent()`; empty-string anchors + step 1; fix Q1_1 + section-7 quotes; build `fixtures/rockefeller-labels.json` from the xlsx; reuse published stableKeys; replace STATE A–F with `ensureTemplateVersionContent`.
- [ ] **Step 4: Run tests + build gate.**
- [ ] **Step 5: Dry-run on dev/preview DB** (NOT prod) → appends DRAFT v(N+1); re-run no-op; published version untouched.
- [ ] **Step 6: Commit** — `feat(assessment): Rockefeller real-content fixes + version-aware seeder (DRAFT vN+1)`

---

## Task 3: QSP v1 (aggregation-only)

**Files:** Modify `src/prisma/seed-qsp-v1-assessment.ts`; add `src/src/__tests__/seed/qsp-v1-content.test.ts`.

**Reality (spec §4.2):** ~8 sections; 1 `NUMBER` (overall rating 1–10) + 7 `SLIDER_LIKERT` (`scale: { min:1, max:10, step:1, anchorMin:"", anchorMax:"" }`) + TEXT, core-values "role models" = **3 TEXT boxes**. **No scoring** → neutral tier. Transcribe verbatim from `qtr session prep v1.xlsx` (`xl/media/image1–18.png`).

Neutral `scoringConfig` (`passThreshold` REQUIRED):
```ts
const SCORING_CONFIG = {
  tierMetric: "overallAvg",
  passThreshold: 0,
  tiers: [{ minMetric: 1, maxMetric: 10, label: "Submitted",
    message: "Thank you — your responses have been recorded and shared with your facilitator to prepare the quarterly session." }],
} as const;
```

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/qsp-v1-content.test.ts
import { buildQspV1Content } from "@/../prisma/seed-qsp-v1-assessment";
test("QSP v1: NUMBER+SLIDER(1-10,step1,empty anchors)+TEXT; single neutral tier w/ passThreshold 0", () => {
  const c = buildQspV1Content();
  const types = new Set((c.questions as any[]).map((q) => q.type));
  expect(types.has("NUMBER") && types.has("SLIDER_LIKERT") && types.has("TEXT")).toBe(true);
  for (const q of (c.questions as any[]).filter((q) => q.type === "SLIDER_LIKERT"))
    expect(q.scale).toEqual({ min: 1, max: 10, step: 1, anchorMin: "", anchorMax: "" });
  expect((c.scoringConfig as any).tiers).toHaveLength(1);
  expect((c.scoringConfig as any).passThreshold).toBe(0);
});
test("QSP v1: core-values stories = 3 TEXT boxes", () => {
  expect((buildQspV1Content().questions as any[]).filter((q) => q.stableKey.startsWith("S4_core_values_role_model"))).toHaveLength(3);
});
```

- [ ] **Step 2-6:** verify fails → rewrite seed verbatim + neutral config + wire helper → tests + build gate → dry-run → commit `feat(assessment): QSP v1 real content (aggregation-only, neutral tier)`.

---

## Task 4: QSP v2 (clean re-transcription)

**Files:** Modify `src/prisma/seed-qsp-v2-assessment.ts`; add `src/src/__tests__/seed/qsp-v2-content.test.ts`.

**Reality (spec §4.3):** ONE instrument, Parts 1–5, ~12–13 questions. ⚠️ Transcribe verbatim from the **correctly-numbered** screens `image9`–`image22` in `qtr session prep v2.xlsx` (rejected first-pass map mis-numbered them). P1 (NUMBER rating + TEXT explain + **5**-item slider matrix using "rocks" wording, **no** "the way you have performed" + TEXT leadership-rocks view + 3-box core-values) · Start/Stop/Continue (3 company TEXT) · P2 Personal Check-in (slider + TEXT) · P3 Growth Challenge (3 TEXT incl. "Where do you believe the solution lies?") · P4 Focus (Critical Number + Top Priorities) · P5 Closing (1 TEXT). Sliders `scale: { min:1, max:10, step:1, anchorMin:"", anchorMax:"" }`. **No scoring** → neutral config (`passThreshold: 0`), same as Task 3.

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/qsp-v2-content.test.ts
import { buildQspV2Content } from "@/../prisma/seed-qsp-v2-assessment";
test("QSP v2: P1 matrix has exactly 5 sliders (no self-performance)", () => {
  const matrix = (buildQspV2Content().questions as any[]).filter((q) => q.stableKey.startsWith("P1_rate_"));
  expect(matrix).toHaveLength(5);
  expect(matrix.some((q) => /you have performed/i.test(q.label))).toBe(false);
});
test("QSP v2: no department start/stop/continue, no methodology block, single neutral tier w/ passThreshold 0", () => {
  const c = buildQspV2Content();
  const labels = (c.questions as any[]).map((q) => q.label.toLowerCase());
  expect(labels.some((l) => l.includes("your department should"))).toBe(false);
  expect(labels.some((l) => l.includes("methodology now serving"))).toBe(false);
  expect((c.scoringConfig as any).tiers).toHaveLength(1);
  expect((c.scoringConfig as any).passThreshold).toBe(0);
});
```

- [ ] **Step 2-6:** verify fails → rewrite verbatim from image9–22 + neutral config + wire helper → tests + build gate → dry-run → commit `feat(assessment): QSP v2 real content (Parts 1-5, neutral tier)`.

---

## Task 5: Leadership Vision Alignment

**Files:** Modify `src/prisma/seed-lva-assessment.ts`; add `src/src/__tests__/seed/lva-content.test.ts`.

**Reality (spec §4.4, ADR-0003):** 9 `NUMBER` labeled **"in three years"** + 8 future-vision `TEXT` (required) + 16-factor matrix as **16 `SLIDER_LIKERT`** with `scale: { min:1, max:3, step:1, anchorMin:"Weak", anchorMax:"Strong" }` (no `scaleLabels` field; 2=Average implied) + 1 `MULTI_CHOICE` obstacle (`options: [{key,label}×16]`, `maxChoices: 3`) + 16 optional `TEXT` "Why is {factor} a hindrance?" + 2 always-on obstacle `TEXT` + 1 rehire-% `NUMBER` + 14 focus-area `TEXT` (required). **No overall tiers** → neutral tier (`passThreshold: 0`); group factor-bar report out of scope. Transcribe verbatim from `leadership visin alignment assement.xlsx`.

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/lva-content.test.ts
import { buildLvaContent } from "@/../prisma/seed-lva-assessment";
test("LVA: 16-factor matrix as 1-3 sliders with Weak/Strong anchors (no scaleLabels)", () => {
  const matrix = (buildLvaContent().questions as any[]).filter((q) => q.stableKey.startsWith("S4_"));
  expect(matrix).toHaveLength(16);
  for (const q of matrix) {
    expect(q.type).toBe("SLIDER_LIKERT");
    expect(q.scale).toEqual({ min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" });
    expect("scaleLabels" in q).toBe(false);
  }
});
test("LVA: financials 'in three years'; obstacle MULTI_CHOICE of 16 (maxChoices 3); neutral tier", () => {
  const c = buildLvaContent();
  const fin = (c.questions as any[]).filter((q) => q.stableKey.startsWith("S1_"));
  expect(fin.every((q) => q.type === "NUMBER")).toBe(true);
  expect(fin.some((q) => /three years/i.test(q.label))).toBe(true);
  const obstacle = (c.questions as any[]).find((q) => q.type === "MULTI_CHOICE");
  expect(obstacle.options).toHaveLength(16);
  expect(obstacle.maxChoices).toBe(3);
  expect((c.scoringConfig as any).tiers).toHaveLength(1);
  expect((c.scoringConfig as any).passThreshold).toBe(0);
});
```

- [ ] **Step 2-6:** verify fails → rewrite verbatim; financials "in three years"; qualitative TEXT `isRequired:true`, NUMBER optional; matrix sliders 1–3 Weak/Strong; obstacle MULTI_CHOICE + 16 optional why-TEXT; neutral config; remove fabricated tiers → tests + build gate → dry-run → commit `feat(assessment): LVA real content (3-year framing, matrix sliders, neutral tier)`.

---

## Task 6: Scaling Up Full (provisional scoring, flagged)

**Files:** Modify `src/prisma/seed-scaling-up-full-assessment.ts`; add `src/src/__tests__/seed/scaling-up-full-content.test.ts`.

**Reality (spec §4.5, decision §1.5):** 61 `SLIDER_LIKERT` 0–10, 10 sections, 5 domains (People/Strategy/Execution/Cash/You). Keep verbatim labels + per-question `recommendations`. The engine resolves the global tier on the **0–10 rollup** (not 0–100), so the 3 ScaleUp bands are expressed in **0–10 units** (provisional 40/65→4.0/6.5); the 0–100 ScaleUp Score is emitted via `scaleUpScore: true` and is **approximate** (`meanOfDomains×10`, NOT Esperto's weighted score — flagged in Task 8). `meanOfDomains` needs every section to carry a `domain`; each `domains[]` entry needs `tiers.min(1)` → give each domain a single **neutral** `[0,10]` tier. Remove fabricated per-domain Critical/At Risk tiers.

```ts
const SCORING_CONFIG = {
  tierMetric: "overallAvg",
  passThreshold: 0,
  rollup: { overall: "meanOfDomains" },
  scaleUpScore: true,
  // PROVISIONAL global tiers on the 0-10 rollup. Confirmed (of 100): <=28 LOW, 47-62 GOOD, >=73 TOP.
  // 4.0 / 6.5 are interpolations pending Esperto's weighting spec (Task 8).
  tiers: [
    { minMetric: 0,   maxMetric: 4.0, label: "Not ready",
      message: "You have still a lot of focus areas on which you can work within your company. If you want to grow quickly, then your organization is probably not ready yet." },
    { minMetric: 4.0, maxMetric: 6.5, label: "On the way",
      message: "A great score. You are pretty well on the way to becoming a strong growth organization." },
    { minMetric: 6.5, maxMetric: 10,  label: "Exemplary",
      message: "You are doing extremely well and are perhaps an example for others! However, in order to reach the next phase, there is still room for improvement." },
  ],
  domains: [
    // one per domain: { key, label, tiers: [{ minMetric: 0, maxMetric: 10, label: "—", message: "" }] }
  ],
} as const;
```

- [ ] **Step 1: Failing content test**
```ts
// src/src/__tests__/seed/scaling-up-full-content.test.ts
import { buildScalingUpFullContent } from "@/../prisma/seed-scaling-up-full-assessment";
test("SU Full: 61 sliders 0-10 across 5 domains", () => {
  const c = buildScalingUpFullContent();
  expect((c.questions as any[]).filter((q) => q.type === "SLIDER_LIKERT")).toHaveLength(61);
  expect((c.scoringConfig as any).domains.map((d: any) => d.label).sort()).toEqual(["Cash","Execution","People","Strategy","You"]);
});
test("SU Full: 3 global ScaleUp tiers in 0-10 units; scaleUpScore on; no placeholder labels", () => {
  const sc = buildScalingUpFullContent().scoringConfig as any;
  expect(sc.tiers).toHaveLength(3);
  expect(sc.tiers.map((t: any) => t.maxMetric)).toEqual([4.0, 6.5, 10]);
  expect(sc.scaleUpScore).toBe(true);
  expect(sc.rollup.overall).toBe("meanOfDomains");
  expect(sc.tiers.some((t: any) => /Critical|At Risk|On Track|Strong/.test(t.label))).toBe(false);
});
```

- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Rework scoringConfig** as above; keep questions + recommendations; every section carries its `domain`; neutral per-domain tiers. Export `buildScalingUpFullContent()`; wire to helper.
- [ ] **Step 4: Run tests + build gate; add a test that the config PASSES the publish schema** (`TemplateVersionForPublishSchema` / project publish validator over `{questions, sections, scoringConfig}` → success).
- [ ] **Step 5: Dry-run on dev DB.**
- [ ] **Step 6: Commit** — `feat(assessment): Scaling Up Full provisional 0-10 ScaleUp bands + remove placeholder domain tiers`

---

## Task 7: Integration verification (all 5) — DRAFT-aware

DRAFT versions can't render via the public quiz route (rejects `publishedAt = null`) and campaigns need published versions — verify at data/component/schema level:

- [ ] **Step 1:** Run all 5 seeds against a dev/preview DB in order; each appends one DRAFT; a second run no-ops (latest hash matches).
- [ ] **Step 2:** Assert each new DRAFT version's JSON passes the **publish schema** (`TemplateVersionForPublishSchema` / project validator) — proves it WOULD publish.
- [ ] **Step 3:** Run `scoreSubmission(draftVersionJson, syntheticAnswers)` on a midpoint submission; assert a tier returns without error (single band for neutral configs).
- [ ] **Step 4:** Render `PublicQuizClient` (or `QuestionInput`) with the draft JSON **directly** in an RTL test to confirm each type/scale renders — NOT the live `/quiz` route.
- [ ] **Step 5:** `npx jest src/__tests__/seed src/__tests__/lib/assessments` → green; build gate clean; commit `test(assessment): DRAFT-aware integration coverage (publish-schema + scorer + render)`.

---

## Task 8: Publish-review checklist for Jeff

- [ ] **Step 1:** Fill `docs/specs/v7.6/09b-publish-review-checklist.md`: items Jeff confirms before publishing each DRAFT — Rockefeller exact band edges (17/33); SU Full weighting formula + full 5-stop recommendation text + exact ScaleUp cutoffs (provisional 4.0/6.5 of the 0–10 rollup; 0–100 display is approximate `meanOfDomains×10`) + non-scored profile inputs; slider endpoint labels (currently empty). **Editor limitation:** the admin editor treats TEXT/NUMBER/MULTI_CHOICE config as v1.5/deferred and cannot edit their options/number constraints — mixed-type content fixes are **code-only**; admin UI is **review-only** for those types (Jeff reviews rendered output + scoring). State which templates are safe to publish as-is (QSP v1/v2 neutral, LVA neutral) vs need Jeff input (SU Full; Rockefeller band edges).
- [ ] **Step 2: Commit** — `docs(assessment): publish-review checklist for Jeff`

---

## Task 9: Production-run safety (guarded runner + verifier + rollback)

**Files:** Create `src/scripts/safe-seed.mjs` + test; create `src/scripts/verify-seeded-versions.mjs`; update `docs/specs/v7.6/04-deploy-runbook.md` + `docs/specs/v7.6/09b-publish-review-checklist.md`.

The append-only DRAFT model is prod-safe for live respondents (campaigns + quiz use only published versions; active campaigns pin a fixed `versionId`), but the operator process is not yet enforceable. The Vercel build does **NOT** run these seeds (build = `prisma generate && prisma migrate deploy && next build`); prod seeding is **manual-only** via the guarded runner below.

- [ ] **Step 1: Guarded seed runner.** `safe-seed.mjs` mirrors `safe-prisma.mjs` + `db-fingerprint.ts`: refuses to run any `prisma/seed-*.ts` against a Neon/prod host unless `--i-know-this-is-prod` AND the DB host matches `ASSESSMENT_PROD_EXPECTED_HOST`; and refuses a "dev/preview dry-run" invocation when the connected host IS prod. Unit-test both guard paths (mirror the existing safe-prisma tests). `npm run db:seed-assessments` routes through it.
- [ ] **Step 2: Ordered prod runner + manifest.** A single command runs the 5 seeds in fixed order (Rockefeller → QSP v1 → QSP v2 → LVA → SU Full), **stop-on-error** (do not continue past a failure), capturing per-seed JSON `{ alias, action, versionNumber, contentHash }` under one shared `seedRunId`, written to a run-log file.
- [ ] **Step 3: Post-run verifier.** `verify-seeded-versions.mjs` (read-only, same read-only-transaction guard as Task 0) asserts each of the 5 aliases has the intended latest DRAFT `versionNumber` + `contentHash` from the manifest, and that the prior published version is unchanged. Its output is REQUIRED in the run log before declaring success.
- [ ] **Step 4: Rollback procedure** (document in `09b`): capture a Neon PITR timestamp BEFORE the prod run (backstop). To undo a bad DRAFT: confirm `publishedAt IS NULL` AND no `AssessmentCampaign.versionId` references it, then delete that version row by the id recorded in the manifest. **Never** delete a published version. Repeated `forceSupersedeDraft` runs proliferate drafts — prefer rollback-then-reseed over stacking drafts.
- [ ] **Step 5: Commit** — `feat(assessment): guarded seed runner + post-run verifier + rollback procedure`

---

## Changelog

### Round 1 (Codex senior-engineer review — high 5 / medium 4 / low 2): all findings accepted

- **[HIGH] Slider schema fields / `scaleLabels` invalid** — ACCEPTED. `SliderLikertScaleSchema` requires `{min,max,step,anchorMin,anchorMax}`, no `scaleLabels`. Rockefeller keeps schema-valid **empty-string** anchors (faithful) instead of dropping them; LVA matrix uses `anchorMin:"Weak"/anchorMax:"Strong"`; all sliders carry `step:1`. Tests assert exact `scale` shape + absence of `scaleLabels`.
- **[HIGH] `passThreshold` required** — ACCEPTED. Every neutral config sets `passThreshold: 0`; tests assert it.
- **[HIGH] SU Full 0-100 tiers don't fit the engine** — ACCEPTED. Global tiers re-expressed in 0–10 rollup units (provisional 4.0/6.5), `rollup.overall:"meanOfDomains"`, `scaleUpScore:true` for the approximate 0–100 display; per-domain neutral tiers satisfy `DomainDefSchema`. Added publish-schema assertions.
- **[HIGH] Helper no-op suppression bug** — ACCEPTED. No-op only when the **latest** version's hash matches; otherwise append `max+1`. New abandoned-lower-draft test.
- **[HIGH] Stable-key continuity under-specified** — ACCEPTED. Task 0 dumps latest-**published** key→label maps for **all five** templates; slices reuse keys for unchanged questions, fresh otherwise.
- **[MED] Tests only check counts** — ACCEPTED. Added "Test rigor" rule + full ordered-label-array / verbatim-message assertions (Rockefeller fixture; same pattern per slice).
- **[MED] Required qualitative answers unenforced** — ACCEPTED. New **Task 1b** extends the required-answer check to TEXT/NUMBER/MULTI_CHOICE.
- **[MED] DRAFT can't render via public quiz** — ACCEPTED. Task 7 verifies via publish-schema + `scoreSubmission` + direct `PublicQuizClient` render, not the live route.
- **[MED] Editor can't edit mixed-type config** — ACCEPTED. Task 8 notes mixed-type fixes are code-only; admin UI is review-only for those types.
- **[LOW] Reimplemented hashing** — ACCEPTED. Helper imports `computeTemplateContentHash`.
- **[LOW] Invitation metadata divergence** — ACCEPTED, then **superseded by round-2 H1** (see below): the round-1 "sync template invitation fields" fix was reversed because it leaks into live campaign emails.

### Round 2 (Codex security & data-integrity review — high 3 / medium 5 / low 1): all findings accepted

- **[HIGH] Draft append mutating template invitation → live-campaign email change** — ACCEPTED; **reverses round-1 [LOW]**. Helper now NEVER updates template-level invitation on an existing template; it hashes the version against the **stored** invitation (no drift, no live-email change) and uses the seed's invitation copy only on first create.
- **[HIGH] Submit routes accept `value: unknown`** — ACCEPTED. Task 1b expanded from presence-only to full question-aware **value validation** (type, bounds, allowed MULTI_CHOICE keys, `maxChoices`, length/payload-size) in both public + invited submit routes, with adversarial-payload tests.
- **[HIGH] No stable-key / section referential integrity** — ACCEPTED. New `assertSeedContentIntegrity()` (unique section/question stableKeys, unique sortOrders, every `sectionStableKey` resolves, unique option keys) runs in the helper before persist + is unit-tested.
- **[MED] No advisory lock / conflict handling** — ACCEPTED. Caller-contract note: each seed `main()` runs the helper inside an interactive transaction with `pg_advisory_xact_lock(hashtext('assessment-<alias>-seed'))`, catching unique-version conflicts by re-read/no-op/retry.
- **[MED] Edited latest draft silently superseded** — ACCEPTED. Helper fails closed when the latest version is an unpublished DRAFT that differs (possible reviewer edits), unless `forceSupersedeDraft` is passed.
- **[MED] Seed drafts bypass audit** — ACCEPTED. Helper writes an `ASSESSMENT_VERSION_SEEDED` audit row (alias, versionNumber, previousLatest, contentHash, seedRunId) in the same transaction.
- **[MED] Task 0 baseline doc-only** — ACCEPTED. Task 0 emits committed `published-keys-<alias>.json` fixtures; per-slice key-continuity tests assert reuse/non-reuse against them.
- **[MED] Read-only baseline unenforced** — ACCEPTED. Task 0 prefers a read-only role + wraps the query in `SET TRANSACTION READ ONLY` (fail-fast on write).
- **[LOW] Missing-template path skips access-group/soft-delete safeguards** — ACCEPTED. Helper guards against soft-deleted templates; caller preserves `ensureAccessGroupAndTemplateLink` (create path only fires on a genuine fresh DB).

### Round 3 (Codex Ops/SRE review — focused pass; loop runner timed out, re-run as a direct Codex call): all findings accepted

Codex confirmed the append-only DRAFT model is **prod-safe for live respondents** (campaigns + public quiz use only published versions; active campaigns pin a fixed `versionId`). Remaining risk was operator-process safety — now made executable in **Task 9**:
- **[HIGH] No guarded runner for `tsx prisma/seed-*.ts`** (safe-prisma only guards migrate/push) — ACCEPTED. Task 9 adds `safe-seed.mjs` (refuses prod without `--i-know-this-is-prod` + fingerprint; refuses dev dry-run against a prod host).
- **[HIGH] No prod rollback for a bad DRAFT** — ACCEPTED. Task 9 Step 4: PITR timestamp backstop + delete-unpublished-version-by-manifest-id (only if no campaign references it); never delete published.
- **[MED] Read-only baseline ineffective** (`SET TRANSACTION READ ONLY` outside a Prisma tx) — ACCEPTED. Task 0 now wraps reads in one `db.$transaction` with the SET as first statement (+ prefer a read-only role).
- **[MED] Partial-failure / verification not choreographed** — ACCEPTED. Task 9 adds an ordered stop-on-error runner with a `seedRunId` manifest + a required post-run verifier.
- **[MED] Build auto-run ambiguity** — RESOLVED. Confirmed the Vercel build does NOT run seeds; prod seeding is manual-only (stated in Task 9).
- **[LOW] Advisory-lock operator clarity** — ACCEPTED. Caller contract switched to `pg_try_advisory_xact_lock` + timeout; confirmed no live-traffic contention.
