# GH #220 Branded Campaign Invitation HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make campaign-authored invitation HTML a sanitized body fragment inside the shared Scaling Up/Coach invitation shell while preserving a dark rollout, safe rollback, accurate authoring state, and read-only activation evidence.

**Architecture:** A small browser-safe policy layer owns URL-token recognition and render-mode selection. The existing strict sanitizer continues to render authored bytes, the current invitation renderer exposes one shared shell composer, and `prepareAssessmentInvitationEmail` remains the only send-time decision point. Server-derived flags drive both API validation and editor copy; a separately invoked read-only audit classifies stored overrides without changing them.

**Tech Stack:** Next.js 16.1.6 App Router, React 19, TypeScript, Prisma/PostgreSQL, Jest and Testing Library, Nodemailer SMTP composition, `sanitize-html`, `htmlparser2`, `tsx`, ESLint, Turbopack.

## Global Constraints

- Re-read `docs/superpowers/specs/2026-08-03-gh-220-invitation-html-branding-design.md` before execution and treat it as the product contract.
- Before writing code, fetch `origin/main`, re-check GH #220, open PRs, remote branches, and tracker #261. Post the implementation claim only if GH #220 is still unclaimed.
- Preserve the active-work boundaries: do not change GH #257 outbox reconciliation, GH #228 report-email branding, or GH #256 Circle image validation.
- Do not change invitation subjects, recipient selection, SMTP failure propagation, reminder credentials, invitation lifecycle, or Coach-image selection.
- Do not add a schema column, Prisma migration, stored-HTML rewrite, browser email preview, production flag mutation, production-data mutation, or synthetic customer invitation.
- Keep `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` as the capability flag.
- Add `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED`; it is explicit-truthy and default-off.
- Raw custom HTML remains capped at 50,000 characters and stored byte-for-byte after validation.
- The strict Coach-safe sanitizer remains the only authority for authored email markup.
- The new trusted shell is composed only after custom content has been interpolated with escaped values and sanitized.
- The Scaling Up CID attachment is present on branded markdown and branded custom-HTML paths, and absent on complete-replacement rollback.
- Existing token-bearing HTML may temporarily use complete replacement only when the new behavior flag is off.
- Existing tokenless HTML must use the branded markdown/template fallback when the new behavior flag is off.
- Production activation remains a separate, explicitly authorized operation after a fresh read-only audit and manual review of every live override.

---

## File Structure

### New files

- `src/src/lib/assessments/invitation-html-policy.ts` — browser-safe URL-token aliases, raw-byte predicates, and pure render-mode selection.
- `src/src/__tests__/lib/assessments/invitation-html-policy.test.ts` — exact alias, whitespace, inert-entity, capability, activation, and rollback matrix.
- `src/src/lib/assessments/invitation-html-editor-copy.ts` — shared browser-safe labels, guidance, and collapsed-summary copy for both campaign editors.
- `src/src/__tests__/lib/assessments/invitation-html-editor-copy.test.ts` — exact product-copy matrix for branded, complete-replacement, retained-fallback, and no-override states.
- `src/src/lib/assessments/invitation-html-override-audit.ts` — pure PII-free classification and report formatting for persisted overrides.
- `src/src/__tests__/lib/assessments/invitation-html-override-audit.test.ts` — counts, lifecycle/mode classification, and output-redaction contract.
- `src/scripts/audit-invitation-html-overrides.ts` — read-only Prisma runner requiring `AUDIT_READONLY_URL`.
- `src/src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx` — Wizard copy, summary, optional/required-token, and rollback draft behavior.
- `src/src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx` — Detail copy, summaries, PATCH omission, validation response, and save confirmations.

### Existing files to modify

- `src/src/lib/assessments/wave-d-feature-flags.ts` and its test — new behavior-flag reader.
- `src/src/lib/assessments/email-html-sanitizer.ts` and its test — import the shared token policy and accept `requireUrlToken`.
- `src/src/app/api/assessment-campaigns/route.ts` and create-route test — flag-aware create validation.
- `src/src/app/api/assessment-campaigns/[id]/route.ts` and detail-route test — flag-aware update validation.
- `src/src/lib/assessments/invitation-email.ts` and its test — expose sanitized fragment rendering, one shell composer, and branded text composition.
- `src/src/services/notifications.ts` and its test — select the render mode once and attach PII-free composition telemetry.
- `src/src/components/assessments/CampaignWizard.tsx` — receive the server-derived behavior flag and disclose the active mode.
- `src/src/components/assessments/CampaignDetail.tsx` — disclose the active mode and preserve retained tokenless HTML during unrelated rollback edits.
- `src/src/app/(portal)/portal/assessments/new/page.tsx` — pass both HTML flags into the Wizard.
- `src/src/app/(portal)/portal/assessments/[id]/page.tsx` — pass both HTML flags into Campaign Detail.
- `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx` — pass both HTML flags into Campaign Detail.
- `src/src/__tests__/app/admin-campaign-detail-page.test.tsx` — extend the feature-flag mock and prop assertion.
- `src/package.json` — add the explicit activation-audit command.
- `docs/specs/v7.6/17d-wave-d-campaign-setup-design.md` — mark the full-replacement contract as flag-conditionally superseded.
- `docs/specs/v7.6/17d-ops-runbook.md` — document dark deploy, audit gate, activation, and rollback.
- `CLAUDE.md` and `plans/CHANGELOG.md` — record the current behavior and dark-release boundary.

---

### Task 1: Browser-safe token and render-mode policy

**Files:**

- Create: `src/src/lib/assessments/invitation-html-policy.ts`
- Create: `src/src/__tests__/lib/assessments/invitation-html-policy.test.ts`
- Modify: `src/src/lib/assessments/wave-d-feature-flags.ts`
- Modify: `src/src/__tests__/lib/assessments/wave-d-feature-flags.test.ts`

**Interfaces:**

- Consumes: `process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED`.
- Produces:

```ts
export const INVITATION_URL_TOKENS: readonly [
  "invitationUrl",
  "invitation_url",
  "assessmentUrl",
  "assessment_url",
];

export function isInvitationUrlTokenName(raw: string): boolean;
export function countInvitationUrlTokens(raw: string): number;
export function hasInvitationUrlToken(raw: string): boolean;
export function isWholeInvitationUrlToken(raw: string): boolean;

export type InvitationHtmlMode =
  | "none"
  | "full_replace"
  | "branded_body"
  | "branded_fallback";

export function resolveInvitationHtmlMode(input: {
  waveDCustomHtmlEnabled: boolean;
  brandedCustomHtmlEnabled: boolean;
  rawHtml: string | null | undefined;
}): InvitationHtmlMode;

export function assessmentInviteBrandedCustomHtmlEnabled(): boolean;
```

- `invitation-html-policy.ts` must not import React, Prisma, `sanitize-html`, `htmlparser2`, Node built-ins, or environment readers.

- [ ] **Step 1: Write the failing policy tests**

Create the test with this matrix:

```ts
import {
  INVITATION_URL_TOKENS,
  countInvitationUrlTokens,
  hasInvitationUrlToken,
  isWholeInvitationUrlToken,
  resolveInvitationHtmlMode,
} from "@/lib/assessments/invitation-html-policy";

describe("invitation HTML URL-token policy", () => {
  it("recognizes every supported alias with lax inner whitespace", () => {
    expect(INVITATION_URL_TOKENS).toEqual([
      "invitationUrl",
      "invitation_url",
      "assessmentUrl",
      "assessment_url",
    ]);
    expect(countInvitationUrlTokens(
      "{{invitationUrl}} {{ invitation_url }} {{assessmentUrl}} {{ assessment_url }}",
    )).toBe(4);
  });

  it("does not resurrect encoded braces or accept partial names", () => {
    expect(hasInvitationUrlToken("&#123;&#123;invitationUrl&#125;&#125;")).toBe(false);
    expect(hasInvitationUrlToken("{{invitationUrlExtra}}")).toBe(false);
  });

  it("requires a token to occupy the whole trimmed value", () => {
    expect(isWholeInvitationUrlToken(" {{ invitationUrl }} ")).toBe(true);
    expect(isWholeInvitationUrlToken("https://x/{{invitationUrl}}")).toBe(false);
  });
});

describe("resolveInvitationHtmlMode", () => {
  it.each([
    [false, false, "<p>{{invitationUrl}}</p>", "none"],
    [false, true, "<p>body</p>", "none"],
    [true, false, "", "none"],
    [true, false, "<p>{{invitationUrl}}</p>", "full_replace"],
    [true, false, "<p>body</p>", "branded_fallback"],
    [true, true, "<p>{{invitationUrl}}</p>", "branded_body"],
    [true, true, "<p>body</p>", "branded_body"],
  ] as const)(
    "capability=%s branded=%s html=%p resolves %s",
    (waveDCustomHtmlEnabled, brandedCustomHtmlEnabled, rawHtml, expected) => {
      expect(resolveInvitationHtmlMode({
        waveDCustomHtmlEnabled,
        brandedCustomHtmlEnabled,
        rawHtml,
      })).toBe(expected);
    },
  );
});
```

