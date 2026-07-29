# Invited respondents may see their own Results report in place at submit; there is still no durable per-respondent results URL

A **Campaign** may opt in (`AssessmentCampaign.showResultsOnScreen`) to showing an invited **Respondent** their
own **Results report** — the same `BrandedReport` component a coach/admin sees (see the precision note below) —
rendered **in place** immediately after
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

⚠️ **Precision note on "the same report" (round-3 correction).** The *component* is the same and there is no
reduced "respondent edition" — that part holds, and it is the point of decision 1. But the two readers are not
byte-identical: the coach/admin route can pass a Wave S **`peerComparison`** section, which the respondent's copy
structurally cannot receive (it is a separate prop supplied only by the authorized respondent-report page). That
difference is *intended* — peers are cohort data and CEO_ONLY/anonymity rules live upstream of it — but earlier
wording here and in `CONTEXT.md` asserted plain identity, which overstates it. Say "the same report component,
minus cohort sections the respondent is not entitled to".


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
  survey closed seconds after they finished. The report is therefore persisted to **`sessionStorage`** and
  re-read on mount. It survives refresh and Back. ⚠️ **It does NOT reliably "die with the tab"** — an
  earlier draft said so, but `sessionStorage` is copied into a duplicated tab and restored by
  reopen-closed-tab and crash/session restore, so tab lifetime is not a boundary. Show-once is enforced by
  the ownership check plus the `issuedAt` bound, not by the tab. The slot is keyed by
  **campaign alias** (on the refresh being rehydrated, `/me` has already 410'd, so `respondentKey` is
  unavailable).
  ⚠️ **Corrected TWICE under review. Rehydrate needs two checks, and the first draft had neither.**
  **Round 1 — the exchange purge is not the security boundary.** An earlier draft argued "a second invitee can
  only reach the survey in the same tab by arriving with a new `#t=` link". That covers only arrivals *with* a
  token, and the exchange **strips the fragment**, so a plain reload of `/org-survey/{alias}` — the common case
  — never reaches the purge. **The slot is not a credential.**
  **Round 2 — and a live cookie is not an identity.** The round-1 fix rehydrated on a `/me` **410**, on the
  argument that 410 proves a live sealed invitation cookie. That argument is *correct* (the route answers 401
  for a missing or mismatched cookie before it evaluates any lifecycle gate) but it proves the wrong thing:
  **`sessionStorage` is per-TAB while cookies are per-origin**, so "a live invitation exists in this browser"
  says nothing about *whose* report is in a given tab's slot. Two co-invitees on one browser: A submits in tab 1;
  B exchanges in tab 2, replacing the shared cookie and purging only tab 2; B later reloads tab 1 and gets a
  valid 410 on their own cookie — and would have been shown **A's** report.
  **The rule, therefore:** authorization from the server (`/me` 410) **and** ownership from the data (the
  envelope records the invitation it was written for; `/me`'s 410 echoes `respondentKey`; they must match, and
  there is no skip-the-check path). A v1 envelope, which predates the owner field, is discarded rather than
  trusted. `issuedAt` expiry remains as defense in depth — note its magnitude matches the invitation cookie's
  1740s but its **epoch does not** (cookie from exchange, `issuedAt` from submit), so the cookie always lapses
  first and this bound only binds if a caller skips the gate entirely.
  ⚠️ **Residual risk, accepted and NOT closed:** a respondent who submits and walks away from their own unlocked
  browser leaves a readable report until the cookie lapses (≤29 min from the **last** token exchange — and
  `/exchange` is replayable by anyone holding the raw `#t=` token, so that window can be *renewed* rather than
  being an absolute deadline. This does not widen the hole in practice, since holding the raw token already
  grants the invitation outright, but do not state the bound as absolute). There the attacker holds
  both the cookie and the slot, so no server-side check can tell them apart from the respondent. Bounded, not
  prevented — the same exposure as any abandoned logged-in session.
- **A report-model failure never fails the submission.** The model is built in Phase 1, pre-commit and
  lock-free, and a throw degrades to no email row + no payload + the normal thank-you. This is not cosmetic: a
  throw *after* commit would return 500, and the client's retry would then hit the hard double-submit **409** —
  an unrecoverable dead-end with the respondent's answers already saved.
- **`CEO_ONLY` needs no check on this path.** Only the respondent's own `scoreResult` is ever in scope; no
  cohort or aggregate data exists here. `aggregationMode` governs *aggregation*, and the shipped results email
  already gates on the respondent toggle without consulting it. A guard test enforces the absence.
- **Print/Download is load-bearing, not cosmetic** — under show-once it is the only way the respondent keeps
  the report.
