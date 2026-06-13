# Wave A — Assessment Invitation Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix assessment invitation emails so merge tokens resolve (Spec 17 #4) and the email is high-end branded HTML + plain-text (Spec 17 #5), folding in all accepted Codex hardening (incl. the two security-pass High findings).

**Architecture:** A new pure, unit-testable module `lib/assessments/invitation-email.ts` owns token interpolation (typed `forHtml`/`forText`/`forSubject` render paths), the branded inline-styled HTML shell with a CID logo, the plain-text twin, and the coach-name resolver. `services/notifications.ts → sendAssessmentInvitationEmail` delegates to it (with an env kill-switch back to the current renderer). The shared `lib/smtp-transport.ts` gains optional `text` (multipart/alternative) and `cid` (inline image). The three call sites (invite / reminders / resend routes) load org + coach + template name, honor per-campaign overrides, and rotate invitation tokens only after a successful send.

**Tech Stack:** Next.js (App Router, Turbopack) · TypeScript · Prisma · nodemailer (via shared transport) · Jest + RTL.

**Conventions:**
- All commands run from `/Users/diushianstand/Scaling-up-platform-v2/src`.
- Build gate: `CI=true npx next build --turbopack`.
- Tests: `npm test -- --testPathPatterns="<pattern>"`.
- Branch: `feat/assessment-invite-email` (already created off `main`; Spec 17 committed at `34a1cf9`).
- **Additive only — no schema migration in Wave A.**
- Scoped to Wave A. Do NOT implement Wave B (per-workshop HTML editor) — it is a separate GATED plan.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/src/lib/assessments/invitation-email.ts` (NEW) | Token resolution + typed render paths + branded HTML shell + plain-text twin + coach-name resolver + link/subject policy. Pure, no I/O. |
| `src/src/lib/assets/invitation-logo.ts` (NEW) | Base64-embedded white SU logo PNG as a `Buffer` (serverless-safe — no filesystem read). |
| `src/src/lib/smtp-transport.ts` (MODIFY) | Add optional `text` to `SendEmailOptions` and `cid` to `SmtpAttachment`; pass both to `sendMail`. |
| `src/src/services/notifications.ts` (MODIFY) | `sendAssessmentInvitationEmail`: new `organizationName`/`coachName`/`overrideSubject`/`overrideBody` params; delegate to the new module; attach logo CID; pass `html`+`text`; env kill-switch keeps the legacy renderer. |
| `src/src/app/api/assessment-campaigns/[id]/invite/route.ts` (MODIFY) | Load org name + owner/creator coach + template name; pass through. |
| `src/src/app/api/assessment-campaigns/[id]/reminders/route.ts` (MODIFY) | Same loads; **batch cap**; **rotate token only after successful send**. |
| `src/src/app/api/assessment-campaigns/[id]/invitations/[invitationId]/resend/route.ts` (MODIFY) | Same loads; **honor per-campaign overrides**; **rotate token only after successful send**. |
| `src/src/__tests__/lib/assessments/invitation-email.test.ts` (NEW) | Unit tests for the module. |
| `src/src/__tests__/lib/assessments/invitation-logo.test.ts` (NEW) | Preflight: logo Buffer non-empty + PNG magic bytes. |
| Existing route tests (UPDATE) | invite / reminders / resend route tests assert new behavior. |

---

## Task 1: Transport — add `text` (multipart) + `cid` (inline image)

**Files:**
- Modify: `src/src/lib/smtp-transport.ts:10-22` (interfaces) and `:86-99` (sendMail mapping)

- [ ] **Step 1: Add `cid` to `SmtpAttachment` and `text` to `SendEmailOptions`**

In `src/src/lib/smtp-transport.ts`, replace the two interfaces:

```ts
export interface SmtpAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType: string;
  cid?: string; // inline-image Content-ID (referenced as <img src="cid:...">)
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain-text alternative → multipart/alternative
  attachments?: SmtpAttachment[];
  telemetry?: Omit<DeliveryTelemetryEvent, "recipient" | "subject" | "status" | "provider">;
}
```

- [ ] **Step 2: Pass `text` + `cid` through to `sendMail`**

In the `transporter.sendMail({ ... })` call (around line 86), add `text` and include `cid` in the attachment mapping:

```ts
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Scaling Up Platform" <noreply@scalingup.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.text !== undefined ? { text: options.text } : {}),
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        ...(a.content !== undefined ? { content: a.content } : {}),
        ...(a.path !== undefined ? { path: a.path } : {}),
        ...(a.cid !== undefined ? { cid: a.cid } : {}),
        contentType: a.contentType,
      })),
    });
```

- [ ] **Step 3: Verify build (no test — covered by route tests in later tasks)**

Run: `CI=true npx next build --turbopack 2>&1 | tail -5`
Expected: build succeeds (additive optional fields, no callers broken).

- [ ] **Step 4: Commit**

```bash
git add src/src/lib/smtp-transport.ts
git commit -m "feat(email): smtp-transport supports text (multipart) + cid inline attachments"
```

---

## Task 2: Logo asset — base64-embedded white PNG (serverless-safe)

A remote `<img src>` or a `fs` read of `public/` is unreliable in Vercel's bundle (Codex R1-L11/R3-L7). Embed the PNG as a committed base64 `Buffer` and attach it inline via `cid`.

**Files:**
- Create: `src/src/lib/assets/invitation-logo.ts`
- Test: `src/src/__tests__/lib/assessments/invitation-logo.test.ts`

- [ ] **Step 1: Generate a white PNG from the SVG**

Source SVG: `src/public/brand/su-logo-white.svg`. Produce a ~480px-wide white-on-transparent PNG. Use whichever tool is available, in this order:

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
# Preferred: sharp (install dev-only if absent)
node -e "const sharp=require('sharp');sharp('public/brand/su-logo-white.svg',{density:288}).resize({width:480}).png().toFile('public/brand/su-logo-white.png').then(()=>console.log('ok'))" \
  || rsvg-convert -w 480 public/brand/su-logo-white.svg -o public/brand/su-logo-white.png \
  || (magick -background none -density 288 public/brand/su-logo-white.svg -resize 480x public/brand/su-logo-white.png)
ls -l public/brand/su-logo-white.png
```

