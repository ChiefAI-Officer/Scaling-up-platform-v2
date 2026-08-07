# Template Creation Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create an empty assessment draft by entering only its name, continue in the existing Build editor with all four question types, and show the existing Scoring & Tiers tab in plain language.

**Architecture:** A default-off enable/kill resolver combines with the already-live ED6, ED9, and Wave T gates so the simple surface appears only when the promised Build editor and four-type picker are available. The existing POST gains a discriminated `{ creationMode: "simplified", name, internalId? }` branch: the server owns defaults, bounded numeric-suffix retries, the existing atomic transaction, and the returned version ID, while requests without that discriminator remain unchanged. Scoring validation produces stable issue codes once; the rendering boundary chooses legacy or friendly copy without changing stored values, calculations, validation decisions, or save payloads.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Prisma 6 · Tailwind/shadcn tokens · Jest + React Testing Library · Turbopack.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-06-template-creation-simplification-design.md`.
- The creation screen requires only **Assessment name**; **Internal ID** is generated and available under collapsed **Advanced**.
- Supported Build question types remain exactly Slider, Short text, Number, and Multiple choice through the existing `QuestionTypePicker`.
- Persist one empty unpublished v1 atomically; do not create placeholder sections, questions, or tiers.
- Initial language is exactly `enUS`; aggregation is exactly `FULL_VISIBILITY`.
- Initial scoring config is exactly `{ tierMetric: "countAchieved", passThreshold: 0, tiers: [] }`.
- Do not change the Prisma schema, scoring formulas, tier ranges, reports, findings, submissions, or publish validation.
- The release gate is `WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED`; `WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL` overrides it.
- Flag off or killed must preserve the legacy creation render, legacy API response body, and legacy Scoring & Tiers text.
- Generated Internal ID collisions advance through `-2`, `-3`, and so on in one bounded server request; manually edited IDs are never silently changed.
- The simplified surface is available only when ED6 single-column, ED9 Forms Build, and Wave T question-type unlock are also active.
- No new dependency.
- Work in the isolated worktree and keep the root worktree's unrelated changes untouched.
- Before a code push, run changed-file ESLint, targeted Jest, `node scripts/check-migration-safety.mjs`, and `CI=true npx next build --turbopack` from `src/`.

**Scope check:** Creation and scoring copy are kept in one plan because the
approved release deliberately gives them one rollout/rollback gate. Their code
tasks remain independently testable and reviewable.

## Co-validation

Independent staff-engineer review ran before implementation (Codex thread
`019fd569-d840-79f3-b358-5c5cb01e2d43`).

- **Accepted:** compose the release with ED6 + ED9 + Wave T so it cannot promise
  a builder/type picker that a prerequisite kill has removed.
- **Accepted:** move defaults and bounded generated-ID collision retries to the
  server; the client now sends only name plus an optional manually edited ID.
- **Accepted:** make tier validation emit stable issue codes once and select
  legacy/friendly copy only after validation.
- **Adapted:** the reviewer proposed a second endpoint. This plan instead uses a
  strict discriminated branch on the existing POST so the current transaction,
  auth, rate limit, hash, and audit path remain singular while the legacy
  request/response contract stays exact.
- **Own review accepted:** reuse the factual existing empty-builder message and
  **+ Add section** action; do not rename or modify `FormsBuilder`.

---

## File Map

**Create**

- `src/src/lib/assessments/wave-template-creation-flags.ts` — call-time enable/kill resolver.
- `src/src/__tests__/lib/assessments/wave-template-creation-flags.test.ts` — truth table and call-time reads.
- `src/src/lib/assessments/template-internal-id.ts` — shared name-to-ID normalization and bounded numeric suffix generation.
- `src/src/__tests__/lib/assessments/template-internal-id.test.ts` — normalization, length, and suffix boundaries.
- `src/src/components/admin/SimplifiedAssessmentTemplateForm.tsx` — name/Internal-ID state, narrow create request, and Build redirect.
- `src/src/__tests__/components/admin/simplified-assessment-template-form.test.tsx` — focused form behavior and request contract.
- `src/src/__tests__/app/admin-new-assessment-template-page.test.tsx` — auth gate and exact flag-on/flag-off surface selection.
- `src/src/components/admin/template-editor/scoring-tier-copy.ts` — friendly labels and friendly formatting for structured tier-validation issues.
- `src/src/__tests__/components/admin/template-editor/scoring-tier-copy.test.ts` — raw-key mapping and validation-copy formatting.

**Modify**

- `src/src/app/(dashboard)/admin/assessments/templates/new/page.tsx` — resolve the release flag and choose the new or legacy creation surface.
- `src/src/app/api/admin/assessment-templates/route.ts` — add the narrow simplified request branch while preserving the legacy branch.
- `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts` — pin server-owned defaults, bounded suffix retries, the legacy contract, audit, auth, validation, rate-limit, collision, and rollback behavior.
- `src/src/lib/assessments/scoring.ts` — add stable, additive codes to existing tier-tiling issues without changing decisions or messages.
- `src/src/__tests__/lib/assessments/scoring.test.ts` — pin the stable issue codes.
- `src/src/components/admin/template-editor/ScoringTiersTab.tsx` — conditional author-visible copy only.
- `src/src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx` — friendly labels, forbidden-term absence, raw callback values, and legacy flag-off copy.
- `src/src/components/admin/template-editor/TabbedShell.tsx` — accept and forward `plainLanguageScoringEnabled`.
- `src/src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx` — prove the editor seam forwards the release state to Scoring & Tiers.
- `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx` — resolve the release flag server-side and pass it to the client editor.
- `CLAUDE.md` and `plans/CHANGELOG.md` — local implementation status and exact verification receipt before push.

The legacy `AssessmentTemplateForm.tsx`, `FormsBuilder.tsx`, `FormQuestionCard.tsx`, `QuestionTypePicker.tsx`, and Prisma schema are not modified. The scoring engine receives issue identifiers only; its rules, messages, and results stay unchanged.

---

### Task 1: Add the release resolver

**Files:**

- Create: `src/src/lib/assessments/wave-template-creation-flags.ts`
- Create: `src/src/__tests__/lib/assessments/wave-template-creation-flags.test.ts`

**Interfaces:**

- Produces: `isTemplateCreationSimplifiedEnabled(): boolean`, the effective
  release result including ED6, ED9, and Wave T prerequisites.
- Consumed later by: the new-template page, create API, and version-edit page.

- [ ] **Step 1: Write the failing flag truth-table test**

```ts
import { isTemplateCreationSimplifiedEnabled } from "@/lib/assessments/wave-template-creation-flags";

const ENABLED = "WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED";
const KILL = "WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL";
const ED6 = "WAVE_ED6_SINGLE_COLUMN_ENABLED";
const ED9 = "WAVE_ED9_FORMS_BUILD_ENABLED";
const WAVE_T = "WAVE_T_QUESTION_EDITOR_ENABLED";

