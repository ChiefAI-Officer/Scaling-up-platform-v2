/**
 * BUG-MAY12-X (Jeff May 12): admin "+ New Workshop" page format dropdown must
 * default to VIRTUAL, matching the coach portal wizard default fixed in
 * Wave 12-A. Wave 12-A only updated WizardContext; this page has its own
 * useState({ format: "..." }) that was missed.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { NewWorkshopForm } from "@/app/(dashboard)/workshops/new/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock) = jest.fn().mockImplementation((url: string) => {
    if (url.includes("/api/categories"))
      return Promise.resolve({ ok: true, json: async () => [] });
    if (url.includes("/api/workshop-types"))
      return Promise.resolve({ ok: true, json: async () => [] });
    if (url.includes("/api/coaches"))
      return Promise.resolve({ ok: true, json: async () => [] });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

describe("NewWorkshopForm format default (BUG-MAY12-X)", () => {
  it("initializes the format select to VIRTUAL on the admin path", async () => {
    render(<NewWorkshopForm isCoachPortal={false} />);

    await waitFor(() => {
      const select = document.getElementById("format") as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      expect(select!.value).toBe("VIRTUAL");
    });
  });

  it("initializes the format select to VIRTUAL on the coach portal path", async () => {
    render(
      <NewWorkshopForm
        isCoachPortal
        prefilledCoach={{
          id: "coach-1",
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
          title: "Coach",
          linkedinUrl: null,
          bio: "Bio",
          profileImage: null,
          certifications: [],
        }}
      />
    );

    await waitFor(() => {
      const select = document.getElementById("format") as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      expect(select!.value).toBe("VIRTUAL");
    });
    // Sanity: the select is still rendered with both options available.
    expect(screen.getByRole("option", { name: /^Virtual$/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^In-Person$/i })).toBeInTheDocument();
  });
});
