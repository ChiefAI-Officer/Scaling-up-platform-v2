/**
 * TDD Red Phase — MembersTeamsView component tests.
 *
 * Tests:
 *  (a) renders companies as root nodes
 *  (b) expanding a company calls the teams endpoint and renders its teams
 *  (c) selecting a node calls the respondents endpoint and renders members
 *  (d) the "not associated with any team" bucket renders
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MembersTeamsView } from "@/components/organizations/members-teams-view";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_1 = { id: "org-1", name: "Acme Corp", ownerCoachId: "coach-1", externalId: null };
const ORG_2 = { id: "org-2", name: "Beta Inc", ownerCoachId: "coach-1", externalId: null };

const TEAM_ENG = {
  id: "team-eng",
  organizationId: "org-1",
  parentTeamId: null,
  name: "Engineering",
  type: null,
  description: null,
  children: [
    {
      id: "team-frontend",
      organizationId: "org-1",
      parentTeamId: "team-eng",
      name: "Frontend",
      type: null,
      description: null,
      children: [],
    },
  ],
};

const RESPONDENT_ALICE = {
  id: "resp-1",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@acme.com",
  roleType: "Leadership",
  teamId: "team-eng",
  organizationId: "org-1",
};

const RESPONDENT_BOB = {
  id: "resp-2",
  firstName: "Bob",
  lastName: "Jones",
  email: "bob@acme.com",
  roleType: null,
  teamId: null,
  organizationId: "org-1",
};

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetchForOrg1Teams() {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data: [TEAM_ENG] }),
  });
}

function mockFetchRespondents(respondents: typeof RESPONDENT_ALICE[]) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data: respondents }),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MembersTeamsView", () => {
  test("(a) renders companies as root nodes in the Teams panel", () => {
    render(
      <MembersTeamsView
        initialOrganizations={[ORG_1, ORG_2]}
      />
    );

    // Both orgs appear as root-level buttons/items in the left panel
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta Inc")).toBeInTheDocument();
  });

  test("(b) expanding a company calls the teams endpoint and renders its teams", async () => {
    mockFetchForOrg1Teams();

    render(
      <MembersTeamsView
        initialOrganizations={[ORG_1]}
      />
    );

    // Click the expand control for Acme Corp
    const expandBtn = screen.getByRole("button", { name: /^Acme Corp$/i });
    fireEvent.click(expandBtn);

    // Should have called GET /api/organizations/org-1/teams
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/teams"
      );
    });

    // Team name appears
    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });

    // Nested child team appears
    expect(screen.getByText("Frontend")).toBeInTheDocument();
  });

  test("(c) selecting a team node calls the respondents endpoint and renders members", async () => {
    // First expand the org to load teams
    mockFetchForOrg1Teams();

    render(
      <MembersTeamsView
        initialOrganizations={[ORG_1]}
      />
    );

    // Expand the org
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });

    // Now mock the respondents fetch
    mockFetchRespondents([RESPONDENT_ALICE]);

    // Click the Engineering team node (exact match to disambiguate from the
    // "Edit Engineering" affordance also rendered on team rows)
    const teamBtn = screen.getByRole("button", { name: "Engineering" });
    fireEvent.click(teamBtn);

    // Should have called GET /api/organizations/org-1/respondents?teamId=team-eng
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/respondents?teamId=team-eng"
      );
    });

    // Members table shows Alice
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });
    expect(screen.getByText("alice@acme.com")).toBeInTheDocument();
    expect(screen.getByText("Leadership")).toBeInTheDocument();
  });

  test("(d) 'not associated with any team' bucket renders after org expansion", async () => {
    mockFetchForOrg1Teams();

    render(
      <MembersTeamsView
        initialOrganizations={[ORG_1]}
      />
    );

    // Expand the org
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });

    // "Not associated with any team" pseudo-node should also be visible
    expect(
      screen.getByText(/not associated with any team/i)
    ).toBeInTheDocument();
  });

  test("(d-respondents) selecting 'not associated' fetches respondents with no teamId filter", async () => {
    mockFetchForOrg1Teams();

    render(
      <MembersTeamsView
        initialOrganizations={[ORG_1]}
      />
    );

    // Expand the org
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    await waitFor(() => {
      expect(screen.getByText(/not associated with any team/i)).toBeInTheDocument();
    });

    // Mock respondents fetch for unassigned
    mockFetchRespondents([RESPONDENT_BOB]);

    // Click unassigned node
    const unassignedBtn = screen.getByRole("button", {
      name: /not associated with any team/i,
    });
    fireEvent.click(unassignedBtn);

    // For unassigned: we call respondents WITHOUT a teamId query param,
    // then filter client-side to those with teamId === null.
    // The endpoint call itself is to the org respondents root.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/organizations/org-1/respondents")
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  test("selecting the company root node shows all org members", async () => {
    // First click expands AND selects the org node, triggering a respondents fetch
    // with no teamId param (all members for the org)
    mockFetchForOrg1Teams();
    mockFetchRespondents([RESPONDENT_ALICE, RESPONDENT_BOB]);

    render(
      <MembersTeamsView
        initialOrganizations={[ORG_1]}
      />
    );

    // Right panel starts empty (no node selected)
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();

    // Click the org root node — both selects it and initiates team + member loads
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    // Respondents endpoint called WITHOUT a teamId query param
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/respondents"
      );
    });

    // Both member rows render in the right panel
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  test("(e) member fetch failure shows error affordance and Retry re-fetches", async () => {
    // First expand to get teams, then fail the member load
    mockFetchForOrg1Teams();

    render(
      <MembersTeamsView
        initialOrganizations={[ORG_1]}
      />
    );

    // Expand org to show teams
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });

    // Mock a non-ok response for the member fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: "SERVER_ERROR" }),
    });

    // Click the Engineering team node to trigger member load (exact match to
    // disambiguate from the "Edit Engineering" affordance also on the row)
    fireEvent.click(screen.getByRole("button", { name: "Engineering" }));

    // Error affordance appears — error message + Retry button
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to load members.");
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

    // No member rows rendered
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();

    // Clicking Retry re-fetches: mock a successful response this time
    mockFetchRespondents([RESPONDENT_ALICE]);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    // Error affordance gone
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /**
   * (g) Clicking the org Pencil opens EditOrganizationModal (integration test).
   */
  test("(g) clicking the org Edit affordance opens the EditOrganizationModal", async () => {
    render(<MembersTeamsView initialOrganizations={[ORG_1]} />);

    // The Edit button is visible by data-testid
    const editBtn = screen.getByTestId("edit-org-org-1");
    expect(editBtn).toBeInTheDocument();
    expect(editBtn).toHaveAttribute("aria-label", "Edit organization Acme Corp");

    fireEvent.click(editBtn);

    // EditOrganizationModal dialog heading appears
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /edit organization/i })).toBeInTheDocument();
    });

    // Cancel closes the modal cleanly
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /edit organization/i })).not.toBeInTheDocument();
    });
  });

  /**
   * (h) Clicking a member Pencil opens EditMemberModal (integration test).
   */
  test("(h) clicking the member Edit affordance opens the EditMemberModal", async () => {
    mockFetchForOrg1Teams();
    mockFetchRespondents([RESPONDENT_ALICE]);

    render(<MembersTeamsView initialOrganizations={[ORG_1]} />);

    // Expand org and select it so the member list loads
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    const editMemberBtn = screen.getByTestId("edit-member-resp-1");
    expect(editMemberBtn).toBeInTheDocument();
    expect(editMemberBtn).toHaveAttribute("aria-label", "Edit Alice Smith");

    fireEvent.click(editMemberBtn);

    // EditMemberModal dialog heading appears
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /edit member/i })).toBeInTheDocument();
    });

    // Cancel closes the modal cleanly
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /edit member/i })).not.toBeInTheDocument();
    });
  });

  /**
   * (f) Slice 2 — Each team row exposes an Edit affordance that opens the
   *     EditTeamModal pre-filled with that team.
   */
  test("(f) clicking the team Edit affordance opens the EditTeamModal", async () => {
    mockFetchForOrg1Teams();

    render(<MembersTeamsView initialOrganizations={[ORG_1]} />);

    // Expand Acme Corp
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    // Wait for the team to render
    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });

    // The Edit icon button is rendered next to the team — assert it exists
    const editBtn = screen.getByTestId("edit-team-team-eng");
    expect(editBtn).toBeInTheDocument();
    expect(editBtn).toHaveAttribute("aria-label", "Edit Engineering");

    // Click it — the EditTeamModal opens
    fireEvent.click(editBtn);

    // Modal heading appears
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /edit team/i })).toBeInTheDocument();
    });

    // Pre-filled name input matches the team
    const nameInput = screen.getByLabelText(/name \*/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Engineering");
  });

  /**
   * (i) Level column renders human label for a member with a known roleType slug.
   */
  test("(i) Level column renders human label for known roleType", async () => {
    mockFetchForOrg1Teams();

    // Override RESPONDENT_ALICE with a known slug
    const memberWithLevel = {
      ...RESPONDENT_ALICE,
      roleType: "employee",
    };
    mockFetchRespondents([memberWithLevel]);

    render(<MembersTeamsView initialOrganizations={[ORG_1]} />);

    // Expand org and load members
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    // The Level cell must show the human label, NOT the raw slug
    expect(screen.getByText("Employee")).toBeInTheDocument();
    // Raw slug must NOT be in the document
    expect(screen.queryByText("employee")).not.toBeInTheDocument();
  });

  /**
   * (j) Level column renders "—" for a member with null roleType.
   */
  test("(j) Level column renders '—' for null roleType", async () => {
    mockFetchForOrg1Teams();

    // RESPONDENT_BOB has roleType: null
    mockFetchRespondents([RESPONDENT_BOB]);

    render(<MembersTeamsView initialOrganizations={[ORG_1]} />);

    // Expand org and load members
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });

    // The Level column must render the em-dash
    const memberRow = screen.getByTestId("member-row-resp-2");
    expect(memberRow).toHaveTextContent("—");
  });

  /**
   * (k) Clicking "Import members" with a node selected opens ImportMembersModal.
   */
  test("(k) clicking Import members with a node selected opens the ImportMembersModal", async () => {
    mockFetchForOrg1Teams();

    render(<MembersTeamsView initialOrganizations={[ORG_1]} />);

    // Import members button exists but is disabled before selecting a node
    const importBtn = screen.getByRole("button", { name: /import members \(select a node first\)/i });
    expect(importBtn).toBeDisabled();

    // Expand and select the org node (this also loads members, need to mock)
    mockFetchRespondents([RESPONDENT_ALICE]);
    fireEvent.click(screen.getByRole("button", { name: /^Acme Corp$/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    // Now the Import members button should be enabled
    const importBtnEnabled = screen.getByRole("button", { name: /^import members$/i });
    expect(importBtnEnabled).not.toBeDisabled();

    // Click it — the ImportMembersModal dialog should open
    fireEvent.click(importBtnEnabled);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /import members/i })).toBeInTheDocument();
    });

    // Cancel closes the modal cleanly
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /import members/i })).not.toBeInTheDocument();
    });
  });

  /**
   * (l) The Members & Teams lane exposes an "Import from Esperto" link that
   *     navigates to the coach Esperto import page.
   */
  test("(l) renders an 'Import from Esperto' link to /portal/members/import", () => {
    render(<MembersTeamsView initialOrganizations={[ORG_1]} />);

    const link = screen.getByRole("link", { name: /import from esperto/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/portal/members/import");
  });
});
