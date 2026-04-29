# Jeff Apr 20 Sprint — Single Source of Truth
## Status Board + Implementation Details · Compaction-Proof · Updated as we go

> **How to use this file:**
> - **Top half** = status board. Check boxes here as each task is committed.
> - **Bottom half** = implementation details. Exact file paths, root causes, code changes, commit messages.
> - Update both halves together. Never update one without the other.
> - Companion files: `plans/JEFF_FEEDBACK_APR20_SPRINT.md` and `plans/2026-04-23-jeff-apr20-sprint-impl.md` are now DEPRECATED — this file replaces both.

---

## Context

Jeff sent feedback via spreadsheet on Apr 20, 2026 (email subject: "workshop tool feedback 4-17-26.xlsx").
Color coding: 🔴 Red = bug | 🔵 Blue = enhancement | 🟡 Yellow = scenario being tested

**Apr 23 call:** Jeff walked through the app live (screen share). Confirmed bugs, scoped new items, set deadline.

---

## Deadline

| Milestone | Date |
|-----------|------|
| Most fixes complete | Tuesday–Wednesday Apr 28–29 |
| Full sprint wrapped | Friday Apr 30 |
| Esperto replacement project starts | Week of May 4 |

---

## STATUS BOARD

### 🔴 BUGS

| ID | Description | Status |
|----|-------------|--------|
| BUG-07 | Survey links in emails redirect to login — middleware blocks unauthenticated access | ✅ Done — `6975469` |
| BUG-08 | "undefined" appearing in workflow emails — workshopFormat missing null guard | ✅ Done — `4384b6f` |
| BUG-01 | 12hr workflow offset reads as 1 day 12 hours — calculateSendDate compounds offsets | ✅ Done — `3064987` |
| BUG-03 | Counter-decline leaves workshop in limbo — workshop.status never updated | ✅ Done — `09eeae4` |
| BUG-02 | Coach workshop page shows tier price instead of accepted custom price | ✅ Done — `aa27fb2` |
| BUG-06 | Survey picker missing from workflow step editor — no SEND_SURVEY_LINK UI | ✅ Done — `6a4d1f2` |
| BUG-05 | Conversation history missing from coach and admin workshop detail pages | ✅ Done — `412b00a` |
| BUG-04 | Redundant Bio nav item in admin dashboard — Jeff confirmed remove it | ✅ Done — `95f0186` |

### 🔵 ENHANCEMENTS

| ID | Description | Status |
|----|-------------|--------|
| ENH-08 | Workflow fast-forward — admin Trigger Now button for testing | ✅ Done — `8a6b0b0` |
| ENH-07 | Coach resubmit form — collapsible, collapsed by default | ✅ Done — behavior already correct, verified |
| ENH-01 | All Registrations — export CSV + sortable columns | ✅ Done — `2aa0cfd` + `3c1b3dc` |
| ENH-02 | All Registrations — Price Paid column | ✅ Done — `2aa0cfd` |
| ENH-03 | All Registrations — clickable workshop link | ✅ Done — `2aa0cfd` |
| ENH-04 | Automation Tasks box — show Last Executed dates | ✅ Done — `fb61328` |
| ENH-05 | Admin workshop detail — open landing page in new tab | ✅ Done — `fb61328` |
| ENH-06 | Templates — affiliate tracking code field | ✅ Done — `60606b5` |
| ENH-09 | Cascade delete — cancel pending workflow executions | ✅ Done — `a9b523e` |

### 🔐 SECURITY (from /cso audit — ships with Apr 30 sprint)

| ID | Description | Status |
|----|-------------|--------|
| SEC-01 | Delete password reset token console.log — exposes token in Vercel function logs | ✅ Done — `adbb31d` |
| SEC-02 | Add Content-Security-Policy header to next.config.ts | ✅ Done — `e2efc71` |
| SEC-03 | Delete debug-auth route — deployed in production bundle, zero prod utility | ✅ Done — `e80bbff` |

### 📧 NON-CODE ACTION ITEMS

| Item | Status |
|------|--------|
| Email Jeff: Anthropic security implementation (SOC2 Type 2, injection protection, context-aware analysis) | ✅ Done — Jeff already informed in prior sessions; ongoing security improvements ship with each sprint |

