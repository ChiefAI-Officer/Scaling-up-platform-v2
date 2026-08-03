# GH #228 Results Report Email Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Results report email a consistent, email-safe Scaling Up mark and optional subordinate Coach byline without changing report content, recipients, approval, or outbox-delivery semantics.

**Architecture:** Resolve a default-off/canary/kill chrome variant once in each submission path and pass it into the pure shared report renderer. A focused chrome helper supplies byte-identical legacy fragments or the approved branded cover/footer, while a separate worker-boundary helper derives the one static CID attachment from an exact token in frozen HTML. Invited and public routes supply different trusted coach provenance but store the same frozen HTML contract in the existing outbox.

**Tech Stack:** TypeScript, Next.js 16 route handlers, Jest, Prisma, Nodemailer through `sendEmailViaSMTP`, Inngest, email-safe table HTML, ESLint, Turbopack.

## Global Constraints

- Task 1 is a hard visual gate: do not start Task 2 or modify product code until the user approves the desktop and mobile mockups.
- Apply the branded variant to all three Results report emails: invited `ASSESSMENT_RESULTS`, public `TAKER_COPY`, and public `REFERRING_COACH`.
- Keep the actual Scaling Up mark first and the optional `Coached by {name}` Coach byline subordinate in both cover and footer.
- Invited reports use only the campaign creator coach; public attributed reports use only the frozen verified Referring coach; never substitute the Organization owner.
- A usable coach name is required. Render image plus name when the HTTPS image is valid, name only when the image is absent or rejected, and no Coach byline when the name is blank.
- Use the existing `SU_LOGO_PNG` bytes under the new CID `su-report-logo-v1`; do not fetch, proxy, or embed coach images.
- `ReportEmailChrome` defaults to `"legacy"`; all disabled output must remain byte-identical and attach nothing.
- `WAVE_228_REPORT_EMAIL_CHROME_KILL` overrides global and canary enablement; it changes only newly rendered rows.
- Existing queued rows, recipients, approval hashes, send leases, retries, dead-letter behavior, and provider handoff remain unchanged.
- `ASSESSMENT_SENDS_PAUSED` remains the containment control for rows already queued.
- Add no Prisma schema change or migration.
- Keep GH #220, GH #233, GH #256, and GH #257 out of scope.
- Do not change short `COACH_COMPLETION` notifications or `SU_TEAM` lead summaries.
- Do not flip production flags or send a live customer email as part of implementation.

## File Map

- Create `docs/specs/v7.6/mockups/228-report-email-branding.html`: isolated, email-table-faithful visual review artifact.
- Create `docs/specs/v7.6/mockups/228-report-email-branding-desktop.png`: 640px-email desktop review receipt.
- Create `docs/specs/v7.6/mockups/228-report-email-branding-mobile.png`: 390px viewport review receipt.
- Create `src/src/lib/assessments/wave-228-flags.ts`: pure default-off/global/canary/kill variant resolver.
- Create `src/src/__tests__/lib/assessments/wave-228-flags.test.ts`: exact flag truthiness, canary, and kill-precedence contract.
- Create `src/src/lib/assessments/report-email-chrome.ts`: shared legacy/branded cover and footer fragments plus CID constants.
- Create `src/src/__tests__/assessments/report-email-chrome.test.ts`: Coach byline fallbacks, escaping, ordering, and email-safe markup.
- Modify `src/src/lib/assessments/report-email.ts`: accept `ReportEmailChrome` and use one shared chrome result for scored and qualitative reports.
- Modify `src/src/__tests__/assessments/report-email.test.ts`: scored branded and byte-equivalent legacy coverage.
- Modify `src/src/__tests__/assessments/report-email-qualitative.test.ts`: qualitative branded and byte-equivalent legacy coverage.
- Modify `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts`: resolve the variant and extend the two-phase invited fingerprint with branded Coach inputs.
- Modify `src/src/__tests__/app/org-survey/submit.test.ts`: invited gate, provenance, drift, and unchanged-notification coverage.
- Modify `src/src/lib/assessments/quick-assessment-lead.ts`: return verified public coach `profileImage` with the existing identity fields.
- Modify `src/src/__tests__/assessments/active-coach-lookup.test.ts`: pin the widened verified-coach return shape.
- Modify `src/src/app/api/quiz/[campaignAlias]/submit/route.ts`: supply frozen Referring coach branding to taker and coach report copies.
- Modify `src/src/__tests__/api/quick-assessment-submit.test.ts`: public provenance, fallbacks, gate, deletion recovery, and same-mailbox coverage.
- Create `src/src/lib/assessments/report-email-attachments.ts`: exact-token-to-static-attachment resolver.
- Create `src/src/__tests__/assessments/report-email-attachments.test.ts`: exact token, escaped-copy, unrelated-CID, and single-attachment coverage.
- Modify `src/src/inngest/functions/quick-assessment-lead-email.ts`: pass derived attachments through the existing SMTP handoff.
- Modify `src/src/__tests__/inngest/quick-assessment-lead-email.test.ts`: frozen-body attachment and existing retry/lease behavior coverage.
- Modify `src/.env.example`: document the three default-off GH #228 controls.
- Modify `docs/superpowers/specs/2026-08-03-gh-228-emailed-report-branding-design.md`: record mockup approval and implementation status.
- Modify `CLAUDE.md`: refresh the source-of-truth anchor and GH #228 implementation state.
- Modify `plans/CHANGELOG.md`: prepend implementation and verification evidence.

---

### Task 1: Produce and approve the isolated email mockups

**Files:**
- Create: `docs/specs/v7.6/mockups/228-report-email-branding.html`
- Create: `docs/specs/v7.6/mockups/228-report-email-branding-desktop.png`
- Create: `docs/specs/v7.6/mockups/228-report-email-branding-mobile.png`
- Modify: `docs/superpowers/specs/2026-08-03-gh-228-emailed-report-branding-design.md:1-8`

**Interfaces:**
- Consumes: `src/public/brand/su-logo-white.png` and the presentation contract in the approved design.
- Produces: the exact cover/footer arrangement that `buildReportEmailChrome()` in Task 3 must reproduce.

- [ ] **Step 1: Invoke the visual-design skill**

Read and follow `frontend-design:frontend-design` before authoring the mockup. Keep the artifact under `docs/specs/v7.6/mockups/`; do not touch `src/src/`.

- [ ] **Step 2: Build one self-contained review page**

Use a 640px presentation table, inline styles inside each email frame, and these exact brand blocks:

```html
<tr>
  <td style="background:#522583;padding:28px 32px 26px;color:#ffffff;">
    <img src="../../../../src/public/brand/su-logo-white.png"
         alt="Scaling Up" width="180"
         style="display:block;border:0;outline:none;max-width:180px;height:auto;" />
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="margin-top:12px;">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4OCIgaGVpZ2h0PSI4OCIgdmlld0JveD0iMCAwIDg4IDg4Ij48cmVjdCB3aWR0aD0iODgiIGhlaWdodD0iODgiIHJ4PSIxMiIgZmlsbD0iI2ZmZmZmZiIvPjx0ZXh0IHg9IjQ0IiB5PSI1NCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNTIyNTgzIj5BQzwvdGV4dD48L3N2Zz4="
               alt="" width="44"
               style="display:block;border:0;outline:none;max-height:44px;max-width:200px;height:auto;width:auto;" />
        </td>
        <td style="vertical-align:middle;color:#ffffff;font-size:13px;">
          Coached by Alex Coach
        </td>
      </tr>
    </table>
  </td>
</tr>
```

