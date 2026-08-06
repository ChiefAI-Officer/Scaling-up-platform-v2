# Report-Native Comparison MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add current-versus-prior Scaling Up Full comparison to the canonical individual report for coach, admin/staff, and a designated CEO viewing only their own history.

**Architecture:** Keep ordinary frozen `AssessmentSubmission` rows as the source of truth. A bounded comparison service produces one immutable presentation model for the existing report page and all three launched report styles; operator authorization continues through the existing report gate, while CEO self-access uses a purpose-bound URL-fragment token exchanged for an exact-path sealed cookie. No comparison record, CEO user role, or group-over-time subsystem is added.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, NextAuth, `iron-session`, Node `crypto`, Jest/Testing Library, Playwright, existing Scaling Up report renderers and CSS.

## Global Constraints

- Start implementation from current `origin/main`; it includes Classic, Executive Boardroom, and Modern Dashboard report styles.
- Scope is exactly `templateAlias === "scaling-up-full"` and invited per-respondent reports.
- Compare one focus submission with exactly one earlier eligible submission from the same organization, template, and normalized-email identity.
- Include native submissions and closed, back-dated Esperto imports.
- Read frozen `submission.result` and pinned version metadata only; never call `scoreSubmission` or mutate historical data.
- Same-version aggregate deltas are allowed. Cross-version deltas are question-only and require exact `stableKey`, `SLIDER_LIKERT`, and identical finite scale bounds.
- Bound identity rows to 50, inspected submissions to 200, and returned candidates to the newest 12.
- Flag-off or kill-switch behavior must be byte-identical to the current report and perform zero comparison reads.
- CEO is `AssessmentCampaignParticipant.isCEO`, not a new `User.role`.
- A CEO grant authorizes only the token-bound CEO's focus report and same-person history. It never authorizes group report, Trends, campaign detail, another respondent, or operator navigation.
- CEO raw tokens use a URL fragment, are stripped on every exchange outcome, and are never written to React state, web storage, audit metadata, metrics, or application logs.
- CEO access expires after 30 days and is revalidated on every report request against live records, `isCEO`, `INVITED`, disclosure toggles, and feature kill state.
- Preserve the existing render-before-transaction email invariant and the current atomic submission/outbox-or-intent behavior.
- Keep the Wave N route/service/tests for rollback, but remove its promoted report and campaign-detail entry points.
- Comparison controls are screen-only; comparison facts, coverage notes, and compatibility explanations print in all three report styles.
- No Prisma schema change and no new runtime dependency.

---

## File Map

### New domain and security files

- `src/src/lib/assessments/wave-report-comparison-flags.ts` — global/canary/kill decision.
- `src/src/lib/assessments/report-comparison-model.ts` — pure frozen-result compatibility and delta model.
- `src/src/lib/assessments/report-comparison.ts` — bounded candidate and selected-baseline reads with viewer policy.
- `src/src/lib/assessments/report-comparison-metrics.ts` — PII-free structured markers.
- `src/src/lib/assessments/ceo-report-access-token.ts` — purpose-bound HMAC link token.
- `src/src/lib/assessments/ceo-report-access-cookie.ts` — exact-path `iron-session` payload and options.
- `src/src/lib/assessments/ceo-report-access.ts` — live-record CEO self gate and focus binding.
- `src/src/components/assessments/ReportComparisonControls.tsx` — screen-only baseline selector and URL controls.
- `src/src/components/assessments/ReportComparisonContent.tsx` — shared accessible comparison facts for every report style.
- `src/src/components/assessments/CeoReportAccessExchange.tsx` — fragment POST, fragment stripping, and clean redirect.
- `src/src/app/(report)/assessments/self-report/page.tsx` — public branded exchange shell.
- `src/src/app/(report)/assessments/self-report/exchange/route.ts` — token verification, live gate, cookie mint, audit.
- `docs/adr/0032-report-native-comparison-and-ceo-self-access.md` — supersedes ADR-0016 only for compatible cross-version question deltas and records CEO capability access.

### Existing production files changed

- `src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx`
- `src/src/lib/assessments/report-access-gate.ts`
- `src/src/lib/assessments/respondent-report.ts`
- `src/src/components/assessments/BrandedReport.tsx`
- `src/src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx`
- `src/src/components/assessments/report-styles/ModernDashboardReport.tsx`
- `src/src/components/assessments/report-styles/ReportSharedContent.tsx`
- `src/src/components/assessments/CampaignDetail.tsx`
- `src/src/app/(portal)/portal/assessments/[id]/page.tsx`
- `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- `src/src/components/assessments/org-survey-client.tsx`
- `src/src/lib/assessments/results-email.ts`
- `src/src/lib/audit.ts`
- `src/src/middleware.ts`
- `src/src/styles/su-report.css`
- `src/src/styles/su-report-executive.css`
- `src/src/styles/su-report-dashboard.css`
- `.env.example`
- `CLAUDE.md`
- `plans/CHANGELOG.md`

### New primary tests

- `src/src/__tests__/lib/assessments/wave-report-comparison-flags.test.ts`
- `src/src/__tests__/lib/assessments/report-comparison-model.test.ts`
- `src/src/__tests__/lib/assessments/report-comparison.test.ts`
- `src/src/__tests__/lib/assessments/ceo-report-access-token.test.ts`
- `src/src/__tests__/lib/assessments/ceo-report-access.test.ts`
- `src/src/__tests__/app/ceo-report-access-exchange.test.ts`
- `src/src/__tests__/components/assessments/report-comparison-controls.test.tsx`
- `src/src/__tests__/components/assessments/report-comparison-content.test.tsx`
- `src/e2e/report-comparison.spec.ts`

### Existing tests extended

- `src/src/__tests__/app/assessment-respondent-report-page.test.tsx`
- `src/src/__tests__/components/assessments/branded-report.test.tsx`
- `src/src/__tests__/components/assessments/report-style-renderers.test.tsx`
- `src/src/__tests__/components/assessments/report-style-print-contract.test.tsx`
- `src/src/__tests__/components/assessments/campaign-detail-view-report.test.tsx`
- `src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx`
- `src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts`
- `src/src/__tests__/assessments/org-survey-onscreen-results.test.tsx`
- `src/src/__tests__/assessments/results-email.test.ts`
- `src/src/__tests__/lib/assessments/report-access-gate.test.ts`
- `src/src/__tests__/middleware.test.ts`

---

### Task 1: Lock the policy in ADR-0032 and add the dark feature gate

**Files:**
- Create: `docs/adr/0032-report-native-comparison-and-ceo-self-access.md`
- Create: `src/src/lib/assessments/wave-report-comparison-flags.ts`
- Test: `src/src/__tests__/lib/assessments/wave-report-comparison-flags.test.ts`

**Interfaces:**
- Produces: `isReportComparisonEnabled(scope: { organizationId: string; templateId: string }): boolean`
- Produces: `REPORT_COMPARISON_ALIAS = "scaling-up-full"`
- Consumes: call-time environment variables `WAVE_RC_REPORT_COMPARISON_ENABLED`, `WAVE_RC_REPORT_COMPARISON_CANARY`, and `WAVE_RC_REPORT_COMPARISON_KILL`

- [ ] **Step 1: Write the failing flag tests**

```ts
import { isReportComparisonEnabled } from "@/lib/assessments/wave-report-comparison-flags";

