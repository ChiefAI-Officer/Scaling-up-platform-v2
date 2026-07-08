# Scaling Up Platform v2 - Development Instructions

> **IMPORTANT: Keep this file current.** After completing any sprint, feature, or schema change,
> update the relevant sections below. This is the single source of truth for AI assistants
> working on this codebase.

## Project Context

**Scaling Up Platform v2** is a workshop management application replacing Kajabi for Scaling Up coaches.
Coaches request workshops through a self-service portal; admin/staff review, approve, and manage
the full workshop lifecycle from request through post-event follow-up.

| Key | Value |
|-----|-------|
| **Source Path** | `D:\The CTO Project\Scaling Up Platform v2\src` |
| **Repository** | `github.com/ChiefAI-Officer/Scaling-up-platform-v2` (deploys from `main`) |
| **Live URL** | `scaling-up-platform-v2.vercel.app` |
| **Client** | Jeff Verdun, CIO - Scaling Up |
| **Operations** | Suzanne (handles manual approvals) |
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-07-08 LAST_UPDATED_SLUG:templates-list-view-edit-dedup --> July 8, 2026 — **Templates-list "View" removed (View == Edit de-dup)** — the admin templates-list row had the template name + "View" + "Edit" all linking to the same editor URL (`/admin/assessments/templates/{id}` redirects into the editor — user-flagged bad UI); no read-only view page exists, so the honest fix is de-duplication: **dropped the redundant "View" link** in `AssessmentTemplatesList.tsx` — the NAME now opens the editor and "Edit" stays as the explicit verb; Access/Disable/Delete untouched. Presentation-only (kill = revert-commit). **Roadmap target #2 of 3 (Jul-8 report) DONE**; next = a real read-only View page + the 3 "coming soon" admin pages (#3). 4 dedup tests + the stale Wave Q View assertion flipped; suites green (11), build green. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`templates-list-view-edit-dedup`). _(Prior: July 8 — **Wave U3 LAUNCHED — findings/recommendations in the results email LIVE on production** (`WAVE_U3_EMAIL_FINDINGS_ENABLED=1` set on Vercel Production + redeploy, deploy `j7f6gd7hv`; the dark build from PR #162 `76b5cb18`, spec 19aa): the FROZEN `result.findings` snapshot now renders into the results email for BOTH recipients (taker + referring coach) and BOTH report kinds — the scored anatomy (all kinds incl. SLIDER bands, D5) and the qualitative twin (findings BEFORE the answers so recs survive the ~90 KB byte budget), read via `parseResolvedFindings` (never re-resolved — D3). Launch-verified: the 4 U3 suites (37 tests) green on the deployed commit; a shipped-code render (`buildReportEmailHtml` at HEAD, prod flag value) confirmed the "Your recommendations" block renders for scored + qualitative with all three rule kinds (slider/number/multi-choice) AND flag-OFF is byte-identical (snapshot vs none) for both — so real templates with no authored findings send an UNCHANGED email (honest-data); prod alias HTTP 200; no prod-DB test data created (render-equivalence — a live-inbox send is available on request). Kill = zero the flag (published snapshots persist inert); the editor test-a-value PREVIEW already shipped LIVE with #162. **Roadmap target #1 of 3 (Jul-8 report) DONE**; next = templates-list View==Edit fix + the 3 "coming soon" admin pages. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-u3-launched`).)_ _(Prior: July 8 — **Codebase handoff package for Jeff COMMITTED** ([HANDOFF-Jeff-2026-07-08.md](HANDOFF-Jeff-2026-07-08.md) at repo root — clone/run instructions, reading order, J→Y wave ledger, the prod feature-flag table (every wave flag ON except `WAVE_U3_EMAIL_FINDINGS_ENABLED` — dark pending Jeff's sample review), the corrected waiting-on-Jeff list, practical notes) **+ full working-tree sweep pushed to `main`** — a clone is now the complete project state (progress reports Jul-1→8, ~80 launch-walk evidence artifacts, `deliverables/`, spec-18 assessment, audit-remediation plan, sprint excalidraw, `src/PLAN.md`, `wave-x-walk.ts`; `.gitignore` now excludes local agent/tooling session state). **Docs/assets only — NO app code change; prod behavior identical.** Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`handoff-jeff-jul8`).)_ _(Prior: July 8 — **Progress report Jul-8 SENT to Jeff** (Slack + Loom `loom.com/share/ac4e9c76c7954777914008ccf021c928`; `Scaling-Up-Progress-Update-2026-07-08.html/.pdf` at repo root): the post-Wave-X window — Wave Y (import observability) · Wave W-cleanup · Wave U3 (recommendations in the results email, staged; editor test-a-value preview live) · sections-sortOrder fix — with two REAL sample findings-emails (rendered from shipped code) + a **roadmap of 3 committed targets**: (1) flip recommendations-in-email after Jeff reviews a sample; (2) build the three "coming soon" admin pages that **404 today** (Organizations / Campaigns / Public Quizzes) per the Phase-2 wireframes; (3) fix the templates-list **View == Edit** bug. **LVA-peers correction:** "LVA peer numbers" was a PHANTOM waiting-on-Jeff item — Jeff's actual ask is **SU-Full industry benchmarking** (universal-vs-report-specific decision), NOT LVA peers; our own LVA fidelity audit says the source has no peers ("ours correctly has none"). Wave S built an empty/inert LVA peer panel; the "waiting on Jeff: LVA peer numbers" line is **DROPPED**. Do NOT rebuild/re-send the report. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`progress-report-jul8-sent`).)_ _(Prior: July 8 — **Wave U3 BUILT — findings in the results email (DARK) + editor test-a-value preview (LIVE)** (spec 19aa; extends ADR-0021; no ADR/schema/migration) — the two ready Wave U §3 leftovers. **(1) Results-email findings** — a findings block in `buildReportEmailHtml` for BOTH the scored anatomy (ALL kinds **incl. SLIDER bands** — the email has no legacy per-row slider path, so excluding them like the on-screen scored report would gut recommendations for slider-heavy instruments like SU-Full; deliberate D5 divergence) and the qualitative twin (reuses the shared `buildFindingsSection`, rendered **BEFORE** the answers so recs survive the ~90 KB byte budget), reading the **FROZEN** `result.findings` snapshot via `parseResolvedFindings` (never re-resolves — the D3 read-path rule; reader-audit guard green). Ships **DARK** behind a NEW default-OFF flag `WAVE_U3_EMAIL_FINDINGS_ENABLED` (its own flag because the Wave U flag is already LIVE — reusing it would push findings into real emails on deploy); both recipients (taker + referring coach, D4); **flag-OFF byte-identical** (adjacent-concat injection + a flag-OFF byte-identity test; Wave S peers guard stays green). **(2) Editor test-a-value preview** — a preview inside the (already Wave-U-flag-gated) `FindingsPanel` using the REAL `QuestionInput` widget + the pure `resolveFindings`, computed from a NEW SHARED `buildFindingRecommendations` helper now used by BOTH the preview AND the save path (`buildQuestionsPayload`) — the **no-drift** guarantee (what the preview says fires == what a save emits + a submission resolves); LIVE on merge (authoring aid — no send/prod-data effect). 37 new tests (jest-verified across 4 suites), sweep **5,600 pass** (7 pre-existing failing suites only, zero new), build green; 2-lens adversarial review **0 confirmed defects** (1 LOW edge — findings dropped in the qualitative empty-answer-body fallback — FIXED + test-locked). **Group-report/cohort findings DEFERRED** (D1 — undefined aggregation semantic; its own wave, likely a Jeff call). Kill: email = zero the flag (frozen snapshots persist inert); preview/helper = revert-commit. **Launch (email flag flip after a walk) PENDING — separate authorization.** Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-u3-built`).)_ _(Prior: July 8 — **Wave W leftovers LAUNCHED: editor ghost-UI cleanup live on production** — flagless, presentation-only (kill = revert-commit; spec 19z; no ADR/schema/migration). Removed the dead "Peer Benchmarks" ghost card (fake `Q3_2/Q5_1/Q7_3` values) + its explanation card from the Scoring & Tiers tab (superseded by the live Wave S peer panel), the disabled "Preview as Respondent" v1.5 button, and stale editor docstrings; **LVA `applyLvaFilter` KEPT** — migration descoped (D2: version-pinning + storage-flip risk not worth 18 tested lines; code comment + ledger); 3 Phase-2 editor wireframes stamped SUPERSEDED. /co-validate (Codex env-down → 3-lens Workflow fallback caught a missed 2nd test flip — fixed) + 2-lens adversarial review (ship). 3 assertions flipped to assert-absent; touched suites 36/36; full sweep 28 fails / 7 PRE-EXISTING suites (zero new); build green. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-w-leftovers-launched`).)_ _(Prior: July 7 — **Wave Y LAUNCHED: import observability panel + preview/refusal signals LIVE on production** — merged to main (PR #159, squash `9d30845c`); the last buildable P8 slice, live behind **no flag** (signal writes UNCONDITIONAL + fail-soft per the Wave Q rule; the panel is a read-only admin view). Surfaces the Wave V import-alerting signals in-app on `admin/assessments/observability` (the alert cron's ACTUAL checkpoint decisions + cron health) AND closes the confirmed gaps where the PREVIEW path + route-level 4xx REFUSALS persisted nothing — via a NEW `assessment_import_activity` entityType (Wave V cron provably untouched; `alert-signals.ts` unmodified) + a shared `refuse()` helper across 7 pre-commit gates in BOTH import routes. Spec 19y; **no ADR, no migration**. 38 new tests, sweep 5,563 pass (7 pre-existing suites, none Wave Y); /co-validate (6 findings; C6 overridden) + 5-lens adversarial review (4 findings — 1 code bug + 3 coverage — ALL fixed). Kill = revert-commit; **live now (no flag)** — ships EMPTY (panel blank until an import occurs). Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-y-launched`).)_ _(Prior: July 7 — **Wave X LAUNCHED: LVA + Rockefeller historical import LIVE on production** (`WAVE_X_ESPERTO_LVA_ROCK_IMPORT_ENABLED=1` + redeploy) — the P1 close-out; both crosswalks locked + walk-verified on the prod path (agent-run D4 Esperto verification, all bindings exact); ADR-0022; SU-Full unaffected. **P1 CLOSED — every Jeff feature phase live.** Kill = unset the flag. [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-x-launched`).)_ _(Prior: July 6 — **Sections sortOrder stamp** — editor-added sections were unpublishable (serializer never emitted `sortOrder`; reorders silently didn't persist render order) — fixed with a positional stamp in `buildSectionsPayload`'s dirty path; prod scan clean, preventive only ([plans/CHANGELOG.md](plans/CHANGELOG.md) `sections-sortorder-fix`).)_ _(Prior: July 6 — **Progress report Jul-6 SENT to Jeff** (`Scaling-Up-Progress-Update-2026-07-06.html/.pdf` at repo root + Slack + Loom `loom.com/share/be955b0048f24b3fb532618a862cb285`): the consolidated SIX-wave update — R (#8/#4/#9) · S (#12/#13) · T (#10) · U (#11) · V (P8 hardening) · W (conditionals) — 18 embedded screenshots, every claim visual; roadmap stamped ✓ on every phase except the Jeff-blocked Rockefeller+LVA import; asks re-sent (LVA peer numbers first — the panel is live). **Do NOT rebuild or re-send; the next report covers only post-Wave-W work.** Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`progress-report-jul6-sent`).)_ _(Prior: July 6, earlier — **Wave W LAUNCHED — conditional (show-if) question authoring live on production** (PR #148 `207686a` merged + same-session launch walk; `WAVE_W_CONDITIONAL_AUTHORING_ENABLED=1` live; spec 19w; no new ADR): the editor's fossil "Conditional Logic v1.5" ghost tab becomes real — as SURVEY show-if, not the superseded report-sections concept (the tab's "runtime ships in v1" copy was FALSE — no such runtime ever existed; the report half was superseded by Wave U findings; the ghost tab is REMOVED). Any question can now carry `showIf {questionKey, optionKey}` (all 4 types, zero migration — the `recommendations[]` substrate): **flagless engine** — publish gate `checkShowIfIntegrity` (gate exists/MULTI_CHOICE/strictly-earlier in canonical render order via the shared `canonicalQuestionOrderIndex`/real option/no chains/never required), generic evaluator in `form-visibility.ts` as a strict pipeline AFTER the untouched LVA branch (intersection — no resurrection), `pruneHiddenAnswers` in BOTH submit routes before every side effect (generic rules only — LVA storage byte-identical; tamper-proven live), and D7 page suppression (a section suppressed ONLY when every authored question in it carries showIf and all are hidden — attribution by construction, the one adversarial-review-found fix); **flag-gated editor panel** — per-question "Show only when…" (Findings-panel idiom) with two-way Required interlock, dangling-rule warning, and dependent confirm-drop on gate delete/option remove/retype; reports/findings/emails needed ZERO code (hidden ⇒ unanswered ⇒ omitted; resolveFindings skips unanswered — test-asserted). Launch walk proved E2E on prod DB: authored 3 rules via the LIVE panel (interlock + no-gates hint rendered), publish BLOCKED on a dependent dragged before its gate (routed modal) → fixed → published, survey opened at "Section 1 of 1" (conditional page suppressed) → ticking the option revealed the question AND the page, un-ticking pruned the typed answer, frozen submission = exactly the visible answers, report answered-only, tamper POST pruned server-side, Duplicate carried rules byte-exact; artifacts quarantined §5.5 (smoke 0/0); prod smokes green (real LVA report unchanged; panel live on a real draft). 95 new tests (jest-verified per-suite), sweep 5,449 pass (7 pre-existing suites only), build green. Walk-found PRE-EXISTING gap (ledgered): editor-added sections persist without `sortOrder` → unpublishable until reordered (create-form path stamps it; one-line serializer fix, next editor wave). Kill: panel = zero the flag (published rules keep rendering — flags gate capability never persisted data); engine = revert-commit. **Ships EMPTY (honest-data) — Jeff authors conditions in the editor, publishes, new campaigns honor them: the LVA-style "only explain what you picked" pattern on every instrument.** Jeff-blocked: P1 imports, #2.3, #15/#16/#19, LVA peer numbers. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-w-launched`).)_ _(Prior: July 6, earlier — **Wave V LAUNCHED — P8 hardening pass live on production** (PR #146 `e8ccd0d` merged + same-session launch walk; `WAVE_V_IMPORT_ALERTING_ENABLED=1` live; spec 19v; no new ADR; direction: user chose P8 hardening over conditional authoring — conditionals = Wave W): **V-1 global tier-domain publish gate** (flagless, kill=revert) — closes the Wave U walk-found gap (non-tiling global tiers published fine then 400'd every submit); `computeGlobalTierDomain` shared VERBATIM by scoreSubmission step 2 + the new publish check (publish-pass ⇒ step-2-pass property); prod preflight scan of ALL 19 versions: only the quarantined Wave U walk v1 fails (the version that found the gap), 18 real versions CLEAN · **V-2 in-app import alerting** (flag live) — runbook 18o §7 A/B/C as unconditional AuditLog signal rows from both import routes (console markers byte-identical; NEW `unexpected-error` code) + Inngest cron `*/10` with a PERSISTED CURSOR checkpoint row written BEFORE send (late ticks/deploy pauses can't drop a span; retries can't double-email — Codex C1, user re-confirmed over the originally-grilled stateless window); ONE consolidated PII-free email to ADMIN_EMAIL (REQUIRED — no silent fallback); zero migration; condition D stays log-drain-only (runbook §7 Wave V addendum) · **V-3 "Imported from Esperto (historical)" badge** (flagless) — `importManifest != null` → boolean-only `isImported` through all three loaders (manifest payload never reaches a client model); renders on scored + qualitative respondent covers, the group-report cover, and the CampaignDetail header · **V-4 report read-path txn budget** (flagless) — `{maxWait:10s, timeout:15s}` on the two report transactions (Prisma 5s default tripped P2028 on Neon cold starts; H14 auth-in-txn kept — Codex C6 overridden). Launch walk proved E2E on prod DB: publish BLOCKED on the walk template with the routed modal message → fixed → published → submit succeeded; badge live on all three surfaces (incl. a walk LVA campaign for the alias-allowlisted group report); V-2 sweep ran twice against prod (condition A fired, checkpoint-before-send, email to the USER'S OWN inbox — never the real admin's; local SMTP = mock by design, prod creds verified present); artifacts quarantined §5.5 order (smoke 0/0); prod smokes green (real reports render under the new budget, NO badge on real data). 63 new tests (jest-verified per-suite), sweep 5,355 pass (7 pre-existing failing suites only), build INLINE again (co-validate subagent died on session limits — Codex called DIRECTLY from the main loop; the mandatory review ran). Kill: V-2 = zero the flag (rows persist inert); V-1/V-3/V-4 = revert-commit. **Hand-off: import failures now email admins within ~10 min; non-tiling drafts can no longer publish; imported campaigns are visibly labeled.** P8 still open: log-drain wiring + §7-D (vendor decision), org-canary page-gate, alert dashboard panel, preview-path signals. Next natural build = **Wave W conditional/show-if authoring**; Jeff-blocked: P1 imports, #2.3, #15/#16/#19, LVA peer numbers. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-v-launched`).)_ _(Prior: July 6, earlier — **Wave U LAUNCHED — findings logic live on production** (Jeff #11; PR #139 `d50b576` merged dark + same-session launch walk; launch-found fix PR #140 `8fd7975`; `WAVE_U_FINDINGS_ENABLED=1` live; **ADR-0021**): answer-driven report recommendations for ALL rule-bearing question types — per-type rules on `recommendations[]` (the question TYPE discriminates: SLIDER/NUMBER bands incl. slider full-tiling kept strict, MULTI_CHOICE per-option texts, TEXT none; zero migration — SU-Full's 305 live bands validate unchanged), resolved ONCE at scoring time by the pure `resolveFindings` and FROZEN as `result.findings` on every submission (unconditional write — flags gate capability, never data correctness; issued reports can never drift; slider row-recs kept for back-compat, renderers select). Editor gains a collapsible per-question Findings panel (advisory slider coverage hint; editable on inherited questions — reword-class; ANY retype drops rules behind a confirm; anti-resurrection serialization), scored reports merge non-slider findings into "What to work on next", qualitative reports (LVA/QSP) gain a consolidated findings section — results emails byte-identical BY CONSTRUCTION, group reports untouched. New reserved `walk-qual-*` alias prefix renders qualitative so every future launch walk can exercise that path with throwaway templates. Launch walk proved E2E on prod DB: publish blocked on partial tiling then passed, frozen snapshot exact for all 3 kinds, both report surfaces exact, Duplicate-from-published carried rules byte-exact; launch-found #140 fixed the coverage hint naming out-of-scale bands; artifacts quarantined §5.5 order; prod smokes all-pass (existing LVA/SU-Full reports unchanged). 108 new tests (+1 in #140), sweep 5,292 pass (7 pre-existing failing suites, none Wave U), adversarial review + the ENTIRE build completed INLINE (all three TDD subagents died on session usage limits). Kill = zero the flag (snapshots + rules persist inert); schema/validation/snapshot-write = revert-commit. **Hand-off: Jeff authors findings per question in the editor, publishes, new campaigns render them — live templates ship EMPTY (honest-data).** **Roadmap state (corrected 2026-07-06): every Jeff-FEATURE phase (P2–P7) is live; the roadmap is NOT done.** Jeff-blocked: P1 imports (export files), #2.3 invite copy, #15/#16/#19 wording, LVA peer numbers. UNBLOCKED next candidates = **P8 hardening** (Wave O alerting/log drain + runbook §7 queries, "Imported from Esperto" report badge, report read-path txn budget, org-canary page-gate, and the NEW walk-found **tier-domain publish-vs-runtime gap** — a version whose tiers don't tile its metric domain publishes fine but 400s `INVALID_SCORING_CONFIG` on every submit; the legacy tier-domain check lives only in `scoreSubmission`, not the publish schema) and **Wave U spec §3 follow-ons** (conditional/show-if authoring — tracker row 38, the editor's disabled tab; findings in the results email; group-report findings; panel test-a-value preview) plus the Wave T §3 server-side inherited-lock enforcement (candidate hardening — ADR-0020 records the client-side-by-design trade-off). Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-u-launched`).)_ _(Prior: July 5 — **Wave T LAUNCHED — question editor type unlock live on production** (Jeff #10; PR #135 `81032e1` merged dark + same-session launch walk; launch-found fix PR #136 `f8f0006`; `WAVE_T_QUESTION_EDITOR_ENABLED=1` live; **ADR-0020**): TEXT/NUMBER/MULTI_CHOICE authoring unlocked in the EXISTING template editor (the engine already supported all 4 types — the gap was UI-only, and Jeff's instruments are mostly these types): 4-type dropdown on new-to-draft questions + MULTI_CHOICE options editor (auto slug keys + `maxChoices`); stableKeys slug-derived at first save (`<section prefix>_<lower_snake>`, 40-char cap, unique vs draft ∪ ALL published versions) then immutable; inherited key/type/option-keys locked in THREE layers (UI + serializer + SERVER: `KEY_COLLIDES_WITH_PUBLISHED`/`TYPE_LOCKED` on the version PATCH, validate-don't-strip so `recommendations[]`/future fields survive); structure edits warn with named downstream impact. Fixed en route: a pre-existing data-loss bug (stale raw refs made a sections-only follow-up save silently DELETE just-saved questions) and #136 — MULTI_CHOICE answers rendered raw option keys on scored reports (now resolved via `QuestionMeta.options`, C-H1 parity). Launch walk = throwaway TEST template E2E on prod DB (derived keys exact incl. the 40-cap edge; maxChoices cap enforced live on the survey; report verified), artifacts quarantined in §5.5 order (campaign first, then template soft-delete — published version rows can never be hard-deleted). 123+1 new tests, sweep 338/338, adversarial review completed INLINE after the subagent died on its session usage limit — both findings fixed + regression-proven. Kill = zero the flag (the PATCH validation + per-type serializer are non-killable hardening; their kill = revert-commit). **Hand-off: Jeff can now add and edit questions of all four types on any draft version.** Next = **P6 #11 (findings logic) → P1 imports when Jeff's exports land**; waiting on Jeff: #2.3 invite copy, #15/#16/#19, LVA peer numbers. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-t-launched`).)_ _(Prior: July 4 — **Wave S LAUNCHED — LVA peer benchmarks live on production** (PR #132 `9220503` merged dark + same-session launch walk; `WAVE_S_PEER_BENCHMARKS_ENABLED=1` live; **ADR-0019**): **#12** admin-set peer averages — generic `AssessmentBenchmark` DB rows (QUESTION kind, template-level per ADR-0001) + "Peer averages" panel on the LVA template editor (admin/STAFF, render-enabled aliases only) with atomic full-set reconcile saves + before/after audit deltas; **ships EMPTY — no seeded values ever** (Esperto LVA has no peers; ADR-0015 honest-data stance) · **#13** peer comparison in BOTH LVA reports — group: `Peers N.N` + ▲/▼/● signed-1dp deviation inline per S3 rating row (omit-empty per factor, scale-degraded excluded, `GROUP_RENDER_VERSION`→`lva-fidelity-v2`); individual: "compared to peers" section in S3's natural slot via a separate pure builder — the results email is byte-identical BY CONSTRUCTION (CI-frozen guard). Launch walk had **zero fabricated-value exposure** (co-validate C5): local-UI pilot vs prod DB with flag inline → glyph math hand-checked exact → values CLEARED → only then the prod flag flip. 118 new tests, adversarial review 0 CRIT/HIGH, prod smokes all-pass. Kill = zero the flag (rows persist). **Hand-off: reports stay peer-free until Jeff/Suzanne enter real numbers in the panel.** Next = **P6 bigger builds (#10 question editor, #11 findings logic) → P1 imports when Jeff's exports land**; waiting on Jeff: #2.3 invite copy, #15/#16/#19, LVA peer numbers. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-s-launched`).)_ _(Prior: July 3 — **Wave R LAUNCHED — slider tap-to-set + report printing live on production** (PR #129 `031124a` merged AS the launch — **FLAGLESS**, presentation-only, kill = revert commit): **#8** participant slider — 14px track + tap-a-number-to-set (pointer-only buttons `tabIndex=-1`, equal-slice hit areas, keyboard slider untouched) on all three participant surfaces · **#4** free-text answers full-width on reports — scored dl block stacked AND the real live squeeze fixed (qualitative statement tables rendered TEXT in the 96px rating column; now full-width `colSpan=2` rows, order preserved) · **#9** Print / Download PDF button on ALL group reports (LVA 6-page print QA clean; degraded full renders keep the button). **Wave L N≠3 tail CLOSED**: authorized N=2 construction on "LVA test new" (safe test member, token minted, NO email; survey filled entirely via tap-to-set) → ceil1 hand-check **16/16 exact** (5.0/2.5/0.0, all n=2). 18 new tests, adversarial review 0 CRIT/HIGH, prod smokes all-pass. Gotchas: Vercel **Preview** env lacks Production wave flags (group reports 404 on previews by design — use local-UI pilot with the flag inline); local pilots need `ASSESSMENT_SESSION_SECRET` (any local value). Next = **P7 LVA peers (#12/#13) → P6 bigger builds (#10/#11) → P1 imports when Jeff's exports land**. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-r-launched`). _(Same day, earlier:)_ **Progress report Jul-3 SENT to Jeff** (`Scaling-Up-Progress-Update-2026-07-03.html/.pdf` at repo root + Loom walkthrough): Wave P + Wave Q shipped work with a visual on every claim; roadmap re-stamped (P2/P3 DONE → next = **Wave R: P4 slider #8 + P5 reports/printing #4/#9**, absorbing the Wave L N≠3 tail). Don't re-triage or re-deliver; detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`progress-report-jul3-sent`). _(Same day, earlier:)_ **Wave Q LAUNCHED — admin & coach controls live on production** (PR #125 `3b9b72a` merged dark + same-session launch walk, every prod mutation individually authorized; `WAVE_Q_ADMIN_CONTROLS_ENABLED=1` live): **#1** results-email template default (`sendResultsDefault` seeds the wizard checkbox, approval hash always wins, per-campaign flip = the coach override) · **#6** disable retired templates (`disabledAt` third lifecycle state; hidden from all three new-campaign paths + unconditional 409; existing campaigns/reports/trends untouched; **`qsp-v1` disabled at launch**) · **#7** remove departed admins (`User.deletedAt` soft removal per **ADR-0018**; guard ladder; revive-on-accept re-invite; enforcement at login + per-request liveness + dashboard layout, NEVER kill-switchable — live revocation proven by differential JWT probe on prod). Durable rule (co-validated): flags gate capabilities/writes, never enforcement of persisted admin intent. JWT-only privileged routes (files DELETE, workflows, survey-templates) converted to `getApiActor()` + a CI guard test freezing the raw-session allowlist. ~150 new tests; suite 4,923 pass (6 pre-existing failing suites on main, ledgered). Kill = zero the flag + redeploy. Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-q-launched`). _(Prior: July 2 — **Wave P LAUNCHED — Jeff July-1 quick-fix batch live on production** (PR #123 `2d4210d` merged dark + same-session launch walk, every prod mutation individually authorized): QSP v3 + LVA v3 published (story labels differentiated "(Story N of 3)" — differentiate-not-delete; "Leadership team"; core-values reworded to Jeff copy, stableKey kept per ADR-0001); coach-email name fallback (name → respondent email on coach surfaces, greeting guard so respondents never read their own address — on-screen reports included); QSP invite body now carries `{{coachName}}` (template row was blank; the Wave G code default was the actual sender); `WAVE_P_INVITE_EMAIL_ENABLED=1` live → coach logo (HTTPS-only gate) + larger CTA on all invitation emails (4 send paths, PII-free chrome telemetry; flag-off byte-identical, kill = zero the flag). **Jeff #18 verified NOT a duplicate** (Esperto source has all three priority questions — org/year/quarter cascade; no change, report to Jeff). Old campaigns keep pinned v1/v2 (verified live); crosswalk/trends/longitudinal unaffected (no stableKey changes). Detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-p-launched`). Waiting on Jeff: #2.3 invite copy, #15/#16/#19 clarifications. _(Same day, earlier:)_ **Progress report `Scaling-Up-Progress-Update-2026-07-02` delivered (repo root) + Jeff's July-1 19-item feedback PDF (`From Jeff/gabriel-items-2026-07-01.pdf`) fully triaged into the roadmap** (quick fixes / admin-coach controls / survey UX / reports-printing / bigger builds / LVA peers workstream; waiting on Jeff: Rockefeller+LVA exports, QSP invite copy, 3 wording clarifications — detail in the CHANGELOG entry; don't re-triage). **Correction recorded: Wave J (SU-Full group report + Peers) is LIVE since June 30** (v3 published + flag on — why the Wave O preflight found v3). _(Same day, earlier:)_ **Wave O LAUNCHED — the historical Esperto SU-Full import is LIVE on production** (`WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED=1` + `WAVE_O_ESPERTO_IMPORT_HASH_SALT` set on Vercel Production). Coaches and admins can now import a company's historical Scaling Up Full rounds from Esperto restricted exports (roster-first; recompute-not-store per ADR-0017; renders as normal per-respondent reports and feeds longitudinal). Launched same-session through the plan in `docs/specs/v7.6/18o-phase3-canary-launch-plan.md`: verification submission (within-block **row order ascending CONFIRMED**, all 10 families) → local-UI pilot against prod DB (known-answer gate: **all 63 stored answers exact**, report numbers exact) → prod-org canary (**reused-noop idempotency**, **409 divergent-reimport**, dark 404 for non-canary, markers in `vercel logs`) → global flip + live smoke → pilot round quarantined (first real-prod rehearsal of the rollback script, §5b smoke all-pass). Three launch-found fixes shipped en route: **Phase 3a** (PR #116) mapped FTE `Q1o2_2/Q1o2_3 → Q_FTE_CONTRACT/Q_FREELANCE` — prod publishes the FTE-bearing v3 whose REQUIRED FTE key would have made the completeness gate skip every respondent; **Phase 3b** (PR #117) explicit commit-transaction budget (55s/10s; Prisma's 5s default couldn't fit the batch cap); **Phase 3c** (PR #119) honest-framing copy now flag-conditioned. **Kill = `_KILL=1` + redeploy; bad batch = `scripts/wave-o-quarantine-import.ts` (rehearsed). Rockefeller/LVA import still parked on real exports.** Full launch detail in [plans/CHANGELOG.md](plans/CHANGELOG.md) (`wave-o-launched`). _(Phase 1 plumbing PR #113/#114; Phase 2 verified crosswalk PR #115; runbook `docs/specs/v7.6/18o-ops-runbook.md`.)_ _(Prior: June 30 — Waves M + N LAUNCHED, PR #108 `7d4a87d`; custom slides #19 + per-respondent longitudinal #23.)_ **Full history (Waves A–L, Wave J launch, Waves B/D/F launch, all earlier sprints) in [plans/CHANGELOG.md](plans/CHANGELOG.md).** |
| **Work Logs** | Session work logs at `~/.claude/worklogs/` — invoke `/log-session` to log or generate reports |

