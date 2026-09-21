/**
 * Wave D — Task 6b: INVITED-mode thank-you page adaptive copy.
 *
 * When sendResultsToRespondent=true (passed as ?results=1):
 *   → "We are sending you your results."
 * When absent or false:
 *   → "Your coach will follow up with the results."
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// The page is a server component that reads searchParams. We test it by
// calling the default export directly with the searchParams prop.
//
// next/navigation and next/headers are not used in the thank-you page, so
// no mocking needed.

import ThankYouPage from "@/app/(public)/org-survey/[campaignAlias]/thank-you/page";
import { MEMBER_FORBIDDEN_VISIBLE_WORDS } from "@/lib/members/copy";

describe("Invited ThankYouPage — adaptive copy (#15)", () => {
  afterEach(() => {
    delete process.env.WAVE_MP_MEMBER_PORTAL_ENABLED;
    delete process.env.WAVE_MP_MEMBER_PORTAL_KILL;
  });

  it("shows 'sending you your results' when results=1 searchParam is present", async () => {
    const page = await ThankYouPage({
      params: Promise.resolve({ campaignAlias: "test-alias" }),
      searchParams: Promise.resolve({ results: "1" }),
    });
    render(page as React.ReactElement);
    expect(
      screen.getByText(/sending you your results/i),
    ).toBeInTheDocument();
  });

  it("shows 'coach will follow up' copy when results param is absent", async () => {
    const page = await ThankYouPage({
      params: Promise.resolve({ campaignAlias: "test-alias" }),
      searchParams: Promise.resolve({}),
    });
    render(page as React.ReactElement);
    expect(
      screen.getByText(/coach will.*review your results/i),
    ).toBeInTheDocument();
  });

  it("shows 'coach will follow up' copy when results=0", async () => {
    const page = await ThankYouPage({
      params: Promise.resolve({ campaignAlias: "test-alias" }),
      searchParams: Promise.resolve({ results: "0" }),
    });
    render(page as React.ReactElement);
    expect(
      screen.getByText(/coach will.*review your results/i),
    ).toBeInTheDocument();
  });

  it("shows the member-portal discovery line for results=1 only while the portal is enabled", async () => {
    process.env.WAVE_MP_MEMBER_PORTAL_ENABLED = "1";
    let page = await ThankYouPage({
      params: Promise.resolve({ campaignAlias: "test-alias" }),
      searchParams: Promise.resolve({ results: "1" }),
    });
    const view = render(page as React.ReactElement);
    expect(screen.getByRole("link", { name: "Open the member portal" })).toHaveAttribute(
      "href",
      "/member/sign-in",
    );
    for (const term of MEMBER_FORBIDDEN_VISIBLE_WORDS) {
      expect(view.container.textContent?.toLowerCase()).not.toContain(term.toLowerCase());
    }

    view.unmount();
    delete process.env.WAVE_MP_MEMBER_PORTAL_ENABLED;
    page = await ThankYouPage({
      params: Promise.resolve({ campaignAlias: "test-alias" }),
      searchParams: Promise.resolve({ results: "1" }),
    });
    render(page as React.ReactElement);
    expect(screen.queryByRole("link", { name: "Open the member portal" })).not.toBeInTheDocument();
  });
});
