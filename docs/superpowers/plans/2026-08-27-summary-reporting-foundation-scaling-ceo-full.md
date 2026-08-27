# Summary Reporting Foundation + Scaling CEO Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first complete Summary Reporting tracer: an authorized coach/admin can open a selected Scaling Up campaign, explicitly compose CEO Full from one CEO and zero or more Team personal reports, create one immutable private PDF, and later view or download that persisted artifact from the same campaign.

**Architecture:** Add a default-off Summary Reporting facade alongside the current Wave F/J calculated-on-view path. A typed catalog controls which family/type combinations are implemented. Creation freezes selected submissions into a canonical snapshot, renders a versioned React-PDF document, uploads it to a private Vercel Blob store, and only then persists an immutable report plus ordered source joins. Campaign-scoped list/create/candidate/artifact APIs all reuse the strict group-report authorization boundary. When the umbrella flag is off, existing campaign pages and `/assessments/[id]/report` remain byte-path-identical.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Prisma 5/PostgreSQL, Jest/Testing Library, Playwright, `@react-pdf/renderer@4.8.1`, `@vercel/blob@2.8.0`, `pdf-parse@2.4.5` (test/dev verification only), Tailwind/Radix UI.

**Spec:** [`../specs/2026-08-27-summary-group-reporting-design.md`](../specs/2026-08-27-summary-group-reporting-design.md)

## Global Constraints

- This plan implements only the first tracer release: shared lifecycle plus `SCALING_CEO_FULL`. The registry carries the seven approved identifiers but exposes only implemented entries. Condensed, Self Comparison, LVA, QSP v1/v2, and Rockefeller each require a later family plan against this finished lifecycle.
- Do not remove or alter the current `/assessments/[id]/report` route in this release.
- `SUMMARY_REPORTING_KILL=1` wins over every other flag. With `SUMMARY_REPORTING_ENABLED` unset/off and no exact campaign canary, no new query, button, component, or route body is reached.
- `SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN` must point to a dedicated **private** Blob store. Never reuse the repository's public attachment store token.
- Generated report input, source joins, and artifact metadata are immutable. MVP has no rename, edit, delete, share, tags, approval, recalculation, or generated-report import.
- A coach/admin must pass `canViewGroupReport` for the destination campaign and every source campaign at creation. View/download rechecks the destination campaign.
- Never log answers, respondent snapshots, or blob URLs. Audits carry report ID, type, campaign ID, action, input hash, and artifact checksum only.
- Every task follows red → green → focused refactor and ends with its own verification and commit.
- Before any push, run the repository migration safety gate, targeted tests, changed-file ESLint, and `CI=true npx next build --turbopack` from `src/`.

## File Structure

### Create

- `src/src/lib/assessments/summary-reports/types.ts` — persisted/API/domain discriminants and canonical snapshot types.
- `src/src/lib/assessments/summary-reports/registry.ts` — the seven-type catalog and implemented-family filter.
- `src/src/lib/assessments/summary-reports/flags.ts` — umbrella enable/canary/kill state.
- `src/src/lib/assessments/summary-reports/canonical.ts` — stable JSON serialization and SHA-256 helpers.
- `src/src/lib/assessments/summary-reports/validation.ts` — role/cardinality/duplicate/version checks.
- `src/src/lib/assessments/summary-reports/candidates.ts` — authorized current/all eligible personal reports.
- `src/src/lib/assessments/summary-reports/scaling-ceo-full-snapshot.ts` — selected-source projection into the existing approved group model.
- `src/src/lib/assessments/summary-reports/artifact-store.ts` — private Blob put/get/delete boundary.
- `src/src/lib/assessments/summary-reports/renderers/scaling-ceo-full-document.tsx` — versioned PDF document.
- `src/src/lib/assessments/summary-reports/renderers/index.tsx` — report-type renderer dispatch.
- `src/src/lib/assessments/summary-reports/create.ts` — idempotent render/upload/persist orchestration.
- `src/src/lib/assessments/summary-reports/read.ts` — authorized campaign list and artifact metadata lookup.
- `src/src/app/api/assessment-campaigns/[id]/summary-reports/route.ts` — list and create.
- `src/src/app/api/assessment-campaigns/[id]/summary-reports/candidates/route.ts` — candidate search.
- `src/src/app/api/assessment-campaigns/[id]/summary-reports/[reportId]/artifact/route.ts` — authorized inline/download streaming.
- `src/src/components/assessments/SummaryReportsPanel.tsx` — campaign-scoped list and artifact modal.
- `src/src/components/assessments/SummaryReportWizard.tsx` — Type → Composition → Review & Create tracer wizard.
- `src/src/__tests__/lib/assessments/summary-reports/*.test.ts(x)` — domain/service/renderer tests.
- `src/src/__tests__/api/assessment-summary-reports.test.ts` — route contract tests.
- `src/src/__tests__/components/assessments/summary-report-wizard.test.tsx` — wizard behavior.
- `src/e2e/summary-reporting.spec.ts` — flag, permissions, persistence, modal, new-tab, and download flow.
- `src/prisma/migrations/20260827090000_add_summary_reports/migration.sql` — additive tables, indexes, and immutability trigger.
- `src/scripts/verify-summary-report-artifacts.mjs` — PDF signature/page/text/checksum fixture verifier.