Use the same semantic order in the purple footer:

```html
<tr>
  <td style="background:#522583;padding:18px 32px 20px;color:#ffffff;">
    <img src="../../../../src/public/brand/su-logo-white.png"
         alt="Scaling Up" width="120"
         style="display:block;border:0;outline:none;max-width:120px;height:auto;" />
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="margin-top:10px;">
      <tr>
        <td style="vertical-align:middle;padding-right:8px;">
          <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4OCIgaGVpZ2h0PSI4OCIgdmlld0JveD0iMCAwIDg4IDg4Ij48cmVjdCB3aWR0aD0iODgiIGhlaWdodD0iODgiIHJ4PSIxMiIgZmlsbD0iI2ZmZmZmZiIvPjx0ZXh0IHg9IjQ0IiB5PSI1NCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI4IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjNTIyNTgzIj5BQzwvdGV4dD48L3N2Zz4="
               alt="" width="28"
               style="display:block;border:0;outline:none;max-height:28px;max-width:120px;height:auto;width:auto;" />
        </td>
        <td style="vertical-align:middle;color:#ffffff;font-size:12px;">
          Coached by Alex Coach
        </td>
      </tr>
    </table>
    <div style="margin-top:10px;font-size:11px;opacity:.82;">
      August 3, 2026 &middot; Generated by Scaling Up Platform
    </div>
  </td>
</tr>
```

The page must show these labeled cases without introducing alternate layouts:

1. scored report with coach image and name;
2. qualitative report with coach image and name;
3. blocked remote image with the name still visible;
4. name-only provenance;
5. blank coach name with Scaling Up only; and
6. no coach with Scaling Up only.

The `data:image/svg+xml` Coach mark is a mockup-only neutral stand-in so the
review artifact is deterministic. It must not be copied into product code;
production Coach images remain remote HTTPS URLs filtered by `safeImageSrc`.

- [ ] **Step 3: Render desktop and mobile receipts**

Serve the artifact from the repository root:

```bash
python3 -m http.server 4173
```

Capture:

- a desktop screenshot at `1440×1000` showing the centered 640px email; and
- a mobile screenshot at `390×844` showing no horizontal overflow.

Write them to the two declared PNG paths. Verify the mobile document width is at most `390px`, Scaling Up precedes the Coach byline, and the blocked-image case still identifies the coach.

- [ ] **Step 4: HARD GATE — obtain explicit user approval**

Present both receipts and the HTML artifact. Stop here until the user approves them. If the user requests a visual change, revise the mockup and the presentation section of the design spec before asking again. Do not start Task 2.

- [ ] **Step 5: Record the approved visual**

After approval, add this line beneath the design status:

```markdown
- **Approved visual:** [`docs/specs/v7.6/mockups/228-report-email-branding.html`](../../specs/v7.6/mockups/228-report-email-branding.html)
```

Change the status to:

```markdown
- **Status:** Written design and visual mockups approved; implementation pending
```

- [ ] **Step 6: Validate and commit the design artifacts**

```bash
git diff --check
git add docs/specs/v7.6/mockups/228-report-email-branding.html \
  docs/specs/v7.6/mockups/228-report-email-branding-desktop.png \
  docs/specs/v7.6/mockups/228-report-email-branding-mobile.png \
  docs/superpowers/specs/2026-08-03-gh-228-emailed-report-branding-design.md
git commit -m "docs(design): approve GH 228 report email mockups"
```

Expected: `git diff --check` emits no output and the commit contains only mockup/design artifacts.

---

### Task 2: Add the default-off report-email chrome gate

**Files:**
- Create: `src/src/lib/assessments/wave-228-flags.ts`
- Create: `src/src/__tests__/lib/assessments/wave-228-flags.test.ts`
- Modify: `src/.env.example:115-117`

**Interfaces:**
- Produces: `reportEmailChromeForCampaign(campaignId?: string): "legacy" | "gh228"`.
- Consumed by: invited and public submit routes in Tasks 4 and 5.

- [ ] **Step 1: Write the failing flag matrix**

```ts
import { reportEmailChromeForCampaign } from "@/lib/assessments/wave-228-flags";

const ENABLED = "WAVE_228_REPORT_EMAIL_CHROME_ENABLED";
const CANARY = "WAVE_228_REPORT_EMAIL_CHROME_CANARY";
const KILL = "WAVE_228_REPORT_EMAIL_CHROME_KILL";
const original = {
  enabled: process.env[ENABLED],
  canary: process.env[CANARY],
  kill: process.env[KILL],
};

afterEach(() => {
  delete process.env[ENABLED];
  delete process.env[CANARY];
  delete process.env[KILL];
});

afterAll(() => {
  for (const [key, value] of [
    [ENABLED, original.enabled],
    [CANARY, original.canary],
    [KILL, original.kill],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it("defaults to legacy", () => {
  expect(reportEmailChromeForCampaign("camp-1")).toBe("legacy");
});

it.each(["1", "true", "TRUE", "yes"])(
  "enables globally for %s",
  (value) => {
    process.env[ENABLED] = value;
    expect(reportEmailChromeForCampaign("camp-1")).toBe("gh228");
  },
);

it("matches exact comma-or-whitespace-delimited campaign IDs", () => {
  process.env[CANARY] = "camp-a, camp-b\ncamp-c";
  expect(reportEmailChromeForCampaign("camp-b")).toBe("gh228");
  expect(reportEmailChromeForCampaign("camp")).toBe("legacy");
  expect(reportEmailChromeForCampaign()).toBe("legacy");
});

it("gives kill precedence over global and canary", () => {
  process.env[ENABLED] = "1";
  process.env[CANARY] = "camp-1";
  process.env[KILL] = "yes";
  expect(reportEmailChromeForCampaign("camp-1")).toBe("legacy");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

From `src/`:

```bash
npx jest src/__tests__/lib/assessments/wave-228-flags.test.ts --runInBand
```

Expected: FAIL because `wave-228-flags.ts` does not exist.

- [ ] **Step 3: Implement the pure resolver**

```ts
export type ReportEmailChrome = "legacy" | "gh228";

function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function canaryMatches(raw: string | undefined, campaignId: string | undefined): boolean {
  if (!campaignId) return false;
  return (raw ?? "")
    .split(/[\s,]+/u)
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(campaignId);
}