describe("isTemplateCreationSimplifiedEnabled", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [ENABLED, KILL, ED6, ED9, WAVE_T]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of [ENABLED, KILL, ED6, ED9, WAVE_T]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults off", () => {
    expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables for %s", (value) => {
    process.env[ED6] = "1";
    process.env[ED9] = "1";
    process.env[WAVE_T] = "1";
    process.env[ENABLED] = value;
    expect(isTemplateCreationSimplifiedEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays off for %j",
    (value) => {
      process.env[ED6] = "1";
      process.env[ED9] = "1";
      process.env[WAVE_T] = "1";
      process.env[ENABLED] = value;
      expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
    },
  );

  it("lets kill override enable", () => {
    process.env[ED6] = "1";
    process.env[ED9] = "1";
    process.env[WAVE_T] = "1";
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
  });

  it.each([ED6, ED9, WAVE_T])(
    "stays off when prerequisite %s is unavailable",
    (missing) => {
      process.env[ENABLED] = "1";
      process.env[ED6] = "1";
      process.env[ED9] = "1";
      process.env[WAVE_T] = "1";
      delete process.env[missing];
      expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
    },
  );

  it("reads environment values at call time", () => {
    expect(isTemplateCreationSimplifiedEnabled()).toBe(false);
    process.env[ED6] = "1";
    process.env[ED9] = "1";
    process.env[WAVE_T] = "1";
    process.env[ENABLED] = "1";
    expect(isTemplateCreationSimplifiedEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/lib/assessments/wave-template-creation-flags.test.ts --runInBand
```

Expected: FAIL because `wave-template-creation-flags.ts` does not exist.

- [ ] **Step 3: Implement the resolver**

```ts
import { isSingleColumnEnabled } from "@/lib/assessments/wave-ed6-flags";
import { isFormsBuildEnabled } from "@/lib/assessments/wave-ed9-flags";
import { isQuestionEditorUnlockEnabled } from "@/lib/assessments/wave-t-flags";

function isOn(value: string | undefined): boolean {
  return (
    value === "1" ||
    value === "true" ||
    value === "TRUE" ||
    value === "yes"
  );
}

export function isTemplateCreationSimplifiedEnabled(): boolean {
  if (isOn(process.env.WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL)) return false;
  return (
    isOn(process.env.WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED) &&
    isSingleColumnEnabled() &&
    isFormsBuildEnabled() &&
    isQuestionEditorUnlockEnabled()
  );
}
```

Add a module comment stating default-off, kill precedence, prerequisite
composition, call-time reads, and the three gated surfaces. Also test that the
ED9 or Wave T kill switch makes the effective result false even when every
enable variable is true.

- [ ] **Step 4: Run the test and verify GREEN**

```bash
npx jest src/__tests__/lib/assessments/wave-template-creation-flags.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/wave-template-creation-flags.ts src/src/__tests__/lib/assessments/wave-template-creation-flags.test.ts
git commit -m "feat: add template creation release gate"
```

---

### Task 2: Share Internal ID generation between client and server

**Files:**

- Create: `src/src/lib/assessments/template-internal-id.ts`
- Create: `src/src/__tests__/lib/assessments/template-internal-id.test.ts`

**Interfaces:**

- Produces: `generateTemplateInternalId(name: string): string`.
- Produces: `templateInternalIdForAttempt(base: string, attempt: number): string`.
- Produces: `MAX_TEMPLATE_INTERNAL_ID_LENGTH = 80`.
- Consumed by: the simple form's preview and the simplified server branch.

- [ ] **Step 1: Write failing normalization and suffix tests**

```ts
import {
  generateTemplateInternalId,
  templateInternalIdForAttempt,
} from "@/lib/assessments/template-internal-id";

describe("generateTemplateInternalId", () => {
  it.each([
    ["  Team Health & Growth  ", "team-health-growth"],
    ["People___Strategy", "people-strategy"],
    ["--Cash / You--", "cash-you"],
    ["🎯🚀", ""],
  ])("normalizes %j to %j", (input, expected) => {
    expect(generateTemplateInternalId(input)).toBe(expected);
  });

  it("honors the 80-character API limit without a trailing dash", () => {
    expect(generateTemplateInternalId(`${"a".repeat(79)}-b`)).toHaveLength(80);
    expect(generateTemplateInternalId(`${"a".repeat(79)}-b`)).not.toMatch(/-$/);
  });
});

describe("templateInternalIdForAttempt", () => {
  it("uses the base for attempt 1 and numeric suffixes thereafter", () => {
    expect(templateInternalIdForAttempt("team-health", 1)).toBe("team-health");
    expect(templateInternalIdForAttempt("team-health", 2)).toBe("team-health-2");
    expect(templateInternalIdForAttempt("team-health", 3)).toBe("team-health-3");
  });

  it("trims a long base before appending the suffix", () => {
    const value = templateInternalIdForAttempt("a".repeat(80), 12);
    expect(value).toHaveLength(80);
    expect(value).toMatch(/-12$/);
  });

  it("rejects an attempt below 1", () => {
    expect(() => templateInternalIdForAttempt("team-health", 0)).toThrow(
      "attempt must be at least 1",
    );
  });
});
```

- [ ] **Step 2: Run the helper test and verify RED**

```bash
npx jest src/__tests__/lib/assessments/template-internal-id.test.ts --runInBand
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the pure helper**

```ts
export const MAX_TEMPLATE_INTERNAL_ID_LENGTH = 80;

export function generateTemplateInternalId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TEMPLATE_INTERNAL_ID_LENGTH)
    .replace(/-+$/g, "");
}

export function templateInternalIdForAttempt(
  base: string,
  attempt: number,
): string {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("attempt must be at least 1");
  }
  if (attempt === 1) return base;
  const suffix = `-${attempt}`;
  const stem = base
    .slice(0, MAX_TEMPLATE_INTERNAL_ID_LENGTH - suffix.length)
    .replace(/-+$/g, "");
  return `${stem}${suffix}`;
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

```bash
npx jest src/__tests__/lib/assessments/template-internal-id.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/template-internal-id.ts src/src/__tests__/lib/assessments/template-internal-id.test.ts
git commit -m "feat: add template internal id helper"
```

---

### Task 3: Add the server-owned simplified creation contract

**Files:**

- Modify: `src/src/app/api/admin/assessment-templates/route.ts:139-184`
- Modify: `src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts:24-165`

**Interfaces:**

- Consumes: `isTemplateCreationSimplifiedEnabled()`.
- Consumes: `generateTemplateInternalId()` and
  `templateInternalIdForAttempt()`.
- Accepts when effective gate is active:
  `{ creationMode: "simplified", name: string, internalId?: string }`.
- Produces for simplified mode:
  `{ success: true, data: { id, alias, versionId } }`.
- Preserves for every request without `creationMode: "simplified"`: the exact
  current schema, transaction semantics, `409`, and
  `{ success: true, data: { id, alias } }` response.

- [ ] **Step 1: Extend the POST tests first**

Save and restore the new release plus ED6/ED9/Wave-T environment variables in
the create describe. Make the version mock return an ID:

```ts
function enableSimplifiedCreation(): void {
  process.env.WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED = "1";
  process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED = "1";
  process.env.WAVE_ED9_FORMS_BUILD_ENABLED = "1";
  process.env.WAVE_T_QUESTION_EDITOR_ENABLED = "1";
}

(txMock.assessmentTemplateVersion.create as jest.Mock).mockResolvedValue({
  id: "ver-1",
});
```

Add these assertions:

```ts
it("keeps the exact legacy request and response while every flag is on", async () => {
  enableSimplifiedCreation();
  (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  (txMock.assessmentTemplate.create as jest.Mock).mockResolvedValue({
    id: "tpl-1",
    alias: "test-template",
  });
  (txMock.assessmentTemplateVersion.create as jest.Mock).mockResolvedValue({
    id: "ver-1",
  });

  const res = await listPOST(
    jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
  );

  await expect(res.json()).resolves.toEqual({
    success: true,
    data: { id: "tpl-1", alias: "test-template" },
  });
});

it("server-owns the exact empty v1 defaults in simplified mode", async () => {
  enableSimplifiedCreation();
  (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  (txMock.assessmentTemplate.create as jest.Mock).mockImplementation(
    ({ data }: { data: { alias: string } }) => ({
      id: "tpl-1",
      alias: data.alias,
    }),
  );
  (txMock.assessmentTemplateVersion.create as jest.Mock).mockResolvedValue({
    id: "ver-1",
  });

  const res = await listPOST(
    jsonReq("http://localhost/api/admin/assessment-templates", {
      creationMode: "simplified",
      name: "Test Template",
    }) as never,
  );

  expect(res.status).toBe(201);
  await expect(res.json()).resolves.toEqual({
    success: true,
    data: {
      id: "tpl-1",
      alias: "test-template",
      versionId: "ver-1",
    },
  });
  expect(txMock.assessmentTemplateVersion.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        language: "enUS",
        questions: [],
        sections: [],
        scoringConfig: {
          tierMetric: "countAchieved",
          passThreshold: 0,
          tiers: [],
        },
        publishedAt: null,
      }),
    }),
  );
  expect(txMock.assessmentTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        name: "Test Template",
        alias: "test-template",
        description: null,
        invitationSubject: "You're invited to take an assessment",
        aggregationMode: "FULL_VISIBILITY",
      }),
    }),
  );
});
```

Add a generated-collision test whose transaction rejects with `P2002` twice
and succeeds on the third attempt. Assert one rate-limit call, three transaction
calls, attempted aliases `test-template`, `test-template-2`,
`test-template-3`, one audit, and final alias `test-template-3`.

Add a manual-ID collision test:

```ts
const res = await listPOST(
  jsonReq("http://localhost/api/admin/assessment-templates", {
    creationMode: "simplified",
    name: "Test Template",
    internalId: "my-stable-id",
  }) as never,
);
expect(res.status).toBe(409);
expect(db.$transaction).toHaveBeenCalledTimes(1);
```

Add tests proving:

- simplified mode is rejected before a transaction when any prerequisite or
  the release flag is off/killed;
- malformed simplified requests reject unknown keys and invalid manual IDs;
- 25 generated collisions stop with `409`, not an unbounded loop;
- a non-unique transaction error returns `500` and writes no audit;
- the existing `401`, `403`, `400`, legacy `409`, content-hash, transaction,
  and audit assertions remain green.

- [ ] **Step 2: Run the create-route tests and verify RED**

```bash
npx jest src/__tests__/api/admin/assessment-templates/templates-crud.test.ts --runInBand
```

Expected: simplified-mode tests fail because the route still requires the
legacy full payload.

- [ ] **Step 3: Add a strict simplified schema and server defaults**

Add:

```ts
const InternalIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const SimplifiedCreateBodySchema = z
  .object({
    creationMode: z.literal("simplified"),
    name: z.string().min(1).max(200).trim(),
    internalId: InternalIdSchema.optional(),
  })
  .strict();

