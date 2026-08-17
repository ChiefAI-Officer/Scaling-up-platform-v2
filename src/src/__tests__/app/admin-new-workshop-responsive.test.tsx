import { cleanup, render, screen } from "@testing-library/react";

const mockUseMobileResponsiveEnabled = jest.fn(() => false);

jest.mock("@/lib/use-mobile-responsive-enabled", () => ({
  useMobileResponsiveEnabled: () => mockUseMobileResponsiveEnabled(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), refresh: jest.fn() }),
}));

import NewWorkshopPage, { NewWorkshopForm } from "@/app/(dashboard)/workshops/new/page";

function mockWorkshopData(): void {
  global.fetch = jest.fn(() => new Promise<Response>(() => undefined)) as jest.MockedFunction<typeof fetch>;
}

function getAdminActionRow(): HTMLElement {
  const submit = screen.getByRole("button", { name: "Continue to Workshop Editor" });
  if (!submit.parentElement) throw new Error("Expected workshop action row");
  return submit.parentElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMobileResponsiveEnabled.mockReturnValue(false);
  mockWorkshopData();
});

afterEach(() => {
  cleanup();
});

describe("Admin new-workshop responsive host", () => {
  it("forwards the client-safe mobile flag to the real form", () => {
    const disabled = render(<NewWorkshopPage />);
    expect(getAdminActionRow()).toHaveClass("flex", "gap-4");
    expect(getAdminActionRow()).not.toHaveClass("flex-col-reverse", "sm:flex-row");
    disabled.unmount();

    mockUseMobileResponsiveEnabled.mockReturnValue(true);
    render(<NewWorkshopPage />);
    expect(getAdminActionRow()).toHaveClass("flex", "gap-4", "flex-col-reverse", "sm:flex-row");
  });

  it("keeps the form action reflow conditional on responsiveEnabled", () => {
    const disabled = render(<NewWorkshopForm isCoachPortal={false} responsiveEnabled={false} />);
    expect(getAdminActionRow()).toHaveClass("flex", "gap-4");
    expect(getAdminActionRow()).not.toHaveClass("flex-col-reverse", "sm:flex-row");
    disabled.unmount();

    render(<NewWorkshopForm isCoachPortal={false} responsiveEnabled />);
    expect(getAdminActionRow()).toHaveClass("flex", "gap-4", "flex-col-reverse", "sm:flex-row");
  });
});
