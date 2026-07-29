# 19an — Wave OSR: on-screen respondent results (Jeff July-10 #71)

**Status:** design, gated → approved 2026-07-29, then shipped (PR #236, squash `26f18701`).
⚠️ **Provenance correction (2026-07-29).** This line originally read "approved … after `/grill-with-docs` +
`/co-validate`". **`/co-validate` never ran on this item** — there is no Codex record for it at any stage, and
the same was true of #225. A gate with a grilling pass did happen (12 decisions settled, four findings F1–F4
that reshaped the plan). What followed was **three `superpowers:code-reviewer` rounds**, not a Codex
second opinion. Do not cite this spec as Codex-validated.
**Why it matters rather than being pedantry:** round 1's own security fix was **wrong** — it proved "a live
cookie exists" and treated that as "this is whose report this is" — and round 2 caught it only after it was
committed and merged. That is precisely the class of error a second opinion is for.
**Tracker row:** Jeff July-10 **#71** — "Campaign Setup – option to show results on-screen immediately after
completion".
**Jeff's ask, verbatim:** "On assessment setup, want an option for results to display on-screen immediately
after completion, in addition to (or separate from) emailing them. … Worth confirming with Gabriel whether this
already exists in some form before treating as net-new."

**Flag:** `WAVE_OSR_RESPONDENT_RESULTS_ENABLED` / `WAVE_OSR_RESPONDENT_RESULTS_KILL` (default-OFF).
**Migration:** one column — `AssessmentCampaign.showResultsOnScreen`.
**Supersedes:** the audience clause of **ADR-0007**; extends the mechanism of **ADR-0008**. New ADR required.

---

## 1. What this is

An invited respondent who completes an assessment sees **their own Results report rendered in place**, on the
screen, immediately after submitting — instead of the current text-only thank-you page — when the campaign
opts in.

It is **the same artifact, shown to a new audience**: the identical `BrandedReport` a public quiz taker already
sees today. The report's audience was never intrinsic to the artifact; it was a property of the *route* it was
reachable through.

### Answering Jeff's own caveat