## Current Status

**Active items:** see `plans/JEFF_MAY6_SPRINT.md` for the open sprint ledger.

**Open follow-ons (deferred for Beta hardening or external input):**
- Wave O: wire a log drain + the `18o-ops-runbook.md` §7 alert queries (launch observability = human-read `vercel logs` + kill switch)
- Wave O: align the report READ-path transaction budget with the #117 commit-path fix (5s Prisma default; fine same-region, trips on high-latency clients)
- Wave O: "Imported from Esperto (historical)" badge on rendered reports (campaign name carries "imported" today)
- Wave O: import pages' flag check is global-only — an org-scoped `_CANARY` hides the SU-Full UI even for the canaried org (page-gate follow-on if a future org canary is wanted)
- Per-recipient pre-send DB-check idempotency (Inngest replay duplicate-send risk)
- Immediate-path `executionId` synthesis with deterministic idempotency key (`inngestRunId` + `stepId`) so SEND_SURVEY_LINK FAILED-child writes work on the immediate path too — Wave 6 covers only the future RELATIVE_TO_EVENT path
- SEND_FILE_LINK / EMAIL_ATTENDEES FAILED-child writes (need SMTP error classification: terminal vs transient) — applies to BOTH execute-workflow.ts and trigger-workflow-step.ts
- Deterministic parent.id via `inngestRunId` for forceResend audit trail
- Error redaction codes for `WorkflowStepExecution.errorMessage`
- Structured logging/alerts/runbook for parent/child workflow execution state
- PII retention/erasure policy for recipient email audit data
- Concurrency limit + load test for large-attendee workshops
- ENH-MAY6-6 — affiliate provider switch (needs Jeff)
- ENH-MAY6-9 — aggregator as top-level toolset (needs design)
- ENH-MAY6-11 — coach-editable transactional emails (needs product call)
- Q-MAY6-1, Q-MAY6-2 — questions, not tasks
- STRIPE_WEBHOOK_SECRET rotation — pending Josh's authenticator

