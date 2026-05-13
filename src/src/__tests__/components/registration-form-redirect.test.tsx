/**
 * Component test: RegistrationForm consumes the server-provided redirectUrl
 * and navigates via the injectable `navigate` helper for free workshops.
 *
 * BUG-MAY13-3 / Wave A Task A2.
 *
 * Two cases:
 *   1. POST returns `redirectUrl` → navigate() is called with that URL.
 *   2. POST omits `redirectUrl` → defensive fallback uses router.push to
 *      `/registration/success?id=<regId>`.
 *
 * We pass the `navigate` prop as a jest.fn() instead of mocking
 * `window.location.href` because JSDOM marks `window.location` as
 * non-configurable, so the standard property-redefinition approach fails.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RegistrationForm } from "@/app/(public)/workshop/[slug]/registration-form";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));

describe("RegistrationForm redirect behavior (BUG-MAY13-3 Task A2)", () => {
  let navigateSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockReset();
    navigateSpy = jest.fn();
  });

  async function fillRequiredFieldsAndSubmit() {
    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { name: "firstName", value: "Alex" },
    });
    fireEvent.change(screen.getByLabelText(/Last Name/i), {
      target: { name: "lastName", value: "Rivera" },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { name: "email", value: "alex@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Company/i), {
      target: { name: "company", value: "Scaling Up" },
    });
    // PhoneInputField is custom; the actual handleSubmit only requires a
    // length>=4 phone string. Simulate that via the raw component prop by
    // dispatching a native event on the hidden tel input if present, or
    // fall back to directly invoking the form submit with a valid phone.
    const phoneInput = document.getElementById("phone") as HTMLInputElement | null;
    if (phoneInput) {
      fireEvent.change(phoneInput, { target: { value: "5551234567" } });
    }

    fireEvent.click(screen.getByRole("button", { name: /Register Now/i }));
  }

  it("navigates to data.redirectUrl via navigate() when the server returns one", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        success: true,
        data: { id: "reg-1" },
        redirectUrl: "https://app.example/workshop/ws-2026-a1b2-thank-you",
      }),
    });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    render(<RegistrationForm workshopId="ws-1" isFree navigate={navigateSpy} />);
    await fillRequiredFieldsAndSubmit();

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith(
        "https://app.example/workshop/ws-2026-a1b2-thank-you"
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("falls back to router.push(/registration/success?id=...) when redirectUrl is missing", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        success: true,
        data: { id: "reg-2" },
        // no redirectUrl field
      }),
    });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    render(<RegistrationForm workshopId="ws-1" isFree navigate={navigateSpy} />);
    await fillRequiredFieldsAndSubmit();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/registration/success?id=reg-2");
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