- [ ] **Step 2: Run the policy test and verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/lib/assessments/invitation-html-policy.test.ts --runInBand
```

Expected: FAIL because `invitation-html-policy.ts` does not exist.

- [ ] **Step 3: Implement the pure policy**

Use one regex and one normalized-name predicate:

```ts
export const INVITATION_URL_TOKENS = [
  "invitationUrl",
  "invitation_url",
  "assessmentUrl",
  "assessment_url",
] as const;

const URL_TOKEN_STEMS = new Set(["invitationurl", "assessmenturl"]);
const TOKEN_GLOBAL_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function isInvitationUrlTokenName(raw: string): boolean {
  return URL_TOKEN_STEMS.has(raw.toLowerCase().replace(/_/g, ""));
}

export function countInvitationUrlTokens(raw: string): number {
  let count = 0;
  for (const match of raw.matchAll(TOKEN_GLOBAL_RE)) {
    if (isInvitationUrlTokenName(match[1])) count += 1;
  }
  return count;
}

export function hasInvitationUrlToken(raw: string): boolean {
  return countInvitationUrlTokens(raw) > 0;
}

export function isWholeInvitationUrlToken(raw: string): boolean {
  const match = /^\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}$/.exec(raw.trim());
  return match !== null && isInvitationUrlTokenName(match[1]);
}

export type InvitationHtmlMode =
  | "none"
  | "full_replace"
  | "branded_body"
  | "branded_fallback";

export function resolveInvitationHtmlMode(input: {
  waveDCustomHtmlEnabled: boolean;
  brandedCustomHtmlEnabled: boolean;
  rawHtml: string | null | undefined;
}): InvitationHtmlMode {
  const rawHtml =
    typeof input.rawHtml === "string" && input.rawHtml.trim().length > 0
      ? input.rawHtml
      : null;
  if (!input.waveDCustomHtmlEnabled || rawHtml === null) return "none";
  if (input.brandedCustomHtmlEnabled) return "branded_body";
  return hasInvitationUrlToken(rawHtml) ? "full_replace" : "branded_fallback";
}
```

- [ ] **Step 4: Add the default-off behavior-flag test**

Import `assessmentInviteBrandedCustomHtmlEnabled` in the existing flag test and add:

```ts
["ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", assessmentInviteBrandedCustomHtmlEnabled],
```

to `ENABLE_FLAGS`. This reuses the existing `OFF_VALUES` and `ON_VALUES` exact matrix.

- [ ] **Step 5: Run the flag test and verify RED**

Run:

```bash
npx jest src/__tests__/lib/assessments/wave-d-feature-flags.test.ts --runInBand
```

Expected: FAIL because the reader is not exported.

- [ ] **Step 6: Implement the flag reader**

Add to `wave-d-feature-flags.ts`:

```ts
/** GH #220: composes campaign custom HTML inside the branded shell. Default OFF. */
export function assessmentInviteBrandedCustomHtmlEnabled(): boolean {
  return isTruthy(process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED);
}
```

- [ ] **Step 7: Run both focused suites and verify GREEN**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/invitation-html-policy.test.ts \
  src/__tests__/lib/assessments/wave-d-feature-flags.test.ts \
  --runInBand
```

Expected: both suites PASS.

- [ ] **Step 8: Commit the policy boundary**

```bash
git add \
  src/src/lib/assessments/invitation-html-policy.ts \
  src/src/lib/assessments/wave-d-feature-flags.ts \
  src/src/__tests__/lib/assessments/invitation-html-policy.test.ts \
  src/src/__tests__/lib/assessments/wave-d-feature-flags.test.ts
git commit -m "feat(assessments): add invitation HTML mode policy"
```

---

### Task 2: Flag-aware placement validation and campaign APIs

**Files:**

- Modify: `src/src/lib/assessments/email-html-sanitizer.ts`
- Modify: `src/src/__tests__/lib/email-html-sanitizer.test.ts`
- Modify: `src/src/app/api/assessment-campaigns/route.ts`
- Modify: `src/src/app/api/assessment-campaigns/[id]/route.ts`
- Modify: `src/src/__tests__/api/assessment-campaigns/create-invitation-html.test.ts`
- Modify: `src/src/__tests__/api/assessment-campaigns/detail-route.test.ts`

**Interfaces:**

- Consumes:

```ts
hasInvitationUrlToken(raw: string): boolean;
isInvitationUrlTokenName(raw: string): boolean;
isWholeInvitationUrlToken(raw: string): boolean;
assessmentInviteBrandedCustomHtmlEnabled(): boolean;
```

- Produces:

```ts
export function validateInvitationHtml(
  raw: string,
  options?: { requireUrlToken?: boolean },
): { ok: true } | { ok: false; reason: string };
```

- Default behavior remains `requireUrlToken: true`.

- [ ] **Step 1: Add validator policy tests**

Move the `INVITATION_URL_TOKENS` test import to `invitation-html-policy.ts`, keep every existing placement test, and add:

```ts
it("allows zero URL tokens when requireUrlToken is false", () => {
  expect(
    validateInvitationHtml("<h1>Coach-authored body</h1>", {
      requireUrlToken: false,
    }),
  ).toEqual({ ok: true });
});

it("still rejects unsafe placement when requireUrlToken is false", () => {
  const result = validateInvitationHtml(
    '<img src="{{invitationUrl}}" alt="unsafe">',
    { requireUrlToken: false },
  );
  expect(result.ok).toBe(false);
});

it("keeps URL tokens required by default", () => {
  const result = validateInvitationHtml("<p>No URL token</p>");
  expect(result.ok).toBe(false);
});
```

- [ ] **Step 2: Run the sanitizer test and verify RED**

Run:

```bash
npx jest src/__tests__/lib/email-html-sanitizer.test.ts --runInBand
```

Expected: the tokenless opt-in case FAILS under the current required-token contract.

- [ ] **Step 3: Refactor the validator onto the shared policy**

Delete the local token aliases, regex, count, name, and whole-value helpers from `email-html-sanitizer.ts`. Import:

```ts
import {
  countInvitationUrlTokens,
  hasInvitationUrlToken,
  isInvitationUrlTokenName,
  isWholeInvitationUrlToken,
} from "@/lib/assessments/invitation-html-policy";
```

Change the validator entry to:

```ts
export function validateInvitationHtml(
  raw: string,
  options: { requireUrlToken?: boolean } = {},
): ValidationResult {
  const requireUrlToken = options.requireUrlToken ?? true;
  if (requireUrlToken && !hasInvitationUrlToken(raw)) {
    return {
      ok: false,
      reason:
        "Invitation HTML must include the survey link token {{invitationUrl}}.",
    };
  }
  // Retain the existing parser walk and placement errors. Replace its local
  // predicate calls with the imported policy functions.
}
```

The parser must still inspect all occurrences when a token exists; `requireUrlToken: false` only changes the zero-token outcome.

- [ ] **Step 4: Run the sanitizer suite and verify GREEN**

Run:

```bash
npx jest src/__tests__/lib/email-html-sanitizer.test.ts --runInBand
```

Expected: all existing sanitizer/placement tests plus the new policy cases PASS.

- [ ] **Step 5: Add the create and update route tests**

In both API suites, save and restore both flag env vars. Add these concrete
create-route cases:

```ts
it("both flags ON accepts tokenless HTML and stores the raw bytes", async () => {
  process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
  process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED = "1";
  const raw = "<h1>Coach-authored body</h1>";
  const response = await POST(
    jsonReq({ ...validBody, invitationBodyHtml: raw }) as never,
  );
  expect(response.status).toBe(201);
  expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ invitationBodyHtml: raw }),
    }),
  );
});

it("branded mode OFF rejects tokenless HTML without writing", async () => {
  process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
  delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
  const response = await POST(
    jsonReq({
      ...validBody,
      invitationBodyHtml: "<p>No URL token</p>",
    }) as never,
  );
  expect(response.status).toBe(400);
  expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
});

it("both flags ON still rejects a URL token in img src", async () => {
  process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
  process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED = "1";
  const response = await POST(
    jsonReq({
      ...validBody,
      invitationBodyHtml: '<img src="{{invitationUrl}}">',
    }) as never,
  );
  expect(response.status).toBe(400);
  expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
});
```

Add the corresponding concrete update-route cases:

```ts
it("both flags ON accepts tokenless HTML and stores the raw bytes", async () => {
  process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
  process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED = "1";
  draftActorSetup();
  const raw = "<h1>Coach-authored body</h1>";
  const response = await PATCH(
    patchReq({ invitationBodyHtml: raw }) as never,
    detailParams("c1"),
  );
  expect(response.status).toBe(200);
  expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ invitationBodyHtml: raw }),
    }),
  );
});

it("branded mode OFF rejects tokenless HTML without writing", async () => {
  process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
  delete process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED;
  draftActorSetup();
  const response = await PATCH(
    patchReq({ invitationBodyHtml: "<p>No URL token</p>" }) as never,
    detailParams("c1"),
  );
  expect(response.status).toBe(400);
  expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
});

it("both flags ON still rejects a URL token in img src", async () => {
  process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
  process.env.ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED = "1";
  draftActorSetup();
  const response = await PATCH(
    patchReq({ invitationBodyHtml: '<img src="{{invitationUrl}}">' }) as never,
    detailParams("c1"),
  );
  expect(response.status).toBe(400);
  expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run both API suites and verify RED**

Run:

```bash
npx jest \
  src/__tests__/api/assessment-campaigns/create-invitation-html.test.ts \
  src/__tests__/api/assessment-campaigns/detail-route.test.ts \
  --runInBand
```

Expected: branded-mode tokenless create and update return 400.

- [ ] **Step 7: Pass the validation policy from both routes**

Import `assessmentInviteBrandedCustomHtmlEnabled` alongside the existing Wave-D reader and replace both validator calls with:

```ts
const placement = validateInvitationHtml(rawHtml, {
  requireUrlToken: !assessmentInviteBrandedCustomHtmlEnabled(),
});
```

Do not change the capability-off ignore behavior, length limit, raw-byte storage, or 400/no-write path.

- [ ] **Step 8: Run the validator and API suites and verify GREEN**

Run:

```bash
npx jest \
  src/__tests__/lib/email-html-sanitizer.test.ts \
  src/__tests__/api/assessment-campaigns/create-invitation-html.test.ts \
  src/__tests__/api/assessment-campaigns/detail-route.test.ts \
  --runInBand
```

Expected: all three suites PASS.

- [ ] **Step 9: Commit validation and API behavior**

```bash
git add \
  src/src/lib/assessments/email-html-sanitizer.ts \
  src/src/__tests__/lib/email-html-sanitizer.test.ts \
  src/src/app/api/assessment-campaigns/route.ts \
  'src/src/app/api/assessment-campaigns/[id]/route.ts' \
  src/src/__tests__/api/assessment-campaigns/create-invitation-html.test.ts \
  src/src/__tests__/api/assessment-campaigns/detail-route.test.ts
git commit -m "feat(assessments): allow branded custom HTML fragments"
```

---

### Task 3: Sanitized fragment, shared shell, and branded plain text

**Files:**

- Modify: `src/src/lib/assessments/invitation-email.ts`
- Modify: `src/src/__tests__/lib/assessments/invitation-email.test.ts`

**Interfaces:**

- Consumes: the existing `InvitationVars`, `InvitationChrome`, escaped token interpolation, strict `sanitizeEmailHtml`, `safeImageSrc`, and `SU_LOGO_CID`.
- Produces:

```ts
export function renderCustomHtmlFragment(
  rawHtml: string,
  vars: InvitationVars,
): string;

export function renderFullHtmlBody(
  rawHtml: string,
  vars: InvitationVars,
): string;

export function buildInvitationEmailShell(input: {
  bodyHtml: string;
  vars: InvitationVars;
  chrome?: InvitationChrome;
}): string;

export function renderBrandedCustomHtmlText(
  sanitizedFragment: string,
  vars: InvitationVars,
): string;
```

- `renderFullHtmlBody` remains an exported compatibility wrapper over `renderCustomHtmlFragment`.
- `buildInvitationEmailHtml` remains public and delegates to `buildInvitationEmailShell`.

- [ ] **Step 1: Add shared-shell and text tests**

Extend the renderer suite:

```ts
it("wraps one sanitized custom fragment in the same branded shell", () => {
  const fragment = renderCustomHtmlFragment(
    '<p onclick="bad()">Coach body {{respondentFirstName}}</p><script>bad()</script>',
    baseVars,
  );
  const custom = buildInvitationEmailShell({
    bodyHtml: fragment,
    vars: baseVars,
    chrome: "legacy",
  });
  const markdown = buildInvitationEmailHtml({
    bodyMarkdown: "Coach body {{respondentFirstName}}",
    vars: baseVars,
    chrome: "legacy",
  });

  for (const marker of [
    "cid:su-logo",
    "Start the assessment",
    "If the button doesn't work",
    "&mdash; Scaling Up Platform",
  ]) {
    expect(custom).toContain(marker);
    expect(markdown).toContain(marker);
  }
  expect(custom).toContain("Coach body Jane");
  expect(custom).not.toContain("onclick");
  expect(custom).not.toContain("<script");
});

it("keeps Wave-P Coach-logo ordering and invalid-image degradation", () => {
  const fragment = renderCustomHtmlFragment("<p>Body</p>", baseVars);
  const withLogo = buildInvitationEmailShell({
    bodyHtml: fragment,
    vars: { ...baseVars, coachLogoUrl: "https://cdn.test/coach.png" },
    chrome: "waveP",
  });
  expect(withLogo.indexOf("cid:su-logo")).toBeLessThan(
    withLogo.indexOf("https://cdn.test/coach.png"),
  );

  const rejected = buildInvitationEmailShell({
    bodyHtml: fragment,
    vars: { ...baseVars, coachLogoUrl: "javascript:bad()" },
    chrome: "waveP",
  });
  expect(rejected).not.toContain("javascript:");
  expect(rejected).toContain("Start the assessment");
});

it("builds a branded text twin from the same sanitized fragment", () => {
  const fragment = renderCustomHtmlFragment(
    '<h1>Hello {{respondentFirstName}}</h1><a href="{{invitationUrl}}">Open</a>',
    baseVars,
  );
  expect(renderBrandedCustomHtmlText(fragment, baseVars)).toBe(
    [
      "Scaling Up Platform",
      "Coach: Pat Coach",
      "",
      "Hello Jane",
      "Open",
      "",
      `Start the assessment: ${baseVars.invitationUrl}`,
    ].join("\n"),
  );
});

it("omits the Coach line and still emits the canonical URL for empty fragments", () => {
  const vars = { ...baseVars, coachName: null };
  const text = renderBrandedCustomHtmlText("", vars);
  expect(text).toContain("Scaling Up Platform");
  expect(text).not.toContain("Coach:");
  expect(text).toContain(`Start the assessment: ${vars.invitationUrl}`);
});
```

Also retain the legacy full-replacement tests, including escaped PII, inert encoded braces, href-only URL recovery, sanitizer behavior, and subject credential exclusion.

- [ ] **Step 2: Run the renderer suite and verify RED**

Run:

```bash
npx jest src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
```

Expected: FAIL because the three new exports do not exist.

- [ ] **Step 3: Expose the sanitized-fragment semantic**

Replace the old implementation body with:

```ts
export function renderCustomHtmlFragment(
  rawHtml: string,
  vars: InvitationVars,
): string {
  const values = buildEscapedTokenValues(vars);
  return sanitizeEmailHtml(interpolateTokens(rawHtml, values));
}

export function renderFullHtmlBody(
  rawHtml: string,
  vars: InvitationVars,
): string {
  return renderCustomHtmlFragment(rawHtml, vars);
}
```

Keep `renderFullTextBody` for the rollback complete-replacement path.

- [ ] **Step 4: Extract the shared shell without changing its markup**

Move the current shell body into:

```ts
export function buildInvitationEmailShell(input: {
  bodyHtml: string;
  vars: InvitationVars;
  chrome?: InvitationChrome;
}): string {
  const { bodyHtml, vars } = input;
  const waveP = (input.chrome ?? "legacy") === "waveP";
  // Keep the existing org line, Coach logo, CTA sizing, colors, CID header,
  // fallback URL, and footer byte-for-byte.
}
```

Then make markdown composition:

```ts
export function buildInvitationEmailHtml(input: {
  bodyMarkdown: string;
  vars: InvitationVars;
  chrome?: InvitationChrome;
}): string {
  return buildInvitationEmailShell({
    bodyHtml: renderHtmlBody(input.bodyMarkdown, input.vars),
    vars: input.vars,
    chrome: input.chrome,
  });
}
```

Do not sanitize the trusted shell and do not pass unsanitized authored bytes to it.

- [ ] **Step 5: Add branded custom-HTML plain text**

Extract the existing sanitized-HTML-to-text transformations into a private `htmlFragmentToText(sanitizedFragment: string)` helper. Keep `renderFullTextBody` behavior intact, then add:

```ts
export function renderBrandedCustomHtmlText(
  sanitizedFragment: string,
  vars: InvitationVars,
): string {
  const lines = ["Scaling Up Platform"];
  const coachName = (vars.coachName ?? "").trim();
  if (coachName.length > 0) lines.push(`Coach: ${coachName}`);
  const bodyText = htmlFragmentToText(sanitizedFragment);
  if (bodyText.length > 0) lines.push("", bodyText);
  lines.push("", `Start the assessment: ${vars.invitationUrl}`);
  return lines.join("\n");
}
```

Always append the platform URL, even if the fragment text already contains it.

- [ ] **Step 6: Run the renderer suite and verify GREEN**

Run:

```bash
npx jest src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
```

Expected: all shell, custom HTML, plain text, subject, and security cases PASS.

- [ ] **Step 7: Commit the renderer boundary**

```bash
git add \
  src/src/lib/assessments/invitation-email.ts \
  src/src/__tests__/lib/assessments/invitation-email.test.ts
