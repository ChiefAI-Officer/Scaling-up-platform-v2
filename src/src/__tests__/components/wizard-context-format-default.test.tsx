/**
 * BUG-MAY6-7: workshop request wizard format dropdown defaults to VIRTUAL
 * (Jeff May 7 standing meeting — coaches/admins more often run virtual now).
 */

import { renderHook } from "@testing-library/react";
import { WizardProvider, useWizard } from "@/components/workshops/wizard/WizardContext";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/portal/request",
}));

// WizardProvider auto-loads drafts via fetch on mount; mock to a clean slate.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ draft: null }),
  }) as jest.Mock;
});

describe("WizardContext format default (BUG-MAY6-7)", () => {
  it("initializes formData.format to VIRTUAL", () => {
    const { result } = renderHook(() => useWizard(), {
      wrapper: ({ children }) => <WizardProvider>{children}</WizardProvider>,
    });
    expect(result.current.formData.format).toBe("VIRTUAL");
  });
});
