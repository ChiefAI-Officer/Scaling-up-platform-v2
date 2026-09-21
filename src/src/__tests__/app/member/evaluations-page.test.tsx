import React from "react";
import { render, screen } from "@testing-library/react";

const mockNotFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const mockEnabled = jest.fn(() => true);
const mockSession = jest.fn();
const mockList = jest.fn();

jest.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));
jest.mock("@/lib/members/flags", () => ({ isMemberPortalEnabled: () => mockEnabled() }));
jest.mock("@/lib/members/session", () => ({ requireMemberSession: () => mockSession() }));
jest.mock("@/lib/members/member-evaluations", () => ({
  listMemberEvaluations: (...args: unknown[]) => mockList(...args),
}));
jest.mock("@/lib/db", () => ({
  db: {
    orgRespondent: {
      findFirst: jest.fn().mockResolvedValue({ firstName: "Casey", lastName: "Member" }),
    },
  },
}));
jest.mock("@/components/members/MemberPortalHeader", () => ({
  MemberPortalHeader: ({ memberName }: { memberName: string }) => <div>{memberName}</div>,
}));

import Page from "@/app/(member)/member/evaluations/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockEnabled.mockReturnValue(true);
  mockSession.mockResolvedValue({ normalizedEmail: "casey@example.com" });
});

describe("member evaluations page", () => {
  it("renders open evaluations with a direct Continue handoff and closing date", async () => {
    mockList.mockResolvedValue([
      {
        invitationId: "inv-1",
        assessmentName: "Leadership Alignment",
        closeAt: new Date("2026-10-05T00:00:00.000Z"),
        href: "/member/evaluations/inv-1/open",
      },
    ]);

    render((await Page()) as React.ReactElement);

    expect(screen.getByRole("heading", { name: "Your evaluations" })).toBeInTheDocument();
    expect(screen.getByText("Leadership Alignment")).toBeInTheDocument();
    expect(screen.getByText(/Closes/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/member/evaluations/inv-1/open",
    );
  });

  it("renders the accepted empty state", async () => {
    mockList.mockResolvedValue([]);
    render((await Page()) as React.ReactElement);
    expect(screen.getByText("Nothing to complete right now")).toBeInTheDocument();
    expect(
      screen.getByText("When your coach invites you to an assessment, it'll appear here."),
    ).toBeInTheDocument();
  });

  it("404s while the member portal is disabled", async () => {
    mockEnabled.mockReturnValue(false);
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockList).not.toHaveBeenCalled();
  });
});
