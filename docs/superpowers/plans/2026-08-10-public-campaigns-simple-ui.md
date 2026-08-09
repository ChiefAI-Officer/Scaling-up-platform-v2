# Public Campaigns Plain-Language UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the jargon-heavy Public Campaigns screen with the approved list-first management experience and focused creation page, while keeping organization-free campaign creation and all current management capabilities intact.

**Architecture:** Add a default-off, kill-switchable presentation path beside the untouched legacy `PublicCampaignsManager`. The existing list/create/publish/report-style/submission APIs remain authoritative; only the flagged list response gains `responseCount`, while a focused server service supplies eligible creation options. New client components consume explicit view models and map storage terminology to plain language without changing the Prisma schema.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Prisma 5, Tailwind/existing `wf-*` admin styles, Radix Dialog, Jest 30, React Testing Library.

## Global Constraints

- Work only in `/Users/diushianstand/Scaling-up-platform-v2/.worktrees/public-campaigns-simple-ui` on branch `codex/public-campaigns-simple-ui`.
- Treat the approved design at `docs/superpowers/specs/2026-08-10-public-campaigns-simple-ui-design.md` as the behavior contract.
- Keep `src/src/components/admin/PublicCampaignsManager.tsx` unchanged. Temporary duplication is intentional until the rollout flag is retired; changing the legacy component would weaken the kill switch.
- `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL` wins over `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_ENABLED`; both are read at call time and default to the legacy screen.
- When the new UI is off, the existing page markup, client component, API query, and API payload must remain unchanged. Do not eagerly fetch counts or creation options on the legacy path.
- Do not add `organizationId` to the creation form or request body. Do not alter INVITED campaign organization rules.
- Do not change Prisma models, add migrations, rename API fields, or add a new response-management route.
- Reuse the existing `ReportStylePicker`, publish endpoint, report-style endpoint, submissions endpoint, and public report links.
- Use the existing Radix-backed `src/src/components/ui/dialog.tsx` for publish confirmation. Do not use the non-modal confirmation helper or create a new dialog primitive.
- Use a native `<details>`/`<summary>` disclosure for `More`; do not expand the scope into the shared dropdown-menu implementation.
- Use existing `wf-*` admin tokens and existing UI components/utilities. Add no dependency and no new global styling system.
- Never render internal values (`PUBLIC`, `DRAFT`, `ACTIVE`, `CLOSED`, `OPEN_END`, `ENDS_AFTER`) without mapping them to approved labels.
- Each task is test-first. See the new test fail for the intended reason before changing production code, then make only that task's tests pass.
- File lists and every `git` command use paths relative to the worktree root, `/Users/diushianstand/Scaling-up-platform-v2/.worktrees/public-campaigns-simple-ui`. Run `npx`/`node` test, lint, and build commands from the app root at `.../public-campaigns-simple-ui/src` unless a step explicitly says otherwise.

---

## Task 1: Add the default-off release gate

**Files:**

- Create: `src/src/lib/assessments/wave-public-campaigns-simple-ui-flags.ts`
- Create: `src/src/__tests__/lib/assessments/wave-public-campaigns-simple-ui-flags.test.ts`

- [ ] **Step 1: Write the failing flag tests**

Cover unset, empty, `0`, and `false` as off; `1`, `true`, `TRUE`, and `yes` as on; kill-switch precedence; and call-time environment reads.

```ts
import { isPublicCampaignsSimpleUiEnabled } from "@/lib/assessments/wave-public-campaigns-simple-ui-flags";

const ENABLED = "WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_ENABLED";
const KILL = "WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL";

afterEach(() => {
  delete process.env[ENABLED];
  delete process.env[KILL];
});

it.each([undefined, "", "0", "false"])("is off for %p", (value) => {
  if (value !== undefined) process.env[ENABLED] = value;
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(false);
});

it.each(["1", "true", "TRUE", "yes"])("is on for %s", (value) => {
  process.env[ENABLED] = value;
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(true);
});

it("lets the kill switch override enablement", () => {
  process.env[ENABLED] = "1";
  process.env[KILL] = "yes";
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(false);
});

it("reads the environment at call time", () => {
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(false);
  process.env[ENABLED] = "1";
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module does not exist**

Run: `npx jest src/__tests__/lib/assessments/wave-public-campaigns-simple-ui-flags.test.ts --runInBand`

Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement the resolver**

```ts
function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isPublicCampaignsSimpleUiEnabled(): boolean {
  if (isOn(process.env.WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL)) return false;
  return isOn(process.env.WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_ENABLED);
}
```

- [ ] **Step 4: Run the focused test and lint**

Run:

```bash
npx jest src/__tests__/lib/assessments/wave-public-campaigns-simple-ui-flags.test.ts --runInBand
npx eslint src/lib/assessments/wave-public-campaigns-simple-ui-flags.ts src/__tests__/lib/assessments/wave-public-campaigns-simple-ui-flags.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the release gate**

```bash
git add src/src/lib/assessments/wave-public-campaigns-simple-ui-flags.ts src/src/__tests__/lib/assessments/wave-public-campaigns-simple-ui-flags.test.ts
git commit -m "feat(assessments): gate simple public campaigns UI"
```

---

## Task 2: Establish the current visual and domain source of truth

**Files:**

