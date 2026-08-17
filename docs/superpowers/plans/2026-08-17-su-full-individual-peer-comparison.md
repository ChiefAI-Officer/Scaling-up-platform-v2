# Scaling Up Full Individual Peer Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved section-overview and detailed You/Peers comparison surfaces to the Classic Scaling Up Full individual report, using the governed database benchmarks without changing scoring, growth phase, group reports, or emails.

**Architecture:** Build one pure Scaling Up Full peer presentation model from the frozen `RespondentReport` plus current template-level benchmark rows. A reusable server resolver gates and enriches server-owned report payloads, and a dedicated Classic component renders both approved surfaces from that single model while the existing report remains the fail-closed fallback.

**Tech Stack:** TypeScript 5, React 19, Next.js 16 App Router, Prisma 5, Jest 30, Testing Library, scoped CSS, browser print/PDF.

**Spec:** `docs/superpowers/specs/2026-08-17-su-full-individual-peer-comparison-design.md`

## Global Constraints

- Render only for template alias `scaling-up-full`, resolved report style `CLASSIC`, an enabled peer gate, and a complete valid Q01-Q61 presentation.
- Use `AssessmentBenchmark` `QUESTION` rows as the individual-report source; never calculate peers from the current campaign and never silently fall back to the static snapshot.
- Read the respondent's score and feedback only from the frozen submission result; peer gaps never select or generate recommendations.
- Both surfaces consume the same pure model: Surface A scans a section with independent paired micro-bars; Surface B renders question -> You/Peers bars -> frozen feedback.
- Explicit `You` and `Peers` text plus numeric values are required; color may not be the only identifier, and no line/path may connect values between rows.
- Missing, duplicate, non-finite, out-of-range, degraded, or incomplete data omits both peer surfaces while preserving the existing report.
- Keep Executive Boardroom, Modern Dashboard, LVA, group reports, growth phase, report email, public mini-quiz/CTA, scoring, feedback bands, and benchmark administration unchanged.
- Browser Print/Download PDF must preserve labels, values, disclosure, and readable page breaks.
- Phase A ships dark with Scaling Up Full absent from `PEER_RENDER_ENABLED_ALIASES`; activation is a separate final task after Production row verification and explicit release approval.
- Run Jest, TypeScript, ESLint, build, and script commands from `src/`; run every `git add`/`git commit` block from the repository root.

---

## File Structure

### New files

- `src/src/lib/assessments/su-full-peer-presentation.ts` - pure Scaling Up Full validation, stable-key joins, section ordering/totals, benchmark date, and bounded failure reasons.
- `src/src/lib/assessments/peer-report-resolver.ts` - reusable flag/alias/style gates, one benchmark query, LVA/SU-Full dispatch, enrichment, and fail-soft telemetry.
- `src/src/components/assessments/SuFullPeerComparison.tsx` - Classic-only Surface A and Surface B presentational components.
- `src/src/__tests__/lib/assessments/su-full-peer-presentation.test.ts` - complete-set and ordering contract.
- `src/src/__tests__/lib/assessments/peer-report-resolver.test.ts` - gate, query, dispatch, and telemetry contract.
- `src/src/__tests__/components/assessments/su-full-peer-render.test.tsx` - approved UI hierarchy, no-duplication, accessibility, and style-scope contract.
- `src/src/__tests__/fixtures/su-full-peer.ts` - canonical 61-key report and benchmark fixtures shared by model, resolver, renderer, and route tests.
- `src/scripts/verify-scaling-up-full-peer-benchmarks.ts` - read-only activation evidence for Production key/value/date readiness.

### Modified files

- `src/src/lib/assessments/respondent-report.ts` - optional render-time `suFullPeerPresentation` payload; not submission provenance.
- `src/src/lib/assessments/peer-benchmarks.ts` - keep LVA builder unchanged; activation task adds the SU-Full alias only after the dark deployment checkpoint.
- `src/src/components/assessments/BrandedReport.tsx` - render the dedicated peer sequence for eligible Classic SU-Full reports and suppress duplicate generic slider detail/recommendations.
- `src/src/styles/su-report.css` - scoped responsive and print styles for independent paired bars.
- `src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx` - replace page-local peer resolution with the shared resolver.
- `src/src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx` - enrich eligible authorized public-submission reports by submission ID.
- `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts` - enrich only the selected disclosed on-screen report after the submission transaction.
- `src/src/lib/assessments/onscreen-result-store.ts` - preserve the optional payload through existing JSON/session revival; no envelope-version change is required because revival already spreads additive fields.
- Existing focused test suites listed in Tasks 4-7 - route, on-screen, regression, and activation coverage.
- `CLAUDE.md` and `plans/CHANGELOG.md` - Source-of-Truth record before any production-bound push.

---

### Task 1: Pure Scaling Up Full Peer Presentation Model

**Files:**
- Create: `src/src/lib/assessments/su-full-peer-presentation.ts`
- Create: `src/src/__tests__/fixtures/su-full-peer.ts`
- Modify: `src/src/lib/assessments/respondent-report.ts`
- Test: `src/src/__tests__/lib/assessments/su-full-peer-presentation.test.ts`

**Interfaces:**
- Consumes: `RespondentReport`, `SCALING_UP_FULL_TEMPLATE_ALIAS`, and the expected stable keys from `SU_FULL_QUESTION_BENCHMARKS`.
- Produces: `SuFullPeerPresentation`, `SuFullPeerBenchmarkRow`, `SuFullPeerBuildReason`, `buildSuFullPeerPresentationResult(input)`, `buildSuFullPeerPresentation(input)`, `completeSuFullPeerReport()`, and `completeSuFullBenchmarkRows()`.

- [ ] **Step 1: Write the happy-path failing test with all 61 canonical keys**

Use the canonical key list so the test stays aligned with the governed snapshot while deliberately reversing benchmark-row order to prove the join is by stable key:

