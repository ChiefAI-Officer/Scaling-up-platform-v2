/**
 * TDD Red Phase — AddTeamModal tests.
 *
 * Test matrix:
 *  (1) Parent=root + Type=Company → POSTs /api/organizations with {name}
 *  (2) Parent=a company + Type=Team → POSTs /api/organizations/{id}/teams with parentTeamId:null
 *  (3) Parent=a team → POSTs /api/organizations/{id}/teams with that parentTeamId
 *  (4) Guard: Type=Company with a non-root Parent is blocked (no fetch, error shown)
 *  (5) Guard: non-Company type with Parent=root is blocked
 *  (6) A failed create shows an inline error and keeps the modal open
 *
 * Note: uses fireEvent only (no @testing-library/user-event).
 * The Radix Select portal renders items into document.body; we query them
 * with screen.getByRole("option") after opening the trigger.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AddTeamModal } from "@/components/organizations/add-team-modal";
import type { OrgSummary, ApiTeamNode } from "@/components/organizations/members-teams-view";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ACME: OrgSummary = { id: "org-1", name: "Acme Corp", ownerCoachId: "coach-1" };
const ORG_BETA: OrgSummary = { id: "org-2", name: "Beta Inc", ownerCoachId: "coach-1" };

const TEAM_ENG: ApiTeamNode = {
  id: "team-eng",
  organizationId: "org-1",
  parentTeamId: null,
  name: "Engineering",
  type: null,
  description: null,
  children: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(overrides: Partial<React.ComponentProps<typeof AddTeamModal>> = {}) {
  const onClose = jest.fn();
  const onCreated = jest.fn();
  const defaults: React.ComponentProps<typeof AddTeamModal> = {
    open: true,
    onClose,
    onCreated,
    organizations: [ORG_ACME, ORG_BETA],
    loadedTeams: { "org-1": [TEAM_ENG], "org-2": [] },
  };
  const props = { ...defaults, ...overrides };
  render(<AddTeamModal {...props} />);
  return { onClose: props.onClose, onCreated: props.onCreated };
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

describe("AddTeamModal", () => {
  /**
   * (1) Parent=root + Type=Company → POST /api/organizations with {name}
   */
  test("(1) creates a Company (root org) when Parent=none and Type=Company", async () => {
    const mockOrg = { id: "new-org", name: "New Co", ownerCoachId: "coach-1" };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: mockOrg }),
    });

    const { onCreated, onClose } = renderModal();

    // Fill in Name
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "New Co" },
    });

    // Type: select "Company" — the select uses data-testid
    // We drive it via the hidden select element directly
    fireEvent.change(screen.getByTestId("select-type"), {
      target: { value: "company" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "New Co" }),
        })
      );
    });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ kind: "organization", org: mockOrg });
    });
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * (2) Parent=a company + Type=Team → POST /api/organizations/{id}/teams
   *     with parentTeamId:null
   */
  test("(2) creates a team under a company when Parent=company and Type=Team", async () => {
    const mockTeam = {
      id: "new-team",
      organizationId: "org-1",
      name: "Design",
      parentTeamId: null,
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: mockTeam }),
    });

    const { onCreated, onClose } = renderModal();

    // Fill in Name
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Design" },
    });

    // Parent: select "org:org-1" (Acme Corp)
    fireEvent.change(screen.getByTestId("select-parent"), {
      target: { value: "org:org-1" },
    });

    // Type: "team"
    fireEvent.change(screen.getByTestId("select-type"), {
      target: { value: "team" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/teams",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Design", type: "team", parentTeamId: null }),
        })
      );
    });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({
        kind: "team",
        team: mockTeam,
        orgId: "org-1",
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * (3) Parent=a team → POST /api/organizations/{id}/teams with that parentTeamId
   */
  test("(3) creates a sub-team when Parent=a team (populates parentTeamId)", async () => {
    const mockTeam = {
      id: "sub-team",
      organizationId: "org-1",
      name: "Platform",
      parentTeamId: "team-eng",
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: mockTeam }),
    });

    const { onCreated } = renderModal();

    // Name
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Platform" },
    });

    // Parent: select "team:team-eng" (Engineering under org-1)
    fireEvent.change(screen.getByTestId("select-parent"), {
      target: { value: "team:org-1:team-eng" },
    });

    // Type: "team"
    fireEvent.change(screen.getByTestId("select-type"), {
      target: { value: "team" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/teams",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Platform", type: "team", parentTeamId: "team-eng" }),
        })
      );
    });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({
        kind: "team",
        team: mockTeam,
        orgId: "org-1",
      });
    });
  });

  /**
   * (4) Guard: Type=Company with a non-root Parent is blocked
   *     — no fetch call, inline error shown
   */
  test("(4) blocks submit when Type=Company but Parent is not root", async () => {
    renderModal();

    // Name
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Sneaky Co" },
    });

    // Parent: select Acme Corp (a company — not root)
    fireEvent.change(screen.getByTestId("select-parent"), {
      target: { value: "org:org-1" },
    });

    // Type: Company (invalid combo)
    fireEvent.change(screen.getByTestId("select-type"), {
      target: { value: "company" },
    });

    // Attempt submit
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    // Error message visible, no fetch fired
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/company.*root/i);
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  /**
   * (5) Guard: non-Company type with Parent=root is blocked
   */
  test("(5) blocks submit when Type is not Company but Parent=root", async () => {
    renderModal();

    // Name
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Orphan Team" },
    });

    // Leave Parent as root (value "root" or empty — default)
    // Type: "team"
    fireEvent.change(screen.getByTestId("select-type"), {
      target: { value: "team" },
    });

    // Attempt submit
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    // Error visible, no fetch
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/root.*company/i);
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  /**
   * (6) A failed create (server error) shows an inline error and keeps modal open
   */
  test("(6) inline error on server failure, modal stays open", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: "Internal Server Error" }),
    });

    const { onClose, onCreated } = renderModal();

    // Name
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Fail Co" },
    });

    // Parent = root, Type = Company (valid combo)
    fireEvent.change(screen.getByTestId("select-type"), {
      target: { value: "company" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    // Error shown in modal
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Modal NOT closed
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
