# Spec 19ad — Assessment Editor Overhaul · Wave 2: Safe-to-Publish

> **Status:** DRAFT — brainstorm + `/grill-with-docs` + `/co-validate` (real Codex GPT-5.5 @ xhigh) DONE 2026-07-10; **awaiting final user approval before `writing-plans`.** Nothing is built.
> **Date:** 2026-07-10 · **Author:** design track (Wave ED overhaul, re-sequenced 5-wave plan — spec 19ac §2).
> **Gate:** GATED wave. Brainstorm + grill + co-validate DONE (decisions locked below). This spec + an
> implementation plan + user approval complete the gate.

> **/co-validate outcome (2026-07-10) — REAL Codex GPT-5.5 @ xhigh (read-only, code-grounded) + own review. 4
> findings, ALL ACCEPTED, 0 overridden. Two are substantive corrections; both code-verified before accepting:**
> - **C1 (parity was tautological — accept, = own review):** testing `evaluatePublishReadiness().prevent` against
>   `TemplateVersionForPublishSchema.safeParse` (same call) proves nothing about route drift; the route
>   independently parses persisted JSON (`publish/route.ts:73`). **Fix:** extract ONE pure
>   `getPublishValidationIssues({questions,sections,scoringConfig}) → ZodIssue[]` in `scoring.ts`; the publish
>   route AND the badge both call it (behavior-preserving route change — the route currently inlines the
>   safeParse). Real parity by shared code — the same extract-don't-fork move Wave 1 made for `computeScoreResult`.
> - **C2 (dirty-vs-persisted must be explicit — accept):** the badge must NEVER read plain "Ready to publish"
>   while version-affecting dirty flags exist → "Ready after save" / "Save draft to publish". Add BIDIRECTIONAL
>   divergence tests (saved-fails/live-passes AND saved-passes/live-fails).
> - **C3 (Warn #3 premise FALSE — accept, CODE-VERIFIED; revises grill Q3):** reports render the recommendations
>   section ONLY when findings exist (`BrandedReport.tsx:707` `{hasRecommendations && …}`; `QualitativeReport.tsx:442`
>   flag-gated + empty→no section) — there is no "empty recommendations section" to warn about, and findings are
>   Wave-U flag-gated + honest-data (templates legitimately ship empty). **DROP Warn #3.** Ship the 2 structural
>   warnings only; don't dilute badge trust with speculative advisory noise. (A findings-intent nudge, if ever
>   wanted, is a later `findingsEnabled`-gated addition.)
> - **C4 (warnings wrongly gated on parse-success — accept, real bug):** `safeParse` returns NO parsed data on ANY
>   failure incl. the six publish-only checks; computing warnings only after parse-success makes the
>   "N blockers · M warnings" state impossible. **Fix:** compute warnings from the raw built payload INDEPENDENT of
>   publish-parse success (per-field `Array.isArray` defensiveness only).
> - **Own review (kept, complementary):** specify Warn `path` shapes for `formatIssuePath`; the badge recomputes on
>   STRUCTURAL draft change (not per-render), memoized on the same inputs Test Mode uses + debounced.

> **Grill outcome (2026-07-10, `/grill-with-docs`) — 3 decisions locked, code-verified:**
> 1. **Passive readout — the Publish button is UNCHANGED (Q1).** The badge evaluates the on-screen (possibly
>    unsaved) draft while Publish acts on the SAVED version and the server `422` is the authoritative gate;
>    client-side gating would create a dirty-vs-saved mismatch. Zero behavioral surface. (§4)
> 2. **Warn #3 is TYPE-based, not report-config-based (Q2).** Fire when ≥1 finding-capable (non-TEXT) question
>    exists and none carry `recommendations`. Findings render in both report kinds and `reportConfigFor` governs
>    only tier/score-table (W1 co-validate C4), so it's the wrong gate; type-based also avoids a spurious nudge on
>    an empty new template. (§3.4)
> 3. **Warn set stays at 3; empty-section fires strictly on zero questions (Q3).** Not on all-conditional (Wave W)
>    sections. Rejected 4th candidate: "unused scoring domain" (publish-legal but niche). (§3.4/§5)
>
> **No ADR** (additive, flag-gated, writes nothing → fully reversible — fails the "hard to reverse" test, same as
> Wave 1). Glossary term **Safe-to-Publish** added to `CONTEXT.md` (parallel to the Wave 1 **Test Mode** entry).

