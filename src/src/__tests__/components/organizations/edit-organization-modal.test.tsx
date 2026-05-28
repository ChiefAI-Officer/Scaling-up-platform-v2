/**
 * TDD Red Phase — EditOrganizationModal tests.
 *
 * Slice 2 Task 2 — Edit Organization modal.
 *
 * Test matrix:
 *  (1) Pre-fill: opening populates Name + External ID
 *  (2) Valid submit PATCHes /api/organizations/{orgId} with { name, externalId }
 *  (3) Empty Name blocks submit (no fetch, inline error)
 *  (4) Failed PATCH shows specific message and keeps modal open
 *  (5) onUpdated is awaited BEFORE onClose
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditOrganizationModal } from "@/components/organizations/edit-organization-modal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = {
  id: "org-1",
  name: "Acme Corp",
  externalId: "acme-ext-001",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(
  overrides: Partial<React.ComponentProps<typeof EditOrganizationModal>> = {}
) {
  const onClose = jest.fn();
  const onUpdated = jest.fn();
  const defaults: React.ComponentProps<typeof EditOrganizationModal> = {
    open: true,
    onClose,
    onUpdated,
    organization: { ...ORG },
  };
  const props = { ...defaults, ...overrides };
  render(<EditOrganizationModal {...props} />);
  return { onClose: props.onClose, onUpdated: props.onUpdated };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EditOrganizationModal", () => {
  /**
   * (1) Pre-fill: opening populates Name + External ID fields.
   */
  test("(1) pre-fills Name and External ID from organization prop", () => {
    renderModal();

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Acme Corp");

    const extIdInput = screen.getByLabelText(/external id/i) as HTMLInputElement;
    expect(extIdInput.value).toBe("acme-ext-001");
  });

  /**
   * (2) Valid submit PATCHes /api/organizations/{orgId} with { name, externalId }.
   *     Empty externalId sends null per API contract.
   */
  test("(2) valid submit PATCHes with name and externalId", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: "org-1", name: "Acme Corp Updated", externalId: "new-ext" },
      }),
    });

    const { onUpdated, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Acme Corp Updated" },
    });
    fireEvent.change(screen.getByLabelText(/external id/i), {
      target: { value: "new-ext" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(call[1].body as string);
    expect(sentBody).toEqual({
      name: "Acme Corp Updated",
      externalId: "new-ext",
    });

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * (2b) Clearing External ID sends null (or omits field per API null handling).
   */
  test("(2b) clearing externalId sends null in the body", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: "org-1", name: "Acme Corp", externalId: null },
      }),
    });

    renderModal();

    // Clear the external ID
    fireEvent.change(screen.getByLabelText(/external id/i), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(call[1].body as string);
    // API accepts null to clear the externalId
    expect(sentBody.externalId).toBeNull();
  });

  /**
   * (3) Empty Name blocks submit — no fetch, inline "Name is required." error.
   */
  test("(3) empty Name blocks submit with inline error, no fetch", async () => {
    const { onUpdated, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/name is required/i);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * (4) Failed PATCH shows the specific message and keeps the modal open.
   */
  test("(4) failed PATCH shows specific error message and keeps modal open", async () => {
    const errMsg = "An organization with that externalId already exists";
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        error: errMsg,
      }),
    });

    const { onUpdated, onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(errMsg);
    });

    expect(onUpdated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * (5) onUpdated is awaited BEFORE onClose is called.
   */
  test("(5) onUpdated is awaited before onClose is called", async () => {
    const callOrder: string[] = [];

    const onUpdated = jest.fn(async () => {
      callOrder.push("onUpdated");
    });
    const onClose = jest.fn(() => {
      callOrder.push("onClose");
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: "org-1", name: "Acme Corp", externalId: null },
      }),
    });

    render(
      <EditOrganizationModal
        open={true}
        onClose={onClose}
        onUpdated={onUpdated}
        organization={{ ...ORG }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    expect(callOrder).toEqual(["onUpdated", "onClose"]);
  });
});