```ts
import {
  SU_FULL_QUESTION_BENCHMARKS,
} from "@/lib/assessments/su-full-question-benchmarks";
import {
  buildSuFullPeerPresentationResult,
} from "@/lib/assessments/su-full-peer-presentation";
import type { RespondentReport } from "@/lib/assessments/respondent-report";

export function completeSuFullPeerReport(): RespondentReport {
  const keys = SU_FULL_QUESTION_BENCHMARKS.map((row) => row.stableKey);
  const questionsByKey = Object.fromEntries(keys.map((stableKey, index) => [
    stableKey,
    {
      type: "SLIDER_LIKERT",
      label: `Question ${index + 1}`,
      sectionStableKey: index < 8 ? "S_PEOPLE_YE" : "S_REST",
      max: 10,
    },
  ]));
  return {
    respondentName: "Ari Founder",
    respondentEmail: "ari@example.com",
    jobTitle: "CEO",
    companyName: "Acme",
    assessmentName: "Scaling Up Full",
    templateAlias: "scaling-up-full",
    reportStyle: "CLASSIC",
    campaignLabel: null,
    submittedAt: new Date("2026-08-17T00:00:00Z"),
    result: {
      perQuestion: keys.map((stableKey, index) => ({
        stableKey,
        value: index % 11,
        achieved: true,
        recommendation: `Frozen feedback ${stableKey}`,
      })),
      perSection: [],
    } as RespondentReport["result"],
    sections: [
      { stableKey: "S_PEOPLE_YE", name: "Your Employees", domain: "people" },
      { stableKey: "S_REST", name: "Remaining Questions", domain: "strategy" },
    ],
    questionByKey: Object.fromEntries(keys.map((key, index) => [key, `Question ${index + 1}`])),
    questionsByKey,
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-1",
      versionId: "ver-4",
      contentHash: "hash-4",
      templateName: "Scaling Up Full",
    },
    degraded: false,
  };
}

export function completeSuFullBenchmarkRows() {
  return SU_FULL_QUESTION_BENCHMARKS.map((row, index) => ({
    metricKey: row.stableKey,
    value: row.value,
    updatedAt: new Date(index === 60 ? "2026-08-18T00:00:00Z" : "2026-08-17T00:00:00Z"),
  }));
}

test("builds both sections in frozen order and joins all 61 rows by stable key", () => {
  const benchmarks = completeSuFullBenchmarkRows().reverse();
  const result = buildSuFullPeerPresentationResult({ report: completeSuFullPeerReport(), benchmarks });
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.reason);
  expect(result.presentation.sections.flatMap((section) => section.questions)).toHaveLength(61);
  expect(result.presentation.sections[0].stableKey).toBe("S_PEOPLE_YE");
  expect(result.presentation.sections[0].questions[0]).toMatchObject({
    stableKey: "Q01",
    peers: 6.3,
    recommendation: "Frozen feedback Q01",
  });
  expect(result.presentation.benchmarkUpdatedAt).toBe("2026-08-18T00:00:00.000Z");
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run from `src/`:

```bash
npx jest src/__tests__/lib/assessments/su-full-peer-presentation.test.ts --runInBand
```

Expected: FAIL because `su-full-peer-presentation.ts` does not exist.

- [ ] **Step 3: Define the exact immutable presentation and failure types**

Create these exported contracts:

```ts
export type SuFullPeerBenchmarkRow = Readonly<{
  metricKey: string;
  value: number;
  updatedAt: Date | string;
}>;

export type SuFullPeerQuestionComparison = Readonly<{
  stableKey: string;
  label: string;
  you: number;
  peers: number;
  recommendation: string | null;
}>;

export type SuFullPeerSectionComparison = Readonly<{
  stableKey: string;
  label: string;
  domain: string | null;
  youTotal: number;
  peersTotal: number;
  questions: readonly SuFullPeerQuestionComparison[];
}>;

export type SuFullPeerPresentation = Readonly<{
  benchmarkUpdatedAt: string;
  sections: readonly SuFullPeerSectionComparison[];
}>;

export type SuFullPeerBuildReason =
  | "WRONG_TEMPLATE"
  | "DEGRADED_REPORT"
  | "KEY_MISMATCH"
  | "MISSING_ROWS"
  | "DUPLICATE_ROWS"
  | "INVALID_BENCHMARK"
  | "INVALID_SCORE"
  | "INVALID_UPDATED_AT";

export type SuFullPeerBuildResult =
  | Readonly<{ status: "ready"; presentation: SuFullPeerPresentation }>
  | Readonly<{
      status: "unavailable";
      reason: SuFullPeerBuildReason;
      expectedCount: number;
      benchmarkCount: number;
      scoreCount: number;
    }>;
```

- [ ] **Step 4: Implement the minimal pure builder**

Implement both functions without DB, environment, logging, or React imports:

```ts
export function buildSuFullPeerPresentationResult(input: {
  report: RespondentReport;
  benchmarks: readonly SuFullPeerBenchmarkRow[];
}): SuFullPeerBuildResult;

export function buildSuFullPeerPresentation(input: {
  report: RespondentReport;
  benchmarks: readonly SuFullPeerBenchmarkRow[];
}): SuFullPeerPresentation | null {
  const result = buildSuFullPeerPresentationResult(input);
  return result.status === "ready" ? result.presentation : null;
}
```

Implementation rules:

- Build `EXPECTED_KEYS` from `SU_FULL_QUESTION_BENCHMARKS`, not a second hand-written list.
- Require the frozen `SLIDER_LIKERT` question-key set, `result.perQuestion` key set, and benchmark key set to equal `EXPECTED_KEYS` exactly; ignore legitimate non-slider background questions.
- Detect duplicate benchmark rows before creating a `Map`.
- Accept `updatedAt` as `Date` or an ISO string, reject invalid dates, and use the greatest timestamp.
- Use frozen `questionsByKey` insertion order inside frozen `sections` order.
- Read `you` and `recommendation` from the matching frozen `result.perQuestion` row.
- Round only derived section totals to one decimal; do not change stored/displayed question values.
- Return a bounded unavailable result instead of throwing for data-shape failures.

- [ ] **Step 5: Run the happy-path test and verify it passes**

```bash
npx jest src/__tests__/lib/assessments/su-full-peer-presentation.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Add complete-set, provenance, and feedback edge tests**

