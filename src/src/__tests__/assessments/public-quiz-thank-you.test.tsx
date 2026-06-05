/**
 * Asserts that the public quiz thank-you page does NOT promise emailed
 * results (D3 policy — no auto-email in v1) and DOES show accurate copy.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import PublicQuizThankYouPage from "@/app/(public)/quiz/[campaignAlias]/thank-you/page";

describe("PublicQuizThankYouPage — copy accuracy (D3 no-email policy)", () => {
  it("does not contain the old inbox/spam email promise", () => {
    render(<PublicQuizThankYouPage />);
    expect(screen.queryByText(/send your results to the email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check your spam/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/inbox within a few minutes/i)).not.toBeInTheDocument();
  });

  it("shows the accurate facilitator follow-up copy", () => {
    render(<PublicQuizThankYouPage />);
    expect(screen.getByText(/facilitator will follow up with the results/i)).toBeInTheDocument();
    expect(screen.getAllByText(/your responses have been recorded/i).length).toBeGreaterThan(0);
  });
});