- Create: `src/public/wireframes-phase2/admin/25-admin-public-campaigns-simple-ui.html`
- Create: `docs/wireframes-phase2/wave6/25-admin-public-campaigns-simple-ui.md`
- Modify: `src/public/wireframes-phase2/admin/20-admin-public-wizard-flow.html`
- Modify: `src/public/wireframes-phase2/index.html`
- Modify: `CONTEXT.md`

- [ ] **Step 1: Add the paired Markdown contract before the HTML wireframe**

The contract must record these exact states and strings:

```md
# 25 — Admin Public Campaigns: plain-language management

## List state
- Heading: Public campaigns
- Guidance: Share an assessment with anyone using a public link.
- Primary action: Create campaign
- Columns: Campaign, Assessment, Status, Availability, Responses, Actions
- Draft actions: Publish, More
- Live actions: Copy link, View responses, More
- Closed actions: View responses, More

## Create state
- Heading: Create a public campaign
- Guidance: Create a link anyone can use to take an assessment.
- Fields: Assessment, Report design (conditional), Campaign name, Starts, Ends
- Primary action: Create draft
- Secondary action: Cancel

## Forbidden visible copy
`accessMode`, `organizationId`, `createdByCoachId`, `NOT NULL FK`, `422`,
`OPEN_END`, `ENDS_AFTER`, raw campaign IDs, and standalone aliases.
```

Add acceptance notes for the created-row highlight, no-eligible-assessment empty state, publish dialog, inline responses, report-design disclosure, and narrow-laptop row reflow.

- [ ] **Step 2: Build wireframe 25 from the existing shared wireframe shell**

Use the existing `_shared.css` and admin shell. Show two clearly separated frames in one HTML artifact:

1. the list-first page with three sample rows (`Draft`, `Live`, `Closed`), natural schedules, response counts, and state-specific actions; and
2. the dedicated creation page with the six approved form elements and the no-published-assessments empty-state callout.

Use representative copy only—no technical banners, raw aliases, enums, organization selector, or API commentary. Keep the layout full-width enough for the existing report-design cards; do not recreate the three compressed concept cards from brainstorming.

- [ ] **Step 3: Mark wireframe 20 as historical without deleting it**

Immediately inside `<body>`, add a visible warning linking to wireframe 25:

```html
<div class="wf-callout wf-callout-warning" role="note">
  <strong>Superseded:</strong> This May 2026 Public Quiz wizard is retained for
  historical provenance. The current Public Campaigns design is
  <a href="25-admin-public-campaigns-simple-ui.html">wireframe 25</a>.
</div>
```

Do not rewrite the historical content below the notice.

- [ ] **Step 4: Update the wireframe index**

Change the wireframe-20 card title to include `Superseded by 25`, keep its link for provenance, and add a new current card linking to `admin/25-admin-public-campaigns-simple-ui.html`. The new card description must name the list-first management page, dedicated creation page, plain-language labels, and organization-free flow.

- [ ] **Step 5: Correct the Public Campaign glossary**

Replace the outdated `CONTEXT.md` entry with this durable domain definition:

```md
**Public Campaign**:
A **Campaign** with `accessMode = PUBLIC` — anyone with the link self-enrolls and answers via `/quiz/[alias]` (no invitation, roster membership, or Organization required). ADMIN/STAFF create and manage it from **Public campaigns** at `/admin/assessments/public-campaigns`; `organizationId` and `createdByCoachId` remain null. The admin interface calls the reusable instrument an **Assessment**, the public URL a **Public link**, and stored lifecycle states Draft, Live, and Closed.
_Avoid_: requiring or implying Organization ownership; calling this a Public Quiz; exposing storage field names, raw aliases, or enum values as administrator-facing language.
```

- [ ] **Step 6: Verify links and forbidden copy in the new artifact**

Run from the worktree root:

```bash
test -f docs/wireframes-phase2/wave6/25-admin-public-campaigns-simple-ui.md
test -f src/public/wireframes-phase2/admin/25-admin-public-campaigns-simple-ui.html
rg -n "25-admin-public-campaigns-simple-ui" src/public/wireframes-phase2/index.html src/public/wireframes-phase2/admin/20-admin-public-wizard-flow.html
! rg -n "accessMode|organizationId|createdByCoachId|NOT NULL FK|422|OPEN_END|ENDS_AFTER" src/public/wireframes-phase2/admin/25-admin-public-campaigns-simple-ui.html
```

Expected: all commands exit 0, with the final negative search printing nothing.

- [ ] **Step 7: Open wireframe 25 at desktop and narrow-laptop widths**

Open `src/public/wireframes-phase2/admin/25-admin-public-campaigns-simple-ui.html` in the browser. Verify the two states are legible at 1440 px and 1024 px, no controls overlap, and the visual hierarchy matches the approved list-first/dedicated-create decision.

- [ ] **Step 8: Commit the visual contract**

```bash
git add CONTEXT.md docs/wireframes-phase2/wave6/25-admin-public-campaigns-simple-ui.md src/public/wireframes-phase2/admin/20-admin-public-wizard-flow.html src/public/wireframes-phase2/admin/25-admin-public-campaigns-simple-ui.html src/public/wireframes-phase2/index.html
git commit -m "docs(assessments): replace public campaign wireframe"
```

---

## Task 3: Add the plain-language presentation contract

**Files:**

- Create: `src/src/lib/assessments/public-campaign-ui.ts`
- Create: `src/src/__tests__/lib/assessments/public-campaign-ui.test.ts`

