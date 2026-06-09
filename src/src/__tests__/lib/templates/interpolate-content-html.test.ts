import * as fs from "fs";
import * as path from "path";
import {
  escapeHtml,
  interpolateContentForHtml,
} from "@/lib/templates/interpolate-content-html";
import { sanitizeCustomHtml } from "@/lib/templates/sanitize-custom-html";

// ── path to the artifact (repo-root relative to this test file) ───────────────
// src/src/__tests__/lib/templates/ → up 5 → repo-root (where docs/ lives)
const REPO_ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const ARTIFACT_PATH = path.join(REPO_ROOT, "docs", "specs", "master-class-landing-kajabi.html");

describe("escapeHtml", () => {
  it("1. encodes ampersand", () => {
    expect(escapeHtml("&")).toBe("&amp;");
  });

  it("2. encodes angle brackets", () => {
    expect(escapeHtml("<>")).toBe("&lt;&gt;");
  });

  it("3. encodes quotes", () => {
    expect(escapeHtml("\"'")).toBe("&quot;&#x27;");
  });

  it("4. leaves plain text unchanged", () => {
    expect(escapeHtml("plain text")).toBe("plain text");
  });

  it("5. encodes mixed content exactly once (no double-escape)", () => {
    expect(escapeHtml("5 < 10 & 10 > 5")).toBe("5 &lt; 10 &amp; 10 &gt; 5");
  });
});

describe("interpolateContentForHtml", () => {
  it("6. replaces {{name}} with value", () => {
    expect(interpolateContentForHtml("Hello {{name}}", { name: "World" })).toBe(
      "Hello World"
    );
  });

  it("7. replaces {{ name }} with value (spaced braces)", () => {
    expect(
      interpolateContentForHtml("Hello {{ name }}", { name: "World" })
    ).toBe("Hello World");
  });

  it("8. CRITICAL XSS regression — escapes HTML in variable value", () => {
    const out = interpolateContentForHtml("{{bio}}", {
      bio: "<img src=x onerror=alert(1)>",
    });
    expect(out).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).toContain("&lt;");
    expect(out).not.toContain("<img");
  });

  it("9. replaces multiple variables", () => {
    expect(
      interpolateContentForHtml("{{a}} and {{b}}", { a: "foo", b: "bar" })
    ).toBe("foo and bar");
  });

  it("10. null value treated as empty string", () => {
    expect(interpolateContentForHtml("{{name}}", { name: null })).toBe("");
  });

  it("11. undefined value treated as empty string", () => {
    expect(interpolateContentForHtml("{{name}}", { name: undefined })).toBe("");
  });

  it("12. no variables — template returned as-is", () => {
    expect(interpolateContentForHtml("No vars here", {})).toBe("No vars here");
  });

  it("13. unmatched token left literal", () => {
    expect(
      interpolateContentForHtml("{{missing}}", { other: "x" })
    ).toBe("{{missing}}");
  });

  it("14. escapes quotes inside variable value", () => {
    expect(
      interpolateContentForHtml('<a title="{{title}}">x</a>', {
        title: 'He said "hi"',
      })
    ).toBe('<a title="He said &quot;hi&quot;">x</a>');
  });

  it("15. escapes ampersand in variable value exactly once", () => {
    expect(interpolateContentForHtml("{{q}}", { q: "A & B" })).toBe(
      "A &amp; B"
    );
  });
});

// ── Task 3 — Interpolation + strict re-sanitize (positive path) ───────────────
describe("master-class artifact: interpolation + strict re-sanitize", () => {
  const VARS = {
    workshop_title: "Exit & Valuation Master Class",
    workshop_description: "A one-day session for founders ready to build enterprise value.",
    event_date: "Thursday, June 18, 2026",
    event_date_no_weekday: "June 18, 2026",
    event_time: "9:00 AM EDT",
    coach_name: "Jane Smith",
    coach_title: "Scaling Up Certified Coach",
    coach_photo: "https://cdn.example.com/photos/jane-smith.jpg",
    price: "$349",
    registration_url: "https://app.example.com/workshop/foo-bar",
  };

  let artifact: string;
  let out: string;
  let strictOut: string;

  beforeAll(() => {
    artifact = fs.readFileSync(ARTIFACT_PATH, "utf8");
    out = interpolateContentForHtml(artifact, VARS);
    strictOut = sanitizeCustomHtml(out, { allowTokenUris: false }).sanitized;
  });

  it("no {{workshop_title}} tokens remain after interpolation", () => {
    expect(out).not.toContain("{{workshop_title}}");
  });

  it("no {{workshop_description}} tokens remain after interpolation", () => {
    expect(out).not.toContain("{{workshop_description}}");
  });

  it("no {{event_date}} tokens remain after interpolation", () => {
    expect(out).not.toContain("{{event_date}}");
  });

  it("no {{coach_name}} tokens remain after interpolation", () => {
    expect(out).not.toContain("{{coach_name}}");
  });

  it("no {{coach_photo}} tokens remain after interpolation", () => {
    expect(out).not.toContain("{{coach_photo}}");
  });

  it("no {{registration_url}} tokens remain after interpolation", () => {
    expect(out).not.toContain("{{registration_url}}");
  });

  it("ampersand in workshop_title is HTML-escaped exactly once (not double-escaped)", () => {
    // "Exit & Valuation" → "Exit &amp; Valuation"; must NOT be "&amp;amp;"
    expect(out).toContain("Exit &amp; Valuation");
    expect(out).not.toContain("&amp;amp;");
  });

  it("registration_url href survives interpolation literally", () => {
    expect(out).toContain('href="https://app.example.com/workshop/foo-bar"');
  });

  it("coach_photo src survives interpolation literally", () => {
    expect(out).toContain('src="https://cdn.example.com/photos/jane-smith.jpg"');
  });

  it("strict re-sanitize: https href survives", () => {
    expect(strictOut).toContain('href="https://app.example.com/workshop/foo-bar"');
  });

  it("strict re-sanitize: https img src survives", () => {
    expect(strictOut).toContain('src="https://cdn.example.com/photos/jane-smith.jpg"');
  });
});

