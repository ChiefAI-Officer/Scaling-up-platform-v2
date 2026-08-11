# Universal Assessment Invitation Email Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every enabled INVITED assessment email one platform-owned banner that shows Scaling Up first, then a safe Coach image/name byline, and never automatically shows the Organization name.

**Architecture:** Add a default-off three-lever gate and a pure combined Coach-byline resolver. Extend the existing `buildInvitationEmailShell` with a `universalBanner` chrome variant, then keep `prepareAssessmentInvitationEmail` as the only body/shell composition point while the four send entry points resolve the gate and Coach identity once. Existing `legacy` and `waveP` output remain unchanged for rollback.

**Tech Stack:** TypeScript 5, Next.js 16 App Router, React 19, Jest 30, Testing Library, Nodemailer SMTP preparation, strict sanitized email HTML, Playwright for non-production visual capture.

## Global Constraints

- Banner order is Scaling Up logo, then an optional Coach byline labeled exactly `Your coach`.
- Organization name is never automatically rendered in the `universalBanner` banner, including unknown/future template aliases.
- `{{organizationName}}` remains available in authored subject, Markdown body, and custom-HTML body.
- Coach selection is campaign creator first, Organization owner second, then no Coach identity.
- Name and image come from the same selected Coach; a creator without a usable image never borrows the owner's image.
- Missing/rejected image degrades to visible Coach name only; missing selected-Coach name degrades to Scaling Up only.
- Custom HTML is a sanitized body fragment while `universalBanner` is active; the platform owns banner, CTA, visible fallback URL, and footer.
- Scope is INVITED initial send, automatic fan-out, reminders, and resends only. PUBLIC and results/report email code remain unchanged.
- `WAVE_INVITATION_BANNER_ENABLED`, `WAVE_INVITATION_BANNER_CANARY`, and `WAVE_INVITATION_BANNER_KILL` are default-off, with KILL taking precedence.
- Explicit `universalBanner` chrome bypasses the older
  `ASSESSMENT_INVITE_BRANDED=0` legacy-renderer switch; that switch retains its
  prior meaning for non-universal legacy/Wave-P rendering, while the universal
  KILL is `WAVE_INVITATION_BANNER_KILL`.
- With the new gate off, current `legacy`, `waveP`, custom-HTML mode, LVA Organization suppression, HTML, and text output remain byte-identical.
- No Prisma/schema migration, stored-content rewrite, recipient/lifecycle change, or banner editor control.
- Logs and telemetry contain no raw Coach name, image URL, respondent value, invitation URL, or credential.
- Production flag mutation, deployment, or customer email delivery requires separate explicit authorization.

## File Structure

- Create `src/src/lib/assessments/wave-invitation-banner-flags.ts`: runtime gate and serializable authoring snapshot.
- Modify `src/src/lib/assessments/invitation-email.ts`: combined Coach resolver, universal shell, and universal text composer.
- Modify `src/src/services/notifications.ts`: body-only custom HTML and byline telemetry at the composition chokepoint.
- Modify `src/src/lib/assessments/invite-send.ts` plus four send entry points: transport one chrome decision and one byline.
- Modify `CampaignWizard.tsx`, `CampaignDetail.tsx`, and their server pages: accurate body-only editor copy.
- Create `src/scripts/capture-invitation-banner-previews.ts`: seven non-production real-renderer visual fixtures.
- Update `docs/specs/v7.6/17d-ops-runbook.md`, `CLAUDE.md`, and `plans/CHANGELOG.md`: rollout and default-off receipt.

---

### Task 1: Add the universal invitation-banner gate

**Files:**
- Create: `src/src/lib/assessments/wave-invitation-banner-flags.ts`
- Create: `src/src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts`

**Interfaces:**
- Consumes: the three `WAVE_INVITATION_BANNER_*` environment variables.
- Produces: `isInvitationBannerEnabled(scope?): boolean` and an async
  `getInvitationBannerAuthoringGate(canAccessCanaryId)` snapshot that filters
  configured IDs through the caller's existing server-side authorization.

- [ ] **Step 1: Write the failing gate tests**

Create call-time environment tests for default-off, explicit truthy values, exact Organization/Template canaries, KILL precedence, deduplication, and state restoration. Core assertions:

```ts
expect(isInvitationBannerEnabled()).toBe(false);

process.env.WAVE_INVITATION_BANNER_CANARY = "org_1, tpl_2";
expect(isInvitationBannerEnabled({ organizationId: "org_1" })).toBe(true);
expect(isInvitationBannerEnabled({ templateId: "tpl_2" })).toBe(true);
expect(isInvitationBannerEnabled({ organizationId: "org_10" })).toBe(false);

process.env.WAVE_INVITATION_BANNER_ENABLED = "1";
process.env.WAVE_INVITATION_BANNER_KILL = "1";
expect(isInvitationBannerEnabled({ organizationId: "org_1" })).toBe(false);
await expect(
  getInvitationBannerAuthoringGate(async () => true),
).resolves.toEqual({
  globallyEnabled: false,
  canaryIds: [],
});
```