**Full sprint/wave history:** see [plans/CHANGELOG.md](plans/CHANGELOG.md) (extracted Feb 2026 → May 2026).

> Rollout note (2026-05-13): future history goes to `plans/CHANGELOG.md`, NOT here. CLAUDE.md "Current Status" stays a short summary.

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.6 |
| Language | TypeScript | 5.x |
| Database | PostgreSQL (Neon) + Prisma ORM | Prisma 6.x |
| Auth | NextAuth.js (JWT sessions, credentials provider) | |
| Payments | Stripe | |
| CRM | HubSpot | |
| Certifications | Circle.so | |
| Job Queue | Inngest | |
| Cache | Redis (Upstash) | |
| Email | Azure Communication Services | |
| Forms | Typeform (5 forms, webhook integration) | |
| CSS | Tailwind CSS + shadcn/ui | |
| Hosting | Vercel | |

## Workshop Lifecycle (JV-02: Jeff's 6 Stages)

```
REQUESTED → AWAITING_APPROVAL → PRE_EVENT → POST_EVENT → COMPLETED
                                    ↓
                                 CANCELED (from REQUESTED, AWAITING_APPROVAL, or PRE_EVENT)
```

- **REQUESTED**: Coach submits via wizard → Workshop + ApprovalQueue created simultaneously
- **AWAITING_APPROVAL**: Auto-approved (cert confidence >=85%) or manual review by Suzanne
- **PRE_EVENT**: Active, accepting registrations, landing pages live
- **POST_EVENT**: Event concluded, collecting feedback/surveys
- **COMPLETED**: All follow-up done
- **CANCELED**: Soft-delete; $500 fee if within 14 days of event (JV-28)