> **Brainstorm outcome (2026-07-10) — 2 decisions locked, code-verified:**
> 1. **Scope = live Prevent mirror + a small bounded Warn tier.** "Prevent" = the SAME six publish checks the
>    publish route runs, shown live in the editor (they still block publish server-side, unchanged). "Warn" = a
>    short, enumerated advisory list of authoring-quality issues that **do NOT block publish** (§3.4) — never a
>    new hard gate. (Locked co-validate decision D from the overhaul: *every existing publish-schema failure
>    stays a hard Prevent; W2 only surfaces it earlier.*)
> 2. **Surface = a persistent status badge in the editor header** (beside the Test Mode button), visible on every
>    tab; click to expand a grouped Prevent/Warn panel. Reuses the existing `formatIssuePath` +
>    `PublishFailureModal` list idiom. The reactive `422` modal stays as the final backstop on the real Publish
>    click. Rejected: a drawer (hidden until opened, covers the editor — no ambient awareness) and an inline
>    Versions-tab panel (only visible on the one tab you're least likely to be on while authoring). A persistent
>    header status item also folds cleanly into Wave 4's three-pane inspector rail.

---

## 1. Context & problem

The admin template editor (`admin/assessments/templates/[id]/versions/[versionId]/edit`,
`TemplateEditorTabbed.tsx`) authors every instrument (SU-Full, LVA, QSP, Website Assessment, + new custom
templates). Audience: **ADMIN/STAFF only** (~3 internal experts).

Friction #3 from the competitive sweep (spec 19ac §1): **publish problems surface as a post-publish modal, not
before.** Today's publish path is already a correct hard gate, but the feedback is **reactive**:

- `TemplateVersionForPublishSchema` (`scoring.ts:560`) = `TemplateVersionForScoringSchema.superRefine(...)` with
  six checks: `checkRecommendationsPublish` (findings/band coverage), `checkDomainAssignment`,
  `checkPerDomainTierTiling`, `checkGlobalTierTiling` (Wave V), `checkSectionRefsResolve`, `checkShowIfIntegrity`
  (Wave W) — plus the base structural/scoring schema it wraps.
- The publish route (`.../versions/[versionId]/publish/route.ts:73`) parses the **persisted** version and returns
  `422 PUBLISH_VALIDATION_FAILED` with Zod `issues`; `PublishFailureModal.tsx` renders them via `formatIssuePath`.

So the author only learns what blocks publish **after** they save, click Publish, and hit the wall — and the
check runs against the saved version, not what's on screen. **Wave 2 shows the exact same gate live, in the
editor, while authoring**, so blockers are visible where they're introduced.

## 2. Where this sits in the wave plan

Wave 2 of the re-sequenced 5-wave overhaul (spec 19ac §2). Layout-independent (like Wave 1); kills friction #3.
**Migration principle (all waves): extract, don't fork.** W2 adds a header badge + one pure evaluation module to
the existing editor and touches no layout and no server code.

---

## 3. Wave 2 — Safe-to-Publish (this wave)

### 3.1 Goal
While editing a **draft** version, the author sees a **live readout of publish-readiness** — the exact issues the
publish route would return if this draft were saved and published (**Prevent**), plus a small advisory list of
likely-unfinished-template signals (**Warn**) — **before** clicking Publish. **Reuse, not rebuild:** the same
publish schema, the same display idiom, no second validator, no server change. **Writes nothing.**

### 3.2 User flow
1. A **status badge** in the editor header (beside "Test Mode", gated by a parallel
   `safeToPublishAvailable = !isPublished && safeToPublishEnabled`) shows live state:
   **"Ready to publish"** (Prevent = 0 **and clean**) · **"Ready after save"** (Prevent = 0 **and dirty** — C2,
   never plain "Ready" while version-affecting edits are unsaved) · **"N blockers"** / **"N blockers · M
   warnings"** (Prevent > 0) · **"M warnings"** (Prevent = 0, Warn > 0). Visible on every tab.
2. Clicking the badge expands a grouped panel: **✗ Prevent (blocks publish)** then **⚠ Warn (advisory)**, each
   issue rendered as `formatIssuePath(path)` + message — the same idiom as `PublishFailureModal`.
3. The readout evaluates the **live on-screen draft** (assembled via the Wave 1 `buildVersionScoringPayload`
   seam), recomputing on draft change (**debounced** on large instruments). It **soft-fails**: an assembly or
   schema error is shown as a Prevent-class "can't assemble — fix these" note, never a crash (mirrors the Wave 1
   Test Mode drawer's soft-fail `useMemo`).
4. **Save reconciliation (C2).** The badge evaluates what's on screen; the server publishes the **saved** version.
   So the badge NEVER reads plain "Ready to publish" while version-affecting dirty flags are set — it reads "Ready
   after save" / "Save draft to publish" instead; only a clean, Prevent-0 draft reads "Ready to publish." This
   makes the two legitimate divergences honest: **saved-passes / live-fails** (you just introduced a blocker —
   badge shows it though the saved version would still publish) and **saved-fails / live-passes** (you just fixed
   one — badge says "Ready after save"). The reactive `422` modal remains the authoritative final check on the
   actual Publish click — the badge is guidance, the server is the gate.
5. On an already-**published** (read-only) version the badge is **hidden** — nothing to publish (`!isPublished`,
   same guard Wave 1 uses for the Test Mode button).

### 3.3 Reuse — the exact publish gate, no second code path
This is the core discipline (mirrors Wave 1's `computeScoreResult`/`buildVersionScoringPayload` extraction):

- **Assemble the live draft via the SHARED `buildVersionScoringPayload`** (Wave 1 seam,
  `template-editor/build-version-payload.ts`) — the SAME helper Save Draft and Test Mode already call, with the
  editor's REAL dirty semantics. Returns `{ questions, sections, scoringConfig }` (+ `assignedKeys`) — exactly
  the three fields the publish schema parses. So "what the badge evaluates" == "what Save persists" == "what the
  publish route would validate", by construction.
- **Prevent = ONE shared pure helper both the route and the badge call (C1 — real parity, not tautology).**
  Extract `getPublishValidationIssues({ questions, sections, scoringConfig }) → ZodIssue[]` in `scoring.ts`
  (a thin wrapper over `TemplateVersionForPublishSchema.safeParse` — empty array = valid). The publish route is
  **refactored to call it** (behavior-preserving — it currently inlines the same `safeParse` + `issues` at
  `publish/route.ts:73-87`; the returned `422` shape is unchanged), and the badge calls it too. So Prevent is the
  literal same code the server runs — anti-drift by construction, not by a re-implemented check. This is the same
  extract-don't-fork move Wave 1 made for `computeScoreResult`. No new validator, no weakened gate.
- **Warn = new pure functions** (§3.4), computed defensively from the assembled payload — advisory only, never
  fed to the publish route.
- **One new pure client module** `template-editor/publish-readiness.ts`:
  `evaluatePublishReadiness(built) → { prevent: ReadinessIssue[], warn: ReadinessIssue[] }`.
  `prevent` = `getPublishValidationIssues(built)` mapped to `ReadinessIssue`; `warn` = the §3.4 checks, computed
  from the raw built payload **independently of whether Prevent is empty** (C4 — `safeParse` yields no data on any
  failure, so warnings must not depend on parse-success). Client-side, zero `db`/server imports (the whole scoring
  module is already verified pure — spec 19ac).
- **The reactive publish path stays behaviorally identical.** The `422` shape and `PublishFailureModal` are
  unchanged; the ONLY route edit is routing its validation through the shared `getPublishValidationIssues` helper
  (C1). W2 is otherwise purely additive: a live pre-check that mirrors the server gate by sharing its code.

### 3.4 The Warn tier (advisory — never blocks) — 2 structural warnings
Both are **confirmed to pass the publish schema today** (code-verified against `scoring.ts`), so surfacing them
never contradicts the real gate. They flag an unambiguous *authoring gap*, not an error:

1. **Empty section** — a section whose `stableKey` is referenced by **no** question's `sectionStableKey` (renders
   as an empty section header). Fires strictly on **zero questions assigned** (grill Q3) — NOT on a section whose
   questions are all show-if-gated (a legitimate Wave W conditional pattern; emptiness there is
   respondent-dependent, not an authoring gap). Warn `path`: `["sections", i]`. *Publish-legal:*
   `checkSectionRefsResolve` only validates question→section resolution, never the reverse (`scoring.ts:521-539`).
2. **Unassigned question** — a question with a blank/absent `sectionStableKey`, tolerated as the "Other" fallback
   bucket and rendered outside any section. Warn `path`: `["questions", i, "sectionStableKey"]`. *Publish-legal:*
   explicitly allowed — "keyless → tolerated (Other fallback), not a publish error" (`scoring.ts:530`).

**DROPPED — "no findings authored" (co-validate C3, code-verified).** Was proposed as a 3rd warning; its premise
was **false.** Reports render the recommendations/findings section **only when findings exist**
(`BrandedReport.tsx:707` `{hasRecommendations && …}`; `QualitativeReport.tsx:442` — flag-gated + empty→no section),
so there is no "empty recommendations section" to warn about. Findings are Wave-U flag-gated and honest-data by
design (templates legitimately ship empty), so the nudge would be speculative noise that dilutes badge trust. A
findings-intent nudge, if ever wanted, is a later `findingsEnabled`-gated addition — not W2.

**Explicitly NOT a Warn (stays Prevent):** partial slider band coverage — a slider carrying *some* bands that
leave a gap is a **hard publish failure** (`checkRecommendationsPublish`, `scoring.ts:304-318`), so it appears
under Prevent, not Warn.

**Warnings are computed from the raw built payload INDEPENDENT of Prevent (C4).** `safeParse` returns no parsed
data on ANY failure (including publish-only checks like tier-tiling), so warnings must NOT be gated on
Prevent-empty — a draft can have both blockers and warnings, and the "N blockers · M warnings" state must be
reachable. Warn functions read `built.questions`/`built.sections` directly with **defensive** `Array.isArray`
guards; only a field too malformed to read is skipped (Prevent will already carry that structural issue).

### 3.5 Decisions / edge cases
- **Prevent set is bounded — no NEW hard checks.** W2 surfaces the existing six checks + base schema and adds
  ZERO new blocking conditions (locked decision 1). Any new *hard* gate would be a separate wave with its own
  grill.
- **Base-schema failures are Prevent.** `TemplateVersionForPublishSchema` wraps the base object/runtime schema,
  so a structurally-malformed draft surfaces those Zod issues under Prevent too (`formatIssuePath` handles any
  path). This is correct: an unscorable draft is genuinely unpublishable.
- **Soft-fail, like Wave 1.** If `buildVersionScoringPayload` throws (`QuestionSerializationError` — inherited
  key/type-lock), the badge shows it as a Prevent-class note; it never rethrows into the editor.
- **Dirty vs saved.** The badge is guidance on the on-screen draft; the server validates the saved version on
  Publish. A "save to publish" affordance closes the gap (§3.2.4). We do NOT auto-save.
- **Debounce** recompute on large instruments (implementer tunes to instrument size; mirrors Wave 1).

### 3.6 Flag & kill
Ships behind a new default-OFF, **single-lever** flag `WAVE_ED2_SAFE_TO_PUBLISH_ENABLED` (continues the `ED`
series; new `template-editor` flag file `wave-ed2-flags.ts` mirroring `wave-ed1-flags.ts` — `isOn` +
`isSafeToPublishEnabled()`). The server page reads the flag and passes `safeToPublishEnabled` down to
`TemplateEditorTabbed` (the client can't read `process.env`), exactly as Wave 1 passes `testModeEnabled`. No
KILL/CANARY levers — nothing persists behind it (writes nothing), so kill = flag off (or revert — additive).
Merges dark so the §3.8 walk runs before Suzanne/Jeff see it.

### 3.7 Tests
- **Real parity via the shared helper (C1 — the no-second-path proof):** the publish route and
  `evaluatePublishReadiness` both call `getPublishValidationIssues`; a test freezes that the route's `422` issues
  for a persisted version equal `evaluatePublishReadiness(builtEquivalent).prevent` for a known publish failure
  (e.g. a non-tiling global tier — the Wave V gate), and `[]` for a clean draft. Because they share the literal
  helper, this locks the mirror against drift (not a same-schema tautology). Route refactor is
  behavior-preserving: the existing publish-route tests stay green.
- **Bidirectional dirty/persisted divergence (C2):** saved-passes / live-fails → badge shows the live blocker;
  saved-fails / live-passes → badge reads "Ready after save" (never plain "Ready" while dirty).
- **Warnings computed independently of Prevent (C4):** a draft that BOTH fails a publish-only check AND has an
  empty section → `prevent.length > 0` AND `warn.length > 0` (the "N blockers · M warnings" state is reachable).
- **Each Warn fires on its trigger and NOT otherwise, and is publish-legal:** empty section → Warn (draft still
  passes the publish schema); unassigned question → Warn (+ publish-legal). A fully-authored template → zero
  warnings.
- **Partial slider band coverage → Prevent, never Warn** (guards the §3.4 boundary).
- **Soft-fail:** an assembly/serialization error (`QuestionSerializationError`) → Prevent-class note, no throw
  into the editor.
- **Badge state mapping:** Prevent=0 & clean → "Ready to publish"; Prevent=0 & dirty → "Ready after save";
  Prevent>0 → "N blockers" (+ warnings appended); hidden on a published version.
- **No-write / no-server assertion:** `publish-readiness.ts` has zero `db`/server imports; W2 adds no endpoint;
  the only server edit is the behavior-preserving `getPublishValidationIssues` extraction in the publish route.

### 3.8 Verification
`CI=true npx next build --turbopack` green · targeted Jest on `publish-readiness.ts` + the parity test ·
adversarial review · a live walk (author a throwaway draft with a deliberate publish failure, confirm the badge
shows the identical blocker the `422` modal shows, fix it, watch it clear, confirm a Warn fires and does not block
a real publish) before any flag flip.

## 4. Non-goals
No schema change. No data migration. No new *hard* publish gate (Prevent set unchanged — §3.5). No change to the
publish route's **behavior**, its `422` shape, or `PublishFailureModal` — the only route edit is the
behavior-preserving extraction of its validation into the shared `getPublishValidationIssues` helper (C1), guarded
by the existing publish-route tests. **The Publish button is UNCHANGED — the badge is a passive readout, never a
client-side pre-block (grill Q1); the server 422 stays the authoritative gate.** No weakening of
immutable-key / published-version-freeze invariants. No auto-save. No layout change (that's Wave 4). No auto-fix /
quick-fix actions (surface only).

## 5. Resolved / open items
- ~~**Warn #3 ("no findings authored")**~~ — **DROPPED (co-validate C3, code-verified):** premise false (reports
  omit the empty findings section; findings flag-gated + honest-data). Warn set is now the 2 structural checks
  (§3.4). *(Supersedes the grill-Q2 "type-based predicate" resolution — the whole check is gone.)*
- ~~**Parity proof**~~ — **STRENGTHENED (co-validate C1):** shared `getPublishValidationIssues` helper called by
  both the route and the badge — real anti-drift, not a same-schema tautology (§3.3/§3.7).
- ~~**Gate the Publish button?**~~ — **RESOLVED (grill Q1):** no — passive readout only; Publish button unchanged
  (§4).
- ~~**Warn set size**~~ — **RESOLVED (grill Q3 + co-validate C3):** 2 structural warnings; empty-section fires
  strictly on zero questions. Rejected candidates: unused scoring domain (publish-legal but niche), "no findings
  authored" (false premise — C3), "only 1 question" / "no help text" (noise).
- **Badge visual language:** exact copy/severity styling (counts, color) — small, decided at build with the
  existing status-pill / destructive tokens; not load-bearing.
- **Debounce interval** — implementer-tuned (recompute on structural draft change, memoized like Test Mode).

## 6. References
- Editor shell (badge host, already owns publish state + `PublishFailureModal`):
  `src/src/components/admin/TemplateEditorTabbed.tsx` (header `:1073`, Test Mode button `:1099`,
  `testModeAvailable` `:715`, `buildVersionScoringPayload` call in `handleSaveDraft` `:749`)
- Publish gate (reuse verbatim): `src/src/lib/assessments/scoring.ts` (`TemplateVersionForPublishSchema` `:560`,
  six checks `:562-567`; `checkRecommendationsPublish` `:271`, `checkDomainAssignment` `:471`,
  `checkSectionRefsResolve` `:521`) — **+ NEW `getPublishValidationIssues` helper (C1)** to be added here, called
  by both the route and the badge
- Publish route (refactored to call the shared helper — behavior-preserving): `.../versions/[versionId]/publish/route.ts:73-87`
- Report render guards (why Warn #3 was dropped — C3): `src/src/components/assessments/BrandedReport.tsx:707`
  (`{hasRecommendations && …}`), `.../QualitativeReport.tsx:442` (flag-gated + empty→no section)
- Display idiom (reuse): `src/src/components/admin/PublishFailureModal.tsx` (`formatIssuePath`)
- Wave 1 seam (reuse): `src/src/components/admin/template-editor/build-version-payload.ts`;
  flag pattern `src/src/lib/assessments/wave-ed1-flags.ts` → new `wave-ed2-flags.ts`
- Display dispatch (Warn #3 predicate): `src/src/lib/assessments/report-config.ts` (`reportConfigFor` `:65`)
- New module (this wave): `src/src/components/admin/template-editor/publish-readiness.ts`