Also test `"1"`, `"true"`, `"TRUE"`, and `"yes"`, plus a snapshot that
deduplicates configured IDs and retains only those accepted by the supplied
authorization predicate.

- [ ] **Step 2: Run the missing-module test**

```bash
npx jest src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts --runInBand
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the gate with the Wave-P truthiness convention**

```ts
export interface InvitationBannerScope {
  organizationId?: string;
  templateId?: string;
}

export interface InvitationBannerAuthoringGate {
  globallyEnabled: boolean;
  canaryIds: string[];
}

function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function canaryIds(): string[] {
  return [...new Set(
    (process.env.WAVE_INVITATION_BANNER_CANARY ?? "")
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

export function isInvitationBannerEnabled(scope?: InvitationBannerScope): boolean {
  if (isOn(process.env.WAVE_INVITATION_BANNER_KILL)) return false;
  if (isOn(process.env.WAVE_INVITATION_BANNER_ENABLED)) return true;
  const allowlist = new Set(canaryIds());
  return [scope?.organizationId, scope?.templateId].some(
    (value) => typeof value === "string" && value.length > 0 && allowlist.has(value),
  );
}

export async function getInvitationBannerAuthoringGate(
  canAccessCanaryId: (id: string) => Promise<boolean>,
): Promise<InvitationBannerAuthoringGate> {
  if (isOn(process.env.WAVE_INVITATION_BANNER_KILL)) {
    return { globallyEnabled: false, canaryIds: [] };
  }
  if (isOn(process.env.WAVE_INVITATION_BANNER_ENABLED)) {
    return { globallyEnabled: true, canaryIds: [] };
  }
  const visibleCanaryIds: string[] = [];
  for (const id of canaryIds()) {
    if (await canAccessCanaryId(id)) visibleCanaryIds.push(id);
  }
  return {
    globallyEnabled: false,
    canaryIds: visibleCanaryIds,
  };
}
```

Only server pages call the environment-backed snapshot function; client
components receive its plain object. The final interface accepts an async
authorization predicate and preserves only configured IDs for which the
authenticated Coach passes existing Organization or Template access checks.
KILL and global enablement serialize an empty ID list because the canary list is
then irrelevant. The complete environment allowlist, cross-tenant IDs, names,
email addresses, credentials, and secrets never reach the browser.

- [ ] **Step 4: Verify and commit**

```bash
npx jest src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts --runInBand
npx eslint src/lib/assessments/wave-invitation-banner-flags.ts src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts
git add src/src/lib/assessments/wave-invitation-banner-flags.ts src/src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts
git commit -m "feat(assessments): gate universal invitation banner"
```

---

### Task 2: Resolve one complete Coach presentation model

**Files:**
- Modify: `src/src/lib/assessments/invitation-email.ts:380-418`
- Modify: `src/src/__tests__/lib/assessments/invitation-email.test.ts:317-510`

**Interfaces:**
- Consumes: `{ firstName, lastName, profileImage } | null` for creator and owner, plus `safeImageSrc`.
- Produces: `InvitationCoachByline`, `InvitationCoachResolution`, and `resolveInvitationCoachByline(creator, owner)`.

- [ ] **Step 1: Write failing combined-resolver tests**

```ts
expect(resolveInvitationCoachByline(
  { firstName: "Cre", lastName: "Ator", profileImage: "https://cdn.test/creator.png" },
  { firstName: "Own", lastName: "Er", profileImage: "https://cdn.test/owner.png" },
)).toEqual({
  byline: {
    mode: "image_name",
    coachName: "Cre Ator",
    coachImageUrl: "https://cdn.test/creator.png",
  },
  logoRejectedReason: null,
});

expect(resolveInvitationCoachByline(
  { firstName: "Cre", lastName: "Ator", profileImage: null },
  { firstName: "Own", lastName: "Er", profileImage: "https://cdn.test/owner.png" },
)).toEqual({
  byline: { mode: "name_only", coachName: "Cre Ator" },
  logoRejectedReason: "no-image",
});

expect(resolveInvitationCoachByline(
  { firstName: "Cre", lastName: "Ator", profileImage: "http://cdn.test/rejected.png" },
  null,
)).toEqual({
  byline: { mode: "name_only", coachName: "Cre Ator" },
  logoRejectedReason: "invalid-url",
});

expect(resolveInvitationCoachByline(
  null,
  { firstName: "Own", lastName: "Er", profileImage: "https://cdn.test/owner.png" },
)).toEqual({
  byline: {
    mode: "image_name",
    coachName: "Own Er",
    coachImageUrl: "https://cdn.test/owner.png",
  },
  logoRejectedReason: null,
});

expect(resolveInvitationCoachByline(
  { firstName: " ", lastName: "", profileImage: "https://cdn.test/image.png" },
  { firstName: "Own", lastName: "Er", profileImage: "https://cdn.test/owner.png" },
)).toEqual({
  byline: { mode: "scaling_up_only" },
  logoRejectedReason: "missing-name",
});

expect(resolveInvitationCoachByline(null, null)).toEqual({
  byline: { mode: "scaling_up_only" },
  logoRejectedReason: "no-coach",
});
```

Add a malicious rejected URL case and assert the raw value never appears in the result.

- [ ] **Step 2: Run the renderer test and verify failure**

```bash
npx jest src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
```

Expected: FAIL because the combined resolver does not exist.

- [ ] **Step 3: Implement the union and resolver**

```ts
export type InvitationCoachByline =
  | { mode: "image_name"; coachName: string; coachImageUrl: string }
  | { mode: "name_only"; coachName: string }
  | { mode: "scaling_up_only" };

export interface InvitationCoachResolution {
  byline: InvitationCoachByline;
  logoRejectedReason:
    | "no-coach"
    | "missing-name"
    | "no-image"
    | "invalid-url"
    | null;
}

type InvitationCoachCandidate = {
  firstName: string;
  lastName: string;
  profileImage: string | null;
} | null;

export function resolveInvitationCoachByline(
  creatorCoach: InvitationCoachCandidate,
  ownerCoach: InvitationCoachCandidate,
): InvitationCoachResolution {
  const selected = creatorCoach ?? ownerCoach;
  if (!selected) {
    return {
      byline: { mode: "scaling_up_only" },
      logoRejectedReason: "no-coach",
    };
  }
  const coachName = `${selected.firstName ?? ""} ${selected.lastName ?? ""}`.trim();
  if (coachName.length === 0) {
    return {
      byline: { mode: "scaling_up_only" },
      logoRejectedReason: "missing-name",
    };
  }
  const coachImageUrl = safeImageSrc(selected.profileImage);
  if (coachImageUrl) {
    return {
      byline: { mode: "image_name", coachName, coachImageUrl },
      logoRejectedReason: null,
    };
  }
  return {
    byline: { mode: "name_only", coachName },
    logoRejectedReason: selected.profileImage ? "invalid-url" : "no-image",
  };
}
```

Keep `resolveCoachName` and `resolveCoachLogo` until Task 5 updates every caller, so intermediate commits compile.

- [ ] **Step 4: Verify and commit**

```bash
npx jest src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
npx eslint src/lib/assessments/invitation-email.ts src/__tests__/lib/assessments/invitation-email.test.ts
git add src/src/lib/assessments/invitation-email.ts src/src/__tests__/lib/assessments/invitation-email.test.ts
git commit -m "refactor(assessments): resolve invitation coach byline once"
```

---

### Task 3: Render the approved universal HTML and plain-text shell

**Files:**
- Modify: `src/src/lib/assessments/invitation-email.ts:16-38,295-378`
- Modify: `src/src/__tests__/lib/assessments/invitation-email.test.ts:143-248,329-549`

**Interfaces:**
- Consumes: `InvitationCoachByline`, escaped `bodyHtml`, `InvitationVars`, and the existing CID logo.
- Produces: `InvitationChrome = "legacy" | "waveP" | "universalBanner"`, extended shell/build functions, and `renderUniversalInvitationText`.

- [ ] **Step 1: Write failing universal-shell tests**

```ts
const html = buildInvitationEmailHtml({
  bodyMarkdown: "Welcome to {{organizationName}}",
  vars: baseVars,
  chrome: "universalBanner",
  coachByline: {
    mode: "image_name",
    coachName: "Martin <Coach>",
    coachImageUrl: "https://cdn.test/martin.png",
  },
});

expect(html.indexOf('src="cid:sulogo"')).toBeLessThan(
  html.indexOf("https://cdn.test/martin.png"),
);
expect(html).toContain("Your coach");
expect(html).toContain("Martin &lt;Coach&gt;");
expect(html).toContain('alt=""');
expect(html).not.toContain("opacity:0.85");
expect(html).toContain("Welcome to Acme Corp");
expect(html).toContain("Start the assessment");
expect(html).toContain("If the button doesn't work");
expect(html).toContain("&mdash; Scaling Up Platform");
```

Add cases proving:

- `name_only` renders the label/name and exactly one `<img`, the Scaling Up logo;
- `scaling_up_only` renders no Coach label, name, or image;
- the banner omits Organization text for LVA, known non-LVA, `null`, and unknown aliases when the body does not contain the merge token;
- long Coach names can wrap and have no `white-space:nowrap`;
- dangerous image/name values cannot create attributes, elements, or scripts;
- the existing legacy inline snapshot remains identical; and
- all existing Wave-P tests remain identical.

Test the new plain-text contract:

```ts
expect(renderUniversalInvitationText({
  body: { kind: "markdown", value: "Hi {{respondentFirstName}}" },
  vars: baseVars,
  coachByline: { mode: "name_only", coachName: "Martin Segnitz" },
})).toBe([
  "Scaling Up Platform",
  "Coach: Martin Segnitz",
  "",
  "Hi Jane",
  "",
  `Start the assessment: ${baseVars.invitationUrl}`,
].join("\n"));
```

The sanitized-HTML case uses the same structure. The `scaling_up_only` case omits `Coach:` but retains the canonical URL.

- [ ] **Step 2: Run the test and verify failure**

```bash
npx jest src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
```

Expected: FAIL on the new chrome and composer.

- [ ] **Step 3: Extend the renderer interfaces**

```ts
export type InvitationChrome = "legacy" | "waveP" | "universalBanner";

export function buildInvitationEmailShell(input: {
  bodyHtml: string;
  vars: InvitationVars;
  chrome?: InvitationChrome;
  coachByline?: InvitationCoachByline;
}): string;

export function buildInvitationEmailHtml(input: {
  bodyMarkdown: string;
  vars: InvitationVars;
  chrome?: InvitationChrome;
  coachByline?: InvitationCoachByline;
}): string;

export function renderUniversalInvitationText(input: {
  body:
    | { kind: "markdown"; value: string }
    | { kind: "sanitized_html"; value: string };
  vars: InvitationVars;
  coachByline: InvitationCoachByline;
}): string;
```

Branch only for `chrome === "universalBanner"`; preserve legacy/Wave-P template bytes. The universal branch never consults `showOrgLine`, uses current Wave-P CTA dimensions, renders Scaling Up first, and adds this stable byline marker:

```html
<table role="presentation" data-invitation-coach-byline="true" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
```

Use a `52px` image cell and flexible text cell. The literal label is `Your coach` with uppercase visual styling. The visible name uses `font-size:16px`, `line-height:1.35`, and escaped/control-stripped text. Coach image `alt` is empty. Omit the whole table for `scaling_up_only`.

For universal text, use the existing token interpolation/Markdown removal and `htmlFragmentToText`, then compose one Scaling Up/optional Coach/body/URL result. Do not modify output from existing text functions.

- [ ] **Step 4: Verify and commit**

```bash
npx jest src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
npx eslint src/lib/assessments/invitation-email.ts src/__tests__/lib/assessments/invitation-email.test.ts
git add src/src/lib/assessments/invitation-email.ts src/src/__tests__/lib/assessments/invitation-email.test.ts
git commit -m "feat(assessments): render universal invitation banner"
```

---

### Task 4: Enforce platform shell ownership at the SMTP chokepoint

**Files:**
- Modify: `src/src/services/notifications.ts:1114-1297`
- Modify: `src/src/__tests__/services/notifications.test.ts:260-827`

**Interfaces:**
- Consumes: `AssessmentInvitationEmailInput.chrome`, `coachByline`, Wave-D HTML capability, and the GH #220 behavior flag.
- Produces: universal Markdown/custom-HTML shell composition and PII-free `coachBylineMode` telemetry.

- [ ] **Step 1: Write failing composition tests**

With the old GH #220 flag absent and Wave-D capability on, prepare this email:

```ts
const prepared = prepareAssessmentInvitationEmail({
  ...baseData(),
  chrome: "universalBanner",
  coachByline: {
    mode: "image_name",
    coachName: "Pat Coach",
    coachImageUrl: "https://cdn.test/pat.png",
  },
  invitationBodyHtml: "<p>Custom-only body</p>",
});
await prepared.send();
```

Assert captured HTML contains custom body, Scaling Up CID, `Your coach`, Coach name, CTA, fallback URL, and footer. Assert `customHtmlMode: "branded_body"` and `coachBylineMode: "image_name"`. Add tests for `name_only`, `scaling_up_only`, sanitizer-empty HTML still producing a usable shell, escaped token values, tokenless custom HTML never selecting `full_replace`, identical universal text structure for Markdown/custom HTML, unchanged flag-off GH #220 matrix, and strict error propagation.

- [ ] **Step 2: Run the service suite and verify failure**

```bash
npx jest src/__tests__/services/notifications.test.ts --runInBand
```

Expected: FAIL because the new byline/chrome behavior is absent.

- [ ] **Step 3: Implement effective shell ownership**

Extend `AssessmentInvitationEmailInput` with:

```ts
coachByline?: InvitationCoachByline;
chrome?: InvitationChrome;
```

Normalize once for the universal renderer. Preserve old-field values exactly for
legacy/Wave-P output until Task 5 migrates every caller:

```ts
const fallbackCoachName = (data.coachName ?? "").trim();
const fallbackCoachImage = fallbackCoachName
  ? safeImageSrc(data.coachLogoUrl)
  : null;
const coachByline = data.coachByline ?? (
  fallbackCoachName.length === 0
    ? { mode: "scaling_up_only" as const }
    : fallbackCoachImage
      ? {
          mode: "image_name" as const,
          coachName: fallbackCoachName,
          coachImageUrl: fallbackCoachImage,
        }
      : { mode: "name_only" as const, coachName: fallbackCoachName }
);
const universalBanner = data.chrome === "universalBanner";
const legacyCoachName = data.coachByline
  ? coachByline.mode === "scaling_up_only" ? null : coachByline.coachName
  : data.coachName ?? null;
const legacyCoachLogoUrl = data.coachByline
  ? coachByline.mode === "image_name" ? coachByline.coachImageUrl : null
  : data.coachLogoUrl ?? null;
```

Populate `InvitationVars.coachName`/`coachLogoUrl` from
`legacyCoachName`/`legacyCoachLogoUrl`. This keeps the old edge case of an image
with an empty name byte-identical when no combined byline was supplied, while
new callers cannot mix identities. Resolve HTML mode with an independent
universal ownership condition:

```ts
const customHtmlMode = resolveInvitationHtmlMode({
  waveDCustomHtmlEnabled: waveDCustomHtmlEmailEnabled(),
  brandedCustomHtmlEnabled:
    universalBanner || assessmentInviteBrandedCustomHtmlEnabled(),
  rawHtml: rawCustomHtml,
});
```

Pass `coachByline` into both shell calls. Use `renderUniversalInvitationText` for both universal body sources; retain current text functions otherwise. Add only `coachBylineMode: coachByline.mode` to delivery metadata. Route-level `logoRejectedReason` logging remains unchanged until Task 5 moves it to the combined resolution.

- [ ] **Step 4: Verify and commit**

```bash
npx jest src/__tests__/services/notifications.test.ts src/__tests__/lib/assessments/invitation-email.test.ts src/__tests__/lib/assessments/invitation-html-policy.test.ts --runInBand
npx eslint src/services/notifications.ts src/__tests__/services/notifications.test.ts
git add src/src/services/notifications.ts src/src/__tests__/services/notifications.test.ts
git commit -m "feat(assessments): enforce invitation shell ownership"
```

---

### Task 5: Unify all invitation send paths

**Files:**
- Modify: `src/src/lib/assessments/invite-send.ts:71-92,196-227,247-258,380-405`
- Modify: `src/src/__tests__/lib/invite-send.test.ts`
- Modify: `src/src/app/api/assessment-campaigns/[id]/invite/route.ts:229-258,295-326`
- Modify: `src/src/__tests__/api/assessment-campaigns/invite-route.test.ts:581-598,668-755`
- Modify: `src/src/inngest/functions/assessment-invite-fanout.ts:344-373,434-457`
- Modify: `src/src/__tests__/inngest/assessment-invite-fanout.test.ts:836-900`
- Modify: `src/src/app/api/assessment-campaigns/[id]/reminders/route.ts:343-370,430-465,790-815`
- Modify: `src/src/__tests__/api/assessment-campaigns/reminders-post.test.ts:590-605,1413-1505`
- Modify: `src/src/app/api/assessment-campaigns/[id]/invitations/[invitationId]/resend/route.ts:176-203,209-238`
- Modify: `src/src/__tests__/api/assessment-campaigns/resend-route.test.ts:298-375`
- Modify: `src/src/lib/assessments/invitation-email.ts:380-418`

**Interfaces:**
- Consumes: both chrome gates and `resolveInvitationCoachByline`.
- Produces: `InviteEmailInput.coachByline`, `SendInvitesInput.coachByline`, and one decision order in all four paths.

- [ ] **Step 1: Write the failing batch forwarding test**

```ts
const coachByline = {
  mode: "image_name" as const,
  coachName: "Dana Coach",
  coachImageUrl: "https://cdn.test/dana.png",
};
await sendInvitesBatch(deps, {
  ...input,
  chrome: "universalBanner",
  coachByline,
});
expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
  chrome: "universalBanner",
  coachByline,
}));
```

Replace batch expectations for separate identity fields.

- [ ] **Step 2: Write the four failing entry-point matrices**

For each existing Wave-P suite, test: new banner on/Wave-P off gives `universalBanner`; new banner killed/Wave-P on stays `waveP`; both off stays `legacy`. Each suite covers creator preference and creator-without-image/owner-with-image yielding:

```ts
expect(payload.coachByline).toEqual({
  mode: "name_only",
  coachName: "Creator Coach",
});
```

At least one suite covers owner fallback and no identity. Preserve both reminder preparation branches.

- [ ] **Step 3: Run the five suites and verify failure**

```bash
npx jest src/__tests__/lib/invite-send.test.ts src/__tests__/api/assessment-campaigns/invite-route.test.ts src/__tests__/inngest/assessment-invite-fanout.test.ts src/__tests__/api/assessment-campaigns/reminders-post.test.ts src/__tests__/api/assessment-campaigns/resend-route.test.ts --runInBand
```

Expected: FAIL on missing gate/byline plumbing.

- [ ] **Step 4: Update the batch contract**

In both input interfaces use:

```ts
chrome?: InvitationChrome;
coachByline?: InvitationCoachByline;
```

Default to `legacy` and `scaling_up_only` at the batch boundary, then forward unchanged. Retain Organization/template names for authored tokens.

- [ ] **Step 5: Use identical decision order in each entry point**

```ts
const scope = {
  organizationId: campaign.organizationId,
  templateId: campaign.templateId,
};
const chrome: InvitationChrome = isInvitationBannerEnabled(scope)
  ? "universalBanner"
  : isInviteEmailChromeEnabled(scope)
    ? "waveP"
    : "legacy";