export function reportEmailChromeForCampaign(
  campaignId?: string,
): ReportEmailChrome {
  if (isOn(process.env.WAVE_228_REPORT_EMAIL_CHROME_KILL)) return "legacy";
  if (isOn(process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED)) return "gh228";
  return canaryMatches(
    process.env.WAVE_228_REPORT_EMAIL_CHROME_CANARY,
    campaignId,
  )
    ? "gh228"
    : "legacy";
}
```

- [ ] **Step 4: Document the controls**

Append near the other assessment-wave flags in `src/.env.example`:

```dotenv
WAVE_228_REPORT_EMAIL_CHROME_ENABLED="false"
WAVE_228_REPORT_EMAIL_CHROME_CANARY=""
WAVE_228_REPORT_EMAIL_CHROME_KILL="false"
```

- [ ] **Step 5: Verify GREEN and lint**

```bash
npx jest src/__tests__/lib/assessments/wave-228-flags.test.ts --runInBand
npx eslint src/lib/assessments/wave-228-flags.ts src/__tests__/lib/assessments/wave-228-flags.test.ts
git diff --check
```

Expected: the focused suite passes; ESLint exits `0`; diff check emits no output.

- [ ] **Step 6: Commit**

```bash
git add src/src/lib/assessments/wave-228-flags.ts \
  src/src/__tests__/lib/assessments/wave-228-flags.test.ts \
  src/.env.example
git commit -m "feat(assessments): add GH 228 email chrome gate"
```

---

### Task 3: Build the shared branded cover and footer

**Files:**
- Create: `src/src/lib/assessments/report-email-chrome.ts`
- Create: `src/src/__tests__/assessments/report-email-chrome.test.ts`
- Modify: `src/src/lib/assessments/report-email.ts:66-79,620-711,713-1120`
- Modify: `src/src/__tests__/assessments/report-email.test.ts`
- Modify: `src/src/__tests__/assessments/report-email-qualitative.test.ts`

**Interfaces:**
- Consumes: `ReportEmailChrome` from `wave-228-flags.ts`, `safeImageSrc()`, `escapeHtml()`, and the Task 1 approved markup.
- Produces: `REPORT_EMAIL_LOGO_CID`, `REPORT_EMAIL_LOGO_SRC`, `buildReportEmailChrome(input)`, and `buildReportEmailHtml({ report, recipientRole, chrome? })`.

- [ ] **Step 1: Freeze the current legacy bytes before modifying the renderer**

Add one scored and one qualitative snapshot assertion using the existing fixed fixtures:

```ts
expect(
  buildReportEmailHtml({
    report: fourDecisionsReport(),
    recipientRole: "TAKER_COPY",
  }).bodyHtml,
).toMatchSnapshot("legacy-scored-report-email");
```

```ts
expect(
  buildReportEmailHtml({
    report: qualReport({
      templateAlias: "qsp-v2",
      sections: [],
      questionsByKey: {},
      rawAnswers: [],
    }),
    recipientRole: "TAKER_COPY",
  }).bodyHtml,
).toMatchSnapshot("legacy-qualitative-report-email");
```

Generate and inspect the snapshots before production changes:

```bash
npx jest src/__tests__/assessments/report-email.test.ts \
  src/__tests__/assessments/report-email-qualitative.test.ts \
  --runInBand -u
```

Expected: both suites pass and the snapshots contain the current text `SCALING UP`, current footer, and no `cid:su-report-logo-v1`.

Commit the pre-change baselines before adding branded behavior:

```bash
git add src/src/__tests__/assessments/report-email.test.ts \
  src/src/__tests__/assessments/report-email-qualitative.test.ts \
  src/src/__tests__/assessments/__snapshots__/report-email.test.ts.snap \
  src/src/__tests__/assessments/__snapshots__/report-email-qualitative.test.ts.snap
git commit -m "test(assessments): freeze legacy report email bytes"
```

- [ ] **Step 2: Write failing pure chrome tests**

```ts
import {
  REPORT_EMAIL_LOGO_CID,
  REPORT_EMAIL_LOGO_SRC,
  buildReportEmailChrome,
} from "@/lib/assessments/report-email-chrome";

it("keeps the exact legacy fragments", () => {
  expect(
    buildReportEmailChrome({
      chrome: "legacy",
      coachName: "Alex Coach",
      coachLogoUrl: "https://images.example/coach.png",
      escapedDate: "August 3, 2026",
    }),
  ).toEqual({
    coverBrandHtml:
      '<div style="font-weight:800;letter-spacing:0.04em;font-size:14px;color:#ffffff;margin-bottom:14px;">SCALING UP</div>',
    footerCellHtml:
      '<td align="center" style="padding:18px 32px 26px;font-size:11px;color:#6b6480;">August 3, 2026 &middot; Generated by Scaling Up Platform</td>',
    bylineState: "none",
  });
});

it("renders Scaling Up before an escaped image-and-name byline", () => {
  const result = buildReportEmailChrome({
    chrome: "gh228",
    coachName: 'Alex <Coach>',
    coachLogoUrl: 'https://images.example/a"b.png',
    escapedDate: "August 3, 2026",
  });
  expect(result.coverBrandHtml.indexOf(REPORT_EMAIL_LOGO_SRC)).toBeLessThan(
    result.coverBrandHtml.indexOf("Coached by"),
  );
  expect(result.coverBrandHtml).toContain("Alex &lt;Coach&gt;");
  expect(result.coverBrandHtml).toContain("alt=\"\"");
  expect(result.footerCellHtml).toContain(`cid:${REPORT_EMAIL_LOGO_CID}`);
  expect(result.footerCellHtml).toContain("https://images.example/a&quot;b.png");
  expect(result.footerCellHtml).toContain("Coached by Alex &lt;Coach&gt;");
  expect(result.bylineState).toBe("image-and-name");
});

it.each([
  ["http://images.example/coach.png", "name-only"],
  ["javascript:alert(1)", "name-only"],
  [null, "name-only"],
] as const)("degrades rejected image %p to %s", (coachLogoUrl, state) => {
  const result = buildReportEmailChrome({
    chrome: "gh228",
    coachName: "Alex Coach",
    coachLogoUrl,
    escapedDate: "August 3, 2026",
  });
  expect(result.bylineState).toBe(state);
  expect(result.coverBrandHtml).toContain("Coached by Alex Coach");
  expect(result.coverBrandHtml).not.toContain(String(coachLogoUrl));
});

it("never renders an image without a usable coach name", () => {
  const result = buildReportEmailChrome({
    chrome: "gh228",
    coachName: "   ",
    coachLogoUrl: "https://images.example/coach.png",
    escapedDate: "August 3, 2026",
  });
  expect(result.bylineState).toBe("none");
  expect(result.coverBrandHtml).not.toContain("images.example");
  expect(result.coverBrandHtml).not.toContain("Coached by");
});
```

- [ ] **Step 3: Run the pure test and verify RED**

```bash
npx jest src/__tests__/assessments/report-email-chrome.test.ts --runInBand
```

Expected: FAIL because the chrome module does not exist.

- [ ] **Step 4: Implement the focused chrome helper**

Use these public types and constants:

```ts
import { safeImageSrc } from "@/lib/assessments/safe-image-src";
import { escapeHtml } from "@/lib/templates/interpolate-content-html";
import type { ReportEmailChrome } from "@/lib/assessments/wave-228-flags";

export const REPORT_EMAIL_LOGO_CID = "su-report-logo-v1";
export const REPORT_EMAIL_LOGO_SRC = `cid:${REPORT_EMAIL_LOGO_CID}`;

