# Scaling Up Quick Assessment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to implement this task-by-task. Steps use checkbox (`- [ ]`) syntax. Spec: [`15-scaling-up-quick-assessment.md`](./15-scaling-up-quick-assessment.md) + [`../../adr/0008-public-self-assessments-show-taker-results.md`](../../adr/0008-public-self-assessments-show-taker-results.md).

**Goal:** Build the public, free, lead-gen **Scaling Up Quick Assessment** (4-Decisions self-assessment) — taker sees their results immediately; a guarded notification routes the lead to the referring coach (if a known active coach) + the Scaling Up team.

**Architecture:** Reuse the existing public-quiz flow (`/quiz/[alias]`), `domains` scoring (4 Decisions = 4 categories), and the branded report. New pieces: (a) the Quick Assessment **template** (DRAFT seed → admin publish), (b) an **audited admin PUBLIC-campaign create/publish flow** (admin UI today only does INVITED), (c) the submit route **returns the ScoreResult** (`no-store`) for in-place results (ADR-0008), (d) a **durable email outbox + idempotency** (additive migration) feeding an **Inngest** lead-email job with escaping + a known-active-coach guard, (e) consent copy + audit.

**Tech stack:** Next.js App Router (Turbopack 16.1.6), Prisma/Neon, Inngest, nodemailer (`smtp-transport`), Jest + RTL. Source under `src/src`; run from `src/`. Build gate: `CI=true npx next build --turbopack`.

**Branch:** `feat/scaling-up-quick-assessment` off `main` (work in-repo, not a worktree). **DB-safety:** no `prisma migrate reset/dev` against prod; only **additive** migrations via `migrate deploy`; template + campaign creation via the app's guarded admin path / additive DRAFT seeder on staging. **Stop at a green, Greptile-reviewed PR** — the actual prod PUBLIC-campaign launch is a separate confirmed step.

---

## File structure (what each new/changed file owns)
- `src/prisma/seed-scaling-up-quick-assessment.ts` — **(new)** content module + DRAFT seed entry (4 Decisions, 10-pt). Content captured from Scaling Up's own public quiz (`scalinguptoolkit.com/s/ScaleUpQA`) + `From Jeff/.../Website-scalingup-assessment.xlsx`. Mirrors `seed-scaling-up-full-assessment.ts`.
- `src/prisma/migrations/<ts>_add_quick_assessment_outbox_idempotency/migration.sql` — **(new, additive)** `AssessmentEmailOutbox` model + `AssessmentSubmission.idempotencyKey` (nullable) + partial unique index.
- `src/src/lib/assessments/quick-assessment-lead.ts` — **(new)** pure helpers: known-active-coach check, recipient resolution, escaped email body builders, lowest-Decision insight.
- `src/src/inngest/functions/quick-assessment-lead-email.ts` — **(new)** Inngest fn: drains outbox rows → `sendEmailViaSMTP` with retries + telemetry.
- `src/src/app/api/quiz/[campaignAlias]/submit/route.ts` — **(modify)** return `scoreResult` + `Cache-Control: no-store` + idempotencyKey + audit + enqueue outbox in the submission transaction.
- `src/src/components/assessments/public-quiz-client.tsx` — **(modify)** render results in-place (BrandedReport) from the response instead of redirecting; pre-submit consent copy.
- `src/src/app/api/admin/public-campaigns/route.ts` — **(new)** audited admin-only PUBLIC campaign create + publish (admin role required; alias/openAt/closeAt/publicConfig validation).
- `src/src/app/(dashboard)/admin/assessments/public-campaigns/...` — **(new)** minimal admin UI page to create/publish a PUBLIC campaign for a published template.
- Tests under `src/src/__tests__/...` per task.

---

## Task 1 — Capture content + build the seed module (DRAFT, no publish)
**Files:** Create `src/prisma/seed-scaling-up-quick-assessment.ts`; Test `src/src/__tests__/assessments/quick-assessment-seed-content.test.ts`.