- [ ] **Step 1: Write tests for all storage-to-UI mappings**

The tests must cover all three statuses, Draft immediate/future schedules, Live immediate/future/open-ended/dated schedules, Closed with and without a close date, canonical public URLs, and friendly create errors.

```ts
expect(publicCampaignStatusLabel("DRAFT")).toBe("Draft");
expect(publicCampaignStatusLabel("ACTIVE")).toBe("Live");
expect(publicCampaignStatusLabel("CLOSED")).toBe("Closed");

expect(publicCampaignUrl("https://platformtest.scalingup.com/", "quick check"))
  .toBe("https://platformtest.scalingup.com/quiz/quick%20check");

expect(publicCampaignCreateError(422, "TEMPLATE_VERSION_NOT_PUBLISHED"))
  .toBe("Publish this assessment before creating a campaign.");
expect(publicCampaignCreateError(409, "TEMPLATE_DISABLED"))
  .toBe("Publish this assessment before creating a campaign.");
expect(publicCampaignCreateError(500, "Internal server error"))
  .toBe("We couldn't create this campaign. Check the details and try again.");
```

Use a fixed `now = new Date("2026-08-10T00:00:00.000Z")` and pass a deterministic formatter stub into schedule tests so they do not depend on the machine timezone.

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `npx jest src/__tests__/lib/assessments/public-campaign-ui.test.ts --runInBand`

Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement the view model and pure mappings**

```ts
import type {
  ReportStyleKey,
  ReportStylePreviewCapabilities,
} from "@/lib/assessments/report-style-registry";

export type PublicCampaignStatus = "DRAFT" | "ACTIVE" | "CLOSED";

export interface PublicCampaignViewModel {
  id: string;
  name: string;
  alias: string;
  status: PublicCampaignStatus;
  openAt: string;
  closeAt: string | null;
  responseCount: number;
  reportStyle: ReportStyleKey;
  reportStyleSource: "TEMPLATE_DEFAULT" | "CAMPAIGN_OVERRIDE";
  reportStyleLockedAt: string | null;
  reportStylesAvailable: boolean;
  reportStylePreviewCapabilities?: ReportStylePreviewCapabilities;
  template: { id: string; name: string; alias: string } | null;
}

export function publicCampaignStatusLabel(status: PublicCampaignStatus) {
  return { DRAFT: "Draft", ACTIVE: "Live", CLOSED: "Closed" }[status];
}

export function publicCampaignUrl(origin: string, alias: string): string {
  return new URL(`/quiz/${encodeURIComponent(alias)}`, origin).toString();
}
```

Implement `publicCampaignScheduleLabel(input, now = new Date(), format = defaultFormatter)` with these exact outputs:

- Draft and already due: `Opens when published` plus ` · No end date` when no close date.
- Draft or Live and future-dated: `Opens {formatted date}` plus ` · No end date` when open-ended.
- Live and already open: `Open now · No end date` or `Open until {formatted date}`.
- Closed: `Closed {formatted close date}` when present, otherwise `Closed`.

Implement `publicCampaignCreateError(status, error)` so only `TEMPLATE_VERSION_NOT_PUBLISHED` and `TEMPLATE_DISABLED` map to the published-assessment message; all unknown conditions map to the approved generic message. Never interpolate the status or raw error.

- [ ] **Step 4: Run tests and lint**

```bash
npx jest src/__tests__/lib/assessments/public-campaign-ui.test.ts --runInBand
npx eslint src/lib/assessments/public-campaign-ui.ts src/__tests__/lib/assessments/public-campaign-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the presentation contract**

```bash
git add src/src/lib/assessments/public-campaign-ui.ts src/src/__tests__/lib/assessments/public-campaign-ui.test.ts
git commit -m "feat(assessments): map public campaign UI language"
```

---

## Task 4: Load only eligible assessments for creation

**Files:**

- Create: `src/src/lib/assessments/public-campaign-create-options.ts`
- Create: `src/src/__tests__/lib/assessments/public-campaign-create-options.test.ts`

- [ ] **Step 1: Write service tests against a structural database stub**

Assert the exact query requires:

```ts
where: {
  deletedAt: null,
  disabledAt: null,
  versions: {
    some: {
      language: DEFAULT_TEMPLATE_LANGUAGE,
      publishedAt: { not: null },
      archivedAt: null,
    },
  },
}
```

Also assert `orderBy: { name: "asc" }`, the versions relation is filtered by the same Active definition and ordered by `versionNumber: "desc"` with `take: 1`, report-style availability is evaluated per template, preview capabilities are derived only when available, and no persistence/internal ownership fields escape the mapped result.

- [ ] **Step 2: Run the test and confirm it fails because the service does not exist**

Run: `npx jest src/__tests__/lib/assessments/public-campaign-create-options.test.ts --runInBand`

Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement the focused service**

Expose this contract:

```ts
export interface PublicCampaignCreateOption {
  id: string;
  name: string;
  alias: string;
  defaultReportStyle: ReportStyleKey;
  reportStylesEnabled: boolean;
  reportStylePreviewCapabilities?: ReportStylePreviewCapabilities;
}