export type CoachBylineState = "none" | "name-only" | "image-and-name";

export interface ReportEmailChromeResult {
  coverBrandHtml: string;
  footerCellHtml: string;
  bylineState: CoachBylineState;
}

export function buildReportEmailChrome(input: {
  chrome: ReportEmailChrome;
  coachName?: string | null;
  coachLogoUrl?: string | null;
  escapedDate: string;
}): ReportEmailChromeResult {
  if (input.chrome === "legacy") {
    return {
      coverBrandHtml:
        '<div style="font-weight:800;letter-spacing:0.04em;font-size:14px;color:#ffffff;margin-bottom:14px;">SCALING UP</div>',
      footerCellHtml:
        `<td align="center" style="padding:18px 32px 26px;font-size:11px;color:#6b6480;">${input.escapedDate} &middot; Generated by Scaling Up Platform</td>`,
      bylineState: "none",
    };
  }

  const displayName = (input.coachName ?? "").trim();
  const imageSrc = displayName ? safeImageSrc(input.coachLogoUrl) : null;
  const escapedName = escapeHtml(displayName);
  const escapedImageSrc = imageSrc ? escapeHtml(imageSrc) : null;
  const state: CoachBylineState =
    displayName === ""
      ? "none"
      : escapedImageSrc
        ? "image-and-name"
        : "name-only";
  const coverImage = escapedImageSrc
    ? `<td style="vertical-align:middle;padding-right:10px;"><img src="${escapedImageSrc}" alt="" style="display:block;border:0;outline:none;max-height:40px;max-width:200px;height:auto;width:auto;" /></td>`
    : "";
  const footerImage = escapedImageSrc
    ? `<td style="vertical-align:middle;padding-right:8px;"><img src="${escapedImageSrc}" alt="" style="display:block;border:0;outline:none;max-height:28px;max-width:120px;height:auto;width:auto;" /></td>`
    : "";
  const coverByline =
    state === "none"
      ? ""
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>${coverImage}<td style="vertical-align:middle;color:#ffffff;font-size:13px;">Coached by ${escapedName}</td></tr></table>`;
  const footerByline =
    state === "none"
      ? ""
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr>${footerImage}<td style="vertical-align:middle;color:#ffffff;font-size:12px;">Coached by ${escapedName}</td></tr></table>`;
  const coverBrandHtml =
    `<img src="${REPORT_EMAIL_LOGO_SRC}" alt="Scaling Up" width="180" style="display:block;border:0;outline:none;max-width:180px;height:auto;" />${coverByline}`;
  const footerCellHtml =
    `<td style="background:#522583;padding:18px 32px 20px;color:#ffffff;">` +
    `<img src="${REPORT_EMAIL_LOGO_SRC}" alt="Scaling Up" width="120" style="display:block;border:0;outline:none;max-width:120px;height:auto;" />` +
    `${footerByline}<div style="margin-top:10px;font-size:11px;color:#ffffff;opacity:0.82;">${input.escapedDate} &middot; Generated by Scaling Up Platform</div>` +
    `</td>`;

  return { coverBrandHtml, footerCellHtml, bylineState: state };
}
```

If Task 1 approved different spacing or dimensions, change only those literal presentation values while preserving the exported interface and all semantic/fallback assertions.

- [ ] **Step 5: Add the renderer variant and shared fragments**

Extend the renderer interface:

```ts
import type { ReportEmailChrome } from "@/lib/assessments/wave-228-flags";
import { buildReportEmailChrome } from "@/lib/assessments/report-email-chrome";

