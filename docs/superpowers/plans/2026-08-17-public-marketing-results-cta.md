# Public Marketing Results and Versioned CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit public-versus-invited template typing, a public-only visual CTA editor, immutable versioned CTA/result content, and the approved ESPERTO-style public result without changing existing campaigns or private report surfaces.

**Architecture:** `AssessmentTemplate.deliveryType` controls authoring and campaign eligibility, while `AssessmentTemplateVersion.reportConfig.publicMarketing` owns score-band presentation and structured CTA blocks. The server validates blocks, deterministically compiles sanitized HTML, and the public quiz renderer reads only the campaign-pinned published version. A default-off wave flag and kill switch preserve the current UI and renderer byte-for-byte until launch.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma/PostgreSQL, Zod 4, sanitize-html, Vercel Blob, Jest/Testing Library, Tailwind/CSS.

**Spec:** `docs/superpowers/specs/2026-08-17-public-marketing-results-cta-design.md`

## Global Constraints

- Work in an isolated worktree created from `origin/main`; do not implement on `codex/public-leads-email-delivery` or stage unrelated dirty-tree files.
- Use branch name `codex/public-marketing-results-cta` and cherry-pick approved spec commit `748b6e2d` plus the commit containing this plan.
- Feature variables are exactly `WAVE_PUBLIC_MARKETING_CTA_ENABLED` and `WAVE_PUBLIC_MARKETING_CTA_KILL`; kill wins, unset is OFF, and OFF preserves current creation, campaign selection, and result rendering.
- Delivery types are exactly `PUBLIC_MARKETING_QUIZ` and `INVITED_ASSESSMENT`; runtime behavior never infers delivery type from alias.
- The only aliases classified public by migration are `scaling-up-quick` and `sunhub-quick-quiz`; all other existing templates become invited.
- A template delivery type can change only while the template has zero published versions; version duplication never unlocks it.
- CTA content and score-band presentation live in `AssessmentTemplateVersion.reportConfig`, are content-hashed, and become immutable when published.
- A campaign always retains its pinned version. Publishing a successor changes only campaigns created afterward, including when an older campaign is still DRAFT.
- Marketing CTA renders only on the interactive on-screen result of a PUBLIC campaign using a PUBLIC_MARKETING_QUIZ template and a valid CTA on the pinned published version.
- Results email, PDF, print, invited results, and coach/admin reports remain unchanged.
- Admins never author raw HTML. The server treats structured blocks as authoritative and compiles escaped, sanitized HTML.
- Supported action destinations are HTTPS, `mailto:`, `tel:`, and `referringCoachOrDirectory`; JavaScript/data URLs, forms, iframes, scripts, event handlers, and arbitrary styles are rejected.
- New public templates begin with no preset selection; publication requires a deliberate preset and at least one visible action with a valid destination.
- The fixed presets are `FULL_MARKETING`, `SCALING_UP_QUICK`, and `BLANK`; applying a preset copies blocks and never creates a live preset dependency.
- The SunHub successor uses score bands 0–24, 25–49, 50–74, and 75–100 plus the approved books artwork and exact three destinations in the spec.
- Production rollout uses a PR into protected `main`, required Build and Migration Safety checks, production flag enablement, reviewed successor publication, and smoke tests. No direct push to protected `main`.

---

## File Map

### Persistence and feature policy

- `src/prisma/schema.prisma` — defines `AssessmentTemplateDeliveryType` and the template field.
- `src/prisma/migrations/20260817_add_assessment_template_delivery_type/migration.sql` — adds/backfills the enum field and installs the published-type lock trigger.
- `src/src/lib/assessments/wave-public-marketing-cta-flags.ts` — default-off enabled/kill evaluation.
- `src/src/lib/assessments/template-delivery-policy.ts` — pure type compatibility and lock decisions shared by routes.

### Versioned public marketing content

- `src/src/lib/assessments/marketing-cta.ts` — Zod schemas, block/link types, reportConfig extraction/merge, fixed presets, and publication issues.
- `src/src/lib/assessments/marketing-cta-compiler.ts` — server-only deterministic safe HTML compilation and fail-closed stored-content loading.
- `src/src/lib/assessments/public-marketing-result.ts` — score-band/result presentation parsing and view-model construction.
- `src/public/brand/scaling-up-books.png` — stable approved books artwork used by the system preset.

### Admin authoring

- `src/src/components/admin/AssessmentTemplateForm.tsx` — required two-card selection on creation.
- `src/src/components/admin/template-editor/SettingsTab.tsx` — delivery-type facts/control and public-only CTA card placement.
- `src/src/components/admin/template-editor/MarketingCtaEditor.tsx` — preset chooser and visual block authoring.
- `src/src/components/admin/template-editor/MarketingCtaBlockEditor.tsx` — focused Text/Image/Button/Divider fields and ordering controls.
- `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts` — versioned reportConfig state, dirtiness, and save integration.
- `src/src/components/admin/template-editor/TabbedShell.tsx` — threads delivery type, CTA state, flag, and preview action.
- `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx` — loads delivery type and published-state facts.
- `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/preview-public-result/page.tsx` — read-only sample preview with no writes.
- `src/src/app/api/admin/assessment-cta-assets/route.ts` — validated admin image upload to Vercel Blob.

### APIs and campaign gates

- `src/src/app/api/admin/assessment-templates/route.ts` — create/list delivery type.
- `src/src/app/api/admin/assessment-templates/[id]/route.ts` — pre-publication type correction and permanent API lock.
- `src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/route.ts` — CTA draft validation, server compilation, and hashing.
- `src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/publish/route.ts` — authoritative public CTA readiness gate.
- `src/src/components/admin/template-editor/publish-readiness.ts` — matching client readiness issues.
- `src/src/app/api/assessment-templates/route.ts` — invited campaign picker filtering.
- `src/src/app/api/assessment-campaigns/route.ts` — invited-template enforcement.
- `src/src/app/api/admin/public-campaigns/route.ts` — public-template enforcement.
- `src/src/components/admin/PublicCampaignsManager.tsx` — public-only selector data.
- `src/src/lib/assessments/campaign-create-service.ts` — shared delivery/access compatibility error.

### Participant rendering and rollout

- `src/src/app/(public)/quiz/[campaignAlias]/page.tsx` — loads safe public marketing config from the pinned version.
- `src/src/components/assessments/public-quiz-client.tsx` — selects new result UI only under the complete runtime gate.
- `src/src/components/assessments/PublicMarketingResult.tsx` — score gauge, all bands, detailed answers, then structured CTA.
- `src/src/styles/public-marketing-result.css` — responsive and accessible presentation styles.
- `src/scripts/seed-public-marketing-cta-successors.ts` — idempotent, forward-only successor draft creation.
- `src/.env.example`, `CONTEXT.md`, `CLAUDE.md`, `plans/CHANGELOG.md` — flag/domain/launch source-of-truth updates.

---

### Task 1: Isolated Execution Workspace and Flag Contract

**Files:**
- Create: `src/src/lib/assessments/wave-public-marketing-cta-flags.ts`
- Create: `src/src/__tests__/lib/assessments/wave-public-marketing-cta-flags.test.ts`
- Modify: `src/.env.example`

**Interfaces:**
- Consumes: approved spec and plan commits.
- Produces: `isPublicMarketingCtaEnabled(): boolean`, read at request/render time.

- [ ] **Step 1: Create the isolated worktree from production base**

Run from the canonical repository:

```bash
git fetch origin
git worktree add ../Scaling-up-platform-v2-public-marketing -b codex/public-marketing-results-cta origin/main
cd ../Scaling-up-platform-v2-public-marketing
cta_plan_commit=$(git log codex/public-leads-email-delivery --format=%H -1 -- docs/superpowers/plans/2026-08-17-public-marketing-results-cta.md)
git cherry-pick 748b6e2d "$cta_plan_commit"
git status --short --branch
```

Expected: `cta_plan_commit` resolves to the committed plan on the source branch; branch `codex/public-marketing-results-cta` is clean and both design documents are present.

- [ ] **Step 2: Write the failing flag truth-table test**

