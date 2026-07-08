# Spec 19z — Wave W leftovers: editor ghost-UI cleanup

> **Status:** BUILT — greenlit + implemented + reviewed; ready to merge (= launch, flagless).
> **Wave:** Wave W leftovers (cleanup). Next spec letter after 19y.
> **Flag:** none — presentation-only dead-UI removal. **Kill = revert-commit** (Wave R precedent).
> **Migration/schema/ADR:** none.
> **Predecessors:** Wave W (spec 19w) removed the "Conditional Logic v1.5" ghost tab + the
> Conditional Sections ghost card; Wave S (spec 19s) shipped the REAL peer-averages admin panel
> (`PeerBenchmarksPanel`, `AssessmentBenchmark` rows). This wave removes the last fossils those
> two waves left behind.

## 1. Problem

Two Wave-era decisions left dead/misleading UI in the **admin assessment template editor**:

1. **Peer Benchmarks "ghost" card** in the Scoring & Tiers tab
   (`src/src/components/admin/template-editor/ScoringTiersTab.tsx`, "Section 3 — Deferred logic
   placeholder"). It renders a **disabled mini-table of FAKE hardcoded benchmark values**
   (`Q3_2: 2.4`, `Q5_1: 1.8`, `Q7_3: 2.7`) with dead "Remove" / "+ Add Benchmark" buttons, plus a
   sibling **"Why is this section deferred?"** explanation card. The card's own copy admits Wave S
   already shipped the real panel — so it now shows admins fabricated numbers for a feature that
   exists for real elsewhere. The former Conditional Sections ghost that once shared this grid was
   already removed in Wave W, leaving a two-column grid with a single dead child.

2. **"Preview as Respondent" ghost button** in the editor header action row
   (`src/src/components/admin/TemplateEditorTabbed.tsx`), `disabled` with `title="Coming in v1.5"`.
   It does nothing and the "v1.5" framing is long stale.

3. **Stale docstrings.** `TemplateEditorTabbed.tsx`'s header comment still describes a **7-tab**
   layout including "5. Conditional Logic — disabled, v1.5 badge" (the tab has been gone since
   Wave W; the real layout is 5 panel tabs + an Access link). `ScoringTiersTab.tsx`'s header still
   lists "Deferred Conditional Sections + Peer Benchmarks ghost cards" as a section.

None of this is user-data or behavior — it is presentation fossils that mislead admins and future
maintainers.

## 2. Scope (what changes)

**In scope — remove:**
- `ScoringTiersTab.tsx` "Section 3 — Deferred logic placeholder" **entirely**: the
  `deferred-peer-benchmarks` ghost card, its fake benchmark mini-table, the disabled buttons, AND
  the sibling "Why is this section deferred?" explanation `<section>`. After removal the tab ends
  cleanly after the per-domain tiers section — no empty grid wrapper left behind.
- `TemplateEditorTabbed.tsx` disabled **"Preview as Respondent"** button (and its `title="Coming in
  v1.5"`).
- **Docstring corrections** in both files to match the real layout: `TemplateEditorTabbed.tsx`
  header → 5 panel tabs (no "Conditional Logic"); `ScoringTiersTab.tsx` header → drop BOTH its
  section-list item 4 ("Deferred Conditional Sections + Peer Benchmarks ghost cards") AND item 5
  ("Explanation card"), leaving Scoring Configuration + Tiers table + Per-domain tiers only.

**In scope — wireframe reconciliation (grill Q1/Q2):**
- Add a **"superseded" banner** to the top of all three editor wireframes —
  `src/public/wireframes-phase2/admin/{16-admin-template-editor-meta,17-admin-template-editor-questions,18-admin-template-editor-logic}.html`
  — recording that their "deferred logic engine" surfaces are overtaken by shipped waves:
  Peer Benchmarks → **Wave S** live panel; Conditional Logic / `conditionalSections` → **Wave U**
  findings (ADR-0021) + **Wave W** survey show-if; "Preview as Respondent" → not built. The banner
  surfaces the drift (standing rule: wireframes are the spec; never silently extend) without a
  surgical HTML rewrite of a historical Phase-2 reference the app does not render. All three share
  the stale tab-bar + header action row, so the banner goes on all three, not just WF18.

**Explicitly NOT in scope:**
- **LVA show-if migration — DESCOPED** (see D2). `applyLvaFilter` in
  `src/src/lib/assessments/form-visibility.ts` and the LVA `REPORT_FILTERS` entry are **untouched**.
- **QuestionsTab v1.5 fossils** (the flag-OFF-only legacy accordions / informational cards). Dead in
  prod (the Wave T flag is live) but removing them means touching Wave T's flag gating — a separate,
  Wave-T-adjacent cleanup, deferred.
- The genuine `PeerBenchmarksPanel` (Wave S) — that is the live feature, not a fossil.

## 3. Decision log

### D1 — Cleanup only; presentation-only; flagless
Pure dead-UI deletion. No feature flag (nothing to gate — there is no capability being added or
removed, only fossil markup being deleted). No schema, no migration, no ADR. Kill switch = revert
the commit (identical posture to Wave R, which was also flagless presentation-only).

### D2 — LVA `applyLvaFilter` KEPT as intentional legacy (migration descoped)
The candidate menu paired the ghost cleanup with "migrate LVA's hardcoded show-if to authored
`showIf`." Investigation showed the mapping is byte-exact (each `S5_why_<K>` follow-up suffix equals
an `S4_biggest_obstacles` option key; S5 questions are optional TEXT, so authored `showIf` would
reproduce the branch and pass the Wave W publish gate). **But deleting the branch is not clean:**

