# Jeff Public Survey Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Jeff public-survey gaps by adding visible taker email identity, verified two-link report next steps, and a filtered Coach-only Referred Results CSV export without changing the shipped duplicate-delivery system.

**Architecture:** Extend the existing canonical `RespondentReport` model so every authorized construction path carries the taker email and verified referral presentation snapshot. Share one screen next-steps component across scored and qualitative reports, keep a parallel email-safe table fragment, and add a bounded CSV route over the existing immutable referral-ownership query. The new export inherits the Jeff #83 flag, access model, filters, current-certification check, and display-safe result summaries.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/PostgreSQL, Zod, Jest/Testing Library, shared `rowsToCsv`, Tailwind plus the existing `su-report.css`, inline table-based email HTML.

**Implementation receipt (2026-07-30):** Tasks 1–5 are implemented. Focused
coverage passed 19/19 suites and 317/317 tests. Changed-file ESLint, migration
safety, `git diff --check`, and the Turbopack production build passed. Desktop
and 390px mobile renders were inspected and retained beside the approved
mockup. Two-axis review findings were corrected; publication remains. Both
final re-reviews returned CLEAN.

## Global Constraints

- Fixed review point is `48b68d37`; preserve unrelated primary-checkout changes by working only in `.worktrees/jeff-public-survey-closure`.
- Do not change Inngest, outbox leasing, cron, schedules, migrations, or SMTP delivery semantics.
- Never render the raw `?coach=` query value; only a transactionally verified
  current Coach email may enter a `mailto:` link.
- Authorization remains immutable-ID based through `referringCoachId`; email is presentation and delivery provenance only.
- CSV columns are exactly `Taker Name`, `Taker Email`, `Assessment`, `Result`, `Submitted At`; never export raw answers or IDs.
- CSV is capped at 5,000 rows, private/no-store, formula-injection protected,
  and PII-free audited. One scalar SQL statement owns eligibility, filters,
  count, and `LIMIT 5001`; over-cap returns `422`.
- Export rate limiting is distributed, fail-closed, namespaced by immutable
  Coach ID, and set to 10 requests/minute. Limiter outage returns `503` before
  the referral query.
- Export audit is strict: persistence failure returns `503` without the CSV.
- `showCoachCta: false` suppresses only Talk to a Coach; Learn More remains.
- No new feature flag. Export inherits the existing Jeff #83 Referred Results flag and kill switch.
- Every UI change follows the reviewed visual at `docs/specs/v7.6/mockups/jeff-public-survey-closure.html`.
- Before push: targeted tests, type-check, changed-file ESLint, migration safety, full Jest comparison, and `CI=true npx next build --turbopack`.

---

## File map

**Report identity and verified referral response**

- Modify `src/src/lib/assessments/respondent-report.ts`: add required nullable
  `respondentEmail`; populate it separately from display-name fallback.
- Modify `src/src/lib/assessments/report-email.ts`: populate `respondentEmail`; render screen-equivalent identity and email-safe next steps.
- Modify `src/src/components/assessments/public-quiz-client.tsx`: preserve submitted email and only the server-returned verified coach email in the immediate report model.
- Modify `src/src/app/api/quiz/[campaignAlias]/submit/route.ts`: revalidate
  Coach eligibility in the write transaction; bind idempotent recovery to
  normalized taker/answers; return only current verified referral contact.
- Modify `src/src/lib/assessments/public-referrals.ts`: resolve current Coach
  email only after immutable-ID/current-certification authorization; add the
  scalar export query.

**Screen presentation**

- Create `src/src/components/assessments/ReportNextSteps.tsx`: shared scored/qualitative two-action block.
- Modify `src/src/components/assessments/BrandedReport.tsx`: cover identity and shared next steps.
- Modify `src/src/components/assessments/QualitativeReport.tsx`: cover identity and shared next steps.
- Modify `src/src/styles/su-report.css`: scoped screen/print styling for email identity and the two-link block.

**Export**

- Modify `src/src/lib/assessments/public-referrals.ts`: one-statement scalar
  export loader sharing list filter semantics without loading full result JSON.
- Create `src/src/app/api/assessments/referred-results/export.csv/route.ts`: validated, rate-limited CSV response and audit.
- Modify `src/src/components/assessments/ReferredResultsList.tsx`: filtered export link and disabled states.
- Modify `src/src/lib/rate-limit.ts`: add an export-specific fail-closed,
  actor-keyed limiter without changing existing endpoints.
- Modify `src/src/lib/audit.ts`: add a strict audit function without changing
  legacy best-effort callers.

**Tests and records**

