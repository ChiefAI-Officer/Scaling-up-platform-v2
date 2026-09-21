jest.mock("next/navigation", () => ({ notFound: jest.fn() }));

import { render, screen } from "@testing-library/react";
import MemberSignInPage from "@/app/(member)/member/sign-in/page";

describe("member sign-in page", () => {
  beforeEach(() => { process.env.WAVE_MP_MEMBER_PORTAL_ENABLED = "1"; });
  afterEach(() => { delete process.env.WAVE_MP_MEMBER_PORTAL_ENABLED; });

  it("uses the roster-based audience language and persistent staff escape hatch", async () => {
    render(await MemberSignInPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("For people who've been set up by a Scaling Up coach.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Coach or staff/ })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/completed a Scaling Up assessment/i)).toBeNull();
  });

  it("a GET with a credential only renders a plain POST form and never redeems it", async () => {
    const { container } = render(
      await MemberSignInPage({ searchParams: Promise.resolve({ t: "raw-secret" }) }),
    );
    expect(screen.getByRole("button", { name: "View my reports" })).toBeInTheDocument();
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/member/sign-in/exchange");
    expect(container.querySelector('input[name="token"]')).toHaveValue("raw-secret");
    expect(container.querySelector("script")).toBeNull();
  });

  it("uses one invalid state and repeats the escape hatch after a generic send", async () => {
    const sent = render(await MemberSignInPage({ searchParams: Promise.resolve({ state: "sent" }) }));
    expect(screen.getByText("Check your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Coaches and staff/ })).toHaveAttribute("href", "/login");
    sent.unmount();
    render(await MemberSignInPage({ searchParams: Promise.resolve({ state: "invalid" }) }));
    expect(screen.getByText("This link is no longer valid")).toBeInTheDocument();
  });
});