const coachResolution = resolveInvitationCoachByline(
  campaign.creatorCoach ?? null,
  campaign.organization?.owner ?? null,
);
const coachByline = coachResolution.byline;
```

Adapt variable names only where reminder/resend use `c`. Pass `coachByline`. Replace logo logs with `chromeVariant`, `coachBylineMode`, and `logoRejectedReason: coachResolution.logoRejectedReason`; retain route IDs already logged and add no PII.

- [ ] **Step 6: Remove obsolete split resolvers**

Delete `resolveCoachName`, `resolveCoachLogo`, and their old tests after callers migrate.

```bash
rg -n "resolveCoachName|resolveCoachLogo" src/src
```

Expected: no matches.

- [ ] **Step 7: Verify and commit**

```bash
npx jest src/__tests__/lib/invite-send.test.ts src/__tests__/api/assessment-campaigns/invite-route.test.ts src/__tests__/inngest/assessment-invite-fanout.test.ts src/__tests__/api/assessment-campaigns/reminders-post.test.ts src/__tests__/api/assessment-campaigns/resend-route.test.ts src/__tests__/services/notifications.test.ts src/__tests__/lib/assessments/invitation-email.test.ts --runInBand
npx eslint src/lib/assessments/invite-send.ts 'src/app/api/assessment-campaigns/[id]/invite/route.ts' src/inngest/functions/assessment-invite-fanout.ts 'src/app/api/assessment-campaigns/[id]/reminders/route.ts' 'src/app/api/assessment-campaigns/[id]/invitations/[invitationId]/resend/route.ts'
git add src/src/lib/assessments/invite-send.ts src/src/lib/assessments/invitation-email.ts src/src/app/api/assessment-campaigns src/src/inngest/functions/assessment-invite-fanout.ts src/src/__tests__
git commit -m "refactor(assessments): unify invitation banner send paths"
```

---

### Task 6: Make authoring copy follow effective shell ownership

**Files:**
- Modify: `src/src/components/assessments/CampaignWizard.tsx:284-315,1099-1114,2218-2295,2445-2504`
- Modify: `src/src/components/assessments/CampaignDetail.tsx:100-107,258-388,1908-1974`
- Modify: `src/src/app/(portal)/portal/assessments/new/page.tsx:6-53`
- Modify: `src/src/app/(portal)/portal/assessments/[id]/page.tsx:21-31,221-227`
- Modify: `src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx:31-40,142-147`
- Modify: `src/src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx`
- Modify: `src/src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx`
- Modify: `src/src/__tests__/app/admin-campaign-detail-page.test.tsx`
- Modify: `src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx`

**Interfaces:**
- Consumes: `InvitationBannerAuthoringGate` for create and exact `isInvitationBannerEnabled(scope)` for details.
- Produces: `invitationBannerGate`/`invitationBannerEnabled` props and effective `platformOwnsInvitationShell` behavior.

- [ ] **Step 1: Write failing authoring tests**

Give the wizard `{ globallyEnabled: false, canaryIds: ["org-1"] }`, select `org-1`, and assert the label is `Custom HTML body (advanced)`, the description says branding/Coach/button/footer are automatic, the placeholder describes a body fragment, and no copy claims full replacement or requires `{{invitationUrl}}`.

Add global-enabled, nonmatching, and KILL-derived empty-snapshot cases. For Campaign Detail, pass `invitationBannerEnabled: true` with the GH #220 flag false and assert body-only copy/save summary.

- [ ] **Step 2: Run component tests and verify failure**

```bash
npx jest src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx --runInBand
```

Expected: FAIL because the new props do not exist.

- [ ] **Step 3: Compute effective ownership in the wizard**

```ts
const invitationBannerEnabled =
  invitationBannerGate?.globallyEnabled === true ||
  invitationBannerGate?.canaryIds.includes(state.organizationId) === true ||
  invitationBannerGate?.canaryIds.includes(state.templateId) === true;