### Modify

- `src/package.json`, `src/package-lock.json` — pin React-PDF 4.8.1, upgrade Vercel Blob to 2.8.0, and pin the test-only PDF parser to 2.4.5.
- `src/prisma/schema.prisma` — enums, models, and campaign/submission inverse relations.
- `src/src/components/assessments/CampaignDetail.tsx` — flag-gated Reports/Summary Reports surface.
- `src/src/app/(portal)/portal/assessments/[id]/page.tsx` — server-resolved Summary Reporting capability.
- `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx` — same capability for privileged users.
- `src/.env.example` — Summary Reporting flags and dedicated private-store token name.
- `src/next.config.ts` — server externalization only if the Task 2 build proof demonstrates it is required.
- `src/src/styles/su-report.css` — only approved Scaling PDF-equivalent tokens that are shared with the HTML baseline.
- `CLAUDE.md`, `plans/CHANGELOG.md` — required source-of-truth and rollout record before push.

---

### Task 1: Lock the typed catalog and dark-launch state

**Files:**

- Create: `src/src/lib/assessments/summary-reports/types.ts`
- Create: `src/src/lib/assessments/summary-reports/registry.ts`
- Create: `src/src/lib/assessments/summary-reports/flags.ts`
- Test: `src/src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts`
- Modify: `src/.env.example`

**Interfaces:**

```ts
export type SummaryReportType =
  | "SCALING_CEO_FULL"
  | "SCALING_CONDENSED_CEO"
  | "SCALING_SELF_COMPARISON"
  | "LVA_CEO_FULL"
  | "QSP_V1_CEO_FULL"
  | "QSP_V2_CEO_FULL"
  | "ROCKEFELLER_FULL";

export type SummaryReportSourceRole = "CEO" | "TEAM" | "FOCUS" | "EARLIER";

export interface SummaryReportDefinition {
  type: SummaryReportType;
  templateAliases: readonly string[];
  label: string;
  description: string;
  implemented: boolean;
  roles: readonly {
    role: SummaryReportSourceRole;
    min: number;
    max: number | null;
  }[];
  hasRemarksStep: boolean;
  rendererVersion: string;
}

export function resolveSummaryReportingState(
  env: NodeJS.ProcessEnv,
  campaignId: string,
): { enabled: boolean; killed: boolean };
```

- [ ] Write failing tests proving the catalog has exactly seven unique identifiers, only `SCALING_CEO_FULL` is `implemented: true`, Scaling CEO Full accepts CEO 1/1 and Team 0/unbounded, and no tracer entry has a Remarks step.
- [ ] Write failing truth-table tests: kill overrides global and canary; global enables; exact comma-separated campaign canary enables; missing/false values disable; org/coach IDs do not match a campaign-only canary.
- [ ] Run `npx jest src/src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts --runInBand` and confirm FAIL because the modules do not exist.
- [ ] Implement the three modules. Use `isOn = value => ["1", "true", "TRUE", "yes"].includes(value ?? "")` and exact trimmed campaign IDs for `SUMMARY_REPORTING_CANARY`.
- [ ] Add these documented defaults to `src/.env.example`:

```dotenv
SUMMARY_REPORTING_ENABLED=0
SUMMARY_REPORTING_CANARY=
SUMMARY_REPORTING_KILL=0
SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN=
```

- [ ] Run the targeted Jest file and confirm PASS.
- [ ] Run `npx eslint src/src/lib/assessments/summary-reports/{types,registry,flags}.ts src/src/__tests__/lib/assessments/summary-reports/registry-and-flags.test.ts`.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): add typed catalog and dark-launch flags"`.

### Task 2: Prove the PDF/runtime and private-Blob dependencies before feature work

**Files:**

- Modify: `src/package.json`
- Modify: `src/package-lock.json`
- Create: `src/src/lib/assessments/summary-reports/renderers/runtime-proof.tsx`
- Test: `src/src/__tests__/lib/assessments/summary-reports/pdf-runtime.test.tsx`
- Modify if required by the build proof: `src/next.config.ts`

**Interfaces:**

```tsx
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";

export async function renderPdfRuntimeProof(): Promise<Buffer> {
  return renderToBuffer(
    <Document title="Summary Reporting Runtime Proof">
      <Page size="A4"><Text>summary-report-runtime-proof</Text></Page>
    </Document>,
  );
}
```