If none of the three tools are available, install sharp dev-only: `npm i -D sharp` then re-run the sharp line. Commit the generated `public/brand/su-logo-white.png` too.

- [ ] **Step 2: Embed it as a base64 Buffer module**

```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
node -e "const fs=require('fs');const b=fs.readFileSync('public/brand/su-logo-white.png').toString('base64');fs.writeFileSync('src/lib/assets/invitation-logo.ts','// AUTO-GENERATED from public/brand/su-logo-white.svg — white SU logo for invitation emails.\n// Regenerate: see docs/specs/v7.6/17a-wave-a-invite-email-implementation-plan.md Task 2.\nexport const SU_LOGO_PNG_BASE64 =\n  \"'+b+'\";\nexport const SU_LOGO_PNG: Buffer = Buffer.from(SU_LOGO_PNG_BASE64, \"base64\");\nexport const SU_LOGO_CID = \"sulogo\";\n')"
head -c 200 src/lib/assets/invitation-logo.ts
```

- [ ] **Step 3: Write the preflight test**

Create `src/src/__tests__/lib/assessments/invitation-logo.test.ts`:

```ts
import { SU_LOGO_PNG, SU_LOGO_CID } from "@/lib/assets/invitation-logo";

describe("invitation logo asset", () => {
  it("is a non-empty Buffer", () => {
    expect(Buffer.isBuffer(SU_LOGO_PNG)).toBe(true);
    expect(SU_LOGO_PNG.length).toBeGreaterThan(200);
  });
  it("decodes to a PNG (magic bytes)", () => {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(SU_LOGO_PNG.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });
  it("exposes a stable CID", () => {
    expect(SU_LOGO_CID).toBe("sulogo");
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- --testPathPatterns="invitation-logo"`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/public/brand/su-logo-white.png src/src/lib/assets/invitation-logo.ts src/src/__tests__/lib/assessments/invitation-logo.test.ts
git commit -m "feat(email): embed white SU logo PNG for invitation CID + preflight test"
```

---

## Task 3: Token resolution (full alias set, both conventions, fallbacks, strip-unknown)

**Files:**
- Create: `src/src/lib/assessments/invitation-email.ts`
- Test: `src/src/__tests__/lib/assessments/invitation-email.test.ts`

- [ ] **Step 1: Write failing tests for token resolution**

Create `src/src/__tests__/lib/assessments/invitation-email.test.ts`:

```ts
import {
  buildTokenValues,
  interpolateTokens,
  type InvitationVars,
} from "@/lib/assessments/invitation-email";

const baseVars: InvitationVars = {
  respondent: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
  organizationName: "Acme Corp",
  campaignName: "Q1 Alignment",
  templateName: "Five Dysfunctions",
  coachName: "Pat Coach",
  invitationUrl: "https://app.test/org-survey/abc#t=SECRET",
  closeAt: new Date("2026-07-01T00:00:00Z"),
};