// ── Task 3 — Interpolation + strict re-sanitize (negative/XSS path) ──────────
describe("master-class artifact: javascript: injection stripped by strict re-sanitize", () => {
  let artifact: string;

  beforeAll(() => {
    artifact = fs.readFileSync(ARTIFACT_PATH, "utf8");
  });

  it("javascript: registration_url does not survive strict re-sanitize", () => {
    const out = interpolateContentForHtml(artifact, {
      registration_url: "javascript:alert(1)",
      // provide safe fallbacks for all other tokens so the only javascript:
      // risk is the one being tested
      workshop_title: "Test",
      workshop_description: "",
      event_date: "June 18, 2026",
      event_date_no_weekday: "June 18, 2026",
      event_time: "9:00 AM EDT",
      coach_name: "Test Coach",
      coach_title: "Coach",
      coach_photo: "https://cdn.example.com/safe.jpg",
      price: "$349",
    });
    const { sanitized } = sanitizeCustomHtml(out, { allowTokenUris: false });
    expect(sanitized).not.toContain("javascript:");
  });

  it("javascript: coach_photo does not survive strict re-sanitize", () => {
    const out = interpolateContentForHtml(artifact, {
      coach_photo: "javascript:alert(2)",
      workshop_title: "Test",
      workshop_description: "",
      event_date: "June 18, 2026",
      event_date_no_weekday: "June 18, 2026",
      event_time: "9:00 AM EDT",
      coach_name: "Test Coach",
      coach_title: "Coach",
      registration_url: "https://app.example.com/workshop/safe",
      price: "$349",
    });
    const { sanitized } = sanitizeCustomHtml(out, { allowTokenUris: false });
    expect(sanitized).not.toContain("javascript:");
  });
});

// ── Task 4 — Empty-data degrade ────────────────────────────────────────────────
describe("master-class artifact: empty-data graceful degrade", () => {
  let artifact: string;

  beforeAll(() => {
    artifact = fs.readFileSync(ARTIFACT_PATH, "utf8");
  });

  it("does not throw when coach_photo, workshop_description, and registration_url are empty", () => {
    expect(() =>
      interpolateContentForHtml(artifact, {
        coach_photo: "",
        workshop_description: "",
        registration_url: "",
        workshop_title: "Empty Data Test",
        event_date: "June 18, 2026",
        event_date_no_weekday: "June 18, 2026",
        event_time: "9:00 AM EDT",
        coach_name: "Test Coach",
        coach_title: "Coach",
        price: "$349",
      })
    ).not.toThrow();
  });

  it("output still contains hero-card markup after empty interpolation", () => {
    const out = interpolateContentForHtml(artifact, {
      coach_photo: "",
      workshop_description: "",
      registration_url: "",
      workshop_title: "Empty Data Test",
      event_date: "June 18, 2026",
      event_date_no_weekday: "June 18, 2026",
      event_time: "9:00 AM EDT",
      coach_name: "Test Coach",
      coach_title: "Coach",
      price: "$349",
    });
    expect(out).toContain('class="hero-card"');
  });

  it("output still contains the generic About lead sentence after empty interpolation", () => {
    const out = interpolateContentForHtml(artifact, {
      coach_photo: "",
      workshop_description: "",
      registration_url: "",
      workshop_title: "Empty Data Test",
      event_date: "June 18, 2026",
      event_date_no_weekday: "June 18, 2026",
      event_time: "9:00 AM EDT",
      coach_name: "Test Coach",
      coach_title: "Coach",
      price: "$349",
    });
    // The About section opens with a generic sentence (does not depend on any token)
    expect(out).toContain("a Scaling Up Certified Coach");
  });

  it("{{coach_photo}} token is gone even when value is empty string", () => {
    const out = interpolateContentForHtml(artifact, {
      coach_photo: "",
      workshop_description: "",
      registration_url: "",
      workshop_title: "Empty Data Test",
      event_date: "June 18, 2026",
      event_date_no_weekday: "June 18, 2026",
      event_time: "9:00 AM EDT",
      coach_name: "Test Coach",
      coach_title: "Coach",
      price: "$349",
    });
    expect(out).not.toContain("{{coach_photo}}");
  });

  it("{{workshop_description}} token is gone even when value is empty string", () => {
    const out = interpolateContentForHtml(artifact, {
      coach_photo: "",
      workshop_description: "",
      registration_url: "",
      workshop_title: "Empty Data Test",
      event_date: "June 18, 2026",
      event_date_no_weekday: "June 18, 2026",
      event_time: "9:00 AM EDT",
      coach_name: "Test Coach",
      coach_title: "Coach",
      price: "$349",
    });
    expect(out).not.toContain("{{workshop_description}}");
  });

  it("{{registration_url}} token is gone even when value is empty string", () => {
    const out = interpolateContentForHtml(artifact, {
      coach_photo: "",
      workshop_description: "",
      registration_url: "",
      workshop_title: "Empty Data Test",
      event_date: "June 18, 2026",
      event_date_no_weekday: "June 18, 2026",
      event_time: "9:00 AM EDT",
      coach_name: "Test Coach",
      coach_title: "Coach",
      price: "$349",
    });
    expect(out).not.toContain("{{registration_url}}");
  });
});