- [ ] Install exact versions: `npm install --save-exact @react-pdf/renderer@4.8.1 @vercel/blob@2.8.0`.
- [ ] Write the failing runtime test asserting `%PDF-` magic bytes and byte length greater than 500. Page/text parsing is added with the pinned verifier in Task 8; do not infer page count by scanning compressed PDF bytes.
- [ ] Run `npx jest src/src/__tests__/lib/assessments/summary-reports/pdf-runtime.test.tsx --runInBand` and confirm FAIL before `runtime-proof.tsx` exists.
- [ ] Implement `renderPdfRuntimeProof` exactly as the interface above and confirm the test passes under Node 20.
- [ ] Run `CI=true npx next build --turbopack`. If the build reports a renderer bundling error, add only `serverExternalPackages: ["@react-pdf/renderer"]` to the existing exported Next config and rerun; do not add it when the build already passes.
- [ ] Record the observed build result in the task commit body, then delete `runtime-proof.tsx`; keep the regression test as a direct inline `renderToBuffer` smoke test so future dependency upgrades retain the proof.
- [ ] Commit: `git add src/package.json src/package-lock.json src/next.config.ts src/src/__tests__/lib/assessments/summary-reports/pdf-runtime.test.tsx && git commit -m "build(summary-reports): prove server PDF runtime"`.

### Task 3: Add immutable persistence with database-enforced invariants

**Files:**

- Modify: `src/prisma/schema.prisma`
- Create: `src/prisma/migrations/20260827090000_add_summary_reports/migration.sql`
- Test: `src/src/__tests__/lib/assessments/summary-reports/schema-contract.test.ts`

**Schema:**

```prisma
enum SummaryReportType {
  SCALING_CEO_FULL
  SCALING_CONDENSED_CEO
  SCALING_SELF_COMPARISON
  LVA_CEO_FULL
  QSP_V1_CEO_FULL
  QSP_V2_CEO_FULL
  ROCKEFELLER_FULL
}

enum SummaryReportSourceRole {
  CEO
  TEAM
  FOCUS
  EARLIER
}

model SummaryReport {
  id                     String            @id @default(cuid())
  campaignId             String
  reportType             SummaryReportType
  name                   String
  templateId             String
  versionId              String
  language               String
  createdByUserId        String
  createdByEmailSnapshot String
  createdAt              DateTime          @default(now())
  rendererVersion        String
  inputSnapshot          Json
  inputHash              String
  moderationManifest     Json?
  creationRequestId      String            @unique
  artifactPath           String            @unique
  artifactSha256         String
  artifactSizeBytes      Int
  artifactCreatedAt      DateTime

  campaign AssessmentCampaign   @relation(fields: [campaignId], references: [id], onDelete: Restrict)
  sources  SummaryReportSource[]

  @@index([campaignId, createdAt])
  @@index([createdByUserId, createdAt])
  @@map("summary_reports")
}

model SummaryReportSource {
  id                 String                  @id @default(cuid())
  summaryReportId    String
  submissionId       String
  role               SummaryReportSourceRole
  position           Int
  respondentSnapshot Json

  summaryReport SummaryReport       @relation(fields: [summaryReportId], references: [id], onDelete: Cascade)
  submission    AssessmentSubmission @relation(fields: [submissionId], references: [id], onDelete: Restrict)

  @@unique([summaryReportId, submissionId])
  @@unique([summaryReportId, role, position])
  @@index([submissionId])
  @@map("summary_report_sources")
}
```

- [ ] Write a schema contract test that reads `schema.prisma` and the migration SQL, asserting both models, both duplicate-prevention constraints, no `updatedAt`, and an immutability trigger covering UPDATE and DELETE on `summary_reports` and UPDATE/DELETE on `summary_report_sources`.
- [ ] Run the schema test and confirm FAIL.
- [ ] Add the enums/models plus `summaryReports SummaryReport[]` on `AssessmentCampaign` and `summaryReportSources SummaryReportSource[]` on `AssessmentSubmission`.
- [ ] Write an additive SQL migration. Create the enums/tables/FKs/indexes, then add trigger function `reject_summary_report_mutation()` that raises SQLSTATE `55000`; attach it `BEFORE UPDATE OR DELETE` to both tables. Do not modify existing tables beyond the two FK-compatible relations represented in Prisma.
- [ ] Run `npx prisma format`, `npx prisma generate`, `node scripts/check-migration-safety.mjs`, and the targeted schema test; confirm all pass.
- [ ] Commit: `git add src/prisma/schema.prisma src/prisma/migrations/20260827090000_add_summary_reports src/src/__tests__/lib/assessments/summary-reports/schema-contract.test.ts && git commit -m "feat(summary-reports): add immutable report schema"`.

### Task 4: Define canonical snapshots and composition validation

**Files:**

- Create: `src/src/lib/assessments/summary-reports/canonical.ts`
- Create: `src/src/lib/assessments/summary-reports/validation.ts`
- Test: `src/src/__tests__/lib/assessments/summary-reports/canonical-and-validation.test.ts`

**Interfaces:**

