# Spec 15 — Scaling Up Quick Assessment (the public "website" assessment)

Status: **plan / contingency** ("just in case" per Jeff's Slack). No build, no DB writes until approved. Assessment-domain (v7.6 library). Reuses the existing public-quiz flow + `domains` scoring + branded report/quiz.

## 1. Context (what Jeff means by "the quick assessment")
Jeff: *"the scaling up quick assessment is the next one i want to see … This one apparently gets a lot of use,"* later clarified as *"the one labeled **website scaling up assessment**"* in the **free** category. Identified in `From Jeff/APP_scaling up assessemnt/`:
- `Website - Scaling up Assessment/Website-scalingup-assessment.xlsx` — sheets `questions` / `email` / `results`; the results copy is titled **"Scaling Up Quick Assessment - Thank you page,"** signed by Verne Harnish, with a complimentary-coaching follow-up CTA.
- `SunHub_ScalingUpQuiz/SU-Quiz.xlsx` — "Scaling Up Quiz," **10-pt scale**, public link `https://scalinguptoolkit.com/s/ScaleUpQA`, coach-match follow-up `https://coaches.scalingup.com/coach-match-after-assessment-form`.

So this is the **free, public, lead-generation 4-Decisions self-assessment** — Scaling Up's own content (no third-party copyright; confirm Scaling Up owns it, which it does).

## 2. What it is
- **Public / free** (no invite) — a marketing/lead-gen quiz coaches share.
- Scores the **4 Decisions** as categories: **People · Strategy · Execution · Cash**, on a **10-pt scale**.
- Results page: per-category (4 Decisions) breakdown + an **insight highlighting the lowest-scored Decision** (and the source's guidance to look at the Decision that *precedes* the lowest), plus a **complimentary coaching follow-up CTA** and a Verne Harnish sign-off.
- Captures the respondent's **email** and (optionally) the **referring coach's email** so results route to the coach + Scaling Up.

## 3. What exists vs. what's new (corrected after `/grill-with-docs`)
**Exists (light config):** the public-quiz flow (`/quiz/[campaignAlias]` page + submit route, PUBLIC accessMode), respondent name+email + optional `referringCoachEmail` capture, public-campaign resolution (accessMode=PUBLIC + alias + published version = instant live URL), full `perDomain`/`perSection` scoring on submit, rate-limiting, the branded quiz + report components. So a public 4-Decisions quiz *as a quiz* is mostly configuration.

**New build — the lead-magnet value, which is NOT assembly:**
- **Taker-facing results [Q1, Q2 → ADR-0008].** The public flow currently shows the taker NO score (bare thank-you; the branded report is coach-gated). The submit POST will **return the taker's `ScoreResult`** and the client renders the 4-Decisions results **in-place** — no persistent public results endpoint/token to leak or enumerate. This is a deliberate, scoped exception to the "no taker-facing results" (D3) policy, for PUBLIC self-assessments only (see `docs/adr/0008-public-self-assessments-show-taker-results.md`).
- **Guarded lead routing [Q3].** `referringCoachEmail` is captured but never routed. On submit, email the taker's info + results to the referring coach **only if it matches a KNOWN active coach** (**trim + lowercase** the email before lookup/storage; match a single ACTIVE coach — claudex R2, avoids casing/format drift fragmenting attribution), otherwise notify only the SU team; always the SU team — closing the open-email-relay abuse vector on this public endpoint. The on-page coaching CTA links out to the coach-match form; CRM/HubSpot deferred.

It also **doubles as the live demo for Spec 14** (a working totals-by-category assessment).

## 4. Design
- **New template** "Scaling Up Quick Assessment" (alias e.g. `su-quick` / `ScaleUpQA`), **PUBLIC** mode.
- **4 domains** (People/Strategy/Execution/Cash); SLIDER_LIKERT items, `scale {min:?, max:10}` (confirm the exact min + item set from the source).
- **Per-Decision result** (`perDomain[].averagePoints`) + overall; optional ScaleUp-style rollup if the source uses one. **Lowest-Decision insight** computed from the per-domain scores (lowest average → highlight + "the Decision that precedes it" note).
- **Content (questions + results copy)** captured from the **live public quiz** (`scalinguptoolkit.com/s/ScaleUpQA`) + the `Website-scalingup-assessment.xlsx` at build time — Scaling Up's own material.
- **Lead-gen wiring:** capture respondent email + optional coach email on submit; route results (email to respondent + coach + Scaling Up). Reuse existing assessment email; the coach-match CTA links out (or integrates with the existing follow-up flow). Confirm whether HubSpot/coach-match integration is in v1 or just an outbound link.
- **Brand:** the shipped branded quiz + report.

## 5. DB-safety (hard constraint — 2 prior prod wipes)
Same as Spec 14 §4.7: **no scripts against prod, no destructive ops.** Create the template via the **admin assessment editor**, or the **additive fail-closed DRAFT seeder** run against **staging first** + admin Publish. Zero schema migration (reuses `ScoreResult` + `domains` + public-quiz config). Template edits + publish must carry the **contentHash/CAS guard** (Spec 14 §4.7, claudex R2) — no last-write-wins. The PUBLIC-launch path is itself a build prerequisite — see §5c item 1.

## 5b. Privacy & consent (claudex R2 — REQUIRED before collecting public leads)
The current public-quiz UI implies responses are shared only with the coach/facilitator, but this tool routes results to the **taker** (on-screen, ADR-0008), the **referring coach** (if a known active coach), **and the Scaling Up team**. Before any public lead capture: update the **pre-submit consent/privacy copy** to disclose all recipients, add a **data-retention** statement, and confirm lawful-basis/PII handling for an open lead form. This is a content/compliance prerequisite, not just code.

## 5c. Security & data-integrity requirements (claudex R2 — fold into the build)
1. **PUBLIC campaign creation gap [High] — corrects §5.** The campaign-create path today produces **DRAFT/INVITED** campaigns and the admin UI **disables PUBLIC mode**, so launching the public quiz would otherwise need a direct DB mutation. v1 must add an **audited, admin-only PUBLIC campaign create/publish flow** (validating `alias` + `accessMode` + open/close window + any `publicConfig`, with a rollback path) — the template editor handles the *template*, but a *public campaign* needs this new guarded flow (keeps us off raw prod scripts).
2. **No-store on results [High].** Return the `ScoreResult` with `Cache-Control: no-store` (mirror the invited submit route); keep results out of URLs/history so PII/results aren't cached by browsers/proxies/edge.
3. **Email injection [High].** Escape every lead/result email body (taker name/email, coach fields) through a template-escaping layer; strip control chars from subjects; test with malicious `firstName`/`lastName`/`referringCoachEmail` values (results go to coaches + staff).
4. **Email abuse / queued delivery [High].** Taker + SU emails ride a public endpoint on an IP-only rate limit — put result emails behind **fail-closed per-email/per-campaign quotas + bot controls + bounce suppression + a queued/outbox delivery path** (not synchronous); send coach mail only after an ACTIVE coach match.
5. **Idempotency + durable outbox [High].** Add a client attempt-id / idempotency key with a **unique DB constraint**, and enqueue result emails in the same transaction via an **outbox keyed by submissionId + recipient role** — so browser retries / crashes / SMTP partial failures can't duplicate submissions/emails or silently lose them.
6. **Audit [Medium].** Audit public submission creation, result return, coach match/suppression, recipient list, idempotency key, IP, and user-agent — for spam investigations, attribution disputes, and PII-disclosure reviews.

These move Spec 15 firmly from "assembly" to a real, security-sensitive public-endpoint build.

## 6. Build outline (when approved)
1. Capture the exact questions + scale + results copy from the live quiz + xlsx (Scaling Up's content).
2. Create the template via the admin editor: 4 domains, 10-pt items, public mode.
3. Results layout: 4-Decisions breakdown + lowest-Decision insight + coaching CTA + sign-off (branded report).
4. Lead-gen: email capture + routing (respondent/coach/Scaling Up); decide coach-match integration vs outbound link.
5. Verify scoring + the public flow on staging; admin publishes.

## 7. Resolved (grill) + still open
**Resolved by `/grill-with-docs`:**
- Taker sees results on screen, returned in the submit response (ADR-0008). [Q1/Q2]
- Lead routing = guarded email to known-coach + SU team on submit; coaching CTA links out; CRM deferred. [Q3]
- Coach attribution = taker-entered `referringCoachEmail` (the source model: "if a coach pointed you here and you shared their email"), not per-coach links — per-coach links are a future enhancement.

**Still open (capture-at-build / product calls):**
- Exact question set + scale floor (0–10 vs 1–10) — capture from the live quiz + xlsx (Scaling Up's own content).
- Whether respondent email is required vs optional (lead-gen vs friction).
- Lowest-Decision "precedes" insight copy.
- Deeper coach-match/HubSpot integration (beyond the outbound link) — later.

## Revision log
- **R2 (claudex round 2, 2026-06-09):** the earlier R2 pass added §5b (privacy/consent), the consolidated §5c security list (PUBLIC-create gap, no-store, email injection, email-abuse/queued delivery, idempotency + durable outbox, audit), and §3 coach-email normalization. This reconciliation added the §5 contentHash/CAS pointer + publicConfig/rollback detail and removed a redundant duplicate §5c.
