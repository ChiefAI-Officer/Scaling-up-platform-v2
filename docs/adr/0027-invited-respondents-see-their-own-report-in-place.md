# Invited respondents may see their own Results report in place at submit; there is still no durable per-respondent results URL

A **Campaign** may opt in (`AssessmentCampaign.showResultsOnScreen`) to showing an invited **Respondent** their
own **Results report** — the same `BrandedReport` a coach/admin sees — rendered **in place** immediately after
they submit, instead of the text-only thank-you page. The decision to disclose is made **server-side, under the
submission lock**, and the report travels in the submit response. There is still **no durable, revisitable
per-respondent results URL** for a respondent.

This **supersedes the audience clause of ADR-0007** ("the report is invited-only, **coach/admin-gated**") and
**extends the mechanism of ADR-0008** (submit response carries the `ScoreResult`; client renders in place;
`no-store`; no persisted endpoint) from public takers to invited respondents.

## Context

Jeff Verdun's July-10 tracker, row **#71**: *"On assessment setup, want an option for results to display
on-screen immediately after completion, in addition to (or separate from) emailing them."*

Three facts shaped the decision:

1. **It already half-existed.** Public quiz takers have seen their report in place since ADR-0008. The invited
   submit route already **computes** the score and then **discards** it, returning only `submissionId`. The
   renderer, the report model builder, and both report types (scored + qualitative) were all in production —
   just never wired to the invited flow, and never exposed as a setup option.
2. **The email lane this "adds to" is dormant.** No template has approved results-email copy and no live
   campaign has the email toggle on, so on-screen is currently *the only way* an invited respondent ever sees
   their own result. That raises the value of the item and lowers the credibility of "the email is the copy they
   keep" as a present-tense claim.
3. **ADR-0007 made audience a property of the route, not the artifact.** The report was coach/admin-gated
   because the only way to reach it was a gated route. Nothing about the document itself is coach-specific.

## Considered options

- **Render the same report in place at submit, decided server-side under the lock (chosen).** Reuses the
  existing `buildRespondentReportFromSubmission` seam and `BrandedReport`. No new route, no new authorization
  surface, no durable URL. `sessionStorage` makes it survive a refresh.
- **Define a new, narrower "respondent result view" (rejected).** Two names for one component, and an open
  invitation for a second renderer to drift from the first — exactly the failure mode that forced the
  `CoachLogo` and `ReportFooter` extractions. Jeff asked to *show results*, not to show a reduced result.
- **Add a `/org-survey/{alias}/results` route (rejected).** Tempting because the existing invitation
  iron-session cookie is already path-scoped to `/org-survey/{alias}` and *would* be sent there — one small
  route. But that cookie's `maxAge` is **1740s (~29 min)**, so the page would present as durable and stop
  working within the hour, manufacturing "the link says it's unavailable" support load. It also adds a
  PII-returning endpoint — the precise thing ADR-0008 rejected — for under half an hour of benefit.
- **Build a durable, revisitable "view my result" link (deferred).** Needs respondent-scoped authorization
  built from scratch: a token with its own lifetime, revocation, and enumeration safety. That is a wave, not an
  item. The cheaper honest path to durability is to switch the **results email** on, which is what that lane is
  for.
- **Gate it on the results-email approval hash (rejected).** That hash approves operator-authored *email copy*;
  this render carries none. Since no template is currently approved, coupling them would have shipped the
  feature permanently dark.

## Consequences

- The report is returned **only** when the flag `WAVE_OSR_RESPONDENT_RESULTS_ENABLED` is on **and** the
  campaign's `showResultsOnScreen`, **re-read inside the Phase-2 locked transaction**, is true, **and** the
  disclosure fingerprint is unchanged across the Phase-1 → Phase-2 window. It is never returned unconditionally
  for the client to hide. There is no client-visible flag, so client and server cannot disagree — the presence
  of the payload *is* the signal.
- **No `AuditLog` row is written for this view.** There is no report *route*, so the **Report access gate**
  (ADR-0012) was never in the path; the viewer is the data subject reading their own data, whereas that audit
  exists to track *third parties* touching PII; and the submission row already timestamps the instant. A
  structured log records that a payload was **issued** — deliberately not described as a *view*, which a
  server-side log cannot prove.
- **Show-once, but not refresh-hostile.** `/me` returns 410 once the invitation is `SUBMITTED`, which the
  survey client renders as *"This survey has closed."* — so a state-only report would tell a respondent the
  survey closed seconds after they finished. The report is therefore persisted to **`sessionStorage`** and read
  **before** `/me` on mount. It survives refresh and Back; it dies with the tab. The slot is keyed by
  **campaign alias** (on the refresh being rehydrated, `/me` has already 410'd, so `respondentKey` is
  unavailable), which makes one rule load-bearing: **a fresh token exchange purges the slot**, so one
  respondent can never be shown the previous one's report in a shared tab.
- **A report-model failure never fails the submission.** The model is built in Phase 1, pre-commit and
  lock-free, and a throw degrades to no email row + no payload + the normal thank-you. This is not cosmetic: a
  throw *after* commit would return 500, and the client's retry would then hit the hard double-submit **409** —
  an unrecoverable dead-end with the respondent's answers already saved.
- **`CEO_ONLY` needs no check on this path.** Only the respondent's own `scoreResult` is ever in scope; no
  cohort or aggregate data exists here. `aggregationMode` governs *aggregation*, and the shipped results email
  already gates on the respondent toggle without consulting it. A guard test enforces the absence.
- **Print/Download is load-bearing, not cosmetic** — under show-once it is the only way the respondent keeps
  the report.
- **The flag gates capability, never data.** The wizard hides the checkbox when the flag is off but **does not**
  coerce the stored column, deliberately unlike the `sendResultsToRespondent` precedent. That coercion exists
  because a stale `true` would make the thank-you page promise an email the send path won't deliver — a
  user-visible lie. No such hazard exists here, because the server decides.
- **Imported campaigns are unaffected** — imported submissions never traverse the submit route (coach-operated
  recompute, ADR-0017), so there is no on-screen moment. A future reader should not look for one.
- A future reader should **not** "restore" the rule that invited respondents never see their own report, nor
  add a durable public/respondent results endpoint assuming it was forgotten — the first is superseded here,
  the second remains deliberately unbuilt (ADR-0008 and the deferred option above).

Spec: `docs/specs/v7.6/19an`. Related: ADR-0007 (canonical report), ADR-0008 (public in-place results),
ADR-0010 (two report types), ADR-0012 (Report access gate), ADR-0017 (import recompute).