## Workshop Code (JV-03)

Every workshop gets a unique human-readable ID: `WS-YYYY-XXXX` (e.g., `WS-2026-A1B2`).
Generated by `src/lib/workshops/workshop-code.ts` via `generateUniqueWorkshopCode()`.

## Source Structure

```
src/
├── prisma/
│   ├── schema.prisma          # Data model (20+ models)
│   ├── seed.ts                # Dev seed data
│   └── seed-real-data.ts      # Real Kajabi migration data
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # Admin/staff dashboard (requires ADMIN/STAFF role)
│   │   │   ├── layout.tsx     # Nav: Dashboard, All Workshops, Bio, Templates, Workflows, Surveys, Files, Partners, Coaches, Approvals, Categories, Pricing, Financials
│   │   │   ├── dashboard/     # Admin overview
│   │   │   ├── workshops/     # Workshop CRUD, detail, landing pages, quick-actions
│   │   │   ├── coaches/       # Coach management
│   │   │   ├── bio/           # BIO pages
│   │   │   ├── templates/     # Template management
│   │   │   ├── admin/surveys/  # Survey template management (form builder + results)
│   │   │   ├── admin/files/   # File manager (upload, filter, delete)
│   │   │   ├── partners/      # Partner management
│   │   │   └── contacts/      # CRM contacts
│   │   ├── (portal)/          # Coach self-service portal (requires COACH role)
│   │   │   ├── layout.tsx     # Sidebar nav with search, notifications, sign out
│   │   │   └── portal/
│   │   │       ├── home/      # Coach dashboard
│   │   │       ├── workshops/ # My Workshops + detail (with cancel button)
│   │   │       ├── registrations/ # Registration management
│   │   │       ├── request/   # Workshop request wizard (3-step)
│   │   │       ├── settings/  # Profile + password change
│   │   │       ├── templates/ # Available templates
│   │   │       └── follow-up/ # 90-day follow-up
│   │   ├── (public)/          # Public pages (no auth)
│   │   │   ├── login/         # Credentials login
│   │   │   ├── register/      # Coach signup
│   │   │   ├── workshop/[slug]/ # Public landing pages
│   │   │   ├── w/[slug]/      # Short URL redirect
│   │   │   └── registration/success/ # Post-registration confirmation
│   │   │   ├── admin/approvals/  # Approval queue management (merged into dashboard layout)
│   │   │   ├── admin/categories/ # Category CRUD (JV-16)
│   │   │   ├── admin/dashboard/  # Admin analytics + 6-stage pipeline (JV-01)
│   │   │   ├── admin/financials/ # Financial dashboard (JV-21)
│   │   │   ├── admin/pricing/    # Pricing tier CRUD (JV-17)
│   │   │   └── admin/settings/   # Admin settings + password change
│   │   └── api/               # API routes (see below)
│   ├── components/
│   │   ├── ui/                # shadcn/ui + custom (status-pill, copy-url-button)
│   │   ├── auth/              # Shared auth (change-password-form)
│   │   ├── workshops/         # Workshop components (wizard, cancel-dialog)
│   │   │   └── wizard/        # 3-step wizard (Step1Details, Step2Logistics, Step3Review, WizardContext)
│   │   ├── templates/         # Landing page templates
│   │   ├── contacts/          # Contact management
│   │   ├── surveys/           # Survey components (template-editor)
│   │   ├── files/             # File management components
│   │   └── affiliate/         # Partner/affiliate components
│   ├── lib/                   # Core business logic
│   │   ├── auth/              # Auth: auth.ts, authorization.ts, password-reset.ts, auth-posture.ts, access-control.ts
│   │   ├── workshops/         # Workshop logic: workshop-code.ts, workshop-coupons.ts, workshop-financials.ts, lead-time-validator.ts
│   │   ├── surveys/           # Survey logic: survey-service.ts, survey-types.ts, survey-automation.ts
│   │   ├── templates/         # Template logic: template-interpolation.ts, template-interpolation-core.ts, template-utils.ts, template-preview.ts, template-editor-utils.ts
│   │   ├── workflows/         # Workflow logic: workflow-service.ts, workflow-types.ts
│   │   ├── files/             # File logic: file-service.ts, file-access.ts, file-download-path.ts, file-rules.ts
│   │   ├── approval-engine.ts # Auto-approval logic (cert confidence >=85%)
│   │   ├── smtp-transport.ts  # Shared SMTP transport (single source of truth for email sending)
│   │   ├── registration-service.ts # Registration with capacity/duplicate checks
│   │   ├── validations.ts     # Zod schemas
│   │   ├── utils.ts           # formatDate, formatCurrency, generateSlug, getWorkshopStatusLabel
│   │   ├── rate-limit.ts      # API rate limiting
│   │   └── db.ts              # Prisma client singleton
│   ├── services/              # External service integrations
│   │   ├── stripe.ts          # Payments, cancellation fees, refunds
│   │   ├── hubspot.ts         # CRM sync
│   │   ├── circle.ts          # Certification verification
│   │   ├── email-sender.ts    # Email sending (uses shared smtp-transport)
│   │   └── notifications.ts   # Multi-channel notifications (uses shared smtp-transport)
│   ├── inngest/               # Background job definitions
│   └── __tests__/             # Jest unit tests
└── package.json
```