```ts
import { isPublicMarketingCtaEnabled } from "@/lib/assessments/wave-public-marketing-cta-flags";

describe("public marketing CTA feature flag", () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original }; });
  afterAll(() => { process.env = original; });

  it.each([
    [undefined, undefined, false],
    ["0", undefined, false],
    ["1", undefined, true],
    ["true", undefined, true],
    ["yes", undefined, true],
    ["1", "1", false],
  ])("enabled=%s kill=%s => %s", (enabled, kill, expected) => {
    process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED = enabled;
    process.env.WAVE_PUBLIC_MARKETING_CTA_KILL = kill;
    expect(isPublicMarketingCtaEnabled()).toBe(expected);
  });
});
```

- [ ] **Step 3: Run the test and verify the missing module failure**

Run: `cd src && npx jest src/__tests__/lib/assessments/wave-public-marketing-cta-flags.test.ts --runInBand`

Expected: FAIL with `Cannot find module '@/lib/assessments/wave-public-marketing-cta-flags'`.

- [ ] **Step 4: Implement the two-lever flag and document both variables**

```ts
function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isPublicMarketingCtaEnabled(): boolean {
  if (isOn(process.env.WAVE_PUBLIC_MARKETING_CTA_KILL)) return false;
  return isOn(process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED);
}
```

Add both variables to `src/.env.example` with `0` defaults and comments that KILL overrides ENABLED.

- [ ] **Step 5: Run the focused test**

Run: `cd src && npx jest src/__tests__/lib/assessments/wave-public-marketing-cta-flags.test.ts --runInBand`

Expected: PASS for all six truth-table rows.

- [ ] **Step 6: Commit the flag contract**

```bash
git add src/.env.example src/src/lib/assessments/wave-public-marketing-cta-flags.ts src/src/__tests__/lib/assessments/wave-public-marketing-cta-flags.test.ts
git commit -m "feat: add public marketing CTA feature gate"
```

### Task 2: Template Delivery Type Schema, Backfill, and Lock Policy

**Files:**
- Modify: `src/prisma/schema.prisma`
- Create: `src/prisma/migrations/20260817_add_assessment_template_delivery_type/migration.sql`
- Create: `src/src/lib/assessments/template-delivery-policy.ts`
- Create: `src/src/__tests__/lib/assessments/template-delivery-policy.test.ts`
- Create: `src/src/__tests__/prisma/public-marketing-delivery-type-migration.test.ts`

**Interfaces:**
- Consumes: `AssessmentCampaignAccessMode` and Prisma template/version records.
- Produces: `AssessmentTemplateDeliveryType`, `isTemplateCompatibleWithAccessMode(deliveryType, accessMode): boolean`, and `canChangeTemplateDeliveryType(hasPublishedVersion): boolean`.

- [ ] **Step 1: Write policy tests for both allowed pairings and the publication lock**

```ts
import {
  canChangeTemplateDeliveryType,
  isTemplateCompatibleWithAccessMode,
} from "@/lib/assessments/template-delivery-policy";

it.each([
  ["PUBLIC_MARKETING_QUIZ", "PUBLIC", true],
  ["PUBLIC_MARKETING_QUIZ", "INVITED", false],
  ["INVITED_ASSESSMENT", "PUBLIC", false],
  ["INVITED_ASSESSMENT", "INVITED", true],
] as const)("maps %s to %s", (type, accessMode, expected) => {
  expect(isTemplateCompatibleWithAccessMode(type, accessMode)).toBe(expected);
});

it("locks delivery type after the first published version", () => {
  expect(canChangeTemplateDeliveryType(false)).toBe(true);
  expect(canChangeTemplateDeliveryType(true)).toBe(false);
});
```

The migration test must read the SQL and assert it contains both exact public aliases, an all-other invited update, a non-null constraint, and a trigger checking `publishedAt IS NOT NULL`.

- [ ] **Step 2: Run focused tests and verify missing schema/policy failures**

Run:

```bash
cd src
npx jest src/__tests__/lib/assessments/template-delivery-policy.test.ts src/__tests__/prisma/public-marketing-delivery-type-migration.test.ts --runInBand
```

Expected: FAIL because the policy module and migration do not exist.

- [ ] **Step 3: Add the Prisma enum and field**

Add to `schema.prisma`:

```prisma
enum AssessmentTemplateDeliveryType {
  PUBLIC_MARKETING_QUIZ
  INVITED_ASSESSMENT
}

model AssessmentTemplate {
  // existing fields remain unchanged
  deliveryType AssessmentTemplateDeliveryType @default(INVITED_ASSESSMENT)
}
```

The database default preserves legacy create callers while the flag is OFF; flag-ON API validation added in Task 3 still requires an explicit UI/API choice.

- [ ] **Step 4: Write the additive migration and database backstop**

Use SQL with this order:

```sql
CREATE TYPE "AssessmentTemplateDeliveryType" AS ENUM ('PUBLIC_MARKETING_QUIZ', 'INVITED_ASSESSMENT');
ALTER TABLE "assessment_templates" ADD COLUMN "deliveryType" "AssessmentTemplateDeliveryType";
UPDATE "assessment_templates"
SET "deliveryType" = CASE
  WHEN alias IN ('scaling-up-quick', 'sunhub-quick-quiz') THEN 'PUBLIC_MARKETING_QUIZ'::"AssessmentTemplateDeliveryType"
  ELSE 'INVITED_ASSESSMENT'::"AssessmentTemplateDeliveryType"
END;
ALTER TABLE "assessment_templates" ALTER COLUMN "deliveryType" SET DEFAULT 'INVITED_ASSESSMENT';
ALTER TABLE "assessment_templates" ALTER COLUMN "deliveryType" SET NOT NULL;
```

Add a `BEFORE UPDATE OF "deliveryType"` trigger function that raises SQLSTATE `23514` when `OLD."deliveryType" IS DISTINCT FROM NEW."deliveryType"` and an `assessment_template_versions` row exists for the same template with `"publishedAt" IS NOT NULL`.

- [ ] **Step 5: Implement pure policy helpers**

```ts
import type { AssessmentCampaignAccessMode, AssessmentTemplateDeliveryType } from "@prisma/client";

export function isTemplateCompatibleWithAccessMode(
  deliveryType: AssessmentTemplateDeliveryType,
  accessMode: AssessmentCampaignAccessMode
): boolean {
  return (
    (deliveryType === "PUBLIC_MARKETING_QUIZ" && accessMode === "PUBLIC") ||
    (deliveryType === "INVITED_ASSESSMENT" && accessMode === "INVITED")
  );
}

export function canChangeTemplateDeliveryType(hasPublishedVersion: boolean): boolean {
  return !hasPublishedVersion;
}
```

- [ ] **Step 6: Generate Prisma and run tests plus migration safety**

Run:

```bash
cd src
npx prisma generate
npx jest src/__tests__/lib/assessments/template-delivery-policy.test.ts src/__tests__/prisma/public-marketing-delivery-type-migration.test.ts --runInBand
node scripts/check-migration-safety.mjs
```

Expected: Prisma generation succeeds, tests PASS, and migration safety reports no destructive migration.

- [ ] **Step 7: Commit schema and policy**

```bash
git add src/prisma/schema.prisma src/prisma/migrations/20260817_add_assessment_template_delivery_type src/src/lib/assessments/template-delivery-policy.ts src/src/__tests__/lib/assessments/template-delivery-policy.test.ts src/src/__tests__/prisma/public-marketing-delivery-type-migration.test.ts
git commit -m "feat: classify assessment template delivery type"
```

### Task 3: Required Creation Choice and Permanent Type Lock

**Files:**
- Modify: `src/src/components/admin/AssessmentTemplateForm.tsx`
- Modify: `src/src/app/api/admin/assessment-templates/route.ts`
- Modify: `src/src/app/api/admin/assessment-templates/[id]/route.ts`
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx`
- Modify: `src/src/components/admin/template-editor/TabbedShell.tsx`
- Modify: `src/src/components/admin/template-editor/SettingsTab.tsx`
- Modify: `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts`
- Create: `src/src/__tests__/components/admin/assessment-template-delivery-type.test.tsx`

**Interfaces:**
- Consumes: Prisma `AssessmentTemplateDeliveryType`, `canChangeTemplateDeliveryType`, and `isPublicMarketingCtaEnabled`.
- Produces: explicit POST field `deliveryType`, PATCH lock response `{ error, code: "DELIVERY_TYPE_LOCKED" }`, and editor props `deliveryType` plus `hasPublishedVersion`.

- [ ] **Step 1: Add failing API tests**

Add cases proving, with the flag ON:

```ts
process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED = "1";
const missingType = await listPOST(jsonReq(
  "http://localhost/api/admin/assessment-templates",
  { ...validBody, name: "Public quiz", alias: "public-quiz" }
) as never);
expect(missingType.status).toBe(400);