export async function listPublicCampaignCreateOptions(
  db: PublicCampaignCreateOptionsDb,
): Promise<PublicCampaignCreateOption[]>;
```

The query projection is limited to `id`, `name`, `alias`, `defaultReportStyle`, and the latest Active version's `questions`. Map each row as follows:

```ts
const reportStylesEnabled = isReportStylesEnabled({ templateId: row.id });
return {
  id: row.id,
  name: row.name,
  alias: row.alias,
  defaultReportStyle: row.defaultReportStyle as ReportStyleKey,
  reportStylesEnabled,
  ...(reportStylesEnabled
    ? {
        reportStylePreviewCapabilities: deriveReportStylePreviewCapabilities({
          templateAlias: row.alias,
          questions: row.versions[0]?.questions ?? [],
        }),
      }
    : {}),
};
```

Import and spread `activePublishedWhere` and use `DEFAULT_TEMPLATE_LANGUAGE`; do not duplicate the definition of Active.

- [ ] **Step 4: Run tests and lint**

```bash
npx jest src/__tests__/lib/assessments/public-campaign-create-options.test.ts --runInBand
npx eslint src/lib/assessments/public-campaign-create-options.ts src/__tests__/lib/assessments/public-campaign-create-options.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the eligibility service**

```bash
git add src/src/lib/assessments/public-campaign-create-options.ts src/src/__tests__/lib/assessments/public-campaign-create-options.test.ts
git commit -m "feat(assessments): load eligible public campaign assessments"
```

---

## Task 5: Add flag-neutral response counts to the list API

**Files:**

- Modify: `src/src/app/api/admin/public-campaigns/route.ts`
- Modify: `src/src/__tests__/api/admin-public-campaigns.test.ts`

- [ ] **Step 1: Add API tests for both release paths**

Mock `isPublicCampaignsSimpleUiEnabled` as a mutable return value. Add two exact assertions:

1. When false, `assessmentCampaign.findMany` receives the current include with only `organization` and `template`; the JSON row has no `_count` and no `responseCount`.
2. When true, the query includes `_count: { select: { submissions: true } }`; the JSON row exposes `responseCount: 24` and omits `_count`.

Keep the existing report-style feature-flag assertions intact.

- [ ] **Step 2: Run the focused API test and confirm the new expectations fail**

Run: `npx jest src/__tests__/api/admin-public-campaigns.test.ts --runInBand`

Expected: FAIL because the route neither checks the new flag nor requests/maps submission counts.

- [ ] **Step 3: Implement the conditional query and response mapping**

Import `isPublicCampaignsSimpleUiEnabled`, resolve it once inside `GET`, and conditionally spread the count include:

```ts
const simpleUiEnabled = isPublicCampaignsSimpleUiEnabled();
const campaigns = await db.assessmentCampaign.findMany({
  where: {
    accessMode: "PUBLIC",
    createdByCoachId: null,
    deletedAt: null,
  },
  include: {
    organization: { select: { id: true, name: true } },
    template: { select: { id: true, name: true, alias: true } },
    ...(simpleUiEnabled
      ? { _count: { select: { submissions: true } } }
      : {}),
  },
  orderBy: { createdAt: "desc" },
});
```

Strip the internal count and add the friendly field only on the new path. Preserve the existing copy/delete construction so the flag-off payload path remains byte-for-byte ordered as it is today:

```ts
const campaignPayload = { ...campaign } as typeof campaign & {
  _count?: { submissions: number };
  version?: unknown;
};
delete campaignPayload.version;
const responseCount = campaignPayload._count?.submissions ?? 0;
if (simpleUiEnabled) delete campaignPayload._count;
return {
  ...campaignPayload,
  ...(simpleUiEnabled ? { responseCount } : {}),
  reportStylesAvailable,
  // preserve the existing conditional capability mapping
};
```

Do not alter the POST handler or any existing API error shape.

- [ ] **Step 4: Run the API suite and lint**

```bash
npx jest src/__tests__/api/admin-public-campaigns.test.ts --runInBand
npx eslint src/app/api/admin/public-campaigns/route.ts src/__tests__/api/admin-public-campaigns.test.ts
```

Expected: PASS, including all existing organization-free create/publish tests.

- [ ] **Step 5: Commit the additive list contract**

```bash
git add src/src/app/api/admin/public-campaigns/route.ts src/src/__tests__/api/admin-public-campaigns.test.ts
git commit -m "feat(assessments): count public campaign responses"
```

---

## Task 6: Build the list-first manager and state-aware actions

**Files:**

- Create: `src/src/components/admin/public-campaigns/PublicCampaignList.tsx`
- Create: `src/src/components/admin/public-campaigns/PublicCampaignActions.tsx`
- Create: `src/src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx`
- Create: `src/src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx`

- [ ] **Step 1: Write list presentation tests**

Mock `GET /api/admin/public-campaigns` and render:

```tsx
<PublicCampaignList createdCampaignId="campaign-new" />
```

Assert loading, empty, and error states; use `We couldn't load campaigns. Try again.` for list failures rather than rendering the server payload. Assert the approved columns and labels; natural schedule output; `24 responses`; new-row highlight (`data-created="true"` is sufficient in addition to visible styling); and `role="status"` containing `Campaign created as a draft.`. Assert the DOM does not contain any of these case-sensitive fragments:

```ts
const forbidden = [
  'accessMode="PUBLIC"', "organizationId", "createdByCoachId",
  "NOT NULL FK", "422", "OPEN_END", "ENDS_AFTER",
  "DRAFT", "ACTIVE", "CLOSED",
];
```