```ts
export interface SelectedSummarySource {
  submissionId: string;
  sourceCampaignId: string;
  role: SummaryReportSourceRole;
  position: number;
}

export interface ScalingCeoFullSnapshot {
  schemaVersion: 1;
  reportType: "SCALING_CEO_FULL";
  destination: {
    campaignId: string;
    campaignName: string;
    organizationId: string;
    organizationName: string;
    templateId: string;
    templateAlias: "scaling-up-full";
    versionId: string;
    versionNumber: number;
    language: string;
  };
  createdAt: string;
  sources: Array<{
    submissionId: string;
    sourceCampaignId: string;
    role: "CEO" | "TEAM";
    position: number;
    submittedAt: string;
    respondent: { id: string; displayName: string; jobTitle: string | null };
    answers: unknown;
    result: unknown;
  }>;
  reportModel: CampaignGroupReport;
  provenance: Omit<GroupReportProvenance, "generatedAt"> & { generatedAt: string };
}

export function canonicalJson(value: unknown): string;
export function sha256Hex(value: string | Uint8Array): string;
export function validateComposition(
  definition: SummaryReportDefinition,
  sources: readonly SelectedSummarySource[],
): { ok: true } | { ok: false; errors: Array<{ code: string; message: string; submissionId?: string }> };
```

- [ ] Write failing tests for stable object-key ordering, preserved array ordering, SHA-256 stability, duplicate submission rejection, CEO missing, CEO duplicated, Team position gaps/duplicates, and CEO position `0` followed by Team positions `0..n-1` within their role.
- [ ] Run the targeted test and confirm FAIL.
- [ ] Implement recursive canonicalization for JSON primitives/arrays/plain objects. Reject `undefined`, `Date`, `BigInt`, functions, symbols, non-finite numbers, and cyclic objects with a typed `SnapshotCanonicalizationError`; do not silently stringify them.
- [ ] Implement validation from registry role contracts. Return all safe validation errors in one pass; do not include respondent names in error codes/logs.
- [ ] Run targeted tests and ESLint; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): validate and hash frozen compositions"`.

### Task 5: Load authorized candidate personal reports

**Files:**

- Create: `src/src/lib/assessments/summary-reports/candidates.ts`
- Test: `src/src/__tests__/lib/assessments/summary-reports/candidates.test.ts`

**Interfaces:**

```ts
export type CandidateScope = "current" | "all";

export interface SummaryReportCandidate {
  submissionId: string;
  campaignId: string;
  campaignName: string;
  respondentId: string;
  respondentName: string;
  jobTitle: string | null;
  organizationId: string;
  organizationName: string;
  templateId: string;
  templateAlias: string;
  versionId: string;
  versionNumber: number;
  language: string;
  submittedAt: string;
  eligible: boolean;
  disabledReason: "WRONG_FAMILY" | "WRONG_ORGANIZATION" | "INCOMPATIBLE_VERSION" | null;
}

export async function listSummaryReportCandidates(
  db: SummaryReportCandidateDb,
  actor: ApiActor,
  input: { destinationCampaignId: string; reportType: SummaryReportType; scope: CandidateScope },
): Promise<{ kind: "ok"; candidates: SummaryReportCandidate[] } | { kind: "not-found" }>;
```

- [ ] Build narrow fake DB delegates and failing tests for destination authorization, INVITED-only destination, Scaling-family filter, frozen non-public submissions only, current scope, all scope restricted to the same organization, ended campaigns allowed, inaccessible source campaigns omitted, stable order `submittedAt desc, submissionId asc`, and disabled incompatible versions retained with safe reasons.
- [ ] For the tracer's compatibility rule, require the same `templateId`, `versionId`, language, and alias `scaling-up-full`. Do not infer cross-version CEO Full compatibility in this release.
- [ ] Use `canViewGroupReport(asAccessDb(db), actor, campaignId)` for destination and each distinct source campaign. Batch the submission query first and memoize authorization per campaign; do not make one auth call per candidate.
- [ ] Select only fields needed for cards. Do not return `answers` or `result` from this API.
- [ ] Run the targeted tests and ESLint; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): list authorized source candidates"`.

### Task 6: Freeze selected Scaling CEO Full sources into the approved model

**Files:**

- Create: `src/src/lib/assessments/summary-reports/scaling-ceo-full-snapshot.ts`
- Test: `src/src/__tests__/lib/assessments/summary-reports/scaling-ceo-full-snapshot.test.ts`
- Reuse unchanged: `src/src/lib/assessments/group-report-model.ts`

**Interfaces:**

```ts
export async function buildScalingCeoFullSnapshot(
  tx: SummaryReportSnapshotDb,
  actor: ApiActor,
  input: {
    destinationCampaignId: string;
    sources: readonly SelectedSummarySource[];
    createdAt: Date;
  },
): Promise<
  | { kind: "ok"; snapshot: ScalingCeoFullSnapshot; inputHash: string }
  | { kind: "invalid"; errors: Array<{ code: string; message: string; submissionId?: string }> }
  | { kind: "not-found" }
>;
```