- [ ] **Step 1 — Capture the source content.** From the live public quiz `https://scalinguptoolkit.com/s/ScaleUpQA` (Scaling Up's own content) + `From Jeff/APP_scaling up assessemnt/Website - Scaling up Assessment/Website-scalingup-assessment.xlsx`, record: the exact statements, the **10-pt** scale (confirm 0–10 vs 1–10), the 4-Decisions grouping (People/Strategy/Execution/Cash), and the results-page copy (lowest-Decision insight + coaching CTA + sign-off). Save raw capture notes alongside the seed module as comments. *(SU's own content — do not transcribe any third-party copyrighted instrument.)*
- [ ] **Step 2 — Write the failing content test.** Assert `buildQuickAssessmentContent()` returns: 4 sections each tagged `domain` ∈ {people,strategy,execution,cash}; every question `type: "SLIDER_LIKERT"` with `scale {min, max:10}`; `scoringConfig.domains` has the 4 Decisions with neutral per-domain tiers; `tierMetric: "overallAvg"`; `rollup.overall: "meanOfDomains"`; `scaleUpScore: true`; no unresolved placeholder strings. Model the shape on `seed-scaling-up-full-assessment.ts` (`DOMAINS`/`TIERS`/`SCORING_CONFIG`).
- [ ] **Step 3 — Run it red:** `cd src && npx jest quick-assessment-seed-content -- ` → FAIL (module missing).
- [ ] **Step 4 — Implement `buildQuickAssessmentContent(): SeedContent`** returning the captured questions/sections/scoringConfig (4 Decisions domains, 10-pt). Wire a DRAFT seed entry using `ensureTemplateVersionContent(tx, content)` exactly like the Full seed (idempotent, fail-closed, never publishes).
- [ ] **Step 5 — Green:** rerun the test → PASS.
- [ ] **Step 6 — Commit:** `feat(assessments): Scaling Up Quick Assessment seed content (4 Decisions, 10-pt, DRAFT)`.

> Seeding to a DB is **not** part of this PR. The seeder runs later against **staging**, and an admin publishes. No prod scripts.

---

## Task 2 — Additive migration: email outbox + submission idempotency
**Files:** Modify `src/prisma/schema.prisma`; the migration SQL is generated; Test `src/src/__tests__/assessments/outbox-schema.test.ts` (shape) — or fold into Task 5 runner tests.

- [ ] **Step 1 — Add models (additive only).** In `schema.prisma`: add `AssessmentSubmission.idempotencyKey String?` and a new model:
```prisma
model AssessmentEmailOutbox {
  id             String    @id @default(cuid())
  submissionId   String
  recipientEmail String
  recipientRole  String    // "REFERRING_COACH" | "SU_TEAM"
  emailType      String    // "QUICK_ASSESSMENT_LEAD"
  subject        String
  bodyHtml       String
  status         String    @default("PENDING") // PENDING | SENT | FAILED
  attempts       Int       @default(0)
  lastError      String?
  sentAt         DateTime?
  nextAttemptAt  DateTime  @default(now())
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  submission     AssessmentSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  @@unique([submissionId, recipientRole]) // idempotent enqueue
  @@index([status, nextAttemptAt])
  @@map("assessment_email_outbox")
}
```
Add the back-relation + `idempotencyKey` to `AssessmentSubmission`, and a partial unique index via raw SQL in the migration: `CREATE UNIQUE INDEX assessment_submissions_idempotency_key_unique ON assessment_submissions ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;`
- [ ] **Step 2 — Generate the migration** (locally, against a dev DB): `npx prisma migrate dev --name add_quick_assessment_outbox_idempotency --create-only`, then hand-add the partial unique index SQL. Confirm the SQL is **additive only** (CREATE TABLE/COLUMN/INDEX) so `scripts/check-migration-safety.mjs` passes with no `-- @approved` needed.
- [ ] **Step 3 — `npx prisma generate`**; confirm types compile.
- [ ] **Step 4 — Commit:** `feat(db): additive email-outbox + submission idempotency for public quiz`.

> Migration applies on deploy via `prisma migrate deploy` (already in the build script). It is additive — never a reset. This **corrects the spec's "zero migration"** note (Spec 15 §5 reuse claim) — the hardening requires this small additive change.

---

## Task 3 — Lead helpers (pure, fully unit-tested)
**Files:** Create `src/src/lib/assessments/quick-assessment-lead.ts`; Test `src/src/__tests__/assessments/quick-assessment-lead.test.ts`.

- [ ] **Step 1 — Failing tests** for:
  - `escapeHtml(value)` round-trips `< > & " '` (reuse the existing `escapeHtml` from `lib/templates/interpolate-content-html.ts` if exported; else add + test). Test malicious `firstName`/`lastName`/`referringCoachEmail` (`<img onerror=...>`, control chars) → escaped, control chars stripped from subjects.
  - `lowestDecision(perDomain)` → returns the domain with the lowest `averagePoints` (+ the "preceding Decision" per the order People→Strategy→Execution→Cash); ties resolve to the earliest in order; empty → null.
  - `resolveLeadRecipients({ referringCoach, suTeamAddress })` → always includes SU team; includes the coach **only when** `referringCoach` is a known ACTIVE coach (caller passes the resolved coach or null).
  - `buildLeadEmail({ taker, perDomain, lowest, recipientRole })` → returns `{ subject, bodyHtml }` with all interpolated values escaped; subject has no newlines.
