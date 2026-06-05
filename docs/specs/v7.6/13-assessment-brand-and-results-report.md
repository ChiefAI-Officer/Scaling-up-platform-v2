# 13 — Assessment Brand Polish + Branded Results Report

> **Status:** Design approved + grilled (`/grill-with-docs`, 2026-06-05). Implementation plan: [13a-assessment-brand-and-results-report-implementation-plan.md](13a-assessment-brand-and-results-report-implementation-plan.md).
> **Spec library note:** this lives in `docs/specs/v7.6/`; `PLAN.md` stays a thin hub.

## Origin

Jeff Verdun, Slack 2026-06-05 (10:56 AM), two asks:

1. *"When are you planning on playing with look and feel of the assessments."*
2. *"When I want to look at the assessments people have completed I see the raw data. I want to be able to see the PDF that gets sent to them."*

He handed over the **Scaling Up Brand Guidelines** (purple `#522583`; Four-Decisions colors orange `#f7a600` People / blue `#008bd2` Strategy / brown `#946b36` Execution / green `#95c11f` Cash; Helvetica Neue headings + Roboto body; official logo + submark; the signature S-curve swoosh).

### What #2 actually means (grounded in the code)

Jeff's reference point is **Esperto**, which produces a polished, branded **PDF report** per completion (cover → preface → visual section breakdown → scores table → conclusion; real samples in `From Jeff/APP_scaling up assessemnt/`). In **our** platform today:

- **No PDF exists** — zero PDF libraries, no generation, nothing emailed.
- **Respondents receive nothing** on completion — the submit route scores + stores, then shows a thank-you page ("your coach will follow up"). The `AssessmentTemplate.resultsEmail{Subject,BodyMarkdown,ContentApproved}` fields exist but are **never sent** (dead wiring).
- **What Jeff reviews** is [`AssessmentResultView`](../../../src/src/components/assessments/AssessmentResultView.tsx): a tier banner + score tables + a per-question list rendering raw `stableKey → value → achieved`, in the **blue app theme**. To him that reads as *raw data*.

So #2 = **build the branded, human-readable Results report** (the artifact Esperto ships as a PDF) and make it the coach/admin's **canonical view of a completion**, with **Print → PDF** for a real file. #1 and #2 overlap: the report is the biggest look-and-feel gap, so this spec covers both as one on-brand experience.

## Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Scope = both.** Brand the participant experience **and** build the branded Results report (the centerpiece). | Jeff raised both together; the report is the largest gap. |
| D2 | **Report = branded web report + Print-to-PDF** (browser print engine). No server-side PDF pipeline (no puppeteer/@react-pdf). | Reuses the scoped brand CSS + existing scoring output; Vercel-safe; ships fast; still yields a real PDF. |
| D3 | **Delivery v1 = coach/admin view + print only.** No auto-email to respondents; the `resultsEmail*` fields stay dormant. | Directly answers #2 (a *view*), lowest risk, respects the CEO-vs-aggregate privacy model (coach mediates); respondent auto-delivery is a clean follow-on. |
| D4 | **Quiz keeps the slider-with-numbered-ticks** (PR #34/#35) — restyle only. Not the discrete buttons PR #33 introduced and #34 reverted. | The slider is the researched, deliberate control; min already selectable. Confirmed with the user. |
| D5 | **Zero schema migrations.** Every data need closes via wider Prisma `select` clauses. | Confirmed by the integration map. |
| D6 | **Brand stays scoped** (ADR-0005). Quiz uses `.su-assessment-brand`; the report reuses the richer `.su-public-brand` kit. No global `:root` / `.wf-scope` change. | Report renders inside the portal (blue) lane; only its wrapper carries the brand. |

### Grill resolutions (`/grill-with-docs`, 2026-06-05)

| # | Resolution | Why |
|---|-----------|-----|
| G1 | **Polish the live path; auto-support the rich path.** The only template with domains/recommendations/ScaleUp score is **Scaling Up Full**, which is **parked (DRAFT, not published)**. The four *live* assessments (Rockefeller, QSP v1/v2, LVA) have none of those. So make the Rockefeller/QSP/LVA report the premium experience (it's 100% of live usage), and keep degradation so SU Full's rich features light up automatically if it ever publishes. **Do not block v1 on SU Full.** | Don't ship a report that only looks good for a template nobody can run. |
| G2 | **Report adapts to each template's scoring shape.** `achieved = value ≥ passThreshold` (`scoring.ts:1244`). Rockefeller `passThreshold:2` (meaningful) → checklist **checkmarks**; QSP/LVA/SU Full `passThreshold:0` → everything trivially "achieved" → **no checkmarks**, show the **rating** instead. Per-question rows always show the **rating** (value on scale, e.g. `2 / 3`); the green-check affordance appears **only when `passThreshold > 0`**. Overall banner uses the template's own `tierMetric`: Rockefeller `countAchieved` ("28 / 40 items" + Low/OK/Great band); QSP/LVA `overallAvg` ("Avg 3.2" under neutral "Submitted", no fake band); SU Full ScaleUp score / mean-of-domains. | Avoids a wall of meaningless green ticks; honours each instrument's real metric. |
| G3 | **No team-average column.** The scores table is `section | your score | your per-item average` — exactly Esperto's *personal* report (its "Average" column is the respondent's own per-item average, not a cohort average). Cohort comparison is a separate **Aggregate report** (out of scope). | Truer to Esperto; deletes a whole computation + its n=1/privacy edge cases. |
| G4 | **The Results report is the canonical results view; the raw inline `stableKey` view is retired.** The respondent-row results action opens the branded report (new tab, print-ready); `AssessmentResultView`'s raw per-question `stableKey` dump is removed/repointed. | Jeff's complaint is literally "stop showing me raw data" — adding a second door doesn't fix it. |
| G5 | **Print fidelity = medium.** Cover on its own page (`break-after`), content flows with `break-inside: avoid` on cards/sections, a simple footer (logo + page number). **No** running header, **no** forced per-section pages. | Reads as a real "document" PDF without brittle running-header / per-section-page CSS. Esperto-pixel pagination is a fast follow if Jeff wants it. |
| G6 | **App-shell on both participant flows; company optional.** Invited (`org-survey`) + public (`quiz`) both render `SectionPager`, so the shell/title-slides/slider-restyle cover both. Company name shows when present (invited); the public flow shows the assessment name only. | One consistent experience; degrades gracefully where there's no company. |
| G7 | **Primary Scaling Up logo on product surfaces; coach-as-text in the CTA.** The white wordmark (`su-logo-white.svg`) goes on the cover/footer/quiz app-bar (these are SU *product* artifacts, à la Esperto). ADR-0005's "coaches use the Certified-Coach mark" rule governs coach-owned collateral, not the platform's assessment report. The coach is acknowledged as text ("Talk to your Scaling Up Certified Coach"). All logo placements stay on purple → existing white SVG suffices, **no new asset**. | Matches Esperto; sidesteps the missing coach-mark/dark-logo assets. |
| G8 | **Skip the Verne preface for v1.** A one-line lede on the overall banner + the branded conclusion + coach CTA. | The full Verne preface/book-promo needs assets (photo, signature, book cover) + per-template copy we'd source from Jeff; not worth blocking v1. |

## Deliverable 1 — Participant quiz: "application feel"

The participant survey already renders in `.su-assessment-brand` (purple) via [`section-pager.tsx`](../../../src/src/components/assessments/section-pager.tsx) + [`question-input.tsx`](../../../src/src/components/assessments/question-input.tsx), in **both** the invited (`(public)/org-survey/[campaignAlias]`) and public (`(public)/quiz/[campaignAlias]`) flows. This pass elevates both from "a branded form" to "an application":

- **Branded app shell** (added at the layout level, or a shared shell the layout renders): white official logo on a purple bar + a **Four-Decisions segmented progress** strip + "Section N of M" (+ company name when present, per G6).
- **Section title / intro slides** — restyle the existing `section-pager.tsx` `view==="intro"` branch (keeps `section.description` copy per ADR-0004): large domain-colored section number, Helvetica Neue title, intro copy, "Begin section →", time estimate, S-curve motif.
- **Question card** — polished card; the **restyled slider** (numbered ticks kept; purple selected tick; "Your rating: N" status; min selectable per D4), autosave indicator, clear Back/Next.

All changes are **CSS + markup** within the existing scoped brand. The control's behavior is unchanged (keeps `<input type="range">` + its test hooks).

## Deliverable 2 — Branded Results report ("the PDF")

A polished, branded, Esperto-anatomy **per-respondent** report for a single completed submission, the coach/admin's canonical view (G4), printable to PDF. Built from the **current official brand**.

### Anatomy (mirrors the real Esperto personal report; see mockup)

1. **Cover** — Four-Decisions stripe (`.su-stripe-h`) → purple hero → white primary logo (G7) → big Helvetica Neue title = the **instrument name** (`template.name`, e.g. "Rockefeller Habits Checklist") → "Report for: <name> · <job title>" → company + date → S-curve swoosh. The coach's **campaign label** (`campaign.name`, e.g. "Acme Corp Q2 2026") renders as a small subtitle **only when it differs** from the instrument name (Greptile P2 — title is always the instrument, never the coach's label).
2. **Overall result** — banner driven by the template's `tierMetric` (G2): Rockefeller → `countAchieved` + Low/OK/Great band + a one-line **lede** (G8); QSP/LVA → `overallAvg` under a neutral "Submitted" header (no fabricated band); SU Full → ScaleUp ring / mean-of-domains. Plus a short stats row.
3. **Section breakdown** — cards in a grid; domain-colored headers **when the template defines domains** (SU Full), else flat. Each card lists the section's questions with the respondent's **rating** always, and the green-check "achieved" affordance **only when `passThreshold > 0`** (G2).
4. **Scores table** — `section | your score | your per-item average | (rollup/Total)`. **No team/cohort average** (G3).
5. **Recommendations** — the respondent's matched per-question recommendation text (`result.perQuestion[].recommendation`), grouped by section, domain-accented. Rendered **only when present** (SU Full only, today).
6. **Conclusion** — branded thank-you + coach-as-text CTA (G7) + footer (logo + page number, G5) + "Generated by the Scaling Up Assessment platform · Confidential".

