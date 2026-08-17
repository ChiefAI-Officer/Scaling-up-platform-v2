import { render, screen } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => true);

jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));
jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn().mockResolvedValue({
    user: { role: "ADMIN" },
  }),
}));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/components/nav/assessments-sidebar", () => ({
  AssessmentsSidebar: ({ responsiveEnabled }: { responsiveEnabled?: boolean }) => (
    <aside data-testid="assessment-sidebar" data-responsive={String(responsiveEnabled)} />
  ),
}));

import AdminAssessmentsLayout from "@/app/(dashboard)/admin/assessments/layout";

describe("AdminAssessmentsLayout responsive host", () => {
  it("enables the compact navigation and 640px workspace split only behind the gate", async () => {
    const { container } = render(
      await AdminAssessmentsLayout({ children: <main>Assessment route</main> }),
    );

    expect(screen.getByTestId("assessment-sidebar")).toHaveAttribute(
      "data-responsive",
      "true",
    );
    expect(container.firstElementChild).toHaveClass("sm:flex-row");
    expect(screen.getByRole("main").parentElement).toHaveClass("min-w-0");
  });

  it("preserves the exact legacy layout classes and disabled sidebar prop", async () => {
    mockResponsiveFlag.mockReturnValue(false);
    const { container } = render(
      await AdminAssessmentsLayout({ children: <main>Assessment route</main> }),
    );

    expect(screen.getByTestId("assessment-sidebar")).toHaveAttribute(
      "data-responsive",
      "false",
    );
    expect(container.firstElementChild).toHaveAttribute(
      "class",
      "flex flex-col md:flex-row md:items-stretch md:min-h-[calc(100vh-4rem)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6",
    );
    expect(screen.getByRole("main").parentElement).toHaveAttribute(
      "class",
      "wf-scope flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6",
    );
  });
});
