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
  it("single-escapes & in href query strings (no double-escaping)", () => {
    // The paragraph body is HTML-escaped once before renderInline runs.
    // A URL like ?a=1&b=2 becomes ?a=1&amp;b=2 after escapeHtml. renderInline must
    // NOT call escapeHtml again on the captured href or & becomes &amp;amp;.
    const html = renderHtmlBody(
      "See [report](https://scalingup.com/r?a=1&b=2)",
      baseVars,
    );
    expect(html).toContain("a=1&amp;b=2");         // escaped exactly once
    expect(html).not.toContain("&amp;amp;");        // NOT double-escaped
    expect(html).toContain('<a href="https://scalingup.com/r?a=1&amp;b=2"');
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
  it("neutralizes markdown-link syntax from a substituted data value (no injected <a>)", () => {
    const html = renderHtmlBody("Hi {{firstName}}", {
      ...baseVars,
      respondent: { firstName: "[x](https://evil.test)", lastName: "Y", email: "e@e.com" },
    });
    expect(html).not.toContain("<a href");
    expect(html).not.toContain('href="https://evil.test"');
  });
  it("neutralizes markdown-bold syntax from a substituted data value (no injected <strong>)", () => {
    const html = renderHtmlBody("Hi {{firstName}}", {
      ...baseVars,
      respondent: { firstName: "**evil**", lastName: "Y", email: "e@e.com" },
    });
    expect(html).not.toContain("<strong>");
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

import {
  buildInvitationEmailHtml,
  buildInvitationEmailShell,
  renderBrandedCustomHtmlText,
  renderCustomHtmlFragment,
  renderUniversalInvitationText,
  resolveInvitationCoachByline,
  shouldShowOrgLine,
} from "@/lib/assessments/invitation-email";

describe("branded custom-HTML invitation rendering", () => {
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
      "cid:sulogo",
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
    expect(withLogo.indexOf("cid:sulogo")).toBeLessThan(
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
});

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
  it("escapes the invitation URL in the shell (no attribute breakout / injected script)", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: { ...baseVars, invitationUrl: 'https://app.test/"><script>alert(1)</script>' },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('"><script');
  });
});

describe("renderFullHtmlBody — full-HTML override (#20)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderFullHtmlBody, renderFullTextBody } = require("@/lib/assessments/invitation-email");

  it("interpolates {{invitationUrl}} into an href via Wave A TOKEN_RE (pin #1)", () => {
    const out = renderFullHtmlBody(
      '<p>Hi {{respondentFirstName}}</p><a href="{{invitationUrl}}">Start</a>',
      baseVars,
    );
    expect(out).toContain("Jane");
    expect(out).toContain(`href="${baseVars.invitationUrl}"`);
    expect(out).not.toContain("{{invitationUrl}}");
  });

  it("resolves snake_case {{invitation_url}} (same regex/aliases as Wave A)", () => {
    const out = renderFullHtmlBody('<a href="{{invitation_url}}">go</a>', baseVars);
    expect(out).toContain(`href="${baseVars.invitationUrl}"`);
  });

  it("does NOT entity-decode before token substitution (pin #2)", () => {
    // A stored &#123;&#123;invitationUrl&#125;&#125; must stay inert HTML
    // entities — never resurrected into a live token the validator never vetted.
    const stored = '<p>&#123;&#123;invitationUrl&#125;&#125; {{invitationUrl}}</p>';
    const out = renderFullHtmlBody(stored, baseVars);
    // The real token is interpolated exactly once; the entity-encoded one is not.
    const occurrences = out.split(baseVars.invitationUrl).length - 1;
    expect(occurrences).toBe(1);
    // The credential bytes "#t=SECRET" appear only once (from the live token).
    expect(out.split("#t=SECRET").length - 1).toBe(1);
  });

  it("neutralizes a PII token value containing <script> (escape-before-sanitize)", () => {
    const out = renderFullHtmlBody(
      "<p>Hello {{respondentFirstName}}</p>",
      {
        ...baseVars,
        respondent: { firstName: '<script>alert(1)</script>', lastName: "Doe", email: "x@y.z" },
      },
    );
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(1)</script>");
  });

  it("strips disallowed tags via the strict sanitizer (no shell wrap)", () => {
    const out = renderFullHtmlBody(
      '<p>Body {{invitationUrl}}</p><iframe src="https://evil"></iframe><script>x()</script>',
      baseVars,
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<script");
    // No branded shell markers (CTA button text / logo cid).
    expect(out).not.toContain("Start the assessment");
    expect(out).not.toContain("cid:");
  });

  it("derives a plain-text twin from the HTML (renderFullTextBody)", () => {
    const txt = renderFullTextBody(
      '<p>Hi {{respondentFirstName}}</p><a href="{{invitationUrl}}">Start</a>',
      baseVars,
    );
    expect(txt).toContain("Jane");
    expect(txt).toContain(baseVars.invitationUrl);
    expect(txt).not.toContain("<p>");
    expect(txt).not.toContain("<a ");
  });
});

describe("resolveInvitationCoachByline — one Coach presentation model", () => {
  it("uses the creator's complete identity when it has a valid image", () => {
    expect(resolveInvitationCoachByline(
      { firstName: "Cre", lastName: "Ator", profileImage: "https://cdn.test/creator.png" },
      { firstName: "Own", lastName: "Er", profileImage: "https://cdn.test/owner.png" },
    )).toEqual({
      byline: {
        mode: "image_name",
        coachName: "Cre Ator",
        coachImageUrl: "https://cdn.test/creator.png",
      },
      legacyCoachLogoUrl: "https://cdn.test/creator.png",
      logoRejectedReason: null,
    });
  });

  it("keeps the creator's name when its image is absent", () => {
    expect(resolveInvitationCoachByline(
      { firstName: "Cre", lastName: "Ator", profileImage: null },
      { firstName: "Own", lastName: "Er", profileImage: "https://cdn.test/owner.png" },
    )).toEqual({
      byline: { mode: "name_only", coachName: "Cre Ator" },
      legacyCoachLogoUrl: null,
      logoRejectedReason: "no-image",
    });
  });

  it("rejects an invalid creator image without returning its raw URL", () => {
    const rejectedUrl = "javascript:alert('do-not-leak')";
    const result = resolveInvitationCoachByline(
      { firstName: "Cre", lastName: "Ator", profileImage: rejectedUrl },
      null,
    );

    expect(result).toEqual({
      byline: { mode: "name_only", coachName: "Cre Ator" },
      legacyCoachLogoUrl: null,
      logoRejectedReason: "invalid-url",
    });
    expect(JSON.stringify(result)).not.toContain(rejectedUrl);
  });

  it("uses the owner when there is no creator", () => {
    expect(resolveInvitationCoachByline(
      null,
      { firstName: "Own", lastName: "Er", profileImage: "https://cdn.test/owner.png" },
    )).toEqual({
      byline: {
        mode: "image_name",
        coachName: "Own Er",
        coachImageUrl: "https://cdn.test/owner.png",
      },
      legacyCoachLogoUrl: "https://cdn.test/owner.png",
      logoRejectedReason: null,
    });
  });

  it("does not fall through to the owner when the selected creator has no name", () => {
    expect(resolveInvitationCoachByline(
      { firstName: " ", lastName: "", profileImage: "https://cdn.test/image.png" },
      { firstName: "Own", lastName: "Er", profileImage: "https://cdn.test/owner.png" },
    )).toEqual({
      byline: { mode: "scaling_up_only" },
      legacyCoachLogoUrl: "https://cdn.test/image.png",
      logoRejectedReason: "missing-name",
    });
  });

  it("uses Scaling Up only when neither creator nor owner exists", () => {
    expect(resolveInvitationCoachByline(null, null)).toEqual({
      byline: { mode: "scaling_up_only" },
      legacyCoachLogoUrl: null,
      logoRejectedReason: "no-coach",
    });
  });
});

// ── Wave P — invitation-email chrome (coach logo + larger CTA) ──────────────
// The module is pure: it never reads the flag. Callers pass chrome:"waveP".
// Default (no chrome arg / chrome:"legacy") must be BYTE-IDENTICAL to the
// pre-Wave-P output, regardless of coachLogoUrl.

describe("buildInvitationEmailHtml — Wave P chrome", () => {
  const HTTPS_LOGO = "https://blob.example.com/coach-logo.png";

  it("legacy chrome (explicit) + a coachLogoUrl is byte-identical to the no-args build", () => {
    const before = buildInvitationEmailHtml({ bodyMarkdown: "Hi {{firstName}}", vars: baseVars });
    const after = buildInvitationEmailHtml({
      bodyMarkdown: "Hi {{firstName}}",
      vars: { ...baseVars, coachLogoUrl: HTTPS_LOGO },
      chrome: "legacy",
    });
    expect(after).toBe(before);
  });

  it("legacy HTML regression anchor (inline snapshot, fixed inputs)", () => {
    const html = buildInvitationEmailHtml({ bodyMarkdown: "Hi {{firstName}}", vars: baseVars });
    expect(html).toMatchInlineSnapshot(`
"<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="25%" style="height:6px;background:#E4002B;font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:#00A6CE;font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:#FFB81C;font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:#43B02A;font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
  <div style="background:#522583;background-image:linear-gradient(135deg,#522583,#3d1a63);padding:28px 32px;">
    <img src="cid:sulogo" alt="Scaling Up" width="180" style="display:block;border:0;outline:none;max-width:180px;height:auto;" />
    <div style="margin-top:14px;font-size:13px;color:#ffffff;opacity:0.85;">Acme Corp</div>
  </div>
  <div style="padding:28px 32px 8px;">
    <p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">Hi Jane</p>
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="https://app.test/org-survey/abc#t=SECRET" style="display:inline-block;background:#522583;color:#ffffff;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Start the assessment</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px;">If the button doesn't work, paste this into your browser:<br/><span style="word-break:break-all;color:#6b7280;">https://app.test/org-survey/abc#t=SECRET</span></p>
  </div>
  <div style="padding:18px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">&mdash; Scaling Up Platform</div>
</div>"
`);
  });

  it("waveP + valid https logo renders the coach logo img (escaped src + alt)", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: { ...baseVars, coachLogoUrl: HTTPS_LOGO },
      chrome: "waveP",
    });
    expect(html).toContain(`src="${HTTPS_LOGO}"`);
    expect(html).toContain('alt="Pat Coach"');
    // SU logo + header untouched
    expect(html).toContain('src="cid:sulogo"');
    // capped so an oversized image can't blow up the 560px layout
    expect(html).toContain("max-height:40px");
  });

  it("renders the Scaling Up logo BEFORE the coach logo (Jeff #69 — coach logo stays below the SU logo)", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: { ...baseVars, coachLogoUrl: HTTPS_LOGO },
      chrome: "waveP",
    });
    const suIdx = html.indexOf('src="cid:sulogo"');
    const coachIdx = html.indexOf(`src="${HTTPS_LOGO}"`);
    expect(suIdx).toBeGreaterThanOrEqual(0);
    expect(coachIdx).toBeGreaterThan(suIdx);
  });

  it("waveP escapes a src that needs escaping (no attribute breakout)", () => {
    const url = 'https://x.example/a?b=1&c="onerror=alert(1)';
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: { ...baseVars, coachLogoUrl: url },
      chrome: "waveP",
    });
    expect(html).not.toContain('c="onerror');
    expect(html).toContain("&amp;c=&quot;onerror");
  });

  it.each([
    ["http", "http://insecure.example/logo.png"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:image/png;base64,AAAA"],
    ["bare filename", "logo.png"],
    ["empty string", ""],
    ["null", null],
  ])("waveP rejects %s logo URL but keeps the rest of the waveP chrome", (_label, url) => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: { ...baseVars, coachLogoUrl: url },
      chrome: "waveP",
    });
    // exactly one <img (the SU CID logo) — no coach logo img
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('src="cid:sulogo"');
    // waveP CTA still applied
    expect(html).toContain("padding:18px 40px");
    expect(html).toContain("font-size:17px");
  });

  it("waveP escapes + control-strips the coach name in alt (no attribute breakout)", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: {
        ...baseVars,
        coachLogoUrl: HTTPS_LOGO,
        coachName: '"><img src=x onerror=alert(1)>\r\nEvil <Coach>',
      },
      chrome: "waveP",
    });
    expect(html).not.toContain('alt=""><img');
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/alt="[^"]*[\r\n]/);
    // escaped forms present instead
    expect(html).toContain("&quot;&gt;&lt;img");
  });

  it("waveP enlarges the CTA button; legacy keeps the exact current values", () => {
    const waveP = buildInvitationEmailHtml({ bodyMarkdown: "Hi", vars: baseVars, chrome: "waveP" });
    expect(waveP).toContain("padding:18px 40px");
    expect(waveP).toContain("font-size:17px;");
    expect(waveP).toContain("Start the assessment");
    expect(waveP).toContain("border-radius:8px");
    expect(waveP).toContain("font-weight:700");

    const legacy = buildInvitationEmailHtml({ bodyMarkdown: "Hi", vars: baseVars });
    expect(legacy).toContain("padding:14px 30px");
    expect(legacy).toContain("font-size:15px;");
    expect(legacy).not.toContain("padding:18px 40px");
  });

  it("full-HTML override ignores coachLogoUrl entirely (chrome excluded)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { renderFullHtmlBody } = require("@/lib/assessments/invitation-email");
    const raw = '<p>Hi {{respondentFirstName}}</p><a href="{{invitationUrl}}">Start</a>';
    const plain = renderFullHtmlBody(raw, baseVars);
    const withLogo = renderFullHtmlBody(raw, { ...baseVars, coachLogoUrl: HTTPS_LOGO });
    expect(withLogo).toBe(plain);
    expect(withLogo).not.toContain(HTTPS_LOGO);
  });
});