### Data — reuse, no migration

The frozen [`ScoreResult`](../../../src/src/lib/assessments/scoring.ts) already carries `perSection` (incl. `averagePoints` → the per-item average for G3), `perQuestion` (incl. matched `recommendation`), `perDomain?`, `tier`, `tierMetricValue`, `scaleUpScore?`. Gaps + (migration-free) fixes:

| Need | Today | Fix |
|------|-------|-----|
| Question labels | `perQuestion[].stableKey` only | Widen the report's server fetch to select `version.questions` (the **CSV export route already does this** — proven pattern). |
| Per-question recommendation text | matched band already in `result.perQuestion[].recommendation` | Already present; render when non-empty. |
| Company name + date | `respondent` + `submittedAt` present; company missing | Add `campaign.organization.name` to the select. |
| Domains / ScaleUp score | present when defined (`perDomain`, `scaleUpScore`) | Render when present; degrade otherwise. |
| Per-item average ("Average" column) | `result.perSection[].averagePoints` (frozen) | Already present; no new computation. |
| **Cover title = instrument name** + coach label subtitle | not selected | Select both; `assessmentName = template.name` (the title), `campaignLabel = campaign.name` (subtitle, shown only when ≠ instrument). Resolves Greptile P2 / round-1 #5. |
| **Non-slider answers** (TEXT/NUMBER/MULTI_CHOICE) | only in raw `AssessmentSubmission.answers` | Select raw `answers` + use `version.questions[].type/label` for the "Additional responses" section (H9). |

### Graceful degradation across the 5 live templates

| Template | Tiers | passThreshold | Domains | ScaleUp | Recs | Report shows |
|----------|-------|---------------|---------|---------|------|--------------|
| **Scaling Up Full** *(parked)* | neutral global | 0 | **5** | **yes** | **yes** | richest — domain cards, ScaleUp ring, recommendations |
| **Rockefeller** | **3 real** | **2** | none | no | none | tier band + **checklist** cards + scores table |
| **QSP v1/v2** | neutral "Submitted" | 0 | none | no | none | "Submitted" + ratings cards + scores; **no checks, no fabricated band** |
| **LVA** | neutral | 0 | none | no | none | as QSP; LVA **group/factor report out of scope** |

Rules: no recommendations → render no recommendations section. `perDomain` absent → flat per-section. `passThreshold === 0` → ratings, no checkmarks (G2). Neutral tier (QSP/LVA) → "Submitted", suppress band coloring/score-emphasis. Only `SLIDER_LIKERT` answers are scored (TEXT/NUMBER/MULTI_CHOICE never appear — by design).

### Where it mounts + print