const platformOwnsInvitationShell =
  brandedCustomHtmlEnabled || invitationBannerEnabled;
```

Use the effective boolean in `resolveInvitationHtmlMode`, `invitationHtmlEditorCopy`, and placeholder branches. Keep Wave-D as the only field-visibility capability. Add no banner controls.

- [ ] **Step 4: Compute effective ownership in Campaign Detail**

Add `invitationBannerEnabled?: boolean`, derive `brandedCustomHtmlEnabled || invitationBannerEnabled`, and use it for mode, copy, validation, and placeholders.

- [ ] **Step 5: Pass server-derived state from all pages**

The new-campaign page awaits `getInvitationBannerAuthoringGate(...)` with a
predicate composed from `canAccessOrganization` and `canAccessTemplate` for the
authenticated Coach. Portal/admin detail pages pass enablement only when the
persisted campaign has `accessMode === "INVITED"`:

```ts
campaign.accessMode === "INVITED" &&
  isInvitationBannerEnabled({
    organizationId: overview.campaign.organizationId ?? undefined,
    templateId: overview.campaign.templateId,
  })
```

Update page mocks/assertions. Client modules never read `process.env`.

- [ ] **Step 6: Verify and commit**

```bash
npx jest src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx src/__tests__/app/admin-campaign-detail-page.test.tsx src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx --runInBand
npx eslint src/components/assessments/CampaignWizard.tsx src/components/assessments/CampaignDetail.tsx 'src/app/(portal)/portal/assessments/new/page.tsx' 'src/app/(portal)/portal/assessments/[id]/page.tsx' 'src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx'
git add src/src/components/assessments/CampaignWizard.tsx src/src/components/assessments/CampaignDetail.tsx 'src/src/app/(portal)/portal/assessments/new/page.tsx' 'src/src/app/(portal)/portal/assessments/[id]/page.tsx' 'src/src/app/(dashboard)/admin/assessments/campaigns/[id]/page.tsx' src/src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx src/src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx src/src/__tests__/app/admin-campaign-detail-page.test.tsx src/src/__tests__/app/portal-campaign-detail-publish-gate.test.tsx
git commit -m "fix(assessments): describe custom html as invitation body"
```

---

### Task 7: Add real-renderer visual acceptance capture

**Files:**
- Create: `src/scripts/capture-invitation-banner-previews.ts`
- Create: `src/src/__tests__/scripts/capture-invitation-banner-previews.test.ts`
- Modify: `src/package.json`

**Interfaces:**
- Consumes: `buildInvitationEmailHtml`, `buildInvitationEmailShell`, `renderCustomHtmlFragment`, and Playwright Chromium.
- Produces: seven local PNGs and an `index.html` manifest in an explicit output directory; never SMTP.

- [ ] **Step 1: Write the failing capture-script contract test**

Run the script in a temporary directory and assert exit `0` plus:

```ts
const expected = [
  "01-image-name-markdown-desktop.png",
  "02-name-only-markdown-desktop.png",
  "03-scaling-up-only-markdown-desktop.png",
  "04-image-name-custom-html-desktop.png",
  "05-image-name-markdown-mobile.png",
  "06-name-only-long-name-mobile.png",
  "07-image-blocked-desktop.png",
  "index.html",
];
```

Manifest contains `data-renderer="buildInvitationEmailShell"` and `Your coach`; SMTP addresses, credential fragments, customer values, and Organization-banner markers are absent. Script imports no notification/SMTP module.

- [ ] **Step 2: Run the test and verify failure**

```bash
npx jest src/__tests__/scripts/capture-invitation-banner-previews.test.ts --runInBand
```

Expected: FAIL because the script/command do not exist.

- [ ] **Step 3: Implement deterministic non-production capture**

Add `"capture:invitation-banner": "npx tsx scripts/capture-invitation-banner-previews.ts"` to `package.json`. Require one absolute output path. Use fixed non-customer values and a URL without `#t=`. Markdown calls `buildInvitationEmailHtml`; custom HTML calls `renderCustomHtmlFragment` then `buildInvitationEmailShell`; all use `universalBanner`.