describe("universal invitation banner", () => {
  // Catches the universal branch accidentally retaining Wave-P/legacy header content.
  it("renders Scaling Up followed by the escaped coach byline and branded shell", () => {
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

    expect(html.indexOf('src="cid:sulogo"')).toBeLessThan(html.indexOf("https://cdn.test/martin.png"));
    expect(html).toContain("Your coach");
    expect(html).toContain("Martin &lt;Coach&gt;");
    expect(html).toContain('alt=""');
    expect(html).not.toContain("opacity:0.85");
    expect(html).toContain("Welcome to Acme Corp");
    expect(html).toContain("Start the assessment");
    expect(html).toContain("If the button doesn't work");
    expect(html).toContain("&mdash; Scaling Up Platform");
  });

  // Catches a name-only byline losing its visible Coach identity or adding an image.
  it("renders name-only coach identity with just the Scaling Up logo image", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: baseVars,
      chrome: "universalBanner",
      coachByline: { mode: "name_only", coachName: "Martin Segnitz" },
    });

    expect(html).toContain("Your coach");
    expect(html).toContain("Martin Segnitz");
    expect(html.match(/<img /g)).toHaveLength(1);
  });

  // Catches a Scaling-Up-only invitation emitting empty coach chrome.
  it("omits the entire coach byline for Scaling Up only", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: baseVars,
      chrome: "universalBanner",
      coachByline: { mode: "scaling_up_only" },
    });

    expect(html).not.toContain("data-invitation-coach-byline");
    expect(html).not.toContain("Your coach");
    expect(html.match(/<img /g)).toHaveLength(1);
  });

  // Catches accidental reuse of alias-derived organization chrome in the universal branch.
  it.each([
    ["LVA", "leadership-vision-alignment", false],
    ["known non-LVA", "qsp-v2", true],
    ["null alias", null, true],
    ["unknown alias", "future-assessment-alias", true],
  ] as const)("never auto-inserts organization identity for %s", (_case, alias, expectedShowOrgLine) => {
    const showOrgLine = shouldShowOrgLine(alias);
    expect(showOrgLine).toBe(expectedShowOrgLine);

    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: { ...baseVars, organizationName: "Organization Must Not Appear", showOrgLine },
      chrome: "universalBanner",
      coachByline: { mode: "scaling_up_only" },
    });
    expect(html).not.toContain("Organization Must Not Appear");
    expect(html).not.toContain("opacity:0.85");
  });

  // Catches a no-wrap style that truncates long coach identities on narrow clients.
  it("forces an unbroken long coach name to wrap in email clients", () => {
    const coachName = `Coach${"W".repeat(180)}`;
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: baseVars,
      chrome: "universalBanner",
      coachByline: { mode: "name_only", coachName },
    });
    expect(html).toContain(coachName);
    expect(html).not.toContain("white-space:nowrap");
    expect(html).toContain("overflow-wrap:anywhere;word-wrap:break-word;word-break:break-all;");
  });

  // Catches attribute/element injection when a caller bypasses the resolver.
  it("escapes and control-strips unsafe coach values", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: baseVars,
      chrome: "universalBanner",
      coachByline: {
        mode: "image_name",
        coachName: 'Martin\r\n"><script>alert(1)</script>',
        coachImageUrl: 'https://cdn.test/a.png" onerror="alert(1)',
      },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('" onerror="');
    expect(html).not.toMatch(/Martin[\r\n]/);
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  // Catches text composition using legacy vars.coachName instead of the resolved byline.
  it("renders the universal plain-text counterpart", () => {
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
  });

  it("renders sanitized HTML text and omits Coach for Scaling Up only", () => {
    expect(renderUniversalInvitationText({
      body: { kind: "sanitized_html", value: "<p>Hi {{respondentFirstName}}</p>" },
      vars: baseVars,
      coachByline: { mode: "scaling_up_only" },
    })).toBe([
      "Scaling Up Platform",
      "",
      "Hi Jane",
      "",
      `Start the assessment: ${baseVars.invitationUrl}`,
    ].join("\n"));
  });
});