- [ ] Write failing tests proving: exact selected sources only; one selected CEO; Team order is explicit; Team excludes CEO in calculated means; Team 0 yields null/`—` model values; destination/source auth is rechecked; source exists and remains a completed invited personal submission; alias/version/language/org match; candidate roster `isCEO` flags are ignored in favor of explicit wizard roles; later campaign submissions do not enter the snapshot.
- [ ] Add a fixture assertion using the Jeff-approved captured campaign values: the snapshot-driven `CampaignGroupReport` equals the current `buildGroupReportModel` output for the same explicitly selected cohort.
- [ ] Construct `GroupReportInput` from selected frozen `answers`/`result`, pinned destination version JSON, and role-derived participant records, then call the existing pure `buildGroupReportModel` unchanged.
- [ ] Set provenance counts from selected sources, not invitation totals: `completedCount = sources.length`, `invitedCount = sources.length`. Preserve destination organization/assessment/version and coach branding snapshots.
- [ ] Canonicalize the complete snapshot and return its SHA-256. The snapshot `createdAt` is the injected creation clock and is included in the hash; repeated HTTP retries reuse the same stored artifact via `creationRequestId`, not by reproducing a hash across separate create actions.
- [ ] Run the targeted snapshot tests plus existing `group-report-model.scored.test.ts`, `group-report-model.appendix-b.test.ts`, and `group-report.loader.test.ts`; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): freeze selected Scaling CEO Full inputs"`.

### Task 7: Implement the private artifact boundary

**Files:**

- Create: `src/src/lib/assessments/summary-reports/artifact-store.ts`
- Test: `src/src/__tests__/lib/assessments/summary-reports/artifact-store.test.ts`

**Interfaces:**

```ts
export interface StoredSummaryArtifact {
  path: string;
  sha256: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface SummaryArtifactStore {
  putPdf(input: { campaignId: string; creationRequestId: string; bytes: Buffer; createdAt: Date }): Promise<StoredSummaryArtifact>;
  getPdf(path: string): Promise<{ stream: ReadableStream<Uint8Array>; etag: string | null } | null>;
  delete(path: string): Promise<void>;
}
```

- [ ] Write failing tests with mocked `put/get/del` proving `access: "private"`, dedicated token use, `contentType: "application/pdf"`, `addRandomSuffix: true`, a sanitized `summary-reports/<campaign>/<request>.pdf` path, checksum/size calculation, missing-token fail closed, and idempotent best-effort delete.
- [ ] Implement a production adapter importing `put`, `get`, and `del` from `@vercel/blob`. Resolve only `SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN`; never fall back to `BLOB_READ_WRITE_TOKEN`.
- [ ] On read, call `get(path, { access: "private", token })`. Return the SDK stream without buffering a second copy.
- [ ] Do not export the Blob URL; persist and expose only `pathname` as `artifactPath`.
- [ ] Run targeted tests and ESLint; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): add private artifact storage"`.

### Task 8: Render the Jeff-approved Scaling CEO Full PDF

**Files:**

- Create: `src/src/lib/assessments/summary-reports/renderers/scaling-ceo-full-document.tsx`
- Create: `src/src/lib/assessments/summary-reports/renderers/index.tsx`
- Test: `src/src/__tests__/lib/assessments/summary-reports/scaling-ceo-full-pdf.test.tsx`
- Create: `src/src/__tests__/fixtures/summary-reports/scaling-ceo-full-snapshot.json`
- Create: `src/scripts/verify-summary-report-artifacts.mjs`

**Interfaces:**

```tsx
export const SCALING_CEO_FULL_RENDERER_VERSION = "scaling-ceo-full-pdf-v1";

export async function renderSummaryReportPdf(
  reportType: SummaryReportType,
  snapshot: ScalingCeoFullSnapshot,
): Promise<{ bytes: Buffer; rendererVersion: string }>;
```

- [ ] Produce the committed JSON fixture from a de-identified copy of the accepted live candidate; retain exact numeric/report-model values but replace names, IDs, organization, and coach branding with deterministic test values.
- [ ] Write failing renderer tests for `%PDF-`, non-empty title metadata, required headings (`Scaling Up`, `Group Report`, `Alignment Profile`, `ScaleUp Score`, `Question Detail`, `Appendix B`), CEO name presence, no Team names in Appendix B, Team-0 `Not available`, and deterministic visible text for the same snapshot.
- [ ] Implement the React-PDF document in A4 portrait using these locked tokens: purple `#6d58a8`, blue `#3aa3d9`, orange `#f2a900`, dark text `#25212b`, muted `#6f6977`, 36 pt outer margin, 18 pt section gap, 9 pt body, 7 pt footers. Use local logo/font assets already in `src/public/`; do not fetch remote fonts during render.
- [ ] Preserve the accepted information sequence: cover → provenance/alignment profile → CEO vs Team-average-excluding-CEO domain/section comparisons → peer comparison when present → ScaleUp score/tier → question detail → anonymized Team Appendix B. Team 0 uses the existing null treatment and never fabricates averages.
- [ ] Give every page a fixed footer containing campaign name, renderer version, and `Page N / total` using React-PDF's render callback. Keep headings with the following block and prohibit row splitting where a row fits on a fresh page.
- [ ] Install `pdf-parse@2.4.5` as an exact dev dependency with `npm install --save-dev --save-exact pdf-parse@2.4.5`. Implement `verify-summary-report-artifacts.mjs <pdf> --expect-text <txt> --min-pages 1 --max-pages 20 --sha256 <hex>` with `new PDFParse({ data: bytes })`, `getText()`, `getInfo({ parsePageInfo: true })`, and `destroy()` in `finally`.
- [ ] Render the fixture to a temporary PDF, compare representative rendered pages to `docs/research/evidence/platform-scaling-group-report-candidate-jeff-approved-2026-08-27.png`, and record the visual review in `docs/research/evidence/summary-reporting-scaling-ceo-full-renderer-v1-review.md`. Required review points: cover hierarchy, purple/blue/orange palette, table density, CEO-vs-Team legibility, anonymized appendix, no clipping, no orphan heading.
- [ ] Run targeted renderer tests, artifact verifier, ESLint, and `CI=true npx next build --turbopack`; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): render Scaling CEO Full PDF"`.