Use `page.setContent()` with renderer output. In the capture harness only, replace `cid:sulogo` with a local data URL; do not reconstruct banner HTML. Fulfill the fixed Coach HTTPS request with deterministic in-memory image bytes and abort it for image-blocked capture. Capture desktop `760×900`, mobile `390×844`, and only the email root. Fail on horizontal overflow, missing CTA/fallback/footer, wrong byline state, or Organization-banner marker.

- [ ] **Step 4: Run and visually inspect all fixtures**

```bash
npx jest src/__tests__/scripts/capture-invitation-banner-previews.test.ts --runInBand
preview_dir="$(mktemp -d)"
npm run capture:invitation-banner -- "$preview_dir"
find "$preview_dir" -maxdepth 1 -type f -print | sort
```

Expected: eight exact files. Inspect all PNGs for hierarchy, long-name wrapping, mobile width, image-blocked degradation, CTA, fallback, footer, and absent Organization banner line.

- [ ] **Step 5: Verify and commit**

```bash
npx eslint scripts/capture-invitation-banner-previews.ts src/__tests__/scripts/capture-invitation-banner-previews.test.ts
git add package.json scripts/capture-invitation-banner-previews.ts src/src/__tests__/scripts/capture-invitation-banner-previews.test.ts
git commit -m "test(assessments): capture invitation banner previews"
```