## API Routes

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/approvals` | GET, POST | List/create approval requests | Admin (GET), Any auth (POST) |
| `/api/approvals/[id]/respond` | GET, POST | Approve/deny (GET=email link, POST=dashboard) | Admin |
| `/api/workshops` | GET, POST | List/create workshops | Auth required |
| `/api/workshops/[id]` | GET, PATCH, DELETE | Workshop CRUD + cancellation | GET: owner/admin, PATCH: admin, DELETE: owner/admin |
| `/api/workshops/[id]/clone` | POST | Clone a workshop | Admin |
| `/api/workshops/[id]/register` | POST | Public registration | Public |
| `/api/workshops/[id]/status` | PATCH | Status transitions | Admin |
| `/api/workshops/[id]/lock` | POST | Lock/unlock workshop | Admin |
| `/api/workshops/[id]/circle-profile` | GET | Fetch Circle bio for landing page auto-populate | Auth required |
| `/api/workshops/[id]/ics` | GET | Download .ics calendar file for workshop | Public |
| `/api/workshop-drafts` | GET, POST | Auto-save wizard drafts | Coach |
| `/api/auth/change-password` | POST | Change password (any user) | Any auth |
| `/api/auth/coach-signup` | POST | Coach self-registration | Public |
| `/api/auth/forgot-password` | POST | Password reset request | Public |
| `/api/auth/reset-password` | POST | Password reset execution | Public |
| `/api/categories` | GET, POST | Category CRUD (GET=public, POST=admin) | GET: Public, POST: Admin |
| `/api/categories/[id]` | PATCH, DELETE | Update/delete category | Admin |
| `/api/pricing-tiers` | GET, POST | Pricing tier CRUD (GET=public, POST=admin) | GET: Public, POST: Admin |
| `/api/pricing-tiers/[id]` | PATCH, DELETE | Update/delete pricing tier | Admin |
| `/api/coaches` | GET, POST | Coach CRUD | Admin |
| `/api/coaches/[id]` | GET, PATCH, DELETE | Coach detail/update/delete | Admin |
| `/api/coaches/[id]/certifications` | POST, DELETE | Grant/revoke workshop type certification | Admin |
| `/api/registrations` | GET | Registration list | Auth required |
| `/api/landing-pages` | GET | Landing page list | Admin |
| `/api/workflows` | GET, POST | List/create workflows | Auth required |
| `/api/workflows/[id]` | GET, PATCH, DELETE | Workflow CRUD | Auth required |
| `/api/workflows/[id]/steps` | POST, PATCH | Add/reorder workflow steps | Auth required |
| `/api/workflows/[id]/steps/[stepId]` | PATCH, DELETE | Update/delete step | Auth required |
| `/api/workflows/[id]/assign` | POST, DELETE | Assign/unassign workflow to workshop | Auth required |
| `/api/workflows/[id]/executions` | GET | Workflow execution status by workshop | Auth required |
| `/api/survey-templates` | GET, POST | List/create survey templates | Auth required |
| `/api/survey-templates/[id]` | GET, PATCH, DELETE | Survey template CRUD | Auth required |
| `/api/survey-templates/[id]/questions` | POST, PATCH | Add/reorder questions | Auth required |
| `/api/survey-templates/[id]/questions/[qId]` | PATCH, DELETE | Update/delete question | Auth required |
| `/api/survey-templates/[id]/results` | GET | Aggregated survey results | Auth required |
| `/api/surveys/[id]` | GET | Get survey form (public) | Public |
| `/api/surveys/[id]/submit` | POST | Submit survey answers (public) | Public |
| `/api/surveys/assign` | POST | Assign template to workshop | Auth required |
| `/api/files` | GET, POST | List files (filterable) / Upload file (FormData) | Auth required |
| `/api/files/[id]` | GET, PATCH, DELETE | File details / Link to workflow step / Delete | Auth required |
| `/api/webhooks/typeform` | POST | Typeform form submission | Webhook secret |
| `/api/webhooks/stripe` | POST | Stripe payment events | Webhook signature |

## Data Model (Key Models)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `User` | Auth accounts | email, role (ADMIN/STAFF/COACH), passwordHash |
| `Coach` | Coach profiles | email, userId (FK to User), certificationStatus, territory |
| `Workshop` | Workshop events | workshopCode, coachId, status (6 stages), eventDate, priceCents, termsAcceptedAt |
| `WorkshopType` | Workshop templates | name, slug, pricingTiers (JSON), durationOptions (JSON) |
| `Category` | Dynamic categories (JV-16) | name, slug (replaces enum) |
| `PricingTier` | Pricing dropdown (JV-17) | categoryId, amountCents |
| `Registration` | Attendee records | workshopId, email, paymentStatus, stripePaymentId |
| `ApprovalQueue` | HITL approval system | type, coachId, workshopId, status |
| `LandingPage` | Generated pages | workshopId, template, slug, content (JSON) |
| `WorkshopPage` | Unique pages per workshop (JV-10) | workshopId, workshopCode, pageType |
| `AuditLog` | All actions tracked | entityType, entityId, action, performedBy |
| `WorkshopDraft` | Wizard auto-save | userId, stepsData (JSON), currentStep |
| `Workflow` | Email sequence definitions (JV-11) | name, isTemplate, isActive, steps[] |
| `WorkflowStep` | Individual steps in a workflow | stepType, triggerType, offsetDays, subject, body |
| `WorkflowAssignment` | Links workflows to workshops (JV-04) | workflowId, workshopId, workshopCode |
| `WorkflowStepExecution` | Tracks step execution state | stepId, workshopId, status, scheduledFor |
| `Workshop.workshopBuiltEmailSentAt` | Atomic guard — set when "Workshop Ready" email is sent | DateTime?, null = not yet sent (BUG-MAY4-2) |
| `SurveyTemplate` | Reusable survey definitions (JV-13) | name, surveyType, isActive, questions[] |
| `SurveyQuestion` | Individual questions in a template | templateId, questionType, label, options (JSON) |
| `Survey` | Survey instance per workshop | templateId, workshopId, workshopCode, completedAt |
| `SurveyAnswer` | Individual answers per question | surveyId, questionId, value, numValue |
| `FileAttachment` | Uploaded files (Vercel Blob) (JV-12) | filename, blobUrl, contentType, workshopId, workflowStepId |

## Authorization Model

| Role | Access |
|------|--------|
| **ADMIN** | Full access to all routes and data |
| **STAFF** | Same as admin except certain settings |
| **COACH** | Portal only; can manage own workshops, registrations, profile |

Key functions in `lib/auth/authorization.ts`:
- `getApiActor()` — Returns authenticated user info from JWT session
- `requireCoach()` — Server component guard; redirects if not a coach
- `isPrivilegedRole(role)` — Returns true for ADMIN or STAFF
- `canManageCoachData(actor, coachId)` — Coach can manage own data, admin can manage any

## Human-in-the-Loop (HITL)

All these require manual approval by Suzanne:
- Custom pricing requests (auto-approve if cert confidence >=85%)
- Workshop cancellations within 14 days ($500 fee)
- Refund processing
- Certification edge cases (<85% confidence)

**Notification:** Email via Azure Communication Services (NOT Slack)

## Jeff Verdun's 29 Revisions (Feb 15, 2026)

Cataloged in `plans/JEFF_VERDUN_REVISIONS_IMPLEMENTATION_ROADMAP.md` (IDs JV-01 through JV-29).

### Completed JV revisions

**JV revisions shipped (25 of 29):** JV-01, 02, 03, 04, 05, 06, 07, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 26, 27, 28, 29. Per-revision implementation detail: [plans/CHANGELOG.md](plans/CHANGELOG.md).

**JV revisions remaining (4):** JV-08 (HTTPS env canonicalization), JV-12 hardening (protected file delivery by stage threshold), JV-23 (email tracking), JV-24 (Circle SSO/auth).

## Development Commands

```bash
cd "D:\The CTO Project\Scaling Up Platform v2\src"

