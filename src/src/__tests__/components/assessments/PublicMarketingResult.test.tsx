import { render, screen } from "@testing-library/react";
import { PublicMarketingResult } from "@/components/assessments/PublicMarketingResult";
import { createMarketingCtaPreset } from "@/lib/assessments/marketing-cta";

describe("PublicMarketingResult", () => {
  it("marks one score band and renders real books plus all actions", () => {
    render(
      <PublicMarketingResult
        score={44}
        scoreBands={[
          { min: 0, max: 24, label: "0–24%", headline: "Ouch", body: "A" },
          { min: 25, max: 49, label: "25–49%", headline: "Good start", body: "B" },
          { min: 50, max: 74, label: "50–74%", headline: "Close", body: "C" },
          { min: 75, max: 100, label: "75–100%", headline: "Rock", body: "D" },
        ]}
        marketingCta={createMarketingCtaPreset("FULL_MARKETING")}
        referringCoachEmail={null}
      />,
    );
    expect(screen.getByText("44")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((item) => item.getAttribute("aria-current") === "true")).toHaveLength(1);
    expect(screen.getByRole("img", { name: /mastering the rockefeller/i })).toHaveAttribute("src", "/brand/scaling-up-books.png");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("resolves the Quick coach action to the verified coach or Jeff's Talk-to-a-Coach form", () => {
    const { rerender } = render(
      <PublicMarketingResult score={50} scoreBands={[]} marketingCta={createMarketingCtaPreset("SCALING_UP_QUICK")} referringCoachEmail="coach@example.com" />,
    );
    expect(screen.getByRole("link", { name: /talk to a coach/i })).toHaveAttribute("href", "mailto:coach@example.com");
    rerender(<PublicMarketingResult score={50} scoreBands={[]} marketingCta={createMarketingCtaPreset("SCALING_UP_QUICK")} referringCoachEmail={null} />);
    expect(screen.getByRole("link", { name: /talk to a coach/i })).toHaveAttribute("href", "https://coaches.scalingup.com/find-a-coach-contact-form");
  });

  it("renders score bands without legacy structured CTA blocks", () => {
    render(
      <PublicMarketingResult
        score={60}
        scoreBands={[
          { min: 0, max: 100, label: "Score guide", headline: "Keep going", body: "Use your report." },
        ]}
        marketingCta={null}
        referringCoachEmail={null}
      />,
    );

    expect(screen.getByRole("region", { name: "Score guide" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.querySelector(".public-marketing-cta-blocks")).toBeNull();
  });
});