- Modify `src/src/__tests__/assessments/report-email.test.ts`.
- Modify `src/src/__tests__/assessments/report-email-qualitative.test.ts`.
- Modify `src/src/__tests__/components/assessments/branded-report.test.tsx`.
- Modify `src/src/__tests__/components/assessments/qualitative-report.test.tsx`.
- Modify `src/src/__tests__/lib/assessments/onscreen-report-model.test.ts`.
- Modify `src/src/__tests__/api/quick-assessment-submit.test.ts`.
- Modify `src/src/__tests__/components/public-quiz-results.test.tsx`.
- Modify `src/src/__tests__/lib/assessments/public-referrals.test.ts`.
- Create `src/src/__tests__/api/referred-results-export-route.test.ts`.
- Create `src/src/__tests__/unit/rate-limit-strict.test.ts`.
- Modify `src/src/__tests__/components/assessments/referred-results-list.test.tsx`.
- Modify `CLAUDE.md` and `plans/CHANGELOG.md` only when the implementation is ready to push.

---

### Task 0: Record the untouched-main baseline

**Status:** Completed before product code at fixed point `48b68d37`.

**Evidence:** `/tmp/jeff-public-survey-main-baseline-48b68d37.json`

Command:

```bash
npm test -- --runInBand --silent --json --outputFile=/tmp/jeff-public-survey-main-baseline-48b68d37.json
```

Result:

```text
Test Suites: 8 failed, 580 passed, 588 total
Tests:       22 failed, 6861 passed, 6883 total
Snapshots:   12 passed, 12 total
```

All assessment report, email, public-referral, public-submit, Referred Results,
and CSV utility suites relevant to this closure passed. Final verification must
match this failure set exactly or improve it; any new failing suite blocks
completion.

### Task 1: Carry email and verified coach identity through the canonical report model

**Files:**

- Modify: `src/src/lib/assessments/respondent-report.ts`
- Modify: `src/src/lib/assessments/report-email.ts`
- Modify: `src/src/components/assessments/public-quiz-client.tsx`
- Modify: `src/src/app/api/quiz/[campaignAlias]/submit/route.ts`
- Modify: `src/src/lib/assessments/public-referrals.ts`
- Test: `src/src/__tests__/lib/assessments/onscreen-report-model.test.ts`
- Test: `src/src/__tests__/assessments/report-email.test.ts`
- Test: `src/src/__tests__/api/quick-assessment-submit.test.ts`
- Test: `src/src/__tests__/lib/assessments/public-referrals.test.ts`

**Interfaces:**

- Produces: required `RespondentReport.respondentEmail: string | null`.
- Produces: successful public-submit response field `data.referringCoachEmail: string | null`, containing only the effective verified referral.
- Produces: idempotent replay bound to the original normalized taker and
  stable-key-sorted answers; mismatched key reuse returns `409`.
- Produces: authenticated public-referral reports with the current Coach email
  selected only after immutable-ID/current-certification authorization.
- Consumes: existing `respondentDisplayName`, active-Coach lookup, persisted
  `referringCoachId`, stored public taker/answers/result, and current Coach
  relation.

- [ ] **Step 1: Write failing canonical-model tests**

Add assertions equivalent to:

```ts
expect(
  buildRespondentReportFromSubmission(submissionArgs()).respondentEmail,
).toBe("jordan@example.com");

expect(
  buildStoredRespondentReport(storedInput()).respondentEmail,
).toBe("member@example.com");
```

In the public-referral report test, make the authorized current Coach include:

```ts
email: "current.coach@example.com",
```

and assert:

```ts
expect(outcome).toMatchObject({
  status: "ok",
  report: {
    respondentEmail: "jordan@example.com",
    referringCoachEmail: "current.coach@example.com",
  },
});
```

- [ ] **Step 2: Run the model tests and verify red**

Run:

```bash
npx jest src/__tests__/lib/assessments/onscreen-report-model.test.ts src/__tests__/assessments/report-email.test.ts src/__tests__/lib/assessments/public-referrals.test.ts --runInBand
```

Expected: failures because `respondentEmail` is absent and the public-referral loader does not select the referral presentation snapshot.

- [ ] **Step 3: Add the minimal model plumbing**

In `respondent-report.ts`, add to the `RespondentReport` interface:

```ts
respondentEmail: string | null;
```

Populate it in `buildStoredRespondentReport` (same file):

```ts
respondentEmail: input.respondent.email.trim() || null,
```

In `report-email.ts`, populate `buildRespondentReportFromSubmission`:

```ts
respondentEmail: args.publicTaker.email.trim() || null,
```