1. **Version-pinning.** `applyLvaFilter` keys on `templateAlias` and runs for every LVA campaign
   regardless of pinned version. Live LVA versions (v1/v2/v3) carry no authored `showIf`. Deleting
   the branch makes any campaign on a non-backfilled version show all 16 obstacle follow-ups in the
   survey. (Reports stay correct — `REPORT_FILTERS` is alias-keyed, not version-keyed — so it is a
   survey-UX regression, not data corruption, but it is real.)
2. **Storage behavior flips.** Today LVA hidden S5 answers are **stored** (the server prune is
   generic-`showIf`-only and skips the LVA branch by Wave W design D3) then suppressed at report
   time. Authoring `showIf` makes `pruneHiddenAnswers` start **dropping** them pre-persistence for
   new submissions — cleaner, but a behavior change to a live instrument.
3. A true deletion therefore requires **backfilling `showIf` onto already-published LVA version
   rows** (against the version-immutability convention) plus a prod launch walk — a real data
   operation.

The branch it would replace is 18 tested lines Wave W explicitly proved safe (intersection
semantics; the generic pass can never resurrect an LVA-hidden question). **Cost/benefit does not
favor migrating now.** Rationale captured in three discoverable places (grill Q3, no ADR — see D7):
a **code comment on `applyLvaFilter`** (the exact spot a future dev stands when tempted to migrate),
this spec §D2, and the `project_next_wave` ledger line "LVA-migrate-to-authored-showIf" as an
explicit deferred follow-on.

### D3 — "Preview as Respondent" removed now, not preserved as a placeholder
The disabled button maps loosely to the future Wave U §3 "test-a-value preview" candidate, but it
does nothing today and its "Coming in v1.5" copy is misleading. Removing a dead no-op now creates no
churn: when/if Wave U §3 ships a real preview, it adds a working button then. A live cleanup wave
should not leave misleading disabled affordances standing.

### D4 — Test strategy: flip "renders ghost" → "ghost gone" (THREE assertions, two files)
Existing tests assert the fossils render; each flips to assert absence, mirroring how Wave W
already handled the Conditional Sections ghost (`ScoringTiersTab.test.tsx` already asserts
`queryByTestId("deferred-conditional-sections")` is null at ~L269). **Co-validate correction:**
deleting Section 3 removes the ghost card AND deleting Section 4 removes the explanation card — the
`ScoringTiersTab` suite therefore has **two** assertions to change, not one (the explanation-card
test uses `getByText`, which THROWS on absence, so leaving it would turn the suite red — this is the
one real defect the fallback review panel caught):
- `src/src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx`:
  - the "Peer Benchmarks ghost card renders with v1.5 badge…" test (~L275) → assert
    `queryByTestId("deferred-peer-benchmarks")` is null.
  - the `describe("Explanation card")` test "renders the explanation card title verbatim from
    WF18" (~L286-287, matches `/Why is this section deferred\? \(Codex co-validate, May 12 2026\)/`)
    → remove it, or flip to assert `queryByText(/Why is this section deferred/)` is null.