describe("interpolateTokens — aliases + conventions", () => {
  const values = () => buildTokenValues(baseVars);

  it("resolves camelCase and snake_case for the same token", () => {
    expect(interpolateTokens("{{organizationName}}", values())).toBe("Acme Corp");
    expect(interpolateTokens("{{organization_name}}", values())).toBe("Acme Corp");
  });

  it("resolves firstName and respondentFirstName aliases", () => {
    expect(interpolateTokens("{{firstName}}", values())).toBe("Jane");
    expect(interpolateTokens("{{respondentFirstName}}", values())).toBe("Jane");
  });

  it("resolves assessmentUrl and invitationUrl to the same URL", () => {
    expect(interpolateTokens("{{assessmentUrl}}", values())).toBe(baseVars.invitationUrl);
    expect(interpolateTokens("{{invitationUrl}}", values())).toBe(baseVars.invitationUrl);
  });

  it("resolves templateName", () => {
    expect(interpolateTokens("{{templateName}}", values())).toBe("Five Dysfunctions");
  });

  it("applies neutral fallbacks for empty known tokens", () => {
    const v = buildTokenValues({ ...baseVars, organizationName: null, coachName: null, closeAt: null });
    expect(interpolateTokens("{{organization_name}}", v)).toBe("your organization");
    expect(interpolateTokens("{{coach_name}}", v)).toBe("your coach");
    expect(interpolateTokens("{{closeAt}}", v)).toBe("ongoing");
    expect(interpolateTokens("{{firstName}}", buildTokenValues({ ...baseVars, respondent: { firstName: "", lastName: "", email: "" } }))).toBe("there");
  });

  it("strips unknown tokens", () => {
    expect(interpolateTokens("a {{bogusToken}} b", values())).toBe("a  b");
    expect(interpolateTokens("{{respondentFirstName}}", values())).not.toContain("{{");
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npm test -- --testPathPatterns="invitation-email"`
Expected: FAIL ("Cannot find module '@/lib/assessments/invitation-email'").

- [ ] **Step 3: Implement token resolution**

Create `src/src/lib/assessments/invitation-email.ts`:

```ts
/**
 * Assessment invitation email — token interpolation + branded HTML/text rendering.
 * Pure module (no I/O). Mirrors the inline-style, escape-safe conventions of report-email.ts.
 *
 * SECURITY:
 *  - HTML body values are escaped by the markdown-lite renderer (single escaping authority).
 *  - The subject uses a restricted token allowlist that EXCLUDES url/email/token-bearing
 *    values, so the raw `#t=<token>` invitation credential can never land in a subject/header.
 *  - Inline links accept only http/https/relative URLs (javascript:/data:/protocol-relative rejected).
 */
import { escapeHtml } from "@/lib/templates/interpolate-content-html";
import { SU_LOGO_CID } from "@/lib/assets/invitation-logo";

export interface InvitationVars {
  respondent: { firstName: string; lastName: string; email: string };
  organizationName: string | null;
  campaignName: string;
  templateName: string | null;
  coachName: string | null;
  invitationUrl: string;
  closeAt: Date | null;
}

function formatCloseAt(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Canonical token → resolved string value, with neutral fallbacks for empty known tokens. */
export function buildTokenValues(vars: InvitationVars): Record<string, string> {
  const first = (vars.respondent.firstName ?? "").trim() || "there";
  const last = (vars.respondent.lastName ?? "").trim();
  const full = `${vars.respondent.firstName ?? ""} ${vars.respondent.lastName ?? ""}`.trim() || "there";
  const org = (vars.organizationName ?? "").trim() || "your organization";
  const campaign = (vars.campaignName ?? "").trim() || "your assessment";
  const template = (vars.templateName ?? "").trim() || "your assessment";
  const coach = (vars.coachName ?? "").trim() || "your coach";
  const email = (vars.respondent.email ?? "").trim();
  const closeAt = vars.closeAt ? formatCloseAt(vars.closeAt) : "ongoing";
  const url = vars.invitationUrl;
  // keys are normalized (lowercase, underscores stripped)
  return {
    respondentfirstname: first, firstname: first,
    respondentlastname: last, lastname: last,
    respondentfullname: full, respondentname: full, fullname: full,
    respondentemail: email, email,
    organizationname: org,
    campaignname: campaign,
    templatename: template,
    coachname: coach,
    invitationurl: url, assessmenturl: url,
    closeat: closeAt,
  };
}

const TOKEN_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
function normKey(raw: string): string {
  return raw.toLowerCase().replace(/_/g, "");
}

/**
 * Replace {{tokens}} (both camelCase and snake_case). Unknown tokens → stripped.
 * When `allow` is provided, tokens whose normalized key is not in the set are stripped
 * (used by the subject path to exclude url/email/token-bearing values).
 */
export function interpolateTokens(
  template: string,
  values: Record<string, string>,
  allow?: Set<string>,
): string {
  return template.replace(TOKEN_RE, (_m, raw: string) => {
    const key = normKey(raw);
    if (allow && !allow.has(key)) return "";
    return key in values ? values[key] : "";
  });
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test -- --testPathPatterns="invitation-email"`
Expected: token-resolution tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/invitation-email.ts src/src/__tests__/lib/assessments/invitation-email.test.ts
git commit -m "feat(email): invitation token resolution (alias set, both conventions, fallbacks, strip-unknown)"
```

---

## Task 4: Typed render paths — subject (allowlist + assert), text twin, HTML body (markdown-lite + link policy)

**Files:**
- Modify: `src/src/lib/assessments/invitation-email.ts`
- Modify: `src/src/__tests__/lib/assessments/invitation-email.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `invitation-email.test.ts`:

```ts
import {
  renderSubject,
  renderTextBody,
  renderHtmlBody,
} from "@/lib/assessments/invitation-email";

describe("renderSubject — allowlist excludes credentials", () => {
  const v = baseVars;
  it("resolves safe tokens", () => {
    expect(renderSubject("Invite: {{organization_name}}", v)).toBe("Invite: Acme Corp");
  });
  it("strips url/email tokens and never leaks the token", () => {
    const s = renderSubject("Go {{assessmentUrl}} {{respondentEmail}}", v);
    expect(s).not.toContain("#t=");
    expect(s).not.toContain("jane@example.com");
    expect(s).not.toContain("https://");
  });
  it("strips control chars / newlines (header-injection safe)", () => {
    const s = renderSubject("Hi\r\nBcc: evil@x.com {{firstName}}", v);
    expect(s).not.toMatch(/[\r\n]/);
  });
});

describe("renderHtmlBody — escaping + safe markdown + link policy + CTA normalize", () => {
  it("escapes attacker-influenced values", () => {
    const v = { ...baseVars, respondent: { firstName: "<script>alert(1)</script>", lastName: "X", email: "e@e.com" } };
    const html = renderHtmlBody("Hi {{firstName}}", v);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("renders bold and safe links", () => {
    const html = renderHtmlBody("See **bold** and [docs](https://scalingup.com/x)", baseVars);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://scalingup.com/x"');
    expect(html).toContain(">docs</a>");
  });
  it("rejects dangerous link schemes (renders text only)", () => {
    const html = renderHtmlBody("[click](javascript:alert(1)) and [x](data:text/html,1)", baseVars);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:");
    expect(html).toContain("click");
  });
  it("drops a redundant CTA line pointing at the invitation URL", () => {
    const html = renderHtmlBody("Hi\n\n[Take the Assessment]({{assessmentUrl}})\n\nThanks", baseVars);
    expect(html).not.toContain("Take the Assessment");
    expect(html).toContain("Hi");
    expect(html).toContain("Thanks");
  });
  it("never emits a literal token", () => {
    expect(renderHtmlBody("Hi {{firstName}} {{bogus}}", baseVars)).not.toContain("{{");
  });
});

describe("renderTextBody — plain text twin", () => {
  it("is plain text with the URL spelled out and no markdown/HTML", () => {
    const txt = renderTextBody("Hi {{firstName}}\n\n**bold** [docs](https://scalingup.com/x)", baseVars);
    expect(txt).not.toContain("<");
    expect(txt).not.toContain("**");
    expect(txt).toContain("Jane");
    expect(txt).toContain("Start the assessment: " + baseVars.invitationUrl);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- --testPathPatterns="invitation-email"`
Expected: FAIL (renderSubject/renderHtmlBody/renderTextBody undefined).

- [ ] **Step 3: Implement the render paths**

Append to `src/src/lib/assessments/invitation-email.ts`:

```ts
// ── Subject ─────────────────────────────────────────────────────────────────
// Allowlist EXCLUDES url/email/token-bearing keys so a credential can never
// reach a subject line / SMTP header / telemetry record.
const SUBJECT_ALLOW = new Set<string>([
  "respondentfirstname", "firstname",
  "respondentlastname", "lastname",
  "respondentfullname", "respondentname", "fullname",
  "organizationname", "campaignname", "templatename", "coachname", "closeat",
]);

function stripControlChars(value: string): string {
  // Removes CR/LF and other control chars (header-injection safe). Mirrors report-email.ts.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[ -]/g, " ").trim();
}

export function renderSubject(template: string, vars: InvitationVars): string {
  const values = buildTokenValues(vars);
  let s = stripControlChars(interpolateTokens(template, values, SUBJECT_ALLOW));
  // Defense-in-depth: assert no invitation credential leaked into the subject.
  if (vars.invitationUrl && s.includes(vars.invitationUrl)) {
    s = s.split(vars.invitationUrl).join("");
  }
  if (s.includes("#t=")) {
    s = s.replace(/#t=\S+/g, "");
  }
  return s.trim();
}

// ── Link policy ───────────────────────────────────────────────────────────
/** Returns a safe href or null. Allows http(s) and root-relative; rejects javascript:/data:/protocol-relative/malformed. */
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (url.startsWith("//")) return null;              // protocol-relative
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {             // has a scheme
    if (/^https?:/i.test(url)) return url;
    return null;                                       // javascript:, data:, mailto:, etc. rejected
  }
  if (url.startsWith("/")) return url;                 // root-relative
  return null;                                         // anything else (encoded, malformed)
}

// ── Markdown-lite (links + bold), escape-first ──────────────────────────────
function renderInline(escaped: string): string {
  // `escaped` already HTML-escaped. Markdown delimiters (* [ ] ( )) are unaffected by escaping.
  // Links: [text](url)
  let out = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const href = safeHref(url);
    return href
      ? `<a href="${escapeHtml(href)}" style="color:#522583;text-decoration:underline;">${text}</a>`
      : text;
  });
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

/** Remove a standalone line whose only content is a markdown link to the invitation URL (shell has its own CTA). */
function dropRedundantCta(body: string, invitationUrl: string): string {
  const lines = body.split("\n");
  const kept = lines.filter((line) => {
    const m = line.trim().match(/^\[[^\]]+\]\(([^)\s]+)\)$/);
    return !(m && m[1] === invitationUrl);
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function renderHtmlBody(template: string, vars: InvitationVars): string {
  const values = buildTokenValues(vars);
  const interpolated = dropRedundantCta(interpolateTokens(template, values), vars.invitationUrl);
  const paragraphs = interpolated
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const withBreaks = escapeHtml(p).replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">${renderInline(withBreaks)}</p>`;
    })
    .join("");
  return paragraphs;
}

export function renderTextBody(template: string, vars: InvitationVars): string {
  const values = buildTokenValues(vars);
  let txt = dropRedundantCta(interpolateTokens(template, values), vars.invitationUrl);
  txt = txt.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)"); // link → "text (url)"
  txt = txt.replace(/\*\*([^*]+)\*\*/g, "$1");                 // bold → text
  return `${txt.trim()}\n\nStart the assessment: ${vars.invitationUrl}`;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test -- --testPathPatterns="invitation-email"`
Expected: all render-path tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/invitation-email.ts src/src/__tests__/lib/assessments/invitation-email.test.ts
git commit -m "feat(email): typed render paths — subject allowlist, text twin, HTML body (safe markdown + link policy)"
```

---

## Task 5: Branded HTML shell + coach-name resolver

**Files:**
- Modify: `src/src/lib/assessments/invitation-email.ts`
- Modify: `src/src/__tests__/lib/assessments/invitation-email.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `invitation-email.test.ts`:

```ts
import { buildInvitationEmailHtml, resolveCoachName } from "@/lib/assessments/invitation-email";

describe("buildInvitationEmailHtml — branded shell", () => {
  it("wraps the body in the purple branded shell with CID logo + CTA", () => {
    const html = buildInvitationEmailHtml({ bodyMarkdown: "Hi {{firstName}}", vars: baseVars });
    expect(html).toContain("#522583");                      // brand purple
    expect(html).toContain('src="cid:sulogo"');             // inline logo
    expect(html).toContain(`href="${baseVars.invitationUrl}"`); // CTA href
    expect(html).toContain("Start the assessment");
    expect(html).not.toContain("{{");                       // no literal tokens
    expect(html).not.toContain("#1D4ED8");                  // not the old blue button
  });
});

describe("resolveCoachName — creatorCoach ?? owner", () => {
  it("prefers the campaign creator coach", () => {
    expect(resolveCoachName({ firstName: "Cre", lastName: "Ator" }, { firstName: "Own", lastName: "Er" })).toBe("Cre Ator");
  });
  it("falls back to the org owner", () => {
    expect(resolveCoachName(null, { firstName: "Own", lastName: "Er" })).toBe("Own Er");
  });
  it("returns null when neither is present", () => {
    expect(resolveCoachName(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- --testPathPatterns="invitation-email"`
Expected: FAIL (buildInvitationEmailHtml/resolveCoachName undefined).

- [ ] **Step 3: Implement the shell + resolver**

Append to `src/src/lib/assessments/invitation-email.ts`:

```ts
// ── Branded shell ───────────────────────────────────────────────────────────
const PURPLE = "#522583";
const PURPLE_DEEP = "#3d1a63";
const D_PEOPLE = "#E4002B", D_STRATEGY = "#00A6CE", D_EXECUTION = "#FFB81C", D_CASH = "#43B02A";

export function buildInvitationEmailHtml(input: { bodyMarkdown: string; vars: InvitationVars }): string {
  const { bodyMarkdown, vars } = input;
  const bodyHtml = renderHtmlBody(bodyMarkdown, vars);
  const orgLine = vars.organizationName ? escapeHtml(vars.organizationName) : "";
  return `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="25%" style="height:6px;background:${D_PEOPLE};font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:${D_STRATEGY};font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:${D_EXECUTION};font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:${D_CASH};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
  <div style="background:${PURPLE};background-image:linear-gradient(135deg,${PURPLE},${PURPLE_DEEP});padding:28px 32px;">
    <img src="cid:${SU_LOGO_CID}" alt="Scaling Up" width="180" style="display:block;border:0;outline:none;max-width:180px;height:auto;" />
    ${orgLine ? `<div style="margin-top:14px;font-size:13px;color:#ffffff;opacity:0.85;">${orgLine}</div>` : ""}
  </div>
  <div style="padding:28px 32px 8px;">
    ${bodyHtml}
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${vars.invitationUrl}" style="display:inline-block;background:${PURPLE};color:#ffffff;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Start the assessment</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px;">If the button doesn't work, paste this into your browser:<br/><span style="word-break:break-all;color:#6b7280;">${vars.invitationUrl}</span></p>
  </div>
  <div style="padding:18px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">&mdash; Scaling Up Platform</div>
</div>`.trim();
}

// ── Coach-name resolver (creator coach ?? org owner) ────────────────────────
type CoachName = { firstName: string; lastName: string } | null;
export function resolveCoachName(creatorCoach: CoachName, ownerCoach: CoachName): string | null {
  const pick = creatorCoach ?? ownerCoach;
  if (!pick) return null;
  const name = `${pick.firstName ?? ""} ${pick.lastName ?? ""}`.trim();
  return name.length > 0 ? name : null;
}
```

> Note: `vars.invitationUrl` is interpolated into the CTA `href` directly (it is our own generated URL, not user content). The body's escaping is handled by `renderHtmlBody`.

- [ ] **Step 4: Run — verify pass**

Run: `npm test -- --testPathPatterns="invitation-email"`
Expected: shell + resolver tests PASS (whole file green).

- [ ] **Step 5: Commit**

```bash
git add src/src/lib/assessments/invitation-email.ts src/src/__tests__/lib/assessments/invitation-email.test.ts
git commit -m "feat(email): branded invitation HTML shell (purple hero + CID logo + CTA) + coach-name resolver"
```

---

## Task 6: Wire `sendAssessmentInvitationEmail` — delegate, multipart, logo CID, kill-switch

**Files:**
- Modify: `src/src/services/notifications.ts:1083-1158` (the function)

- [ ] **Step 1: Replace the function body**

In `src/src/services/notifications.ts`, replace the entire `sendAssessmentInvitationEmail` function (currently ~1083-1158) with:

```ts
export async function sendAssessmentInvitationEmail(data: {
    invitation: { id: string; expiresAt: Date };
    respondent: { id: string; firstName: string; lastName: string; email: string };
    campaign: { id: string; name: string; alias: string; closeAt: Date | null };
    template: { invitationSubject: string; invitationBodyMarkdown: string };
    organizationName?: string | null;
    coachName?: string | null;
    rawToken: string;
    baseUrl: string;
}): Promise<void> {
    const trimmedBase = data.baseUrl.replace(/\/+$/, "");
    const invitationUrl = `${trimmedBase}/org-survey/${data.campaign.alias}#t=${data.rawToken}`;

    // Kill-switch: ASSESSMENT_INVITE_BRANDED=0 reverts to the legacy plain renderer.
    const branded = process.env.ASSESSMENT_INVITE_BRANDED !== "0";

    if (!branded) {
        await sendLegacyInvitationEmail({ ...data, invitationUrl });
        return;
    }

    const vars: InvitationVars = {
        respondent: {
            firstName: data.respondent.firstName,
            lastName: data.respondent.lastName,
            email: data.respondent.email,
        },
        organizationName: data.organizationName ?? null,
        campaignName: data.campaign.name,
        templateName: null, // populated by callers via the template name when available; see note
        coachName: data.coachName ?? null,
        invitationUrl,
        closeAt: data.campaign.closeAt,
    };

    const subject = renderSubject(data.template.invitationSubject, vars);
    const html = buildInvitationEmailHtml({ bodyMarkdown: data.template.invitationBodyMarkdown, vars });
    const text = renderTextBody(data.template.invitationBodyMarkdown, vars);

    await sendEmailViaSMTP({
        to: data.respondent.email,
        subject,
        html,
        text,
        attachments: [
            { filename: "su-logo.png", content: SU_LOGO_PNG, contentType: "image/png", cid: SU_LOGO_CID },
        ],
        telemetry: {
            recipientRole: "CUSTOM",
            metadata: {
                type: "assessment_invitation",
                campaignId: data.campaign.id,
                invitationId: data.invitation.id,
                respondentId: data.respondent.id,
            },
        },
    });
}
```

> The `templateName` token is rarely used in seed bodies; if a caller wants it, extend the `template` param with `name` and set `vars.templateName`. (Callers pass it in Task 7–9 via `data.template` — see note there.) To keep the contract simple, add an optional `templateName?: string | null` to the `data` arg and set `templateName: data.templateName ?? null` instead of the hardcoded `null` above.

Apply that note: change the `data` type to include `templateName?: string | null;` and set `templateName: data.templateName ?? null` in `vars`.

- [ ] **Step 2: Add the legacy renderer (kill-switch fallback) + imports**

At the top of `src/src/services/notifications.ts`, extend the smtp-transport import and add the new module import:

```ts
import { sendEmailViaSMTP, type SmtpAttachment } from "@/lib/smtp-transport";
import {
    buildInvitationEmailHtml,
    renderSubject,
    renderTextBody,
    type InvitationVars,
} from "@/lib/assessments/invitation-email";
import { SU_LOGO_PNG, SU_LOGO_CID } from "@/lib/assets/invitation-logo";
```

Add the legacy renderer (the previous behavior, preserved verbatim as the off-switch) immediately after the function:

```ts
/** Legacy plain invitation renderer — retained as the ASSESSMENT_INVITE_BRANDED=0 off-switch. */
async function sendLegacyInvitationEmail(data: {
    invitation: { id: string; expiresAt: Date };
    respondent: { id: string; firstName: string; lastName: string; email: string };
    campaign: { id: string; name: string; alias: string; closeAt: Date | null };
    template: { invitationSubject: string; invitationBodyMarkdown: string };
    invitationUrl: string;
}): Promise<void> {
    const closeAtFormatted = data.campaign.closeAt
        ? data.campaign.closeAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
        : "ongoing";
    const fullName = `${data.respondent.firstName} ${data.respondent.lastName}`.trim();
    const substitute = (input: string): string =>
        input
            .replace(/\{\{respondentFirstName\}\}/g, data.respondent.firstName)
            .replace(/\{\{respondentLastName\}\}/g, data.respondent.lastName)
            .replace(/\{\{respondentFullName\}\}/g, fullName)
            .replace(/\{\{campaignName\}\}/g, data.campaign.name)
            .replace(/\{\{invitationUrl\}\}/g, data.invitationUrl)
            .replace(/\{\{closeAt\}\}/g, closeAtFormatted);
    const subject = substitute(data.template.invitationSubject);
    const bodyText = substitute(data.template.invitationBodyMarkdown);
    const escaped = escapeHtml(bodyText);
    const paragraphs = escaped.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 12px;color:#374151;">${p.replace(/\n/g, "<br/>")}</p>`).join("");
    const html = `<div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:560px;margin:0 auto;">${paragraphs}<br/><div style="text-align:center;"><a href="${data.invitationUrl}" style="display:inline-block;background-color:#1D4ED8;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Start the assessment</a></div></div>`;
    await sendEmailViaSMTP({
        to: data.respondent.email,
        subject,
        html,
        telemetry: { recipientRole: "CUSTOM", metadata: { type: "assessment_invitation_legacy", campaignId: data.campaign.id, invitationId: data.invitation.id, respondentId: data.respondent.id } },
    });
}
```

> `escapeHtml` must be imported in notifications.ts if not already. Add `import { escapeHtml } from "@/lib/templates/interpolate-content-html";` near the other imports if absent.

- [ ] **Step 3: Build gate**

Run: `CI=true npx next build --turbopack 2>&1 | tail -8`
Expected: build succeeds (existing callers still type-check — new params are optional).

- [ ] **Step 4: Commit**

```bash
git add src/src/services/notifications.ts
git commit -m "feat(email): branded assessment invitation (multipart + CID logo) with env kill-switch to legacy renderer"
```

---

## Task 7: Invite route — load org + coach + template name; pass through

**Files:**
- Modify: `src/src/app/api/assessment-campaigns/[id]/invite/route.ts:77-100` (query) and the `sendAssessmentInvitationEmail` call (~250-274)
- Test: `src/src/__tests__/api/assessment-campaigns/invite-route.test.ts`

- [ ] **Step 1: Add failing test (org + coach + templateName forwarded; no literal token in HTML)**

In `invite-route.test.ts`, add a test that mocks `sendAssessmentInvitationEmail` and asserts it receives `organizationName`, `coachName`, and `templateName`. Use the suite's existing mock setup; the new assertion:

```ts
it("forwards organizationName, coachName, and templateName to the email", async () => {
  // ...arrange a campaign with organization.name, organization.owner, template.name (see fixtures)...
  await POST(req, ctx);
  expect(sendAssessmentInvitationEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationName: "Acme Corp",
      coachName: "Pat Coach",
      templateName: expect.any(String),
    }),
  );
});
```

(Match the existing test file's mocking style — it already mocks `@/services/notifications`.)

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- --testPathPatterns="invite-route"`
Expected: FAIL (organizationName/coachName not yet passed).

- [ ] **Step 3: Extend the campaign query**

Replace the `include` block (lines 79-99) so it loads org name + owner coach + creator coach + template name:

```ts
      include: {
        template: {
          select: {
            name: true,
            invitationSubject: true,
            invitationBodyMarkdown: true,
          },
        },
        organization: {
          select: {
            name: true,
            owner: { select: { firstName: true, lastName: true } },
          },
        },
        creatorCoach: { select: { firstName: true, lastName: true } },
        participants: {
          include: {
            respondent: {
              select: { id: true, firstName: true, lastName: true, email: true, deletedAt: true },
            },
          },
        },
      },
```

> Verify the relation name for the campaign→creator coach. `AssessmentCampaign.createdByCoachId` is the FK; confirm the relation field name in `schema.prisma` (e.g. `creatorCoach`). If the relation is unnamed/absent, load the coach separately via `db.coach.findUnique({ where: { id: campaign.createdByCoachId }, select: { firstName, lastName } })` guarded on non-null. Use the real relation name found in the schema.

- [ ] **Step 4: Compute coachName once and pass new params**

Before the participant loop, add:

```ts
import { resolveCoachName } from "@/lib/assessments/invitation-email";
// ...
const coachName = resolveCoachName(
  campaign.creatorCoach ?? null,
  campaign.organization?.owner ?? null,
);
const organizationName = campaign.organization?.name ?? null;
const templateName = campaign.template?.name ?? null;
```

Then in the `sendAssessmentInvitationEmail({ ... })` call, add the three fields alongside the existing `template`:

```ts
          organizationName,
          coachName,
          templateName,
```

- [ ] **Step 5: Run — verify pass + build**

Run: `npm test -- --testPathPatterns="invite-route"`
Expected: PASS.
Run: `CI=true npx next build --turbopack 2>&1 | tail -5`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/src/app/api/assessment-campaigns/[id]/invite/route.ts" src/src/__tests__/api/assessment-campaigns/invite-route.test.ts
git commit -m "feat(email): invite route loads org+coach+templateName and forwards to branded invitation"
```

---

## Task 8: Reminders route — load org/coach/templateName, batch cap, rotate token only after successful send

**Files:**
- Modify: `src/src/app/api/assessment-campaigns/[id]/reminders/route.ts` (campaign query, the loop ~235-320)
- Test: `src/src/__tests__/api/assessment-campaigns/reminders-post.test.ts`

- [ ] **Step 1: Add failing tests**

In `reminders-post.test.ts` add two tests:

```ts
it("does NOT rotate the token when the send fails (old link stays valid)", async () => {
  (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValueOnce(new Error("smtp down"));
  await POST(req, ctx);
  // the invitation row update that rotates tokenHash must NOT have run for the failed send
  expect(db.assessmentInvitation.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ tokenHash: expect.anything() }) }),
  );
});

it("caps the batch and reports remaining", async () => {
  // arrange > MAX targets; assert response.remaining > 0 and sent <= MAX
  const res = await POST(req, ctx);
  const body = await res.json();
  expect(body.data.remaining).toBeGreaterThanOrEqual(0);
});
```

(Adapt to the suite's existing fixture/mocks. The key behavioral assertions are: token rotation is gated on send success, and a batch cap exists.)

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- --testPathPatterns="reminders-post"`
Expected: FAIL.

- [ ] **Step 3: Add a batch cap constant + load org/coach/templateName in the campaign query**

Near the top of the route module:

```ts
const MAX_REMINDER_BATCH = 200; // serverless/SMTP budget guard
```

Extend the campaign query `include` (mirror Task 7): add `template.name`, `organization { name, owner { firstName, lastName } }`, `creatorCoach { firstName, lastName }`. Compute before the loop:

```ts
const coachName = resolveCoachName(campaign.creatorCoach ?? null, campaign.organization?.owner ?? null);
const organizationName = campaign.organization?.name ?? null;
const templateName = campaign.template?.name ?? null;
```

Import `resolveCoachName` from `@/lib/assessments/invitation-email`.

- [ ] **Step 4: Cap the loop**

Replace `for (const participant of targets) {` with a capped slice:

```ts
    const capped = targets.slice(0, MAX_REMINDER_BATCH);
    const remaining = Math.max(0, targets.length - capped.length);
    for (const participant of capped) {
```

- [ ] **Step 5: Reorder — send FIRST, rotate token only on success**

Replace the rotate-then-send block (the `db.assessmentInvitation.update({ ... tokenHash ... })` that currently runs BEFORE `sendAssessmentInvitationEmail`) with: generate the token, send with it, and only persist the new `tokenHash` after the send resolves. The failure path leaves the prior token intact:

```ts
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);

      try {
        await sendAssessmentInvitationEmail({
          invitation: { id: prior.id, expiresAt },
          respondent: {
            id: respondent.id, firstName: respondent.firstName,
            lastName: respondent.lastName, email: respondent.email,
          },
          campaign: { id: campaign.id, name: campaign.name, alias: campaign.alias, closeAt: campaign.closeAt },
          template: {
            invitationSubject: campaign.invitationSubject ?? campaign.template.invitationSubject,
            invitationBodyMarkdown: campaign.invitationBodyMarkdown ?? campaign.template.invitationBodyMarkdown,
          },
          organizationName,
          coachName,
          templateName,
          rawToken,
          baseUrl: appUrl,
        });
      } catch (sendErr) {
        console.error("[assessment-reminders] SMTP send failed", { respondentId: participant.respondentId }, sendErr);
        failed.push({ participantId: participant.respondentId, reason: "send-failed" });
        continue; // prior token NOT rotated — the recipient's existing link stays valid
      }

      // Send succeeded — now rotate the token + bump counters.
      try {
        await db.assessmentInvitation.update({
          where: { id: prior.id },
          data: { tokenHash, expiresAt, resentCount: { increment: 1 }, lastResentAt: new Date() },
        });
      } catch (writeErr) {
        console.error("[assessment-reminders] post-send token persist failed", { respondentId: participant.respondentId }, writeErr);
        // Email already delivered with the new token; the prior token also still validates → recipient is not locked out.
      }
      sent += 1;
```

Add `remaining` to the JSON response payload: `data: { sent, skipped, failed, remaining }` (match the route's existing response shape).

> **Documented residual (no migration in Wave A):** if the post-send DB persist fails, the newly emailed token is not yet active, but the recipient's prior link still validates, so they are never locked out. A token-version + grace-window (which fully closes the send-success/DB-fail gap) requires an additive column and is deferred per Spec 17.

- [ ] **Step 6: Run — verify pass + build**

Run: `npm test -- --testPathPatterns="reminders-post"`
Expected: PASS.
Run: `CI=true npx next build --turbopack 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add "src/src/app/api/assessment-campaigns/[id]/reminders/route.ts" src/src/__tests__/api/assessment-campaigns/reminders-post.test.ts
git commit -m "feat(email): reminders honor branding, batch cap, and rotate token only after successful send"
```

---

## Task 9: Resend route — honor per-campaign overrides; load org/coach/templateName; rotate token after send

**Files:**
- Modify: `src/src/app/api/assessment-campaigns/[id]/invitations/[invitationId]/resend/route.ts` (query ~71-95, send block ~146-200)
- Test: `src/src/__tests__/api/assessment-campaigns/resend-route.test.ts`

- [ ] **Step 1: Add failing tests**

In `resend-route.test.ts`:

```ts
it("uses the per-campaign invitationSubject/Body override when present", async () => {
  // arrange invitation.campaign.invitationSubject = "CUSTOM SUBJ", template default differs
  await POST(req, ctx);
  expect(sendAssessmentInvitationEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      template: expect.objectContaining({ invitationSubject: "CUSTOM SUBJ" }),
      organizationName: expect.anything(),
      coachName: expect.anything(),
    }),
  );
});

it("does NOT rotate the token when the send fails", async () => {
  (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValueOnce(new Error("smtp"));
  await POST(req, ctx);
  expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- --testPathPatterns="resend-route"`
Expected: FAIL.

- [ ] **Step 3: Extend the invitation→campaign query**

In the `db.assessmentInvitation.findUnique` `include` (around line 73-95), ensure the campaign select includes the overrides + org + coach + template name:

```ts
        campaign: {
          select: {
            id: true, name: true, alias: true, closeAt: true, externalId: true,
            invitationSubject: true,
            invitationBodyMarkdown: true,
            template: { select: { name: true, invitationSubject: true, invitationBodyMarkdown: true } },
            organization: { select: { name: true, owner: { select: { firstName: true, lastName: true } } } },
            creatorCoach: { select: { firstName: true, lastName: true } },
          },
        },
```

(Keep the existing `respondent` select.)

- [ ] **Step 4: Reorder send-before-rotate + pass overrides and new params**

Replace the rotate-then-send block (lines ~146-200) with:

```ts
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const c = invitation.campaign;
    const coachName = resolveCoachName(c.creatorCoach ?? null, c.organization?.owner ?? null);

    try {
      await sendAssessmentInvitationEmail({
        invitation: { id: invitation.id, expiresAt: invitation.expiresAt },
        respondent: {
          id: invitation.respondent.id, firstName: invitation.respondent.firstName,
          lastName: invitation.respondent.lastName, email: invitation.respondent.email,
        },
        campaign: { id: c.id, name: c.name, alias: c.alias, closeAt: c.closeAt },
        template: {
          invitationSubject: c.invitationSubject ?? c.template.invitationSubject,
          invitationBodyMarkdown: c.invitationBodyMarkdown ?? c.template.invitationBodyMarkdown,
        },
        organizationName: c.organization?.name ?? null,
        coachName,
        templateName: c.template?.name ?? null,
        rawToken,
        baseUrl: appUrl,
      });
    } catch (sendErr) {
      console.error("[assessment-resend] SMTP send failed", { invitationId }, sendErr);
      return NextResponse.json({ success: false, error: "Failed to send invitation email" }, { status: 502 });
    }

    // Send succeeded — rotate the token now.
    const updated = await db.assessmentInvitation.update({
      where: { id: invitationId },
      data: { tokenHash, resentCount: { increment: 1 }, lastResentAt: new Date() },
      select: { id: true, expiresAt: true, resentCount: true },
    });
```

Import `resolveCoachName` from `@/lib/assessments/invitation-email`. Keep the `logAudit` call after, referencing `updated.resentCount`. The `invitation.expiresAt` must be selected in the findUnique (confirm it is; add to select if missing).

- [ ] **Step 5: Run — verify pass + build**

Run: `npm test -- --testPathPatterns="resend-route"`
Expected: PASS.
Run: `CI=true npx next build --turbopack 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add "src/src/app/api/assessment-campaigns/[id]/invitations/[invitationId]/resend/route.ts" src/src/__tests__/api/assessment-campaigns/resend-route.test.ts
git commit -m "feat(email): resend honors per-campaign overrides + branding; rotate token only after successful send"
```

---

## Task 10: Full Wave A verification

- [ ] **Step 1: Run all touched suites**

Run:
```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
npm test -- --testPathPatterns="invitation-email|invitation-logo|invite-route|reminders-post|resend-route"
```
Expected: all green.

- [ ] **Step 2: ESLint changed files**

Run:
```bash
npx eslint src/lib/assessments/invitation-email.ts src/lib/assets/invitation-logo.ts src/lib/smtp-transport.ts src/services/notifications.ts "src/app/api/assessment-campaigns/[id]/invite/route.ts" "src/app/api/assessment-campaigns/[id]/reminders/route.ts" "src/app/api/assessment-campaigns/[id]/invitations/[invitationId]/resend/route.ts"
```
Expected: zero errors/warnings. (`<img>` in an email-HTML string literal is not JSX, so no `next/image` warning applies.)

- [ ] **Step 3: Build gate**

Run: `CI=true npx next build --turbopack 2>&1 | tail -10`
Expected: clean build.

- [ ] **Step 4: Final commit (if any lint fixups)**

```bash
git add -A && git commit -m "chore(email): Wave A lint + verification"
```

---

## Self-review checklist (run before opening the PR)

- Spec 17 Wave A items: #4 token fix ✔ (Task 3) · #5 branded HTML ✔ (Task 5) · plain-text twin ✔ (Task 4/6) · CID logo ✔ (Task 2/5/6).
- Accepted-hardening items: resend overrides ✔ (Task 9) · typed render paths ✔ (Task 4) · markdown links+bold+CTA-normalize+URL-policy ✔ (Task 4) · coachName precedence ✔ (Task 5/7) · CID robustness ✔ (Task 2) · env kill-switch ✔ (Task 6) · reminder cap + rotate-after-send ✔ (Task 8).
- Security-pass items: subject allowlist + no-`#t=` assertion ✔ (Task 4) · token rotation non-atomic mitigation ✔ (Tasks 8/9) · markdown link URL policy ✔ (Task 4). (Clone-route bypass + restore-transactionality are **Wave B** items — not in this plan.)
- Deferred (NOT in Wave A): per-campaign canary, full metrics dashboards, token-version/grace column, Wave B entirely.
- No schema migration. No destructive ops.

## Open verification notes for the implementer
- Confirm the campaign→creator-coach relation field name in `schema.prisma` (used in Tasks 7–9). If it differs from `creatorCoach`, use the real name or a guarded secondary `db.coach.findUnique`.
- Confirm each route test file's existing mock style for `@/services/notifications` and `@/lib/db`; match it rather than introducing a new mocking pattern.
- Confirm `invitation.expiresAt` is selected in the resend `findUnique` (Task 9) — add to the select if absent.