const MAX_GENERATED_INTERNAL_ID_ATTEMPTS = 25;

const SIMPLIFIED_DEFAULTS = {
  description: null,
  invitationSubject: "You're invited to take an assessment",
  invitationBodyMarkdown:
    "Hi {{respondentFirstName}},\n\nYou've been invited to take the {{campaignName}} assessment.\n\n[Start the assessment]({{invitationUrl}})\n\nThe survey closes on {{closeAt}}.",
  aggregationMode: "FULL_VISIBILITY" as const,
  language: "enUS",
  questions: [] as unknown[],
  sections: [] as unknown[],
  scoringConfig: {
    tierMetric: "countAchieved",
    passThreshold: 0,
    tiers: [],
  },
  reportConfig: null,
};
```

After auth and the single rate-limit call, inspect `creationMode`. A simplified
request requires the effective release gate; otherwise return `400` with
`{ success: false, error: "Simplified creation is unavailable" }`. Requests
without the discriminator continue through `CreateTemplateBodySchema`
verbatim.

- [ ] **Step 4: Normalize both branches into the existing transaction input**

For simplified mode, derive:

```ts
const generatedBase = generateTemplateInternalId(parsed.data.name);
if (!parsed.data.internalId && !generatedBase) {
  return NextResponse.json(
    { success: false, error: "Internal ID is required" },
    { status: 400 },
  );
}

const normalized = {
  name: parsed.data.name,
  alias: parsed.data.internalId ?? generatedBase,
  ...SIMPLIFIED_DEFAULTS,
};
```

Legacy `normalized` data remains exactly `CreateTemplateBodySchema.safeParse`
output.

- [ ] **Step 5: Run bounded generated-ID attempts around the existing transaction**

Extract the current transaction body into a local `createOnce(data)` function
that computes the same content hash, creates the same two rows, and returns:

```ts
type NormalizedCreateData = z.infer<typeof CreateTemplateBodySchema>;

async function createOnce(data: NormalizedCreateData) {
  const contentHash = computeTemplateContentHash({
    questions: data.questions,
    sections: data.sections,
    scoringConfig: data.scoringConfig,
    reportConfig: data.reportConfig ?? null,
    invitationSubject: data.invitationSubject,
    invitationBodyMarkdown: data.invitationBodyMarkdown,
  });

  const created = await db.$transaction(async (tx) => {
    const template = await tx.assessmentTemplate.create({
      data: {
        name: data.name,
        alias: data.alias,
        description: data.description ?? null,
        invitationSubject: data.invitationSubject,
        invitationBodyMarkdown: data.invitationBodyMarkdown,
        aggregationMode: data.aggregationMode,
        createdBy: actor.userId,
      },
      select: { id: true, alias: true },
    });
    const version = await tx.assessmentTemplateVersion.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        language: data.language,
        questions: data.questions as Prisma.InputJsonValue,
        sections: data.sections as Prisma.InputJsonValue,
        scoringConfig: data.scoringConfig as Prisma.InputJsonValue,
        reportConfig:
          data.reportConfig === null || data.reportConfig === undefined
            ? Prisma.JsonNull
            : (data.reportConfig as Prisma.InputJsonValue),
        contentHash,
        publishedAt: null,
        publishedBy: null,
      },
    });
    return { template, versionId: version.id };
  });

  return { ...created, contentHash };
}
```

For legacy mode, call it once and preserve the current collision catch. For
simplified mode:

```ts
const manual = parsed.data.internalId !== undefined;
for (
  let attempt = 1;
  attempt <= (manual ? 1 : MAX_GENERATED_INTERNAL_ID_ATTEMPTS);
  attempt += 1
) {
  const alias = manual
    ? parsed.data.internalId!
    : templateInternalIdForAttempt(generatedBase, attempt);
  try {
    created = await createOnce({ ...normalized, alias });
    break;
  } catch (error) {
    if (!isPrismaUniqueError(error)) throw error;
    if (manual || attempt === MAX_GENERATED_INTERNAL_ID_ATTEMPTS) {
      return NextResponse.json(
        { success: false, error: "Internal ID is already in use" },
        { status: 409 },
      );
    }
  }
}
```

Call `logAudit` exactly once after a successful attempt. Return `versionId`
only for simplified mode; build the legacy response object exactly as it is
today. `isPrismaUniqueError` is a local type guard for `code === "P2002"` and
does not broaden the catch.

```ts
function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}
```

- [ ] **Step 6: Run the route tests and verify GREEN**

```bash
npx jest src/__tests__/api/admin/assessment-templates/templates-crud.test.ts --runInBand
```

Expected: PASS, including the exact legacy body with all flags on and off.

- [ ] **Step 7: Commit**

```bash
git add src/src/app/api/admin/assessment-templates/route.ts src/src/__tests__/api/admin/assessment-templates/templates-crud.test.ts
git commit -m "feat: add simplified assessment creation contract"
```

---

### Task 4: Build the name-only creation form

**Files:**

- Create: `src/src/components/admin/SimplifiedAssessmentTemplateForm.tsx`
- Create: `src/src/__tests__/components/admin/simplified-assessment-template-form.test.tsx`

**Interfaces:**

- Produces: `SimplifiedAssessmentTemplateForm`.
- Posts to: `POST /api/admin/assessment-templates`.
- Consumes success data: `{ id: string; alias: string; versionId: string }`.
- Navigates to: `/admin/assessments/templates/{id}/versions/{versionId}/edit?tab=questions`.

- [ ] **Step 1: Write RED tests for identity and the visible surface**

Mock `useRouter` and `global.fetch`. Assert:

```tsx
render(<SimplifiedAssessmentTemplateForm />);

