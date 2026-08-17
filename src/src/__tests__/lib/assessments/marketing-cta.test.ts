import {
  createMarketingCtaPreset,
  extractMarketingCta,
  getMarketingCtaPublishIssues,
  mergeMarketingCta,
} from "@/lib/assessments/marketing-cta";

describe("versioned marketing CTA content", () => {
  it("builds the approved Full Marketing snapshot", () => {
    const cta = createMarketingCtaPreset("FULL_MARKETING");

    expect(cta.blocks.map((block) => block.id)).toEqual([
      "full-next-step",
      "full-books-image",
      "full-assessment-button",
      "full-followup-copy",
      "full-followup-button",
      "full-books-button",
    ]);
    expect(cta.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "full-books-image",
          src: "/brand/scaling-up-books.png",
          alt: "Mastering the Rockefeller Habits and Scaling Up books",
        }),
        expect.objectContaining({
          id: "full-assessment-button",
          target: {
            kind: "url",
            href: "https://scalinguptoolkit.com/s/ScaleUpQA",
          },
        }),
        expect.objectContaining({
          id: "full-followup-button",
          target: {
            kind: "url",
            href: "https://coaches.scalingup.com/coach-match-after-assessment-form",
          },
        }),
        expect.objectContaining({
          id: "full-books-button",
          target: { kind: "url", href: "https://scalingup.com/book/" },
        }),
      ]),
    );
  });

  it("builds Quick and Blank as independent starting snapshots", () => {
    const quick = createMarketingCtaPreset("SCALING_UP_QUICK");
    const blank = createMarketingCtaPreset("BLANK");

    expect(quick.blocks).toEqual([
      expect.objectContaining({
        id: "quick-resources-button",
        target: { kind: "url", href: "https://scalingup.com" },
      }),
      expect.objectContaining({
        id: "quick-coach-button",
        target: { kind: "referringCoachOrDirectory" },
      }),
    ]);
    expect(blank.blocks).toEqual([]);
    quick.blocks.splice(0, 1);
    expect(createMarketingCtaPreset("SCALING_UP_QUICK").blocks).toHaveLength(2);
  });

  it("merges without disturbing unrelated report configuration", () => {
    const source = {
      findings: { enabled: true },
      publicMarketing: { scoreBands: [{ min: 0, max: 24 }] },
    };
    const cta = createMarketingCtaPreset("FULL_MARKETING");

    const merged = mergeMarketingCta(source, cta) as {
      findings: { enabled: boolean };
      publicMarketing: {
        scoreBands: Array<{ min: number; max: number }>;
        marketingCta: typeof cta;
      };
    };

    expect(merged.findings).toEqual({ enabled: true });
    expect(merged.publicMarketing.scoreBands).toEqual([{ min: 0, max: 24 }]);
    expect(merged.publicMarketing.marketingCta).toEqual(cta);
    expect(source).not.toHaveProperty("marketingCta");
    expect(extractMarketingCta({ findings: { enabled: true } })).toBeNull();
  });

  it("requires a preset and at least one action at publication", () => {
    expect(getMarketingCtaPublishIssues(null)).toContainEqual(
      expect.objectContaining({ code: "CTA_PRESET_REQUIRED" }),
    );
    expect(
      getMarketingCtaPublishIssues(createMarketingCtaPreset("BLANK")),
    ).toContainEqual(expect.objectContaining({ code: "CTA_ACTION_REQUIRED" }));
  });
});