export interface BuildReportEmailArgs {
  report: RespondentReport;
  recipientRole: ReportEmailRecipientRole;
  chrome?: ReportEmailChrome;
}
```

Default during destructuring:

```ts
export function buildReportEmailHtml({
  report,
  recipientRole,
  chrome = "legacy",
}: BuildReportEmailArgs): ReportEmail {
```

Build the fragments once after `escDate`:

```ts
const emailChrome = buildReportEmailChrome({
  chrome,
  coachName: report.coachName,
  coachLogoUrl: report.coachLogoUrl,
  escapedDate: escDate,
});
```

Add `footerCellHtml: string` to the `buildQualitativeReportEmail()` input type
and destructuring, and pass `emailChrome.footerCellHtml` at the qualitative
dispatch.

Replace the current cover `SCALING UP` div with
`${emailChrome.coverBrandHtml}`. Pass `emailChrome.footerCellHtml` into
`buildQualitativeReportEmail` and replace only the existing footer `<td>` in
both shells, preserving each shell's existing `<tr>` and indentation byte for
byte. Do not duplicate coach lookup or fallback logic in either anatomy.

- [ ] **Step 6: Add renderer integration assertions**

In `report-email.test.ts`, use the existing scored fixture:

```ts
const report = fourDecisionsReport();
const legacyDefault = buildReportEmailHtml({
  report,
  recipientRole: "TAKER_COPY",
});
const legacyExplicit = buildReportEmailHtml({
  report,
  recipientRole: "TAKER_COPY",
  chrome: "legacy",
});
expect(legacyExplicit).toEqual(legacyDefault);
expect(legacyExplicit.bodyHtml).toMatchSnapshot();

const branded = buildReportEmailHtml({
  report: {
    ...report,
    coachName: "Alex Coach",
    coachLogoUrl: "https://images.example/coach.png",
  },
  recipientRole: "TAKER_COPY",
  chrome: "gh228",
});
expect(branded.bodyHtml.match(/cid:su-report-logo-v1/g)).toHaveLength(2);
expect(branded.bodyHtml.indexOf("cid:su-report-logo-v1")).toBeLessThan(
  branded.bodyHtml.indexOf("Coached by Alex Coach"),
);
expect(branded.bodyHtml).not.toMatch(/display:(?:flex|grid)/);
expect(branded.bodyHtml).not.toContain("<style");
expect(branded.bodyHtml).not.toContain("<link");
```

In `report-email-qualitative.test.ts`, repeat the same default-versus-explicit
legacy equality and branded assertions with this concrete fixture:

```ts
const report = qualReport({
  templateAlias: "qsp-v2",
  sections: [{ stableKey: "s1", name: "Priorities" }],
  questionsByKey: {
    q1: {
      type: "TEXT",
      label: "What changed?",
      sectionStableKey: "s1",
    },
  },
  rawAnswers: [{ stableKey: "q1", value: "We clarified priorities." }],
});
```

In the scored suite, also assert `REFERRING_COACH` gets the same chrome,
invalid HTTPS input falls back to name-only, and blank name suppresses a valid
image.

- [ ] **Step 7: Verify focused suites GREEN without updating snapshots**

```bash
npx jest src/__tests__/assessments/report-email-chrome.test.ts \
  src/__tests__/assessments/report-email.test.ts \
  src/__tests__/assessments/report-email-qualitative.test.ts \
  src/__tests__/assessments/report-email.wave-s-guard.test.ts \
  src/__tests__/assessments/report-email.wave-u3-findings.test.ts \
  --runInBand
npx eslint src/lib/assessments/report-email-chrome.ts \
  src/lib/assessments/report-email.ts \
  src/__tests__/assessments/report-email-chrome.test.ts \
  src/__tests__/assessments/report-email.test.ts \
  src/__tests__/assessments/report-email-qualitative.test.ts
git diff --check
```

Expected: all suites pass with the pre-change legacy snapshots unchanged; ESLint and diff check pass.

- [ ] **Step 8: Commit**

```bash
git add src/src/lib/assessments/report-email-chrome.ts \
  src/src/lib/assessments/report-email.ts \
  src/src/__tests__/assessments/report-email-chrome.test.ts \
  src/src/__tests__/assessments/report-email.test.ts \
  src/src/__tests__/assessments/report-email-qualitative.test.ts \
  src/src/__tests__/assessments/__snapshots__/report-email.test.ts.snap \
  src/src/__tests__/assessments/__snapshots__/report-email-qualitative.test.ts.snap
git commit -m "feat(assessments): brand results report email chrome"
```

---

### Task 4: Wire invited creator-coach provenance and stale-row protection

**Files:**
- Modify: `src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts:83-314,380-398,539-598,623-698`
- Modify: `src/src/__tests__/app/org-survey/submit.test.ts:430-735`

**Interfaces:**
- Consumes: `reportEmailChromeForCampaign(campaign.id)` and `buildReportEmailHtml({ chrome })`.
- Produces: invited `ASSESSMENT_RESULTS` rows whose frozen HTML and Phase-1/Phase-2 fingerprint agree on chrome, creator Coach identity, name, and image.

- [ ] **Step 1: Write failing invited-path tests**

Add cases that set and restore the three GH #228 env vars:

First extend the existing `mockHappyInvitation()` overrides with
`creatorCoachFirstName`, `creatorCoachLastName`, and
`creatorCoachProfileImage`, give them defaults `"Casey"`, `"Coach"`, and
`null`, and return the constructed `invitation` after installing both mocks.

```ts
function resultRow(): { bodyHtml: string } {
  const row = txMock.assessmentEmailOutbox.create.mock.calls
    .map(
      (call: Array<{ data: { emailType: string; bodyHtml: string } }>) =>
        call[0].data,
    )
    .find((candidate) => candidate.emailType === "ASSESSMENT_RESULTS");
  if (!row) throw new Error("ASSESSMENT_RESULTS row was not enqueued");
  return row;
}

function enqueuedTypes(): string[] {
  return txMock.assessmentEmailOutbox.create.mock.calls.map(
    (call: Array<{ data: { emailType: string } }>) => call[0].data.emailType,
  );
}

it("keeps invited report HTML legacy when GH #228 is off", async () => {
  mockHappyInvitation();
  const res = await submit();
  expect(res.status).toBe(200);
  const row = resultRow();
  expect(row.bodyHtml).toContain(">SCALING UP<");
  expect(row.bodyHtml).not.toContain("cid:su-report-logo-v1");
});

it("brands invited results with creator coach only", async () => {
  process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
  mockHappyInvitation({
    creatorCoachEmail: "creator@example.com",
    creatorCoachFirstName: "Casey",
    creatorCoachLastName: "Coach",
    creatorCoachProfileImage: "https://images.example/casey.png",
  });

  const res = await submit();
  expect(res.status).toBe(200);
  const row = resultRow();
  expect(row.bodyHtml).toContain("cid:su-report-logo-v1");
  expect(row.bodyHtml).toContain("Coached by Casey Coach");
  expect(row.bodyHtml).toContain("https://images.example/casey.png");
});

it("drops only a branded stale results row when creator presentation changes under lock", async () => {
  process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
  const phase1 = mockHappyInvitation({
    creatorCoachFirstName: "Casey",
    creatorCoachLastName: "Coach",
    creatorCoachProfileImage: "https://images.example/old.png",
  });
  const phase2 = {
    ...phase1,
    campaign: {
      ...phase1.campaign,
      creatorCoach: {
        ...phase1.campaign.creatorCoach!,
        lastName: "Updated",
        profileImage: "https://images.example/new.png",
      },
    },
  };
  txMock.assessmentInvitation.findUnique.mockResolvedValue(phase2);

  const res = await submit();
  expect(res.status).toBe(200);
  expect(enqueuedTypes()).not.toContain("ASSESSMENT_RESULTS");
  expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
});

it("ignores creator presentation drift in legacy mode", async () => {
  const phase1 = mockHappyInvitation({
    creatorCoachFirstName: "Casey",
    creatorCoachLastName: "Coach",
    creatorCoachProfileImage: "https://images.example/old.png",
  });
  const phase2 = {
    ...phase1,
    campaign: {
      ...phase1.campaign,
      creatorCoach: {
        ...phase1.campaign.creatorCoach!,
        lastName: "Updated",
        profileImage: "https://images.example/new.png",
      },
    },
  };
  txMock.assessmentInvitation.findUnique.mockResolvedValue(phase2);

  const res = await submit();
  expect(res.status).toBe(200);
  expect(enqueuedTypes()).toContain("ASSESSMENT_RESULTS");
});
```

Add the variant-drift case:

```ts
it("drops only the stale results row when the chrome variant changes under lock", async () => {
  process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
  const invitation = mockHappyInvitation();
  txMock.assessmentInvitation.findUnique.mockImplementation(async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_KILL = "1";
    return invitation;
  });

  const res = await submit();
  expect(res.status).toBe(200);
  expect(enqueuedTypes()).not.toContain("ASSESSMENT_RESULTS");
  expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the invited suite and verify RED**

```bash
npx jest src/__tests__/app/org-survey/submit.test.ts --runInBand
```

Expected: branded HTML assertions and new stale-input cases fail.

- [ ] **Step 3: Resolve and pass the variant into rendering**

Import the flag helper and add:

```ts
const chrome = reportEmailChromeForCampaign(campaign.id);
const { bodyHtml: reportHtml, renderError } = buildReportEmailHtml({
  report,
  recipientRole: "TAKER_COPY",
  chrome,
});
```

Do not pass the variant to `buildCoachNotifyEmail`.

- [ ] **Step 4: Extend the invited fingerprint without changing approval hashing**

Use the full creator shape in the fingerprint input and add `campaign.id`:

```ts
function emailRenderFingerprint(campaign: {
  id: string;
  sendResultsToRespondent: boolean;
  notifyCoachOnCompletion: boolean;
  showResultsOnScreen: boolean;
  createdByCoachId: string | null;
  creatorCoach: {
    email: string;
    firstName: string;
    lastName: string;
    profileImage: string | null;
  } | null;
  version: { id: string };
  template: {
    alias: string;
    resultsEmailContentApprovedHash: string | null;
  } | null;
}): EmailRenderFingerprint {
  const chrome = reportEmailChromeForCampaign(campaign.id);
  const brandedCoach =
    chrome === "gh228"
      ? [
          campaign.createdByCoachId,
          campaign.creatorCoach?.firstName ?? null,
          campaign.creatorCoach?.lastName ?? null,
          campaign.creatorCoach?.profileImage ?? null,
        ]
      : null;
  return {
    results: JSON.stringify([
      campaign.sendResultsToRespondent,
      campaign.template?.resultsEmailContentApprovedHash ?? null,
      campaign.template?.alias ?? null,
      campaign.version.id,
      chrome,
      brandedCoach,
    ]),
    coach: JSON.stringify([
      campaign.notifyCoachOnCompletion,
      campaign.createdByCoachId,
      campaign.creatorCoach?.email ?? null,
    ]),
    onScreen: JSON.stringify([
      campaign.showResultsOnScreen,
      campaign.template?.alias ?? null,
      campaign.version.id,
    ]),
  };
}
```

Keep `isResultsEmailApproved()` and the stored Results Email approval hash implementation untouched.

- [ ] **Step 5: Widen the locked select**

Select the fields required by the exact fingerprint:

```ts
id: true,
creatorCoach: {
  select: {
    email: true,
    firstName: true,
    lastName: true,
    profileImage: true,
  },
},
```

The existing Phase-1 select already contains those creator fields.

- [ ] **Step 6: Verify invited behavior and adjacent approval suites**

```bash
npx jest src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/assessments/results-email.test.ts \
  src/__tests__/lib/results-email-approval.test.ts \
  --runInBand
npx eslint 'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/__tests__/app/org-survey/submit.test.ts
git diff --check
```

Expected: the submission suite passes; approval suites remain unchanged; no product code outside the invited path is modified.

- [ ] **Step 7: Commit**

```bash
git add 'src/src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  src/src/__tests__/app/org-survey/submit.test.ts
git commit -m "feat(assessments): brand invited results emails"
```

---

### Task 5: Wire frozen public Referring coach provenance

**Files:**
- Modify: `src/src/lib/assessments/quick-assessment-lead.ts:242-315`
- Modify: `src/src/__tests__/assessments/active-coach-lookup.test.ts`
- Modify: `src/src/app/api/quiz/[campaignAlias]/submit/route.ts:162-180,366-522`
- Modify: `src/src/__tests__/api/quick-assessment-submit.test.ts:365-775`

**Interfaces:**
- Consumes: `reportEmailChromeForCampaign(campaign.id)` and the widened verified Coach result.
- Produces: public `TAKER_COPY` and `REFERRING_COACH` frozen HTML using the same Referring coach name/image snapshot; rejected or removed referrals rebuild Scaling Up-only.

- [ ] **Step 1: Write the failing active-coach shape test**

Extend the fixture type and `ACTIVE_COACH` with:

```ts
profileImage: "https://images.example/alice.png",
```

Add `profileImage: null` to every other Coach-return fixture in
`active-coach-lookup.test.ts` and `quick-assessment-submit.test.ts` unless that
case explicitly tests a URL.

Assert both the select and returned value:

```ts
expect(findUnique).toHaveBeenCalledWith(
  expect.objectContaining({
    select: expect.objectContaining({ profileImage: true }),
  }),
);
expect(result).toEqual({
  id: "coach-1",
  email: "coach@example.com",
  firstName: "Alice",
  lastName: "Smith",
  profileImage: "https://images.example/alice.png",
});
```

- [ ] **Step 2: Write failing public-route tests**

```ts
type CreatedOutboxRow = {
  recipientRole: string;
  bodyHtml: string;
};

function createdRows(): CreatedOutboxRow[] {
  return txMock.assessmentEmailOutbox.create.mock.calls.map(
    (call: Array<{ data: CreatedOutboxRow }>) => call[0].data,
  );
}

function rowFor(role: string): CreatedOutboxRow {
  const row = createdRows().find((candidate) => candidate.recipientRole === role);
  if (!row) throw new Error(`${role} row was not enqueued`);
  return row;
}

function mockActiveCoach(
  overrides: Partial<{
    profileImage: string | null;
    firstName: string;
    lastName: string;
  }> = {},
) {
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    firstName: overrides.firstName ?? "Bob",
    lastName: overrides.lastName ?? "Coach",
    profileImage:
      overrides.profileImage === undefined
        ? "https://images.example/bob.png"
        : overrides.profileImage,
    certificationStatus: "ACTIVE",
    certificationExpiry: null,
  });
}

async function submitWithCoach() {
  return POST(
    makeRequest({
      ...VALID_BODY,
      referringCoachEmail: "coach@example.com",
    }) as never,
    makeParams() as never,
  );
}

it("brands taker and referring-coach reports with the verified Referring coach", async () => {
  process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    firstName: "Bob",
    lastName: "Coach",
    profileImage: "https://images.example/bob.png",
    certificationStatus: "ACTIVE",
    certificationExpiry: null,
  });

  await POST(
    makeRequest({ ...VALID_BODY, referringCoachEmail: "coach@example.com" }) as never,
    makeParams() as never,
  );

  const reports = createdRows().filter((row) =>
    ["TAKER_COPY", "REFERRING_COACH"].includes(row.recipientRole),
  );
  expect(reports).toHaveLength(2);
  for (const row of reports) {
    expect(row.bodyHtml).toContain("cid:su-report-logo-v1");
    expect(row.bodyHtml).toContain("Coached by Bob Coach");
    expect(row.bodyHtml).toContain("https://images.example/bob.png");
  }
});

it("uses name-only when the verified public coach image is invalid", async () => {
  process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
  mockActiveCoach({ profileImage: "http://images.example/bob.png" });
  await submitWithCoach();
  const taker = rowFor("TAKER_COPY");
  expect(taker.bodyHtml).toContain("Coached by Bob Coach");
  expect(taker.bodyHtml).not.toContain("http://images.example");
});

it("renders Scaling Up only when no verified coach exists", async () => {
  process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
  await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
  const taker = rowFor("TAKER_COPY");
  expect(taker.bodyHtml).toContain("cid:su-report-logo-v1");
  expect(taker.bodyHtml).not.toContain("Coached by");
});

it("keeps short SU_TEAM lead HTML unchanged", async () => {
  process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
  process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
  await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
  expect(rowFor("SU_TEAM").bodyHtml).not.toContain("cid:su-report-logo-v1");
});
```

Retain the existing same-mailbox cancelled-row assertion and add that its `bodyHtml` stays empty.

- [ ] **Step 3: Run both suites and verify RED**

```bash
npx jest src/__tests__/assessments/active-coach-lookup.test.ts \
  src/__tests__/api/quick-assessment-submit.test.ts \
  --runInBand
```

Expected: profile-image selection and public branded HTML assertions fail.

- [ ] **Step 4: Widen only the verified-coach presentation shape**

Add `profileImage: string | null` to `ActiveCoachDb`, its Prisma `select`, and the returned object:

```ts
return {
  id: coach.id,
  email: coach.email,
  firstName: coach.firstName,
  lastName: coach.lastName,
  profileImage: coach.profileImage,
};
```

Do not change status, expiry, normalization, or open-relay checks.

- [ ] **Step 5: Build the public report from a Coach snapshot**

Resolve once:

```ts
const chrome = reportEmailChromeForCampaign(campaign.id);
```

Change the local report builder to accept the verified Coach or `null` and pass:

```ts
referringCoachEmail: verifiedCoach?.email ?? null,
coachName:
  verifiedCoach
    ? `${verifiedCoach.firstName} ${verifiedCoach.lastName}`.trim() || null
    : null,
coachLogoUrl: verifiedCoach?.profileImage ?? null,
```

Pass `chrome` to both `TAKER_COPY` and `REFERRING_COACH` renderer calls. In `scalingUpOnlyPayloads()`, rebuild with `null` and the same `chrome`, so concurrent deactivation/deletion removes both coach identity and CTA while retaining Scaling Up branding.

- [ ] **Step 6: Preserve frozen delivery behavior**

Keep the transactional active-coach revalidation, same-mailbox cancelled row, recipient email, and worker contract unchanged. Do not add any worker-time Coach lookup. Add one assertion that mutating the mock Coach object after the outbox call does not alter the already-captured `bodyHtml` string.

- [ ] **Step 7: Verify public and adjacent lead suites**

```bash
npx jest src/__tests__/assessments/active-coach-lookup.test.ts \
  src/__tests__/api/quick-assessment-submit.test.ts \
  src/__tests__/assessments/quick-assessment-lead.test.ts \
  --runInBand
npx eslint src/lib/assessments/quick-assessment-lead.ts \
  'src/app/api/quiz/[campaignAlias]/submit/route.ts' \
  src/__tests__/assessments/active-coach-lookup.test.ts \
  src/__tests__/api/quick-assessment-submit.test.ts
git diff --check
```

Expected: all suites pass; `SU_TEAM`, eligibility, same-mailbox, idempotency, and concurrent-deletion cases remain green.

- [ ] **Step 8: Commit**

```bash
git add src/src/lib/assessments/quick-assessment-lead.ts \
  src/src/__tests__/assessments/active-coach-lookup.test.ts \
  'src/src/app/api/quiz/[campaignAlias]/submit/route.ts' \
  src/src/__tests__/api/quick-assessment-submit.test.ts
git commit -m "feat(assessments): brand public results emails"
```

---

### Task 6: Derive the inline attachment from frozen HTML

**Files:**
- Create: `src/src/lib/assessments/report-email-attachments.ts`
- Create: `src/src/__tests__/assessments/report-email-attachments.test.ts`
- Modify: `src/src/inngest/functions/quick-assessment-lead-email.ts:81-100,323-526`
- Modify: `src/src/__tests__/inngest/quick-assessment-lead-email.test.ts:1-560`

**Interfaces:**
- Consumes: `REPORT_EMAIL_LOGO_CID`, `SU_LOGO_PNG`, `SmtpAttachment`, and frozen `bodyHtml`.
- Produces: `reportEmailAttachments(bodyHtml): SmtpAttachment[]`; worker `sendEmail` accepts optional `attachments`.

- [ ] **Step 1: Write failing resolver tests**

```ts
import {
  reportEmailAttachments,
} from "@/lib/assessments/report-email-attachments";
import {
  REPORT_EMAIL_LOGO_CID,
  REPORT_EMAIL_LOGO_SRC,
} from "@/lib/assessments/report-email-chrome";
import { SU_LOGO_PNG } from "@/lib/assets/invitation-logo";

it("returns one static inline PNG for the exact src token", () => {
  expect(
    reportEmailAttachments(`<img src="${REPORT_EMAIL_LOGO_SRC}" alt="Scaling Up" />`),
  ).toEqual([
    {
      filename: "su-report-logo-v1.png",
      content: SU_LOGO_PNG,
      contentType: "image/png",
      cid: REPORT_EMAIL_LOGO_CID,
    },
  ]);
});

it.each([
  "plain text cid:su-report-logo-v1",
  "src=&quot;cid:su-report-logo-v1&quot;",
  '<img src="cid:sulogo" />',
  '<img src="cid:su-report-logo-v10" />',
  "<p>legacy report</p>",
])("returns no attachment for %s", (bodyHtml) => {
  expect(reportEmailAttachments(bodyHtml)).toEqual([]);
});

it("still returns one attachment when cover and footer reference the same CID", () => {
  const token = `<img src="${REPORT_EMAIL_LOGO_SRC}" />`;
  expect(reportEmailAttachments(`${token}${token}`)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the resolver test and verify RED**

```bash
npx jest src/__tests__/assessments/report-email-attachments.test.ts --runInBand
```

Expected: FAIL because the resolver module does not exist.

- [ ] **Step 3: Implement the exact-token resolver**

```ts
import { SU_LOGO_PNG } from "@/lib/assets/invitation-logo";
import type { SmtpAttachment } from "@/lib/smtp-transport";
import {
  REPORT_EMAIL_LOGO_CID,
  REPORT_EMAIL_LOGO_SRC,
} from "@/lib/assessments/report-email-chrome";

const REPORT_EMAIL_LOGO_SRC_TOKEN = `src="${REPORT_EMAIL_LOGO_SRC}"`;

export function reportEmailAttachments(bodyHtml: string): SmtpAttachment[] {
  if (!bodyHtml.includes(REPORT_EMAIL_LOGO_SRC_TOKEN)) return [];
  return [
    {
      filename: "su-report-logo-v1.png",
      content: SU_LOGO_PNG,
      contentType: "image/png",
      cid: REPORT_EMAIL_LOGO_CID,
    },
  ];
}
```

- [ ] **Step 4: Write failing worker handoff tests**

Extend `DrainDeps["sendEmail"]` expectations:

```ts
it("adds the report-logo attachment for frozen branded HTML", async () => {
  const row = makeRow({
    bodyHtml: '<img src="cid:su-report-logo-v1" alt="Scaling Up" />',
  });
  const deps = makeDeps([row]);
  await drainLeadOutbox(deps, "sub-1");
  expect(deps.sendEmail).toHaveBeenCalledWith({
    to: row.recipientEmail,
    subject: row.subject,
    html: row.bodyHtml,
    attachments: [
      expect.objectContaining({
        cid: "su-report-logo-v1",
        filename: "su-report-logo-v1.png",
        contentType: "image/png",
      }),
    ],
  });
});

it("keeps legacy and short-notification handoffs attachment-free", async () => {
  const row = makeRow({ bodyHtml: "<p>Results</p>" });
  const deps = makeDeps([row]);
  await drainLeadOutbox(deps, "sub-1");
  expect(deps.sendEmail).toHaveBeenCalledWith({
    to: row.recipientEmail,
    subject: row.subject,
    html: row.bodyHtml,
  });
});

it("treats attachment preparation failure as the existing send failure", async () => {
  const row = makeRow({ attempts: 2 });
  const deps = makeDeps([row]);
  deps.resolveAttachments = jest.fn(() => {
    throw new Error("attachment preparation failed");
  });
  await expect(drainLeadOutbox(deps, "sub-1")).resolves.toEqual({
    sent: 0,
    failed: 1,
    skipped: 0,
  });
  expect(deps.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: "PENDING",
        lastError: "attachment preparation failed",
      }),
    }),
  );
});
```

- [ ] **Step 5: Extend the worker seam and SMTP handoff**

Import `SmtpAttachment` and the resolver. Extend `DrainDeps`:

```ts
sendEmail: (input: {
  to: string;
  subject: string;
  html: string;
  attachments?: SmtpAttachment[];
}) => Promise<void>;
resolveAttachments?: (bodyHtml: string) => SmtpAttachment[];
```

Inside the existing send `try`, derive and conditionally pass attachments:

```ts
const resolveAttachments =
  deps.resolveAttachments ?? reportEmailAttachments;