The row may retain `alias` in its in-memory model, but must not render it as text.

- [ ] **Step 2: Write action tests by campaign state**

Assert:

- Draft: `Publish`; no `Copy link` or `View responses`.
- Live: `Copy link` and `View responses`; no `Publish`.
- Closed: `View responses`; no `Publish` or `Copy link`.
- When `reportStylesAvailable` is true, every state also has `More`, which reveals `Report design`. When there is no secondary action, omit `More` rather than opening an empty menu.
- Publish opens the Radix dialog titled `Publish August lead campaign?` with the approved explanation.
- Cancel closes the dialog; confirm POSTs to `/api/admin/public-campaigns/{id}/publish`, validates `data.id`/`data.status`, merges `status: "ACTIVE"` into the existing full view model, announces `Campaign published. Its public link is ready to share.`, and calls `onCampaignUpdated` with that merged row. The endpoint intentionally returns only `{ id, status }`.
- A failed publish announces `We couldn't publish this campaign. Try again.` and never renders the response status or server error code.
- Copy writes `https://host.example/quiz/{encodedAlias}` through `navigator.clipboard.writeText` and announces `Public link copied.`.
- Clipboard failure announces the approved message and exposes a labeled readonly input containing the complete URL for manual copy.

- [ ] **Step 3: Run the two tests and confirm the missing-component failures**

```bash
npx jest src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx --runInBand
```

Expected: FAIL with missing modules.

- [ ] **Step 4: Implement `PublicCampaignActions`**

Use this explicit prop contract:

```ts
interface PublicCampaignActionsProps {
  campaign: PublicCampaignViewModel;
  origin: string;
  onCampaignUpdated: (campaign: PublicCampaignViewModel) => void;
  onToggleResponses: () => void;
  responsesExpanded: boolean;
  onToggleReportDesign: () => void;
  reportDesignExpanded: boolean;
}
```

Render the status-specific primary buttons, a native `<details>` with `<summary>More</summary>`, and the existing `Dialog` primitives. Keep publish and copy messages in `role="status"`/`role="alert"` regions. For clipboard fallback, set the manual URL state and render:

```tsx
<label htmlFor={`public-link-${campaign.id}`}>Public link</label>
<input id={`public-link-${campaign.id}`} readOnly value={publicUrl} />
```

Do not render the URL or alias until clipboard copying fails.

- [ ] **Step 5: Implement `PublicCampaignList`**

Fetch the list once on mount. Keep list state local and replace a row through `onCampaignUpdated`; do not refetch after publish. Derive `origin` from `window.location.origin` only in the client. Render a semantic table at desktop widths and allow its row contents/actions to wrap at narrower widths without absolute positioning.

Pass disclosure callbacks down now, but render a temporary, non-visible state hook only; Task 7 supplies the actual response/report-design panels. The list component must still expose correct `aria-expanded` values through the actions.

- [ ] **Step 6: Run tests and lint**

```bash
npx jest src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx --runInBand
npx eslint src/components/admin/public-campaigns/PublicCampaignList.tsx src/components/admin/public-campaigns/PublicCampaignActions.tsx src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx
```

Expected: PASS with no technical-copy leakage.

- [ ] **Step 7: Commit the list and primary actions**

```bash
git add src/src/components/admin/public-campaigns/PublicCampaignList.tsx src/src/components/admin/public-campaigns/PublicCampaignActions.tsx src/src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx src/src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx
git commit -m "feat(assessments): add simple public campaign list"
```

---

## Task 7: Preserve response inspection and report-design management

**Files:**

- Create: `src/src/components/admin/public-campaigns/SubmissionResult.tsx`
- Create: `src/src/components/admin/public-campaigns/PublicCampaignResponses.tsx`
- Create: `src/src/components/admin/public-campaigns/PublicCampaignReportDesign.tsx`
- Modify: `src/src/components/admin/public-campaigns/PublicCampaignList.tsx`
- Create: `src/src/__tests__/components/admin/public-campaigns/public-campaign-responses.test.tsx`
- Create: `src/src/__tests__/components/admin/public-campaigns/public-campaign-report-design.test.tsx`

- [ ] **Step 1: Write response-disclosure tests**

Assert that mounting a collapsed disclosure makes no network request; expanding fetches only `/api/admin/public-campaigns/{id}/submissions`; reopening uses the cached result; loading/error/no-responses copy says `responses`, never `submissions`; errors use `We couldn't load responses. Try again.` rather than the server payload; enriched rows still show respondent, referring coach, result summary, submitted date, Four Decisions detail toggle, and `View report` with the server-supplied `reportHref`.

- [ ] **Step 2: Write report-design tests**

Assert:

- `ReportStylePicker` receives the current style and resolved preview anatomy.
- Source copy is `Uses the assessment's default design` or `Customized for this campaign`.
- An unlocked selection PATCHes `{ reportStyle }` to the existing endpoint and calls `onCampaignUpdated` with the response.
- A locked design disables editing and says `This report design cannot be changed after the first response.`.
- A `409` with authoritative `data` immediately replaces style/source/lock state without reloading the campaign list.
- Unknown failures show `We couldn't save the report design. Try again.` without exposing a status code or server enum.

- [ ] **Step 3: Run the new tests and confirm the missing-component failures**

```bash
npx jest src/__tests__/components/admin/public-campaigns/public-campaign-responses.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-report-design.test.tsx --runInBand
```

