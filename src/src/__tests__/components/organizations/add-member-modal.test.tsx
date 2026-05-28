/**
 * TDD Red Phase — AddMemberModal tests.
 *
 * Test matrix:
 *  (1) valid submit POSTs /api/organizations/{orgId}/respondents with exact body incl. selected teamId
 *  (2) "— no team —" omits/nulls teamId from the POST body
 *  (3) blank required field (firstName) blocks submit — no fetch, alert shown
 *  (4) invalid email is blocked client-side — no fetch, alert shown
 *  (5) 400 { success:false, error:[{message}] } surfaces that message and keeps modal open
 *  (6) success triggers the refresh callback (onCreated) + closes the modal
 *
 * Uses fireEvent + data-testid following the AddTeamModal pattern.
 * No @testing-library/user-event needed.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddMemberModal } from "@/components/organizations/add-member-modal";
import type { ApiTeamNode } from "@/components/organizations/members-teams-view";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = "org-abc";

const TEAM_ENG: ApiTeamNode = {
  id: "team-eng",
  organizationId: ORG_ID,
  parentTeamId: null,
  name: "Engineering",
  type: null,
  description: null,
  children: [],
};

const TEAM_DESIGN: ApiTeamNode = {
  id: "team-design",
  organizationId: ORG_ID,
  parentTeamId: null,
  name: "Design",
  type: null,
  description: null,
  children: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(
  overrides: Partial<React.ComponentProps<typeof AddMemberModal>> = {}
) {
  const onClose = jest.fn();
  const onCreated = jest.fn();
  const defaults: React.ComponentProps<typeof AddMemberModal> = {
    open: true,
    onClose,
    onCreated,
    orgId: ORG_ID,
    teams: [TEAM_ENG, TEAM_DESIGN],
    defaultTeamId: null,
  };
  const props = { ...defaults, ...overrides };
  render(<AddMemberModal {...props} />);
  return { onClose: props.onClose as jest.Mock, onCreated: props.onCreated as jest.Mock };
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

describe("AddMemberModal", () => {
  /**
   * (1) Valid submit POSTs to the correct endpoint with exact body including teamId
   */
  test("(1) valid submit POSTs /api/organizations/{orgId}/respondents with correct body incl. teamId", async () => {
    const mockRespondent = {
      id: "r-1",
      organizationId: ORG_ID,
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      jobTitle: "Engineer",
      teamId: "team-eng",
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: mockRespondent }),
    });

    renderModal();

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Smith" },
    });
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/job title/i), {
      target: { value: "Engineer" },
    });
    fireEvent.change(screen.getByTestId("select-team"), {
      target: { value: "team-eng" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/organizations/${ORG_ID}/respondents`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            firstName: "Alice",
            lastName: "Smith",
            email: "alice@example.com",
            jobTitle: "Engineer",
            teamId: "team-eng",
          }),
        })
      );
    });
  });

  /**
   * (2) "— no team —" option omits/nulls teamId from the POST body
   */
  test('(2) "— no team —" selection omits teamId from the POST body', async () => {
    const mockRespondent = {
      id: "r-2",
      organizationId: ORG_ID,
      firstName: "Bob",
      lastName: "Jones",
      email: "bob@example.com",
      teamId: null,
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: mockRespondent }),
    });

    renderModal();

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Bob" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Jones" },
    });
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "bob@example.com" },
    });

    // Explicitly pick "— no team —"
    fireEvent.change(screen.getByTestId("select-team"), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string);
    // teamId must be ABSENT from the body when no team selected
    expect("teamId" in body).toBe(false);
    // jobTitle must NOT appear when blank
    expect(body.jobTitle).toBeUndefined();
  });

  /**
   * (3) Blank required field (firstName) blocks submit — no fetch, alert shown
   */
  test("(3) blank firstName blocks submit — no fetch, alert shown", async () => {
    renderModal();

    // Leave firstName empty; fill the rest
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Smith" },
    });
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  /**
   * (4) Invalid email format blocked client-side — no fetch, alert shown
   */
  test("(4) invalid email format blocks submit — no fetch, alert shown", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Smith" },
    });
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "not-an-email" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  /**
   * (5) 400 { success:false, error:[{message}] } surfaces that message and keeps modal open
   */
  test("(5) 400 Zod array error surfaces specific message and keeps modal open", async () => {
    const zodMessage = "Valid email is required";
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: [{ message: zodMessage, path: ["email"], code: "invalid_string" }],
      }),
    });

    const { onClose, onCreated } = renderModal();

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Smith" },
    });
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(zodMessage);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  /**
   * (6) Successful create calls onCreated and closes the modal
   */
  test("(6) success triggers onCreated callback and closes the modal", async () => {
    const mockRespondent = {
      id: "r-3",
      organizationId: ORG_ID,
      firstName: "Carol",
      lastName: "White",
      email: "carol@example.com",
      teamId: null,
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: mockRespondent }),
    });

    const { onClose, onCreated } = renderModal();

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Carol" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "White" },
    });
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "carol@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ respondent: mockRespondent });
    });

    expect(onClose).toHaveBeenCalled();
  });

  /**
   * (7) defaultTeamId pre-selects the Team selector
   */
  test("(7) defaultTeamId pre-selects the team in the selector", () => {
    renderModal({ defaultTeamId: "team-eng" });

    const select = screen.getByTestId("select-team") as HTMLSelectElement;
    expect(select.value).toBe("team-eng");
  });

  /**
   * (8) When defaultTeamId is null (org node selected, not a team), the Team
   *     select defaults to "— no team —" AND submitting omits teamId from the body
   */
  test("(8) no defaultTeamId defaults to '— no team —' and submit omits teamId", async () => {
    const mockRespondent = {
      id: "r-8",
      organizationId: ORG_ID,
      firstName: "Dana",
      lastName: "Lee",
      email: "dana@example.com",
      teamId: null,
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: mockRespondent }),
    });

    // Render with no defaultTeamId (organisation node is selected, not a team)
    renderModal({ defaultTeamId: null });

    // Team select must default to empty value ("— no team —")
    const select = screen.getByTestId("select-team") as HTMLSelectElement;
    expect(select.value).toBe("");

    // Fill required fields and submit without changing the team select
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Dana" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Lee" },
    });
    fireEvent.change(screen.getByLabelText(/e-?mail/i), {
      target: { value: "dana@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string);
    // teamId must be ABSENT from the POST body
    expect("teamId" in body).toBe(false);
  });
});