It **partly exists already**. Public 4-Decisions quiz takers DO see their report on screen today
(`public-quiz-client.tsx`'s `results` step → `BrandedReport`, per ADR-0008). Invited respondents do not — their submit
route computes `scoreResult` and **discards it**, returning only `{ submissionId }`.
So the renderer, the report model, and both report types are already in production; they were simply never
wired to the invited flow, and never exposed as a setup option.

### Why it is worth more than the row suggests

The email lane Jeff framed this as being "in addition to" is **dormant**: all 12 templates have
`resultsEmailSubject` null and `resultsEmailContentApproved` false, and all 6 live campaigns have
`sendResultsToRespondent: false`. On-screen would currently be **the only way an invited respondent ever sees
their own result**.

---

## 2. Scope

**In:**
1. `AssessmentCampaign.showResultsOnScreen Boolean @default(false)`.
2. `wave-osr-flags.ts` — `_ENABLED` + `_KILL`, mirroring `wave-w-flags.ts`.
3. Submit route: build the report model once in Phase 1; decide disclosure **under the Phase-2 lock**; return it
   only when permitted.
4. `org-survey-client`: terminal `results` step rendering `BrandedReport` + `PrintReportButton`, with
   `sessionStorage` rehydrate so refresh/Back work.
5. Campaign wizard: one checkbox (+ an operator warning when the results email is dormant).
6. New ADR + supersession pointers into ADR-0007/0008 + `CONTEXT.md` audience clause.

**Out (deliberately, after review):**
- `AssessmentTemplate` default column and the template-editor surface. Jeff asked at *Campaign Setup*; #46
  symmetry is sugar he did not request, and the editor surface — not the column — is the real cost. A defaulted
  boolean added later is trivial under the existing Migration Safety Gate.
- The public-quiz `templateAlias` omission and making that field required on `RespondentReport` → **GH issue**.
- `PrintReportButton` missing from the public quiz → **GH issue**.
- Any durable/revisitable "view my result" link → a separate wave (§4, option iii).

---

## 3. Decisions (12, from the gate)

| # | Decision |
|---|---|
| 1 | **Same artifact, new audience.** Not a new narrower "respondent view" — that would put two names on one component and invite a second renderer to drift (the smell that forced the `ReportFooter` / `CoachLogo` extractions). |
| 2 | **Show-once at submit, plus `sessionStorage` rehydrate.** See §4. |
| 3 | **No `AuditLog` row.** There is no report *route*, so the Report access gate (ADR-0012) was never in the path. The viewer is the data subject reading their own data; the audit exists to track *third parties* touching PII; the submission row already timestamps the instant. Ledgered, not silent. |
| 4 | **Own individual result only; no `aggregationMode` check.** Satisfied *by construction* — only the respondent's own `scoreResult` is in scope, no cohort data exists on this path. Precedent is explicit: `buildWaveDOutboxRows` (`submit/route.ts`) gates the results email without ever reading `aggregationMode`, and `aggregate-report.ts` scopes that mode to *aggregation*. Guard test enforces it. |
| 5 | **Campaign column only.** |
| 6 | **No qualitative branch.** `BrandedReport` self-dispatches on `reportConfigFor(report.templateAlias).reportType`. Guaranteed correct structurally by decision 11 — the server builds the model, so `templateAlias` is never hand-set. |
| 7 | **Independent of the results-email approval hash.** `isResultsEmailApproved` gates the *email* because the email carries operator-authored copy needing approval; this render carries none. Coupling them would ship the feature permanently dark, since no template is approved. |
| 8 | **Flagged, with a KILL lever** — respondent-facing *and* it reverses an ADR. Flags gate **capability, never persisted data**: a killed flag stops the render, the stored toggle keeps its value. |
| 9 | **Print/Download included, and load-bearing** — under show-once it is the only way the respondent keeps the report. Reuse `PrintReportButton` (#64). Print geometry must be **visually verified**: A4 at 14mm ≈ 688 CSS px, below the 720px breakpoint, and that media block is not `screen`-qualified (the #230 lesson). |
| 10 | **Three failure modes, kept distinct.** See §5. |
| 11 | **The server builds the `RespondentReport`; the client builds no model.** |
| 12 | **Imported campaigns: N/A.** Imported submissions never traverse the submit route (coach-operated recompute, ADR-0017). Recorded so a future reader does not look for it. |

---

## 4. Show-once, and why not the alternatives

| Option | Cost | Verdict |
|---|---|---|
| **(i) In place at submit** | The score is already computed. Return it; render it. No route, no authz, no durable URL. | **Chosen** |
| (ii) A `/org-survey/{alias}/results` route | The existing invitation cookie *is* path-scoped to `/org-survey/{alias}`, so it would be sent — one route. But the cookie's `maxAge` is **1740s ≈ 29 min** (`invitation-cookie.ts` (`COOKIE_MAX_AGE_SECONDS`)). | Rejected |
| (iii) A durable "view my result" link | New respondent token, lifetime, revocation, enumeration safety. | Deferred — a wave |

**(ii) is rejected** because a 29-minute window is worse than either neighbour: it *presents* as durable, so it
manufactures "the link says unavailable" support load, and it adds a PII-returning route — the precise thing
ADR-0008 rejected — to buy half an hour.

**A correction worth recording:** the incoming brief for this item asserted "there is no respondent-scoped
access path today." That is false. `getInvitationSession(campaignAlias)` (`invitation-cookie.ts`) resolves an
iron-session cookie issued at `/exchange` and *is* a respondent-scoped auth path. It is simply (a) path-locked
to `/org-survey/{alias}`, so it never reaches the report routes under `(report)/assessments/[id]/…`, and
(b) ~29 minutes long. Nothing destroys it at submit.

### Refresh must not dead-end (the reason for `sessionStorage`)

`/me` returns 410 once `invitation.status === "SUBMITTED"` (`me/route.ts` (the `SUBMITTED` lifecycle gate)), and the client renders 410 as
**"This survey has closed."** (`org-survey-client.tsx` (the error phase)). If the report lived only in React state, a refresh
or Back after viewing results would tell someone who just completed the assessment that the survey is closed.
That is a defect, not an accepted trade-off of show-once.

So the client persists the server-built report to **`sessionStorage`**. Survives refresh and Back. Precedent:
`useAnswerDraft` already persists **answers** to `localStorage` keyed per respondent, so `sessionStorage` here
is strictly narrower exposure than what already ships.

⚠️ **Corrected:** this line previously read "dies on tab close — which *is* show-once". That is wrong, and it
was doing rhetorical work it could not support: `sessionStorage` is **copied** into a duplicated tab and
**restored** by reopen-closed-tab and by crash/session restore. Show-once is enforced by the ownership check
plus the `issuedAt` bound — never by tab lifetime.

⚠️ **Revised TWICE under review — rehydrate needs authorization AND ownership.** The slot is keyed by
**campaign alias** (the client has no `respondentKey` of its own on the refresh being rehydrated).

*Round 1:* the first cut read the slot *before* any server call, relying on the token-exchange purge to keep
respondents apart. Wrong — the exchange **strips the fragment**, so a plain reload never hits the purge, and the
slot would have rendered a full report to whoever next reloaded an abandoned tab. **The slot is not a
credential.**

*Round 2:* gating on a `/me` **410** is necessary but **not sufficient**. The 410 genuinely proves a live sealed
cookie (401 comes first for a missing/mismatched one), but **`sessionStorage` is per-tab while cookies are
per-origin**, so it proves only that *some* live invitation exists in this browser — not that it owns this tab's
slot. A co-invitee who exchanges in another tab replaces the shared cookie while this tab keeps the first
respondent's report; their reload 410s legitimately and would have rendered it.

**Final rule:** rehydrate only when (a) `/me` answers 410, and (b) the envelope's recorded `respondentKey`
matches the one that 410 echoes. Blank or mismatched ⇒ refuse *and* purge; a pre-ownership `v1` envelope is
discarded. Expiry stays as defence in depth, with the caveat that its epoch (submit) differs from the cookie's
(exchange), so the cookie always lapses first.

**Accepted residual:** an abandoned *own* browser still exposes the report until the cookie lapses (≤29 min).
The attacker holds both cookie and slot, so this is bounded, not preventable server-side.

---

## 5. Failure modes — three, kept distinct

| Mode | Submission | Behaviour |
|---|---|---|
| **Scoring throws** (`ScoringValidationError`) | never commits | The **existing submit-failure path**: inline error, back to the pager (the R2-M1 recovery). **Not** thank-you, **not** a report. There is nothing to thank them for. |
| **`result.degraded === true`** | committed | Render the report **with** its degraded notice. Falling back to thank-you would be *worse* than the graceful path that already ships. ⚠️ **Precision (round-3 correction):** the notice exists only in `BrandedReport`. `QualitativeReport` ignores `degraded` entirely, so LVA/QSP respondents get the report with **no** notice. Do not read this row as a guarantee across both renderers — see ADR-0027. |
| **Report-model build fails** | must still succeed | Build in **Phase 1 (pre-commit, lock-free)** and swallow the failure into "no payload → normal thank-you", mirroring `buildWaveDOutboxRows`' contract that a render failure never affects the submission. |

**Why the third is severe if done wrong:** a throw *after* commit returns 500; the client's retry path then hits
the **hard 409** double-submit guard (`submit/route.ts`, `:395`, `:542`, `:645`) — the respondent is
dead-ended while their submission is actually saved.

---

## 6. The disclosure decision is made under the lock

The route already has the exact machinery. `emailRenderFingerprint` (`emailRenderFingerprint` in `submit/route.ts`) fingerprints the
Phase-1 *unlocked* read of the toggle-shaped fields; Phase 2 re-reads them under
`SELECT id FROM assessment_invitations … FOR UPDATE` and drops any prepared row whose inputs changed in the
Phase-1 → Phase-2 window (approval revoked, toggle flipped, version swapped).

**`showResultsOnScreen` joins that fingerprint and that locked select.** The report payload is emitted only when
the **locked** value ∧ the flag permit it.

Two consequences:
- The report is **never** returned "universally with the client hiding it."
- There is **no client-side flag plumbing**. `WAVE_OSR_*` is a server env var; presence of the payload in the
  response is the entire signal. Client and server cannot disagree.

---

## 7. Wizard behaviour

One checkbox, hidden when the flag is off. **The stored value is never coerced.**

This deliberately does *not* copy the `sendResultsToRespondent` precedent at `CampaignWizard`'s `sendResultsToRespondent` force-false, which
force-`false`s on flag-off. That coercion exists for a specific reason — otherwise the thank-you page would
**promise an email the send path will not deliver**, a user-visible lie. That hazard does not exist here:
under §6 the server decides and payload-presence is the only signal, so a stale `true` in a draft promises
nobody anything. Storing operator intent and gating it server-side is both safer and consistent with the
standing rule that flags gate capability, not data.

**Operator warning:** when on-screen is ON and the results email is OFF or unapproved, the wizard says so — the
respondent gets exactly one look at their result. This turns an invisible consequence into an informed choice.

---

## 8. Implementation order

1. Migration — one column.
2. `wave-osr-flags.ts`.
3. Submit route — hoist `buildRespondentReportFromSubmission` out of the email branch (build once, reuse for the
   #15 row when that is also on); add `showResultsOnScreen` to the fingerprint + locked select; return the
   report only when permitted; keep `NO_STORE_HEADERS`.
4. `org-survey-client` — `results` step + `sessionStorage` + `PrintReportButton`.
   **Must `import "@/styles/su-public-brand.css"` and `"@/styles/su-report.css"`.** These are imported in only
   two places today (`(report)/layout.tsx:19`, `public-quiz-client.tsx`) and this client has neither, so the
   report would otherwise render **completely unstyled**.
5. Wizard checkbox + operator warning.
6. ADR + `CONTEXT.md`.

**Detail:** `RespondentReport.submittedAt` is a `Date` and will not survive JSON — revive on the client or widen
the type at the boundary.

**Copy interaction:** with on-screen ON the thank-you page is bypassed entirely, so "your coach will review your
results with you" loses its home. It needs a place on the report screen.

---

## 9. Test plan (RED first)

1. Toggle off → thank-you redirect unchanged.
2. Toggle on ∧ flag on → report renders in place.
3. Flag off → no payload **even with the toggle stored `true`**, and the stored value is **not mutated**.
4. Toggle flipped off between Phase 1 and Phase 2 → **no payload** (the locked re-read).
5. Report-model build failure → submission still succeeds, response carries no payload, client shows thank-you.
6. Scoring throws → submit-failure path; not thank-you, not a report.
7. `result.degraded` → report renders **with** the degraded notice *on the scored renderer only* (`QualitativeReport` has none).
8. Qualitative alias → qualitative render (via the server-built `templateAlias`).
9. Cohort/aggregate data can never reach this render.
10. `sessionStorage` rehydrate survives refresh; absent/corrupt ⇒ no crash.

---

## 10. Risks

- The submit response now carries full PII — already `no-store` via `NO_STORE_HEADERS`.
- Reversing ADR-0007's audience rule is the substantive risk; the new ADR is the mitigation.
- **GH #224** ("Honest & confidential" copy vs `FULL_VISIBILITY`) gets more load-bearing once respondents see
  their own report — re-read it while in here.
- Print geometry (decision 9 / the #230 lesson).

---

## 11. Ops

Write the flag via the **Vercel REST API** as `type:"encrypted"` — never piped `vercel env add`, which has
defaulted to `sensitive` since CLI 51.8.0 and yields a var whose value can never be read back. Then
**redeploy**: env injects at build time.

Production is `prj_xcAWuAmGZAU3DCHgAauRv2WPKneo` under team `scaling-up` — **not** `chief-aio-fficer`, whose
same-named project has 0 env vars and will make a reader conclude "no flags are set."