- [ ] **Step 2 — Red:** `npx jest quick-assessment-lead` → FAIL.
- [ ] **Step 3 — Implement** the pure helpers (no DB, no I/O). Keep `escapeHtml` shared with the templates layer (DRY).
- [ ] **Step 4 — Green.** **Step 5 — Commit:** `feat(assessments): pure lead helpers (escape, lowest-decision, recipients, email body)`.

---

## Task 4 — Known-active-coach lookup (DB, injectable)
**Files:** Add `findActiveCoachByEmail(db, email)` to `quick-assessment-lead.ts` (or a `-db.ts` sibling); Test `src/src/__tests__/assessments/active-coach-lookup.test.ts` with a mocked db.

- [ ] **Step 1 — Failing test:** given a mocked `db.coach.findUnique`, `findActiveCoachByEmail(db, "A@x.com")` lowercases/trims the email, returns the coach only when `certificationStatus === "ACTIVE"` (use `CERTIFIED_STATUS` from `lib/auth/coach-status.ts`) AND (`certificationExpiry` null OR future); else null. (Matches the recon's guard.)
- [ ] **Step 2 — Red. Step 3 — Implement** (normalize email → `findUnique({where:{email}})` selecting `id,email,firstName,lastName,certificationStatus,certificationExpiry` → apply guard). **Step 4 — Green. Step 5 — Commit.**

---

## Task 5 — Inngest lead-email worker (drains the outbox)
**Files:** Create `src/src/inngest/functions/quick-assessment-lead-email.ts`; register it; Test `src/src/__tests__/inngest/quick-assessment-lead-email.test.ts`.

- [ ] **Step 1 — Failing test** (mock db + `sendEmailViaSMTP`): on event `assessment/quick-lead.enqueued` `{submissionId}`, the fn loads PENDING outbox rows for that submission, sends each via `sendEmailViaSMTP({to,subject,html,telemetry})`, marks `status:"SENT"`+`sentAt`; on send throw → `attempts++`, `lastError`, `status` stays PENDING with backoff `nextAttemptAt`; a row already `SENT` is skipped (idempotent re-run). Assert SU-team row always present; coach row only if enqueued.
- [ ] **Step 2 — Red. Step 3 — Implement** the Inngest fn (mirror existing `inngest/functions/*` patterns; use `step.run`). Fail-closed quota: cap sends per campaign per window (read a count; if exceeded, leave PENDING + log). **Step 4 — Green. Step 5 — Commit:** `feat(inngest): durable lead-email worker for public quiz`.

---

## Task 6 — Public submit route: results + no-store + idempotency + audit + enqueue
**Files:** Modify `src/src/app/api/quiz/[campaignAlias]/submit/route.ts`; Test extend `src/src/__tests__/api/quiz-submit-*.test.ts` (or create `quick-assessment-submit.test.ts`).

- [ ] **Step 1 — Failing tests:**
  - Response now includes `data.scoreResult` (the full `ScoreResult`) and the response carries `Cache-Control: no-store`.
  - Accepts an `idempotencyKey` in the body; a duplicate key returns the **same** submission (no second row) — relies on the partial unique index (catch P2002 → fetch existing).
  - On success, an `AuditLog` row is written (`entityType:"AssessmentSubmission"`, `action:"CREATE"`, `performedBy: publicTaker.email`, `ipAddress`/`userAgent`, no full PII beyond what's needed).
  - Outbox rows are enqueued **in the same transaction** as the submission: an `SU_TEAM` row always; a `REFERRING_COACH` row only when `findActiveCoachByEmail` resolves; then an Inngest event is sent (mock `inngest.send`).
  - Existing behavior preserved: non-PUBLIC → 403, not-open → 410, invalid → 400, rate-limited → 429.
- [ ] **Step 2 — Red. Step 3 — Implement** the edits per the recon's exact handler: add `idempotencyKey` to `PublicSubmitBodySchema`; wrap submission create + outbox enqueue in `db.$transaction`; add `scoreResult: result` to the response `data`; add `{ headers: { "Cache-Control": "no-store" } }`; `logAudit(...)`; resolve coach + enqueue outbox; `inngest.send({name:"assessment/quick-lead.enqueued", data:{submissionId}})`. **Step 4 — Green. Step 5 — Commit:** `feat(quiz): return results (no-store) + idempotency + audit + lead enqueue`.

---

## Task 7 — Public client: in-place results + consent copy
**Files:** Modify `src/src/components/assessments/public-quiz-client.tsx`; Test `src/src/__tests__/components/public-quiz-results.test.tsx`.

- [ ] **Step 1 — Failing RTL tests:** after a mocked successful submit returning `scoreResult`, the client renders the **in-place results** (4-Decisions per-domain breakdown via `BrandedReport`/the report-presentation helpers + the lowest-Decision insight + coaching CTA) instead of navigating away; a pre-submit **consent line** is shown disclosing that results go to the taker, the referring coach (if any), and the Scaling Up team; submit sends a generated `idempotencyKey`.
- [ ] **Step 2 — Red. Step 3 — Implement:** add a `"results"` step; on success set results state from `body.data.scoreResult` (don't `router.push`); render `<BrandedReport report={...}/>` built from the taker + scoreResult (recon §3 shows the shape; `report-presentation.ts` has no server-only deps); add consent copy near the submit button; generate a stable `idempotencyKey` (crypto.randomUUID) per attempt. **Step 4 — Green. Step 5 — Commit:** `feat(quiz): in-place 4-Decisions results + consent copy`.

---

## Task 8 — Audited admin PUBLIC-campaign create/publish
**Files:** Create `src/src/app/api/admin/public-campaigns/route.ts` (+ a `[id]/publish` route); a minimal admin page under `src/src/app/(dashboard)/admin/assessments/public-campaigns/`; Test `src/src/__tests__/api/admin-public-campaigns.test.ts`.

- [ ] **Step 1 — Failing tests:** POST requires an **admin/STAFF** actor (`getApiActor` → `isPrivilegedRole`; coaches → 403); validates `{templateId, name, openAt, closeAt?, publicConfig?}`; resolves the **published** version (422 if not published, mirroring `resolvePublishedTemplateVersion`); creates the campaign with `accessMode:"PUBLIC"`, `status:"DRAFT"`, generated `alias`, `createdByCoachId:null`; writes an `AuditLog`. A separate publish action flips `status` DRAFT→ACTIVE (admin-only, audited). No `organizationId`/respondents required (PUBLIC has none).
- [ ] **Step 2 — Red. Step 3 — Implement** the route(s) reusing the alias generation + `resolvePublishedTemplateVersion` from `assessment-campaigns/route.ts`, but admin-gated and PUBLIC-shaped; add a minimal admin page (pick a published template → name + window → Create → Publish). **Step 4 — Green. Step 5 — Commit:** `feat(admin): audited PUBLIC-campaign create/publish flow`.

---

## Task 9 — Integration, build gate, PR
- [ ] **Step 1 —** `cd src && CI=true npm run test -- quick-assessment quiz-submit public-quiz-results admin-public-campaigns quick-assessment-lead active-coach-lookup --passWithNoTests` → all green.
- [ ] **Step 2 —** `npx eslint` on all changed files → clean.
- [ ] **Step 3 —** `CI=true npx next build --turbopack` → clean.
- [ ] **Step 4 —** Push branch, open PR, run **greploop** (Greptile) → fix → re-review until 5/5 / zero unresolved.
- [ ] **Step 5 —** SoT: `plans/CHANGELOG.md` entry + `CLAUDE.md` anchor; `notion-task`. Stop at the green PR for the user to merge.

> **Post-merge, separate confirmed step (NOT this PR):** seed the template to **staging** → admin publishes → admin creates + publishes the PUBLIC campaign → smoke-test the live public quiz → verify lead emails + consent. Then (with the user) promote to prod.

---

## Self-review notes
- **Spec coverage:** taker results (T6/T7 + ADR-0008), guarded lead routing (T3/T4/T5/T6), consent (T7), audit (T6/T8), no-store (T6), idempotency+outbox (T2/T5/T6), PUBLIC-campaign flow (T8), 4-Decisions domains scoring (T1), DB-safety (DRAFT seed + additive migration only).
- **Open/confirm-at-build:** exact scale floor (0–10 vs 1–10) + question set (T1 capture); SU-team recipient address (env/config); per-campaign email quota numbers; whether `BrandedReport` needs a small public-mode prop (vs the coach/admin report) — verify during T7.
- **Migration honesty:** Task 2 is an *additive* migration — corrects Spec 15 §5's "zero schema migration."
