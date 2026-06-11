# Spec 16 — Quick Assessment: polished results report, report emails, per-coach links

> Status: APPROVED (brainstorm + frontend-design mockup approved by the user 2026-06-11). Build target.
> Builds on Spec 15 (Quick Assessment) + ADR-0008 (public self-assessments show the taker their results in-place).

## Problem (from live testing)

The public Quick Assessment is live, but: (1) the results page is the **bare, unstyled** `BrandedReport` (its detailed styling was deferred in PR #41 — per-statement rows render with the score digit jammed onto the text); (2) a bare public link has **no coach attribution** ("which coach gets the lead?"); (3) **nobody receives a copy** — the taker sees it once on screen, the SU team gets only a lead-alert summary, the coach gets nothing.

## Decisions (approved)

- **Lead model:** keep the **public website link** (leads → Scaling Up team) AND add **per-coach attributed links** (`?coach=<ref>`); the existing active-coach guard validates — a bad/inactive ref silently falls back to SU-team-only.
- **Distribution:** **email the taker a copy** of their report + send the **referring coach the full report** (upgraded from the lead alert); the **SU team keeps the lead-alert summary**.
- **Email format:** **HTML email, report rendered inline** (no attachment, no persistent/guessable results URL — preserves ADR-0008's privacy stance).
- **Report look:** the approved mockup (`/tmp/su-report-mockup/index.html`) — cover → overall ring/band → per-decision cards (Four-Decisions colors) → score-summary table → detailed breakdown with **aligned score chips** → conclusion + coach CTA → footer. Email/print-safe single column.

## §1 — Report rendering (on-screen)

Implement the approved detailed styling for `BrandedReport` (cover, overall ring + band + meta, per-domain cards with bars, clean score-summary table, **fixed** per-statement rows with right-aligned score chips, conclusion + CTA, footer/provenance). All CSS scoped under `.su-public-brand .su-report` (ADR-0005 — zero leak to admin/coach). Drives both the public in-place results AND the invited `(report)` route (same component).

## §2 — Email-safe report HTML builder

New `src/src/lib/assessments/report-email.ts` → `buildReportEmailHtml({ report, recipientRole })`: returns inline-styled, table-layout **email-safe** HTML matching the mockup (email clients drop external CSS + many features). HTML-escape all interpolated values. Pure + unit-tested. Reuses `report-presentation.ts` helpers. The coach version may add a short "your client just completed this" lead-in; the taker version is "your results."

## §3 — Distribution (durable outbox + Inngest worker)

Extend the existing outbox/worker (Spec 15). New/changed `emailType` + `recipientRole` rows enqueued **in the submission transaction**:
- `TAKER_COPY` → the taker (always; their submitted email). Report HTML via §2.
- `REFERRING_COACH` → the active referring coach **(full report via §2, upgraded from the lead-alert)**.
- `SU_TEAM` → unchanged lead-alert summary (only when an SU address is configured).
Idempotent (the `@@unique([submissionId, recipientRole])` already enforces one row per role); the worker sends each via SMTP with the existing backoff/cron drain. No schema change (`emailType`/`recipientRole` are String columns; the outbox model already exists) — **additive, zero migration**.

## §4 — Per-coach attribution

- `public-quiz-client.tsx`: read `?coach=<ref>` (`useSearchParams`) and send it as `referringCoachEmail` in the submit body. The existing `findActiveCoachByEmail` open-relay guard validates it (active, non-expired coach only); anything else → SU-team-only. (`ref` is the coach's email for v1.)
- Coach portal: a **"Copy my assessment link"** affordance that yields `${APP_URL}/quiz/<publicQuickAlias>?coach=<coachEmail>`, where `<publicQuickAlias>` resolves to the active PUBLIC campaign of the `scaling-up-quick` template. If that resolution is non-trivial, ship the capture (above) first and flag the button as a fast follow.

## §5 — Consent / privacy

Update the consent line + contact-step copy to disclose the **emailed copy** (to the taker, and the full report to the referring coach if any). The active-coach guard prevents a report from being emailed to an arbitrary address. No persistent public results endpoint (ADR-0008 preserved — the report travels inside the email, not via a URL).

## §6 — Safety / process

Additive only — **no migration**. TDD; build gate `CI=true npx next build --turbopack`. Brand stays scoped (ADR-0005). Adversarial review before merge (Greptile dropped → superpowers code-reviewer). Stop at a green PR.
