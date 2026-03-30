/**
 * Fix 1: Coach Profile Form Tests (RED phase)
 *
 * Tests that router.refresh() is called after successful profile save
 * so the server-rendered completeness checklist updates.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Override the global useRouter mock with a shared instance
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: mockRefresh,
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => "/",
}));

import { CoachProfileForm } from "@/components/coach/coach-profile-form";

const defaultProps = {
  coachId: "coach-1",
  initialData: {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    bio: "Experienced coach with 10+ years",
    title: "Scaling Up Coach",
    titleCredentials: "Smith LLC",
    profileImage: null,
    linkedinUrl: "https://linkedin.com/in/jane",
    showBookCallCta: true,
  },
};

describe("CoachProfileForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls router.refresh() after successful profile save", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    });

    render(<CoachProfileForm {...defaultProps} />);

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("does NOT call router.refresh() on save failure", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: "Validation failed" }),
    });

    render(<CoachProfileForm {...defaultProps} />);

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
