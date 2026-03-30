/**
 * Bug 1: Description field editable tests (RED phase)
 *
 * Tests that the description field is NOT read-only for coaches
 * and that manual edits are preserved when category changes.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => "/",
}));

import { NewWorkshopForm } from "@/app/(dashboard)/workshops/new/page";

const prefilledCoach = {
  id: "coach-1",
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  certifications: [{ workshopTypeId: "wt-1", status: "ACTIVE" }],
};

const categories = [
  {
    id: "cat-1",
    name: "Exit & Valuation",
    slug: "exit-valuation",
    defaultTitle: "Scaling Up Exit & Valuation",
    defaultDescription: "Auto-filled description from category",
    pricingTiers: [{ id: "pt-1", name: "Standard", amountCents: 49500, description: null }],
  },
  {
    id: "cat-2",
    name: "Growth",
    slug: "growth",
    defaultTitle: "Scaling Up Growth",
    defaultDescription: "Growth workshop description",
    pricingTiers: [{ id: "pt-2", name: "Standard", amountCents: 39500, description: null }],
  },
];

function mockFetchResponses() {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes("/api/workshop-types")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
    }
    if (url.includes("/api/categories")) {
      return Promise.resolve({
        ok: true,
        json: async () => categories,
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    });
  });
}

describe("Workshop description field editability (coach portal)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchResponses();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("description field is not read-only for coaches when it has content", async () => {
    render(
      <NewWorkshopForm isCoachPortal={true} prefilledCoach={prefilledCoach} />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(screen.getByLabelText(/internal description/i)).toBeInTheDocument();
    });

    // Select a category to trigger description auto-populate via handleChange
    const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
    await waitFor(() => {
      expect(categorySelect.options.length).toBeGreaterThan(1);
    });
    fireEvent.change(categorySelect, {
      target: { value: "cat-1", name: "categoryId" },
    });

    const descriptionField = screen.getByLabelText(/internal description/i) as HTMLTextAreaElement;

    // Wait for category auto-populate to fill description
    await waitFor(() => {
      expect(descriptionField.value).toBe("Auto-filled description from category");
    });

    // The field should NOT be read-only even though it has content
    expect(descriptionField).not.toHaveAttribute("readonly");
  });

  it("category change does not overwrite manually entered description", async () => {
    render(
      <NewWorkshopForm isCoachPortal={true} prefilledCoach={prefilledCoach} />
    );

    // Wait for categories to load
    await waitFor(() => {
      expect(screen.getByLabelText(/internal description/i)).toBeInTheDocument();
    });

    // Select first category to trigger auto-populate
    const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
    await waitFor(() => {
      expect(categorySelect.options.length).toBeGreaterThan(1);
    });
    fireEvent.change(categorySelect, {
      target: { value: "cat-1", name: "categoryId" },
    });

    const descriptionField = screen.getByLabelText(/internal description/i) as HTMLTextAreaElement;

    // Wait for initial auto-populate
    await waitFor(() => {
      expect(descriptionField.value).toBe("Auto-filled description from category");
    });

    // Coach manually types their own description
    fireEvent.change(descriptionField, {
      target: { value: "My custom description", name: "description" },
    });
    expect(descriptionField.value).toBe("My custom description");

    // Change category to "Growth"
    fireEvent.change(categorySelect, {
      target: { value: "cat-2", name: "categoryId" },
    });

    // Description should still be the manual entry, NOT overwritten by "Growth workshop description"
    await waitFor(() => {
      expect(descriptionField.value).toBe("My custom description");
    });
  });
});
