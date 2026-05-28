/**
 * TDD Red Phase — EditMemberModal tests.
 *
 * Slice 2 Task 2 — Edit Member modal.
 *
 * Test matrix:
 *  (1) Pre-fill: opening with a member populates First/Last/Email/Job title/Team
 *  (2) Email field is rendered read-only / disabled
 *  (3) Valid submit PATCHes /api/organizations/{orgId}/respondents/{memberId}
 *      with the right body — NO email in body
 *  (4) "— no team —" selection omits teamId from the body
 *  (5) Failed PATCH {success:false, error:[{message}]} surfaces specific message + modal stays open
 *  (6) onUpdated is awaited BEFORE onClose
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditMemberModal } from "@/components/organizations/edit-member-modal";
import type { ApiTeamNode } from "@/components/organizations/members-teams-view";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_ENG: ApiTeamNode = {
  id: "team-eng",
  organizationId: "org-1",
  parentTeamId: null,
  name: "Engineering",
  type: "department",
  description: null,
  children: [],
};

const TEAM_MKT: ApiTeamNode = {
  id: "team-mkt",
  organizationId: "org-1",
  parentTeamId: null,
  name: "Marketing",
  type: "department",
  description: null,
  children: [],
};

const FLAT_TEAMS: ApiTeamNode[] = [TEAM_ENG, TEAM_MKT];

const MEMBER = {
  id: "respondent-1",
  orgId: "org-1",
  firstName: "Jane",
  lastName: "Smith",
  email: "jane.smith@example.com",
  jobTitle: "Director",
  teamId: "team-eng",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(
  overrides: Partial<React.ComponentProps<typeof EditMemberModal>> = {}
) {
  const onClose = jest.fn();
  const onUpdated = jest.fn();
  const defaults: React.ComponentProps<typeof EditMemberModal> = {
    open: true,
    onClose,
    onUpdated,
    member: { ...MEMBER },
    teams: FLAT_TEAMS,
  };
  const props = { ...defaults, ...overrides };
  render(<EditMemberModal {...props} />);
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

describe("EditMemberModal", () => {
  /**
   * (1) Pre-fill: opening with a member populates all displayed fields.
   */
  test("(1) pre-fills First/Last/Email/Job title/Team from member prop", () => {
    renderModal();

    const firstInput = screen.getByLabelText(/first name/i) as HTMLInputElement;
    expect(firstInput.value).toBe("Jane");

    const lastInput = screen.getByLabelText(/last name/i) as HTMLInputElement;
    expect(lastInput.value).toBe("Smith");

    const emailInput = screen.getByLabelText(/e-mail/i) as HTMLInputElement;
    expect(emailInput.value).toBe("jane.smith@example.com");

    const jobInput = screen.getByLabelText(/job title/i) as HTMLInputElement;
    expect(jobInput.value).toBe("Director");

    const teamSelect = screen.getByTestId("select-team") as HTMLSelectElement;
    expect(teamSelect.value).toBe("team-eng");
  });

  /**
   * (2) Email field is rendered read-only / disabled.
   *     Defense-in-depth: check both disabled AND readOnly so neither
   *     protection is accidentally removed in isolation.
   */
  test("(2) email field is disabled and read-only", () => {
    renderModal();
    const emailInput = screen.getByLabelText(/e-mail/i) as HTMLInputElement;
    expect(emailInput.disabled).toBe(true);
    // m1: also assert readOnly so the defense-in-depth intent is locked in
    expect(emailInput).toHaveAttribute("readonly");
  });

  /**
   * (3) Valid submit PATCHes the correct URL with the right body shape.
   *     Email must NOT be in the body.
   */
  test("(3) valid submit PATCHes the correct endpoint with body — no email", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: "respondent-1" },
      }),
    });

    const { onUpdated, onClose } = renderModal();

    // Change first name
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Janet" },
    });
    // Change last name
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Smithson" },
    });
    // Change job title
    fireEvent.change(screen.getByLabelText(/job title/i), {
      target: { value: "VP" },
    });
    // Change team
    fireEvent.change(screen.getByTestId("select-team"), {
      target: { value: "team-mkt" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/respondents/respondent-1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(call[1].body as string);

    // email must NOT be in body
    expect(sentBody).not.toHaveProperty("email");
    expect(sentBody).toEqual({
      firstName: "Janet",
      lastName: "Smithson",
      jobTitle: "VP",
      teamId: "team-mkt",
    });

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * (4) "— no team —" selection omits teamId from the body.
   */
  test("(4) selecting '— no team —' omits teamId from the request body", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: "respondent-1" } }),
    });

    renderModal();

    // Clear team selection
    fireEvent.change(screen.getByTestId("select-team"), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(call[1].body as string);
    expect(sentBody).not.toHaveProperty("teamId");
  });

  /**
   * (5) Failed PATCH with Zod array error surfaces specific message + modal stays open.
   */
  test("(5) failed PATCH surfaces specific Zod message and keeps modal open", async () => {
    const zodMessage = "First name is required";
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: [{ message: zodMessage, path: ["firstName"], code: "too_small" }],
      }),
    });

    const { onUpdated, onClose } = renderModal({
      member: { ...MEMBER, teamId: "team-eng" },
    });

    // Clear first name to trigger server error
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "A" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(zodMessage);
    });

    expect(onUpdated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * (6) onUpdated is awaited BEFORE onClose.
   */
  test("(6) onUpdated is awaited before onClose is called", async () => {
    const callOrder: string[] = [];

    // onUpdated is async and resolves after a microtask
    const onUpdated = jest.fn(async () => {
      callOrder.push("onUpdated");
    });
    const onClose = jest.fn(() => {
      callOrder.push("onClose");
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: "respondent-1" } }),
    });

    render(
      <EditMemberModal
        open={true}
        onClose={onClose}
        onUpdated={onUpdated}
        member={{ ...MEMBER }}
        teams={FLAT_TEAMS}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    expect(callOrder).toEqual(["onUpdated", "onClose"]);
  });
});
