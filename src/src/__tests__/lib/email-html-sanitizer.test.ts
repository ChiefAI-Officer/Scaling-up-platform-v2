import {
  sanitizeEmailHtml,
  validateInvitationHtml,
  INVITATION_URL_TOKENS,
} from "@/lib/assessments/email-html-sanitizer";

// ──────────────────────────────────────────────────────────────────────────
// sanitizeEmailHtml — STRICT post-interpolation sanitizer (coach-pasted HTML).
// Tokens are already replaced with real https URLs before this runs, so this
// is a plain strict sanitizer (no token-awareness).
// ──────────────────────────────────────────────────────────────────────────
describe("sanitizeEmailHtml — strips dangerous content", () => {
  test("strips <script>", () => {
    const out = sanitizeEmailHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert\(1\)/);
    expect(out).toContain("<p>hi</p>");
  });

  test("strips img onerror handler", () => {
    const out = sanitizeEmailHtml('<img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/alert\(1\)/);
  });

  test("strips javascript: href", () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  test("strips data: href", () => {
    const out = sanitizeEmailHtml('<a href="data:text/html,<b>x">x</a>');
    expect(out).not.toMatch(/data:/i);
  });

  test("strips <style> tag entirely", () => {
    const out = sanitizeEmailHtml('<style>body{background:url(https://evil/x)}</style><p>ok</p>');
    expect(out).not.toMatch(/<style/i);
    expect(out).not.toMatch(/evil/);
    expect(out).toContain("<p>ok</p>");
  });

  test("strips <iframe>", () => {
    const out = sanitizeEmailHtml('<iframe src="https://evil"></iframe><p>ok</p>');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).toContain("<p>ok</p>");
  });

  test("strips <form>, <input>, <button>", () => {
    const out = sanitizeEmailHtml(
      '<form action="https://evil"><input name="x"><button>go</button></form><p>ok</p>',
    );
    expect(out).not.toMatch(/<form/i);
    expect(out).not.toMatch(/<input/i);
    expect(out).not.toMatch(/<button/i);
    expect(out).toContain("<p>ok</p>");
  });

  test("strips remote http img (data:/http: image policy — cid+https only)", () => {
    const out = sanitizeEmailHtml('<img src="http://evil/track.gif" alt="x">');
    // src must be dropped (http not allowed for images)
    expect(out).not.toMatch(/http:\/\/evil/);
  });

  test("strips data: img per policy", () => {
    const out = sanitizeEmailHtml('<img src="data:image/png;base64,AAAA" alt="x">');
    expect(out).not.toMatch(/data:/i);
  });

  test("strips style background url()", () => {
    const out = sanitizeEmailHtml('<p style="background:url(https://evil/x)">hi</p>');
    expect(out).not.toMatch(/url\(/i);
    expect(out).not.toMatch(/evil/);
    expect(out).toContain("hi");
  });

  test("strips style background-color url()", () => {
    const out = sanitizeEmailHtml('<p style="background-color:url(https://evil/x)">hi</p>');
    expect(out).not.toMatch(/url\(/i);
    expect(out).not.toMatch(/evil/);
  });

  test("strips CSS expression()", () => {
    const out = sanitizeEmailHtml('<p style="width:expression(alert(1))">hi</p>');
    expect(out).not.toMatch(/expression\(/i);
    expect(out).not.toMatch(/alert\(1\)/);
  });

  test("strips @import in style", () => {
    const out = sanitizeEmailHtml('<div style="@import url(https://evil)">x</div>');
    expect(out).not.toMatch(/@import/i);
    expect(out).not.toMatch(/evil/);
  });

  test("strips HTML comments", () => {
    const out = sanitizeEmailHtml('<!-- secret --><p>ok</p>');
    expect(out).not.toMatch(/secret/);
    expect(out).not.toMatch(/<!--/);
    expect(out).toContain("<p>ok</p>");
  });

  test("strips <svg onload>", () => {
    const out = sanitizeEmailHtml('<svg onload="alert(1)"></svg><p>ok</p>');
    expect(out).not.toMatch(/<svg/i);
    expect(out).not.toMatch(/onload/i);
    expect(out).toContain("<p>ok</p>");
  });

  test("strips protocol-relative href", () => {
    const out = sanitizeEmailHtml('<a href="//evil.com/x">x</a>');
    expect(out).not.toMatch(/\/\/evil\.com/);
  });

  test("strips <object> and <embed>", () => {
    const out = sanitizeEmailHtml('<object data="x"></object><embed src="y"><p>ok</p>');
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
    expect(out).toContain("<p>ok</p>");
  });

  test("strips <link>, <meta>, <base>", () => {
    const out = sanitizeEmailHtml(
      '<link rel="stylesheet" href="https://evil"><meta http-equiv="refresh" content="0;url=https://evil"><base href="https://evil"><p>ok</p>',
    );
    expect(out).not.toMatch(/<link/i);
    expect(out).not.toMatch(/<meta/i);
    expect(out).not.toMatch(/<base/i);
    expect(out).not.toMatch(/evil/);
    expect(out).toContain("<p>ok</p>");
  });
});

describe("sanitizeEmailHtml — allows safe email content", () => {
  test("allows <p style='color:#522583'>", () => {
    const out = sanitizeEmailHtml('<p style="color:#522583">brand</p>');
    expect(out).toContain("brand");
    expect(out).toMatch(/color:\s*#522583/i);
  });

  test("allows https anchor", () => {
    const out = sanitizeEmailHtml('<a href="https://x.com">t</a>');
    expect(out).toMatch(/href="https:\/\/x\.com"/);
    expect(out).toContain(">t</a>");
  });

  test("allows mailto anchor", () => {
    const out = sanitizeEmailHtml('<a href="mailto:hi@x.com">mail</a>');
    expect(out).toMatch(/href="mailto:hi@x\.com"/);
  });

  test("allows cid: image (inline logo)", () => {
    const out = sanitizeEmailHtml('<img src="cid:logo" alt="logo" width="120">');
    expect(out).toMatch(/src="cid:logo"/);
    expect(out).toMatch(/alt="logo"/);
  });

  test("allows https image (remote — normal email feature)", () => {
    const out = sanitizeEmailHtml('<img src="https://cdn/ok.png" alt="ok">');
    expect(out).toMatch(/src="https:\/\/cdn\/ok\.png"/);
  });

  test("allows tables with layout attrs", () => {
    const out = sanitizeEmailHtml(
      '<table><thead><tr><th colspan="2">h</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
    );
    expect(out).toMatch(/<table/);
    expect(out).toMatch(/<th[^>]*colspan="2"/);
    expect(out).toContain("<td>a</td>");
  });

  test("allows allowlisted style props", () => {
    const out = sanitizeEmailHtml(
      '<div style="text-align:center;padding:10px;margin:5px;border:1px solid #000;font-size:14px;font-weight:700">x</div>',
    );
    expect(out).toMatch(/text-align:\s*center/);
    expect(out).toMatch(/padding:\s*10px/);
  });
});

describe("sanitizeEmailHtml — idempotent + robust", () => {
  test("idempotent (sanitize twice == once)", () => {
    const dirty =
      '<p style="color:#522583">hi</p><script>x</script><a href="https://x.com">t</a><img src="cid:logo">';
    const once = sanitizeEmailHtml(dirty);
    const twice = sanitizeEmailHtml(once);
    expect(twice).toBe(once);
  });

  test("safe on empty string", () => {
    expect(sanitizeEmailHtml("")).toBe("");
  });

  test("safe on garbage", () => {
    expect(() => sanitizeEmailHtml("<<<>>><<not html<<")).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// validateInvitationHtml — token PLACEMENT validator on RAW (pre-interp) html.
// ──────────────────────────────────────────────────────────────────────────
describe("validateInvitationHtml — accepts valid token placement", () => {
  test("token as whole href value (camelCase)", () => {
    expect(validateInvitationHtml('<a href="{{invitationUrl}}">Start</a>')).toEqual({ ok: true });
  });

  test("token as whole href value (snake_case)", () => {
    expect(validateInvitationHtml('<a href="{{invitation_url}}">Start</a>')).toEqual({ ok: true });
  });

  test("token as whole href value (assessmentUrl alias)", () => {
    expect(validateInvitationHtml('<a href="{{assessmentUrl}}">Start</a>')).toEqual({ ok: true });
  });

  test("token as whole href value (assessment_url alias)", () => {
    expect(validateInvitationHtml('<a href="{{assessment_url}}">Start</a>')).toEqual({ ok: true });
  });

  test("token as plain text node", () => {
    expect(validateInvitationHtml('<p>Visit {{invitation_url}} to start</p>')).toEqual({ ok: true });
  });

  test("token in href with whitespace inside braces", () => {
    expect(validateInvitationHtml('<a href="{{ invitationUrl }}">Start</a>')).toEqual({ ok: true });
  });

  test("realistic full email with href + text-node fallback", () => {
    const html =
      '<p style="color:#522583">Hello</p>' +
      '<a href="{{invitationUrl}}">Start the assessment</a>' +
      '<p>Or paste: {{invitationUrl}}</p>';
    expect(validateInvitationHtml(html)).toEqual({ ok: true });
  });
});

describe("validateInvitationHtml — rejects bad token placement", () => {
  test("rejects when NO url token present (R1-M8)", () => {
    const r = validateInvitationHtml('<p>Hello, welcome to the assessment</p>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/must include the survey link token|no .*token|token .*required/i);
  });

  test("rejects token mixed into external href query string", () => {
    const r = validateInvitationHtml('<a href="https://evil.com?t={{invitationUrl}}">x</a>');
    expect(r.ok).toBe(false);
  });

  test("rejects token in img src", () => {
    const r = validateInvitationHtml('<img src="{{invitationUrl}}">');
    expect(r.ok).toBe(false);
  });

  test("rejects token in img srcset", () => {
    const r = validateInvitationHtml('<img srcset="{{invitationUrl}} 2x">');
    expect(r.ok).toBe(false);
  });

  test("rejects token in mailto body query", () => {
    const r = validateInvitationHtml('<a href="mailto:x@x.com?body={{invitationUrl}}">x</a>');
    expect(r.ok).toBe(false);
  });

  test("rejects token in style/CSS url()", () => {
    const r = validateInvitationHtml('<p style="background:url({{invitationUrl}})">x</p>');
    expect(r.ok).toBe(false);
  });

  test("rejects token inside HTML comment", () => {
    const r = validateInvitationHtml('<!-- {{invitationUrl}} --><a href="https://x">t</a>');
    expect(r.ok).toBe(false);
  });

  test("rejects token in form action", () => {
    const r = validateInvitationHtml('<form action="https://evil?{{invitationUrl}}"><input></form>');
    expect(r.ok).toBe(false);
  });

  test("rejects token in a non-href attribute", () => {
    const r = validateInvitationHtml('<a href="https://x" title="{{invitationUrl}}">t</a>');
    expect(r.ok).toBe(false);
  });

  test("rejects token concatenated with other chars in href", () => {
    const r = validateInvitationHtml('<a href="{{invitationUrl}}#frag">t</a>');
    expect(r.ok).toBe(false);
  });

  test("rejects snake_case token misplaced in src", () => {
    const r = validateInvitationHtml('<img src="{{assessment_url}}">');
    expect(r.ok).toBe(false);
  });
});

describe("INVITATION_URL_TOKENS export", () => {
  test("includes all four spellings", () => {
    expect(INVITATION_URL_TOKENS).toEqual(
      expect.arrayContaining(["invitationUrl", "invitation_url", "assessmentUrl", "assessment_url"]),
    );
  });
});
