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
    firstName: "Lynne",
    lastName: "Verdun",
    email: "lynne@example.com",
    title: "Master Coach",
    company: "A Step Above",
    linkedinUrl: "",
    bio: "Everything all in one package",
    showBookCallCta: false,
    bookCallUrl: "",
    profileImage: null,
    hubspotId: "hubspot-1",
    circleId: "circle-1",
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

  it("uses distinct Professional Title and Company Name fields when saving its own profile", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    });

    render(<CoachProfileForm {...defaultProps} />);

    expect(screen.getByLabelText("Professional Title")).toHaveValue("Master Coach");
    expect(screen.getByLabelText("Company Name")).toHaveValue("A Step Above");
    expect(screen.queryByText("Title / Credentials")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Professional Title"), {
      target: { value: "Certified Scaling Up Coach" },
    });
    fireEvent.change(screen.getByLabelText("Company Name"), {
      target: { value: "Growth Partners" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/portal/profile",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"title":"Certified Scaling Up Coach"'),
      }),
    ));
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        title: "Certified Scaling Up Coach",
        company: "Growth Partners",
      }),
    );
  });

  it("saves an admin edit through the selected coach endpoint in one request", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    });

    render(
      <CoachProfileForm
        {...defaultProps}
        saveTarget="admin"
        allowEditIntegrationIds
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/coaches/coach-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        title: "Master Coach",
        company: "A Step Above",
        hubspotId: "hubspot-1",
        circleId: "circle-1",
      }),
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/portal/profile",
      expect.anything(),
    );
  });

  it("renders the readable Zod issue message from a failed admin save", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: [{
          code: "invalid_format",
          format: "url",
          path: ["linkedinUrl"],
          message: "LinkedIn Profile URL must be a valid URL",
        }],
      }),
    });

    render(<CoachProfileForm {...defaultProps} saveTarget="admin" />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("LinkedIn Profile URL must be a valid URL"))
      .toBeInTheDocument();
  });

  it("keeps flag-off classes unchanged and opts into compact touch targets explicitly", () => {
    const { container, rerender } = render(<CoachProfileForm {...defaultProps} saveTarget="admin" />);

    expect(container.firstElementChild).toHaveClass("p-8");
    expect(screen.getByRole("button", { name: /save changes/i })).not.toHaveClass("min-h-11");

    rerender(
      <CoachProfileForm
        {...defaultProps}
        saveTarget="admin"
        responsiveEnabled
      />,
    );

    expect(container.firstElementChild).toHaveClass("min-w-0", "p-4", "sm:p-8");
    expect(screen.getByRole("button", { name: /save changes/i })).toHaveClass("min-h-11");
    expect(screen.getByLabelText("First Name")).toHaveClass("min-h-11");
  });
});
