import { createMarketingCtaPreset } from "@/lib/assessments/marketing-cta";
import { SCALING_UP_QUICK_PUBLIC_CAMPAIGN } from "@/lib/assessments/public-assessment-destinations";
import { reportConfigFor } from "@/lib/assessments/report-config";

const VERIFIED_SCALING_UP_QUICK_PUBLIC_URL =
  "https://scaling-up-platform-v2.vercel.app/quiz/scaling_up_quick_pub_260610041810";

describe("public assessment destinations", () => {
  it("pins the read-only verified ACTIVE PUBLIC 32-question campaign", () => {
    expect(SCALING_UP_QUICK_PUBLIC_CAMPAIGN).toEqual({
      templateAlias: "scaling-up-quick",
      campaignAlias: "scaling_up_quick_pub_260610041810",
      href: VERIFIED_SCALING_UP_QUICK_PUBLIC_URL,
    });
  });

  it("keeps every shipped assessment CTA off the external ESPERTO host", () => {
    const sourceActions =
      reportConfigFor("sunhub-quick-quiz").publicResultActions ?? [];
    const fullMarketing = createMarketingCtaPreset("FULL_MARKETING");
    const destinations = [
      ...sourceActions.map((action) => action.href),
      ...fullMarketing.blocks.flatMap((block) =>
        block.type === "button" && block.target.kind === "url"
          ? [block.target.href]
          : [],
      ),
    ];

    expect(destinations).toContain(VERIFIED_SCALING_UP_QUICK_PUBLIC_URL);
    expect(destinations.map((href) => new URL(href).hostname)).not.toContain(
      "scalinguptoolkit.com",
    );
  });
});