Add table-driven tests asserting these exact outcomes:

```ts
test.each([
  ["wrong alias", (r: RespondentReport) => ({ ...r, templateAlias: "qsp-v2" }), "WRONG_TEMPLATE"],
  ["degraded", (r: RespondentReport) => ({ ...r, degraded: true }), "DEGRADED_REPORT"],
])("%s fails closed", (_name, mutate, reason) => {
  const report = mutate(completeSuFullPeerReport());
  const result = buildSuFullPeerPresentationResult({ report, benchmarks: completeSuFullBenchmarkRows() });
  expect(result).toMatchObject({ status: "unavailable", reason });
});

test("a blank frozen recommendation remains null and is never invented", () => {
  const report = completeSuFullPeerReport();
  const q01 = report.result.perQuestion?.find((row) => row.stableKey === "Q01");
  if (q01) q01.recommendation = "";
  const result = buildSuFullPeerPresentationResult({ report, benchmarks: completeSuFullBenchmarkRows() });
  expect(result.status).toBe("ready");
  if (result.status === "ready") {
    expect(result.presentation.sections[0].questions[0].recommendation).toBeNull();
  }
});
```

Also cover one missing benchmark, duplicate Q01, `NaN`, value `10.1`, one missing score, invalid score `-1`, a missing frozen question key, invalid `updatedAt`, and unexpected extra required key.

- [ ] **Step 7: Add the optional render-time payload to `RespondentReport`**

Add a type-only import and this field after `isImported`:

```ts
/** Current template-level reference data resolved for this render; not submission provenance. */
suFullPeerPresentation?: SuFullPeerPresentation | null;
```

Do not modify `buildRespondentReportFromSubmission`; enrichment remains server-side and asynchronous.

- [ ] **Step 8: Run the model suite and type-check**

```bash
npx jest src/__tests__/lib/assessments/su-full-peer-presentation.test.ts --runInBand
npx tsc --noEmit
```

Expected: both commands PASS.

- [ ] **Step 9: Commit the pure model**

```bash
git add src/src/lib/assessments/su-full-peer-presentation.ts src/src/lib/assessments/respondent-report.ts src/src/__tests__/fixtures/su-full-peer.ts src/src/__tests__/lib/assessments/su-full-peer-presentation.test.ts
git commit -m "feat(assessments): model SU Full peer comparisons"
```

---

### Task 2: Reusable Peer Report Resolver

**Files:**
- Create: `src/src/lib/assessments/peer-report-resolver.ts`
- Test: `src/src/__tests__/lib/assessments/peer-report-resolver.test.ts`
- Modify: `src/src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx`

**Interfaces:**
- Consumes: `buildPeerComparisonSection`, `buildSuFullPeerPresentationResult`, `isPeerBenchmarksEnabled`, `isPeerRenderEnabledAlias`, `effectiveReportStyle`, and `hasSourcePublicResult`.
- Produces: `PeerReportEnhancements`, `resolvePeerReportEnhancements(input)`, `resolvePeerReportEnhancementsForCampaign(input)`, and `resolvePeerReportEnhancementsForSubmission(input)`.

- [ ] **Step 1: Write failing resolver tests for dark gates and one-query dispatch**

Define a structural fake DB and logger:

```ts
const findMany = jest.fn();
const findSubmission = jest.fn();
const warn = jest.fn();
const db = {
  assessmentBenchmark: { findMany },
  assessmentSubmission: { findFirst: findSubmission },
};

test("flag off returns the original report without a DB read", async () => {
  const report = completeSuFullPeerReport();
  const result = await resolvePeerReportEnhancements({
    db,
    report,
    templateId: "tpl-su",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: false,
    logger: { warn },
  });
  expect(findMany).not.toHaveBeenCalled();
  expect(result.report).toBe(report);
  expect(result.lvaPeerComparison).toBeNull();
});

test("eligible Classic SU Full performs one query and attaches the ready model", async () => {
  findMany.mockResolvedValue(completeSuFullBenchmarkRows());
  const result = await resolvePeerReportEnhancements({
    db,
    report: completeSuFullPeerReport(),
    templateId: "tpl-su",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });
  expect(findMany).toHaveBeenCalledTimes(1);
  expect(findMany).toHaveBeenCalledWith({
    where: { templateId: "tpl-su", metricKind: "QUESTION" },
    select: { metricKey: true, value: true, updatedAt: true },
  });
  expect(result.report.suFullPeerPresentation?.sections.flatMap((s) => s.questions)).toHaveLength(61);
});
```

Use `enabledAliases` only as an explicit dependency for pure resolver tests; production callers omit it and use `PEER_RENDER_ENABLED_ALIASES`.

- [ ] **Step 2: Run the resolver test and verify the missing module failure**

```bash
npx jest src/__tests__/lib/assessments/peer-report-resolver.test.ts --runInBand
```

Expected: FAIL because `peer-report-resolver.ts` does not exist.

- [ ] **Step 3: Implement the structural resolver contracts**

```ts
export interface PeerReportResolverDb {
  assessmentBenchmark: {
    findMany(args: {
      where: { templateId: string; metricKind: "QUESTION" };
      select: { metricKey: true; value: true; updatedAt: true };
    }): Promise<Array<{ metricKey: string; value: number; updatedAt: Date }>>;
  };
  assessmentSubmission?: {
    findFirst(args: {
      where: { id: string };
      select: { campaign: { select: { templateId: true } } };
    }): Promise<{ campaign: { templateId: string } } | null>;
  };
  assessmentCampaign?: {
    findFirst(args: {
      where: { id: string; deletedAt: null };
      select: { templateId: true };
    }): Promise<{ templateId: string } | null>;
  };
}

export type PeerReportEnhancements = Readonly<{
  report: RespondentReport;
  lvaPeerComparison: PeerComparisonSection | null;
}>;

export async function resolvePeerReportEnhancements(input: {
  db: PeerReportResolverDb;
  report: RespondentReport;
  templateId: string;
  reportStylesAvailable: boolean;
  peerBenchmarksEnabled?: boolean;
  enabledAliases?: readonly string[];
  logger?: Pick<Console, "warn">;
}): Promise<PeerReportEnhancements>;
```