Do not commit generated screenshots without a separately approved documentation location.

---

### Task 8: Document rollout and run the full verification gate

**Files:**
- Modify: `docs/specs/v7.6/17d-ops-runbook.md`
- Modify: `CLAUDE.md`
- Modify: `plans/CHANGELOG.md`

**Interfaces:**
- Consumes: implemented flag names, existing read-only override audit, capture command, and repository validation commands.
- Produces: accurate default-off receipt and safe operator sequence; no Production mutation.

- [ ] **Step 1: Update the ops runbook**

Document the three flags and KILL > ENABLED > exact Organization/Template canary. Record this sequence: deploy dark; run the existing read-only custom-HTML override audit with actual current flags; manually review every live override; stop on any unreviewed override; capture all seven visual states; enable one exact test canary; verify Ready deployment/health and organic-send telemetry; obtain separate authorization before global enablement.

State that enabled universal banner forces body-only custom HTML without synchronizing `ASSESSMENT_INVITE_BRANDED_CUSTOM_HTML_ENABLED`. Rollback is KILL or disable/canary removal plus redeploy, with no data mutation.

- [ ] **Step 2: Record only implemented/default-off state**

Prepend `plans/CHANGELOG.md` and update `CLAUDE.md` with implementation status, absent/default-off flags, actual test results after they run, and links to design/plan. Explicitly record no Production flag read/mutation, deployment, database write, or customer email. Do not claim launch or Production verification.

