import { render, screen } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => true);

jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));
jest.mock("next/font/google", () => ({
  Plus_Jakarta_Sans: () => ({ variable: "font-sans" }),
  Geist_Mono: () => ({ variable: "font-mono" }),
}));
jest.mock("@/components/providers/session-provider", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/providers/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/ui/toaster", () => ({
  Toaster: ({ responsiveEnabled }: { responsiveEnabled?: boolean }) => (
    <div data-testid="toaster" data-responsive={String(responsiveEnabled)} />
  ),
}));
jest.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));
jest.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => null }));

import RootLayout from "@/app/layout";

it("threads the root responsive flag into the global toaster", () => {
  const enabledLayout = RootLayout({ children: <div>Page</div> });
  const enabledBody = enabledLayout.props.children;
  const enabled = render(enabledBody.props.children);
  expect(screen.getByTestId("toaster")).toHaveAttribute("data-responsive", "true");
  enabled.unmount();

  mockResponsiveFlag.mockReturnValue(false);
  const disabledLayout = RootLayout({ children: <div>Page</div> });
  const disabledBody = disabledLayout.props.children;
  render(disabledBody.props.children);
  expect(screen.getByTestId("toaster")).toHaveAttribute("data-responsive", "false");
});