- **Print route in its OWN route group** (H1): `(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx` — **not** nested under `(portal)`, because a child `layout.tsx` in App Router *nests inside* the parent `(portal)` layout and would still render the sidebar/header. A sibling route group with its own minimal `layout.tsx` (brand css + `.su-public-brand`, no portal chrome) is the only way to get a clean print page. A print regression test asserts no portal nav appears.
- **Auth = privileged-or-owning-coach** (H2): the page uses `getApiActor()` (401 if null) + `canManageCampaign(asAccessDb(db), actor, id, "read")` (404-on-deny/missing) — **not** `requireCoach()`, which would redirect ADMIN/STAFF (e.g. Jeff) away. Authz is enforced **inside** the data loader in the same query (H3 — see below), closing the check-then-fetch stale-read window. Tests cover: admin allow, owning-coach allow, non-owning-coach 404, anon 401.
- **Invited respondents only** (H4): the route is keyed by `respondentId`; public/anonymous submissions have `respondentId = null` and are out of scope for the coach report (they aren't reviewed per-person in `CampaignDetail` anyway).
- **`@media print`** (net-new, per G5 + H5): cover `break-after: page`, `break-inside: avoid` on cards/sections, A4 margins, a **fixed footer with reserved bottom padding** carrying logo + provenance (submission id, template version + content hash, generated timestamp). Page numbers via `@page` margin boxes are **best-effort**; if they prove unreliable in Chrome, drop them — provenance is the requirement, page numbers are not. A "Print / Download PDF" button (`print:hidden`) calls `window.print()`.
- **Canonical entry point (G4)**: the `CampaignDetail` respondent-row results action opens this report **in a new tab via a plain `<a target="_blank" rel="noopener noreferrer">`** (H6 — *not* a Next `<Link>`, which would prefetch every visible respondent's full report into the client cache). The raw inline `AssessmentResultView` `stableKey` view and the raw JSON API `…/respondents/[respondentId]/result` are **retired in Phase 2** (H7) — **phased per H13**: Phase 1 keeps both (inline view de-emphasized, `/result` deprecated + hits logged); Phase 2 removes them once the deprecated-`/result` hit counter reads zero.
- **Audit** (H8): the report page writes a `logAudit({ entityType:"AssessmentSubmission", action:"VIEW_REPORT" })` (mirroring the CSV export route's audit posture), so report views/prints have provenance.

### Additional (non-slider) responses (H9)

Only `SLIDER_LIKERT` answers appear in `ScoreResult.perQuestion`. **LVA** (and any mixed template) also has `TEXT` / `NUMBER` / `MULTI_CHOICE` questions whose answers live only in the raw `AssessmentSubmission.answers`. Since the branded report **replaces** the raw view (G4), it must not *hide* those answers: the report renders an **"Additional responses"** section that joins the raw `answers` to the question definitions (by `stableKey`) and shows the qualitative/numeric answers. The loader therefore also selects raw `answers`.

### Robustness (H10)

The frozen `result` and the version JSON (`questions`/`sections`/`scoringConfig`) are treated as **untrusted at render time**: the loader parses/coerces against the `ScoreResult` + template shapes and the component degrades gracefully (missing label → show `stableKey` as a last resort with a marker; null domain average → omit; **duplicate question/section `stableKey`** → first-wins + a dev warning, never a silent collapse). Tests cover missing labels, null domain averages, malformed `result`, and duplicate keys. (Enforcing `stableKey` uniqueness at *publish* time is a separate template-validation concern — noted as a follow-on, not in this feature.)

### Neutral-tier predicate (H11)

A version is **neutral-tier** when it has a single tier covering the full metric range with `passThreshold === 0` and `tierMetric === "overallAvg"` (QSP v1/v2, LVA). The report uses this predicate (not a hard-coded template list) to decide "show 'Submitted', suppress band coloring/score-emphasis." Tested independently from Rockefeller (real tiers) and SU Full.

### Domain → color map (H12)

SU Full has **five** domains (People/Strategy/Execution/Cash/**You**) but the brand defines only four decision colors. The report uses an explicit `domain→color` map — People `#f7a600`, Strategy `#008bd2`, Execution `#946b36`, Cash `#95c11f`, **You → purple `#522583`** — with an **unknown-domain fallback** (neutral grey). Specified + tested.

### Review hardening — round 3 (ops/SRE)

- **H13 — Phased rollout, not big-bang.** We deploy directly to prod with no feature-flag framework, so the safety mechanism is **sequencing**, not a runtime flag. **Phase 1** ships the report *additively* — the new `(report)` route + the `CampaignDetail` link go live while the **inline raw view stays available (de-emphasized) and the `/result` API is kept** (marked deprecated + its hits logged). Admins verify the report across the live templates first. **Phase 2** (a later release) removes the inline raw view + deletes `/result` **only after telemetry shows the old endpoint is no longer hit**. This satisfies G4 ("raw view goes away") without a window where a report regression strands *all* result review.
- **H14 — Authz + fetch in one transaction.** `getRespondentReport` wraps `canManageCampaign("read")` + the submission `findFirst` in a single `db.$transaction` so an ownership transfer / coach deletion between the two statements can't leak a report once. Tested with a `createdByCoachId` change injected between auth and fetch.
- **H15 — Report route is uncacheable + throttled.** It serves PII: `export const dynamic = "force-dynamic"`, `revalidate = 0`, response headers `Cache-Control: private, no-store`, and `withRateLimit` (per-user/IP) so repeated tab-opens/scripts can't hammer the loader or flood the audit log.
- **H16 — Ops signal, not just audit.** Emit low-cardinality structured log markers — `assessment.report.view{outcome,role,template,degraded}`, `assessment.report.old_result_api.hit`, `assessment.report.print.clicked` — and surface them in `/admin/observability` (spec 06) where cheap. Full alert thresholds/dashboards are deferred to the observability work-stream, but the markers ship now so on-call has signal (esp. the deprecated-`/result` hit counter that gates Phase 2).
- **H17 — Audit action stays zero-migration.** Record the view via an **existing** `AuditAction` value (`EXPORT`) **or** add a `VIEW_REPORT` literal **only if `AuditLog.action` is a plain `String` column** (a TS union, not a Prisma enum). It must **never** become a Prisma enum migration (D5). Include `performedBy`. Verified before implementation.

## Privacy

Rendering a single respondent's report to the **owning coach** is the **already-shipped** behavior (`CampaignDetail` shows it inline today) — no new exposure. With G3 (no team-average), the report touches only the one respondent's data. **Do not** surface the cross-campaign `getAggregateReport` to coaches (it spans other coaches' campaigns). The Esperto CEO-vs-aggregate rule lives only in the admin aggregate path and is untouched.

## Brand scoping (ADR-0005)

- Quiz → `.su-assessment-brand` (existing). Report → `.su-public-brand` (the richer kit already used by registration/thank-you: Four-Decisions stripe, `.su-brandbar`, `.su-logo`, `.su-h1/2/3`, `.su-cta`, purple hero).
- **Never** modify global `:root` or `.wf-scope`. The report sits in the blue portal lane; only its wrapper carries the brand (the brand classes redefine `--primary` on their own subtree only).
- Logo: only `su-logo-white.svg` exists; all placements stay on purple (G7) → sufficient, no new asset.

## Out of scope (v1)

- Auto-emailing results to respondents (the `resultsEmail*` wiring) — deferred (D3).
- A true server-generated PDF file (puppeteer/@react-pdf) — deferred (D2); print-to-PDF covers it.
- Cohort **Aggregate report** / LVA group-factor report / Esperto group + self-comparison reports.
- Rebranding the admin/coach app chrome to purple (ADR-0005 keeps it blue).
- The Verne preface page + book-promo (G8); Esperto-pixel print pagination (G5).
- Imported (Esperto historical) campaigns need no special handling: their CLOSED + SUBMITTED submissions render in the report like any other; no email.
- **Public/anonymous completions** in the coach report (H4 — invited-only). Public-submit **idempotency** + public-submit **audit** (claudex round-2 findings) are pre-existing concerns in the public submit path, tracked separately — not introduced or fixed by this feature.
- localStorage autosave **TTL / "clear saved answers" / shared-device warning** (claudex round-2 low) — autosave shipped in PR #32; a separate hardening follow-on. This feature only ensures the autosave **status shows on real save success**.
- Publish-time `stableKey` **uniqueness enforcement** — separate template-validation concern; the report loader defends against duplicates at render (H10).

## Reference

- Mockups (approved): `/tmp/su-assessment-mockups/{report.html,quiz.html}`.
- Real Esperto report samples: `From Jeff/APP_scaling up assessemnt/` (Rockefeller, QSP v2, LVA, Scaling Up Full).
- Brand: Scaling Up Brand Guidelines (Jeff, 2026-06-05); `src/public/brand/su-logo-white.svg`; `src/src/styles/su-public-brand.css`, `wireframes-scoped.css`.
- ADRs: 0002 (≥1 tier), 0003 (multi-type questions), 0004 (section intro copy), 0005 (assessment brand scope). Glossary: `CONTEXT.md` → **Results report**.