- `src/src/__tests__/components/admin/TemplateEditorTabbed.test.tsx` — the "Preview as Respondent
  button is disabled with v1.5 tooltip" test (~L266) → assert no button named
  `/Preview as Respondent/` is present.
No new modules ⇒ no new module test files; verified by the three flipped assertions + the full
existing suites for those two components staying green. **Jest-verify the changed count** (standing
rule) — do not claim green from memory.

### D5 — QuestionsTab v1.5 fossils out of scope
See §2. They are dead in prod but flag-gated (Wave T), so their removal is a Wave-T-adjacent change
with its own risk surface. Deferred; logged as a known remaining fossil.

### D6 — Wireframe drift surfaced via banner on all three editor wireframes (grill Q1/Q2)
`ScoringTiersTab.tsx` cites WF18 as its fidelity source, and WF16/17/18 share the tab bar + header
action row — so the shipped editor (Conditional Logic tab gone since Wave W; ghost card + Preview
button gone this wave) has drifted from all three. Standing rule: wireframes are the spec; surface
drift, never silently extend. Resolution: a top-of-file **superseded banner** on all three (not a
surgical rewrite of a historical reference the app never renders, and not a WF18-only banner that
would leave 16/17 contradicting the editor). Alternatives weighed and rejected: (b) surgical HTML
deletion — fiddly, own drift risk, no reader value for a frozen artifact; (c) WF18-only + README
note — relies on the reader finding the README, and the Preview button is shared chrome on all
three.

### D7 — No ADR for the LVA descope (grill Q3)
Ran the three-criteria ADR test: (1) hard to reverse — NO, descoping locks nothing in; any later
wave can migrate; (2) surprising without context — yes; (3) real trade-off — yes. Criterion 1 fails
⇒ skip the ADR. Rationale is instead captured per D2 (code comment + this spec + ledger), which is
proportionate and puts the "why" where a future maintainer will actually stand.

## 4. Files touched

| File | Change |
|------|--------|
| `src/src/components/admin/template-editor/ScoringTiersTab.tsx` | Delete "Section 3" ghost card + "Section 4" explanation card; fix header docstring (drop ghost-cards item) |
| `src/src/components/admin/TemplateEditorTabbed.tsx` | Delete "Preview as Respondent" disabled button; fix header docstring (5-tab reality, drop "Conditional Logic") |
| `src/src/lib/assessments/form-visibility.ts` | **Comment-only** — note on `applyLvaFilter` that migration to authored `showIf` was evaluated and descoped (D2 rationale) |
| `src/src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx` | Flip TWO tests to assert-absent: peer-benchmarks-ghost (~L275) + explanation-card (~L287) — see D4 |
| `src/src/__tests__/components/admin/TemplateEditorTabbed.test.tsx` | Flip preview-button test to assert-absent |
| `src/public/wireframes-phase2/admin/16-admin-template-editor-meta.html` | Add superseded banner (D6) |
| `src/public/wireframes-phase2/admin/17-admin-template-editor-questions.html` | Add superseded banner (D6) |
| `src/public/wireframes-phase2/admin/18-admin-template-editor-logic.html` | Add superseded banner (D6) |

## 5. Verification

- `CI=true npx next build --turbopack` green.
- Jest on the two affected component suites (`ScoringTiersTab`, `TemplateEditorTabbed`) + the
  editor page — all green; the two flipped tests assert the fossils are gone.
- Full sweep parity: no new failures vs the known pre-existing set (jest-verify the count; never
  from memory).
