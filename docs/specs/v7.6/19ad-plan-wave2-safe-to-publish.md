# Wave 2 (Safe-to-Publish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live, passive publish-readiness readout in the admin template editor — the exact server publish gate (Prevent) plus two advisory structural warnings (Warn) — shown *before* the author clicks Publish. Spec: `docs/specs/v7.6/19ad-editor-overhaul-wave2-safe-to-publish.md`.

**Architecture:** Extract-don't-fork. One new pure helper `getPublishValidationIssues` in `scoring.ts` is called by BOTH the publish route (refactored, behavior-preserving) and a new pure client module `publish-readiness.ts`, so the live badge can never drift from the server gate (C1). The badge assembles the live draft via the Wave 1 `buildVersionScoringPayload` seam and soft-fails like the Wave 1 Test Mode drawer. Flag-gated (`WAVE_ED2_SAFE_TO_PUBLISH_ENABLED`), default-OFF, writes nothing, no schema/migration.

**Tech Stack:** Next.js (App Router) · TypeScript · Zod · React · Jest + Testing Library.

---

## File Structure

**Create:**
- `src/src/lib/assessments/wave-ed2-flags.ts` — the flag (`isSafeToPublishEnabled()`), mirrors `wave-ed1-flags.ts`.
- `src/src/components/admin/template-editor/publish-readiness.ts` — `evaluatePublishReadiness(built) → { prevent, warn }` + exported `computeWarnings`; pure, client-side, zero db imports.
- `src/src/components/admin/template-editor/SafeToPublishBadge.tsx` — header badge + expandable panel; soft-fails.
- Tests: `src/src/__tests__/lib/assessments/publish-validation-issues.test.ts`, `.../wave-ed2-flags.test.ts`, `src/src/__tests__/admin/template-editor/publish-readiness.test.ts`, `.../safe-to-publish-badge.test.tsx`, `.../safe-to-publish-parity.test.ts`.

**Modify:**
- `src/src/lib/assessments/scoring.ts` — add `getPublishValidationIssues` after `TemplateVersionForPublishSchema` (`:568`).
- `src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/publish/route.ts` — refactor `:73-87` to call the helper (behavior-preserving).
- `src/src/components/admin/TemplateEditorTabbed.tsx` — add `safeToPublishEnabled` prop + default, `safeToPublishAvailable`, render the badge in the header action row.
- `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx` — import `isSafeToPublishEnabled` + pass `safeToPublishEnabled={isSafeToPublishEnabled()}`.

> **Run all commands from `src/`** (`cd "$REPO/src"`). App source lives under `src/src/...`.

---

## Task 1: `getPublishValidationIssues` shared helper + refactor the publish route (C1)

**Files:**
- Modify: `src/src/lib/assessments/scoring.ts` (add export after `:568`)
- Modify: `src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/publish/route.ts:73-87`
- Test: `src/src/__tests__/lib/assessments/publish-validation-issues.test.ts`
- Baseline (must stay green): the existing publish-route test suite.

- [ ] **Step 1: Write the failing test**

Reuse the non-tiling-tier fixture pattern already in `src/src/__tests__/lib/assessments/scoring.wave-v.test.ts` (the `v` builder — a minimal slider version whose global `scoringConfig.tiers` do NOT cover the metric domain) and a clean/valid counterpart.

```ts
// src/src/__tests__/lib/assessments/publish-validation-issues.test.ts
import { getPublishValidationIssues } from "@/lib/assessments/scoring";
import { validGlobalTierVersion, nonTilingGlobalTierVersion } from "./scoring-fixtures";
// ^ If no shared fixtures module exists, inline the two versions using the same
//   shape scoring.wave-v.test.ts builds (questions[], sections[], scoringConfig).

describe("getPublishValidationIssues", () => {
  it("returns [] for a publishable version", () => {
    expect(getPublishValidationIssues(validGlobalTierVersion())).toEqual([]);
  });

  it("returns the same Zod issues the publish schema would emit for a bad version", () => {
    const issues = getPublishValidationIssues(nonTilingGlobalTierVersion());
    expect(issues.length).toBeGreaterThan(0);
    // routed under scoringConfig.tiers (the Wave V global-tier gate)
    expect(issues.some((i) => i.path.join(".").startsWith("scoringConfig.tiers"))).toBe(true);
  });

  it("accepts the three-field object shape the publish route passes", () => {
    const issues = getPublishValidationIssues({
      questions: [], sections: [], scoringConfig: {},
    });
    // Empty is structurally-parseable but not necessarily publishable; the point
    // is it never throws and returns an array.
    expect(Array.isArray(issues)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/src/__tests__/lib/assessments/publish-validation-issues.test.ts`
