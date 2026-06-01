import {
  escapeHtml,
  interpolateContentForHtml,
} from "@/lib/templates/interpolate-content-html";

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
