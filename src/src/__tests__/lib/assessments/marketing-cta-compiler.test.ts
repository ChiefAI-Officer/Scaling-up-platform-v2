import {
  createMarketingCtaPreset,
  type MarketingCtaConfigV1,
} from "@/lib/assessments/marketing-cta";
import {
  compileMarketingCtaHtml,
  loadSafeMarketingCta,
  prepareMarketingCtaForStorage,
} from "@/lib/assessments/marketing-cta-compiler";

describe("marketing CTA compiler", () => {
  it("escapes text and never emits executable markup", () => {
    const escapedText: MarketingCtaConfigV1 = {
      schemaVersion: 1,
      presetOrigin: "BLANK",
      sanitizedHtml: "",
      blocks: [
        {
          id: "escaped",
          type: "text",
          lead: "",
          body: '<script>alert(1)</script><img onerror="alert(1)">',
          align: "left",
        },
      ],
    };

    const html = compileMarketingCtaHtml(escapedText);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror=");
    expect(html).toContain("&lt;script&gt;");
  });

  it.each([
    { kind: "url", href: "http://example.com" },
    { kind: "url", href: "javascript:alert(1)" },
    { kind: "url", href: "data:text/html,bad" },
  ] as const)("rejects unsafe URL destination $href", (target) => {
    const unsafe: MarketingCtaConfigV1 = {
      schemaVersion: 1,
      presetOrigin: "BLANK",
      sanitizedHtml: "",
      blocks: [
        {
          id: "unsafe",
          type: "button",
          label: "Unsafe",
          target,
          newTab: false,
          style: "primary",
        },
      ],
    };
    expect(() => compileMarketingCtaHtml(unsafe)).toThrow();
  });

  it("compiles HTTPS, mail, phone, and dynamic coach actions", () => {
    const cta: MarketingCtaConfigV1 = {
      schemaVersion: 1,
      presetOrigin: "BLANK",
      sanitizedHtml: "",
      blocks: [
        {
          id: "https",
          type: "button",
          label: "Web",
          target: { kind: "url", href: "https://scalingup.com" },
          newTab: true,
          style: "primary",
        },
        {
          id: "mail",
          type: "button",
          label: "Mail",
          target: { kind: "mailto", address: "coach@example.com" },
          newTab: false,
          style: "secondary",
        },
        {
          id: "tel",
          type: "button",
          label: "Call",
          target: { kind: "tel", number: "+1 212 555 0100" },
          newTab: false,
          style: "secondary",
        },
        {
          id: "coach",
          type: "button",
          label: "Coach",
          target: { kind: "referringCoachOrDirectory" },
          newTab: false,
          style: "secondary",
        },
      ],
    };
    const html = compileMarketingCtaHtml(cta);
    expect(html).toContain('href="https://scalingup.com"');
    expect(html).toContain('href="mailto:coach@example.com"');
    expect(html).toContain('href="tel:+12125550100"');
    expect(html).toContain('data-dynamic-target="referring-coach-or-directory"');
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("<form");
  });

  it("discards forged HTML and only loads compiler-matching storage", () => {
    const preset = createMarketingCtaPreset("FULL_MARKETING");
    const prepared = prepareMarketingCtaForStorage({
      findings: { enabled: true },
      publicMarketing: {
        marketingCta: { ...preset, sanitizedHtml: "<iframe>forged</iframe>" },
      },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error("expected safe prepared CTA");
    const loaded = loadSafeMarketingCta(prepared.reportConfig);
    expect(loaded?.sanitizedHtml).toBe(compileMarketingCtaHtml(preset));
    expect(loaded?.sanitizedHtml).not.toContain("forged");
    expect(
      loadSafeMarketingCta({
        publicMarketing: { marketingCta: { ...preset, sanitizedHtml: "bad" } },
      }),
    ).toBeNull();
    expect(
      loadSafeMarketingCta({ publicMarketing: { marketingCta: { bad: true } } }),
    ).toBeNull();
  });
});