For legacy public rows, preserve `email: string | null`; use `"Anonymous"` only
for display-name fallback and never copy that sentinel into
`respondentEmail`.

In `public-quiz-client.tsx`, set:

```ts
respondentEmail: email.trim() || null,
referringCoachEmail: verifiedReferringCoachEmail,
```

The client state begins as `null` and is assigned only from the successful
response:

```ts
setVerifiedReferringCoachEmail(
  typeof body.data.referringCoachEmail === "string"
    ? body.data.referringCoachEmail
    : null,
);
```

The submit route builds both candidate-referral and Scaling-Up-only outbox
payloads before the transaction. Inside `persistSubmission`, re-read the Coach
by ID with `certificationStatus="ACTIVE"` and
`certificationExpiry > now OR null`; this is the eligibility linearization
point. Persist ownership and choose coach-delivery payloads only when that
transactional read succeeds. Fresh success returns that current canonical
address; deactivation/deletion/foreign-key retry returns `null`.

After campaign identity and scoring are resolved but before open/close gates,
look up an existing unique key and select campaign ID, normalized
`publicTaker`, answers, frozen result, and current referring Coach relation.
Compare a canonical fingerprint of campaign ID, trimmed name, normalized
email, and stable-key-sorted answers. Mismatch or cross-campaign reuse returns
`409`; a matching lost-response retry returns the frozen result and currently
eligible Coach email even after campaign close. The P2002 race path reuses the
same recovery function.

Extend the authorized public-referral report Coach relation with `email: true`
and assign the current email only after immutable Coach-ID and current
certification checks pass.

- [ ] **Step 4: Write failing submit-response security tests**

Add three public-submit tests:

```ts
expect(successBody.data.referringCoachEmail).toBe(
  "verified.coach@example.com",
);
```

```ts
expect(unverifiedBody.data.referringCoachEmail).toBeNull();
```

```ts
expect(idempotentBody.data.referringCoachEmail).toBe(
  "current.coach@example.com",
);
```

The inactive/unmatched test must submit an attacker-controlled
`referringCoachEmail` and prove that value is not echoed.
Also prove:

- deactivation between the pre-read and transaction produces null ownership,
  no coach-delivery outbox row, and a null response contact;
- a matching lost-response retry succeeds after campaign close;
- same key plus changed taker or answers returns `409`;
- cross-campaign key reuse returns `409`; and
- replay resolves current Coach contact rather than trusting the request or a
  stale frozen delivery email.

- [ ] **Step 5: Run submit tests and verify red**

Run:

```bash
npx jest src/__tests__/api/quick-assessment-submit.test.ts src/__tests__/components/public-quiz-results.test.tsx --runInBand
```

Expected: the response lacks `referringCoachEmail`.

- [ ] **Step 6: Implement the response contract and rerun Task 1**

Run:

```bash
npx jest src/__tests__/lib/assessments/onscreen-report-model.test.ts src/__tests__/assessments/report-email.test.ts src/__tests__/api/quick-assessment-submit.test.ts src/__tests__/components/public-quiz-results.test.tsx src/__tests__/lib/assessments/public-referrals.test.ts --runInBand
```

Expected: green.

- [ ] **Step 7: Type-check and commit**

Run:

```bash
npm run type-check
git add src/src/lib/assessments/respondent-report.ts src/src/lib/assessments/report-email.ts src/src/components/assessments/public-quiz-client.tsx src/src/app/api/quiz/[campaignAlias]/submit/route.ts src/src/lib/assessments/public-referrals.ts src/src/__tests__/lib/assessments/onscreen-report-model.test.ts src/src/__tests__/assessments/report-email.test.ts src/src/__tests__/api/quick-assessment-submit.test.ts src/src/__tests__/components/public-quiz-results.test.tsx src/src/__tests__/lib/assessments/public-referrals.test.ts
git commit -m "fix(assessments): preserve public result contact identity"
```

### Task 2: Render screen identity and shared next steps

**Files:**

- Create: `src/src/components/assessments/ReportNextSteps.tsx`
- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Modify: `src/src/components/assessments/QualitativeReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Test: `src/src/__tests__/components/assessments/branded-report.test.tsx`
- Test: `src/src/__tests__/components/assessments/qualitative-report.test.tsx`

**Interfaces:**

- Consumes: `RespondentReport.respondentEmail`, `referringCoachEmail`, and `reportConfigFor(alias).showCoachCta`.
- Produces: `ReportNextSteps({ referringCoachEmail, showCoachCta })`.
- Produces: Learn More fixed at `https://scalingup.com/` and Talk to a Coach at verified `mailto:` or directory fallback.

- [ ] **Step 1: Write failing scored and qualitative render tests**