expect(
  screen.getByRole("textbox", { name: "Assessment name" }),
).toBeRequired();
expect(
  screen.getByRole("button", { name: "Advanced" }),
).toHaveAttribute("aria-expanded", "false");
expect(screen.queryByLabelText("Internal ID")).not.toBeInTheDocument();
expect(screen.queryByText(/scoring configuration/i)).not.toBeInTheDocument();
expect(screen.queryByText(/invitation/i)).not.toBeInTheDocument();
```

Open Advanced and verify name-derived IDs:

```tsx
fireEvent.change(screen.getByLabelText("Assessment name"), {
  target: { value: "  Team Health & Growth  " },
});
fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
expect(screen.getByLabelText("Internal ID")).toHaveValue("team-health-growth");
```

Verify generation continues until manual editing, then stops:

```tsx
fireEvent.change(screen.getByLabelText("Internal ID"), {
  target: { value: "team-check" },
});
fireEvent.change(screen.getByLabelText("Assessment name"), {
  target: { value: "Renamed Assessment" },
});
expect(screen.getByLabelText("Internal ID")).toHaveValue("team-check");
```

- [ ] **Step 2: Write RED tests for submit, collision behavior, and failures**

Pin the exact request body:

```ts
expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
  creationMode: "simplified",
  name: "Team Health",
});
```

After manually editing Internal ID, assert the body is exactly:

```ts
{
  creationMode: "simplified",
  name: "Team Health",
  internalId: "team-check",
}
```

Pin the successful redirect:

```ts
expect(pushMock).toHaveBeenCalledWith(
  "/admin/assessments/templates/tpl-1/versions/ver-1/edit?tab=questions",
);
```

For any `409`, assert there is no client retry, Advanced remains open,
`Internal ID` has focus, and the field error reads **That Internal ID is already
in use. Choose another one.** The server has already exhausted generated
suffixes or rejected the manually edited value.

Also assert:

- blank name makes no request and associates an inline error with the name;
- a name that generates an empty ID opens Advanced and focuses Internal ID;
- the button is disabled while a deferred fetch is pending, so a repeated click produces one request;
- `429` preserves both fields and renders retry-later copy;
- a `500`, rejected fetch, or successful body missing `versionId` preserves
  both fields and renders **We couldn't create this assessment. Try again.**

- [ ] **Step 3: Run the component suite and verify RED**

```bash
npx jest src/__tests__/components/admin/simplified-assessment-template-form.test.tsx --runInBand
```

Expected: FAIL because the component does not exist.

- [ ] **Step 4: Implement the focused form and accessible Advanced disclosure**

Import `generateTemplateInternalId`. Use state for `name`, manually edited
`internalId`, `internalIdEdited`, `advancedOpen`, `submitting`, and field/form
errors. While `internalIdEdited` is false, display
`generateTemplateInternalId(name)`; once edited, display the stored manual
value. The disclosure is:

```tsx
<button
  type="button"
  aria-expanded={advancedOpen}
  aria-controls="template-creation-advanced"
  onClick={() => setAdvancedOpen((open) => !open)}
>
  Advanced
</button>
{advancedOpen && (
  <div id="template-creation-advanced">
    <label htmlFor="template-internal-id">Internal ID</label>
    <input
      ref={internalIdRef}
      id="template-internal-id"
      value={
        internalIdEdited ? internalId : generateTemplateInternalId(name)
      }
      maxLength={80}
      aria-invalid={Boolean(internalIdError)}
      aria-describedby={
        internalIdError ? "template-internal-id-error" : undefined
      }
      onChange={(event) => {
        setInternalIdEdited(true);
        setInternalId(event.target.value.toLowerCase());
      }}
    />
  </div>
)}
```

Render only the approved copy and actions:

- heading remains owned by the page;
- one **Assessment name** field with `required` and `maxLength={200}`;
- collapsed **Advanced**;
- **Cancel** link to `/admin/assessments/templates`;
- **Create and start building** submit button.

Render field errors with their referenced IDs and `role="alert"` so validation
and collision failures are announced.

- [ ] **Step 5: Implement one narrow POST**

The core flow is:

```ts
const payload = internalIdEdited
  ? {
      creationMode: "simplified" as const,
      name: name.trim(),
      internalId,
    }
  : {
      creationMode: "simplified" as const,
      name: name.trim(),
    };

