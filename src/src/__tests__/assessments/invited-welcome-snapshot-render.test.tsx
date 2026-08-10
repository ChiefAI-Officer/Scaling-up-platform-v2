import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { InvitedWelcomeCard } from "@/components/assessments/InvitedWelcomeCard";
import type { InvitedWelcomeConfigV1 } from "@/lib/assessments/invited-welcome-config";

const config: InvitedWelcomeConfigV1 = {
  schemaVersion: 1,
  eyebrow: "Join us",
  headingTemplate: "Take {{campaignName}} today",
  ledeParagraphs: ["First authored paragraph.", "<strong>text</strong> stays text."],
  sharingHeading: "Who can read this",
  scoresHeading: "Your useful scores",
  scoresDescription: "Compare every category.",
  ctaLabel: "Begin now",
  finePrint: "Return later if you need to.",
};

const questions = Array.from({ length: 8 }, () => ({
  type: "SLIDER_LIKERT",
  scale: { min: 0, max: 10 },
}));
const sections = [{ stableKey: "s1" }, { stableKey: "s2" }, { stableKey: "s3" }, { stableKey: "s4" }];

describe("InvitedWelcomeCard", () => {
  it("renders authored copy with system-derived facts, disclosure, arrow, and fine print", () => {
    const onStart = jest.fn();
    const { container } = render(
      <InvitedWelcomeCard
        config={config}
        campaignName="Q3 Planning"
        questions={questions}
        sections={sections}
        onStart={onStart}
      />,
    );

    expect(screen.getByText("Join us")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Take Q3 Planning today" })).toBeInTheDocument();
    expect(screen.getByText("First authored paragraph.")).toBeInTheDocument();
    expect(screen.getByText("<strong>text</strong> stays text.")).toBeInTheDocument();
    expect(container.querySelector("strong")).not.toBeInTheDocument();

    const expectations = screen.getByTestId("welcome-expectations");
    expect(within(expectations).getByText("About 5 minutes")).toBeInTheDocument();
    expect(within(expectations).getByText("8 short statements, rated 0–10.")).toBeInTheDocument();
    expect(within(expectations).getByText("Who can read this")).toBeInTheDocument();
    expect(
      within(expectations).getByText(
        "Your coach or facilitator and authorized Scaling Up staff can review your named individual answers.",
      ),
    ).toBeInTheDocument();
    expect(within(expectations).getByText("Your useful scores")).toBeInTheDocument();
    expect(within(expectations).getByText("Compare every category.")).toBeInTheDocument();

    const stats = screen.getByTestId("welcome-stats");
    expect(within(stats).getByText("8")).toBeInTheDocument();
    expect(within(stats).getByText("4")).toBeInTheDocument();
    expect(within(stats).getByText("0–10")).toBeInTheDocument();
    expect(screen.getByText("Return later if you need to.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Begin now →" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