- ESLint clean on changed files.
- Manual/prod smoke: open a template's Scoring & Tiers tab → no Peer Benchmarks ghost card, no fake
  benchmark numbers; editor header → no "Preview as Respondent" button; real Wave S peer-averages
  panel (on render-enabled LVA templates) unaffected.

## 6. Rollout

Flagless. Merge to `main` = launch (Vercel auto-deploy). Kill = revert-commit. SoT on push
(CLAUDE.md anchor + `plans/CHANGELOG.md`); Notion task; standard gated-wave adversarial review
before merge.

**SoT budget (co-validate minor):** `changelog-freshness.test.ts` asserts (a) CLAUDE.md's
`LAST_UPDATED_ISO/SLUG` match the topmost `CHANGELOG.md` `ENTRY_ISO/SLUG`, and (b) CLAUDE.md stays
**< 8000 words** — it is already at ~7102, leaving only ~900 words of headroom against a Project
Context blob that appends a parenthetical every wave. On push: keep the new prose to **one line**
for `wave-w-leftovers`, and if it risks crossing the budget, demote an older Project-Context
parenthetical into `CHANGELOG.md`. Treat the word budget as a deliberate pre-push check, not an
incidental catch.

## 7. Co-validate changelog

`/co-validate` run 2026-07-08. **Codex was unavailable** (env: `~/.codex/config.toml` had an
invalid `service_tier = "priority"`, and the auth token was stale — both need an interactive
session). Fallback per the skill: an independent **3-lens staff-engineer review panel** (Workflow;
`model-chat-skill` not installed) — lenses = removal-correctness / lva-descope /
process-architecture — each verifying claims against the actual code.

**Accepted:**
- **[significant] test-coverage — all three lenses converged.** Deleting Section 4 (the
  explanation card) breaks a SECOND `ScoringTiersTab` test (`describe("Explanation card")`, ~L287,
  `getByText(/Why is this section deferred.../)` which THROWS on absence) that the spec never listed
  → the "suites stay green" claim was false as written. Fixed: D4 + §4 table now enumerate THREE
  assertion flips across two files, jest-verified.
- **[minor] docstring.** `ScoringTiersTab` header lists both item 4 (ghost cards) AND item 5
  (explanation card); both must drop. Fixed in §2.
- **[minor] SoT word budget.** `changelog-freshness.test.ts` enforces CLAUDE.md < 8000 words
  (currently ~7102). Fixed: §6 now calls out the budget as a deliberate pre-push check.

**Overridden:** none — every finding verified against code and accepted.

**My own independent review (pre-panel, bias-free):** confirmed JSX balance is clean (per-domain
block is a self-contained `{domains.length > 0 && (…)}` conditional), no snapshot/e2e references —
but I MISSED the explanation-card test (my grep never searched its text). The panel's catch is the
concrete value-add of the external pass.

## 8. Adversarial review outcome

Pre-merge adversarial review 2026-07-08 (2-lens Workflow, each verifying against the repo):
- **deletion-correctness → ship, zero findings.** JSX balanced after removing Section 3+4; no live
  orphans of the removed markup; `wf-page-action-row` layout fine; the 3 wireframe banners are valid
  HTML; no now-unused imports.
- **regression-fidelity → ship.** Every 19z claim verified against code; the genuine Wave S
  `PeerBenchmarksPanel` (mounted on the edit page) untouched; `form-visibility.ts` change is
  comment-only; the 3 flipped assertions are meaningful (target text that existed only in the
  deleted markup). **One LOW, pre-existing finding** (not introduced here): the tab-nav test title
  said "all 7 tabs" while asserting 6 present + Conditional Logic absent (stale since Wave W).
  **Fixed opportunistically** (same file, same "correct stale editor-tab references" theme,
  title-only): renamed to "all 6 tabs …". No other action.

**Verification (all green):** ESLint clean; `CI=true npx next build --turbopack` exit 0; the two
touched suites 36/36 (13 + 23); full sweep 28 failures / 7 PRE-EXISTING suites (Wave Y baseline
exactly, zero Wave-W-leftover failures; the 8th full-run failure was a load-induced 5000ms flake
that passed on `--onlyFailures` re-run).