Expected: FAIL — `getPublishValidationIssues is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation**

In `src/src/lib/assessments/scoring.ts`, immediately after the `TemplateVersionForPublishSchema` definition (after `:568`):

```ts
/**
 * Wave ED2 (spec 19ad C1) — the ONE publish-validation entry point. Both the
 * publish route AND the editor's live Safe-to-Publish badge call this, so the
 * live readout can never drift from the server gate (extract-don't-fork, the
 * same move Wave 1 made for computeScoreResult). Returns [] when the version is
 * publishable; otherwise the Zod issues the 422 carries. Pure, no db.
 */
export function getPublishValidationIssues(input: {
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
}): z.ZodIssue[] {
  const res = TemplateVersionForPublishSchema.safeParse(input);
  return res.success ? [] : res.error.issues;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/src/__tests__/lib/assessments/publish-validation-issues.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor the publish route to call the helper (behavior-preserving)**

Capture the green baseline first:
Run: `f=$(rg -l "PUBLISH_VALIDATION_FAILED" src/src/__tests__); echo "$f"; npx jest $f`
Expected: PASS (baseline).

Then in `publish/route.ts`, change the import and replace `:73-87`:

```ts
// import (line 13): swap the schema import for the helper
import { getPublishValidationIssues } from "@/lib/assessments/scoring";
```

```ts
// replace the safeParse block (:73-87) with:
const publishIssues = getPublishValidationIssues({
  questions: version.questions,
  sections: version.sections,
  scoringConfig: version.scoringConfig,
});
if (publishIssues.length > 0) {
  return NextResponse.json(
    {
      success: false,
      error: "PUBLISH_VALIDATION_FAILED",
      issues: publishIssues,
    },
    { status: 422 },
  );
}
```

Run the baseline again + typecheck:
Run: `npx jest $(rg -l "PUBLISH_VALIDATION_FAILED" src/src/__tests__) && npx tsc --noEmit -p tsconfig.json 2>&1 | rg "publish|scoring" || echo "no ts errors in touched files"`
Expected: publish-route tests still PASS (422 shape unchanged), no new tsc errors.

- [ ] **Step 6: Commit**

```bash
git add src/src/lib/assessments/scoring.ts \
        "src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/publish/route.ts" \
        src/src/__tests__/lib/assessments/publish-validation-issues.test.ts
git commit -m "feat(assessments): extract getPublishValidationIssues; publish route calls it (Wave ED2 C1)"
```

---

## Task 2: `WAVE_ED2_SAFE_TO_PUBLISH_ENABLED` flag

**Files:**
- Create: `src/src/lib/assessments/wave-ed2-flags.ts`
- Test: `src/src/__tests__/lib/assessments/wave-ed2-flags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/src/__tests__/lib/assessments/wave-ed2-flags.test.ts
import { isSafeToPublishEnabled } from "@/lib/assessments/wave-ed2-flags";

describe("isSafeToPublishEnabled", () => {
  const prev = process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED;
  afterEach(() => { process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED = prev; });

  it("is false by default (unset)", () => {
    delete process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED;
    expect(isSafeToPublishEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("is true for %s", (v) => {
    process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED = v;
    expect(isSafeToPublishEnabled()).toBe(true);
  });

  it("is false for other values", () => {
    process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED = "0";
    expect(isSafeToPublishEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/src/__tests__/lib/assessments/wave-ed2-flags.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/src/lib/assessments/wave-ed2-flags.ts
/**
 * Wave ED2 — assessment-editor Safe-to-Publish readout (default-OFF, single lever).
 * Spec: docs/specs/v7.6/19ad-editor-overhaul-wave2-safe-to-publish.md.
 * Additive, writes nothing → no KILL/CANARY needed. Env read at call time
 * (redeploy-less kill; test-predictable). Truthiness matches the ED1 convention.
 */
function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

export function isSafeToPublishEnabled(): boolean {
  return isOn(process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/src/__tests__/lib/assessments/wave-ed2-flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/wave-ed2-flags.ts src/src/__tests__/lib/assessments/wave-ed2-flags.test.ts
git commit -m "feat(assessments): add WAVE_ED2_SAFE_TO_PUBLISH_ENABLED flag"
```

---

## Task 3: `publish-readiness.ts` — `evaluatePublishReadiness` + `computeWarnings`

**Files:**
- Create: `src/src/components/admin/template-editor/publish-readiness.ts`
- Test: `src/src/__tests__/admin/template-editor/publish-readiness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/src/__tests__/admin/template-editor/publish-readiness.test.ts
import {
  evaluatePublishReadiness,
  computeWarnings,
} from "@/components/admin/template-editor/publish-readiness";

const built = (over: Partial<{ questions: unknown; sections: unknown; scoringConfig: unknown }>) => ({
  questions: [], sections: [], scoringConfig: {}, ...over,
});

describe("computeWarnings", () => {
  it("flags an empty section (no question references its stableKey)", () => {
    const w = computeWarnings(built({
      questions: [{ stableKey: "q1", type: "TEXT", sectionStableKey: "s1" }],
      sections: [{ stableKey: "s1", name: "A" }, { stableKey: "s2", name: "B" }],
    }));
    expect(w).toHaveLength(1);
    expect(w[0].path).toEqual(["sections", 1]);
  });

  it("flags an unassigned question (blank sectionStableKey)", () => {
    const w = computeWarnings(built({
      questions: [{ stableKey: "q1", type: "TEXT", sectionStableKey: "" }],
      sections: [{ stableKey: "s1", name: "A" }],
    }));
    // s1 is empty AND q1 is unassigned → two warnings
    expect(w.some((i) => i.path.join(".") === "questions.0.sectionStableKey")).toBe(true);
  });

  it("no warnings when every section has a question and every question is assigned", () => {
    const w = computeWarnings(built({
      questions: [{ stableKey: "q1", type: "TEXT", sectionStableKey: "s1" }],
      sections: [{ stableKey: "s1", name: "A" }],
    }));
    expect(w).toEqual([]);
  });

  it("is defensive — malformed payload does not throw", () => {
    expect(() => computeWarnings(built({ questions: null, sections: 42 }))).not.toThrow();
    expect(computeWarnings(built({ questions: null, sections: 42 }))).toEqual([]);
  });
});

describe("evaluatePublishReadiness", () => {
  it("prevent mirrors getPublishValidationIssues; warn computed independently (C4)", () => {
    // A version that FAILS a publish-only check (non-tiling global tier) AND has
    // an empty section → BOTH prevent and warn are non-empty (reuse the
    // nonTilingGlobalTierVersion fixture from Task 1, add a stray empty section).
    const bad = nonTilingGlobalTierWithEmptySection(); // helper: bad tiers + section "sX" w/ no questions
    const r = evaluatePublishReadiness(bad);
    expect(r.prevent.length).toBeGreaterThan(0);
    expect(r.warn.length).toBeGreaterThan(0);
  });

  it("a publishable draft with a stray empty section → prevent [] AND one warn (publish-legal)", () => {
    const ok = validGlobalTierWithEmptySection(); // helper: valid tiers + section "sX" w/ no questions
    const r = evaluatePublishReadiness(ok);
    expect(r.prevent).toEqual([]);
    expect(r.warn.length).toBe(1);
  });
});
```

> Fixture note: build `nonTilingGlobalTierWithEmptySection` / `validGlobalTier*` by taking the `scoring.wave-v.test.ts` `v` builder output and appending `{ stableKey: "sX", name: "Extra" }` to `sections`. Keep them local to this test file or a shared `scoring-fixtures.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/src/__tests__/admin/template-editor/publish-readiness.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
// src/src/components/admin/template-editor/publish-readiness.ts
/**
 * Wave ED2 Safe-to-Publish (spec 19ad). Pure, client-side, zero db imports.
 * Evaluates a live editor draft (already assembled by buildVersionScoringPayload)
 * for publish-readiness:
 *   - Prevent = the SAME getPublishValidationIssues the publish route runs
 *     (C1 — no second code path).
 *   - Warn = advisory STRUCTURAL nudges, computed from the raw payload
 *     INDEPENDENTLY of Prevent (C4 — safeParse yields no data on any failure,
 *     so warnings must not be gated on parse-success).
 */
import { getPublishValidationIssues } from "@/lib/assessments/scoring";

export interface ReadinessIssue {
  path: (string | number)[];
  message: string;
}

export interface PublishReadiness {
  prevent: ReadinessIssue[];
  warn: ReadinessIssue[];
}

interface BuiltVersion {
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
}

export function evaluatePublishReadiness(built: BuiltVersion): PublishReadiness {
  const prevent: ReadinessIssue[] = getPublishValidationIssues(built).map((i) => ({
    path: i.path,
    message: i.message,
  }));
  return { prevent, warn: computeWarnings(built) };
}

/**
 * Two structural warnings, both publish-legal (never block). Reads the raw
 * built payload defensively; a field too malformed to read is skipped (Prevent
 * will already carry that structural issue).
 */
export function computeWarnings(built: BuiltVersion): ReadinessIssue[] {
  const out: ReadinessIssue[] = [];
  const questions = Array.isArray(built.questions) ? built.questions : [];
  const sections = Array.isArray(built.sections) ? built.sections : [];

  // Warn 1 — empty section: a section referenced by zero questions.
  const referenced = new Set<string>();
  for (const q of questions) {
    const key = readSectionKey(q);
    if (key) referenced.add(key);
  }
  sections.forEach((s, i) => {
    const key = readStableKey(s);
    if (key && !referenced.has(key)) {
      out.push({
        path: ["sections", i],
        message: `Section "${readName(s) ?? key}" has no questions.`,
      });
    }
  });

  // Warn 2 — unassigned question: blank/absent sectionStableKey ("Other" bucket).
  questions.forEach((q, i) => {
    if (!readSectionKey(q)) {
      out.push({
        path: ["questions", i, "sectionStableKey"],
        message: `Question "${readStableKey(q) ?? i}" is not assigned to a section (renders under "Other").`,
      });
    }
  });

  return out;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === "object" ? (x as Record<string, unknown>) : null;
}
function readSectionKey(q: unknown): string {
  const raw = asRecord(q)?.sectionStableKey;
  return typeof raw === "string" ? raw.trim() : "";
}
function readStableKey(x: unknown): string | null {
  const v = asRecord(x)?.stableKey;
  return typeof v === "string" ? v : null;
}
function readName(x: unknown): string | null {
  const r = asRecord(x);
  const v = r?.name ?? r?.title ?? r?.label;
  return typeof v === "string" ? v : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/src/__tests__/admin/template-editor/publish-readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/components/admin/template-editor/publish-readiness.ts \
        src/src/__tests__/admin/template-editor/publish-readiness.test.ts
git commit -m "feat(assessments): publish-readiness (prevent mirror + structural warns) — Wave ED2"
```

---

## Task 4: `SafeToPublishBadge` component (header badge + expandable panel)

**Files:**
- Create: `src/src/components/admin/template-editor/SafeToPublishBadge.tsx`
- Test: `src/src/__tests__/admin/template-editor/safe-to-publish-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/src/__tests__/admin/template-editor/safe-to-publish-badge.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { SafeToPublishBadge } from "@/components/admin/template-editor/SafeToPublishBadge";

// A clean, publishable slider draft (reuse the valid-version fixture shape).
const cleanProps = () => ({
  questions: [/* one assigned slider with tiling bands */] as never,
  sections: [{ stableKey: "s1", name: "A" }] as never,
  rawQuestions: [],
  rawSections: [],
  scoringConfig: {} as unknown,
  publishedKeys: new Set<string>(),
  publishedOptionKeys: {},
  dirty: { questions: false, sections: false },
  isDirty: false,
});

describe("SafeToPublishBadge", () => {
  it("reads 'Ready to publish' when clean and Prevent=0", () => {
    render(<SafeToPublishBadge {...cleanProps()} />);
    expect(screen.getByTestId("safe-to-publish-badge")).toHaveTextContent(/ready to publish/i);
  });

  it("reads 'Ready after save' when dirty and Prevent=0 (C2 — never plain Ready while dirty)", () => {
    render(<SafeToPublishBadge {...cleanProps()} isDirty dirty={{ questions: true, sections: false }} />);
    expect(screen.getByTestId("safe-to-publish-badge")).toHaveTextContent(/ready after save/i);
  });

  it("shows blocker count + expands the panel with issue paths", () => {
    // A draft with a publish blocker (non-tiling tier) → badge shows 'blocker(s)'.
    render(<SafeToPublishBadge {...cleanProps()} scoringConfig={/* non-tiling */ {} as unknown} />);
    const badge = screen.getByTestId("safe-to-publish-badge");
    expect(badge).toHaveTextContent(/blocker/i);
    fireEvent.click(badge);
    expect(screen.getByTestId("safe-to-publish-panel")).toBeInTheDocument();
  });

  it("soft-fails: an assembly error surfaces as a Prevent note, never throws", () => {
    // Force buildVersionScoringPayload to throw via an inherited key/type-lock
    // violation (a dirty question reusing a publishedKey with a changed type).
    expect(() =>
      render(<SafeToPublishBadge {...cleanProps()} /* ...violating inputs... */ />),
    ).not.toThrow();
  });
});
```

> Test note: for the blocker + soft-fail cases, construct inputs with the same builders Task 3 / the Wave 1 `test-mode-drawer.test.tsx` use (that suite already exercises `buildVersionScoringPayload` throw paths — copy its violating-inputs setup).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/src/__tests__/admin/template-editor/safe-to-publish-badge.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

```tsx
// src/src/components/admin/template-editor/SafeToPublishBadge.tsx
"use client";

/**
 * Wave ED2 Safe-to-Publish badge (spec 19ad). A live, PASSIVE publish-readiness
 * readout in the editor header. Prevent = the SAME server publish gate
 * (getPublishValidationIssues, via evaluatePublishReadiness); Warn = advisory
 * structural nudges. Click to expand a grouped panel. Writes NOTHING — the
 * Publish button and the server 422 are unchanged. Soft-fails (an assembly
 * error becomes a Prevent-class note, never crashes the editor — mirrors the
 * Wave 1 Test Mode drawer). Recomputes only when its structural inputs change.
 */
import * as React from "react";
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import {
  evaluatePublishReadiness,
  type PublishReadiness,
  type ReadinessIssue,
} from "@/components/admin/template-editor/publish-readiness";
import { formatIssuePath } from "@/components/admin/PublishFailureModal";
import { QuestionSerializationError } from "@/components/admin/template-editor/question-serialization";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

export interface SafeToPublishBadgeProps {
  questions: QuestionDraftRow[];
  sections: SectionDraft[];
  rawQuestions: unknown[];
  rawSections: unknown[];
  scoringConfig: unknown;
  publishedKeys: ReadonlySet<string>;
  publishedOptionKeys: Readonly<Record<string, readonly string[]>>;
  dirty: { questions: boolean; sections: boolean };
  isDirty: boolean;
}

export function SafeToPublishBadge(props: SafeToPublishBadgeProps) {
  const [open, setOpen] = React.useState(false);

  const readiness: PublishReadiness = React.useMemo(() => {
    try {
      const built = buildVersionScoringPayload({
        questions: props.questions,
        sections: props.sections,
        rawQuestions: props.rawQuestions,
        rawSections: props.rawSections,
        scoringConfig: props.scoringConfig,
        publishedKeys: props.publishedKeys,
        publishedOptionKeys: props.publishedOptionKeys,
        dirty: props.dirty,
      });
      return evaluatePublishReadiness(built);
    } catch (e) {
      const message =
        e instanceof QuestionSerializationError
          ? e.message
          : "Couldn't assemble this draft to check publish-readiness.";
      // Assembly failure = a blocker, surfaced under Prevent; never rethrow.
      return { prevent: [{ path: [], message }], warn: [] };
    }
  }, [
    props.questions,
    props.sections,
    props.rawQuestions,
    props.rawSections,
    props.scoringConfig,
    props.publishedKeys,
    props.publishedOptionKeys,
    props.dirty,
  ]);

  const nPrevent = readiness.prevent.length;
  const nWarn = readiness.warn.length;
  const tone = nPrevent > 0 ? "blocker" : nWarn > 0 ? "warn" : "ready";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="safe-to-publish-badge"
        data-tone={tone}
        className="wf-btn wf-btn-secondary wf-btn-sm"
      >
        {badgeLabel(nPrevent, nWarn, props.isDirty)}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Safe to Publish"
          data-testid="safe-to-publish-panel"
          className="absolute right-0 z-50 mt-2 w-[min(520px,90vw)] rounded-lg border bg-background p-4 text-sm shadow-xl"
        >
          <IssueGroup
            title="Blocks publish"
            testid="stp-prevent"
            tone="blocker"
            issues={readiness.prevent}
            empty="No blockers — this draft passes the publish checks."
          />
          <IssueGroup
            title="Advisory"
            testid="stp-warn"
            tone="warn"
            issues={readiness.warn}
            empty="No warnings."
          />
          {props.isDirty && nPrevent === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Save the draft to publish these changes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function badgeLabel(nPrevent: number, nWarn: number, isDirty: boolean): string {
  if (nPrevent > 0) {
    const blockers = `${nPrevent} blocker${nPrevent === 1 ? "" : "s"}`;
    return nWarn > 0 ? `${blockers} · ${nWarn} warning${nWarn === 1 ? "" : "s"}` : blockers;
  }
  if (nWarn > 0) return `${nWarn} warning${nWarn === 1 ? "" : "s"}`;
  return isDirty ? "Ready after save" : "Ready to publish";
}

function IssueGroup(props: {
  title: string;
  testid: string;
  tone: "blocker" | "warn";
  issues: ReadinessIssue[];
  empty: string;
}) {
  return (
    <div className="mb-3 last:mb-0" data-testid={props.testid}>
      <p className="font-medium">
        {props.tone === "blocker" ? "✗ " : "⚠ "}
        {props.title} ({props.issues.length})
      </p>
      {props.issues.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{props.empty}</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {props.issues.map((issue, idx) => (
            <li
              key={idx}
              className={
                props.tone === "blocker"
                  ? "rounded-md border border-destructive/30 bg-destructive/5 p-2"
                  : "rounded-md border border-amber-500/30 bg-amber-500/5 p-2"
              }
            >
              <div className="font-mono text-xs text-muted-foreground">
                {formatIssuePath(issue.path)}
              </div>
              <div className="mt-0.5">{issue.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/src/__tests__/admin/template-editor/safe-to-publish-badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/components/admin/template-editor/SafeToPublishBadge.tsx \
        src/src/__tests__/admin/template-editor/safe-to-publish-badge.test.tsx
git commit -m "feat(assessments): SafeToPublishBadge — live header readout + panel (Wave ED2)"
```

---

## Task 5: Wire the flag-gated badge into the editor header + edit page

**Files:**
- Modify: `src/src/components/admin/TemplateEditorTabbed.tsx` (prop `:225`/`:257`, header action row `:1098-1108`)
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx` (`:22`, `:202`)
- Test: `src/src/__tests__/admin/template-editor/safe-to-publish-wiring.test.tsx`

- [ ] **Step 1: Add the prop + import + availability flag to `TemplateEditorTabbed.tsx`**

Add the import near the other template-editor imports (beside line 75 `TestModeDrawer`):

```ts
import { SafeToPublishBadge } from "@/components/admin/template-editor/SafeToPublishBadge";
```

Add the prop to the interface (after `testModeEnabled?: boolean;` at `:225`):

```ts
  /**
   * Wave ED2 (spec 19ad) — Safe-to-Publish live readout. Server-computed
   * (`isSafeToPublishEnabled()`) and passed down from the edit page.
   */
  safeToPublishEnabled?: boolean;
```

Add the default in the destructure (after `testModeEnabled = false,` at `:257`):

```ts
  safeToPublishEnabled = false,
```

Add the availability flag next to `testModeAvailable` (`:715`):

```ts
  const safeToPublishAvailable = !isPublished && safeToPublishEnabled;
```

- [ ] **Step 2: Render the badge in the header action row**

In the header action row, immediately before the Test Mode button block (`:1099`), add:

```tsx
          {safeToPublishAvailable && (
            <SafeToPublishBadge
              questions={questions}
              sections={sections}
              rawQuestions={rawQuestionsRef.current}
              rawSections={rawSectionsRef.current}
              scoringConfig={scoringConfigRef.current}
              publishedKeys={new Set(publishedQuestionKeys)}
              publishedOptionKeys={publishedOptionKeys}
              dirty={{
                questions: Boolean(dirtyFlags.questions),
                sections: Boolean(dirtyFlags.sections),
              }}
              isDirty={isAnyDirty}
            />
          )}
```

- [ ] **Step 3: Pass the flag from the edit page**

In `edit/page.tsx`, add the import (after `:22`):

```ts
import { isSafeToPublishEnabled } from "@/lib/assessments/wave-ed2-flags";
```

Add the prop where the other flags are passed (after `testModeEnabled={isTestModeEnabled()}` at `:202`):

```tsx
        safeToPublishEnabled={isSafeToPublishEnabled()}
```

- [ ] **Step 4: Add a wiring test**

```tsx
// src/src/__tests__/admin/template-editor/safe-to-publish-wiring.test.tsx
// Mirror the Test Mode wiring test: render TemplateEditorTabbed on a DRAFT with
// safeToPublishEnabled and assert the badge renders; with the flag off OR on a
// published version, assert it does NOT.
import { render, screen } from "@testing-library/react";
import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";
// reuse the draft/published version fixtures + mocks from test-mode wiring test

it("renders the Safe-to-Publish badge on a draft when the flag is on", () => {
  render(<TemplateEditorTabbed {...draftProps()} safeToPublishEnabled />);
  expect(screen.getByTestId("safe-to-publish-badge")).toBeInTheDocument();
});

it("does not render it when the flag is off", () => {
  render(<TemplateEditorTabbed {...draftProps()} safeToPublishEnabled={false} />);
  expect(screen.queryByTestId("safe-to-publish-badge")).toBeNull();
});

it("does not render it on a published version", () => {
  render(<TemplateEditorTabbed {...publishedProps()} safeToPublishEnabled />);
  expect(screen.queryByTestId("safe-to-publish-badge")).toBeNull();
});
```

> Reuse the fixture builders + mocks (`useRouter`, `useToast`, etc.) from the existing Test Mode wiring test in `src/src/__tests__/admin/template-editor/` (search for `template-editor-test-mode-btn`).

- [ ] **Step 5: Run + typecheck + lint + commit**

Run: `npx jest src/src/__tests__/admin/template-editor/safe-to-publish-wiring.test.tsx && npx eslint src/src/components/admin/TemplateEditorTabbed.tsx src/src/components/admin/template-editor/SafeToPublishBadge.tsx src/src/components/admin/template-editor/publish-readiness.ts "src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx"`
Expected: PASS, no lint errors.

```bash
git add src/src/components/admin/TemplateEditorTabbed.tsx \
        "src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx" \
        src/src/__tests__/admin/template-editor/safe-to-publish-wiring.test.tsx
git commit -m "feat(assessments): wire flag-gated Safe-to-Publish badge into the editor header (Wave ED2)"
```

---

## Task 6: Parity test + full verification

**Files:**
- Test: `src/src/__tests__/admin/template-editor/safe-to-publish-parity.test.ts`

- [ ] **Step 1: Write the parity + divergence + C4 tests**

```ts
// src/src/__tests__/admin/template-editor/safe-to-publish-parity.test.ts
import { getPublishValidationIssues } from "@/lib/assessments/scoring";
import { evaluatePublishReadiness } from "@/components/admin/template-editor/publish-readiness";

describe("Safe-to-Publish parity with the server gate (C1)", () => {
  it("prevent equals getPublishValidationIssues for the SAME built payload (clean)", () => {
    const built = validGlobalTierVersion();
    expect(evaluatePublishReadiness(built).prevent).toEqual([]);
    expect(getPublishValidationIssues(built)).toEqual([]);
  });

  it("prevent carries the SAME issue the publish route would 422 with (known failure)", () => {
    const built = nonTilingGlobalTierVersion();
    const routeIssues = getPublishValidationIssues(built); // what route.ts returns in `issues`
    const prevent = evaluatePublishReadiness(built).prevent;
    expect(prevent.map((i) => i.path.join("."))).toEqual(routeIssues.map((i) => i.path.join(".")));
  });

  it("C4 — a draft failing a publish-only check AND with an empty section → prevent>0 AND warn>0", () => {
    const built = nonTilingGlobalTierWithEmptySection();
    const r = evaluatePublishReadiness(built);
    expect(r.prevent.length).toBeGreaterThan(0);
    expect(r.warn.length).toBeGreaterThan(0);
  });
});

// Divergence (C2) is covered in safe-to-publish-badge.test.tsx via the isDirty prop
// (Ready-to-publish vs Ready-after-save on the same clean draft).
```

- [ ] **Step 2: Run it**

Run: `npx jest src/src/__tests__/admin/template-editor/safe-to-publish-parity.test.ts`
Expected: PASS.

- [ ] **Step 3: Full targeted suite + build + lint (jest-verify counts for SoT)**

Run:
```bash
npx jest src/src/__tests__/lib/assessments/publish-validation-issues.test.ts \
         src/src/__tests__/lib/assessments/wave-ed2-flags.test.ts \
         src/src/__tests__/admin/template-editor/publish-readiness.test.ts \
         src/src/__tests__/admin/template-editor/safe-to-publish-badge.test.tsx \
         src/src/__tests__/admin/template-editor/safe-to-publish-wiring.test.tsx \
         src/src/__tests__/admin/template-editor/safe-to-publish-parity.test.ts \
         $(rg -l "PUBLISH_VALIDATION_FAILED" src/src/__tests__)
```
Expected: all PASS. **Record the exact "Tests:" / "Test Suites:" summary line for the SoT (jest-verify — never write counts from memory).**

Run: `CI=true npx next build --turbopack`
Expected: build green.

- [ ] **Step 4: Commit**

```bash
git add src/src/__tests__/admin/template-editor/safe-to-publish-parity.test.ts
git commit -m "test(assessments): Safe-to-Publish parity + C4 warnings-with-prevent (Wave ED2)"
```

---

## After all tasks: launch prep (separate authorization)

Merge dark (flag OFF). Then, per the gated-wave discipline: adversarial review (use a Workflow per ultracode) → live walk on a throwaway draft (author a deliberate publish failure, confirm the badge shows the identical blocker the 422 modal shows; fix it; confirm a Warn fires and does NOT block a real publish) → flag flip (`WAVE_ED2_SAFE_TO_PUBLISH_ENABLED=1`) is a SEPARATE, individually-authorized prod action. Kill = flag off / revert. Update SoT (CLAUDE.md anchor + CHANGELOG) + Notion task on the prod push.

## Self-review notes (author)
- **Spec coverage:** §3.3 → Tasks 1+3 (shared helper + module); §3.4 warns → Task 3; §3.2 badge/states/soft-fail/dirty → Task 4; flag §3.6 → Task 2; wiring → Task 5; §3.7 tests → across all + Task 6 parity. No spec requirement is unmapped.
- **Type consistency:** `ReadinessIssue`/`PublishReadiness` defined in Task 3 and consumed unchanged in Tasks 4/6; `getPublishValidationIssues` signature identical across Tasks 1/3/6; badge props match the Task 5 wiring call site exactly (mirrors the Test Mode drawer inputs + `isDirty`).
- **No new hard gate:** the publish route refactor is behavior-preserving (same `422`, same issues); Prevent set unchanged (spec §3.5/§4).
- **Fixtures:** reuse the `scoring.wave-v.test.ts` non-tiling-tier builder + the Test Mode wiring/throw-path fixtures rather than reinventing full valid versions.