git commit -m "refactor(assessments): share invitation email shell"
```

---

### Task 4: Send-time render selection, attachments, and telemetry

**Files:**

- Modify: `src/src/services/notifications.ts`
- Modify: `src/src/__tests__/services/notifications.test.ts`

**Interfaces:**

- Consumes:

```ts
resolveInvitationHtmlMode(input): InvitationHtmlMode;
assessmentInviteBrandedCustomHtmlEnabled(): boolean;
renderCustomHtmlFragment(rawHtml, vars): string;
buildInvitationEmailShell({ bodyHtml, vars, chrome }): string;
renderBrandedCustomHtmlText(sanitizedFragment, vars): string;
```

- Produces PII-free metadata:

```ts
customHtmlMode?: "full_replace" | "branded_body";
customHtmlFallbackReason?: "branded_mode_disabled_missing_url_token";
```

- [ ] **Step 1: Replace the custom-HTML tests with the complete mode matrix**

Save and restore both env vars. Add focused cases:

```ts
it.each([
  ["wave D off", false, false, "<p>{{invitationUrl}}</p>", "branded"],
  ["empty HTML", true, true, "   ", "branded"],
  ["legacy token body", true, false, "<p>{{invitationUrl}}</p>", "full_replace"],
  ["rollback tokenless body", true, false, "<p>Coach body</p>", "branded_fallback"],
  ["branded token body", true, true, "<p>{{invitationUrl}}</p>", "branded_body"],
  ["branded tokenless body", true, true, "<p>Coach body</p>", "branded_body"],
] as const)(
  "%s selects the expected mode",
  async (_label, waveD, brandedMode, invitationBodyHtml, expected) => {
    setEnvFlag("WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", waveD);
    setEnvFlag("ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED", brandedMode);
    await sendAssessmentInvitationEmail({
      ...baseData(),
      invitationBodyHtml,
    });
    const options = mockSendEmailViaSMTP.mock.calls[0][0];

    if (expected === "full_replace") {
      expect(options.html).not.toContain("cid:su-logo");
      expect(options.attachments ?? []).toHaveLength(0);
      expect(options.telemetry.metadata).toMatchObject({
        renderer: "custom_html",
        bodySource: "custom_html",
        customHtmlMode: "full_replace",
      });
    } else if (expected === "branded_body") {
      expect(options.html).toContain("cid:su-logo");
      expect(options.html).toContain("Start the assessment");
      expect(options.attachments).toEqual(
        expect.arrayContaining([expect.objectContaining({ cid: "su-logo" })]),
      );
      expect(options.telemetry.metadata).toMatchObject({
        renderer: "custom_html",
        bodySource: "custom_html",
        customHtmlMode: "branded_body",
      });
    } else {
      expect(options.html).toContain("cid:su-logo");
      expect(options.telemetry.metadata.renderer).toBe("branded");
    }
  },
);
```

Implement `setEnvFlag` in the test as:

```ts
function setEnvFlag(name: string, enabled: boolean): void {
  if (enabled) process.env[name] = "1";
  else delete process.env[name];
}
```

Add exact assertions for:

```ts
expect(fallback.telemetry.metadata).toMatchObject({
  renderer: "branded",
  bodySource: "authored",
  customHtmlFallbackReason:
    "branded_mode_disabled_missing_url_token",
});
expect(JSON.stringify(fallback.telemetry.metadata)).not.toContain("#t=");
expect(JSON.stringify(fallback.telemetry.metadata)).not.toContain("Coach body");
```

Add branded-body cases for an empty sanitized fragment, legacy duplicate authored URL plus platform CTA, Wave-P valid/invalid Coach image, href-only custom URL in plain text, optional Coach text line, script/iframe/event/unsafe-style stripping, PII markup injection, and unchanged subject credential exclusion.

- [ ] **Step 2: Run the notification suite and verify RED**

Run:

```bash
npx jest src/__tests__/services/notifications.test.ts --runInBand
```

Expected: branded-body and tokenless rollback cases fail under complete replacement.

- [ ] **Step 3: Resolve one render mode at the send chokepoint**

Update imports and replace the `fullHtml` branch with:

```ts
const rawCustomHtml =
  typeof data.invitationBodyHtml === "string" &&
  data.invitationBodyHtml.trim().length > 0
    ? data.invitationBodyHtml
    : null;

const customHtmlMode = resolveInvitationHtmlMode({
  waveDCustomHtmlEnabled: waveDCustomHtmlEmailEnabled(),
  brandedCustomHtmlEnabled: assessmentInviteBrandedCustomHtmlEnabled(),
  rawHtml: rawCustomHtml,
});

let html: string;
let text: string;
let attachments: SmtpAttachment[] = [{
  filename: "su-logo.png",
  content: SU_LOGO_PNG,
  contentType: "image/png",
  cid: SU_LOGO_CID,
}];

if (customHtmlMode === "full_replace" && rawCustomHtml !== null) {
  html = renderFullHtmlBody(rawCustomHtml, vars);
  text = renderFullTextBody(rawCustomHtml, vars);
  attachments = [];
} else if (customHtmlMode === "branded_body" && rawCustomHtml !== null) {
  const fragment = renderCustomHtmlFragment(rawCustomHtml, vars);
  html = buildInvitationEmailShell({
    bodyHtml: fragment,
    vars,
    chrome: data.chrome ?? "legacy",
  });
  text = renderBrandedCustomHtmlText(fragment, vars);
} else {
  html = buildInvitationEmailHtml({
    bodyMarkdown: effectiveBodyMarkdown,
    vars,
    chrome: data.chrome ?? "legacy",
  });
  text = renderTextBody(effectiveBodyMarkdown, vars);
}
```

- [ ] **Step 4: Emit compatible PII-free metadata**

Use:

```ts
const customHtmlRendered =
  customHtmlMode === "full_replace" || customHtmlMode === "branded_body";
const renderer: "branded" | "custom_html" =
  customHtmlRendered ? "custom_html" : "branded";
const effectiveBodySource: "authored" | "default" | "custom_html" =
  customHtmlRendered ? "custom_html" : bodySource;

const customHtmlMetadata =
  customHtmlMode === "full_replace" || customHtmlMode === "branded_body"
    ? { customHtmlMode }
    : customHtmlMode === "branded_fallback"
      ? {
          customHtmlFallbackReason:
            "branded_mode_disabled_missing_url_token" as const,
        }
      : {};
```

Spread `customHtmlMetadata` inside the existing telemetry metadata. Do not add raw HTML, rendered HTML, invitation URL, campaign name, email address, or Coach image URL.

- [ ] **Step 5: Run renderer and notification suites and verify GREEN**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/invitation-email.test.ts \
  src/__tests__/services/notifications.test.ts \
  --runInBand
```

Expected: both suites PASS and the SMTP failure propagation tests remain unchanged.

- [ ] **Step 6: Commit send orchestration**

```bash
git add \
  src/src/services/notifications.ts \
  src/src/__tests__/services/notifications.test.ts
git commit -m "feat(assessments): brand campaign invitation HTML"
```

---

### Task 5: Mode-accurate Campaign Wizard

**Files:**

- Modify: `src/src/components/assessments/CampaignWizard.tsx`
- Modify: `src/src/app/(portal)/portal/assessments/new/page.tsx`
- Create: `src/src/lib/assessments/invitation-html-editor-copy.ts`
- Create: `src/src/__tests__/lib/assessments/invitation-html-editor-copy.test.ts`
- Create: `src/src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx`

**Interfaces:**

- Consumes:

```ts
assessmentInviteBrandedCustomHtmlEnabled(): boolean;
resolveInvitationHtmlMode(input): InvitationHtmlMode;
hasInvitationUrlToken(raw: string): boolean;
```

- Produces:

```ts
export function invitationOverrideSummary(input: {
  htmlMode: InvitationHtmlMode;
  hasSubjectOrMarkdown: boolean;
  emptySummary: string;
}): string;

export function invitationHtmlEditorCopy(input: {
  brandedCustomHtmlEnabled: boolean;
  htmlMode: InvitationHtmlMode;
}): {
  label: "Custom HTML body (advanced)" | "Full custom HTML (advanced)";
  description: string;
  validationError: string | null;
};

export function invitationSaveConfirmation(input: {
  htmlMode: InvitationHtmlMode;
  hasSubjectOrMarkdown: boolean;
}): string;
```

- Adds to `CampaignWizard` and `ReviewStep` props:

```ts
brandedCustomHtmlEnabled?: boolean;
```

- The prop defaults to `false`; client components never read `process.env`.

- [ ] **Step 1: Write the shared editor-copy tests**

Create:

```ts
import {
  invitationHtmlEditorCopy,
  invitationOverrideSummary,
  invitationSaveConfirmation,
} from "@/lib/assessments/invitation-html-editor-copy";

describe("invitationOverrideSummary", () => {
  it.each([
    ["branded_body", "Branded custom HTML body set for this campaign"],
    ["full_replace", "Full custom HTML replaces the branded email"],
    [
      "branded_fallback",
      "Custom HTML retained but inactive — branded template fallback will send",
    ],
  ] as const)("maps %s to exact product copy", (htmlMode, expected) => {
    expect(invitationOverrideSummary({
      htmlMode,
      hasSubjectOrMarkdown: false,
      emptySummary: "Using template default",
    })).toBe(expected);
  });

  it("preserves subject/markdown and empty summaries when HTML is unused", () => {
    expect(invitationOverrideSummary({
      htmlMode: "none",
      hasSubjectOrMarkdown: true,
      emptySummary: "Using template default",
    })).toBe("Custom subject/body set for this campaign");
    expect(invitationOverrideSummary({
      htmlMode: "none",
      hasSubjectOrMarkdown: false,
      emptySummary: "Using template default",
    })).toBe("Using template default");
  });
});

describe("invitationHtmlEditorCopy", () => {
  it("describes branded HTML as a body and makes the URL token optional", () => {
    expect(invitationHtmlEditorCopy({
      brandedCustomHtmlEnabled: true,
      htmlMode: "none",
    })).toEqual({
      label: "Custom HTML body (advanced)",
      description:
        "Scaling Up branding, available Coach identity, the assessment button/link, and the footer are added automatically. This HTML replaces only the markdown body. {{invitationUrl}} is optional; the same merge tokens above are available.",
      validationError: null,
    });
  });

  it("describes retained tokenless HTML as inactive during rollback", () => {
    expect(invitationHtmlEditorCopy({
      brandedCustomHtmlEnabled: false,
      htmlMode: "branded_fallback",
    }).description).toBe(
      "This custom HTML is retained but inactive. The branded markdown/template fallback will send. Add {{invitationUrl}} to edit it as a full replacement, or clear it.",
    );
    expect(invitationHtmlEditorCopy({
      brandedCustomHtmlEnabled: false,
      htmlMode: "branded_fallback",
    }).validationError).toBe(
      "Full custom HTML must include {{invitationUrl}} or be cleared.",
    );
  });
});

describe("invitationSaveConfirmation", () => {
  it.each([
    ["branded_body", false, "Branded custom HTML body saved."],
    ["full_replace", false, "Full custom HTML replacement saved."],
    [
      "branded_fallback",
      false,
      "Custom HTML retained but inactive — branded template fallback will send.",
    ],
    ["none", true, "New campaign overrides applied."],
    ["none", false, "Using template default."],
  ] as const)(
    "maps %s with subject/markdown=%s",
    (htmlMode, hasSubjectOrMarkdown, expected) => {
      expect(invitationSaveConfirmation({
        htmlMode,
        hasSubjectOrMarkdown,
      })).toBe(expected);
    },
  );
});
```

- [ ] **Step 2: Run the editor-copy test and verify RED**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/invitation-html-editor-copy.test.ts \
  --runInBand