- **"Same artifact" required widening the builder, and the first cut did not hold.** Review found that
  `buildRespondentReportFromSubmission` exists for the *public quiz*, where org and coach are genuinely unknown:
  it hardcoded `companyName: ""` (which the cover interpolates unconditionally, emitting an orphan `" · "`),
  omitted `coachLogoUrl`/`coachName`, and hardcoded `degraded: false`. So the respondent's copy would have
  carried **no coach byline** — the exact placement Jeff asked for in #63/#67/#73/#78/#81 and PR #230 shipped
  days earlier. The builder now takes those as optional args (defaulting to the previous values, so public-quiz
  callers are byte-unchanged) and the invited route populates them from data it already reads. The renderers
  additionally guard the separator so an empty org name can never emit a naked `" · "`.
- **A malformed frozen result now propagates a degraded flag.** `ScoreResult` carries no `degraded` field —
  only the authorized DB loader computes it — so the builder is passed `degraded: !isScoreResult(scoreResult)`.
  ⚠️ **Do not overstate this.** Round 2 established it is defence, not a bug fix with an observable victim:
  `computeScoreResult` always constructs `perQuestion`/`perSection` as arrays, so on this path the flag is
  always `false` and nothing changes today. And the *notice* it drives exists only in `BrandedReport` —
  `QualitativeReport` ignores `degraded` entirely, so LVA/QSP respondents would still get no notice. Kept
  because the frozen-result shape is not this route's to guarantee; recorded honestly because the earlier
  wording claimed a fixed user-visible defect that never existed.
- **⚠️ This change widens the audience of an unvalidated coach-controlled `<img src>`.** `coachLogoUrl` is
  `creatorCoach.profileImage`, rendered by `CoachLogo` with no scheme or host validation (tracked in **GH
  #229**). Before this wave that `<img>` appeared only on the authenticated `(report)/` route behind the Report
  access gate; it now also renders to an **unauthenticated respondent** at submit. A coach who sets a remote
  URL therefore causes every respondent on their campaigns to fetch it while their own report renders,
  disclosing IP/UA/timing to that host — and a dead URL now shows a broken image to the client rather than to a
  coach's inbox (the Jeff #69 red-X symptom, relocated). Not fixed here because validation is #229's scope and
  this ships default-OFF, but it must be settled **before the flag is flipped**, not after.
  📌 **STATUS at the flag flip (2026-07-29) — this precondition is being WAIVED, deliberately and on the record,
  not quietly met.** Two facts narrowed it after the paragraph above was written:
  (a) **the threat model is a trusted admin, not a hostile coach.** An earlier version of this bullet said "a
  coach who sets `profileImage` to `https://attacker.example/px.gif`" — **that is wrong.** Coach self-serve goes
  through `/api/portal/profile/image`, which validates MIME type and size and stores a **Vercel Blob** URL. The
  only unvalidated write is `createCoachSchema`/`updateCoachSchema` (`profileImage: z.string().optional()`), and
  both `/api/coaches` and `/api/coaches/[id]` are gated by `isPrivilegedRole` — **ADMIN/STAFF only.**
  (b) What genuinely remains is therefore robustness and privacy hygiene, not a hostile-input hole: an admin typo
  or stale external URL shows a **broken image to a respondent**, and an externally-hosted logo leaks respondent
  IP/UA/timing to that host.
  **Cheapest real mitigation, for whoever picks up #229:** the CSP already carries
  `img-src 'self' data: blob: https://*.vercel-storage.com` — it is merely `Content-Security-Policy-Report-Only`.
  Enforcing it blocks a remote coach logo outright, with a broken image as the visible cost.
- **The flag gates capability, never data.** The wizard hides the checkbox when the flag is off but **does not**
  coerce the stored column, deliberately unlike the `sendResultsToRespondent` precedent.
  ⚠️ **Corrected after review:** an earlier draft of this ADR justified that by a "stale draft `true`" hazard.
  **That hazard cannot occur** — `persistDraft` in `CampaignWizard.tsx` stores only org/template/respondents/
  CEO/name/openAt/endMode/closeAt, never any of the three toggles, so no toggle can be rehydrated `true` from a
  draft. (Which also means the *sibling* coercion defends against something unreachable today.) The decision
  therefore rests only on the durable rule — flags gate capability, not data — plus the fact that the server
  decides disclosure under the lock, so a stored `true` with the flag off promises nobody anything. It has **no
  observable behavioural difference today**, and consequently no behavioural test; see the note in
  `campaign-wizard-onscreen-results.test.tsx`.
- **Imported campaigns are unaffected** — imported submissions never traverse the submit route (coach-operated
  recompute, ADR-0017), so there is no on-screen moment. A future reader should not look for one.
- A future reader should **not** "restore" the rule that invited respondents never see their own report, nor
  add a durable public/respondent results endpoint assuming it was forgotten — the first is superseded here,
  the second remains deliberately unbuilt (ADR-0008 and the deferred option above).

Spec: `docs/specs/v7.6/19an`. Related: ADR-0007 (canonical report), ADR-0008 (public in-place results),
ADR-0010 (two report types), ADR-0012 (Report access gate), ADR-0017 (import recompute).