### Task 9: Orchestrate idempotent create/upload/persist

**Files:**

- Create: `src/src/lib/assessments/summary-reports/create.ts`
- Test: `src/src/__tests__/lib/assessments/summary-reports/create.test.ts`

**Interfaces:**

```ts
export interface CreateSummaryReportCommand {
  destinationCampaignId: string;
  reportType: "SCALING_CEO_FULL";
  creationRequestId: string;
  sources: SelectedSummarySource[];
}

export type CreateSummaryReportResult =
  | { kind: "created" | "existing"; report: SummaryReportListItem }
  | { kind: "invalid"; errors: Array<{ code: string; message: string; submissionId?: string }> }
  | { kind: "not-found" }
  | { kind: "render-failed" };
```

- [ ] Write failing service tests for new creation, same request returning `existing`, request ID collision across a different campaign/actor returning `not-found`, invalid composition before render, render failure with no upload/row, upload failure with no row, authorization loss after upload causing blob cleanup, DB failure after upload causing cleanup, concurrent unique collision returning the winner and deleting the loser's object, and creation audit with no answer text.
- [ ] Validate `creationRequestId` as UUID and reject more than 200 selected sources before DB work. The tracer itself has no Team max; the 200 cap is an operational payload bound, not a UI composition rule.
- [ ] Fast-path lookup by request ID. Then build the snapshot in a Repeatable Read transaction, render, upload, and open a second transaction that rechecks destination/source authorization and source existence before inserting `SummaryReport`, ordered `SummaryReportSource` rows, and `AuditLog(action="SUMMARY_REPORT_CREATE")` atomically.
- [ ] Automatic display name is the destination campaign name, matching observed Esperto behavior. Artifact download filename is `<slugged-campaign>-scaling-ceo-full-<YYYY-MM-DD>.pdf`; it is computed at delivery and is not a rename field.
- [ ] Detect Prisma `P2002` only for `creationRequestId`; fetch and return the winning row after deleting this attempt's orphan. Re-throw other persistence errors after best-effort cleanup.
- [ ] Emit one operational error with report type/campaign/request ID/error class on render/upload/persist failure; do not include snapshot, answers, names, or artifact path.
- [ ] Run the targeted service tests and ESLint; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): create immutable reports idempotently"`.

### Task 10: Add authorized list, candidates, create, and artifact routes

**Files:**

- Create: `src/src/lib/assessments/summary-reports/read.ts`
- Create: `src/src/app/api/assessment-campaigns/[id]/summary-reports/route.ts`
- Create: `src/src/app/api/assessment-campaigns/[id]/summary-reports/candidates/route.ts`
- Create: `src/src/app/api/assessment-campaigns/[id]/summary-reports/[reportId]/artifact/route.ts`
- Test: `src/src/__tests__/api/assessment-summary-reports.test.ts`

**HTTP contract:**

```text
GET  /api/assessment-campaigns/:id/summary-reports
GET  /api/assessment-campaigns/:id/summary-reports/candidates?type=SCALING_CEO_FULL&scope=current|all
POST /api/assessment-campaigns/:id/summary-reports
     { reportType, creationRequestId, sources: [{ submissionId, sourceCampaignId, role, position }] }
GET  /api/assessment-campaigns/:id/summary-reports/:reportId/artifact?disposition=inline|attachment
```

- [ ] Write failing route tests for unauthenticated 404, flag-off 404 before DB, kill 404, unauthorized 404, malformed create 400, domain invalid 422, renderer/storage failure 503 with safe copy, created 201, retry 200, list newest-first, report constrained to path campaign, inline/attachment `Content-Disposition`, and checksum mismatch 503 with no bytes.
- [ ] Use `getApiActor()` and `resolveSummaryReportingState()` at every route. Do not accept role, actor, destination organization, or artifact path from the client.
- [ ] Candidate route parses only the implemented registry entry and `scope`; invalid/unimplemented types return 400.
- [ ] Artifact route loads report metadata with destination authorization, reads the private blob, incrementally hashes the bytes while streaming into a bounded buffer, compares stored SHA-256 and size, commits `AuditLog(action="SUMMARY_REPORT_VIEW"|"SUMMARY_REPORT_DOWNLOAD")`, then returns bytes with `Content-Type: application/pdf`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and a safe filename. Cap tracer artifacts at 25 MiB; larger content fails closed and logs only size/report ID.
- [ ] Keep inline and attachment on the same route; modal iframe and new-tab use `inline`, explicit download uses `attachment`.
- [ ] Run targeted API tests and ESLint; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): expose campaign report APIs"`.