try {
  const attachments = resolveAttachments(row.bodyHtml);
  await deps.sendEmail({
    to: row.recipientEmail,
    subject: row.subject,
    html: row.bodyHtml,
    ...(attachments.length > 0 ? { attachments } : {}),
  });
} catch (error) {
  sendError = error;
}
```

Update both Inngest adapters:

```ts
sendEmail: ({ to, subject, html, attachments }) =>
  sendEmailViaSMTP({
    to,
    subject,
    html,
    ...(attachments ? { attachments } : {}),
  }),
```

Do not inspect recipient role or email type and do not change claim, lease, retry, completion, or PII-purge code.

- [ ] **Step 6: Verify resolver, worker, and SMTP mapping**

```bash
npx jest src/__tests__/assessments/report-email-attachments.test.ts \
  src/__tests__/inngest/quick-assessment-lead-email.test.ts \
  src/__tests__/services/notifications.test.ts \
  --runInBand
npx eslint src/lib/assessments/report-email-attachments.ts \
  src/inngest/functions/quick-assessment-lead-email.ts \
  src/__tests__/assessments/report-email-attachments.test.ts \
  src/__tests__/inngest/quick-assessment-lead-email.test.ts
git diff --check
```

Expected: exact-token tests pass; legacy worker assertion remains object-identical; branded rows pass one attachment; all atomic-lease tests remain green.

- [ ] **Step 7: Commit**

```bash
git add src/src/lib/assessments/report-email-attachments.ts \
  src/src/__tests__/assessments/report-email-attachments.test.ts \
  src/src/inngest/functions/quick-assessment-lead-email.ts \
  src/src/__tests__/inngest/quick-assessment-lead-email.test.ts