- [ ] **Step 3: Run focused suites**

```bash
npx jest src/__tests__/lib/assessments/wave-invitation-banner-flags.test.ts src/__tests__/lib/assessments/invitation-email.test.ts src/__tests__/lib/assessments/invitation-html-policy.test.ts src/__tests__/lib/assessments/invitation-html-editor-copy.test.ts src/__tests__/services/notifications.test.ts src/__tests__/lib/invite-send.test.ts src/__tests__/api/assessment-campaigns/invite-route.test.ts src/__tests__/inngest/assessment-invite-fanout.test.ts src/__tests__/api/assessment-campaigns/reminders-post.test.ts src/__tests__/api/assessment-campaigns/resend-route.test.ts src/__tests__/components/assessments/campaign-wizard-invitation-html-branding.test.tsx src/__tests__/components/assessments/campaign-detail-invitation-html-branding.test.tsx src/__tests__/scripts/capture-invitation-banner-previews.test.ts src/__tests__/lib/assessments/public-campaign-create-options.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 4: Run repository gates**

```bash
node scripts/check-migration-safety.mjs
npx eslint src/lib/assessments/wave-invitation-banner-flags.ts src/lib/assessments/invitation-email.ts src/lib/assessments/invite-send.ts src/services/notifications.ts src/inngest/functions/assessment-invite-fanout.ts src/components/assessments/CampaignWizard.tsx src/components/assessments/CampaignDetail.tsx scripts/capture-invitation-banner-previews.ts
npx tsc --noEmit
CI=true npx next build --turbopack
npx jest --runInBand
```

Expected: all pass. Record observed Jest counts, not predicted counts.

- [ ] **Step 5: Verify scope and cleanliness**

```bash
git diff origin/main -- src/src/lib/assessments/report-email.ts src/src/lib/assessments/report-email-chrome.ts src/src/components/assessments/BrandedReport.tsx
git diff origin/main -- 'src/src/app/(public)' src/src/app/api/admin/public-campaigns src/src/lib/assessments/public-campaign-create-options.ts
git diff --check
git status --short
```

Expected: no report-email diff, no whitespace errors, and only intentional documentation edits unstaged.

- [ ] **Step 6: Commit the receipt and inspect the branch**

```bash
git add docs/specs/v7.6/17d-ops-runbook.md CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(assessments): record invitation banner dark merge"
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: clean branch with design, plan, and implementation commits; no Production state change.