```

Expected: FAIL because the shared copy module does not exist.

- [ ] **Step 3: Implement the shared editor copy**

Use the exact strings asserted above and this summary function:

```ts
export function invitationOverrideSummary(input: {
  htmlMode: InvitationHtmlMode;
  hasSubjectOrMarkdown: boolean;
  emptySummary: string;
}): string {
  if (input.htmlMode === "branded_body") {
    return "Branded custom HTML body set for this campaign";
  }
  if (input.htmlMode === "full_replace") {
    return "Full custom HTML replaces the branded email";
  }
  if (input.htmlMode === "branded_fallback") {
    return "Custom HTML retained but inactive — branded template fallback will send";
  }
  return input.hasSubjectOrMarkdown
    ? "Custom subject/body set for this campaign"
    : input.emptySummary;
}
```

For `invitationHtmlEditorCopy`, return the branded description asserted above
whenever `brandedCustomHtmlEnabled` is true. When false and `htmlMode` is
`"branded_fallback"`, return the retained/inactive description asserted above.
For the remaining false cases return label `"Full custom HTML (advanced)"` and
the existing exact complete-replacement warning:

```text
When set, this HTML replaces the entire branded email (no template wrap). It must include the survey link token {{invitationUrl}} either as a link href or as plain text. The same merge tokens above are available.
```

Return `validationError:
"Full custom HTML must include {{invitationUrl}} or be cleared."` only for
`"branded_fallback"`; return `null` for branded-body, full-replacement, and
empty modes.

Implement `invitationSaveConfirmation` as:

```ts
export function invitationSaveConfirmation(input: {
  htmlMode: InvitationHtmlMode;
  hasSubjectOrMarkdown: boolean;
}): string {
  if (input.htmlMode === "branded_body") {
    return "Branded custom HTML body saved.";
  }
  if (input.htmlMode === "full_replace") {
    return "Full custom HTML replacement saved.";
  }
  if (input.htmlMode === "branded_fallback") {
    return "Custom HTML retained but inactive — branded template fallback will send.";
  }
  return input.hasSubjectOrMarkdown
    ? "New campaign overrides applied."
    : "Using template default.";
}
```

- [ ] **Step 4: Create the Wizard UI tests**

Copy `installFetch` and the existing Wizard fixtures, then define this
flag-aware navigation helper in the new test:

```ts
async function advanceToReviewPanel(props: {
  brandedCustomHtmlEnabled: boolean;
}): Promise<void> {
  installFetch();
  render(
    <CampaignWizard
      customHtmlEmailEnabled
      brandedCustomHtmlEnabled={props.brandedCustomHtmlEnabled}
      autoSend={false}
    />,
  );

  fireEvent.click(await screen.findByRole("radio", { name: /acme corp/i }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.click(await screen.findByRole("radio", {
    name: /rockefeller habits/i,
  }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.click(await screen.findByRole("checkbox", {
    name: /alice smith/i,
  }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.change(await screen.findByLabelText(/campaign name/i), {
    target: { value: "Q3 Test Campaign" },
  });
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  fireEvent.click(await screen.findByTestId("email-overrides-toggle"));
}
```

Then cover:

```ts
await advanceToReviewPanel({ brandedCustomHtmlEnabled: true });

expect(screen.getByText("Custom HTML body (advanced)")).toBeInTheDocument();
expect(screen.getByText(/branding.*Coach identity.*button\/link.*footer/i))
  .toBeInTheDocument();
expect(screen.getByText(/replaces only the markdown body/i)).toBeInTheDocument();
expect(screen.getByText(/invitationUrl.*optional/i)).toBeInTheDocument();
```

Then set HTML and collapse the panel:

```ts
fireEvent.change(screen.getByTestId("invitation-html-input"), {
  target: { value: "<p>Coach body</p>" },
});
fireEvent.click(screen.getByTestId("email-overrides-toggle"));
expect(screen.getByText(
  "Branded custom HTML body set for this campaign",
)).toBeInTheDocument();
```

Render rollback mode with token-bearing and tokenless drafts and assert:

```ts
"Full custom HTML replaces the branded email"
"Custom HTML retained but inactive — branded template fallback will send"
```

For a tokenless rollback draft, assert the shared inline validation error is
visible and both create buttons are disabled. Clear the field and assert the
buttons become enabled and the next submission payload omits
`invitationBodyHtml`.

- [ ] **Step 5: Run the Wizard UI test and verify RED**

Run:

```bash
npx jest \
  src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx \
  --runInBand
```

Expected: FAIL because the behavior prop and branded-body copy do not exist.

- [ ] **Step 6: Implement Wizard mode copy and summary**

Add `brandedCustomHtmlEnabled` to `CampaignWizard` and `ReviewStep`, pass it through at the existing `ReviewStep` call, and compute:

```ts
const invitationHtmlMode = resolveInvitationHtmlMode({
  waveDCustomHtmlEnabled: customHtmlEmailEnabled,
  brandedCustomHtmlEnabled,
  rawHtml: state.invitationBodyHtml,
});
```

Import `invitationOverrideSummary` and `invitationHtmlEditorCopy` from the new
shared module. Pass the Wizard’s existing empty-state copy as `emptySummary`.
Render `invitationHtmlEditorCopy(...).validationError` below the HTML field
with `data-testid="invitation-html-error"`. Disable both Review submit buttons
when that value is non-null, so a tokenless rollback draft cannot create a
campaign until the HTML is corrected or cleared.

When branded mode is active, use the exact field label `Custom HTML body (advanced)` and say:

> Scaling Up branding, available Coach identity, the assessment button/link, and the footer are added automatically. This HTML replaces only the markdown body. `{{invitationUrl}}` is optional; the same merge tokens above are available.

When branded mode is off:

- token-bearing HTML retains the existing complete-replacement warning;
- tokenless HTML says it is retained but inactive, the branded markdown/template fallback will send, and editing requires adding `{{invitationUrl}}` or clearing the field.

Retain upload, paste, clear, 50,000-character length, and save-error behavior.
Update the placeholder to describe a custom body fragment only in branded
mode.

- [ ] **Step 7: Run the copy and Wizard UI tests and verify GREEN**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/invitation-html-editor-copy.test.ts \
  src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx \
  src/__tests__/components/assessments/campaign-wizard-invitation-default.test.tsx \
  --runInBand
```

Expected: all three suites PASS.

- [ ] **Step 8: Pass the behavior flag from the new-campaign server page**

Import and evaluate `assessmentInviteBrandedCustomHtmlEnabled()` next to
`waveDCustomHtmlEmailEnabled()` and pass:

```tsx
brandedCustomHtmlEnabled={assessmentInviteBrandedCustomHtmlEnabled()}
```

- [ ] **Step 9: Commit the shared copy and Wizard authoring experience**

```bash
git add \
  src/src/components/assessments/CampaignWizard.tsx \
  'src/src/app/(portal)/portal/assessments/new/page.tsx' \
  src/src/lib/assessments/invitation-html-editor-copy.ts \
  src/src/__tests__/lib/assessments/invitation-html-editor-copy.test.ts \
  src/src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx
git commit -m "feat(assessments): disclose invitation HTML mode in wizard"
```

---

### Task 6: Mode-accurate Campaign Detail

**Files:**

- Modify: `src/src/components/assessments/CampaignDetail.tsx`
- Modify: `src/src/app/(portal)/portal/assessments/[id]/page.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx`
- Modify: `src/src/__tests__/app/admin-campaign-detail-page.test.tsx`
- Create: `src/src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx`

**Interfaces:**

- Consumes:

```ts
assessmentInviteBrandedCustomHtmlEnabled(): boolean;
resolveInvitationHtmlMode(input): InvitationHtmlMode;
invitationOverrideSummary(input): string;
invitationHtmlEditorCopy(input): {
  label: string;
  description: string;
  validationError: string | null;
};
invitationSaveConfirmation(input): string;
```

- Adds to `CampaignDetailProps`:

```ts
brandedCustomHtmlEnabled?: boolean;
```

- The prop defaults to `false`; the client component never reads `process.env`.

- [ ] **Step 1: Create the Campaign Detail UI tests**

Copy the lightweight `CampaignOverview`, respondent row, router, toast, and
child-component mocks from `campaign-detail-onscreen-results.test.tsx`. Extend
its `makeOverview` options with `invitationBodyHtml?: string | null`, assign
that value on `campaign.invitationBodyHtml`, and define:

```ts
function renderDetail(input: {
  brandedCustomHtmlEnabled: boolean;
  invitationBodyHtml: string | null;
}): void {
  render(
    <CampaignDetail
      initialOverview={makeOverview({
        invitationBodyHtml: input.invitationBodyHtml,
      })}
      initialRespondents={[ROW]}
      customHtmlEmailEnabled
      brandedCustomHtmlEnabled={input.brandedCustomHtmlEnabled}
    />,
  );
}
```

Cover:

```ts
renderDetail({
  brandedCustomHtmlEnabled: true,
  invitationBodyHtml: "<p>Coach body</p>",
});
expect(screen.getByText(
  "Branded custom HTML body set for this campaign",
)).toBeInTheDocument();
```

For rollback preservation:

```ts
renderDetail({
  brandedCustomHtmlEnabled: false,
  invitationBodyHtml: "<p>Retained tokenless body</p>",
});
fireEvent.click(screen.getByTestId("email-overrides-toggle"));
fireEvent.change(screen.getByTestId("invitation-subject-input"), {
  target: { value: "Updated subject" },
});
fireEvent.click(screen.getByTestId("email-overrides-save"));
await waitFor(() => expect(global.fetch).toHaveBeenCalled());
const payload = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
expect(payload).toEqual({
  invitationSubject: "Updated subject",
  invitationBodyMarkdown: null,
});
expect(payload).not.toHaveProperty("invitationBodyHtml");
```

Edit that retained HTML and assert the PATCH contains it; mock HTTP 400 and assert the reason renders inline. Clear it and assert `invitationBodyHtml: null`.

Mock successful saves and assert exact descriptions:

```ts
"Branded custom HTML body saved."
"Full custom HTML replacement saved."
"Custom HTML retained but inactive — branded template fallback will send."
"Using template default."
"New campaign overrides applied."
```

The template-default message must appear only when subject, markdown, and HTML are all empty.

- [ ] **Step 2: Run the Detail UI test and verify RED**

Run:

```bash
npx jest \
  src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx \
  --runInBand
```

Expected: FAIL because HTML-only summary, rollback PATCH omission, and mode-specific toast copy do not exist.

- [ ] **Step 3: Implement Campaign Detail mode state**

Add the prop and compute:

```ts
const persistedHtml = overview.campaign.invitationBodyHtml ?? "";
const invitationHtmlMode = resolveInvitationHtmlMode({
  waveDCustomHtmlEnabled: customHtmlEmailEnabled,
  brandedCustomHtmlEnabled,
  rawHtml: emailHtml,
});
const persistedInvitationHtmlMode = resolveInvitationHtmlMode({
  waveDCustomHtmlEnabled: customHtmlEmailEnabled,
  brandedCustomHtmlEnabled,
  rawHtml: persistedHtml,
});
const emailHtmlChanged = emailHtml !== persistedHtml;
```

Keep HTML in `emailDirty`, but build the PATCH with:

```ts
if (
  customHtmlEmailEnabled &&
  (persistedInvitationHtmlMode !== "branded_fallback" || emailHtmlChanged)
) {
  payload.invitationBodyHtml = emailHtml.trim() === "" ? null : emailHtml;
}
```

This omission applies only to an unchanged retained tokenless body. An edit is sent to the server and receives the normal required-token validation when branded mode is off.

Import `invitationOverrideSummary`, `invitationHtmlEditorCopy`, and
`invitationSaveConfirmation` from `invitation-html-editor-copy.ts`. Call the
summary helper with the Detail empty-state string
`"Using template default — click to customize"`, and render the returned label
and description in the open editor. When HTML has changed, render the returned
`validationError` above the existing server error location; an unchanged
retained tokenless override remains saveable because the PATCH omits it. Pass
the post-edit HTML mode and
`emailSubject.trim() !== "" || emailBody.trim() !== ""` into
`invitationSaveConfirmation`; do not classify using only subject and markdown.

- [ ] **Step 4: Pass the behavior flag from both detail server pages**

Import and evaluate `assessmentInviteBrandedCustomHtmlEnabled()` next to `waveDCustomHtmlEmailEnabled()` and pass:

```tsx
brandedCustomHtmlEnabled={assessmentInviteBrandedCustomHtmlEnabled()}
```

Update the admin page test mock:

```ts
assessmentInviteBrandedCustomHtmlEnabled: jest.fn(() => true),
```

and assert the mocked Campaign Detail receives both booleans.

- [ ] **Step 5: Run the Detail and host-page regression suites**

Run:

```bash
npx jest \
  src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx \
  src/__tests__/components/assessments/campaign-detail-onscreen-results.test.tsx \
  src/__tests__/app/admin-campaign-detail-page.test.tsx \
  --runInBand
```

Expected: all three suites PASS.

- [ ] **Step 6: Commit the Campaign Detail authoring experience**

```bash
git add \
  src/src/components/assessments/CampaignDetail.tsx \
  'src/src/app/(portal)/portal/assessments/[id]/page.tsx' \
  'src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx' \
  src/src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx
git commit -m "feat(assessments): disclose invitation HTML mode in detail"
```

---

### Task 7: Read-only activation inventory

**Files:**

- Create: `src/src/lib/assessments/invitation-html-override-audit.ts`
- Create: `src/src/__tests__/lib/assessments/invitation-html-override-audit.test.ts`
- Create: `src/scripts/audit-invitation-html-overrides.ts`
- Modify: `src/package.json`

**Interfaces:**

- Consumes:

```ts
resolveInvitationHtmlMode(input): InvitationHtmlMode;
hasInvitationUrlToken(raw: string): boolean;
```

- Produces:

```ts
export interface InvitationHtmlOverrideAuditRow {
  campaignId: string;
  templateAlias: string;
  deletedAt: Date | null;
  invitationBodyHtml: string;
}

export interface InvitationHtmlOverrideAuditEntry {
  campaignId: string;
  templateAlias: string;
  lifecycle: "live" | "soft_deleted";
  hasRecognizedUrlToken: boolean;
  currentMode: InvitationHtmlMode;
  postActivationMode: "branded_body";
  rollbackMode: "full_replace" | "branded_fallback";
}

export function buildInvitationHtmlOverrideAudit(input: {
  rows: InvitationHtmlOverrideAuditRow[];
  currentWaveDEnabled: boolean;
  currentBrandedModeEnabled: boolean;
}): {
  total: number;
  live: number;
  softDeleted: number;
  activationBlocked: boolean;
  entries: InvitationHtmlOverrideAuditEntry[];
};

export function formatInvitationHtmlOverrideAudit(
  report: ReturnType<typeof buildInvitationHtmlOverrideAudit>,
): string;

export interface InvitationHtmlAuditDb {
  $transaction<T>(
    callback: (tx: InvitationHtmlAuditTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface InvitationHtmlAuditTransaction {
  $executeRawUnsafe(sql: string): Promise<unknown>;
  assessmentCampaign: {
    findMany(args: {
      where: { invitationBodyHtml: { not: null } };
      select: {
        id: true;
        deletedAt: true;
        invitationBodyHtml: true;
        template: { select: { alias: true } };
      };
      orderBy: { id: "asc" };
    }): Promise<Array<{
      id: string;
      deletedAt: Date | null;
      invitationBodyHtml: string | null;
      template: { alias: string };
    }>>;
  };
}

export function loadInvitationHtmlOverrideRows(
  db: InvitationHtmlAuditDb,
): Promise<InvitationHtmlOverrideAuditRow[]>;
```

- [ ] **Step 1: Write the pure audit tests**

Import the full audit surface:

```ts
import {
  buildInvitationHtmlOverrideAudit,
  formatInvitationHtmlOverrideAudit,
  loadInvitationHtmlOverrideRows,
  type InvitationHtmlAuditDb,
} from "@/lib/assessments/invitation-html-override-audit";
```

Create fixtures whose raw HTML includes an email, credential-like fragment, and Coach image URL, then assert:

```ts
const report = buildInvitationHtmlOverrideAudit({
  rows: [
    {
      campaignId: "live-1",
      templateAlias: "rockefeller",
      deletedAt: null,
      invitationBodyHtml:
        '<p>person@example.com</p><a href="{{invitationUrl}}">Open</a>',
    },
    {
      campaignId: "deleted-1",
      templateAlias: "qsp",
      deletedAt: new Date("2026-07-10T00:00:00Z"),
      invitationBodyHtml:
        '<img src="https://cdn.test/coach-secret.png"><p>#t=SECRET</p>',
    },
  ],
  currentWaveDEnabled: true,
  currentBrandedModeEnabled: false,
});

expect(report).toMatchObject({
  total: 2,
  live: 1,
  softDeleted: 1,
  activationBlocked: true,
});
expect(report.entries).toEqual([
  expect.objectContaining({
    campaignId: "live-1",
    lifecycle: "live",
    hasRecognizedUrlToken: true,
    currentMode: "full_replace",
    postActivationMode: "branded_body",
    rollbackMode: "full_replace",
  }),
  expect.objectContaining({
    campaignId: "deleted-1",
    lifecycle: "soft_deleted",
    hasRecognizedUrlToken: false,
    currentMode: "branded_fallback",
    postActivationMode: "branded_body",
    rollbackMode: "branded_fallback",
  }),
]);

const output = formatInvitationHtmlOverrideAudit(report);
expect(output).toContain("live-1");
expect(output).toContain("rockefeller");
expect(output).toContain("Activation blocked: yes");
for (const forbidden of [
  "person@example.com",
  "#t=SECRET",
  "coach-secret.png",
  "<a href=",
]) {
  expect(output).not.toContain(forbidden);
}
```

Also assert zero live rows produces `activationBlocked: false`.

Add a structural fake that exposes no mutation methods:

```ts
it("starts a read-only transaction before the allowlisted select", async () => {
  const calls: string[] = [];
  const db: InvitationHtmlAuditDb = {
    $transaction: async (callback) => callback({
      $executeRawUnsafe: async (sql) => {
        calls.push(sql);
        return 0;
      },
      assessmentCampaign: {
        findMany: async (args) => {
          calls.push(JSON.stringify(args));
          return [{
            id: "campaign-1",
            deletedAt: null,
            invitationBodyHtml: "<p>Body</p>",
            template: { alias: "rockefeller" },
          }];
        },
      },
    }),
  };

  await expect(loadInvitationHtmlOverrideRows(db)).resolves.toEqual([{
    campaignId: "campaign-1",
    templateAlias: "rockefeller",
    deletedAt: null,
    invitationBodyHtml: "<p>Body</p>",
  }]);
  expect(calls[0]).toBe("SET TRANSACTION READ ONLY");
  expect(JSON.parse(calls[1])).toEqual({
    where: { invitationBodyHtml: { not: null } },
    select: {
      id: true,
      deletedAt: true,
      invitationBodyHtml: true,
      template: { select: { alias: true } },
    },
    orderBy: { id: "asc" },
  });
});
```

- [ ] **Step 2: Run the audit test and verify RED**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/invitation-html-override-audit.test.ts \
  --runInBand
```

Expected: FAIL because the audit module does not exist.

- [ ] **Step 3: Implement pure classification and safe formatting**

For each non-empty row:

```ts
const currentMode = resolveInvitationHtmlMode({
  waveDCustomHtmlEnabled: input.currentWaveDEnabled,
  brandedCustomHtmlEnabled: input.currentBrandedModeEnabled,
  rawHtml: row.invitationBodyHtml,
});
const rollbackMode = hasInvitationUrlToken(row.invitationBodyHtml)
  ? "full_replace"
  : "branded_fallback";
```

Format only counts and the seven allowlisted entry fields. Never concatenate `invitationBodyHtml`.

Implement `loadInvitationHtmlOverrideRows` against the structural interface:

```ts
export async function loadInvitationHtmlOverrideRows(
  db: InvitationHtmlAuditDb,
): Promise<InvitationHtmlOverrideAuditRow[]> {
  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.assessmentCampaign.findMany({
      where: { invitationBodyHtml: { not: null } },
      select: {
        id: true,
        deletedAt: true,
        invitationBodyHtml: true,
        template: { select: { alias: true } },
      },
      orderBy: { id: "asc" },
    });
  });
  return rows.map((row) => ({
    campaignId: row.id,
    templateAlias: row.template.alias,
    deletedAt: row.deletedAt,
    invitationBodyHtml: row.invitationBodyHtml ?? "",
  }));
}
```

- [ ] **Step 4: Run the pure audit suite and verify GREEN**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/invitation-html-override-audit.test.ts \
  --runInBand
```

Expected: PASS.

- [ ] **Step 5: Implement the read-only runner**

The runner must create Prisma with only the dedicated URL:

```ts
const readonlyUrl = process.env.AUDIT_READONLY_URL;
if (!readonlyUrl?.trim()) {
  throw new Error(
    "AUDIT_READONLY_URL is required; DATABASE_URL and DIRECT_URL are not accepted.",
  );
}

const prisma = new PrismaClient({
  datasources: { db: { url: readonlyUrl } },
});
```

Load rows only through the tested read-only adapter:

```ts
const auditRows = await loadInvitationHtmlOverrideRows(
  prisma as unknown as InvitationHtmlAuditDb,
);
```

Read current mode from the two existing flag readers. Print only
`formatInvitationHtmlOverrideAudit(report)`. Disconnect in `finally`; set
`process.exitCode = 1` on error; never echo a connection string or Prisma row.

Add:

```json
"audit:invitation-html-overrides": "npx tsx scripts/audit-invitation-html-overrides.ts"
```

Do not run this command during implementation unless an operator provides an explicitly read-only `AUDIT_READONLY_URL`. Running the unit test requires no database connection.

- [ ] **Step 6: Type-check the runner without connecting**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS. No audit query runs during type-checking.

- [ ] **Step 7: Commit the activation audit**

```bash
git add \
  src/src/lib/assessments/invitation-html-override-audit.ts \
  src/src/__tests__/lib/assessments/invitation-html-override-audit.test.ts \
  src/scripts/audit-invitation-html-overrides.ts \
  src/package.json
git commit -m "feat(assessments): add read-only invitation HTML audit"
```

---

### Task 8: Supersession docs, dark rollout runbook, and full verification

**Files:**

- Modify: `docs/specs/v7.6/17d-wave-d-campaign-setup-design.md`
- Modify: `docs/specs/v7.6/17d-ops-runbook.md`
- Modify: `docs/superpowers/specs/2026-08-03-gh-220-invitation-html-branding-design.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`
- Verify: every code and test file changed in Tasks 1–7

**Interfaces:**

- Consumes: the implemented flag name, render modes, audit command, rollback behavior, and validation receipts.
- Produces: one current source-of-truth contract and a branch ready for review; it does not activate production.

- [ ] **Step 1: Update the Wave-D design without rewriting history**

At the existing #20 full-replacement section, retain the original contract and append:

> **GH #220 supersession (2026-08-03):** Full replacement remains only the rollback behavior for token-bearing legacy HTML while `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED` is off. When that default-off behavior flag is on, validated campaign HTML is a sanitized body fragment inside the shared Scaling Up/Coach shell; the platform owns the CTA, fallback URL, CID logo, and footer. Tokenless stored HTML safely falls back to branded markdown/template content when the behavior flag is off. Stored bytes are not rewritten.

Apply the same qualification to the grill-outcome line that says “custom HTML = body/render only.”

- [ ] **Step 2: Update the Wave-D operations runbook**

Document these exact controls:

```text
WAVE_D_CUSTOM_HTML_EMAIL_ENABLED
  Capability: read and render campaign invitationBodyHtml.

ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED
  Behavior: compose non-empty custom HTML as the sanitized body inside the
  shared branded shell. Default off.
```

Add the rollout sequence:

1. deploy with the new flag unset;
2. read the current Production values for both HTML flags, set `GH220_READONLY_DATABASE_URL` to the operator-provided read-only connection, and run the audit with those exact values; before first activation the expected command is `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED=1 ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED=0 AUDIT_READONLY_URL="$GH220_READONLY_DATABASE_URL" npm run audit:invitation-html-overrides`;
3. stop if live overrides are nonzero until each live campaign is reviewed;
4. separately authorize and set the flag in Production;
5. redeploy, verify exact deployment/aliases/health/flag state;
6. observe organic PII-free telemetry without manufacturing a customer send.

Add rollback: unset the new flag and redeploy; token-bearing legacy HTML becomes complete replacement, tokenless HTML uses branded fallback, and stored bytes remain unchanged.

- [ ] **Step 3: Update the durable project context**

Replace the unconditional full-replacement sentence in `CLAUDE.md` with a flag-aware statement:

> Campaign `invitationBodyHtml` bypasses template-row copy. With `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED=1`, it is sanitized and used as the body inside the shared branded invitation shell; with the flag off, token-bearing legacy HTML uses complete replacement and tokenless HTML safely falls back to branded markdown/template content. `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` remains the broader capability gate. GH #220 changes no stored bytes and activation requires the read-only override audit.

Update the Project Context anchor and prose to:

```text
LAST_UPDATED_ISO:2026-08-03
LAST_UPDATED_SLUG:gh-220-branded-invitation-html-dark
```

Do not overwrite a newer entry introduced by rebasing active GH #257/#228/#256 work. If one exists, prepend the GH #220 changelog detail but keep the newest valid project-context anchor.

- [ ] **Step 4: Prepend the changelog entry**

Use:

```markdown
<a id="gh-220-branded-invitation-html-dark"></a>
### 2026-08-03 — GH #220 branded invitation HTML implemented dark <!-- ENTRY_ISO:2026-08-03 ENTRY_SLUG:gh-220-branded-invitation-html-dark -->

**Status: IMPLEMENTED + LOCALLY VERIFIED + DEFAULT-OFF; not production-activated.** Campaign-authored `invitationBodyHtml` now has a flag-controlled branded-body mode. `WAVE_D_CUSTOM_HTML_EMAIL_ENABLED` remains the capability gate, while new default-off `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED` composes escaped/interpolated/sanitized authored content inside the existing Scaling Up/Coach invitation shell. The platform owns the CID logo, Coach-logo behavior, CTA, visible fallback URL, footer, and canonical plain-text URL. Subjects and SMTP failure propagation are unchanged.

**Rollback and stored data.** Existing HTML bytes are neither rewritten nor migrated. With the new behavior flag off, recognized-token legacy HTML retains complete replacement and tokenless HTML uses the branded markdown/template fallback, preventing a linkless rollback. Create/update validation permits tokenless bodies only while branded mode is active and continues to reject unsafe token placement.

**Authoring and observability.** Campaign Wizard and Campaign Detail receive the server-derived mode and disclose branded-body, complete-replacement, or retained-fallback state. Campaign Detail omits unchanged retained tokenless HTML from unrelated rollback edits. Existing `renderer:"custom_html"` and `bodySource:"custom_html"` telemetry remain stable; PII-free metadata adds the custom-HTML mode or safe-fallback reason.

**Activation boundary.** `npm run audit:invitation-html-overrides` requires a dedicated `AUDIT_READONLY_URL`, enforces a read-only transaction, and prints only counts, campaign IDs, template aliases, token presence, and current/post-activation/rollback modes. Production activation is separate: re-run the audit, manually review every live override, then explicitly authorize the flag and redeploy. No production data, flag, invitation, migration, GH #228 report branding, GH #256 image policy, or GH #257 outbox behavior changed in this implementation.
```

- [ ] **Step 5: Run the complete focused Jest matrix**

Run from `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/invitation-html-policy.test.ts \
  src/__tests__/lib/assessments/invitation-html-editor-copy.test.ts \
  src/__tests__/lib/assessments/wave-d-feature-flags.test.ts \
  src/__tests__/lib/email-html-sanitizer.test.ts \
  src/__tests__/lib/assessments/invitation-email.test.ts \
  src/__tests__/services/notifications.test.ts \
  src/__tests__/api/assessment-campaigns/create-invitation-html.test.ts \
  src/__tests__/api/assessment-campaigns/detail-route.test.ts \
  src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx \
  src/__tests__/components/assessments/campaign-wizard-invitation-default.test.tsx \
  src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx \
  src/__tests__/components/assessments/campaign-detail-onscreen-results.test.tsx \
  src/__tests__/app/admin-campaign-detail-page.test.tsx \
  src/__tests__/lib/assessments/invitation-html-override-audit.test.ts \
  src/__tests__/lint/changelog-freshness.test.ts \
  --runInBand
```

Expected: all listed suites PASS. Record the suite/test totals in the PR body; do not invent totals in source-of-truth docs.

- [ ] **Step 6: Run scoped ESLint**

Run:

```bash
npx eslint \
  src/lib/assessments/invitation-html-policy.ts \
  src/lib/assessments/invitation-html-editor-copy.ts \
  src/lib/assessments/wave-d-feature-flags.ts \
  src/lib/assessments/email-html-sanitizer.ts \
  src/lib/assessments/invitation-email.ts \
  src/lib/assessments/invitation-html-override-audit.ts \
  src/services/notifications.ts \
  src/app/api/assessment-campaigns/route.ts \
  'src/app/api/assessment-campaigns/[id]/route.ts' \
  src/components/assessments/CampaignWizard.tsx \
  src/components/assessments/CampaignDetail.tsx \
  'src/app/(portal)/portal/assessments/new/page.tsx' \
  'src/app/(portal)/portal/assessments/[id]/page.tsx' \
  'src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx' \
  scripts/audit-invitation-html-overrides.ts \
  src/__tests__/lib/assessments/invitation-html-policy.test.ts \
  src/__tests__/lib/assessments/invitation-html-editor-copy.test.ts \
  src/__tests__/lib/assessments/wave-d-feature-flags.test.ts \
  src/__tests__/lib/email-html-sanitizer.test.ts \
  src/__tests__/lib/assessments/invitation-email.test.ts \
  src/__tests__/lib/assessments/invitation-html-override-audit.test.ts \
  src/__tests__/services/notifications.test.ts \
  src/__tests__/api/assessment-campaigns/create-invitation-html.test.ts \
  src/__tests__/api/assessment-campaigns/detail-route.test.ts \
  src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx \
  src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx \
  src/__tests__/app/admin-campaign-detail-page.test.tsx
```

Expected: exit 0.

- [ ] **Step 7: Run type, migration, whitespace, and source-of-truth checks**

Run:

```bash
npx tsc --noEmit
node scripts/check-migration-safety.mjs
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
git diff --check origin/main...HEAD
```

Expected: all commands exit 0; migration safety reports no new migration requirement.

- [ ] **Step 8: Run the required production-equivalent build**

Run:

```bash
CI=true npx next build --turbopack
```

Expected: exit 0. Do not represent unrelated pre-existing failures as passing; diagnose any failure before proceeding.

- [ ] **Step 9: Commit documentation and verification state**

From the repository root:

```bash
git add \
  docs/specs/v7.6/17d-wave-d-campaign-setup-design.md \
  docs/specs/v7.6/17d-ops-runbook.md \
  docs/superpowers/specs/2026-08-03-gh-220-invitation-html-branding-design.md \
  CLAUDE.md \
  plans/CHANGELOG.md
git commit -m "docs: record GH 220 dark rollout contract"
```

- [ ] **Step 10: Review the final branch and re-run push gates**

Run:

```bash
git status --short --branch
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
CI=true npx next build --turbopack
```

Expected: the worktree is clean; the diff contains no Prisma migration, report-email branding, Circle image-policy, or outbox-reconciliation change; all final gates exit 0.

Before any push, verify the GitHub claim is still owned by this work, then follow the repository’s review/PR process. Do not activate the production flag as part of the implementation PR.
