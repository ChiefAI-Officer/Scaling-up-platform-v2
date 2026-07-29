# Public self-assessments show the taker their own results in-place; there is no persistent per-respondent results endpoint for public takers

> Recreated 2026-06-15 from `plans/CHANGELOG.md` (PR #45 / Spec 15) — the file was referenced across CLAUDE.md, the CHANGELOG, and ADR-0009 but absent from `docs/adr/`. Content is reconstructed from those references.

A **public** (anonymous, free) self-assessment — e.g. the Scaling Up Quick Assessment — returns the taker's **own results immediately, in-place**: the submit `POST` returns the full `ScoreResult`, and the public client renders it via `BrandedReport` (ScaleUp headline + per-Decision breakdown) with `Cache-Control: no-store`. There is **no persistent per-respondent results endpoint** for public takers. **INVITED flows are unchanged** (their results are coach/admin-gated per ADR-0007; they do not see an in-place report on submit).

## Context

The Quick Assessment (Spec 15, PR #45) is a free public lead-magnet: a person takes the 4-Decisions self-assessment and expects to see their score right away (that immediacy is the product). Unlike invited assessments — where a coach/admin reviews the branded per-respondent report (ADR-0007) and the respondent does not self-serve — the public taker is the audience for their own result. A guarded lead notification still routes to the referring coach (only a known-active coach, via the open-relay guard) + the SU team.

## Considered options

- **Show the taker their results in-place on submit (chosen)** — the submit response carries the `ScoreResult`; the client renders `BrandedReport` immediately; `Cache-Control: no-store` so the PII result isn't cached. Matches the lead-magnet UX (instant gratification) without persisting an anonymous-accessible results URL.
- **Persist a per-respondent public results page (rejected)** — would create an anonymous-accessible results endpoint (a URL that returns PII with no auth), an open data-exposure surface; and public submissions are `respondentId = null`, so there's no natural owner to gate on. Rejected.
- **Treat public like invited — no in-place results, coach reviews only (rejected)** — defeats the public lead-magnet purpose (the taker came to see their own score).

## Consequences

- The public taker sees their result **once, in-place** (submit response → `BrandedReport`), `no-store`; there is no durable public results URL to re-fetch or share.
- A pre-submit **consent line** discloses that the result is shown to the taker and shared with the SU team + the referring coach (if any).
- ⚠️ **SUPERSEDED IN PART (2026-07-29, ADR-0027).** The struck bullet below no longer holds: the mechanism this ADR chose — submit response carries the result, client renders `BrandedReport` in place, `no-store`, no persisted endpoint — has been **extended to INVITED flows**, opt-in per campaign (spec 19an). This ADR's *other* half still holds: there is **no durable per-respondent results endpoint**, for public takers or invited respondents.
- ~~**INVITED flows are untouched** — invited results remain coach/admin-gated (ADR-0007); an invited respondent does **not** get an in-place report on submit.~~ (Spec 17 Wave D #15 adds an *opt-in, approval-gated emailed* results copy for invited respondents — a separate mechanism; see ADR-0009 / 17d.)
- A future reader should not "add" a public per-respondent results page assuming it was forgotten — it was deliberately omitted to avoid an anonymous PII endpoint.
- ⚠️ **AMENDED 2026-07-29 (Wave OSR, PR #236) — the public in-place report now honours its own template alias.** The client that renders this ADR's mechanism (`public-quiz-client.tsx`) hand-built its `RespondentReport` and **omitted `templateAlias`**, so *every* public report resolved to `DEFAULT_REPORT_CONFIG` regardless of instrument, even though the public quiz's **email** twin (`api/quiz/[campaignAlias]/submit`) had always passed the real alias. The field is now threaded, and is **required** on `RespondentReport` so the omission cannot recur silently.
  **This is a real dispatch change on the public surface, not a no-op:** `reportConfigFor` drives report type, tier band, score table and coach CTA, so a PUBLIC campaign on a `REPORT_CONFIG`-mapped alias now renders differently — `qsp-v1` / `qsp-v2` / `leadership-vision-alignment` switch to the **qualitative renderer** outright; `RockHabits` drops its score table; `scaling-up-full` drops its tier band; `five-dysfunctions` drops the coach CTA.
  It was **inert at merge** — a read-only prod check on 2026-07-29 found exactly one PUBLIC campaign, on `scaling-up-quick`, which is absent from `REPORT_CONFIG`. That is a fact about **data**, and `/api/admin/public-campaigns` will accept any published, non-disabled template, so **do not treat it as a guarantee**: creating a PUBLIC campaign on a mapped alias changes what its takers see. The qualitative path on the thinner public payload (`scoringConfig: undefined`, `provenance.versionId: ""`) is covered by a test in `public-quiz-results.test.tsx`.
