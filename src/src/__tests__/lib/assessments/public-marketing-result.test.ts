import { createMarketingCtaPreset } from "@/lib/assessments/marketing-cta";
import { loadPublicMarketingResultConfig } from "@/lib/assessments/public-marketing-result";
import { prepareMarketingCtaForStorage } from "@/lib/assessments/marketing-cta-compiler";

describe("public marketing result config", () => {
  it("loads safe CTA and exact authored score bands", () => {
    const prepared = prepareMarketingCtaForStorage({
      publicMarketing: {
        scoreBands: [
          { min: 0, max: 24, label: "0–24%", headline: "Ouch!", body: "We can help." },
          { min: 25, max: 49, label: "25–49%", headline: "Good start", body: "Halfway there." },
          { min: 50, max: 74, label: "50–74%", headline: "You're close", body: "Keep going." },
          { min: 75, max: 100, label: "75–100%", headline: "You rock", body: "Ready." },
        ],
        marketingCta: createMarketingCtaPreset("FULL_MARKETING"),
      },
    });
    if (!prepared.ok) throw new Error("fixture should prepare");

    const config = loadPublicMarketingResultConfig(prepared.reportConfig);

    expect(config?.scoreBands.map((band) => [band.min, band.max])).toEqual([
      [0, 24], [25, 49], [50, 74], [75, 100],
    ]);
    expect(config?.marketingCta.presetOrigin).toBe("FULL_MARKETING");
  });

  it("fails closed when the stored CTA is malformed", () => {
    expect(loadPublicMarketingResultConfig({ publicMarketing: { marketingCta: { bad: true }, scoreBands: [] } })).toBeNull();
  });

  it("keeps valid score bands when the structured CTA is malformed and the report successor is active", () => {
    expect(loadPublicMarketingResultConfig({
      publicMarketing: {
        marketingCta: { bad: true },
        scoreBands: [
          { min: 0, max: 100, label: "All scores", headline: "Your score", body: "Read the guide." },
        ],
      },
    }, true)).toEqual({
      scoreBands: [
        { min: 0, max: 100, label: "All scores", headline: "Your score", body: "Read the guide." },
      ],
      marketingCta: null,
    });
  });

  it("keeps legacy fail-closed behavior when the report successor is inactive", () => {
    expect(loadPublicMarketingResultConfig({
      publicMarketing: {
        marketingCta: { bad: true },
        scoreBands: [
          { min: 0, max: 100, label: "All scores", headline: "Your score", body: "Read the guide." },
        ],
      },
    })).toBeNull();
  });
});