describe("isReportComparisonEnabled", () => {
  afterEach(() => {
    delete process.env.WAVE_RC_REPORT_COMPARISON_ENABLED;
    delete process.env.WAVE_RC_REPORT_COMPARISON_CANARY;
    delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
  });

  it("defaults off", () => {
    expect(isReportComparisonEnabled({ organizationId: "org-1", templateId: "tpl-1" })).toBe(false);
  });

  it("matches exact organization or template canary tokens", () => {
    process.env.WAVE_RC_REPORT_COMPARISON_CANARY = "org-1, tpl-2";
    expect(isReportComparisonEnabled({ organizationId: "org-1", templateId: "tpl-x" })).toBe(true);
    expect(isReportComparisonEnabled({ organizationId: "org-10", templateId: "tpl-x" })).toBe(false);
  });

  it("lets kill override global and canary", () => {
    process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = "1";
    process.env.WAVE_RC_REPORT_COMPARISON_CANARY = "org-1";
    process.env.WAVE_RC_REPORT_COMPARISON_KILL = "true";
    expect(isReportComparisonEnabled({ organizationId: "org-1", templateId: "tpl-1" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```bash
npx jest src/src/__tests__/lib/assessments/wave-report-comparison-flags.test.ts --runInBand
```

Expected: FAIL because `wave-report-comparison-flags.ts` does not exist.

- [ ] **Step 3: Implement the call-time gate**

```ts
export const REPORT_COMPARISON_ALIAS = "scaling-up-full";

function on(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function tokens(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(/[\s,]+/).map((v) => v.trim()).filter(Boolean));
}

export function isReportComparisonEnabled(scope: {
  organizationId: string;
  templateId: string;
}): boolean {
  if (on(process.env.WAVE_RC_REPORT_COMPARISON_KILL)) return false;
  if (on(process.env.WAVE_RC_REPORT_COMPARISON_ENABLED)) return true;
  const canary = tokens(process.env.WAVE_RC_REPORT_COMPARISON_CANARY);
  return canary.has(scope.organizationId) || canary.has(scope.templateId);
}
```

- [ ] **Step 4: Write ADR-0032**

Record these exact decisions:

1. comparison is a read model over frozen submissions, not a persisted report;
2. focus plus one earlier baseline only;
3. ADR-0016 remains in force except exact-key/type/scale question deltas in this report-native surface;
4. aggregate deltas remain same-version-only;
5. operator and CEO-self viewer policies are separate;
6. CEO access is an expiring capability exchanged into an exact-path sealed cookie;
7. the single-round group report and group-over-time comparison are outside scope;
8. all three launched report styles render the same comparison facts.

- [ ] **Step 5: Run the flag test**

Run:

```bash
npx jest src/src/__tests__/lib/assessments/wave-report-comparison-flags.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0032-report-native-comparison-and-ceo-self-access.md \
  src/src/lib/assessments/wave-report-comparison-flags.ts \
  src/src/__tests__/lib/assessments/wave-report-comparison-flags.test.ts
git commit -m "feat(assessments): gate report-native comparison"
```

---

### Task 2: Build the pure frozen-result comparison model

**Files:**
- Create: `src/src/lib/assessments/report-comparison-model.ts`
- Test: `src/src/__tests__/lib/assessments/report-comparison-model.test.ts`

**Interfaces:**
- Consumes: frozen focus/baseline result JSON plus pinned `versionId` and question metadata.
- Produces: `buildReportComparisonModel(input: ReportComparisonInput): ReportComparisonModel`
- Produces: `ComparableValue`, `ReportComparisonCandidate`, `ReportComparisonModel`, and `ComparisonSnapshot`

- [ ] **Step 1: Write failing same-version and compatibility tests**

```ts
function snapshot(input: {
  versionId: string;
  scaleUpScore: number;
  domains: Array<{ key: string; averagePoints: number }>;
  sections: Array<{ stableKey: string; averagePoints: number }>;
  questions: Array<{
    stableKey: string;
    value: number;
    type: string;
    min: number;
    max: number;
  }>;
}): ComparisonSnapshot {
  return {
    submissionId: input.versionId === "v2" ? "focus" : "baseline",
    campaignId: input.versionId === "v2" ? "campaign-focus" : "campaign-baseline",
    campaignLabel: null,
    submittedAt: new Date("2026-01-01T00:00:00.000Z"),
    versionId: input.versionId,
    versionNumber: 1,
    isImported: false,
    result: {
      scaleUpScore: input.scaleUpScore,
      perDomain: input.domains,
      perSection: input.sections,
      perQuestion: input.questions.map(({ stableKey, value }) => ({
        stableKey,
        value,
        achieved: false,
      })),
    },
    questionMetaByKey: Object.fromEntries(
      input.questions.map(({ stableKey, type, min, max }) => [
        stableKey,
        { type, min, max },
      ]),
    ),
  };
}

const focus = snapshot({
  versionId: "v2",
  scaleUpScore: 72,
  domains: [{ key: "people", averagePoints: 7 }],
  sections: [{ stableKey: "s1", averagePoints: 6 }],
  questions: [{ stableKey: "q1", value: 8, type: "SLIDER_LIKERT", min: 0, max: 10 }],
});
const baseline = snapshot({
  versionId: "v2",
  scaleUpScore: 64,
  domains: [{ key: "people", averagePoints: 6 }],
  sections: [{ stableKey: "s1", averagePoints: 4 }],
  questions: [{ stableKey: "q1", value: 5, type: "SLIDER_LIKERT", min: 0, max: 10 }],
});

expect(buildReportComparisonModel({ focus, baseline }).overall).toEqual({
  current: 72,
  previous: 64,
  delta: 8,
  status: "comparable",
});
expect(buildReportComparisonModel({ focus, baseline }).questions.q1.delta).toBe(3);
```

Add focused cases for:

- cross-version aggregate values with `delta: null` and `different-version`;
- exact stable key + same slider scale across versions producing a question delta;
- renamed label remaining comparable;
- type-changed, min/max-changed, missing, removed, and non-finite values producing `unmatched`;
- missing never becoming zero;
- coverage counts including baseline-only questions.

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npx jest src/src/__tests__/lib/assessments/report-comparison-model.test.ts --runInBand
```

Expected: FAIL because the model module does not exist.

- [ ] **Step 3: Define exact immutable contracts**

```ts
export interface ComparisonQuestionMeta {
  type: string | null;
  min: number | null;
  max: number | null;
}

export interface ComparisonSnapshot {
  submissionId: string;
  campaignId: string;
  campaignLabel: string | null;
  submittedAt: Date;
  versionId: string;
  versionNumber: number;
  isImported: boolean;
  result: unknown;
  questionMetaByKey: Record<string, ComparisonQuestionMeta>;
}

export interface ComparableValue {
  current: number | null;
  previous: number | null;
  delta: number | null;
  status: "comparable" | "different-version" | "unmatched";
}
```

- [ ] **Step 4: Implement finite-value extraction and exact compatibility**

```ts
function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function comparable(current: number | null, previous: number | null): ComparableValue {
  if (current === null || previous === null) {
    return { current, previous, delta: null, status: "unmatched" };
  }
  return { current, previous, delta: current - previous, status: "comparable" };
}

function questionCompatible(
  current: ComparisonQuestionMeta | undefined,
  previous: ComparisonQuestionMeta | undefined,
): boolean {
  return current?.type === "SLIDER_LIKERT" &&
    previous?.type === "SLIDER_LIKERT" &&
    current.min !== null &&
    current.max !== null &&
    current.min === previous.min &&
    current.max === previous.max;
}
```

Implement `buildReportComparisonModel` so aggregate delta status is
`different-version` when `versionId` differs, while compatible question rows
still use `comparable`.

- [ ] **Step 5: Run the pure model tests**

Run:

```bash
npx jest src/src/__tests__/lib/assessments/report-comparison-model.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/src/lib/assessments/report-comparison-model.ts \
  src/src/__tests__/lib/assessments/report-comparison-model.test.ts
git commit -m "feat(assessments): model frozen report comparisons"
```

---

### Task 3: Add bounded candidate discovery and selected-baseline loading

**Files:**
- Create: `src/src/lib/assessments/report-comparison.ts`
- Create: `src/src/lib/assessments/report-comparison-metrics.ts`
- Test: `src/src/__tests__/lib/assessments/report-comparison.test.ts`

**Interfaces:**
- Consumes: `ReportComparisonViewer` and focus `{ campaignId, respondentId, submissionId }`.
- Consumes: `canManageCampaign(..., "read")` for operator baseline disclosure.
- Produces: `listReportComparisonCandidates(db, viewer, focus): Promise<CandidateOutcome>`
- Produces: `loadReportComparison(db, viewer, focus, baselineSubmissionId): Promise<ComparisonOutcome>`
- Produces: `emitReportComparisonMetric(event, fields)`

- [ ] **Step 1: Write failing service tests with a narrow fake DB**

Cover these outcomes in named tests:

```ts
const operatorViewer: ReportComparisonViewer = {
  kind: "operator",
  actor: {
    userId: "user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
  },
};
const focus = {
  campaignId: "focus-campaign",
  respondentId: "focus-respondent",
  submissionId: "focus-submission",
};
const db = makeReportComparisonDbFixture({
  focus,
  normalizedEmail: "ceo@example.com",
  priorSubmissionIds: ["prior-native", "prior-imported"],
});

expect(await listReportComparisonCandidates(db, operatorViewer, focus)).toMatchObject({
  kind: "ok",
  candidates: [
    { submissionId: "prior-native" },
    { submissionId: "prior-imported", isImported: true },
  ],
  bounded: false,
});
```

Define `makeReportComparisonDbFixture` in the test file as the typed fake for
the narrow `ReportComparisonDb` interface declared by the implementation; it
must record query limits, transaction boundaries, and authorization calls so
the tests assert behavior rather than Prisma implementation details.

Also assert:

- same normalized email in another organization is excluded;
- respondent-id fallback works when normalized email is null;
- focus campaign, later submissions, deleted campaigns/respondents, public submissions, malformed results, and other templates are excluded;
- duplicate identity rows in one campaign collapse deterministically with the later row winning;
- newest-first order and 50/200/12 limits are exact;
- operator candidates independently pass `canManageCampaign`;
- CEO candidates use only same-person scope and never invoke a privileged bypass;
- selected baseline authorization and read happen in one `$transaction`;
- invalid/forbidden/deleted selection returns one generic `{ kind: "invalid" }`.

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npx jest src/src/__tests__/lib/assessments/report-comparison.test.ts --runInBand
```

Expected: FAIL because `report-comparison.ts` does not exist.

- [ ] **Step 3: Define viewer and outcome contracts**

```ts
export type ReportComparisonViewer =
  | { kind: "operator"; actor: ApiActor }
  | {
      kind: "ceo-self";
      focusCampaignId: string;
      focusSubmissionId: string;
      respondentId: string;
    };

export type CandidateOutcome =
  | { kind: "ok"; candidates: ReportComparisonCandidate[]; bounded: boolean }
  | { kind: "not-applicable" | "unavailable" };

export type ComparisonOutcome =
  | { kind: "ok"; model: ReportComparisonModel }
  | { kind: "invalid" };
```

- [ ] **Step 4: Implement bounded focus and identity resolution**

Query the live focus campaign/submission first and short-circuit unless:

```ts
focus.campaign.accessMode === "INVITED" &&
focus.campaign.template.alias === REPORT_COMPARISON_ALIAS &&
isReportComparisonEnabled({
  organizationId: focus.campaign.organizationId,
  templateId: focus.campaign.templateId,
})
```

Resolve at most 50 live same-org respondent ids by normalized email, falling
back to the exact focus respondent id. Inspect at most 200 eligible submissions
ordered by:

```ts
{ submittedAt: "desc" }, { campaign: { openAt: "desc" } }, { campaignId: "desc" }, { id: "desc" }
```

Collapse by campaign, retain the newest 12, and return `bounded: true` when an
additional eligible row exists beyond the rendered cap.

- [ ] **Step 5: Implement selected-baseline transaction and model build**

Inside one `$transaction`:

1. reload the focus and candidate;
2. apply operator `canManageCampaign` or CEO exact-person viewer policy;
3. recheck live organization/template/person/chronology;
4. project both frozen snapshots, using the existing
   `buildQuestionMetaByKey()` path for question type and scale metadata;
5. call `buildReportComparisonModel`.

Return only `{ kind: "invalid" }` for every selected-baseline failure.

- [ ] **Step 6: Add PII-free metrics**

```ts
export type ReportComparisonMetricEvent =
  | "candidate_ok"
  | "candidate_empty"
  | "candidate_failed"
  | "comparison_ok"
  | "comparison_invalid";

export function emitReportComparisonMetric(
  event: ReportComparisonMetricEvent,
  fields: {
    viewer: "COACH" | "ADMIN" | "STAFF" | "CEO_SELF" | "UNKNOWN";
    count?: number;
    bounded?: boolean;
    sameVersion?: boolean;
    matchedQuestions?: number;
    unmatchedQuestions?: number;
    latencyMs?: number;
    reason?: "missing" | "forbidden" | "incompatible" | "error";
  },
): void {
  console.info("assessment.report_comparison." + event, fields);
}
```

Do not accept ids, names, emails, campaign labels, question labels, or values in
the metric field type.

- [ ] **Step 7: Run service and model tests**

Run:

```bash
npx jest \
  src/src/__tests__/lib/assessments/report-comparison-model.test.ts \
  src/src/__tests__/lib/assessments/report-comparison.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/src/lib/assessments/report-comparison.ts \
  src/src/lib/assessments/report-comparison-metrics.ts \
  src/src/__tests__/lib/assessments/report-comparison.test.ts
git commit -m "feat(assessments): load bounded report history"
```

---

### Task 4: Implement CEO link tokens, sealed report sessions, and live self gate

**Files:**
- Create: `src/src/lib/assessments/ceo-report-access-token.ts`
- Create: `src/src/lib/assessments/ceo-report-access-cookie.ts`
- Create: `src/src/lib/assessments/ceo-report-access.ts`
- Modify: `src/src/lib/assessments/respondent-report.ts`
- Modify: `src/src/lib/assessments/report-access-gate.ts`
- Modify: `src/src/lib/audit.ts`
- Test: `src/src/__tests__/lib/assessments/ceo-report-access-token.test.ts`
- Test: `src/src/__tests__/lib/assessments/ceo-report-access.test.ts`
- Modify: `src/src/__tests__/lib/assessments/respondent-report.test.ts`
- Modify: `src/src/__tests__/lib/assessments/report-access-gate.test.ts`

**Interfaces:**
- Produces: `createCeoReportAccessToken(input, ttlSeconds?): string`
- Produces: `verifyCeoReportAccessToken(token, nowSeconds?): CeoReportAccessClaims | null`
- Produces: `getCeoReportAccessSession(campaignId, respondentId)`
- Produces: `authorizeCeoReportAccess(db, claims): Promise<CeoReportSessionPayload | null>`
- Produces: `resolveCeoViewerFromExactPathSession(campaignId, respondentId): Promise<ReportComparisonViewer | null>`
- Produces: `viewCeoSelfRespondentReport(deps, scope)`

- [ ] **Step 1: Write failing HMAC token tests**

```ts
process.env.ASSESSMENT_REPORT_ACCESS_SECRET = "test-secret-at-least-thirty-two-characters";
const token = createCeoReportAccessToken({
  focusCampaignId: "campaign-1",
  invitationId: "invite-1",
  respondentId: "respondent-1",
}, 60);

expect(verifyCeoReportAccessToken(token, Math.floor(Date.now() / 1000))).toMatchObject({
  version: 1,
  purpose: "assessment-report-comparison-self",
  focusCampaignId: "campaign-1",
  invitationId: "invite-1",
  respondentId: "respondent-1",
});
expect(verifyCeoReportAccessToken(`${token}tampered`)).toBeNull();
```

Add tests for malformed shape, extra token parts, wrong purpose/version,
wrong secret, expiry boundary, non-finite expiry, and missing/short production
secret.

- [ ] **Step 2: Implement the token helper**

Use base64url JSON plus base64url HMAC-SHA256 and constant-time signature
comparison:

```ts
export interface CeoReportAccessClaims {
  version: 1;
  purpose: "assessment-report-comparison-self";
  focusCampaignId: string;
  invitationId: string;
  respondentId: string;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
```

Validate every claim after signature verification; never return a partially
parsed payload.

- [ ] **Step 3: Write failing cookie-option tests**

Assert:

```ts
expect(buildCeoReportSessionOptions("campaign-1", "respondent-1")).toMatchObject({
  cookieName: "assessment-report-self",
  cookieOptions: {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/assessments/campaign-1/respondents/respondent-1/report",
  },
});
```

The cookie payload must contain resolved `focusSubmissionId`, not a browser
supplied submission id.

- [ ] **Step 4: Implement the exact-path iron session**

```ts
export interface CeoReportSessionPayload {
  focusCampaignId: string;
  focusSubmissionId: string;
  invitationId: string;
  respondentId: string;
  expiresAt: string;
}
```

Use `ASSESSMENT_REPORT_ACCESS_SECRET`, a 30-day seal TTL, a slightly shorter
cookie `maxAge`, `Secure`, `HttpOnly`, `SameSite=Strict`, and the encoded exact
report path.

- [ ] **Step 5: Write failing live-gate tests**

Assert authorization returns a payload only when all are true:

- invitation matches campaign/respondent and is `SUBMITTED`;
- one completed submission exists for that invitation;
- campaign/respondent/participant are live;
- campaign access mode is `INVITED`;
- participant is still `isCEO`;
- template alias is `scaling-up-full`;
- `showResultsOnScreen || sendResultsToRespondent`;
- report comparison flag is on.

Assert each individual revocation input returns `null`.

- [ ] **Step 6: Implement the live gate transaction**

Resolve the signed invitation's unique submission and all revocation facts in
one transaction. Return:

```ts
{
  focusCampaignId: claims.focusCampaignId,
  focusSubmissionId: submission.id,
  invitationId: claims.invitationId,
  respondentId: claims.respondentId,
  expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
}
```

Do not use `canManageCampaign`; this is a self-only capability policy.

- [ ] **Step 7: Resolve and revalidate an existing exact-path session**

`resolveCeoViewerFromExactPathSession` reads the sealed cookie for the requested
campaign/respondent path, rejects an empty/expired/mismatched payload, reruns
the live CEO self gate, and returns:

```ts
{
  kind: "ceo-self",
  focusCampaignId: payload.focusCampaignId,
  focusSubmissionId: payload.focusSubmissionId,
  respondentId: payload.respondentId,
}
```

It returns `null` for every failure and never accepts ids only from route
parameters without a matching sealed payload.

- [ ] **Step 8: Reuse the respondent report builder behind two policies**

In `respondent-report.ts`, extract the existing authorized row-to-report body
into an unexported transaction helper. Keep `getRespondentReport(db, actor, ...)`
byte-compatible, and add `getCeoSelfRespondentReport(db, session)` that:

1. revalidates the CEO self gate in the same transaction;
2. calls the same unexported report builder;
3. returns the existing `RespondentReportOutcome`.

No caller receives an unguarded report-loader export.

- [ ] **Step 9: Add the gated adapter and audit literals**

Add these `AuditAction` values:

```ts
| "CEO_REPORT_ACCESS_EXCHANGED"
| "CEO_SELF_REPORT_VIEW"
| "VIEW_REPORT_COMPARISON"
```

`viewCeoSelfRespondentReport` must apply the standard report rate limit, use
`CEO_SELF` for metric role, and write a fail-closed `CEO_SELF_REPORT_VIEW`
audit without email or token material.

- [ ] **Step 10: Run the security and existing report tests**

Run:

```bash
npx jest \
  src/src/__tests__/lib/assessments/ceo-report-access-token.test.ts \
  src/src/__tests__/lib/assessments/ceo-report-access.test.ts \
  src/src/__tests__/lib/assessments/respondent-report.test.ts \
  src/src/__tests__/lib/assessments/report-access-gate.test.ts \
  --runInBand
```

Expected: PASS, including existing operator authorization tests.

- [ ] **Step 11: Commit**

```bash
git add src/src/lib/assessments/ceo-report-access-token.ts \
  src/src/lib/assessments/ceo-report-access-cookie.ts \
  src/src/lib/assessments/ceo-report-access.ts \
  src/src/lib/assessments/respondent-report.ts \
  src/src/lib/assessments/report-access-gate.ts \
  src/src/lib/audit.ts \
  src/src/__tests__/lib/assessments/ceo-report-access-token.test.ts \
  src/src/__tests__/lib/assessments/ceo-report-access.test.ts \
  src/src/__tests__/lib/assessments/respondent-report.test.ts \
  src/src/__tests__/lib/assessments/report-access-gate.test.ts
git commit -m "feat(assessments): authorize CEO self report access"
```

---

### Task 5: Add fragment exchange and make the individual report route self-gated

**Files:**
- Create: `src/src/components/assessments/CeoReportAccessExchange.tsx`
- Create: `src/src/app/(report)/assessments/self-report/page.tsx`
- Create: `src/src/app/(report)/assessments/self-report/exchange/route.ts`
- Modify: `src/src/middleware.ts`
- Test: `src/src/__tests__/app/ceo-report-access-exchange.test.ts`
- Modify: `src/src/__tests__/middleware.test.ts`

**Interfaces:**
- Exchange request: `POST /assessments/self-report/exchange` with `{ token: string }`
- Exchange success: `{ href: "/assessments/{campaign}/respondents/{respondent}/report" }`
- Exchange failure: generic `410` JSON without record-existence detail

- [ ] **Step 1: Write failing route tests**

Test:

1. malformed JSON/token returns generic no-store failure;
2. valid token plus live gate saves an exact-path sealed cookie;
3. the response contains only the clean canonical path;
4. expired/tampered/revoked/wrong-CEO tokens all return the same failure;
5. raw token is absent from response body, audit changes, and mocked logger calls;
6. successful exchange writes `CEO_REPORT_ACCESS_EXCHANGED` strictly.

- [ ] **Step 2: Implement the POST exchange**

Use `z.object({ token: z.string().min(1).max(4096) })`. Then:

```ts
const NO_STORE = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
} as const;

function reportHref(payload: CeoReportSessionPayload): string {
  return `/assessments/${encodeURIComponent(payload.focusCampaignId)}` +
    `/respondents/${encodeURIComponent(payload.respondentId)}/report`;
}

const claims = verifyCeoReportAccessToken(parsed.data.token);
if (!claims) return unavailable();
const payload = await authorizeCeoReportAccess(db, claims);
if (!payload) return unavailable();
const session = await getCeoReportAccessSession(
  payload.focusCampaignId,
  payload.respondentId,
);
Object.assign(session, payload);
await logAuditStrict({ /* identifiers only; no token */ });
await session.save();
return NextResponse.json({ href: reportHref(payload) }, { headers: NO_STORE });
```

The strict audit happens before `session.save()`: an audit failure must not mint
an access cookie.

- [ ] **Step 3: Write failing client exchange tests**

Assert the component:

- reads only `#t=...`;
- posts once with `cache: "no-store"` and `credentials: "include"`;
- calls `history.replaceState` on success and failure before rendering an outcome;
- redirects with `router.replace(cleanHref)` only on success;
- never writes the token to state, `localStorage`, or `sessionStorage`;
- renders a generic unavailable message on failure.

- [ ] **Step 4: Implement the fragment exchange shell**

```tsx
"use client";

async function exchange(token: string): Promise<string | null> {
  const response = await fetch("/assessments/self-report/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ token }),
  });
  if (!response.ok) return null;
  const body = await response.json() as { href?: unknown };
  return typeof body.href === "string" && body.href.startsWith("/assessments/")
    ? body.href
    : null;
}

export function CeoReportAccessExchange() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "unavailable">("working");

  useEffect(() => {
    const token = window.location.hash.match(/^#t=(.+)$/)?.[1];
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!token) {
      setStatus("unavailable");
      return;
    }
    void exchange(token).then((href) => {
      if (href) router.replace(href);
      else setStatus("unavailable");
    });
  }, [router]);

  return status === "working" ? <p>Opening your report…</p> : <p>This report link is no longer available.</p>;
}
```

Keep the raw token function-local; do not store it in the component state.

- [ ] **Step 5: Update middleware public-route and header policy**

Split the current broad report regex into explicit group and respondent
patterns. Permit unauthenticated access only to:

```ts
pathname === "/assessments/self-report" ||
pathname === "/assessments/self-report/exchange" ||
RESPONDENT_REPORT_REGEX.test(pathname)
```

The page/route remains the authorization boundary. Preserve group-report
behavior. Add `Cache-Control: no-store, private` and
`Referrer-Policy: no-referrer` to the exchange and individual report responses.

- [ ] **Step 6: Run route, middleware, and report-gate tests**

Run:

```bash
npx jest \
  src/src/__tests__/app/ceo-report-access-exchange.test.ts \
  src/src/__tests__/middleware.test.ts \
  src/src/__tests__/lib/assessments/report-access-gate.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/src/components/assessments/CeoReportAccessExchange.tsx \
  'src/src/app/(report)/assessments/self-report/page.tsx' \
  'src/src/app/(report)/assessments/self-report/exchange/route.ts' \
  src/src/middleware.ts \
  src/src/__tests__/app/ceo-report-access-exchange.test.ts \
  src/src/__tests__/middleware.test.ts
git commit -m "feat(assessments): exchange CEO report access links"
```

---

### Task 6: Wire comparison controls and viewer resolution into the canonical report

**Files:**
- Create: `src/src/components/assessments/ReportComparisonControls.tsx`
- Modify: `src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx`
- Test: `src/src/__tests__/components/assessments/report-comparison-controls.test.tsx`
- Modify: `src/src/__tests__/app/assessment-respondent-report-page.test.tsx`

**Interfaces:**
- Consumes: `searchParams.compareTo?: string`
- Produces: `ReportComparisonControls({ candidates, selectedSubmissionId, bounded })`
- Passes: `comparison?: ReportComparisonModel` into `BrandedReport`

- [ ] **Step 1: Write failing control tests**

Assert:

- selector label is exactly `Compare to previous assessment`;
- most recent candidate is selected initially but no comparison renders until
  `Compare` is pressed;
- candidate copy includes campaign label, submitted date, and `Imported`;
- blank campaign label falls back to `Scaling Up Assessment · {date}`;
- Compare navigates to `?compareTo={encodedSubmissionId}`;
- Change comparison reopens the selector;
- Remove comparison navigates to the canonical URL;
- the root has `no-print`;
- bounded candidates show `Showing 12 most recent`.

- [ ] **Step 2: Implement the client controls**

Use a native `<select>` and `useRouter`; do not fetch comparison data client
side:

```tsx
interface ReportComparisonControlsProps {
  candidates: ReportComparisonCandidate[];
  selectedSubmissionId: string | null;
  bounded: boolean;
  canonicalHref: string;
}

export function ReportComparisonControls(props: ReportComparisonControlsProps) {
  const [candidateId, setCandidateId] = useState(
    props.selectedSubmissionId ?? props.candidates[0]?.submissionId ?? "",
  );
  const href = candidateId
    ? `${props.canonicalHref}?compareTo=${encodeURIComponent(candidateId)}`
    : props.canonicalHref;
  // render visible label + select + Compare / Change / Remove buttons
}
```

- [ ] **Step 3: Write failing page tests for both viewer modes**

Cover:

1. signed-in coach and admin/staff use the existing operator gate;
2. signed-out request with a valid exact-path CEO session uses only the CEO
   self gate;
3. signed-out request without a CEO session follows the existing login path;
4. invalid CEO binding is enumeration-safe;
5. feature off performs zero candidate/comparison service calls;
6. no candidates leaves current actions byte-compatible;
7. invalid `compareTo` preserves focus report and shows the generic message;
8. valid selection passes one comparison model to `BrandedReport`;
9. export filename includes focus and baseline labels;
10. CEO output contains no operator navbar or group-report link.

- [ ] **Step 4: Refactor the server page into viewer-first orchestration**

Resolve:

```ts
const actor = await getApiActor();
const viewer = actor
  ? { kind: "operator", actor } as const
  : await resolveCeoViewerFromExactPathSession(id, respondentId);
```

Use the existing `viewRespondentReport` adapter for operator mode and
`viewCeoSelfRespondentReport` for CEO mode. Only after the focus report succeeds:

1. check alias + feature flag;
2. list candidates;
3. validate `compareTo` through `loadReportComparison`;
4. audit `VIEW_REPORT_COMPARISON` strictly before passing the model;
5. render controls only when candidates exist.

On audit failure, retain the focus report, omit comparison, and show the same
generic screen-only comparison error.

- [ ] **Step 5: Remove the report-page Wave N promoted entry**

Delete `resolveLongitudinalEntry` and the `View across campaigns` action from
this page. Do not delete the Wave N route, API, model, component, flags, or
tests.

- [ ] **Step 6: Run component and page tests**

Run:

```bash
npx jest \
  src/src/__tests__/components/assessments/report-comparison-controls.test.tsx \
  src/src/__tests__/app/assessment-respondent-report-page.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/src/components/assessments/ReportComparisonControls.tsx \
  'src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx' \
  src/src/__tests__/components/assessments/report-comparison-controls.test.tsx \
  src/src/__tests__/app/assessment-respondent-report-page.test.tsx
git commit -m "feat(assessments): compare from the individual report"
```

---

### Task 7: Render one comparison fact model in all three report styles and print

**Files:**
- Create: `src/src/components/assessments/ReportComparisonContent.tsx`
- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Modify: `src/src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx`
- Modify: `src/src/components/assessments/report-styles/ModernDashboardReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Modify: `src/src/styles/su-report-executive.css`
- Modify: `src/src/styles/su-report-dashboard.css`
- Test: `src/src/__tests__/components/assessments/report-comparison-content.test.tsx`
- Modify: `src/src/__tests__/components/assessments/branded-report.test.tsx`
- Modify: `src/src/__tests__/components/assessments/report-style-renderers.test.tsx`
- Modify: `src/src/__tests__/components/assessments/report-style-print-contract.test.tsx`

**Interfaces:**
- Consumes: `comparison?: ReportComparisonModel`
- Produces: `ComparisonCoverSubtitle` and `ReportComparisonContent`
- Extends: `BrandedReportProps`, `ExecutiveBoardroomReport`, and `ModernDashboardReport`

- [ ] **Step 1: Write failing shared-content tests**

Test accessible output for:

- cover line `Compared with {campaign} · submitted {date}`;
- overall Current, Previous, Change;
- signed positive/negative/zero delta text with non-color symbols and accessible
  wording;
- domain, section, and question tables;
- `Different version` and `New or changed question`;
- `—` with assistive `Not comparable`;
- coverage note including current matched/unmatched and baseline-only counts;
- no historical recommendations, free text, contacts, or peer content.

- [ ] **Step 2: Implement the shared comparison content**

```tsx
function formatSigned(value: number): string {
  if (Object.is(value, -0) || value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}

export function DeltaValue({ value }: { value: ComparableValue }) {
  if (value.delta === null) {
    const label = value.status === "different-version"
      ? "Different version"
      : "Not comparable";
    return <span aria-label={label}>—</span>;
  }
  const direction = value.delta > 0 ? "increase" : value.delta < 0 ? "decrease" : "no change";
  const symbol = value.delta > 0 ? "▲" : value.delta < 0 ? "▼" : "•";
  return <span aria-label={`${direction} ${Math.abs(value.delta)}`}>{symbol} {formatSigned(value.delta)}</span>;
}
```

Render tables with explicit `<th scope>` values for Current, Previous, and
Change. Keep the component pure.

- [ ] **Step 3: Thread comparison through `BrandedReport`**

Add:

```ts
comparison?: ReportComparisonModel | null;
```

Pass it into:

- `LegacyClassicReport`;
- `ExecutiveBoardroomReport`;
- `ModernDashboardReport`.

Classic inserts the cover subtitle and comparison content after its current
summary/decision area. The two modern renderers insert the subtitle on the
cover and a dedicated comparison report page before focus-only recommendations.

- [ ] **Step 4: Add style-specific CSS without changing flag-off DOM**

Use shared semantic classes under `.su-report-comparison`. Add style overrides
under `.su-report--executive` and `.su-report--dashboard`. Include:

```css
.su-report-comparison-row,
.su-report-comparison-section {
  break-inside: avoid;
  page-break-inside: avoid;
}

@media print {
  .su-report-comparison-controls { display: none !important; }
}
```

Do not alter the current renderer DOM when `comparison` is absent.

- [ ] **Step 5: Add the three-style parity matrix test**

For `CLASSIC`, `EXECUTIVE_BOARDROOM`, and `MODERN_DASHBOARD`, assert the same:

- baseline label;
- overall current/previous/delta;
- one domain, section, and question delta;
- coverage counts;
- different-version explanation.

Also assert comparison controls are absent from renderer HTML and facts remain
present in print-oriented markup.

- [ ] **Step 6: Run all renderer tests**

Run:

```bash
npx jest \
  src/src/__tests__/components/assessments/report-comparison-content.test.tsx \
  src/src/__tests__/components/assessments/branded-report.test.tsx \
  src/src/__tests__/components/assessments/report-style-renderers.test.tsx \
  src/src/__tests__/components/assessments/report-style-print-contract.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/src/components/assessments/ReportComparisonContent.tsx \
  src/src/components/assessments/BrandedReport.tsx \
  src/src/components/assessments/report-styles/ExecutiveBoardroomReport.tsx \
  src/src/components/assessments/report-styles/ModernDashboardReport.tsx \
  src/src/styles/su-report.css \
  src/src/styles/su-report-executive.css \
  src/src/styles/su-report-dashboard.css \
  src/src/__tests__/components/assessments/report-comparison-content.test.tsx \
  src/src/__tests__/components/assessments/branded-report.test.tsx \
  src/src/__tests__/components/assessments/report-style-renderers.test.tsx \
  src/src/__tests__/components/assessments/report-style-print-contract.test.tsx
git commit -m "feat(assessments): render comparison in every report style"
```

---

### Task 8: Promote the report-native entry on coach and admin campaign surfaces

**Files:**
- Modify: `src/src/components/assessments/CampaignDetail.tsx`
- Modify: `src/src/app/(portal)/portal/assessments/[id]/page.tsx`
- Modify: `src/src/__tests__/components/assessments/campaign-detail-view-report.test.tsx`
- Modify: `src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx`
- Modify: `src/src/__tests__/app/admin-campaign-detail-page.test.tsx`

**Interfaces:**
- Keeps: canonical plain-anchor report URL for coach and admin.
- Removes: promoted `longitudinalRespondentIds` prop and per-row `Over time` link.

- [ ] **Step 1: Update tests to describe the intended placement**

Assert:

- submitted respondents retain the plain-anchor `View report` action;
- the action targets
  `/assessments/{campaignId}/respondents/{respondentId}/report`;
- no `Over time` link renders on coach or admin;
- no N+1 longitudinal eligibility helper runs on campaign-detail load;
- admin continues to use production admin chrome and the same canonical report
  destination;
- group-report link behavior is unchanged.

- [ ] **Step 2: Remove only the promoted Wave N affordance**

Delete from `CampaignDetail`:

- `longitudinalRespondentIds` prop;
- local eligible-id set;
- `LineChart` import used only by the old action;
- the per-row `Over time` anchor.

Delete from the coach page the per-respondent
`hasComparableLongitudinal` loop and its imports. Keep the primary report
anchor. Do not touch the Wave N route or service files.

- [ ] **Step 3: Run coach/admin placement tests**

Run:

```bash
npx jest \
  src/src/__tests__/components/assessments/campaign-detail-view-report.test.tsx \
  src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
  src/src/__tests__/app/admin-campaign-detail-page.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/src/components/assessments/CampaignDetail.tsx \
  'src/src/app/(portal)/portal/assessments/[id]/page.tsx' \
  src/src/__tests__/components/assessments/campaign-detail-view-report.test.tsx \
  src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
  src/src/__tests__/app/admin-campaign-detail-page.test.tsx
git commit -m "refactor(assessments): promote report-native comparison entry"
```

---

### Task 9: Deliver CEO self-access through existing on-screen and results-email disclosures

**Files:**
- Modify: `src/src/lib/assessments/results-email.ts`
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- Modify: `src/src/components/assessments/org-survey-client.tsx`
- Modify: `src/src/__tests__/assessments/results-email.test.ts`
- Modify: `src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts`
- Modify: `src/src/__tests__/assessments/org-survey-onscreen-results.test.tsx`

**Interfaces:**
- Extends: `BuildResultsEmailArgs` with `ceoSelfAccessUrl?: string | null`
- Extends submit success data with `ceoSelfAccessUrl?: string`
- Uses: `createCeoReportAccessToken({ focusCampaignId, invitationId, respondentId })`

- [ ] **Step 1: Write failing results-email tests**

Assert:

- a CEO access URL adds one escaped CTA labeled `View and compare your reports`;
- a null URL leaves existing results email HTML byte-compatible;
- `javascript:`, protocol-relative, and non-http(s) URLs are rejected;
- the access CTA is not added to coach-notify email.

- [ ] **Step 2: Extend the pure results-email builder**

```ts
export interface BuildResultsEmailArgs {
  bodyMarkdown: string;
  reportHtml: string;
  ceoSelfAccessUrl?: string | null;
}
```

Append a compact CTA only after validating an absolute `https:` URL in
production (`http:` may be accepted only for local/test origins).

- [ ] **Step 3: Write failing submit-route tests**

Cover:

1. SU Full + designated CEO + feature on + `showResultsOnScreen` returns a
   fragment access URL;
2. SU Full + designated CEO + approved `sendResultsToRespondent` embeds the
   same link in the prepared results email;
3. non-CEO, other template, flag off, both disclosure toggles off, stale CEO
   designation, or kill switch issues no link;
4. token claims bind campaign, invitation, and respondent;
5. the submission transaction still creates the submission and outbox/intent
   atomically;
6. email rendering remains outside the transaction;
7. a Phase-1/Phase-2 CEO designation race drops the link-bearing results row
   rather than sending a stale capability;
8. link generation failure degrades to the current report/email behavior and
   never fails submission.

- [ ] **Step 4: Refactor the existing SU Full participant lookup once**

Resolve `AssessmentCampaignParticipant.isCEO` during Phase 1 and reuse it for:

- CEO-only question filtering;
- deciding whether to prepare a CEO access link.

Inside the locked transaction, reload the participant row and compute:

```ts
const ceoSelfAccessAuthorized =
  isReportComparisonEnabled(scope) &&
  lockedParticipant?.isCEO === true &&
  locked.campaign.accessMode === "INVITED" &&
  (locked.campaign.showResultsOnScreen || locked.campaign.sendResultsToRespondent);
```

Mark the prepared results row when it contains a CEO access link. Drop that
row if the locked authorization no longer matches, following the existing
stale-render-input drop contract.

- [ ] **Step 5: Return the link only through an authorized disclosure**

Return `ceoSelfAccessUrl` when:

- the locked CEO authorization passed; and
- `discloseOnScreen` is true.

The send-only case receives the link only through the already-approved results
email. Do not return it universally and hide it in the client.

- [ ] **Step 6: Add the on-screen CTA**

Extend the results phase:

```ts
| {
    kind: "results";
    report: RespondentReport;
    ceoSelfAccessUrl?: string;
    reportStylesAvailable?: boolean;
    reportFindingsAvailable?: boolean;
  }
```

Render a screen-only plain anchor labeled `Compare with a previous assessment`
next to Print only when the server returned the URL. Do not store the URL in
the on-screen report persistence envelope.

- [ ] **Step 7: Run delivery tests**

Run:

```bash
npx jest \
  src/src/__tests__/assessments/results-email.test.ts \
  src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts \
  src/src/__tests__/assessments/org-survey-onscreen-results.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/src/lib/assessments/results-email.ts \
  'src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/src/components/assessments/org-survey-client.tsx \
  src/src/__tests__/assessments/results-email.test.ts \
  src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts \
  src/src/__tests__/assessments/org-survey-onscreen-results.test.tsx
git commit -m "feat(assessments): deliver CEO self comparison access"
```

---

### Task 10: Complete audit, integration, visual, print, and rollout verification

**Files:**
- Create: `src/e2e/report-comparison.spec.ts`
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-08-05-report-comparison-mvp-design.md` only if implementation evidence requires a factual correction

**Interfaces:**
- Verifies the end-to-end contracts produced by Tasks 1–9.
- Adds no new product behavior.

- [ ] **Step 1: Add end-to-end fixtures**

Create one organization with:

- a native current Scaling Up Full CEO submission;
- one native prior submission;
- one imported prior submission;
- one non-CEO participant;
- one other-organization respondent sharing the CEO's normalized email;
- Classic, Executive Boardroom, and Modern Dashboard campaigns.

- [ ] **Step 2: Write operator E2E coverage**

For coach and admin:

1. enter from the production campaign detail `View report` action;
2. verify selector candidates and most-recent default;
3. activate native and imported baselines;
4. verify URL, current/previous/delta, coverage, and Remove comparison;
5. verify Print hides controls and preserves comparison facts;
6. repeat the fact assertions for all three report styles.

- [ ] **Step 3: Write CEO E2E coverage**

1. submit through an invited CEO link;
2. follow the server-issued self-access link;
3. verify fragment removal and clean canonical URL;
4. compare only the CEO's own eligible history;
5. attempt another respondent, group report, Trends, campaign detail, and
   altered focus ids; each must deny;
6. turn off both disclosure toggles and verify the existing cookie immediately
   stops authorizing;
7. restore disclosure, remove `isCEO`, and verify access remains denied;
8. verify a non-CEO submission receives no comparison link.

- [ ] **Step 4: Run targeted Jest suites**

Run:

```bash
npx jest \
  src/src/__tests__/lib/assessments/wave-report-comparison-flags.test.ts \
  src/src/__tests__/lib/assessments/report-comparison-model.test.ts \
  src/src/__tests__/lib/assessments/report-comparison.test.ts \
  src/src/__tests__/lib/assessments/ceo-report-access-token.test.ts \
  src/src/__tests__/lib/assessments/ceo-report-access.test.ts \
  src/src/__tests__/app/ceo-report-access-exchange.test.ts \
  src/src/__tests__/app/assessment-respondent-report-page.test.tsx \
  src/src/__tests__/components/assessments/report-comparison-controls.test.tsx \
  src/src/__tests__/components/assessments/report-comparison-content.test.tsx \
  src/src/__tests__/components/assessments/report-style-renderers.test.tsx \
  src/src/__tests__/components/assessments/report-style-print-contract.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-view-report.test.tsx \
  src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts \
  src/src/__tests__/assessments/results-email.test.ts \
  src/src/__tests__/middleware.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run legacy regression suites**

Run:

```bash
npx jest \
  src/src/__tests__/lib/assessments/respondent-report.test.ts \
  src/src/__tests__/lib/assessments/respondent-longitudinal.test.ts \
  src/src/__tests__/lib/assessments/longitudinal-eligibility.test.ts \
  src/src/__tests__/app/respondent-longitudinal-page.test.tsx \
  src/src/__tests__/api/assessment-templates/longitudinal-route.test.ts \
  src/src/__tests__/components/respondent-longitudinal-view.test.tsx \
  src/src/__tests__/components/assessments/branded-report.test.tsx \
  src/src/__tests__/app/group-report-route.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 6: Run static and migration gates**

Run:

```bash
npx eslint \
  src/src/lib/assessments/wave-report-comparison-flags.ts \
  src/src/lib/assessments/report-comparison-model.ts \
  src/src/lib/assessments/report-comparison.ts \
  src/src/lib/assessments/report-comparison-metrics.ts \
  src/src/lib/assessments/ceo-report-access-token.ts \
  src/src/lib/assessments/ceo-report-access-cookie.ts \
  src/src/lib/assessments/ceo-report-access.ts \
  src/src/components/assessments/ReportComparisonControls.tsx \
  src/src/components/assessments/ReportComparisonContent.tsx \
  src/src/components/assessments/CeoReportAccessExchange.tsx \
  'src/src/app/(report)/assessments/self-report/page.tsx' \
  'src/src/app/(report)/assessments/self-report/exchange/route.ts' \
  'src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx'
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: ESLint clean, migration safety passes with no new migration, and
Turbopack build passes.

- [ ] **Step 7: Run browser visual and print review**

Run:

```bash
npx playwright test src/e2e/report-comparison.spec.ts
```

Capture and review:

- desktop at 1440px;
- narrow screen at 390px;
- browser print preview;
- saved PDF;
- Classic, Executive Boardroom, and Modern Dashboard;
- coach, admin, and CEO self-viewer.

Reject launch for clipped tables, orphaned headers, color-only deltas, controls
in print, operator chrome on CEO view, or style-to-style fact drift.

- [ ] **Step 8: Add environment and rollout documentation**

Add to `.env.example`:

```text
ASSESSMENT_REPORT_ACCESS_SECRET=
WAVE_RC_REPORT_COMPARISON_ENABLED=0
WAVE_RC_REPORT_COMPARISON_CANARY=
WAVE_RC_REPORT_COMPARISON_KILL=0
```

Update `CLAUDE.md` anchors and prepend a `plans/CHANGELOG.md` entry with:

- exact commits;
- test/build evidence;
- canary organization/template;
- secret setup requirement;
- kill procedure;
- confirmation that no schema migration exists;
- confirmation that group report behavior is unchanged.

- [ ] **Step 9: Commit the verification and SoT package**

```bash
git add src/e2e/report-comparison.spec.ts \
  .env.example \
  CLAUDE.md \
  plans/CHANGELOG.md
git commit -m "test(assessments): verify report comparison rollout"
```

- [ ] **Step 10: Pre-push evidence check**

Run:

```bash
git status --short
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
```

Expected: only intentional implementation artifacts remain, commit sequence is
reviewable, and diff check is clean.