### 🟡 SCENARIOS TESTED

| Scenario | Result |
|----------|--------|
| Admin creates workshop $299 + 25% coupon + custom 6hr workflow survey | ✅ Working (12hr has BUG-01) |
| Stripe payments | ✅ Working |
| Coupons | ✅ Working |
| Financial dashboard | ✅ Working |
| Pricing tiers | ✅ Working |
| Categories | ✅ Working |
| Survey/file links in workflow emails | ✅ Working — BUG-07 fixed (middleware); Inngest resynced Apr 29 (function wasn't registered since Feb 11); PRE_WORKSHOP template seeded |
| Templates (except known video bug) | ✅ Working |
| Custom price counter-offer → accepted | ✅ Flow works (BUG-02: price display on coach page) |
| Custom price counter-offer → coach declines | ✅ Flow processes (BUG-03: workshop left in limbo) |
| Standard workshop → Admin requests info → Coach replies | ✅ Verified working (Apr 29) |

---

## SPRINT EXECUTION ORDER

1. **BUG-07** — Survey links broken (blocks all workflow testing) ⚠️
2. **BUG-08** — "Undefined" in email
3. **BUG-01** — Workflow 12hr timing
4. **BUG-03** — Counter-decline limbo
5. **BUG-02** — Custom price not shown on coach page
6. **BUG-06** — Survey picker in workflow step editor
7. **ENH-08** — Workflow fast-forward for testing
8. **BUG-05** — Conversation history missing
9. **BUG-04** — Remove redundant Bio nav item (5 min)
10. **ENH-07** — Collapsible resubmit form
11. **ENH-01/02/03** — Registrations: export, sortable columns, new columns, workshop link
12. **ENH-04** — Automation tasks scheduled dates
13. **ENH-05** — Landing page open in new tab
14. **ENH-06** — Affiliate tracking code field
15. **ENH-09** — Cascade delete executions (partial — waiting on Jeff for financial logic)

---

## SESSION LOG

| Date | Work Done | By |
|------|-----------|----|
| 2026-04-23 | File created, all bugs and enhancements catalogued from Jeff's Apr 20 feedback | gabriel |
| 2026-04-23 | Implementation plan written (10 tasks, TDD, exact file paths) | gabriel |
| 2026-04-23 | gstack QA started — reproducing all bugs against live app before touching code | gabriel |
| 2026-04-23 | Jeff Apr 23 call — confirmed scope, added BUG-07/08/ENH-08/09, updated deadline to Apr 30, clarified BUG-06 | gabriel |
| 2026-04-23 | Full transcript read + analyzed. Cascaded: golden-path test scenario added, Esperto spelling corrected everywhere, Esperto project marked deferred. | gabriel |
| 2026-04-23 | gstack run on Vercel prod. BUG-07 confirmed: middleware blocks /survey/[id] + /api/surveys/[id] for unauthenticated users. BUG-08 confirmed: workshopFormat has no fallback in baseContext or interpolateTemplate. BUG-01 confirmed: offsetDays + offsetHours are additive in calculateSendDate; stale DB steps with offsetDays=-1 + offsetHours compound both. All 8 bug root causes confirmed. | gabriel |
| 2026-04-23 | Sprint tracker + impl plan merged into this single file. Claude plan file stubbed. | gabriel |
| 2026-04-24 | Full autoplan review pipeline completed: CEO + Codex + Eng + Design + DX — all findings incorporated into plan. Key fixes: BUG-07 regex negative-lookahead (security), ENH-09 Prisma.TransactionClient type, worktree lanes reorganized to prevent merge conflicts, ENH-07 confirmed verify-only (already implemented). | gabriel |
| 2026-04-24 | /cso security audit completed. 3 immediate fixes added as SEC-01/02/03. Deferred: audit logging gaps, Next.js CVE update, npm audit fix. Full report at .gstack/security-reports/2026-04-23-cso-audit.md | gabriel |

---

## ⚠️ KNOWN EXISTING BUGS (pre-existing)

- Template video embed bug (Jeff noted templates working "other than the known bug for the videos")

---

## 📌 NOTES

- Jeff's test account: `jeffrey.verdun@scalingup.com` / Coach name: James Bond
- All test workshops use `https://www.yahoo.com` as meeting link
- Jeff walked through app live on Apr 23 screen share using a "Scaling Up Masterclass" category he built himself

---
---

# IMPLEMENTATION DETAILS

> Everything below is the technical how-to for each task above.
> Root causes confirmed via gstack (live production testing) + code review on Apr 23, 2026.

---

## Step 0: Revert Pre-Plan Edits (DO FIRST)

Two files were modified before implementation started. Revert both before writing any commits:

```bash
git checkout -- src/src/app/(dashboard)/layout.tsx
git checkout -- "src/src/app/api/approvals/[id]/coach-response/route.ts"
```

Then re-implement each fix as its own clean commit per the tasks below.

---

## SECURITY HARDENING (runs alongside all tasks)

For every file touched, verify and enforce:

1. **Input validation at API boundaries** — all new API routes validate with Zod before touching the DB
2. **Rate limiting on new endpoints** — any new POST route gets `withRateLimit(request, RateLimits.standard)`
3. **Auth check first** — `getApiActor()` called before any data access, return 401 if null
4. **No raw HTML injection in JSX** — `customCode` field (ENH-06) rendered as escaped text in admin UI only
5. **Audit log on sensitive mutations** — any status change calls `logAudit()`
6. **Email interpolation safety** — every template variable replacement uses `?? ""` (null coalescing, NOT `|| ""` — `|| ""` replaces valid empty strings)
7. **SEC-01** — `forgot-password/route.ts:14`: delete console.log that prints reset token URL
8. **SEC-02** — `next.config.ts`: add Content-Security-Policy header (script-src unsafe-inline required for Next.js 16)
9. **SEC-03** — delete `api/debug-auth/route.ts` entirely

---

## BUG-07 · Survey Links in Emails Non-Functional

**ROOT CAUSE CONFIRMED (live production, Apr 23):**
URL format is correct (`${appUrl}/survey/${id}`). Page exists at `app/survey/[id]/page.tsx`. API exists at `api/surveys/[id]/route.ts`. Both blocked by middleware — unauthenticated users get redirected to login.

**Fix location:** `src/src/middleware.ts` — TWO places:
1. `authorized` callback (~line 115): add `pathname.startsWith("/survey/")` to public routes list
2. API protection block (~line 72): add survey endpoints to allowlist using regex `pathname.match(/^\/api\/surveys\/[^/]+(\/submit)?$/)`  — allows GET (fetch survey) and POST (submit) but NOT `/api/surveys/assign` or `/api/surveys/workflows`

**Security:** Rate limiting already on `/api/surveys/[id]/submit` (20 req/min). Survey ID is a random CUID — not guessable.

**Commit:** `fix: allow unauthenticated access to /survey/[id] page and API in middleware`

---

## BUG-08 · "Undefined" Appearing in Workflow Email

**ROOT CAUSE CONFIRMED (code review, Apr 23):**
`execute-workflow.ts:112`: `workshopFormat: workshop.format` — no fallback. If `workshop.format` is null in DB, context field is `undefined`. Then `interpolateTemplate()` coerces `undefined` to the literal string `"undefined"` in the email body.

**Fix — two files:**
1. `src/src/inngest/functions/execute-workflow.ts:112`: change to `workshopFormat: workshop.format || ""`
2. `src/src/lib/workflows/workflow-service.ts` → `interpolateTemplate()`: add `|| ""` to ALL field replacements — workshopTitle, workshopCode, workshopDate, workshopTime, workshopLocation, workshopUrl, workshopFormat, coachName, coachEmail and their snake_case aliases

**Commit:** `fix: guard all interpolation context fields to prevent undefined in emails`

---

## BUG-01 · Workflow 12hr Timing Reads as 1 Day 12 Hours

**ROOT CAUSE CONFIRMED (code review, Apr 23):**
`calculateSendDate()` in `workflow-service.ts:290–316` applies `offsetDays` unconditionally, then applies `offsetHours` if non-zero. Both fire independently.

The editor save handler IS correct for new steps (`workflow-editor.tsx:1094,1328` — both zero `offsetDays` in hours mode). The bug affects existing stale DB steps where `offsetDays: -1` AND `offsetHours: -12` were both stored. The `offsetMode` detection at `workflow-editor.tsx:752–756` only enters hours mode when `(step.offsetDays ?? 0) === 0` — so stale steps display as days mode even with offsetHours set.

**Fix:** In `calculateSendDate()` (`workflow-service.ts:290–316`): make offsetDays and offsetHours mutually exclusive. Only apply `offsetDays` if `offsetHours` is 0; only apply `offsetHours` if `offsetDays` is 0.

**Commit:** `fix: workflow hour-mode steps no longer compound offsetDays`

---

## BUG-03 · Counter-Decline Leaves Workshop in Limbo

**ROOT CAUSE:** Final decline path sets `approvalQueue.status = "DENIED"` but never updates `workshop.status`. Workshop stays stranded in REQUESTED or AWAITING_APPROVAL.

**Fix:** `src/src/app/api/approvals/[id]/coach-response/route.ts` — wrap final decline in `$transaction`. Inside transaction: set `workshop.status = "CANCELED"`. Add `logAudit()` call.

**Note:** Fix already in working tree as pre-plan edit. Revert (Step 0) then re-implement cleanly.

**Commit:** `fix: cancel workshop when coach declines counter-offer with no counter-proposal`

---

## BUG-02 · Coach Page Shows Tier Price Instead of Custom Price

**ROOT CAUSE:** Display logic at `app/(portal)/portal/workshops/[id]/page.tsx` lines 199–205 checks `pricingTier.amountCents` first. When custom price is accepted, `workshop.priceCents` is updated but `pricingTierId` is never cleared — tier price always wins.

**Fix:** Show `priceCents` as authoritative. Only append tier name label when the price exactly matches the tier amount. If they differ, show price only.

**Commit:** `fix: coach workshop page shows actual priceCents not tier label after custom price accepted`

---

## BUG-06 · Survey Picker Missing from Workflow Step Editor

**ROOT CAUSE:** `SEND_SURVEY_LINK` step type exists in constants but has no picker UI, no `surveyTemplateId` in editor state, no fetch from `/api/survey-templates`.

**File picker reference** (mirror this pattern exactly):
- State/fetch: `workflow-editor.tsx:762–815`
- Render: `workflow-editor.tsx:1042–1085`

**Fix:** When `stepType === "SEND_SURVEY_LINK"`, render a survey template dropdown. Fetch active templates from `GET /api/survey-templates`. Mirror the file picker implementation. No schema changes needed.

**Security:** Dropdown only shows `isActive: true` templates. Admin-managed data only.

**Commit:** `feat: add survey template picker to workflow step editor`

---

## BUG-05 · Conversation History Missing from Workshop Detail Views

**ROOT CAUSE:**
- Admin detail page (`app/(dashboard)/workshops/[id]/page.tsx`): zero ApprovalQueue data in Prisma include
- Coach detail page (`app/(portal)/portal/workshops/[id]/page.tsx`): only fetches active INFO_REQUESTED approval, not full thread

**Fields:** `ApprovalQueue.notes` = admin question, `ApprovalQueue.coachResponse` = coach reply

**Fix:**
- Admin page: add `approvalQueue` to Prisma include. Render conversation thread card — admin note in muted background block, coach response indented in primary-tinted block.
- Coach page: broaden approval history query to fetch full thread. Render thread above resubmit form.

**Commit:** `feat: show approval conversation history on admin and coach workshop detail pages`

---

## BUG-04 · Remove Redundant Bio Nav Item

**Fix:** `src/src/app/(dashboard)/layout.tsx` — delete `{ href: "/bio", label: "Bio" }`.

**Note:** Fix already in working tree as pre-plan edit. Revert (Step 0) then re-implement cleanly.

**Commit:** `fix: remove redundant Bio nav item from admin dashboard`

---

## ENH-08 · Workflow Fast-Forward for Testing

**Approach:** Admin "Trigger Now" button on each `PENDING` WorkflowStepExecution row. Clicking fires the step immediately.

**Files:**
- `src/src/app/(dashboard)/workshops/[id]/page.tsx` — Trigger Now button on each execution row
- New route: `POST /api/workflow-executions/[id]/trigger` — admin-only, rate-limited, sets `scheduledFor = now()`, emits Inngest event
- `inngest/functions/execute-workflow.ts` — handle immediate trigger

**Security:** Admin-only endpoint. `getApiActor()` + role check. Rate-limited.

**Commit:** `feat: admin trigger-now button on workflow step executions for testing`

---

## ENH-07 · Collapsible Resubmit Form

**Fix:** `src/src/components/workshops/resubmit-workshop.tsx`
- Add `useState(false)` for `showEditFields`
- Wrap all workshop fields in toggle
- Reply textarea always visible

**Commit:** `feat: collapse workshop fields in resubmit form by default`

---

## ENH-01 / ENH-02 / ENH-03 · Registrations Table

**Files:**
- `src/src/app/(portal)/portal/registrations/registrations-client.tsx`
- `src/src/app/api/registrations/route.ts`

**Changes:**
- ENH-01: Sortable column headers + CSV export (reuse existing export logic, update with new columns)
- ENH-02: Price Paid column + Coupon column
- ENH-03: Workshop name as clickable link to workshop detail

**Commit:** `feat: registrations — sortable columns, price paid + coupon, workshop link, CSV updated`

---

## ENH-05 · Landing Page Open in New Tab

**Fix:** `src/src/app/(dashboard)/workshops/[id]/page.tsx` — add external link icon + `<a target="_blank">` next to existing copy button in Landing Page row.

**Commit:** `feat: open-in-new-tab button for landing page on admin workshop detail`

---

## ENH-04 · Automation Tasks — Show Scheduled Dates

**Fix:** `src/src/app/(dashboard)/workshops/[id]/page.tsx`
- Ensure `scheduledFor` is in the `WorkflowStepExecution` Prisma query
- Render `formatDate(scheduledFor)` next to each task status

**Commit:** `feat: show scheduled dates on automation tasks in admin workshop detail`

---

## ENH-06 · Affiliate Tracking Code Field in Templates

**Files:**
- `src/prisma/schema.prisma` — add `customCode String?` to `LandingPage` model
- Template editor UI — add field (rendered as escaped text in admin UI only, never raw HTML in React tree)
- `src/src/app/api/landing-pages/[id]/route.ts` — accept and save the field

**Steps:** Schema change → `npx prisma migrate dev` → UI + API

**Commit:** `feat: add custom code field to landing page templates for affiliate tracking`

---

## ENH-09 · Cascade Delete — Cancel Workflow Executions

**Confirmed piece (build now):** Cancel all `PENDING` `WorkflowStepExecution` records when a workshop is deleted.

**Waiting on Jeff:** Financial record prompt logic — do NOT build until Jeff confirms.

**Fix:** `src/src/app/api/workshops/[id]/delete/route.ts` — inside the delete transaction, set all PENDING executions for the workshop to CANCELED.

**Commit:** `feat: cancel pending workflow executions when workshop is deleted`

---

## VERIFICATION TABLE

| Item | How to verify |
|------|--------------|
| BUG-07 | Click survey link from workflow email — opens without login |
| BUG-08 | No "undefined" text in any workflow email body |
| BUG-01 | 12hr offset step triggers ~12hrs before event, not 36hrs |
| BUG-03 | Coach declines counter → workshop shows Canceled status |
| BUG-02 | Coach detail page shows custom price ($300), not tier price ($349) |
| BUG-06 | SURVEY_LINK step in editor shows template dropdown |
| BUG-05 | Both detail pages show admin question + coach reply thread |
| BUG-04 | Admin nav has no Bio link |
| ENH-08 | Trigger Now button fires email immediately |
| ENH-07 | Resubmit form loads collapsed |
| ENH-01/02/03 | Sort works, two new columns appear, workshop name links, CSV updated |
| ENH-05 | Open button opens landing page in new tab |
| ENH-04 | Automation tasks show scheduled datetime |
| ENH-06 | customCode saves and loads in template editor |
| ENH-09 | Delete workshop → pending executions show Canceled |

**Jeff's golden-path acceptance test (must pass before handoff):**
Create a Masterclass workshop → attach workflow with pre-event file attachment step + post-event survey link step → receive both emails → click both links → confirm they open. This is the acceptance test for BUG-07 + BUG-06 together.

**After all commits:** `CI=true npm run build` + `npm run test` before pushing.

---

## Session Log — Apr 27–28, 2026

### What We Were Trying to Fix
Two production bugs reported by Jeff after the sprint shipped:
1. **Registrations page** — crashed on every visit with "Something went wrong" error
2. **Trigger Now** — button showed "Step triggered" but emails never arrived

---

### Bug 1: Registrations Page Crash — 7 Cycles to Fix

This took far longer than it should have because we were fixing hypotheses instead of reading the actual error log.

**Cycle 1** — Added null guard on `registration.workshop` in the `.map()`. Deployed. Still crashed (new error digest).

**Cycle 2** — Added try-catch around `db.registration.findMany`. Deployed. Still crashed.

**Cycle 3** — Added try-catch around the entire `.map()` transform. Deployed. Still crashed.

**Cycle 4** — Added a React Error Boundary (`registrations-error-boundary.tsx`). Deployed. Still crashed. Root cause: React Error Boundaries are client-side only in Next.js App Router — they don't catch SSR errors. The page was crashing server-side before the boundary could do anything.

**Cycle 5** — Added `dynamic({ ssr: false })` directly in `page.tsx` to bypass SSR entirely. Build failed. Root cause: Turbopack disallows `next/dynamic` with `ssr: false` inside Server Components.

**Cycle 6** — Created `registrations-loader.tsx` as a `"use client"` wrapper to hold the `dynamic()` call (Server Components can't use it, Client Components can). Build passed. Deployed. Still crashed (error digest 3378317363).

**Cycle 7 — Root cause confirmed from Vercel function logs:**
```
TypeError: e.SORT_ALLOWLIST.includes is not a function
```
`SORT_ALLOWLIST` was exported from `registrations-client.tsx` (a `"use client"` file). When a Server Component imports a runtime value from a Client Component, Next.js/Turbopack returns a proxy stub — not the actual array. `.includes()` doesn't exist on the stub. Every page visit crashed immediately.

**Fix:** Created `registrations-types.ts` (no `"use client"` directive) and moved `SORT_ALLOWLIST`, `SortField`, and `CoachRegistrationView` there. Both `page.tsx` (server) and `registrations-client.tsx` (client) import from the shared file. Deployed. **Fixed.** Commit `3c1b3dc`.

**Lesson:** Read the actual Vercel function logs first. Every cycle before Cycle 7 was wasted because we were guessing the crash location instead of reading the error message. `npx vercel logs --project <name> --deployment <url> --no-follow --expand` gives the full stack trace.

---

### Bug 2: Trigger Now / Workflow Emails — Partially Resolved

**What we shipped (code):**
- SMTP errors now caught in `trigger-workflow-step.ts` — writes a `FAILED` execution record instead of silently retrying forever
- `trigger-now` route now checks for recent FAILED executions and returns `previousFailure` in the response
- `TriggerNowButton` toast now shows the SMTP error message if last attempt failed — actionable guidance for Jeff/Suzanne
- Extended 409 guard to block `SENT`, `SCHEDULED`, and `PENDING` statuses (prevents double-send race)

**What's still broken (infrastructure):**
Registration confirmation emails arrive fine (SMTP credentials work). Workflow emails don't arrive. Vercel function logs show `prisma:error Error in PostgreSQL connection: Error { kind: Closed, cause: None }` during Inngest function execution — the DB connection drops before the email send is reached. This is a Neon cold-start issue in the Inngest execution path, not an SMTP credentials problem.

**Next step:** Check Inngest dashboard (`app.inngest.com`) → Functions → `trigger-workflow-step` → recent runs to see the exact failure point and whether it's consistently the DB connection or something else.

---

### Plan File Discipline Failure

The sprint file was not updated as items shipped. This caused repeated confusion — items already deployed were reported as "still open" multiple times across sessions. 

**Rule going forward:** Update the sprint file status immediately when a commit ships, not at end of session.

---

### Final Sprint Status (Apr 28, 2026)

**All 8 bugs: ✅ Done**
**All 9 enhancements: ✅ Done**
**All 3 security items: ✅ Done**
**Workflow emails: ✅ Done — root cause was unregistered Inngest function (not Neon). Resynced Apr 29; PRE_WORKSHOP template seeded; confirmed firing.**
**All scenarios verified: ✅ Done (Apr 29)**

> 🗄️ SPRINT COMPLETE — archived Apr 29, 2026. Both Apr 20 and Apr 28 sprints fully shipped.