Expected: FAIL with missing modules.

- [ ] **Step 4: Extract the result renderer into the new path**

Copy the focused `SubmissionResult` logic and its `FOUR_DECISION_STYLES`/`fourDecisionDomains` use from the legacy manager into the new file. Do not export it from or edit the legacy manager; the deliberate duplication keeps flag-off behavior frozen.

- [ ] **Step 5: Implement the response disclosure**

Use this input contract:

```ts
interface PublicCampaignResponsesProps {
  campaignId: string;
  expanded: boolean;
}
```

Keep a component-local cache after the first successful load. Fetch inside an effect only when `expanded && !loaded`. Render the panel in a table row owned by `PublicCampaignList`, with the same result fields and report links as the legacy implementation. `PublicCampaignList` must keep a visited response panel mounted after its first opening and hide it on collapse so this component-local cache survives reopening.

- [ ] **Step 6: Implement report-design management**

Use:

```ts
interface PublicCampaignReportDesignProps {
  campaign: PublicCampaignViewModel;
  expanded: boolean;
  onCampaignUpdated: (campaign: PublicCampaignViewModel) => void;
}
```

Initialize a local draft from `campaign.reportStyle`, reset it when that authoritative prop changes, and PATCH only when unlocked and changed. Resolve preview anatomy with the campaign template alias and capabilities. On `409`, merge returned `reportStyle`, `reportStyleSource`, and `reportStyleLockedAt` into the campaign and call `onCampaignUpdated` immediately.

- [ ] **Step 7: Integrate both disclosures under their owning row**

`PublicCampaignList` may keep only one response disclosure and one report-design disclosure open at a time. Track a `visitedResponseIds` set; after first expansion, keep that campaign's response `<tr>` mounted and toggle `hidden` when collapsed. Report-design rows may mount only while expanded. Wire `View responses` and `Report design` to these IDs and preserve `aria-expanded`.

- [ ] **Step 8: Run the new and legacy component suites**

```bash
npx jest src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-responses.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-report-design.test.tsx src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx --runInBand
npx eslint src/components/admin/public-campaigns/SubmissionResult.tsx src/components/admin/public-campaigns/PublicCampaignResponses.tsx src/components/admin/public-campaigns/PublicCampaignReportDesign.tsx src/components/admin/public-campaigns/PublicCampaignList.tsx src/__tests__/components/admin/public-campaigns/public-campaign-responses.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-report-design.test.tsx
```

Expected: PASS, including the untouched legacy smoke suite.

- [ ] **Step 9: Commit the preserved management capabilities**

```bash
git add src/src/components/admin/public-campaigns/SubmissionResult.tsx src/src/components/admin/public-campaigns/PublicCampaignResponses.tsx src/src/components/admin/public-campaigns/PublicCampaignReportDesign.tsx src/src/components/admin/public-campaigns/PublicCampaignList.tsx src/src/__tests__/components/admin/public-campaigns/public-campaign-responses.test.tsx src/src/__tests__/components/admin/public-campaigns/public-campaign-report-design.test.tsx
git commit -m "feat(assessments): preserve public campaign management"
```

---

## Task 8: Build the focused creation form

**Files:**

- Create: `src/src/components/admin/public-campaigns/CreatePublicCampaignForm.tsx`
- Create: `src/src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx`

- [ ] **Step 1: Write form rendering and empty-state tests**

For an empty `options` array, assert the form is replaced by:

```text
No published assessments are available.
Publish an assessment before creating a public campaign.
```

and a link to `/admin/assessments/templates`.

With options, assert labels `Assessment`, `Campaign name`, `Starts`, and `Ends`; default choices `Open immediately` and `No end date`; conditional `Report design`; `Create draft`; and `Cancel` linking to the list. Assert every forbidden technical string is absent.

- [ ] **Step 2: Write validation and serialization tests**

Assert:

- Missing assessment/name or missing scheduled dates produces field messages plus `Complete the highlighted fields.` and focuses the first invalid field.
- An end date at or before the start date is rejected locally.
- Immediate/no-end submission serializes an ISO `openAt`, `closeAt: null`, and no `organizationId`, `endMode`, or `reportStyle` when inherited.
- Scheduled/customized submission serializes chosen ISO dates and explicit `reportStyle`.
- Changing the assessment resets the report-style intent to inherited and the picker to that assessment's default.
- Unsupported report styles remove the picker and never submit `reportStyle`.

- [ ] **Step 3: Write server outcome tests**

Assert a `201` response with `data.id = "campaign-new"` calls:

```ts
router.push("/admin/assessments/public-campaigns?created=campaign-new");
```

Assert `TEMPLATE_VERSION_NOT_PUBLISHED`/`TEMPLATE_DISABLED` responses show the approved published-assessment message, unknown/network failures show the approved generic message, and every failure preserves entered values.

- [ ] **Step 4: Run the form test and confirm the missing-component failure**

Run: `npx jest src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx --runInBand`

Expected: FAIL with missing module.

- [ ] **Step 5: Implement the form state machine**

Use explicit modes:

```ts
type StartsMode = "IMMEDIATE" | "SCHEDULED";
type EndsMode = "NONE" | "SCHEDULED";
type ReportStyleIntent = "INHERITED" | "EXPLICIT";

interface CreatePublicCampaignFormProps {
  options: PublicCampaignCreateOption[];
}
```