Production defaults:

- `peerBenchmarksEnabled` defaults to `isPeerBenchmarksEnabled()`.
- `enabledAliases` defaults to `PEER_RENDER_ENABLED_ALIASES`.
- `logger` defaults to `console`.

- [ ] **Step 4: Implement alias/style gates before the query**

Resolve the effective style with the same policy as `BrandedReport`:

```ts
const resolvedStyle = hasSourcePublicResult(report.templateAlias, report.publicLeadActions)
  ? "CLASSIC"
  : effectiveReportStyle({
      storedStyle: typeof report.reportStyle === "string" ? report.reportStyle : undefined,
      available: input.reportStylesAvailable,
    });
```

Rules:

- Return unchanged before querying when the feature is off or alias is absent.
- For Scaling Up Full, return unchanged before querying unless `resolvedStyle === "CLASSIC"`.
- For LVA, preserve current behavior and call its existing pure builder after the same one-row-set query.
- Never add Scaling Up Full to the production alias list in this task.

- [ ] **Step 5: Implement bounded fail-soft telemetry**

For SU-Full builder unavailability, log exactly one warning with no answers or names:

```ts
logger.warn("assessment.peer_benchmark.unavailable", {
  reason: result.reason,
  templateAlias: report.templateAlias,
  templateId,
  submissionId: report.provenance.submissionId,
  versionId: report.provenance.versionId,
  expectedCount: result.expectedCount,
  benchmarkCount: result.benchmarkCount,
  scoreCount: result.scoreCount,
});
```

For a DB exception use reason `DB_ERROR` and only the error name, never the message.

- [ ] **Step 6: Add campaign-ID and submission-ID wrappers**

```ts
export async function resolvePeerReportEnhancementsForCampaign(input: {
  db: PeerReportResolverDb;
  report: RespondentReport;
  campaignId: string;
  reportStylesAvailable: boolean;
  peerBenchmarksEnabled?: boolean;
  enabledAliases?: readonly string[];
  logger?: Pick<Console, "warn">;
}): Promise<PeerReportEnhancements>;
```

It performs one `assessmentCampaign.findFirst` selecting only `templateId`, then delegates to `resolvePeerReportEnhancements`. A missing/deleted campaign returns the original report and logs reason `CAMPAIGN_TEMPLATE_NOT_FOUND`.

```ts
export async function resolvePeerReportEnhancementsForSubmission(input: {
  db: PeerReportResolverDb;
  report: RespondentReport;
  reportStylesAvailable: boolean;
  peerBenchmarksEnabled?: boolean;
  enabledAliases?: readonly string[];
  logger?: Pick<Console, "warn">;
}): Promise<PeerReportEnhancements>;
```

It reads `report.provenance.submissionId`, performs one `assessmentSubmission.findFirst` selecting only `campaign.templateId`, and delegates to `resolvePeerReportEnhancements`. A missing submission returns the original report and logs reason `SUBMISSION_TEMPLATE_NOT_FOUND`.

- [ ] **Step 7: Add resolver edge tests**

Cover:

- alias absent -> no query;
- SU Full + Executive/Modern resolved style -> no query;
- report styles unavailable + stored Modern -> Classic fallback and query;
- source-owned result -> Classic and query;
- incomplete SU rows -> original report, warning reason `MISSING_ROWS`;
- DB throw -> original report, warning reason `DB_ERROR`;
- LVA -> unchanged `PeerComparisonSection` behavior;
- submission wrapper -> one template lookup then one benchmark query; and
- campaign wrapper -> one campaign lookup then one benchmark query;
- missing submission -> unchanged report and no benchmark query.

- [ ] **Step 8: Update the Wave S page harness to expect `updatedAt` in resolver rows**

Change its benchmark fixture rows to include `updatedAt: new Date("2026-08-14T00:00:00Z")` and its query expectation to select `updatedAt: true`. Keep all existing LVA assertions.

- [ ] **Step 9: Run resolver and existing Wave S suites**

```bash
npx jest src/__tests__/lib/assessments/peer-report-resolver.test.ts src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx src/__tests__/lib/assessments/peer-benchmarks.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 10: Commit the resolver**

```bash
git add src/src/lib/assessments/peer-report-resolver.ts src/src/__tests__/lib/assessments/peer-report-resolver.test.ts src/src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx
git commit -m "feat(assessments): resolve report peer references"
```

---

### Task 3: Classic Paired-Bar Renderer and Print Styles

**Files:**
- Create: `src/src/components/assessments/SuFullPeerComparison.tsx`
- Modify: `src/src/components/assessments/BrandedReport.tsx`
- Modify: `src/src/styles/su-report.css`
- Test: `src/src/__tests__/components/assessments/su-full-peer-render.test.tsx`
- Test: `src/src/__tests__/components/assessments/branded-report.test.tsx`
- Test: `src/src/__tests__/components/assessments/report-style-renderers.test.tsx`

**Interfaces:**
- Consumes: `report.suFullPeerPresentation?: SuFullPeerPresentation | null` from Task 1.
- Produces: `SuFullPeerComparison({ presentation })`, test IDs for both surfaces, and the Classic-only replacement sequence.

- [ ] **Step 1: Write the failing component hierarchy test**

```tsx
function suFullReportWithPeers() {
  const report = completeSuFullPeerReport();
  const built = buildSuFullPeerPresentationResult({
    report,
    benchmarks: completeSuFullBenchmarkRows(),
  });
  if (built.status !== "ready") throw new Error(built.reason);
  return { ...report, suFullPeerPresentation: built.presentation };
}