npm run dev              # Start dev server (Turbopack)
npm run build            # Production build (always run before committing)
npm run test             # Jest unit tests
npm run test:e2e         # Playwright E2E tests
npm run lint             # ESLint
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma migrate dev   # Create + apply migrations
npx prisma db push       # Push schema without migration (dev only)
npx tsx prisma/seed.ts   # Seed dev data
npx tsx prisma/seed-real-data.ts  # Seed real Kajabi migration data
npx tsx prisma/seed-templates.ts # Seed active landing page templates for auto-build
```

## Environment Variables

Secrets are in local `.env` (gitignored) and Vercel dashboard. Key variables:

- `DATABASE_URL` / `DIRECT_URL` — Neon PostgreSQL
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL` — Auth
- `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` — Canonical admin
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Payments
- `HUBSPOT_ACCESS_TOKEN` — CRM
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — Job queue
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Cache
- `TYPEFORM_WEBHOOK_SECRET` — Form webhooks
- `AZURE_COMMUNICATION_CONNECTION_STRING` — Email
- `APP_URL` — Public URL for landing page links

## Known Quirks & Gotchas

- **Inngest event keys** do NOT start with `evt_` — use key-in-URL format `https://inn.gs/e/<key>`
- **Typeform webhook signature**: HMAC SHA-256, base64, header `typeform-signature: sha256=<base64>`. May append trailing `\n` to body.
- **Vercel env vars** need a redeploy to take effect
- **Workshop status spelling**: Workshop uses "CANCELED" (American); Registration/PageStatus uses "CANCELLED" (British) — different domains, intentional
- **workshopType is optional**: Made nullable in Sprint 0 (JV-16). Always use `workshop.workshopType?.` with optional chaining.
- **Build script runs migrations**: `prisma migrate deploy` runs automatically during `npm run build` (added Feb 27). Never remove this — without it, new schema columns cause runtime crashes on Vercel because the Prisma client expects columns the DB doesn't have yet.
- **Dashboard canonical route is `/admin/dashboard`**: The `/dashboard` route redirects to `/admin/dashboard`. Do NOT create pages at `/dashboard` directly.
- **File uploads**: Filenames are sanitized (path separators, null bytes, `..` stripped) before Vercel Blob storage
- **File deletion**: Ownership verified — only the uploader or ADMIN/STAFF can delete files
- **Survey submission**: Public endpoint rate-limited at 20 req/min per IP
- **SMTP transport**: All email sending goes through `lib/smtp-transport.ts` — do NOT create new nodemailer transports elsewhere
- **Admin layout unified**: All admin pages are under `(dashboard)/admin/` — the standalone `/admin/` layout was removed in Feb 26 cleanup
- **Admin nav is grouped (Wave H)**: 7 top-level entries — Dashboard · Workshops▾ · Approvals · Assessments · Automation▾ · People▾ · Financials▾. Group labels are menu-only (open a dropdown, don't navigate); only leaves + the Dashboard/Approvals/Assessments links navigate. Group chevrons are 16px lucide icons that rotate on open (no "→" arrows). Approvals + Refunds carry fail-soft pending-count badges (zero→no badge). Disclosure pattern, single `openGroup` state, NOT `role=menu`. Source of truth `lib/nav/admin-nav-model.ts` (homes all 16 routes); counts via `lib/nav/admin-nav-badges.ts`. The full grouped bar shows at `xl` (1280px+); the hamburger (same groups, collapsed by default) shows below `xl`.
- **Dead code removed (Feb 26)**: animations.ts, cache.ts, api-handler.ts, logger.ts, landing-page-auto-populate.ts, workshop-generator.ts — all deleted, zero imports
- **Approval engine emits Inngest events**: `workshop/approved` event emitted on approval (added in Sprint 5) — triggers auto-build function
- **Bio page CTA toggle exists**: Bio page editor already has "Show CTA button on bio page" checkbox (discovered via video analysis)
- **npm audit**: 3 low-severity `cookie` vulns via `@auth/core` → next-auth. Fix requires next-auth downgrade — deferred
- **Design tokens live in globals.css only**: `brand-tokens.css` was deleted (zero imports). `MASTER.md` is reference docs only.
- **Never use hardcoded Tailwind colors for semantic states**: Use `text-destructive` not `text-red-600`, `bg-success/10` not `bg-green-50`, `text-primary` not `text-blue-600`.
- **Sidebar uses `--sidebar-*` tokens**: Coach portal sidebar uses `bg-sidebar`, not `bg-slate-900`.
- **Workshop status colors use `--status-*` tokens**: `getWorkshopStatusColor()` and `StatusPill` both use dedicated status tokens.
- **Security S1-S8 applied**: Nonces, webhook secrets, survey validation, JSON safety, error handlers, 15s timeouts, idempotency, email dedup.
- **Never push NODE_ENV to Vercel**: Vercel manages NODE_ENV automatically. Pushing `NODE_ENV=production` causes `npm install` to skip devDependencies, breaking builds (e.g., `@tailwindcss/postcss` not found). The `scripts/push-env-to-vercel.mjs` script has NODE_ENV in its SKIP list.
- **Workshop.eventDate is midnight UTC — always use resolveEventStartMoment**: `eventDate` is stored as 00:00 UTC. The actual event time is in `eventTime` (string, "16:00 - 18:00") and `timezone` (IANA). Always call `lib/workflows/resolve-event-start-moment.ts` → `resolveEventStartMoment(workshop)` before passing a time to `calculateSendDate`. Bypassing this causes scheduledFor to land ~20h in the past.
- **workshopBuiltEmailSentAt is the "Workshop Ready" email claim**: `runAutoBuild` sets this atomically before sending. If it's already non-null, the email was already sent — don't send again. Cleared on SMTP failure so a retry can re-send.
- **Workflow variables support both naming conventions**: `interpolateTemplate()` in `lib/workflows/workflow-service.ts` accepts both camelCase (`{{workshopTitle}}`) and snake_case (`{{workshop_title}}`). Also supports `{{attendee_name}}` as alias for `{{registrantName}}`.
- **lib/ is now domain-organized**: `lib/auth/`, `lib/workshops/`, `lib/surveys/`, `lib/templates/`, `lib/workflows/`, `lib/files/` subdirectories. Cross-cutting utilities stay at `lib/` root. See `project-file-map` skill for quick lookup.
- **Next.js middleware lives at `src/src/middleware.ts`** — renamed from the inactive `proxy.ts`. Next.js picks it up because `app/` and middleware must share the same parent directory (`src/src/`).
- **`prisma/*.db` is gitignored**: SQLite dev databases are excluded. The app uses Neon PostgreSQL in all environments.
- **Env push script (`scripts/push-env-to-vercel.mjs`)**: Uses Node.js `input` option on `execSync` to pipe values — NOT shell `echo` (which breaks on Windows due to literal quote preservation). Production overrides for URL-related vars. SKIP list: `BLOB_READ_WRITE_TOKEN`, `NODE_ENV`.
- **Node version pinned**: `.nvmrc` pins Node 20 for Vercel compatibility. Local development should use Node 20.
- **tsconfig excludes scripts**: `prisma/seed*.ts` and `scripts/**` are excluded from TypeScript build checking — they're standalone CLI scripts, not app code.
- **Always run `CI=true npm run build` before pushing**: See "Deployment Verification Protocol" section below.

## Deployment Verification Protocol

**MANDATORY before every `git push` to `main`:**

1. **Run the FULL Vercel build command locally** (not just `next build`):
   ```bash
   CI=true npm run build
   ```
   This runs `prisma generate && prisma db push && next build` with CI mode — matching Vercel exactly.

2. **Check ESLint on changed files:**
   ```bash
   npx eslint <changed-files>
   ```
   Fix ALL warnings AND errors. Vercel may treat warnings as build failures.

3. **Run tests on changed areas:**
   ```bash
   npm run test -- --passWithNoTests
   ```

4. **After pushing, verify Vercel deployment status:**
   ```bash
   npx vercel ls 2>&1 | head -5
   ```
   Wait for `● Ready` status. If `● Error`, check build logs in Vercel dashboard.

5. **If Vercel build fails but local passes:**
   - Check Node version: `.nvmrc` pins Node 20 (Vercel default). Local must match.
   - Check `tsconfig.json` exclude list: standalone scripts (`prisma/seed*.ts`, `scripts/**`) are excluded to prevent cross-platform TS issues.
   - Check for stale build cache: try redeploying from Vercel dashboard with "Clear Build Cache" option.
   - Check `prisma db push` connectivity: Neon databases may cold-start timeout on Vercel's build server.

**Why this matters:** Local `npx next build` does NOT match the Vercel build pipeline. The Vercel build also runs `prisma generate` + `prisma db push` (database migration), and runs in a Linux/Node 20 environment. A passing local build does NOT guarantee a passing Vercel build.

## Standing Security Practice

Security improvements ship with every sprint — no separate security sprint needed. Jeff is already aware of the security posture. On every sprint:
- Validate input at all new API boundaries (Zod)
- Rate-limit any new POST/mutation endpoints (`withRateLimit`)
- Auth check first (`getApiActor()` → 401 if null)
- No raw HTML injection in JSX (escape user-controlled fields)
- Audit log on sensitive mutations (`logAudit()`)
- No secrets or tokens in console.log

## Continuous Update Protocol

**After every sprint or significant change, update this file:**
1. Move completed JV revisions to the "Completed" table
2. Update "Current Status" section with sprint progress
3. Update "Last Updated" date
4. Add any new API routes, models, or components to the relevant sections
5. Document new gotchas or quirks discovered during development
6. Append full implementation detail to [plans/CHANGELOG.md](plans/CHANGELOG.md) (newest first with HTML-comment anchor `<!-- ENTRY_ISO:YYYY-MM-DD ENTRY_SLUG:kebab-slug -->`); update only the LAST_UPDATED_ISO/LAST_UPDATED_SLUG anchor + brief prose in the Project Context table.

## Agent skills

### Issue tracker

Issues live as GitHub Issues on `ChiefAI-Officer/Scaling-up-platform-v2`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus category labels (`bug`, `enhancement`, `security`, `documentation`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. `CLAUDE.md` is the primary reference; `CONTEXT.md` and `docs/adr/` are created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.

### Historical work lookup

For sprint/wave detail: read [plans/CHANGELOG.md](plans/CHANGELOG.md). For code-level history: `git log -p` + `git blame -C -C`. For session-level work logs: `~/.claude/worklogs/` (invoke `/log-session`).