At submit time, resolve dates rather than storing internal enums:

```ts
const openAt = startsMode === "IMMEDIATE"
  ? new Date().toISOString()
  : new Date(scheduledStart).toISOString();
const closeAt = endsMode === "NONE"
  ? null
  : new Date(scheduledEnd).toISOString();

const body = {
  templateId,
  name: name.trim(),
  openAt,
  closeAt,
  ...(reportStyleIntent === "EXPLICIT" ? { reportStyle } : {}),
};
```

Use radio groups or segmented controls with real labels for the two modes, reveal `datetime-local` only when scheduled, keep field errors next to controls, and use refs to focus the first invalid field. Use `ReportStylePicker` only when the selected option has `reportStylesEnabled`; resolve its preview anatomy from that option's alias and preview capabilities exactly as the existing manager does.

- [ ] **Step 6: Implement safe outcome handling**

Parse the API body defensively, pass its string error code and status only into `publicCampaignCreateError`, and never render either directly. On success, encode the returned ID in the redirect. The page-level failure is `role="alert"`; pending submit text is `Creating…` and the button is disabled.

- [ ] **Step 7: Run tests and lint**

```bash
npx jest src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx --runInBand
npx eslint src/components/admin/public-campaigns/CreatePublicCampaignForm.tsx src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the creation form**

```bash
git add src/src/components/admin/public-campaigns/CreatePublicCampaignForm.tsx src/src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx
git commit -m "feat(assessments): add focused public campaign creation"
```

---

## Task 9: Compose the flagged list and dedicated creation routes

**Files:**

- Modify: `src/src/app/(dashboard)/admin/assessments/public-campaigns/page.tsx`
- Create: `src/src/app/(dashboard)/admin/assessments/public-campaigns/new/page.tsx`
- Modify: `src/src/__tests__/lib/auth/auth-surface-guard.test.ts`
- Create: `src/src/__tests__/app/admin-public-campaigns-page.test.tsx`
- Create: `src/src/__tests__/app/admin-new-public-campaign-page.test.tsx`

- [ ] **Step 1: Write existing-route auth and release-gate tests**

Mock session, flag, legacy manager, and new list. Assert:

- no session redirects to `/login`;
- COACH redirects to `/unauthorized`;
- ADMIN and STAFF render;
- flag off renders the exact existing heading `Public Campaigns`, technical subtitle/banner, and legacy manager, with no new list;
- kill behavior is covered by the flag unit test, so this page test needs only the resolver's false result;
- flag on renders `Public campaigns`, `Share an assessment with anyone using a public link.`, the `Create campaign` link to `/admin/assessments/public-campaigns/new`, and the new list, with no technical banner or legacy manager;
- `searchParams.created` is passed to the new list only as one string; arrays are ignored.

- [ ] **Step 2: Write dedicated-route auth, flag, and options tests**

Assert:

- unauthenticated/COACH redirects match the list route;
- flag off redirects to `/admin/assessments/public-campaigns` before querying creation options;
- flag on calls `listPublicCampaignCreateOptions(db)` once and passes the result to `CreatePublicCampaignForm`;
- the page renders `Create a public campaign` and `Create a link anyone can use to take an assessment.`.

- [ ] **Step 3: Run both page tests and confirm expected failures**

```bash
npx jest src/__tests__/app/admin-public-campaigns-page.test.tsx src/__tests__/app/admin-new-public-campaign-page.test.tsx --runInBand
```

Expected: FAIL because the existing page has no release branch and the new route does not exist.

- [ ] **Step 4: Add the list route's release branch without editing legacy markup**

Change the page signature for Next.js 16 search params:

```ts
interface PublicCampaignsPageProps {
  searchParams: Promise<{ created?: string | string[] }>;
}