describe("showOrgLine — invitation header company-line suppression (Jeff #61)", () => {
  it("renders the org/company line by default (showOrgLine undefined) — unchanged", () => {
    const html = buildInvitationEmailHtml({ bodyMarkdown: "Hi", vars: baseVars });
    expect(html).toContain("Acme Corp");
  });

  it("omits the org/company line when showOrgLine is false, even if organizationName is set", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: { ...baseVars, showOrgLine: false },
    });
    expect(html).not.toContain("Acme Corp");
    // the faint org-line div is the only element using this style
    expect(html).not.toContain("opacity:0.85");
  });

  it("still renders the org line when showOrgLine is explicitly true", () => {
    const html = buildInvitationEmailHtml({
      bodyMarkdown: "Hi",
      vars: { ...baseVars, showOrgLine: true },
    });
    expect(html).toContain("Acme Corp");
  });
});

describe("shouldShowOrgLine — template alias suppress rule (Jeff #61)", () => {
  it("suppresses the org line for the LVA template", () => {
    expect(shouldShowOrgLine("leadership-vision-alignment")).toBe(false);
  });

  it("shows the org line for every other template and when the alias is unknown", () => {
    expect(shouldShowOrgLine("qsp-v2")).toBe(true);
    expect(shouldShowOrgLine("RockHabits")).toBe(true);
    expect(shouldShowOrgLine("scaling-up-full")).toBe(true);
    expect(shouldShowOrgLine(null)).toBe(true);
    expect(shouldShowOrgLine(undefined)).toBe(true);
  });
});