git commit -m "feat(assessments): attach report email Scaling Up mark"
```

---

### Task 7: Run cross-path regression gates and record implementation state

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-gh-228-emailed-report-branding-design.md:1-8`
- Modify: `CLAUDE.md:1-40`
- Modify: `plans/CHANGELOG.md:1`
- Test: all focused suites listed below

**Interfaces:**
- Consumes: Tasks 1-6 and the approved design acceptance criteria.
- Produces: a review-ready, default-off implementation with exact verification evidence and fresh source-of-truth documentation.

- [ ] **Step 1: Run the complete focused regression set**

From `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/wave-228-flags.test.ts \
  src/__tests__/assessments/report-email-chrome.test.ts \
  src/__tests__/assessments/report-email.test.ts \
  src/__tests__/assessments/report-email-qualitative.test.ts \
  src/__tests__/assessments/report-email.wave-s-guard.test.ts \
  src/__tests__/assessments/report-email.wave-u3-findings.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/assessments/active-coach-lookup.test.ts \
  src/__tests__/api/quick-assessment-submit.test.ts \
  src/__tests__/assessments/quick-assessment-lead.test.ts \
  src/__tests__/assessments/report-email-attachments.test.ts \
  src/__tests__/inngest/quick-assessment-lead-email.test.ts \
  src/__tests__/assessments/results-email.test.ts \
  src/__tests__/lib/results-email-approval.test.ts \
  --runInBand
```