For both renderers, assert:

```ts
expect(screen.getByText("Email:")).toBeInTheDocument();
expect(screen.getByText("jordan@example.com")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Learn More" })).toHaveAttribute(
  "href",
  "https://scalingup.com/",
);
expect(screen.getByRole("link", { name: "Talk to a Coach" })).toHaveAttribute(
  "href",
  "mailto:verified.coach%40example.com",
);
```

Also cover:

```ts
expect(screen.getByRole("link", { name: "Talk to a Coach" })).toHaveAttribute(
  "href",
  "https://scalingup.com/coaches",
);
```

and `showCoachCta: false`:

```ts
expect(screen.getByRole("link", { name: "Learn More" })).toBeInTheDocument();
expect(
  screen.queryByRole("link", { name: "Talk to a Coach" }),
).not.toBeInTheDocument();
```

For email-as-name fallback, assert the email text appears once in the cover
identity block.

- [ ] **Step 2: Run screen tests and verify red**

Run:

```bash
npx jest src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/assessments/qualitative-report.test.tsx --runInBand
```

Expected: identity and two-action queries fail.

- [ ] **Step 3: Create the shared component**

Implement:

```tsx
export function ReportNextSteps({
  referringCoachEmail,
  showCoachCta,
}: {
  referringCoachEmail?: string | null;
  showCoachCta: boolean;
}) {
  const email = referringCoachEmail?.trim() ?? "";
  const coachHref = email
    ? `mailto:${encodeURIComponent(email)}`
    : "https://scalingup.com/coaches";

  return (
    <section className="su-report-next-steps" data-testid="report-next-steps">
      <h3 className="su-h2">Keep the momentum going</h3>
      <p>
        Explore Scaling Up resources or turn these results into a 90-day plan
        with a coach.
      </p>
      <div className="su-report-next-actions">
        <a className="su-report-cta su-report-cta-secondary" href="https://scalingup.com/">
          Learn More
        </a>
        {showCoachCta && (
          <a className="su-report-cta" href={coachHref}>
            Talk to a Coach
          </a>
        )}
      </div>
    </section>
  );
}
```

Render it directly above `ReportFooter` in both per-respondent renderers. Remove
the scored renderer's old single CTA to prevent duplication. Note: the old CTA
used raw `mailto:${email}` without `encodeURIComponent()` — the new component
fixes this encoding gap (security improvement).

Render the cover email only when `respondentEmail?.trim()` is non-empty. If
`respondentName.trim().toLowerCase() === respondentEmail.trim().toLowerCase()`,
omit the name identity row and show only the dedicated email row.

Add only `.su-public-brand .su-report`-scoped classes and print-safe
`break-inside: avoid`.

- [ ] **Step 4: Rerun screen tests**

Run:

```bash
npx jest src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/assessments/qualitative-report.test.tsx src/__tests__/components/assessments/branded-report-footer.test.tsx src/__tests__/components/assessments/report-footer-order.test.tsx --runInBand
```

Expected: green and footer order unchanged.

- [ ] **Step 5: Lint and commit**

Run:

```bash
npx eslint src/components/assessments/ReportNextSteps.tsx src/components/assessments/BrandedReport.tsx src/components/assessments/QualitativeReport.tsx
git add src/src/components/assessments/ReportNextSteps.tsx src/src/components/assessments/BrandedReport.tsx src/src/components/assessments/QualitativeReport.tsx src/src/styles/su-report.css src/src/__tests__/components/assessments/branded-report.test.tsx src/src/__tests__/components/assessments/qualitative-report.test.tsx
git commit -m "feat(assessments): add public report identity and next steps

Also fixes pre-existing mailto: encoding gap in BrandedReport CTA
(raw interpolation → encodeURIComponent, matching report-email.ts)."
```

### Task 3: Keep scored and qualitative report emails in parity

**Files:**

- Modify: `src/src/lib/assessments/report-email.ts`
- Test: `src/src/__tests__/assessments/report-email.test.ts`
- Test: `src/src/__tests__/assessments/report-email-qualitative.test.ts`
- Test: `src/src/__tests__/assessments/report-email.wave-s-guard.test.ts`

**Interfaces:**

- Consumes: the canonical `RespondentReport` fields from Task 1.
- Produces: escaped identity lines and one table-layout next-steps fragment used by scored and qualitative shells.

- [ ] **Step 1: Write failing email parity and escaping tests**

For scored and qualitative taker copies:

```ts
expect(bodyHtml).toContain("Email:");
expect(bodyHtml).toContain("jordan@example.com");
expect(bodyHtml).toContain('href="https://scalingup.com/"');
expect(bodyHtml).toContain(
  'href="mailto:verified.coach%40example.com"',
);
```