const explicitPublic = await listPOST(jsonReq(
  "http://localhost/api/admin/assessment-templates",
  { ...validBody, name: "Public quiz", alias: "public-quiz", deliveryType: "PUBLIC_MARKETING_QUIZ" }
) as never);
expect(explicitPublic.status).toBe(201);

(db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({
  id: "tpl-1",
  deliveryType: "PUBLIC_MARKETING_QUIZ",
});
(db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({ id: "ver-1" });
const locked = await detailPATCH(
  jsonReq("http://localhost/api/admin/assessment-templates/tpl-1", { deliveryType: "INVITED_ASSESSMENT" }, "PATCH") as never,
  { params: Promise.resolve({ id: "tpl-1" }) }
);
expect(locked.status).toBe(409);
expect(await locked.json()).toMatchObject({ code: "DELIVERY_TYPE_LOCKED" });
```

Also prove flag OFF accepts the legacy create payload and stores the database default.

- [ ] **Step 2: Add failing form tests**

Render `AssessmentTemplateForm` with the flag-on prop and assert:

```ts
expect(screen.getByRole("radio", { name: /public marketing quiz/i })).not.toBeChecked();
expect(screen.getByRole("radio", { name: /invited assessment/i })).not.toBeChecked();
expect(screen.getByRole("button", { name: /create template/i })).toBeDisabled();
```

Click Public, fill required identity fields, submit, and assert the request body contains `PUBLIC_MARKETING_QUIZ`. Render Settings for invited and public templates and assert the delivery type is editable only before first publication.

- [ ] **Step 3: Run focused tests and verify failures**

Run:

```bash
cd src
npx jest src/__tests__/api/admin/assessment-templates/templates-crud.test.ts src/__tests__/components/admin/assessment-template-delivery-type.test.tsx --runInBand
```

Expected: FAIL because delivery type is absent from schemas, props, and form controls.

- [ ] **Step 4: Implement flag-gated create/list API behavior**

Extend the create Zod schema with:

```ts
deliveryType: z.enum(["PUBLIC_MARKETING_QUIZ", "INVITED_ASSESSMENT"]).optional(),
```

When enabled and missing, return HTTP 400 with code `DELIVERY_TYPE_REQUIRED`. When disabled, write `INVITED_ASSESSMENT` for legacy payloads. Include `deliveryType` in template list/GET response objects.

- [ ] **Step 5: Implement the API lock before updating a type**

When a PATCH requests a different type, query:

```ts
const publishedVersion = await prisma.assessmentTemplateVersion.findFirst({
  where: { templateId: id, publishedAt: { not: null } },
  select: { id: true },
});
```

Return 409 `DELIVERY_TYPE_LOCKED` if found. Catch Prisma constraint failures from the migration trigger and translate them to the same response so bulk/direct route races receive a friendly error.

- [ ] **Step 6: Implement the approved two-card creation UI**

Add local state `AssessmentTemplateDeliveryType | null`, render the two required radio cards before template details only when enabled, leave both unselected, and disable Create until one is selected. The Public description must mention public link, immediate results, and Marketing CTA; the Invited description must mention private invitation links and no Marketing CTA.

- [ ] **Step 7: Thread type and publication facts into Settings**

The editor page selects `template.deliveryType` and `versions.some(publishedAt !== null)`. Replace the hard-coded invited audience fact with:

```ts
interface DeliveryTypeCardProps {
  deliveryType: AssessmentTemplateDeliveryType;
  hasPublishedVersion: boolean;
  onSave(next: AssessmentTemplateDeliveryType): Promise<void>;
}
```

Before publication show the same two choices plus Save; after publication show a read-only label and “Locked after this template’s first published version.” With the feature OFF, retain the current audience card markup.

- [ ] **Step 8: Run focused and regression tests**

Run:

```bash
cd src
npx jest src/__tests__/api/admin/assessment-templates/templates-crud.test.ts src/__tests__/api/admin/assessment-templates/templates-route.test.ts src/__tests__/components/admin/assessment-template-delivery-type.test.tsx src/__tests__/components/admin/TemplateEditorTabbed.test.tsx --runInBand
```

Expected: all tests PASS, including the OFF-state snapshot/DOM assertions.

- [ ] **Step 9: Commit creation and lock behavior**

```bash
git add src/src/components/admin/AssessmentTemplateForm.tsx src/src/app/api/admin/assessment-templates/route.ts src/src/app/api/admin/assessment-templates/[id]/route.ts 'src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx' src/src/components/admin/template-editor/TabbedShell.tsx src/src/components/admin/template-editor/SettingsTab.tsx src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts src/src/__tests__/components/admin/assessment-template-delivery-type.test.tsx
git commit -m "feat: require and lock assessment delivery type"
```

### Task 4: Structured CTA Model, Fixed Presets, Compiler, and Approved Artwork

**Files:**
- Create: `src/src/lib/assessments/marketing-cta.ts`
- Create: `src/src/lib/assessments/marketing-cta-compiler.ts`
- Create: `src/src/__tests__/lib/assessments/marketing-cta.test.ts`
- Create: `src/src/__tests__/lib/assessments/marketing-cta-compiler.test.ts`
- Create: `src/public/brand/scaling-up-books.png`

**Interfaces:**
- Produces:

```ts
export type MarketingCtaPresetOrigin = "FULL_MARKETING" | "SCALING_UP_QUICK" | "BLANK";
export type LinkTarget =
  | { kind: "url"; href: string }
  | { kind: "mailto"; address: string }
  | { kind: "tel"; number: string }
  | { kind: "referringCoachOrDirectory" };
export type MarketingCtaBlock =
  | { id: string; type: "text"; lead: string; body: string; align: "left" | "center" }
  | { id: string; type: "image"; src: string; alt: string; link?: LinkTarget; width: "small" | "medium" | "large" }
  | { id: string; type: "button"; label: string; target: LinkTarget; newTab: boolean; style: "primary" | "secondary" }
  | { id: string; type: "divider" };
export interface MarketingCtaConfigV1 {
  schemaVersion: 1;
  presetOrigin: MarketingCtaPresetOrigin;
  blocks: MarketingCtaBlock[];
  sanitizedHtml: string;
}
export interface MarketingCtaIssue {
  code: "CTA_PRESET_REQUIRED" | "CTA_ACTION_REQUIRED" | "CTA_INVALID_DESTINATION" | "CTA_IMAGE_ALT_REQUIRED" | "CTA_UNSAFE_CONTENT";
  path: (string | number)[];
  message: string;
}
export function createMarketingCtaPreset(origin: MarketingCtaPresetOrigin): MarketingCtaConfigV1;
export function extractMarketingCta(reportConfig: unknown): MarketingCtaConfigV1 | null;
export function mergeMarketingCta(reportConfig: unknown, cta: MarketingCtaConfigV1 | null): unknown;
export function getMarketingCtaPublishIssues(cta: MarketingCtaConfigV1 | null): MarketingCtaIssue[];
export function compileMarketingCtaHtml(cta: MarketingCtaConfigV1): string;
export function prepareMarketingCtaForStorage(reportConfig: unknown): { ok: true; reportConfig: unknown } | { ok: false; issues: MarketingCtaIssue[] };
export function loadSafeMarketingCta(reportConfig: unknown): MarketingCtaConfigV1 | null;
```

- [ ] **Step 1: Write preset and reportConfig preservation tests**

Assert exact block order and destinations for Full Marketing and Scaling Up Quick, blank blocks for BLANK, and that `mergeMarketingCta({ findings: { enabled: true } }, cta)` preserves `findings` untouched. Assert a missing CTA extracts as `null`.

- [ ] **Step 2: Write compiler security and publication tests**

Cover:

```ts
expect(getMarketingCtaPublishIssues(null)).toContainEqual(expect.objectContaining({ code: "CTA_PRESET_REQUIRED" }));
expect(getMarketingCtaPublishIssues(createMarketingCtaPreset("BLANK"))).toContainEqual(expect.objectContaining({ code: "CTA_ACTION_REQUIRED" }));

const unsafeButton: MarketingCtaConfigV1 = {
  schemaVersion: 1,
  presetOrigin: "BLANK",
  sanitizedHtml: "",
  blocks: [{
    id: "unsafe",
    type: "button",
    label: "Unsafe",
    target: { kind: "url", href: "javascript:alert(1)" },
    newTab: false,
    style: "primary",
  }],
};
expect(() => compileMarketingCtaHtml(unsafeButton)).toThrow();

const escapedText: MarketingCtaConfigV1 = {
  schemaVersion: 1,
  presetOrigin: "BLANK",
  sanitizedHtml: "",
  blocks: [{
    id: "escaped",
    type: "text",
    lead: "",
    body: '<script>alert(1)</script><img onerror="alert(1)">',
    align: "left",
  }],
};
expect(compileMarketingCtaHtml(escapedText)).not.toContain("<script");
expect(compileMarketingCtaHtml(escapedText)).not.toContain("onerror=");
expect(loadSafeMarketingCta({ publicMarketing: { marketingCta: { bad: true } } })).toBeNull();
```

Also assert HTTPS, mailto, tel, and dynamic coach destinations compile; HTTP, data, iframe, form, and mismatched client `sanitizedHtml` cannot become trusted output.

- [ ] **Step 3: Run tests and verify missing module failures**

Run:

```bash
cd src
npx jest src/__tests__/lib/assessments/marketing-cta.test.ts src/__tests__/lib/assessments/marketing-cta-compiler.test.ts --runInBand
```

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement Zod discriminated unions and pure helpers**

Define `marketingCtaBlockSchema`, `marketingCtaConfigSchema`, and `publicMarketingReportConfigSchema`. Store content at `reportConfig.publicMarketing.marketingCta`. `mergeMarketingCta` must shallow-clone the report config and `publicMarketing` object so unrelated versioned settings survive.

Use stable preset block IDs such as `full-next-step`, `full-books-image`, `full-assessment-button`, `full-followup-copy`, `full-followup-button`, and `full-books-button`. The Full preset uses:

```ts
const FULL_DESTINATIONS = {
  assessment: "https://scalinguptoolkit.com/s/ScaleUpQA",
  followup: "https://coaches.scalingup.com/coach-match-after-assessment-form",
  books: "https://scalingup.com/book/",
};
```

The Quick preset uses `https://scalingup.com` and `{ kind: "referringCoachOrDirectory" }`.

- [ ] **Step 5: Implement deterministic server compilation**

Escape every text value, render only allow-listed tags/attributes, run the result through `sanitize-html`, and compare the sanitized result to the deterministic compiler output. `prepareMarketingCtaForStorage` discards submitted `sanitizedHtml` and writes the authoritative compiled string. Drafts may omit a preset/action but may not contain an unsafe or structurally invalid block. Publication uses the stricter `getMarketingCtaPublishIssues` result.

- [ ] **Step 6: Create and verify the approved artwork asset**

Crop the book-art region from `/Users/diushianstand/Downloads/image (2).png` into `src/public/brand/scaling-up-books.png` without inventing or redrawing covers. Render/view the resulting PNG and compare it to the source: both book covers, titles, colors, and transparent/white edge treatment must be intact with no spreadsheet chrome or CTA buttons.

- [ ] **Step 7: Run focused tests and inspect the asset**

Run:

```bash
cd src
npx jest src/__tests__/lib/assessments/marketing-cta.test.ts src/__tests__/lib/assessments/marketing-cta-compiler.test.ts --runInBand
file public/brand/scaling-up-books.png
```

Expected: tests PASS; `file` reports a valid PNG. Open the image through the local image viewer and save a visual receipt under `output/public-marketing-cta/books-asset.png` without staging the receipt.

- [ ] **Step 8: Commit the domain and compiler**

```bash
git add src/src/lib/assessments/marketing-cta.ts src/src/lib/assessments/marketing-cta-compiler.ts src/src/__tests__/lib/assessments/marketing-cta.test.ts src/src/__tests__/lib/assessments/marketing-cta-compiler.test.ts src/public/brand/scaling-up-books.png
git commit -m "feat: add safe versioned marketing CTA content"
```

### Task 5: Version Save, Content Hash, Duplication, and Publish Readiness

**Files:**
- Modify: `src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/route.ts`
- Modify: `src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/publish/route.ts`
- Modify: `src/src/components/admin/template-editor/publish-readiness.ts`
- Modify: `src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts`
- Modify: `src/src/components/admin/template-editor/TabbedShell.tsx`
- Modify: `src/src/__tests__/api/admin/assessment-templates/template-version-patch.wave-t.test.ts`
- Modify: `src/src/__tests__/api/admin/assessment-templates/versions-edit-duplicate.test.ts`
- Create: `src/src/__tests__/api/admin/assessment-templates/marketing-cta-version.test.ts`
- Modify: `src/src/__tests__/admin/template-editor/publish-readiness.test.ts`

**Interfaces:**
- Consumes: `prepareMarketingCtaForStorage`, `getMarketingCtaPublishIssues`, `extractMarketingCta`, `mergeMarketingCta`.
- Produces: version-save state `reportConfig`, dirty flag `reportConfig`, and identical client/server CTA readiness codes.

- [ ] **Step 1: Write failing PATCH and publish tests**

Prove that a public draft can save an incomplete but structurally safe CTA, the server overwrites forged `sanitizedHtml`, unsafe schemes return 422, and publishing returns 422 for `CTA_PRESET_REQUIRED`, `CTA_ACTION_REQUIRED`, invalid destinations, and missing image alt text. Prove invited versions do not acquire a CTA gate.

- [ ] **Step 2: Write failing inheritance and hash tests**

Duplicate a published version containing Full Marketing blocks and assert the draft has the same independent `reportConfig` JSON and a content hash covering it. Change the duplicate button URL and assert the published source remains unchanged and the new hash differs.

- [ ] **Step 3: Run focused tests and verify failures**

Run:

```bash
cd src
npx jest src/__tests__/api/admin/assessment-templates/marketing-cta-version.test.ts src/__tests__/api/admin/assessment-templates/versions-edit-duplicate.test.ts src/__tests__/admin/template-editor/publish-readiness.test.ts --runInBand
```

Expected: FAIL because no CTA compiler/readiness integration exists.

- [ ] **Step 4: Add server-authoritative draft preparation**

The version PATCH route loads `template.deliveryType`. When the wave is enabled and the template is public, pass the incoming report config through `prepareMarketingCtaForStorage`; return `{ code: "INVALID_MARKETING_CTA", issues }` with 422 on unsafe structure. Recompute the existing content hash using the prepared report config. Invited and flag-OFF paths retain their current payload behavior.

- [ ] **Step 5: Add the authoritative publish gate**

Extend the publish query with `reportConfig` and `template.deliveryType`. Append `getMarketingCtaPublishIssues(extractMarketingCta(reportConfig))` only for enabled public templates. Return the existing readiness response shape and HTTP 422.

- [ ] **Step 6: Add reportConfig state to the editor draft hook**

Extend `DirtyFlags` with `reportConfig`. Add:

```ts
const [reportConfig, setReportConfig] = useState<unknown>(version.reportConfig);
const handleMarketingCtaChange = useCallback((cta: MarketingCtaConfigV1 | null) => {
  setReportConfig((current) => mergeMarketingCta(current, cta));
  setDirtyFlags((current) => ({ ...current, reportConfig: true }));
}, []);
```

Include `reportConfig` in the version PATCH whenever that flag is dirty and clear the flag only after the request succeeds. Keep invitation metadata in its existing split-save path.

- [ ] **Step 7: Keep client readiness synchronized**

Extend the readiness input with `deliveryType` and `reportConfig`. Reuse `getMarketingCtaPublishIssues` rather than reimplementing validation. Pass the resulting issues to the existing Safe-to-Publish badge.

- [ ] **Step 8: Run version/readiness regression suite**

Run:

```bash
cd src
npx jest src/__tests__/api/admin/assessment-templates/marketing-cta-version.test.ts src/__tests__/api/admin/assessment-templates/template-version-patch.wave-t.test.ts src/__tests__/api/admin/assessment-templates/versions-edit-duplicate.test.ts src/__tests__/admin/template-editor/publish-readiness.test.ts src/__tests__/components/admin/template-editor/useTemplateEditorDraft.ed10-split-save.test.ts --runInBand
```

Expected: all tests PASS and existing split-save behavior remains unchanged.

- [ ] **Step 9: Commit version lifecycle integration**

```bash
git add 'src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/route.ts' 'src/src/app/api/admin/assessment-templates/[id]/versions/[versionId]/publish/route.ts' src/src/components/admin/template-editor/publish-readiness.ts src/src/components/admin/template-editor/hooks/useTemplateEditorDraft.ts src/src/components/admin/template-editor/TabbedShell.tsx src/src/__tests__/api/admin/assessment-templates/template-version-patch.wave-t.test.ts src/src/__tests__/api/admin/assessment-templates/versions-edit-duplicate.test.ts src/src/__tests__/api/admin/assessment-templates/marketing-cta-version.test.ts src/src/__tests__/admin/template-editor/publish-readiness.test.ts
git commit -m "feat: validate CTA through template version lifecycle"
```

### Task 6: Tester-Friendly CTA Preset and Block Editor

**Files:**
- Create: `src/src/components/admin/template-editor/MarketingCtaEditor.tsx`
- Create: `src/src/components/admin/template-editor/MarketingCtaBlockEditor.tsx`
- Modify: `src/src/components/admin/template-editor/SettingsTab.tsx`
- Modify: `src/src/components/admin/template-editor/TabbedShell.tsx`
- Create: `src/src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx`
- Modify: `src/src/__tests__/components/admin/TemplateEditorTabbed.test.tsx`

**Interfaces:**
- Consumes: `MarketingCtaConfigV1`, `createMarketingCtaPreset`, `deliveryType`, `isPublicMarketingCtaEnabled`, and `onMarketingCtaChange`.
- Produces: `MarketingCtaEditor({ value, onChange, onPreview, previewDisabled })` and visually authored structured blocks.

- [ ] **Step 1: Write failing eligibility and preset tests**

Assert Marketing CTA appears after Language and before Invitation Email only for `PUBLIC_MARKETING_QUIZ` under flag ON. Assert it never appears for invited or flag OFF. Assert all three preset cards appear with no initial selection for a new public draft.

- [ ] **Step 2: Write failing interaction tests**

Test selecting Full Marketing populates the actual books image and three buttons; selecting Quick populates two buttons; edited content followed by another preset click opens a replacement confirmation; cancel preserves blocks; confirm replaces current draft blocks. Test add/remove/reorder for all four block types and accessible labels for every field.

- [ ] **Step 3: Run tests and verify missing component failures**

Run:

```bash
cd src
npx jest src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx src/__tests__/components/admin/TemplateEditorTabbed.test.tsx --runInBand
```

Expected: FAIL because the editor components and public-only placement are absent.

- [ ] **Step 4: Build the preset chooser and replacement confirmation**

Render the approved three large cards. Treat `value === null` as no selection. Track whether the current blocks differ from the selected preset snapshot; when they do, route a different preset through the existing confirmation dialog pattern with copy: “Replace this draft’s current Marketing CTA? Your unpublished CTA changes will be replaced.”

- [ ] **Step 5: Build block authoring without HTML**

Render ordered block cards with plain labels:

- Text: Heading/lead, body, alignment.
- Image: image URL, Upload image, alternative text, optional link, width.
- Button: button text, destination kind/value, open in new tab, style.
- Divider: no technical fields.

Every block exposes Move up, Move down, and Remove. The bottom action row exposes Add text, Add image, Add button, and Add divider. Generate new IDs with `crypto.randomUUID()` in the browser.

- [ ] **Step 6: Integrate Settings placement and draft state**

Pass `extractMarketingCta(reportConfig)` as value and `handleMarketingCtaChange` as the handler. The card sits immediately after `LanguageCard` and before `InvitationEmailCard`. Display validation issues beside the affected block and a summary in Safe-to-Publish.

- [ ] **Step 7: Run interaction and editor regression tests**

Run:

```bash
cd src
npx jest src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx src/__tests__/components/admin/TemplateEditorTabbed.test.tsx src/__tests__/components/admin/template-editor/TemplateEditorController.test.tsx --runInBand
```

Expected: all tests PASS with no raw HTML textarea/contenteditable in the DOM.

- [ ] **Step 8: Commit the visual editor**

```bash
git add src/src/components/admin/template-editor/MarketingCtaEditor.tsx src/src/components/admin/template-editor/MarketingCtaBlockEditor.tsx src/src/components/admin/template-editor/SettingsTab.tsx src/src/components/admin/template-editor/TabbedShell.tsx src/src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx src/src/__tests__/components/admin/TemplateEditorTabbed.test.tsx
git commit -m "feat: add visual public marketing CTA editor"
```

### Task 7: Managed CTA Image Upload

**Files:**
- Create: `src/src/app/api/admin/assessment-cta-assets/route.ts`
- Create: `src/src/lib/assessments/marketing-cta-assets.ts`
- Modify: `src/src/components/admin/template-editor/MarketingCtaBlockEditor.tsx`
- Create: `src/src/__tests__/api/admin/assessment-cta-assets.test.ts`
- Modify: `src/src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx`

**Interfaces:**
- Produces: `POST /api/admin/assessment-cta-assets` multipart fields `templateId`, `file`; success `{ assetRef, url }`; client inserts the returned HTTPS URL as image `src`.

- [ ] **Step 1: Write failing upload authorization and validation tests**

Mock `@vercel/blob.put`. Assert unauthenticated returns 401, non-admin/staff returns 403, missing template returns 404, non-image and files over 5 MiB return 400, and PNG/JPEG/WebP returns 201 while calling `put` with `access: "public"` and an `assessment-cta/{templateId}/` key.

- [ ] **Step 2: Run the route test and verify missing route failure**

Run: `cd src && npx jest src/__tests__/api/admin/assessment-cta-assets.test.ts --runInBand`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement server upload validation**

Use the project admin/staff auth helper, parse `request.formData()`, verify the template exists, accept only `image/png`, `image/jpeg`, and `image/webp`, enforce `file.size <= 5 * 1024 * 1024`, sanitize the filename, and call Vercel Blob `put`. Return only the persistent Blob URL and asset reference; never accept caller-provided storage paths.

- [ ] **Step 4: Wire the Image block upload control**

On Upload image, post `templateId` and the selected file, show an inline progress/disabled state, then set `src` to the returned URL. Keep the HTTPS URL field available for approved existing sources. Require alt text at publication; do not generate it automatically.

- [ ] **Step 5: Run route and editor tests**

Run:

```bash
cd src
npx jest src/__tests__/api/admin/assessment-cta-assets.test.ts src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx --runInBand
```

Expected: PASS, including upload error copy and successful URL insertion.

- [ ] **Step 6: Commit managed uploads**

```bash
git add src/src/app/api/admin/assessment-cta-assets/route.ts src/src/lib/assessments/marketing-cta-assets.ts src/src/components/admin/template-editor/MarketingCtaBlockEditor.tsx src/src/__tests__/api/admin/assessment-cta-assets.test.ts src/src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx
git commit -m "feat: support managed marketing CTA images"
```

### Task 8: Campaign Picker Separation and API Enforcement

**Files:**
- Modify: `src/src/lib/assessments/campaign-create-service.ts`
- Modify: `src/src/app/api/assessment-templates/route.ts`
- Modify: `src/src/app/api/assessment-campaigns/route.ts`
- Modify: `src/src/app/api/admin/public-campaigns/route.ts`
- Modify: `src/src/components/admin/PublicCampaignsManager.tsx`
- Modify: `src/src/__tests__/lib/assessments/campaign-create-service.test.ts`
- Modify: `src/src/__tests__/api/assessment-templates/templates-route.test.ts`
- Modify: `src/src/__tests__/api/admin-public-campaigns.test.ts`
- Modify: `src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx`
- Create: `src/src/__tests__/api/assessment-campaigns/template-delivery-type.test.ts`

**Interfaces:**
- Consumes: `isTemplateCompatibleWithAccessMode` and delivery type from Prisma.
- Produces: `CampaignCreateError` code `TEMPLATE_DELIVERY_TYPE_MISMATCH` and mutually exclusive picker responses under flag ON.

- [ ] **Step 1: Write failing service/API compatibility tests**

Prove all four pairing outcomes. Public Campaign API rejects invited templates; regular Campaign API rejects public templates. Assert status 409 and body code `TEMPLATE_DELIVERY_TYPE_MISMATCH`. Assert the checks run after template lookup and before campaign/version writes.

- [ ] **Step 2: Write failing picker tests**

With flag ON, regular template list contains invited only and PublicCampaignsManager receives public only. With flag OFF, both endpoints preserve current response membership and DOM behavior.

- [ ] **Step 3: Run focused tests and verify failures**

Run:

```bash
cd src
npx jest src/__tests__/lib/assessments/campaign-create-service.test.ts src/__tests__/api/assessment-campaigns/template-delivery-type.test.ts src/__tests__/api/admin-public-campaigns.test.ts src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx --runInBand
```

Expected: FAIL because no delivery compatibility gate exists.

- [ ] **Step 4: Add the shared campaign compatibility assertion**

Export:

```ts
export function assertTemplateDeliveryCompatible(
  deliveryType: AssessmentTemplateDeliveryType,
  accessMode: AssessmentCampaignAccessMode
): void {
  if (!isTemplateCompatibleWithAccessMode(deliveryType, accessMode)) {
    throw new CampaignCreateError(
      "TEMPLATE_DELIVERY_TYPE_MISMATCH",
      "This template cannot be used with the selected campaign type."
    );
  }
}
```

Call it from both creation routes only when the wave is enabled.

- [ ] **Step 5: Filter selectors from the persisted type**

Add `deliveryType` to route selects. Under flag ON, the regular list filters `INVITED_ASSESSMENT`; the public admin list filters `PUBLIC_MARKETING_QUIZ`. Do not use alias filters. Include `deliveryType` in public manager option data for a client-side defensive filter, while the server remains authoritative.

- [ ] **Step 6: Prove version pinning remains unchanged**

Extend campaign tests: create campaign A before successor publication and campaign B afterward. Assert A retains old `versionId` even when DRAFT and B receives the new Active `versionId`. No update path may rewrite A.

- [ ] **Step 7: Run campaign and picker tests**

Run:

```bash
cd src
npx jest src/__tests__/lib/assessments/campaign-create-service.test.ts src/__tests__/api/assessment-campaigns/template-delivery-type.test.ts src/__tests__/api/assessment-templates/templates-route.test.ts src/__tests__/api/admin-public-campaigns.test.ts src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx --runInBand
```

Expected: all tests PASS in ON and OFF states.

- [ ] **Step 8: Commit campaign separation**

```bash
git add src/src/lib/assessments/campaign-create-service.ts src/src/app/api/assessment-templates/route.ts src/src/app/api/assessment-campaigns/route.ts src/src/app/api/admin/public-campaigns/route.ts src/src/components/admin/PublicCampaignsManager.tsx src/src/__tests__/lib/assessments/campaign-create-service.test.ts src/src/__tests__/api/assessment-templates/templates-route.test.ts src/src/__tests__/api/admin-public-campaigns.test.ts src/src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx src/src/__tests__/api/assessment-campaigns/template-delivery-type.test.ts
git commit -m "feat: separate public and invited campaign templates"
```

### Task 9: Public Marketing Result Model and Runtime Gate

**Files:**
- Create: `src/src/lib/assessments/public-marketing-result.ts`
- Create: `src/src/__tests__/lib/assessments/public-marketing-result.test.ts`
- Modify: `src/src/app/(public)/quiz/[campaignAlias]/page.tsx`
- Modify: `src/src/components/assessments/public-quiz-client.tsx`
- Create: `src/src/components/assessments/PublicMarketingResult.tsx`
- Create: `src/src/styles/public-marketing-result.css`
- Create: `src/src/__tests__/components/assessments/PublicMarketingResult.test.tsx`
- Modify: `src/src/__tests__/components/public-quiz-results.test.tsx`

**Interfaces:**
- Consumes: pinned version `reportConfig`, template delivery type, campaign access mode, `ScoreResult`, submitted answers, and `coachContactEmail`.
- Produces:

```ts
export interface PublicScoreBand {
  min: number;
  max: number;
  label: string;
  message: string;
  quote?: string;
}
export interface SafePublicMarketingConfig {
  schemaVersion: 1;
  scoreBands: PublicScoreBand[];
  showDetailedAnswers: true;
  marketingCta: MarketingCtaConfigV1;
}
export function parseSafePublicMarketingConfig(reportConfig: unknown): SafePublicMarketingConfig | null;
export function findActiveScoreBand(score: number, bands: PublicScoreBand[]): number;
export function getPublicPercentScore(result: ScoreResult): number | null;
export function resolveLinkTarget(target: LinkTarget, coachContactEmail?: string | null): string;
```

- [ ] **Step 1: Write score-band boundary and fallback tests**

Use bands 0–24, 25–49, 50–74, 75–100 and assert active indices for scores 0, 24, 25, 49, 50, 74, 75, and 100. Assert `scaleUpScore` wins; scored overall average converts to a clamped 0–100 score only for a scored instrument; qualitative results return `null` and retain canonical text.

- [ ] **Step 2: Write runtime-gate and malformed-data tests**

Assert the new renderer appears only when all four eligibility conditions are true. A malformed CTA must render score, bands, and detailed answers using the safe fallback without rendering CTA markup. Assert telemetry receives templateId, versionId, campaignId, schemaVersion, and failureClass but no answers or participant identity.

- [ ] **Step 3: Write result-order and exact-content component tests**

Assert DOM order is gauge, all bands, detailed answers, CTA. Exactly one band has `aria-current="true"`. Full Marketing displays the actual books image and all three actions. Quick resolves dynamic coach to `mailto:{coachContactEmail}` or `https://scalingup.com/coaches` when absent.

- [ ] **Step 4: Run tests and verify missing model/component failures**

Run:

```bash
cd src
npx jest src/__tests__/lib/assessments/public-marketing-result.test.ts src/__tests__/components/assessments/PublicMarketingResult.test.tsx src/__tests__/components/public-quiz-results.test.tsx --runInBand
```

Expected: FAIL because the specialized model and renderer do not exist.

- [ ] **Step 5: Implement safe result-config parsing**

Store at:

```ts
reportConfig.publicMarketing = {
  schemaVersion: 1,
  resultPresentation: {
    kind: "scoreBands",
    bands: PublicScoreBand[],
    showDetailedAnswers: true,
  },
  marketingCta: MarketingCtaConfigV1,
};
```

Validate ordered non-overlapping bands covering 0–100 for percent-scored templates. Return `null` on malformed content and emit structured server telemetry without response data.

- [ ] **Step 6: Load only the pinned published config**

Extend the public quiz page select with `campaign.accessMode`, `campaign.version.reportConfig`, `campaign.version.publishedAt`, and `campaign.template.deliveryType`. Build `safePublicMarketingConfig` only when the wave is ON, access mode is PUBLIC, type is PUBLIC_MARKETING_QUIZ, the pinned version is published, and parsing succeeds. Never call active-version resolution in the result path.

- [ ] **Step 7: Implement the responsive participant component**

Build a semantic semicircle gauge with visible numeric score, an ordered band list retaining all bands, detailed answers grouped using existing report ordering, and CTA blocks. Render block data as React elements; do not inject `dangerouslySetInnerHTML`. Use the compiled HTML only as a publication/audit snapshot. Apply focus-visible states, 44px minimum action targets, responsive single-column mobile layout, image alt text, and subdued non-active bands meeting contrast requirements.

- [ ] **Step 8: Wire the public client with a strict fallback**

After submission, render `PublicMarketingResult` only when `safePublicMarketingConfig` exists; otherwise render the current `BrandedReport` code path without markup changes. Do not import the component into email, PDF, print, or privileged report modules.

- [ ] **Step 9: Run result and unaffected-surface regressions**

Run:

```bash
cd src
npx jest src/__tests__/lib/assessments/public-marketing-result.test.ts src/__tests__/components/assessments/PublicMarketingResult.test.tsx src/__tests__/components/public-quiz-results.test.tsx src/__tests__/assessments/report-email.test.ts src/__tests__/assessments/report-email-qualitative.test.ts src/__tests__/components/assessments/print-report-button.test.tsx --runInBand
```

Expected: all tests PASS; email/qualitative/print snapshots contain no Marketing CTA.

- [ ] **Step 10: Commit participant rendering**

```bash
git add src/src/lib/assessments/public-marketing-result.ts src/src/__tests__/lib/assessments/public-marketing-result.test.ts 'src/src/app/(public)/quiz/[campaignAlias]/page.tsx' src/src/components/assessments/public-quiz-client.tsx src/src/components/assessments/PublicMarketingResult.tsx src/src/styles/public-marketing-result.css src/src/__tests__/components/assessments/PublicMarketingResult.test.tsx src/src/__tests__/components/public-quiz-results.test.tsx
git commit -m "feat: render versioned public marketing results"
```

### Task 10: No-Write Public Result Preview

**Files:**
- Create: `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/preview-public-result/page.tsx`
- Create: `src/src/lib/assessments/public-marketing-preview.ts`
- Modify: `src/src/components/admin/template-editor/MarketingCtaEditor.tsx`
- Create: `src/src/__tests__/app/admin/public-marketing-result-preview.test.tsx`

**Interfaces:**
- Consumes: draft version reportConfig and `PublicMarketingResult`.
- Produces: `/admin/assessments/templates/{templateId}/versions/{versionId}/preview-public-result?band={index}` and `buildPublicMarketingPreviewModel(config, bandIndex)`.

- [ ] **Step 1: Write failing preview authorization and no-write tests**

Assert admin/staff access succeeds, unauthorized access is rejected, invited templates receive 404, and the loader only calls `findUnique`. Mock all create/update/send methods and assert zero calls. Assert `band=0..3` selects the midpoint score and representative answers without creating a submission.

- [ ] **Step 2: Write failing editor launch tests**

Assert Preview public result opens a separate tab only after the draft is saved. When CTA/reportConfig is dirty, show “Save draft to preview” and disable the launch. Do not autosave or create participant data.

- [ ] **Step 3: Run tests and verify missing route/helper failures**

Run: `cd src && npx jest src/__tests__/app/admin/public-marketing-result-preview.test.tsx src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx --runInBand`

Expected: FAIL because the route and preview model are absent.

- [ ] **Step 4: Implement deterministic sample data**

For the selected band, use `Math.floor((min + max) / 2)` and generate one stable representative answer per visible question using its first valid option or midpoint scalar value. Mark preview provenance as `sample: true`; never call scoring submission or persistence services.

- [ ] **Step 5: Implement the read-only page and editor launch**

Authorize via the existing admin/staff server helper, load the exact draft version by both template and version IDs, parse the draft public config, and render `PublicMarketingResult` with a “Preview — no response will be recorded” banner. The editor calls `window.open(url, "_blank", "noopener,noreferrer")` only with no unsaved CTA changes.

- [ ] **Step 6: Run preview tests**

Run:

```bash
cd src
npx jest src/__tests__/app/admin/public-marketing-result-preview.test.tsx src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx --runInBand
```

Expected: PASS and all mocked write counts remain zero.

- [ ] **Step 7: Commit preview**

```bash
git add 'src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/preview-public-result/page.tsx' src/src/lib/assessments/public-marketing-preview.ts src/src/components/admin/template-editor/MarketingCtaEditor.tsx src/src/__tests__/app/admin/public-marketing-result-preview.test.tsx
git commit -m "feat: preview public marketing results without writes"
```

### Task 11: Forward-Only Successor Draft Seeder

**Files:**
- Create: `src/src/lib/assessments/public-marketing-presets.ts`
- Create: `src/scripts/seed-public-marketing-cta-successors.ts`
- Create: `src/src/__tests__/scripts/seed-public-marketing-cta-successors.test.ts`
- Modify: `src/package.json`

**Interfaces:**
- Consumes: Active published versions for aliases `scaling-up-quick` and `sunhub-quick-quiz`, `computeTemplateContentHash`, and preset builders.
- Produces: `buildScalingUpQuickSuccessorReportConfig(base): unknown`, `buildSunHubSuccessorReportConfig(base): unknown`, and script command `npm run seed:public-marketing-cta-successors -- --i-know-this-is-prod`.

- [ ] **Step 1: Write failing content-builder tests**

Assert Quick keeps unrelated reportConfig keys and receives Quick CTA. Assert SunHub receives all four exact score ranges plus Full CTA. Assert exact links and `/brand/scaling-up-books.png`. Assert the source published object is not mutated.

- [ ] **Step 2: Write failing idempotency and forward-only script tests**

Mock Prisma with an Active published version. First run creates one higher-numbered unpublished draft with a new content hash and audit log. Second run with identical latest draft is a no-op. A conflicting existing draft aborts without update. No `assessmentTemplateVersion.update` call is permitted. Production execution without `--i-know-this-is-prod` exits nonzero before writes.

- [ ] **Step 3: Run tests and verify missing script/helper failures**

Run: `cd src && npx jest src/__tests__/scripts/seed-public-marketing-cta-successors.test.ts --runInBand`

Expected: FAIL because the builder and script are absent.

- [ ] **Step 4: Implement independent successor content builders**

The SunHub bands are exactly:

```ts
[
  { min: 0, max: 24, label: "Ouch! It's been tough to scale easily. We can help.", message: "If action followed knowledge, we'd all have six packs.", quote: "Niel Malan" },
  { min: 25, max: 49, label: "Good start. Though wondering if there is an easier way to scale.", message: "Believe you can and you're halfway there.", quote: "Theodore Roosevelt" },
  { min: 50, max: 74, label: "You're Close. With a little more finesse you can nail the scale.", message: "Professionals do it all; amateurs only do the fun parts." },
  { min: 75, max: 100, label: "You Rock (or fib!). You're ready. Keep moving; grab profit share!", message: "If everything seems in control, you're just not going fast enough.", quote: "Mario Andretti" },
]
```

Use fixed preset builders, not copied HTML strings.

- [ ] **Step 5: Implement guarded idempotent draft creation**

Within one transaction: load each template by alias and assert `deliveryType === PUBLIC_MARKETING_QUIZ`; load its Active published version and latest version; clone questions, sections, scoring config, invitation hash inputs, and merged report config; compute hash; no-op if latest hash matches; abort on a different unpublished draft; otherwise create the next draft and an audit row. Never publish automatically.

- [ ] **Step 6: Run seeder tests**

Run: `cd src && npx jest src/__tests__/scripts/seed-public-marketing-cta-successors.test.ts --runInBand`

Expected: all content, idempotency, guard, and no-update assertions PASS.

- [ ] **Step 7: Commit forward-only seed support**

```bash
git add src/src/lib/assessments/public-marketing-presets.ts src/scripts/seed-public-marketing-cta-successors.ts src/src/__tests__/scripts/seed-public-marketing-cta-successors.test.ts src/package.json
git commit -m "feat: seed public marketing successor drafts"
```

### Task 12: Integrated Verification, Visual Receipts, and Source-of-Truth Updates

**Files:**
- Modify: `CONTEXT.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Test: all focused files named in Tasks 1–11.

**Interfaces:**
- Consumes: complete feature branch.
- Produces: launch evidence, documented rollback, and no unresolved lint/type/test issues.

- [ ] **Step 1: Update the domain glossary**

Add exact entries to `CONTEXT.md` for:

- Template delivery type — immutable template-level public/invited eligibility after first publication.
- Marketing CTA — structured, version-owned public-result marketing content.
- CTA preset — a copied starting snapshot with no live dependency.
- Public result presentation — pinned version content rendered only after an interactive public submission.

- [ ] **Step 2: Add a changelog entry and refresh SoT anchors**

Prepend a full `plans/CHANGELOG.md` entry containing flag names, migration/backfill behavior, authoring/result behavior, new-campaign-only semantics, validation commands, and kill rollback. Update `CLAUDE.md` `LAST_UPDATED_ISO` and `LAST_UPDATED_SLUG` plus the active-wave summary.

- [ ] **Step 3: Run ESLint on every changed TypeScript/TSX file**

Run:

```bash
cd src
git diff --name-only origin/main -- '*.ts' '*.tsx' | xargs npx eslint
```

Expected: exit 0 with no errors.

- [ ] **Step 4: Run all public-marketing targeted tests**

Run:

```bash
cd src
npx jest \
  src/__tests__/lib/assessments/wave-public-marketing-cta-flags.test.ts \
  src/__tests__/lib/assessments/template-delivery-policy.test.ts \
  src/__tests__/lib/assessments/marketing-cta.test.ts \
  src/__tests__/lib/assessments/marketing-cta-compiler.test.ts \
  src/__tests__/lib/assessments/public-marketing-result.test.ts \
  src/__tests__/components/admin/assessment-template-delivery-type.test.tsx \
  src/__tests__/components/admin/template-editor/MarketingCtaEditor.test.tsx \
  src/__tests__/components/assessments/PublicMarketingResult.test.tsx \
  src/__tests__/api/admin/assessment-templates/marketing-cta-version.test.ts \
  src/__tests__/api/admin/assessment-cta-assets.test.ts \
  src/__tests__/api/assessment-campaigns/template-delivery-type.test.ts \
  src/__tests__/app/admin/public-marketing-result-preview.test.tsx \
  src/__tests__/scripts/seed-public-marketing-cta-successors.test.ts \
  --runInBand
```

Expected: all suites PASS.

- [ ] **Step 5: Run affected regression tests**

Run:

```bash
cd src
npx jest \
  src/__tests__/api/admin/assessment-templates/templates-crud.test.ts \
  src/__tests__/api/admin/assessment-templates/templates-route.test.ts \
  src/__tests__/api/admin/assessment-templates/versions-edit-duplicate.test.ts \
  src/__tests__/api/admin-public-campaigns.test.ts \
  src/__tests__/api/assessment-templates/templates-route.test.ts \
  src/__tests__/lib/assessments/campaign-create-service.test.ts \
  src/__tests__/components/admin/TemplateEditorTabbed.test.tsx \
  src/__tests__/components/admin/public-campaigns-manager-smoke.test.tsx \
  src/__tests__/components/public-quiz-results.test.tsx \
  src/__tests__/assessments/report-email.test.ts \
  src/__tests__/assessments/report-email-qualitative.test.ts \
  src/__tests__/components/assessments/print-report-button.test.tsx \
  --runInBand
```

Expected: all suites PASS and OFF-state assertions match existing production behavior.

- [ ] **Step 6: Run migration and production build gates**

Run:

```bash
cd src
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
```

Expected: migration safety exits 0 and Turbopack build completes successfully.

- [ ] **Step 7: Perform local visual and accessibility review**

With the wave enabled locally, capture at 1440×1000 and 390×844:

1. New template form with neither type selected.
2. Public Settings with all three CTA preset cards.
3. Full CTA visual block editor using actual books.
4. Quick CTA visual block editor.
5. SunHub public preview showing score, four bands, answers, and CTA.
6. Quick public preview showing its distinct CTA.
7. Invited Settings with no CTA card.

Save receipts under `output/public-marketing-cta/` without committing them. Compare against the approved production-style mock and verify keyboard order, visible focus, labels, no horizontal mobile overflow, and no raw HTML control.

- [ ] **Step 8: Commit verification documentation**

```bash
git add CONTEXT.md CLAUDE.md plans/CHANGELOG.md
git commit -m "docs: record public marketing CTA rollout"
git status --short
```

Expected: clean working tree except untracked local visual receipts.

### Task 13: Pull Request, Production Deployment, and Tester Handoff

**Files:**
- No source files unless required checks reveal a defect; defects return to the owning task’s test-first cycle.

**Interfaces:**
- Consumes: verified branch and launch checklist.
- Produces: merged protected-main PR, Ready production deployment, enabled feature, two reviewable successor drafts, smoke evidence, and tester instructions.

- [ ] **Step 1: Push the feature branch and open a draft PR**

```bash
git push -u origin codex/public-marketing-results-cta
gh pr create --draft --base main --head codex/public-marketing-results-cta \
  --title "Add versioned public marketing CTA results" \
  --body-file docs/superpowers/specs/2026-08-17-public-marketing-results-cta-design.md
```

Expected: GitHub returns a PR URL targeting `main`.

- [ ] **Step 2: Wait for and inspect required checks**

Run:

```bash
gh pr checks --watch
gh pr view --json mergeable,reviewDecision,statusCheckRollup
```

Expected: Build and Migration Safety Gate succeed and the PR is mergeable. Any failure is reproduced locally and fixed with a failing regression test before repushing.

- [ ] **Step 3: Mark ready and merge through protected workflow**

```bash
gh pr ready
gh pr merge --squash --delete-branch
```

Expected: GitHub reports the PR merged into `main`. If branch protection requires another human approval, stop before merge and provide the exact PR URL and approval state; do not bypass protection.

- [ ] **Step 4: Wait for production deployment before mutating production content**

Run from `src`:

```bash
npx vercel ls 2>&1 | head -10
curl -sS https://scaling-up-platform-v2.vercel.app/api/health
```

Expected: the deployment for the merge commit is `Ready` and health returns the normal healthy response.

- [ ] **Step 5: Enable the production wave with rollback prepared**

Set production `WAVE_PUBLIC_MARKETING_CTA_ENABLED=1` and `WAVE_PUBLIC_MARKETING_CTA_KILL=0` through the established Vercel environment workflow, then trigger/wait for a production redeploy. The immediate rollback is `WAVE_PUBLIC_MARKETING_CTA_KILL=1` plus redeploy; stored drafts remain intact.

- [ ] **Step 6: Create forward-only successor drafts**

Run only after the feature deployment is Ready:

```bash
cd src
npm run seed:public-marketing-cta-successors -- --i-know-this-is-prod
```

Expected: one unpublished successor draft for `scaling-up-quick` and one for `sunhub-quick-quiz`; no published version changes. Run the command a second time and expect two no-op results.

- [ ] **Step 7: Review and publish successor versions in admin**

In production admin, open each new draft, preview every configured score band, click-test every CTA destination, and publish only after the visual treatment matches the approved receipt. Record the two published version IDs and publication timestamps. Do not recreate or update existing campaigns.

- [ ] **Step 8: Run production smoke with disposable records**

Create one disposable public template draft and one disposable invited template draft through the UI. Verify explicit type choice, CTA visibility only for public, preset application, unsafe URL rejection, no-write preview, publish readiness, public/invited picker separation, and type lock after first publication. Archive the disposable records through the normal recoverable admin lifecycle and record their IDs.

- [ ] **Step 9: Prove old-versus-new campaign pinning**

Record an existing campaign’s version ID before successor publication and confirm it is unchanged afterward. Create a new disposable Public Campaign for each successor and confirm it pins the newly published version. Submit one response to each and verify the approved result order and CTA. Archive the disposable campaigns through the normal recoverable lifecycle.

- [ ] **Step 10: Verify unaffected production surfaces**

Open an invited respondent result, an emailed report, print preview, and a coach/admin report. Confirm none contains the new Marketing CTA. Confirm malformed/absent CTA fallback still shows score and answers.

- [ ] **Step 11: Hand off to production testers**

Provide testers the production URL, the two new public campaign URLs, the exact behaviors to verify, known new-campaign-only semantics, and rollback state. Include: “Existing campaigns do not change; only campaigns created after the successor version publication use the new result and CTA.”

---

## Execution Completion Definition

Execution is complete only after Tasks 1–13 are checked, the protected-main PR is merged, the production deployment is Ready, both successor versions have been deliberately reviewed and published, old/new campaign pinning is evidenced, unaffected surfaces are checked, and production testers receive working URLs. If branch protection or another human approval prevents merge/publication, report that external gate with the PR URL and exact pending action; do not claim production completion.