### Task 11: Build the campaign Summary Reports list and artifact viewer

**Files:**

- Create: `src/src/components/assessments/SummaryReportsPanel.tsx`
- Test: `src/src/__tests__/components/assessments/summary-reports-panel.test.tsx`

**Props:**

```ts
export interface SummaryReportsPanelProps {
  campaignId: string;
  campaignName: string;
  assessmentName: string;
  implementedTypes: Array<{ type: SummaryReportType; label: string; description: string }>;
}
```

- [ ] Write failing Testing Library tests for loading, empty, error/retry, newest-first rows, automatic campaign name, type/date/creator metadata, Open Wizard, View modal iframe, View in new tab, Download, and modal close/focus return.
- [ ] Implement a white campaign-card section titled `Reports` with a selected `Summary Reports` subheading; do not add a global nav item or route.
- [ ] Fetch only when mounted under an enabled server capability. The component itself must still handle a 404 by showing nothing rather than leaking flag state.
- [ ] Use a plain `<a target="_blank" rel="noopener noreferrer">` for new-tab artifact view and a plain `<a download>`-style navigation to the attachment URL. Do not use Next `<Link>` because prefetch could audit a view without an explicit click.
- [ ] The modal contains an accessible title, close button, iframe title, View in new tab, and Download. The iframe source is set only after the user clicks View.
- [ ] Run the targeted component tests and ESLint; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): add campaign report library"`.

### Task 12: Build the Type → Composition → Review & Create wizard

**Files:**

- Create: `src/src/components/assessments/SummaryReportWizard.tsx`
- Test: `src/src/__tests__/components/assessments/summary-report-wizard.test.tsx`

**Client state:**

```ts
interface ScalingCeoFullDraft {
  step: "TYPE" | "COMPOSITION" | "REVIEW";
  reportType: "SCALING_CEO_FULL" | null;
  scope: "current" | "all";
  selectedIds: string[];
  ceoSubmissionId: string | null;
  teamSubmissionIds: string[];
  creationRequestId: string;
}
```

- [ ] Write failing tests for one available type card, current/all scope, candidate metadata, selection separate from role assignment, exactly one CEO, Team 0+, duplicate prevention, explicit Team reordering, disabled stale/incompatible cards with reason, Back preserving draft, Cancel creating nothing, Review exact ordered roles and automatic campaign name, double-click issuing one request ID, 422 preserving state, success closing wizard and refreshing the list.
- [ ] Generate one UUID when the wizard opens; retain it through client retries. Generate a new UUID only after success or after the wizard is closed and reopened.
- [ ] Type step renders only `implementedTypes`; do not display disabled future catalog cards.
- [ ] Composition cards show respondent, organization, assessment/version, campaign, completion date, and submission identity suffix. A selected card can be assigned as CEO or Team; assigning CEO replaces the prior CEO but never silently deletes that prior card from selection.
- [ ] Validate inline before enabling Review. Show `Choose exactly one CEO` and source-specific disabled reasons; never rely on a silent create no-op.
- [ ] Review renders destination, assessment/version, CEO, ordered Team, Team count, and automatic name. POST the exact role/position array.
- [ ] Use the existing Radix `Dialog` primitives and repository button/card tokens. On desktop use the approved wide wizard proportions; on mobile use one column and a sticky Back/Next/Create footer.
- [ ] Run targeted wizard tests and ESLint; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): add composition wizard"`.

### Task 13: Integrate both campaign hosts without changing flag-off behavior

**Files:**

- Modify: `src/src/components/assessments/CampaignDetail.tsx`
- Modify: `src/src/app/(portal)/portal/assessments/[id]/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx`
- Test: `src/src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx`
- Modify tests: `src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx`
- Modify tests: `src/src/__tests__/app/admin-campaign-detail-page.test.tsx`
- Keep regression: `src/src/__tests__/components/assessments/campaign-detail-group-link.test.tsx`

**Prop addition:**

```ts
summaryReporting?: {
  campaignId: string;
  campaignName: string;
  assessmentName: string;
  implementedTypes: Array<{ type: SummaryReportType; label: string; description: string }>;
} | null;
```

- [ ] Write failing tests proving: flag off leaves the current `View group report` link and DOM unchanged; enabled Scaling campaign replaces that primary link with the Summary Reports panel; enabled unsupported/unimplemented family shows no panel and preserves its old link behavior; coach/admin receive identical catalog content; unauthorized actors receive no capability prop.
- [ ] In each server host, resolve the umbrella state from the already-loaded campaign ID before any Summary Report query. Capability requires INVITED, published scored version, alias `scaling-up-full`, implemented registry entry, and `canViewGroupReport`.
- [ ] In `CampaignDetail`, render `SummaryReportsPanel` after the overview/status area only when the non-null capability is supplied. Suppress the old direct link only in that enabled state; keep the old link byte path for every other state.
- [ ] Do not add top-level tabs or a global Reports hub in this tracer. `Reports → Summary Reports` is represented as the campaign-local Reports section and its Summary Reports heading, matching the approved placement without restructuring the entire legacy detail page.
- [ ] Run all named component/app regression tests and ESLint; confirm PASS.
- [ ] Commit: `git add ... && git commit -m "feat(summary-reports): integrate campaign reporting surface"`.

