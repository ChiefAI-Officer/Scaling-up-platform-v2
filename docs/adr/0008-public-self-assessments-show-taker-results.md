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
- **INVITED flows are untouched** — invited results remain coach/admin-gated (ADR-0007); an invited respondent does **not** get an in-place report on submit. (Spec 17 Wave D #15 adds an *opt-in, approval-gated emailed* results copy for invited respondents — a separate mechanism; see ADR-0009 / 17d.)
- A future reader should not "add" a public per-respondent results page assuming it was forgotten — it was deliberately omitted to avoid an anonymous PII endpoint.