For referring-coach copies, assert exactly one **Contact the Taker** action
uses `respondentEmail`, and no Talk-to-a-Coach action/mailto-to-self exists.
For every path, assert exactly one Learn More action and exactly one
role-appropriate contact action so the old scored CTA cannot survive as a
duplicate.

Add malicious identity input:

```ts
respondentEmail: 'jane"<img src=x onerror=alert(1)>@example.com',
```

and assert the raw tag is absent while the escaped value is present.

Add no-coach and `showCoachCta: false` coverage. Confirm email-as-name appears
once in the cover.

- [ ] **Step 2: Run email tests and verify red**

Run:

```bash
npx jest src/__tests__/assessments/report-email.test.ts src/__tests__/assessments/report-email-qualitative.test.ts --runInBand
```

Expected: missing identity and Learn More assertions fail.

- [ ] **Step 3: Implement one email-safe fragment**

In `buildReportEmailHtml`, precompute:

```ts
const respondentEmail =
  typeof report.respondentEmail === "string"
    ? report.respondentEmail.trim()
    : "";
const escEmail = escapeHtml(respondentEmail);
```

Add the email identity to the shared cover, omitting the duplicate name line
when normalized name equals email.

Create a pure local `buildEmailNextSteps(report, recipientRole)` that emits only
tables and inline styles. It always includes Learn More. For `TAKER_COPY`, it
conditionally includes Talk to a Coach per `reportConfigFor` using current
verified Coach contact or the coaches directory. For `REFERRING_COACH`, it
instead includes Contact the Taker using escaped/encoded `respondentEmail`, and
omits that action when email is null. Remove the old scored CTA completely and
insert this one fragment above the footer in scored and qualitative shells.

- [ ] **Step 4: Rerun email and source-guard tests**

Run:

```bash
npx jest src/__tests__/assessments/report-email.test.ts src/__tests__/assessments/report-email-qualitative.test.ts src/__tests__/assessments/report-email.wave-s-guard.test.ts --runInBand
```

Expected: green; no client-only imports or unsafe layout added.

- [ ] **Step 5: Lint and commit**

Run:

```bash
npx eslint src/lib/assessments/report-email.ts
git add src/src/lib/assessments/report-email.ts src/src/__tests__/assessments/report-email.test.ts src/src/__tests__/assessments/report-email-qualitative.test.ts
git commit -m "feat(assessments): align public result email next steps"
```

### Task 4: Build the bounded Coach-only Referred Results CSV

**Files:**

- Modify: `src/src/lib/assessments/public-referrals.ts`
- Modify: `src/src/lib/rate-limit.ts`
- Modify: `src/src/lib/audit.ts`
- Create: `src/src/app/api/assessments/referred-results/export.csv/route.ts`
- Modify: `src/src/__tests__/lib/assessments/public-referrals.test.ts`
- Create: `src/src/__tests__/api/referred-results-export-route.test.ts`
- Create: `src/src/__tests__/unit/rate-limit-strict.test.ts`

**Interfaces:**

- Produces: `MAX_PUBLIC_REFERRAL_EXPORT_ROWS = 5000`.
- Produces: `exportPublicReferrals(db, actor, { query?, templateId? })`.
- Produces scalar `PublicReferralExportRow` values and outcome
  `{ status: "ok"; rows } | { status: "too-many"; totalCount } |
  { status: "forbidden" }`.
- Produces `checkRateLimitAsyncFailClosed` and `logAuditStrict` as opt-in
  contracts; existing endpoints retain their current behavior.
- Consumes: existing normalized search semantics, frozen ownership,
  `rowsToCsv`, and exact current-certification SQL predicates.

- [ ] **Step 1: Write failing domain export tests**

Add tests proving:

```ts
expect(outcome.status).toBe("forbidden");
```

for missing Coach identity and inactive certification.

For an eligible coach, inspect the parameterized SQL and assert it contains:

```ts
"referringCoachId" = coachId
"accessMode" = 'PUBLIC'
"deletedAt" IS NULL
"certificationStatus" = 'ACTIVE'
("certificationExpiry" IS NULL OR "certificationExpiry" > NOW())
COUNT(*) OVER()
LIMIT 5001
```

Assert query/template filters use parameters and the same normalized matching
semantics as `listPublicReferrals`.

The raw result fixture exposes scalar columns only. Prove full `result`,
answers, submission ID, Coach ID, and domains are absent. Test exactly 5,000
rows returns `ok`, while a returned 5,001st scalar row produces:

```ts
{ status: "too-many", totalCount: 5001 }
```

without returning the oversized row set. Add a PostgreSQL integration test
that inserts/revokes concurrently around the statement and proves eligibility,
count, and returned rows come from one statement snapshot.

- [ ] **Step 2: Run domain tests and verify red**

Run:

```bash
npx jest src/__tests__/lib/assessments/public-referrals.test.ts --runInBand
```

Expected: export symbols are missing.

- [ ] **Step 3: Implement one bounded scalar SQL statement**

Do not refactor the paginated list into a 5,001-item full-result loader.
Implement a separate parameterized `$queryRaw` statement with an eligible-Coach
CTE, frozen ownership/Public/non-deleted constraints, normalized filters,
newest-first order, `COUNT(*) OVER()`, and `LIMIT 5001`. Project only:

```text
takerName, takerEmail, assessmentName, templateAlias,
overallScore, tierLabel, submittedAt, totalCount
```

Use `templateAlias` with `reportConfigFor` to shape the display-safe Result
cell without loading the full result document. A 5,001st returned row is the
over-cap sentinel; `totalCount` comes from that same statement.

- [ ] **Step 4: Write failing route tests**

Mock the domain loader and cover:

- flag-off `404` before auth;
- missing actor `401`;
- non-Coach/missing `coachId` `403`;
- invalid/unknown/cursor query parameters `400`;
- domain `forbidden` → `403`;
- `too-many` → `422` with `{ error: "too_many_results", totalCount, maxAllowed: 5000 }`;
- rate limit → `429` before DB work (keyed by `referred-results-export:<coachId>`);
- rate-limiter backend outage → `503` before referral DB work;
- two Coaches behind one IP receive independent limiter buckets;
- audit DB failure → `503` with no CSV body;
- successful exact header order and rows;
- formula-leading values pass through the shared CSV protection;
- response has private/no-store, CSV content type, and attachment filename;
- audit contains request ID, row count, and filter booleans, never names/emails.

Expected successful CSV (note: `rowsToCsv` always quotes every cell per
RFC 4180 and uses CRLF line terminators):

```text
"Taker Name","Taker Email","Assessment","Result","Submitted At"\r\n"Jordan Lee","jordan@example.com","Scaling Up 4 Decisions","7.4 — Accelerating","2026-07-10T02:42:00.000Z"\r\n
```

Assert parsed column values (not raw string matching) plus formula-injection
neutralization across every string column.

Also assert `resultLabel` formatting edge cases: `overallScore: 0` → `"0"`,
`overallScore: 7.0` → `"7"`, `overallScore: 7.4` → `"7.4"`,
`overallScore: 10` → `"10"`.

- [ ] **Step 5: Run route tests and verify red**

Run:

```bash
npx jest src/__tests__/api/referred-results-export-route.test.ts --runInBand
```

Expected: module does not exist.

- [ ] **Step 6: Implement the route**

Add a dedicated export configuration and an opt-in strict checker:

```ts
export const RateLimits = {
  // ... existing entries
  export: { interval: 60_000, maxRequests: 10 },
};

export async function checkRateLimitAsyncFailClosed(
  identifier: string,
  config: RateLimitConfig,
): Promise<
  | { status: "ok"; result: RateLimitResult }
  | { status: "unavailable" }
> { /* Redis errors/missing production backend return unavailable */ }
```

In development/test only, the strict checker may use the existing in-memory
store. In production, missing Redis or any Redis failure returns
`{ status: "unavailable" }`; it never falls through to allow. Apply it after
authentication with key `referred-results-export:<coachId>`, so shared IPs do
not collide and spoofed forwarding headers cannot choose the actor bucket.

Validate only:

```ts
z.object({
  query: z.string().trim().min(1).max(200).optional(),
  templateId: z.string().trim().min(1).max(191).optional(),
}).strict()
```

Format result:

```ts
function resultLabel(row: PublicReferralExportRow): string {
  if (reportConfigFor(row.templateAlias).reportType === "qualitative") {
    return "Completed";
  }
  if (row.overallScore === null) return "Result unavailable";
  const score = Number(row.overallScore.toFixed(2)).toString();
  return row.tierLabel ? `${score} — ${row.tierLabel}` : score;
}
```

Create the CSV through:

```ts
rowsToCsv(
  ["Taker Name", "Taker Email", "Assessment", "Result", "Submitted At"],
  rows.map((row) => [
    row.takerName,
    row.takerEmail ?? "",
    row.assessmentName,
    resultLabel(row),
    row.submittedAt.toISOString(),
  ]),
);
```