### Task 14: End-to-end proof, visual gate, operations, and source-of-truth hygiene

**Files:**

- Create: `src/e2e/summary-reporting.spec.ts`
- Create: `docs/research/evidence/summary-reporting-scaling-ceo-full-renderer-v1-review.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

- [ ] Seed or create a local test campaign with one completed Scaling CEO submission and two Team submissions. Keep the fixture de-identified and deterministic.
- [ ] Write Playwright coverage for coach and admin: open the campaign, open wizard, select CEO/Team, reorder Team, review, double-click Create, observe one list row, open modal, open new tab, download PDF, and confirm a later submission does not change the stored checksum.
- [ ] Add negative E2E cases for direct artifact URL as unauthenticated, coach after source/destination currency revocation, flag kill, and altered Blob bytes/checksum mismatch.
- [ ] Capture desktop and mobile screenshots of empty list, Composition, Review, populated list, PDF modal, and representative PDF pages. Compare to the approved gated design and Jeff-approved live Scaling artifact; record pass/fail and exact deviations in the renderer review document. Any material hierarchy, palette, attribution, or appendix deviation reopens the visual gate before launch.
- [ ] Run focused verification:

```bash
npx jest \
  src/src/__tests__/lib/assessments/summary-reports \
  src/src/__tests__/api/assessment-summary-reports.test.ts \
  src/src/__tests__/components/assessments/summary-report-wizard.test.tsx \
  src/src/__tests__/components/assessments/summary-reports-panel.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-summary-reports.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-group-link.test.tsx \
  src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx \
  src/src/__tests__/app/admin-campaign-detail-page.test.tsx \
  --runInBand
npx playwright test src/e2e/summary-reporting.spec.ts --project=chromium
node scripts/check-migration-safety.mjs
npx eslint <all changed TypeScript/TSX files>
CI=true npx next build --turbopack
```

- [ ] Create and connect a dedicated private Vercel Blob store. Set `SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN` for Preview first; do not set it to the public attachment-store token.
- [ ] Deploy with `SUMMARY_REPORTING_ENABLED=0`, empty canary, and kill off. Verify `/api/health`, the existing direct group report, and both campaign detail hosts.
- [ ] Enable `SUMMARY_REPORTING_CANARY` for one exact approved Scaling campaign. Create/view/download one report and compare its stored checksum, text headings, and screenshots to local results.
- [ ] Update `CLAUDE.md` anchors/prose and prepend `plans/CHANGELOG.md` with schema, flags, routes, renderer version, private-store requirement, tests, visual evidence, canary result, rollback, and explicit remaining family slices.
- [ ] Final launch gate: keep global off until the user reviews the live canary screens/PDF. Rollback is `SUMMARY_REPORTING_KILL=1`; it hides new UI/routes without touching immutable rows or the existing group-report route.
- [ ] Commit: `git add ... && git commit -m "test(summary-reports): prove Scaling CEO Full tracer"`.

## Later Family Plans — Ordered, Not Implemented Here

After this tracer is canary-proven, write and approve these separate executable plans against the now-real lifecycle interfaces:

1. Scaling Condensed CEO + Self Comparison.
2. Leadership Vision Alignment CEO Full, including one-time legacy polarity normalization at import/compatibility boundary.
3. QSP v1 + QSP v2 CEO Full, separate view models and configuration-driven whole-answer Remarks manifests.
4. Rockefeller Full, Team-only five-page renderer and corrected Low/OK/Great conclusion.

The later plans may add registry entries by changing only `implemented`, family-specific validation, snapshot builders, moderation, and renderers. They must not fork the campaign list, wizard shell, artifact store, create idempotency, authorization, or delivery route.

## Plan Self-Review Checklist

- [ ] Every tracer requirement in spec sections 4–6, 7.1, 8–12 has a task and test.
- [ ] All seven identifiers are cataloged, but only Scaling CEO Full is visible/creatable.
- [ ] No task implements stub screens, a global report hub, report management, sharing, import, or destructive replacement.
- [ ] Flag-off behavior preserves the current production route/link.
- [ ] `SummaryReportType` and `SummaryReportSourceRole` spellings match across TypeScript, Prisma, API payloads, tests, and renderer dispatch.
- [ ] `creationRequestId`, `inputHash`, and artifact checksum each have distinct, tested meanings.
- [ ] Private Blob SDK minimum is satisfied by `@vercel/blob@2.8.0`; React 19 is supported by `@react-pdf/renderer@4.8.1`; Node 20 matches `src/.nvmrc`.
- [ ] Search this plan and every created implementation file for unfinished markers or cross-task shorthand; zero unresolved implementation gaps remain.
- [ ] Visual approval is required again on the actual canary PDF before global enablement.