const response = await fetch("/api/admin/assessment-templates", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const body = await response.json().catch(() => ({}));

if (response.status === 409) {
  setAdvancedOpen(true);
  setInternalIdError(
    "That Internal ID is already in use. Choose another one.",
  );
  requestAnimationFrame(() => internalIdRef.current?.focus());
  return;
}
if (!response.ok) {
  setFormError(
    response.status === 429
      ? "Too many attempts. Wait a moment and try again."
      : "We couldn't create this assessment. Try again.",
  );
  return;
}
if (
  typeof body.data?.id !== "string" ||
  typeof body.data?.versionId !== "string"
) {
  setFormError("We couldn't create this assessment. Try again.");
  return;
}
router.push(
  `/admin/assessments/templates/${body.data.id}/versions/${body.data.versionId}/edit?tab=questions`,
);
```

Validate `name.trim()` and, when manually edited,
`/^[a-z0-9][a-z0-9-]*$/` before setting `submitting`. If the generated value is
empty, open Advanced and focus the field. Keep the submit button's accessible
name stable and indicate busy state with `aria-busy`.

- [ ] **Step 6: Run the component suite and verify GREEN**

```bash
npx jest src/__tests__/components/admin/simplified-assessment-template-form.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/src/components/admin/SimplifiedAssessmentTemplateForm.tsx src/src/__tests__/components/admin/simplified-assessment-template-form.test.tsx
git commit -m "feat: add name-only assessment creation form"
```

---

### Task 5: Gate the new-template page and preserve the legacy fallback

**Files:**

- Modify: `src/src/app/(dashboard)/admin/assessments/templates/new/page.tsx:1-35`
- Create: `src/src/__tests__/app/admin-new-assessment-template-page.test.tsx`

**Interfaces:**

- Consumes: `isTemplateCreationSimplifiedEnabled()`.
- Active render: approved heading/copy plus `SimplifiedAssessmentTemplateForm`.
- Inactive render: exact current heading/copy plus `AssessmentTemplateForm mode="create"`.

- [ ] **Step 1: Write the page tests**

Mock session, redirect, both form components, and the resolver. Keep auth assertions for unauthenticated, COACH, ADMIN, and STAFF. Use `renderToStaticMarkup` or Testing Library to assert:

```ts
mockIsEnabled.mockReturnValue(false);
const legacy = render(await NewAssessmentTemplatePage());
expect(legacy.getByText("New Assessment Template")).toBeInTheDocument();
expect(legacy.getByTestId("legacy-template-form")).toBeInTheDocument();
expect(legacy.queryByTestId("simplified-template-form")).toBeNull();

mockIsEnabled.mockReturnValue(true);
const simplified = render(await NewAssessmentTemplatePage());
expect(simplified.getByText("Create assessment")).toBeInTheDocument();
expect(
  simplified.getByText(
    "Give it a name. You'll add questions and settings in the editor next.",
  ),
).toBeInTheDocument();
expect(simplified.getByTestId("simplified-template-form")).toBeInTheDocument();
expect(simplified.queryByTestId("legacy-template-form")).toBeNull();
```

- [ ] **Step 2: Run the page test and verify RED**

```bash
npx jest src/__tests__/app/admin-new-assessment-template-page.test.tsx --runInBand
```

Expected: the flag-on surface assertion fails.

- [ ] **Step 3: Add one server-resolved branch after the unchanged auth gate**

```tsx
const simplified = isTemplateCreationSimplifiedEnabled();

return (
  <div className="space-y-6">
    <header className="space-y-1">
      <h1 className="text-2xl font-bold text-foreground">
        {simplified ? "Create assessment" : "New Assessment Template"}
      </h1>
      {simplified ? (
        <p className="text-sm text-muted-foreground">
          Give it a name. You&apos;ll add questions and settings in the editor
          next.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Define metadata + paste the content JSON (questions, sections,
          scoringConfig). A first draft version is created automatically — you
          can publish it once you&apos;re ready.
        </p>
      )}
    </header>
    {simplified ? (
      <SimplifiedAssessmentTemplateForm />
    ) : (
      <AssessmentTemplateForm mode="create" />
    )}
  </div>
);
```

- [ ] **Step 4: Run page and form suites**

```bash
npx jest \
  src/__tests__/app/admin-new-assessment-template-page.test.tsx \
  src/__tests__/components/admin/simplified-assessment-template-form.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/src/app/(dashboard)/admin/assessments/templates/new/page.tsx' src/src/__tests__/app/admin-new-assessment-template-page.test.tsx
git commit -m "feat: route new assessments into the editor"
```

---

### Task 6: Create the Scoring & Tiers copy adapter

**Files:**

- Modify: `src/src/lib/assessments/scoring.ts:1125-1210`
- Modify: `src/src/__tests__/lib/assessments/scoring.test.ts`
- Create: `src/src/components/admin/template-editor/scoring-tier-copy.ts`
- Create: `src/src/__tests__/components/admin/template-editor/scoring-tier-copy.test.ts`

**Interfaces:**

- Produces: `FRIENDLY_SCORING_COPY`.
- Produces: `TierMetricKey = "countAchieved" | "overallTotal" | "overallAvg"`.
- Produces: `friendlyMetricLabel(metric: TierMetricKey): string`.
- Produces: `formatFriendlyTilingIssue(issue: TierTilingIssue, surfaceLabel: string): string`.
- Adds stable `TierTilingIssueCode` identifiers while preserving every current
  path, message, detail, and validation decision.
- Does not translate, reshape, or export stored scoring payloads.

- [ ] **Step 1: Write failing adapter tests**

```ts
expect(friendlyMetricLabel("countAchieved")).toBe("Questions passed");
expect(friendlyMetricLabel("overallTotal")).toBe("Sum of all answers");
expect(friendlyMetricLabel("overallAvg")).toBe(
  "Average across all questions",
);
```

Construct structured issues using the real `TierTilingIssue` shape and assert:

```ts
expect(
  formatFriendlyTilingIssue(
    {
      code: "FIRST_RANGE_START",
      path: [0, "minMetric"],
      message: "first tier minMetric must equal domain min (0); got 1",
      details: {
        reason: "first tier minMetric must equal domain min",
        domainMin: 0,
        firstTierMin: 1,
      },
    },
    "Overall result tiers",
  ),
).toBe("Overall result tiers: the first range must start at 0.");
```

Cover empty tiers, an early open-ended tier, a gap, an overlap, and a last range that ends before/after the possible maximum. Assert returned strings contain none of `minMetric`, `maxMetric`, `domain min`, or `tier resolution`.

- [ ] **Step 2: Add RED engine assertions for stable issue codes**

Use `validateTierTiling` directly and assert the six existing outcomes return:

```ts
[
  "EMPTY_TIERS",
  "FIRST_RANGE_START",
  "EARLY_NO_MAXIMUM",
  "RANGE_GAP",
  "RANGE_OVERLAP",
  "LAST_RANGE_END",
]
```

Each fixture must continue asserting its pre-existing `message`, `path`, and
`details`; the code is additive, not a replacement.

- [ ] **Step 3: Run the adapter and scoring tests and verify RED**

```bash
npx jest \
  src/__tests__/components/admin/template-editor/scoring-tier-copy.test.ts \
  src/__tests__/lib/assessments/scoring.test.ts \
  --runInBand
```

Expected: FAIL because the adapter and stable issue codes do not exist.

- [ ] **Step 4: Add stable issue codes to the canonical validator**

```ts
export type TierTilingIssueCode =
  | "EMPTY_TIERS"
  | "FIRST_RANGE_START"
  | "EARLY_NO_MAXIMUM"
  | "RANGE_GAP"
  | "RANGE_OVERLAP"
  | "LAST_RANGE_END";

export interface TierTilingIssue {
  code: TierTilingIssueCode;
  path: (string | number)[];
  message: string;
  details: Record<string, unknown>;
}
```

Add the matching `code` to each existing `issues.push` in
`validateTierTiling`. For the adjacency branch, choose `RANGE_GAP` when
`b.minMetric > expectedNextMin`, otherwise `RANGE_OVERLAP`. Do not change any
existing condition, message, path, or details field.

- [ ] **Step 5: Implement the fixed copy map and code-based formatter**

```ts
import type { TierTilingIssue } from "@/lib/assessments/scoring";

export const FRIENDLY_SCORING_COPY = {
  title: "How results are calculated",
  metricLabel: "Overall result is based on",
  passThresholdLabel: "A question passes at",
  overallTiers: "Overall result tiers",
  areaTiers: "Results by area",
  exampleResult: "Example result",
  publishHelp: "Before you can publish",
  startsAt: "Starts at",
  endsAt: "Ends at",
  resultName: "Result name",
  messageShown: "Message shown",
  noMaximum: "No maximum",
  addTier: "Add tier",
} as const;

const METRIC_LABELS = {
  countAchieved: "Questions passed",
  overallTotal: "Sum of all answers",
  overallAvg: "Average across all questions",
} as const;

export type TierMetricKey = keyof typeof METRIC_LABELS;

export function friendlyMetricLabel(metric: TierMetricKey): string {
  return METRIC_LABELS[metric];
}

function detailString(
  details: Record<string, unknown>,
  key: string,
): string {
  const value = details[key];
  return typeof value === "string" ? value : "";
}

function detailNumber(
  details: Record<string, unknown>,
  key: string,
): number | null {
  const value = details[key];
  return typeof value === "number" ? value : null;
}

export function formatFriendlyTilingIssue(
  issue: TierTilingIssue,
  surfaceLabel: string,
): string {
  if (issue.code === "EMPTY_TIERS") {
    return `${surfaceLabel}: add at least one tier.`;
  }
  if (issue.code === "FIRST_RANGE_START") {
    return `${surfaceLabel}: the first range must start at ${detailNumber(
      issue.details,
      "domainMin",
    )}.`;
  }
  if (issue.code === "EARLY_NO_MAXIMUM") {
    const label = detailString(issue.details, "tierLabel");
    return `${surfaceLabel}: "${label}" can have no maximum only when it is the last range.`;
  }
  if (issue.code === "RANGE_GAP") {
    return `${surfaceLabel}: "${detailString(
      issue.details,
      "tierA",
    )}" ends at ${detailNumber(
      issue.details,
      "aMax",
    )}; "${detailString(
      issue.details,
      "tierB",
    )}" must start at ${detailNumber(issue.details, "expectedNextMin")}.`;
  }
  if (issue.code === "RANGE_OVERLAP") {
    return `${surfaceLabel}: "${detailString(
      issue.details,
      "tierA",
    )}" ends at ${detailNumber(
      issue.details,
      "aMax",
    )}; "${detailString(
      issue.details,
      "tierB",
    )}" starts at ${detailNumber(issue.details, "bMin")}.`;
  }
  if (issue.code === "LAST_RANGE_END") {
    return `${surfaceLabel}: the last range must end at ${detailNumber(
      issue.details,
      "domainMax",
    )} or have no maximum.`;
  }
  return `${surfaceLabel}: adjust the ranges so they cover every possible result.`;
}
```

Switch only on `issue.code` and read numeric/label data from `details`. Do not
parse or display `issue.message`; this prevents engine vocabulary from leaking
into the active UI.

- [ ] **Step 6: Run the adapter and scoring tests and verify GREEN**

```bash
npx jest \
  src/__tests__/components/admin/template-editor/scoring-tier-copy.test.ts \
  src/__tests__/lib/assessments/scoring.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/src/lib/assessments/scoring.ts src/src/__tests__/lib/assessments/scoring.test.ts src/src/components/admin/template-editor/scoring-tier-copy.ts src/src/__tests__/components/admin/template-editor/scoring-tier-copy.test.ts
git commit -m "feat: add plain scoring copy adapter"
```

---

### Task 7: Apply plain language without changing scoring behavior

**Files:**

- Modify: `src/src/components/admin/template-editor/ScoringTiersTab.tsx:82-670`
- Modify: `src/src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx`

**Interfaces:**

- Adds optional prop: `plainLanguageEnabled?: boolean`, default `false`.
- Consumes: `FRIENDLY_SCORING_COPY`, `friendlyMetricLabel`, and `formatFriendlyTilingIssue`.
- Preserves: `onScoringConfigChange(next: ScoringConfigShape)` raw keys and values.

- [ ] **Step 1: Add RED tests for the active copy**

Render with `plainLanguageEnabled` and assert:

```ts
expect(screen.getByText("How results are calculated")).toBeInTheDocument();
expect(
  screen.getByLabelText("Overall result is based on"),
).toBeInTheDocument();
expect(screen.getByRole("option", { name: "Questions passed" })).toHaveValue(
  "countAchieved",
);
expect(
  screen.getByRole("option", { name: "Sum of all answers" }),
).toHaveValue("overallTotal");
expect(
  screen.getByRole("option", { name: "Average across all questions" }),
).toHaveValue("overallAvg");
expect(screen.getByText("Overall result tiers")).toBeInTheDocument();
expect(screen.getByRole("columnheader", { name: "Starts at" })).toBeInTheDocument();
expect(screen.getByPlaceholderText("No maximum")).toBeInTheDocument();
expect(screen.getByText("Before you can publish")).toBeInTheDocument();
expect(screen.getByText("Example result")).toBeInTheDocument();
```

For a domain fixture, assert **Results by area**.

Assert the active container's `textContent` excludes:

```ts
[
  "countAchieved",
  "overallTotal",
  "overallAvg",
  "minMetric",
  "maxMetric",
  "Zod refine",
  "Gap D",
  "D2 extension",
  "Tier Resolution",
  "unbounded",
]
```

Change the select to **Sum of all answers** and assert the callback still contains:

```ts
expect(onChange).toHaveBeenCalledWith(
  expect.objectContaining({ tierMetric: "overallTotal" }),
);
```

- [ ] **Step 2: Add a legacy flag-off pin before implementation**

Render without `plainLanguageEnabled` and retain the current assertions for:

- **Scoring Configuration**
- **Tier Metric**
- raw three-option labels
- **Pass Threshold**
- `minMetric` and `maxMetric`
- **Preview — Tier Resolution**
- **Per-domain tiers**

This is the byte-behavior guard for the existing component.

- [ ] **Step 3: Run the component suite and verify RED only in the new tests**

```bash
npx jest src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx --runInBand
```

Expected: the friendly-copy tests fail; legacy tests pass.

- [ ] **Step 4: Make local validation return stable data once**

Add `plainLanguageEnabled = false` to `ScoringTiersTab` and pass it to
`TierTable`. Do not pass it into `validateTiersClient`. Replace that validator's
message return with:

```ts
type ClientTierIssue =
  | { code: "EMPTY" }
  | { code: "MISSING_COPY" }
  | {
      code: "END_BEFORE_START";
      label: string;
      startsAt: number;
      endsAt: number;
    }
  | { code: "EARLY_NO_MAXIMUM" }
  | {
      code: "RANGE_GAP" | "RANGE_OVERLAP";
      currentLabel: string;
      nextLabel: string;
      currentEndsAt: number;
      nextStartsAt: number;
      expectedNextStart: number;
    };
```

The existing conditions return these codes/data exactly once. Add two pure
formatters:

```ts
function formatLegacyClientIssue(
  issue: ClientTierIssue,
  surfaceLabel: string,
  mode: "integer" | "fractional",
): string {
  switch (issue.code) {
    case "EMPTY":
      return `${surfaceLabel}: add at least one tier.`;
    case "MISSING_COPY":
      return `${surfaceLabel}: every tier needs a label and a message.`;
    case "END_BEFORE_START":
      return `${surfaceLabel}: tier "${issue.label}" max (${issue.endsAt}) is less than min (${issue.startsAt}).`;
    case "EARLY_NO_MAXIMUM":
      return `${surfaceLabel}: only the highest tier may omit max (open-ended).`;
    case "RANGE_GAP":
    case "RANGE_OVERLAP":
      if (mode === "integer") {
        return `${surfaceLabel}: tier "${issue.currentLabel}" ends at ${issue.currentEndsAt}; tier "${issue.nextLabel}" must start at ${issue.expectedNextStart} (no gap, no overlap).`;
      }
      return issue.code === "RANGE_GAP"
        ? `${surfaceLabel}: gap between tier "${issue.currentLabel}" (max ${issue.currentEndsAt}) and tier "${issue.nextLabel}" (min ${issue.nextStartsAt}) — tiers must touch.`
        : `${surfaceLabel}: overlap between tier "${issue.currentLabel}" (max ${issue.currentEndsAt}) and tier "${issue.nextLabel}" (min ${issue.nextStartsAt}).`;
  }
}

function formatFriendlyClientIssue(
  issue: ClientTierIssue,
  surfaceLabel: string,
): string {
  switch (issue.code) {
    case "EMPTY":
      return `${surfaceLabel}: add at least one tier.`;
    case "MISSING_COPY":
      return `${surfaceLabel}: every range needs a result name and message.`;
    case "END_BEFORE_START":
      return `${surfaceLabel}: the range "${issue.label}" ends at ${issue.endsAt}, before it starts at ${issue.startsAt}.`;
    case "EARLY_NO_MAXIMUM":
      return `${surfaceLabel}: only the last range can have no maximum.`;
    case "RANGE_GAP":
      return `${surfaceLabel}: "${issue.currentLabel}" ends at ${issue.currentEndsAt}; "${issue.nextLabel}" must start at ${issue.expectedNextStart}.`;
    case "RANGE_OVERLAP":
      return `${surfaceLabel}: "${issue.currentLabel}" ends at ${issue.currentEndsAt}; "${issue.nextLabel}" starts at ${issue.nextStartsAt}, so the ranges overlap.`;
  }
}
```

The legacy formatter returns the current strings verbatim. The friendly
formatter uses **range**, **starts**, and **ends** and never includes a raw
field name. Select the formatter only after validation:

```ts
const globalIssueData = validateTiersClient(tiers, globalMode);
const globalIssue = globalIssueData
  ? {
      message: plainLanguageEnabled
        ? formatFriendlyClientIssue(
            globalIssueData,
            FRIENDLY_SCORING_COPY.overallTiers,
          )
        : formatLegacyClientIssue(
            globalIssueData,
            "Global tiers",
            globalMode,
          ),
    }
  : null;
```

Use the same pattern for area tiers. This is one validation path and two
presentation adapters, not two validators.

When active:

- render friendly table headings and placeholder;
- render `Add tier`;
- use **Overall result tiers** and **Results by area** as surface labels;
- describe gaps/overlaps with “starts,” “ends,” “score,” and “range”;
- format `validateTierTiling` issues through `formatFriendlyTilingIssue`.
- give each editable cell an `aria-label` such as
  `Starts at for Low`, `Ends at for Low`, `Result name for tier 1`, and
  `Message shown for Low`.

When inactive, render the current strings verbatim.

- [ ] **Step 5: Replace only author-visible copy under the active branch**

Use the approved active text:

```tsx
<h3>{FRIENDLY_SCORING_COPY.title}</h3>
<label htmlFor="tier-metric">
  {FRIENDLY_SCORING_COPY.metricLabel}
</label>
<option value="countAchieved">{friendlyMetricLabel("countAchieved")}</option>
```

The active overall-tier helper is:

> Tiers apply to the whole assessment—not to individual sections. Together, the ranges must cover every possible overall result without gaps.

The active threshold helper says it is used only when **Questions passed** is selected. The active unavailable-band message directs the author to the table without saying “metric,” “open-ended,” or “ambiguous domain.” The example card says it uses middle answers.

Do not change `value`, `onChange`, `TierRow`, `ScoringConfigShape`, `scoreSubmission`, `computeGlobalTierDomain`, `computePerDomainTierContexts`, `validateTierTiling`, or `TierBandBar`.

- [ ] **Step 6: Run scoring tests and verify GREEN**

```bash
npx jest \
  src/__tests__/components/admin/template-editor/scoring-tier-copy.test.ts \
  src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx \
  src/__tests__/lib/assessments/scoring.test.ts \
  src/__tests__/lib/assessments/scoring.wave-u.test.ts \
  src/__tests__/lib/assessments/scoring.wave-v.test.ts \
  src/__tests__/lib/assessments/scoring.wave-w.test.ts \
  --runInBand
```

Expected: PASS; raw stored values still drive callbacks and scoring tests.

- [ ] **Step 7: Commit**

```bash
git add src/src/components/admin/template-editor/ScoringTiersTab.tsx src/src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx
git commit -m "feat: simplify scoring and tier language"
```

---

### Task 8: Wire the same server-resolved flag into the editor

**Files:**

- Modify: `src/src/components/admin/template-editor/TabbedShell.tsx:217-339,422-448,1044-1072`
- Modify: `src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx:20-33,285-307`
- Modify: `src/src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx`

**Interfaces:**

- Adds optional public editor prop: `plainLanguageScoringEnabled?: boolean`.
- Edit page passes `isTemplateCreationSimplifiedEnabled()`.
- `TabbedShell` passes `plainLanguageEnabled={plainLanguageScoringEnabled}` to `ScoringTiersTab`.

- [ ] **Step 1: Write the editor seam test**

Extend the existing `shellProps` fixture to accept `plainLanguageScoringEnabled`. Set `mockSearchParams = new URLSearchParams("tab=scoring")`.

```tsx
render(
  <TemplateEditorTabbed
    {...shellProps(true)}
    plainLanguageScoringEnabled
  />,
);
expect(screen.getByText("How results are calculated")).toBeInTheDocument();
expect(screen.queryByText("Scoring Configuration")).toBeNull();
```

Render again with the prop absent:

```tsx
expect(screen.getByText("Scoring Configuration")).toBeInTheDocument();
expect(screen.queryByText("How results are calculated")).toBeNull();
```

- [ ] **Step 2: Run the seam test and verify RED**

```bash
npx jest src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx --runInBand
```

Expected: the active case still renders legacy copy because the prop is not forwarded.

- [ ] **Step 3: Add the optional prop and one-way forwarding**

In `TabbedShellProps`:

```ts
plainLanguageScoringEnabled?: boolean;
```

Default it to false in the component destructuring and pass:

```tsx
<ScoringTiersTab
  // existing props unchanged
  plainLanguageEnabled={plainLanguageScoringEnabled}
/>
```

Do not combine it with ED10's `ed10Active`; the requested cleanup applies to the existing Scoring & Tiers tab whenever this release is active.

- [ ] **Step 4: Resolve the flag on the version-edit server page**

Import `isTemplateCreationSimplifiedEnabled` and pass:

```tsx
plainLanguageScoringEnabled={isTemplateCreationSimplifiedEnabled()}
```

The client component must never read `process.env`.

- [ ] **Step 5: Run editor and scoring suites**

```bash
npx jest \
  src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx \
  src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx \
  src/__tests__/components/admin/template-editor/ed10-golden-snapshots.test.tsx \
  src/__tests__/components/admin/template-editor/editor-byte-equivalence.test.tsx \
  src/__tests__/components/admin/template-editor/three-pane-parity.test.tsx \
  --runInBand
```

Expected: active scoring copy passes; every existing flag-off golden/parity assertion remains unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/src/components/admin/template-editor/TabbedShell.tsx 'src/src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx' src/src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx
git commit -m "feat: enable simple scoring copy in the editor"
```

---

### Task 9: Prove the creation-to-Build contract

**Files:**

- Test: all files changed in Tasks 1–7
- Inspect without modification: `src/src/components/admin/template-editor/FormsBuilder.tsx`
- Inspect without modification: `src/src/components/admin/template-editor/FormQuestionCard.tsx`
- Inspect without modification: `src/src/components/admin/template-editor/QuestionTypePicker.tsx`
- Inspect without modification: canonical publish-readiness tests under `src/src/__tests__/admin/template-editor/`

**Interfaces:**

- Proves the redirect enters the existing Build tab.
- Proves the existing `QuestionTypePicker` still owns Slider, Short text, Number, and Multiple choice.
- Proves incomplete drafts remain unpublishable through the canonical readiness path.

- [ ] **Step 1: Run the focused creation matrix**

```bash
npx jest \
  src/__tests__/lib/assessments/wave-template-creation-flags.test.ts \
  src/__tests__/lib/assessments/template-internal-id.test.ts \
  src/__tests__/api/admin/assessment-templates/templates-crud.test.ts \
  src/__tests__/app/admin-new-assessment-template-page.test.tsx \
  src/__tests__/components/admin/simplified-assessment-template-form.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run the existing Build/type-picker/readiness matrix**

```bash
npx jest \
  src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx \
  src/__tests__/components/admin/template-editor/QuestionTypePicker.test.tsx \
  src/__tests__/components/admin/template-editor/questions-tab.wave-t.test.tsx \
  src/__tests__/components/admin/template-editor/questions-tab.wave-u.test.tsx \
  src/__tests__/components/admin/template-editor/tabbed-shell-routing.wave-ed10.test.ts \
  src/__tests__/admin/template-editor/publish-readiness.test.ts \
  src/__tests__/admin/template-editor/safe-to-publish-badge.test.tsx \
  src/__tests__/admin/template-editor/safe-to-publish-parity.test.ts \
  src/__tests__/admin/template-editor/safe-to-publish-wiring.test.tsx \
  --runInBand
```

Expected: the four picker types remain available under their existing gates, the empty builder stays graceful, and empty/incomplete drafts remain blocked from publish.

- [ ] **Step 3: Run the complete template-editor test directory**

```bash
npx jest src/__tests__/components/admin/template-editor --runInBand
```

Expected: PASS.

- [ ] **Step 4: Record the checkpoint in the implementation notes**

Record the exact passing suite/test counts for Task 10's changelog receipt. This
task intentionally changes no files: the product reuses the already-tested
Build editor and type picker instead of adding a second integration layer.

---

### Task 10: House verification and source-of-truth receipt

**Files:**

- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Modify: design status in `docs/superpowers/specs/2026-08-06-template-creation-simplification-design.md`

**Interfaces:**

- Produces a local, evidence-backed implementation record.
- Does not set flags, deploy, publish a template, or mutate Production.

- [ ] **Step 1: Run changed-file ESLint**

From `src/`, run:

```bash
npx eslint \
  src/lib/assessments/wave-template-creation-flags.ts \
  src/__tests__/lib/assessments/wave-template-creation-flags.test.ts \
  src/lib/assessments/template-internal-id.ts \
  src/__tests__/lib/assessments/template-internal-id.test.ts \
  src/app/api/admin/assessment-templates/route.ts \
  src/__tests__/api/admin/assessment-templates/templates-crud.test.ts \
  src/components/admin/SimplifiedAssessmentTemplateForm.tsx \
  src/__tests__/components/admin/simplified-assessment-template-form.test.tsx \
  'src/app/(dashboard)/admin/assessments/templates/new/page.tsx' \
  src/__tests__/app/admin-new-assessment-template-page.test.tsx \
  src/components/admin/template-editor/scoring-tier-copy.ts \
  src/__tests__/components/admin/template-editor/scoring-tier-copy.test.ts \
  src/lib/assessments/scoring.ts \
  src/__tests__/lib/assessments/scoring.test.ts \
  src/components/admin/template-editor/ScoringTiersTab.tsx \
  src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx \
  src/components/admin/template-editor/TabbedShell.tsx \
  'src/app/(dashboard)/admin/assessments/templates/[id]/versions/[versionId]/edit/page.tsx' \
  src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx
```

Expected: exit 0 with no errors.

- [ ] **Step 2: Run the migration safety gate**

```bash
node scripts/check-migration-safety.mjs
```

Expected: PASS with no new migration.

- [ ] **Step 3: Run the full targeted release matrix**

```bash
npx jest \
  src/__tests__/lib/assessments/wave-template-creation-flags.test.ts \
  src/__tests__/lib/assessments/template-internal-id.test.ts \
  src/__tests__/api/admin/assessment-templates/templates-crud.test.ts \
  src/__tests__/app/admin-new-assessment-template-page.test.tsx \
  src/__tests__/components/admin/simplified-assessment-template-form.test.tsx \
  src/__tests__/components/admin/template-editor/scoring-tier-copy.test.ts \
  src/__tests__/components/admin/template-editor/ScoringTiersTab.test.tsx \
  src/__tests__/lib/assessments/scoring.test.ts \
  src/__tests__/components/admin/template-editor/tabbed-shell-panels.wave-ed10.test.tsx \
  src/__tests__/components/admin/template-editor/FormsBuilder.test.tsx \
  src/__tests__/components/admin/template-editor/QuestionTypePicker.test.tsx \
  --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run the Turbopack production build**

```bash
CI=true npx next build --turbopack
```

Expected: successful compile, TypeScript completion, and route generation.

- [ ] **Step 5: Perform a local visual smoke with the release active**

Start the app with both ED9/ED10 and the new release enabled in a local environment. Verify:

1. New assessment shows only name plus collapsed Advanced.
2. Advanced contains the generated Internal ID.
3. Create redirects to the exact new v1 Build URL.
4. Empty Build shows its existing message and **+ Add section** action.
5. Add section → add question exposes Slider, Short text, Number, and Multiple choice.
6. Scoring & Tiers contains the approved plain language and none of the forbidden terms.
7. Killing the new release restores the exact legacy creation and scoring surfaces.

Do not perform this smoke against Production and do not publish the draft.

- [ ] **Step 6: Record only observed results**

Prepend a `plans/CHANGELOG.md` entry with local-only status, changed boundaries, exact test/build counts, and explicit non-actions. Update only the `CLAUDE.md` `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor and brief prose. Change the design status to **Implemented locally; pending review** only after every required command has passed.

- [ ] **Step 7: Check the final diff**

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Expected: clean whitespace, only planned files, no Prisma migration, no generated browser artifacts.

- [ ] **Step 8: Commit the verification receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md docs/superpowers/specs/2026-08-06-template-creation-simplification-design.md
git commit -m "docs: record template creation verification"
```

---

## Rollout Boundary

Implementation ends dark. Merging, setting either Vercel environment variable, redeploying, creating a Production draft, publishing a template, or performing a Production smoke requires separate authorization.

When launch is authorized:

1. merge through the protected PR checks;
2. deploy with `WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED=1`;
3. keep `WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL` absent;
4. perform the approved admin creation-to-Build and Scoring & Tiers smoke;
5. record the exact deployment and observed result;
6. roll back by setting `WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL=1` and redeploying.