Add `logAuditStrict` in `audit.ts`; unlike legacy `logAudit`, it propagates DB
errors. Generate a request correlation ID, persist it with PII-free scope
metadata, and only then return the CSV. Failure returns `503` without CSV:

```ts
const requestId = crypto.randomUUID();
await logAuditStrict({
  entityType: "AssessmentReferral",
  entityId: actor.coachId,
  action: "EXPORT",
  performedBy: actor.email,
  changes: {
    kind: "referred-results",
    requestId,
    rows: rows.length,
    queryApplied: Boolean(validation.data.query),
    templateFilterApplied: Boolean(validation.data.templateId),
  },
});
```

- [ ] **Step 7: Run export tests, type-check, and commit**

Run:

```bash
npx jest src/__tests__/lib/assessments/public-referrals.test.ts src/__tests__/api/referred-results-export-route.test.ts src/__tests__/unit/rate-limit-strict.test.ts --runInBand
npm run type-check
git add src/src/lib/assessments/public-referrals.ts src/src/lib/rate-limit.ts src/src/lib/audit.ts src/src/app/api/assessments/referred-results/export.csv/route.ts src/src/__tests__/lib/assessments/public-referrals.test.ts src/src/__tests__/api/referred-results-export-route.test.ts src/src/__tests__/unit/rate-limit-strict.test.ts
git commit -m "feat(assessments): export filtered referred results"
```

### Task 5: Add the filtered export action to the reviewed Coach UI

**Files:**

- Modify: `src/src/components/assessments/ReferredResultsList.tsx`
- Modify: `src/src/__tests__/components/assessments/referred-results-list.test.tsx`

**Interfaces:**

- Consumes: `appliedQuery`, selected `templateId`, `loading`, `error`, and `totalCount`.
- Produces: export href with only `query` and `templateId`.

- [ ] **Step 1: Write failing UI tests**

Assert initial export:

```ts
expect(
  screen.getByRole("link", {
    name: "Export filtered referred results as CSV",
  }),
).toHaveAttribute(
  "href",
  "/api/assessments/referred-results/export.csv",
);
```

After typing but before Search, the href must stay unchanged. After submitting:

```ts
expect(exportLink).toHaveAttribute(
  "href",
  "/api/assessments/referred-results/export.csv?query=jordan",
);
```

After assessment selection:

```ts
expect(exportLink).toHaveAttribute(
  "href",
  "/api/assessments/referred-results/export.csv?query=jordan&templateId=tpl-1",
);
expect(exportLink.getAttribute("href")).not.toContain("cursor");
```

Loading, error, and zero filtered results must render a semantic disabled
`button` with the same accessible name, no navigation, and no keyboard
activation.

- [ ] **Step 2: Run the component test and verify red**

Run:

```bash
npx jest src/__tests__/components/assessments/referred-results-list.test.tsx --runInBand
```

Expected: export action is absent.

- [ ] **Step 3: Implement the action**

Derive:

```ts
const exportHref = useMemo(() => {
  const params = new URLSearchParams();
  if (appliedQuery) params.set("query", appliedQuery);
  if (templateId) params.set("templateId", templateId);
  const search = params.toString();
  return `/api/assessments/referred-results/export.csv${search ? `?${search}` : ""}`;
}, [appliedQuery, templateId]);

const exportUnavailable =
  loading || error || totalCount === null || totalCount === 0;
```

Render the action beside the filter/count per the approved mockup. Use a real
anchor only when available; otherwise render a visually identical disabled
`button`. Keep mobile stacking and focus-visible treatment.

- [ ] **Step 4: Run component and route regression tests**

Run:

```bash
npx jest src/__tests__/components/assessments/referred-results-list.test.tsx src/__tests__/api/referred-results-route.test.ts src/__tests__/api/referred-results-export-route.test.ts --runInBand
```

Expected: green.

- [ ] **Step 5: Lint and commit**

Run:

```bash
npx eslint src/components/assessments/ReferredResultsList.tsx
git add src/src/components/assessments/ReferredResultsList.tsx src/src/__tests__/components/assessments/referred-results-list.test.tsx
git commit -m "feat(assessments): add referred results export action"
```

### Task 6: Verify the closure, update source of truth, and review the whole diff

**Files:**

- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Verify: all files changed since `48b68d37`

**Interfaces:**

- Consumes: completed Tasks 1–5.
- Produces: review-ready branch and PR with evidence.