Expected: every suite passes; the count is recorded verbatim for the changelog.

- [ ] **Step 2: Run changed-file lint**

```bash
npx eslint \
  src/lib/assessments/wave-228-flags.ts \
  src/lib/assessments/report-email-chrome.ts \
  src/lib/assessments/report-email.ts \
  src/lib/assessments/quick-assessment-lead.ts \
  src/lib/assessments/report-email-attachments.ts \
  'src/app/(public)/org-survey/[campaignAlias]/submit/route.ts' \
  'src/app/api/quiz/[campaignAlias]/submit/route.ts' \
  src/inngest/functions/quick-assessment-lead-email.ts \
  src/__tests__/lib/assessments/wave-228-flags.test.ts \
  src/__tests__/assessments/report-email-chrome.test.ts \
  src/__tests__/assessments/report-email.test.ts \
  src/__tests__/assessments/report-email-qualitative.test.ts \
  src/__tests__/app/org-survey/submit.test.ts \
  src/__tests__/assessments/active-coach-lookup.test.ts \
  src/__tests__/api/quick-assessment-submit.test.ts \
  src/__tests__/assessments/report-email-attachments.test.ts \
  src/__tests__/inngest/quick-assessment-lead-email.test.ts
```

Expected: ESLint exits `0` with no warnings.

- [ ] **Step 3: Run repository safety and build gates**

```bash
node scripts/check-migration-safety.mjs
CI=true npx next build --turbopack
git diff --check
```

Expected: migration safety passes with no new migration; the production build
exits `0`; diff check emits no output.

- [ ] **Step 4: Update the project source of truth**

Change the design status to:

```markdown
- **Status:** Written design and visual mockups approved; implementation complete and default-off
```

Prepend a `gh-228-report-email-branding-pr-ready` entry to `plans/CHANGELOG.md` containing:

- the three included Results report email roles;
- Scaling Up-first and Coach-byline fallback rules;
- creator-versus-Referring coach provenance;
- exact CID attachment derivation;
- default-off/global/canary/kill behavior;
- frozen-row and unchanged approval/lease/retry semantics;
- the approved mockup links;
- exact test, lint, migration-safety, and build results; and
- explicit confirmation that GH #220, #233, #256, and #257 were untouched.

Refresh `CLAUDE.md` `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG` to that entry and add a concise current-state bullet. Do not claim deployment, production enablement, or a live email check.

- [ ] **Step 5: Re-run freshness and inspect the complete diff**

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Expected: freshness passes, diff check is empty, and only GH #228 plan/spec/mockup/code/test/SoT files are present.

- [ ] **Step 6: Commit the implementation receipt**

```bash
git add docs/superpowers/specs/2026-08-03-gh-228-emailed-report-branding-design.md \
  CLAUDE.md \
  plans/CHANGELOG.md
git commit -m "docs(assessments): record GH 228 verification"
```

- [ ] **Step 7: Request code review and finish the branch**

Invoke `superpowers:requesting-code-review`. Resolve confirmed findings with `superpowers:receiving-code-review`, rerun the affected focused suites, then rerun the full Task 7 gates. Once clean, invoke `superpowers:finishing-a-development-branch` and present merge/PR options. Do not enable a production flag during branch completion.

---

## Acceptance Trace

1. Default-off byte identity: Task 3 legacy snapshots and explicit-default equality; Task 4 and Task 5 off-path assertions.
2. Scaling Up mark in all Results report emails: Tasks 3-5.
3. Trusted creator/Referring coach provenance with no Organization-owner fallback: Tasks 4-5.
4. Name-required and invalid-image degradation: Task 3 pure tests plus Task 5 route tests.
5. Unchanged copy, recipients, approval, schema, leases, retries, and provider semantics: Tasks 4-7.
6. Canary/global/kill and queued-row containment: Task 2 flag matrix, Task 4 variant drift, Task 6 frozen worker handoff.
7. Visual and automated gates before implementation completion: Task 1 and Task 7.