export default async function AdminPublicCampaignsPage({
  searchParams,
}: PublicCampaignsPageProps) {
```

After the existing auth checks, resolve the feature flag. If false, return the current JSX copied without wording/class/component changes. If true, await `searchParams`, normalize only a string `created`, and render the new breadcrumb/header/create link/list. The client list owns created-success focus in Step 7; do not add a competing server-page autofocus behavior.

- [ ] **Step 5: Add the dedicated server page**

Follow the existing ADMIN/STAFF session gate. After auth:

```ts
if (!isPublicCampaignsSimpleUiEnabled()) {
  redirect("/admin/assessments/public-campaigns");
}
const options = await listPublicCampaignCreateOptions(db);
```

Render the approved breadcrumb, heading, guidance, and `<CreatePublicCampaignForm options={options} />`. Do not fetch through `/api/assessment-templates`; the server service is the one creation-options contract.

- [ ] **Step 6: Add the new raw-session call site to the audited auth allowlist**

Add:

```ts
// [LAYOUT] dedicated public-campaign creation is nested under the dashboard
// layout, whose unconditional deletedAt check runs before this page renders.
"app/(dashboard)/admin/assessments/public-campaigns/new/page.tsx",
```

Do not change the allowlist test logic.

- [ ] **Step 7: Implement post-create focus/highlight behavior**

In `PublicCampaignList`, when `createdCampaignId` matches a loaded row, focus the `role="status"` success message after load and mark only that row with `data-created="true"` plus a visible highlight class. Do not remove or rewrite the query parameter; it naturally disappears on later navigation and is not stored.

- [ ] **Step 8: Run route, auth, new, and legacy tests**

```bash
npx jest src/__tests__/app/admin-public-campaigns-page.test.tsx src/__tests__/app/admin-new-public-campaign-page.test.tsx src/__tests__/lib/auth/auth-surface-guard.test.ts src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx --runInBand
npx eslint 'src/app/(dashboard)/admin/assessments/public-campaigns/page.tsx' 'src/app/(dashboard)/admin/assessments/public-campaigns/new/page.tsx' src/__tests__/app/admin-public-campaigns-page.test.tsx src/__tests__/app/admin-new-public-campaign-page.test.tsx src/__tests__/lib/auth/auth-surface-guard.test.ts src/components/admin/public-campaigns/PublicCampaignList.tsx
```

Expected: PASS. The legacy smoke assertions still find `Existing PUBLIC Campaigns` and `Create New PUBLIC Campaign` because the legacy component was not modified.

- [ ] **Step 9: Commit route composition**

```bash
git add 'src/src/app/(dashboard)/admin/assessments/public-campaigns/page.tsx' 'src/src/app/(dashboard)/admin/assessments/public-campaigns/new/page.tsx' src/src/components/admin/public-campaigns/PublicCampaignList.tsx src/src/__tests__/app/admin-public-campaigns-page.test.tsx src/src/__tests__/app/admin-new-public-campaign-page.test.tsx src/src/__tests__/lib/auth/auth-surface-guard.test.ts
git commit -m "feat(assessments): route simple public campaign workflow"
```

---

## Task 10: Close source-of-truth records and run the production gate

**Files:**

- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

- [ ] **Step 1: Add the implementation receipt to the changelog**

Prepend an entry with an ISO anchor and slug such as:

```html
<!-- ENTRY_ISO:2026-08-10 ENTRY_SLUG:public-campaigns-simple-ui-built -->
```

Record the approved list/dedicated-create decision, plain-language copy, organization-free invariant, eligible-assessment service, response count, preserved response/report-design behavior, feature flags, wireframe/glossary update, no-migration statement, exact tests/build run, and rollout state `code complete; default OFF`.

- [ ] **Step 2: Update only the canonical `CLAUDE.md` recency anchor and brief prose**

Set:

```text
LAST_UPDATED_ISO:2026-08-10
LAST_UPDATED_SLUG:public-campaigns-simple-ui-built
```

The prose must say the simplified UI is built behind a default-off flag and is not production-enabled yet. Do not claim deployment or production acceptance.

- [ ] **Step 3: Run all focused Public Campaigns suites**

```bash
npx jest \
  src/__tests__/lib/assessments/wave-public-campaigns-simple-ui-flags.test.ts \
  src/__tests__/lib/assessments/public-campaign-ui.test.ts \
  src/__tests__/lib/assessments/public-campaign-create-options.test.ts \
  src/__tests__/api/admin-public-campaigns.test.ts \
  src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-list.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-actions.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-responses.test.tsx \
  src/__tests__/components/admin/public-campaigns/public-campaign-report-design.test.tsx \
  src/__tests__/components/admin/public-campaigns/create-public-campaign-form.test.tsx \
  src/__tests__/app/admin-public-campaigns-page.test.tsx \
  src/__tests__/app/admin-new-public-campaign-page.test.tsx \
  src/__tests__/lib/auth/auth-surface-guard.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run full lint for every changed TypeScript file**

Build the list from Git rather than hand-maintaining it:

```bash
git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx' | sed 's#^src/##' | xargs npx eslint
```

Expected: PASS with no warnings promoted to errors.

- [ ] **Step 5: Run repository safety gates**

```bash
npx jest --runInBand
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: full Jest PASS, migration safety PASS with no new migration, and Turbopack production build PASS.

- [ ] **Step 6: Inspect the complete diff for scope and copy leakage**

Run from the worktree root:

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/src/components/admin/PublicCampaignsManager.tsx
rg -n "organizationId is required|NOT NULL FK|API returns 422|accessMode=|OPEN_END|ENDS_AFTER" src/src/components/admin/public-campaigns 'src/src/app/(dashboard)/admin/assessments/public-campaigns'
```

Expected: `git diff --check` is clean; the legacy-manager diff prints nothing; the final jargon search prints nothing in new production surfaces.

- [ ] **Step 7: Perform local visual and keyboard acceptance with the flag on and off**

Run the app with `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_ENABLED=1` and verify at desktop and 1024 px:

1. list hierarchy and copy match wireframe 25;
2. Draft/Live/Closed actions are correct;
3. publish dialog traps focus and cancel returns focus;
4. copy success and manual fallback are announced;
5. response/report-design disclosures work by keyboard;
6. create/cancel/validation/success redirect work;
7. the created draft is highlighted and success message focused;
8. no organization selector or technical jargon appears.

Then set `WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL=1` and verify the existing all-in-one legacy page returns unchanged and `/new` redirects to the list.

- [ ] **Step 8: Commit the implementation receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(assessments): record public campaigns UI build"
```

- [ ] **Step 9: Confirm the branch is ready for review, not rollout**

Run from the worktree root:

```bash
git status --short --branch
git log --oneline --decorate origin/main..HEAD
```

Expected: clean branch with the design, plan, task commits, and verification receipt. Do not push, open a PR, enable the flag, merge, or deploy until the user explicitly authorizes that release step.