render(<BrandedReport report={suFullReportWithPeers()} />);

const overview = screen.getByTestId("su-full-peer-overview-S_PEOPLE_YE");
const q01Overview = within(overview).getByTestId("su-full-peer-overview-row-Q01");
expect(q01Overview).toHaveTextContent("You");
expect(q01Overview).toHaveTextContent("4.0");
expect(q01Overview).toHaveTextContent("Peers");
expect(q01Overview).toHaveTextContent("6.3");

const detail = screen.getByTestId("su-full-peer-detail-Q01");
const bars = within(detail).getByTestId("su-full-peer-bars-Q01");
const feedback = within(detail).getByTestId("su-full-peer-feedback-Q01");
expect(bars.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(feedback).toHaveTextContent("Frozen feedback Q01");
```

Also assert `screen.queryByTestId("report-sections")` is null and the generic slider recommendation text appears exactly once.

- [ ] **Step 2: Run the component test and verify the missing component failure**

```bash
npx jest src/__tests__/components/assessments/su-full-peer-render.test.tsx --runInBand
```

Expected: FAIL because the peer renderer is absent.

- [ ] **Step 3: Implement the focused presentational component**

Create components with no data joining:

```tsx
export function SuFullPeerComparison({
  presentation,
}: {
  presentation: SuFullPeerPresentation;
}) {
  return (
    <section className="su-peer-sequence" data-testid="su-full-peer-sequence">
      {presentation.sections.map((section) => (
        <section className="su-peer-chapter" key={section.stableKey}>
          <SuFullPeerOverview section={section} />
          <SuFullPeerDetails section={section} />
        </section>
      ))}
      <p className="su-peer-disclosure" data-testid="su-full-peer-disclosure">
        Peers are a current benchmark reference. Values are not yet matched to company size,
        growth phase, geography, or industry. Last updated {formatBenchmarkDate(presentation.benchmarkUpdatedAt)}.
      </p>
    </section>
  );
}
```

Each overview row renders two independent tracks, explicit labels, and formatted one-decimal numbers. Each detail item renders the same values followed by the optional frozen recommendation. Track elements use `aria-hidden="true"`; visible text carries accessible meaning.

- [ ] **Step 4: Integrate the Classic-only replacement path**

In `LegacyClassicReport`:

```ts
const suFullPeers =
  report.templateAlias === SCALING_UP_FULL_TEMPLATE_ALIAS
    ? report.suFullPeerPresentation ?? null
    : null;
```

Then:

- render `<SuFullPeerComparison presentation={suFullPeers} />` where the detailed breakdown belongs;
- render the existing generic `report-sections` block only when `suFullPeers === null`;
- keep non-slider snapshot findings in a separate collection;
- when peers exist, omit the 61 slider recommendations from the generic recommendations block but still render non-slider findings;
- when peers are absent, preserve the current `recSections` output exactly.

- [ ] **Step 5: Add scoped responsive and print CSS**

Add only `.su-report .su-peer-*` selectors. Required declarations include:

```css
.su-report .su-peer-overview-row {
  display: grid;
  grid-template-columns: minmax(12rem, 1.4fr) minmax(11rem, 1fr) auto;
  align-items: center;
}

.su-report .su-peer-track {
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--su-soft, #ece9ef);
}

.su-report .su-peer-fill--you { background: #f4a21a; }
.su-report .su-peer-fill--peers { background: #59328f; }
.su-report .su-peer-detail { break-inside: avoid; page-break-inside: avoid; }

@media (max-width: 720px) {
  .su-report .su-peer-overview-row { grid-template-columns: 1fr; }
  .su-report .su-peer-detail-grid { grid-template-columns: 1fr; }
}

@media print {
  .su-report .su-peer-overview { break-before: page; }
  .su-report .su-peer-fill { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
```

Use the existing report variables when available; do not change global report colors or other style families.

- [ ] **Step 6: Add regression and accessibility tests**

Assert:

- visible You/Peers labels and values exist for every rendered item;
- overview and detail values are identical;
- no `svg`, `path`, or `.connected-contour` exists in the peer sequence;
- a null/absent model renders the current generic sections and recommendations;
- a blank recommendation omits the feedback block without placeholder copy;
- the disclosure renders exactly once with the dynamic latest-update date;
- Executive and Modern renderers do not render `su-full-peer-sequence`; and
- Rockefeller/LVA reports remain unchanged.

- [ ] **Step 7: Run focused renderer suites**

```bash
npx jest src/__tests__/components/assessments/su-full-peer-render.test.tsx src/__tests__/components/assessments/branded-report.test.tsx src/__tests__/components/assessments/report-style-renderers.test.tsx src/__tests__/components/assessments/wave-s-peer-render.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Lint the renderer changes**

```bash
npx eslint src/src/components/assessments/SuFullPeerComparison.tsx src/src/components/assessments/BrandedReport.tsx src/src/__tests__/components/assessments/su-full-peer-render.test.tsx
```

Expected: PASS with zero errors.

- [ ] **Step 9: Commit the Classic renderer**

```bash
git add src/src/components/assessments/SuFullPeerComparison.tsx src/src/components/assessments/BrandedReport.tsx src/src/styles/su-report.css src/src/__tests__/components/assessments/su-full-peer-render.test.tsx src/src/__tests__/components/assessments/branded-report.test.tsx src/src/__tests__/components/assessments/report-style-renderers.test.tsx
git commit -m "feat(assessments): render SU Full paired peer bars"
```

---

### Task 4: Authorized Individual Report Entry Points

**Files:**
- Modify: `src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx`
- Modify: `src/src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx`
- Test: `src/src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx`
- Test: `src/src/__tests__/app/assessment-respondent-report-page.test.tsx`
- Test: `src/src/__tests__/app/public-submission-report-page.test.tsx`

**Interfaces:**
- Consumes: `resolvePeerReportEnhancementsForCampaign` and `resolvePeerReportEnhancementsForSubmission` from Task 2.
- Produces: server-enriched `RespondentReport` for Classic SU Full and the unchanged LVA `peerComparison` prop.

- [ ] **Step 1: Extend the respondent page test to fail on missing SU-Full enrichment**

With test-only `enabledAliases: ["scaling-up-full"]` supplied through a mocked resolver dependency, assert `BrandedReport` receives:

```ts
expect(mockBrandedReport).toHaveBeenCalledWith(
  expect.objectContaining({
    report: expect.objectContaining({
      suFullPeerPresentation: expect.objectContaining({ sections: expect.any(Array) }),
    }),
  }),
);
```

Retain the existing LVA assertion on `peerComparison`.

- [ ] **Step 2: Replace the page-local resolver on the coach/admin route**

After `getRespondentReport` succeeds and `reportStylesAvailable` is known, call:

```ts
const peerEnhancements = await resolvePeerReportEnhancementsForCampaign({
  db,
  report,
  campaignId: id,
  reportStylesAvailable,
});
```

Pass `peerEnhancements.report` to `ReportStyleScope` and `BrandedReport`, and pass `peerEnhancements.lvaPeerComparison` to the existing `peerComparison` prop. Remove the page-local `resolvePeerComparison` function and its direct benchmark query.

- [ ] **Step 3: Run the respondent-page suites**

```bash
npx jest src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx src/__tests__/app/assessment-respondent-report-page.test.tsx --runInBand
```

Expected: PASS, including existing audit/rate-limit/authorization assertions.

- [ ] **Step 4: Write the failing public-submission report enrichment test**

Mock `resolvePeerReportEnhancementsForSubmission` to return an enriched report and assert the report passed to `BrandedReport` contains `suFullPeerPresentation`. Also assert forbidden/not-found outcomes never invoke the resolver.

- [ ] **Step 5: Enrich the public-submission route after its access gate succeeds**

Call the submission wrapper only after `outcome.status === "ok"`:

```ts
const peerEnhancements = await resolvePeerReportEnhancementsForSubmission({
  db,
  report,
  reportStylesAvailable,
});
const renderedReport = peerEnhancements.report;
```

Use `renderedReport` consistently in `ReportStyleScope`, the filename, and `BrandedReport`. The wrapper may return an LVA comparison; forward it via `peerComparison` so the public authorized surface retains parity.

- [ ] **Step 6: Run the public report suite**

```bash
npx jest src/__tests__/app/public-submission-report-page.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Lint and type-check the route changes**

```bash
npx eslint 'src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx' 'src/src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx' src/src/lib/assessments/peer-report-resolver.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit the authorized route integration**

```bash
git add 'src/src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx' 'src/src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx' src/src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx src/src/__tests__/app/assessment-respondent-report-page.test.tsx src/src/__tests__/app/public-submission-report-page.test.tsx
git commit -m "feat(assessments): enrich individual reports with peers"
```

---

### Task 5: Invited On-Screen Result Enrichment and Revival

**Files:**
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`
- Modify: `src/src/lib/assessments/onscreen-result-store.ts`
- Test: `src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts`
- Test: `src/src/__tests__/lib/assessments/onscreen-result-store.test.ts`
- Test: `src/src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx`

**Interfaces:**
- Consumes: `resolvePeerReportEnhancements` from Task 2 and the optional report payload from Task 1.
- Produces: an enriched disclosed report after commit, preserved across JSON/session storage and consumed by the existing `BrandedReport` call.

- [ ] **Step 1: Write the failing post-transaction enrichment test**

Mock the resolver and record whether it runs under the transaction flag:

```ts
const enrichmentTransactionStates: boolean[] = [];
jest.mock("@/lib/assessments/peer-report-resolver", () => ({
  resolvePeerReportEnhancements: jest.fn(async ({ report }) => {
    enrichmentTransactionStates.push(mockOnscreenTransactionActive);
    return {
      report: {
        ...report,
        suFullPeerPresentation: {
          benchmarkUpdatedAt: "2026-08-18T00:00:00.000Z",
          sections: [],
        },
      },
      lvaPeerComparison: null,
    };
  }),
}));

expect(enrichmentTransactionStates).toEqual([false]);
expect(body.data?.report).toMatchObject({
  suFullPeerPresentation: { sections: expect.any(Array) },
});
```

Set the fixture template alias to `scaling-up-full`, report style to `CLASSIC`, and on-screen disclosure to true.

- [ ] **Step 2: Run the on-screen submit test and verify failure**

```bash
npx jest src/__tests__/app/org-survey/submit-onscreen-results.test.ts --runInBand
```

Expected: FAIL because enrichment is never called.

- [ ] **Step 3: Enrich only the selected disclosed report after the transaction**

After the transaction result is committed and `reportStylesAvailable` is computed:

```ts
let onScreenReport =
  result.discloseOnScreen && respondentReport !== null
    ? respondentReport
    : undefined;

if (onScreenReport) {
  const enhancements = await resolvePeerReportEnhancements({
    db,
    report: onScreenReport,
    templateId: invitation.campaign.templateId,
    reportStylesAvailable,
  });
  onScreenReport = enhancements.report;
}
```

Do not enrich report-style candidates before selection, do not query under the transaction lock, and do not pass the peer presentation into email rendering.

- [ ] **Step 4: Add failure-isolation tests**

Assert:

- disclosure false -> resolver not called;
- report build failure -> resolver not called and submission still succeeds;
- resolver returns original report after DB failure -> submission still succeeds;
- only the locked selected report style is enriched; and
- results email builder input/output remains unchanged.

- [ ] **Step 5: Add session-storage round-trip coverage**

Extend `sampleReport` with a real optional presentation and assert:

```ts
writeOnScreenResult(ALIAS, reportWithPeers as never, KEY);
const revived = readOnScreenResult(ALIAS, KEY);
expect(revived?.suFullPeerPresentation).toEqual(reportWithPeers.suFullPeerPresentation);
expect(revived?.submittedAt).toBeInstanceOf(Date);
```

Because `reviveOnScreenReport` spreads additive fields, production code should require no schema rewrite. Add a concise comment documenting that `benchmarkUpdatedAt` remains an ISO string by contract.

- [ ] **Step 6: Prove the existing client forwards the revived model**

In `org-survey-onscreen-results.test.tsx`, rehydrate a report with `suFullPeerPresentation` and assert the mocked `BrandedReport` receives the same field. Do not add a separate client state field or client benchmark fetch.

- [ ] **Step 7: Run all on-screen suites**

```bash
npx jest src/__tests__/app/org-survey/submit-onscreen-results.test.ts src/__tests__/lib/assessments/onscreen-result-store.test.ts src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Lint and commit the invited flow**

```bash
npx eslint 'src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' src/src/lib/assessments/onscreen-result-store.ts src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts src/src/__tests__/lib/assessments/onscreen-result-store.test.ts
git add 'src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' src/src/lib/assessments/onscreen-result-store.ts src/src/__tests__/app/org-survey/submit-onscreen-results.test.ts src/src/__tests__/lib/assessments/onscreen-result-store.test.ts src/src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx
git commit -m "feat(assessments): persist on-screen peer comparisons"
```

---

### Task 6: Dark-Launch Verification and Source-of-Truth Hygiene

**Files:**
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Verify: all files changed in Tasks 1-5

**Interfaces:**
- Consumes: the complete dark implementation; `PEER_RENDER_ENABLED_ALIASES` still contains LVA only.
- Produces: a production-ready dark build with documented release evidence and no live Scaling Up Full peer rendering.

- [ ] **Step 1: Add a dark-launch guard test**

In `peer-report-resolver.test.ts`, call the resolver without the test-only `enabledAliases` override and assert a Scaling Up Full report performs no benchmark query while LVA remains enabled:

```ts
expect(PEER_RENDER_ENABLED_ALIASES).not.toContain("scaling-up-full");
expect(PEER_RENDER_ENABLED_ALIASES).toContain("leadership-vision-alignment");
```

- [ ] **Step 2: Run all focused feature and regression tests**

From `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/su-full-peer-presentation.test.ts \
  src/__tests__/lib/assessments/peer-report-resolver.test.ts \
  src/__tests__/lib/assessments/peer-benchmarks.test.ts \
  src/__tests__/components/assessments/su-full-peer-render.test.tsx \
  src/__tests__/components/assessments/branded-report.test.tsx \
  src/__tests__/components/assessments/report-style-renderers.test.tsx \
  src/__tests__/components/assessments/wave-s-peer-render.test.tsx \
  src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx \
  src/__tests__/app/assessment-respondent-report-page.test.tsx \
  src/__tests__/app/public-submission-report-page.test.tsx \
  src/__tests__/app/org-survey/submit-onscreen-results.test.ts \
  src/__tests__/lib/assessments/onscreen-result-store.test.ts \
  src/__tests__/components/assessments/org-survey-onscreen-results.test.tsx \
  src/__tests__/assessments/report-email.wave-s-guard.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run migration safety, TypeScript, and ESLint**

```bash
node scripts/check-migration-safety.mjs
npx tsc --noEmit
npx eslint \
  src/lib/assessments/su-full-peer-presentation.ts \
  src/lib/assessments/peer-report-resolver.ts \
  src/lib/assessments/respondent-report.ts \
  src/components/assessments/SuFullPeerComparison.tsx \
  src/components/assessments/BrandedReport.tsx \
  'src/app/(report)/assessments/[id]/respondents/[respondentId]/report/page.tsx' \
  'src/app/(report)/assessments/public-submissions/[submissionId]/report/page.tsx' \
  'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/lib/assessments/onscreen-result-store.ts
```

Expected: PASS; migration checker reports no unsafe migration changes.

- [ ] **Step 4: Build the production bundle**

```bash
CI=true npx next build --turbopack
```

Expected: exit code 0 and all routes compile.

- [ ] **Step 5: Perform local visual review without enabling the production alias**

Use the tested `SuFullPeerComparison` fixture through the existing report-style preview/test harness. Verify:

- desktop overview shows all section rows without a connected contour;
- mobile stacks each row without horizontal scrolling;
- every row visibly says You and Peers;
- detailed feedback follows the matching bars;
- print preview creates deliberate overview page boundaries and never clips a detail card; and
- the benchmark disclosure appears once with the row-derived update date.

Capture review screenshots outside the repository or under an already-ignored temporary directory; do not commit browser artifacts.

- [ ] **Step 6: Update project Source of Truth**

Update `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` and prepend a `plans/CHANGELOG.md` entry recording:

- both approved surfaces implemented;
- UI remains dark because the SU-Full render alias is not enabled;
- benchmark DB rows are read only by test override until activation;
- focused tests, type-check, lint, migration safety, build, and visual/print results; and
- unchanged LVA, group report, growth phase, emails, and public mini-quiz.

- [ ] **Step 7: Commit the dark-launch gate and documentation**

```bash
git add src/src/__tests__/lib/assessments/peer-report-resolver.test.ts CLAUDE.md plans/CHANGELOG.md
git commit -m "docs: record dark SU Full peer UI verification"
```

- [ ] **Step 8: Stop for review before activation**

Present the commit list, focused-test receipt, build receipt, and local desktop/mobile/print screenshots. Do not add the SU-Full alias, push a production activation, or mutate benchmark rows without explicit release approval.

---

### Task 7: Separate Scaling Up Full Activation Change

**Dependency:** Task 6 is reviewed, the dark build is deployed, Production still has exactly 61 valid governed question rows, and the user explicitly approves activation.

**Files:**
- Create: `src/scripts/verify-scaling-up-full-peer-benchmarks.ts`
- Modify: `src/src/lib/assessments/peer-benchmarks.ts`
- Modify: `src/src/__tests__/lib/assessments/peer-benchmarks.test.ts`
- Modify: `src/src/__tests__/lib/assessments/peer-report-resolver.test.ts`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: the dark implementation and existing `PEER_RENDER_ENABLED_ALIASES` gate.
- Produces: Scaling Up Full as a production-eligible peer-render alias under the existing feature flag.

- [ ] **Step 1: Add the read-only verification script**

Create a script that imports `PrismaClient`, `SCALING_UP_FULL_TEMPLATE_ALIAS`, `SU_FULL_QUESTION_BENCHMARKS`, and `listRatingQuestionKeys`. Instantiate `const db = new PrismaClient()`, run the reads inside `try`, and call `await db.$disconnect()` in `finally`:

```ts
const expectedKeys = new Set(SU_FULL_QUESTION_BENCHMARKS.map((row) => row.stableKey));
const template = await db.assessmentTemplate.findFirst({
  where: { alias: SCALING_UP_FULL_TEMPLATE_ALIAS, deletedAt: null },
  select: { id: true },
});
if (!template) throw new Error("Scaling Up Full template not found");

const version = await db.assessmentTemplateVersion.findFirst({
  where: {
    templateId: template.id,
    language: "enUS",
    publishedAt: { not: null },
    archivedAt: null,
  },
  orderBy: { versionNumber: "desc" },
  select: { versionNumber: true, questions: true },
});
if (!version) throw new Error("Active Scaling Up Full version not found");

const activeKeys = new Set(
  listRatingQuestionKeys(version.questions, SCALING_UP_FULL_TEMPLATE_ALIAS)
    .map((row) => row.stableKey),
);
const rows = await db.assessmentBenchmark.findMany({
  where: { templateId: template.id, metricKind: "QUESTION" },
  select: { metricKey: true, value: true, updatedAt: true },
  orderBy: { metricKey: "asc" },
});
```

Exit nonzero unless `activeKeys`, `expectedKeys`, and stored row keys are the same 61-key set and every value is finite inside `[0, 10]`. On success print one JSON receipt containing `templateId`, `versionNumber`, `rowCount`, `firstKey`, `lastKey`, and the greatest `updatedAt`. Never call a Prisma mutation method.

- [ ] **Step 2: Verify Production benchmark readiness without writing**

From a trusted shell whose `DATABASE_URL` is already scoped to Production, run:

```bash
npx tsx scripts/verify-scaling-up-full-peer-benchmarks.ts
```

Require:

- alias `scaling-up-full` resolves to the expected template;
- `metricKind = QUESTION` row count is exactly 61;
- keys equal Q01-Q61 with no gaps or extras;
- all values are finite and inside `[0, 10]`; and
- the greatest `updatedAt` is available for disclosure.

Record the read-only receipt. Do not run `seed:scaling-up-full-peers` because rows are already populated and administrator edits are authoritative.

- [ ] **Step 3: Write the failing activation expectation**

```ts
expect(PEER_RENDER_ENABLED_ALIASES).toEqual([
  LVA_TEMPLATE_ALIAS,
  SCALING_UP_FULL_TEMPLATE_ALIAS,
]);
```

Run:

```bash
npx jest src/__tests__/lib/assessments/peer-benchmarks.test.ts src/__tests__/lib/assessments/peer-report-resolver.test.ts --runInBand
```

Expected: FAIL because Scaling Up Full is still dark.

- [ ] **Step 4: Add the Scaling Up Full alias**

```ts
export const PEER_RENDER_ENABLED_ALIASES: readonly string[] = [
  LVA_TEMPLATE_ALIAS,
  SCALING_UP_FULL_TEMPLATE_ALIAS,
];
```

Do not change `PEER_EDITOR_ENABLED_ALIASES` because it already contains both aliases.

- [ ] **Step 5: Run activation and full focused suites**

```bash
npx jest src/__tests__/lib/assessments/peer-benchmarks.test.ts src/__tests__/lib/assessments/peer-report-resolver.test.ts src/__tests__/components/assessments/su-full-peer-render.test.tsx src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx src/__tests__/app/public-submission-report-page.test.tsx src/__tests__/app/org-survey/submit-onscreen-results.test.ts --runInBand
npx tsc --noEmit
npx eslint src/lib/assessments/peer-benchmarks.ts src/lib/assessments/peer-report-resolver.ts
CI=true npx next build --turbopack
```

Expected: every command PASS.

- [ ] **Step 6: Update Source of Truth with the activation receipt**

Update `CLAUDE.md` anchors and prepend `plans/CHANGELOG.md` with the Production row-read receipt, alias activation, test/build receipt, rollback gate, and explicit statement that no Production benchmark mutation occurred.

- [ ] **Step 7: Commit the activation separately**

```bash
git add src/scripts/verify-scaling-up-full-peer-benchmarks.ts src/src/lib/assessments/peer-benchmarks.ts src/src/__tests__/lib/assessments/peer-benchmarks.test.ts src/src/__tests__/lib/assessments/peer-report-resolver.test.ts CLAUDE.md plans/CHANGELOG.md
git commit -m "feat(assessments): enable SU Full peer report UI"
```

- [ ] **Step 8: Post-deploy smoke after the activation merge**

Verify, without changing report or benchmark data:

- `/api/health` is healthy;
- one authorized Classic Scaling Up Full individual report renders both peer surfaces;
- Print/Download PDF retains all labels and feedback without clipping;
- one invited on-screen report renders the same model when disclosure is enabled;
- an Executive or Modern report remains unchanged;
- the aggregate group report remains unchanged;
- the growth-phase survey interstitial remains unchanged; and
- disabling the existing peer flag removes both new surfaces and restores the generic Classic path.

Record exact deployment URL/time and smoke evidence in the Source of Truth. Do not claim Production success until each check is observed.