- [ ] **Step 1: Run the complete targeted closure suite**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/onscreen-report-model.test.ts \
  src/__tests__/assessments/report-email.test.ts \
  src/__tests__/assessments/report-email-qualitative.test.ts \
  src/__tests__/assessments/report-email.wave-s-guard.test.ts \
  src/__tests__/components/assessments/branded-report.test.tsx \
  src/__tests__/components/assessments/qualitative-report.test.tsx \
  src/__tests__/components/assessments/branded-report-footer.test.tsx \
  src/__tests__/components/assessments/report-footer-order.test.tsx \
  src/__tests__/api/quick-assessment-submit.test.ts \
  src/__tests__/components/public-quiz-results.test.tsx \
  src/__tests__/lib/assessments/public-referrals.test.ts \
  src/__tests__/api/referred-results-route.test.ts \
  src/__tests__/api/referred-results-export-route.test.ts \
  src/__tests__/components/assessments/referred-results-list.test.tsx \
  --runInBand
```

Expected: green.

- [ ] **Step 2: Re-run duplicate-delivery regressions**

Locate the current Spec 19ao suites with:

```bash
rg -l "SAME_MAILBOX_AS_TAKER|atomic.*lease|assessment email lease" src/__tests__
```

Run every returned assessment-email/outbox suite individually with
`--runInBand`. Expected: green; no production code in Inngest/outbox files
changed.

- [ ] **Step 3: Run static and repository gates**

Run:

```bash
npm run type-check
npx eslint <every changed .ts and .tsx file from git diff --name-only 48b68d37>
node scripts/check-migration-safety.mjs
npm test -- --runInBand
CI=true npx next build --turbopack
```

Compare the full Jest result with the untouched-main baseline recorded before
Task 1. Any new failing suite blocks completion.

- [ ] **Step 4: Inspect the real rendered UI**

Run the app locally or a production-equivalent build, then inspect:

- scored report at desktop and narrow widths;
- qualitative report at desktop and narrow widths;
- Referred Results desktop and mobile;
- print preview for page breaks;
- keyboard focus on Learn More, Talk to a Coach, and Export CSV; and
- a downloaded CSV opened as plain text to confirm exact headers and filtered
  rows.

No production submission or email is sent during this step.

- [ ] **Step 5: Update source-of-truth records**

Prepend a `plans/CHANGELOG.md` entry with:

- screenshot-requirement matrix;
- implementation summary;
- exact test/build evidence;
- no migration/no schedule;
- duplicate hotfix unchanged;
- export authorization/cap/audit;
- rollback; and
- controlled post-deploy inbox check still requiring approved recipients.

Update `CLAUDE.md` freshness anchors and one concise Project Context sentence.

- [ ] **Step 6: Commit documentation**

Run:

```bash
git add docs/superpowers/specs/2026-07-30-jeff-public-survey-closure-design.md docs/superpowers/plans/2026-07-30-jeff-public-survey-closure.md docs/specs/v7.6/mockups/jeff-public-survey-closure.html docs/specs/v7.6/mockups/jeff-public-survey-closure.png CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(assessments): record Jeff public survey closure"
```

- [ ] **Step 7: Run two-axis code review**

Against fixed point `48b68d37`:

1. dispatch a standards reviewer to inspect correctness, maintainability,
   security, privacy, reliability, tests, and project conventions;
2. dispatch a spec reviewer to map every design acceptance criterion to the
   diff and tests;
3. verify every finding against source;
4. fix confirmed issues with red-green tests;
5. repeat both reviews until no Critical or Important issue remains.

- [ ] **Step 8: Push and open a ready PR**

Re-run the pre-push targeted suite, changed-file ESLint, migration safety, and
Turbopack build after the final review fix. Then:

```bash
git push -u origin codex/jeff-public-survey-closure
gh pr create --base main --head codex/jeff-public-survey-closure --title "feat(assessments): close Jeff public survey results gaps" --body-file <prepared-pr-body>
```

The PR body must state:

- what Jeff asked;
- what was already fixed before this PR;
- what this PR changes;
- security/privacy boundaries;
- visual link;
- exact verification;
- no migration and no schedule;
- rollout/rollback; and
- post-merge controlled inbox acceptance requires approved addresses.

## Self-review

- **Spec coverage:** identity → Tasks 1–3; verified coach boundary → Task 1;
  screen/email links → Tasks 2–3; export ownership/filter/cap/audit → Task 4;
  coach UI → Task 5; duplicate regression/no schedule → Task 6; rollout and
  evidence → Task 6.
- **Placeholder scan:** no `TBD`, `TODO`, “implement later”, or unnamed error
  handling remains.
- **Type consistency:** `respondentEmail`, `referringCoachEmail`,
  `exportPublicReferrals`, `MAX_PUBLIC_REFERRAL_EXPORT_ROWS`, and the three
  export outcomes have one spelling throughout.
