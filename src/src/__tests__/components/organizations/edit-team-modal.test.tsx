/**
 * TDD Red Phase — EditTeamModal tests.
 *
 * Slice 2 Task 1 — EDIT modal with strict reparent/type guards that map to
 * the schema invariant: an `OrgTeam` cannot become an `Organization`, so
 *   - Type may NOT be "Company" (omitted from the Type select)
 *   - Parent may NOT be root        (omitted from the Parent select)
 *   - Parent may NOT be the editing team itself OR any of its descendants
 *
 * Mirrors AddTeamModal conventions: fireEvent only (no user-event), native
 * <select> driven via `data-testid`, mocked global.fetch.
 *
 * Test matrix:
 *  (1) Pre-fill: open with a team populates Name / Type / Parent / Description
 *  (2) Type select does NOT include "Company"
 *  (3) Parent select does NOT include "— none (root) —", the editing team, OR descendants
 *  (4) Valid submit PATCHes /api/organizations/{orgId}/teams/{teamId} with the body,
 *      calls onUpdated and onClose
 *  (5) Failed PATCH (Zod array error) surfaces specific message + modal stays open
 *  (6) Delete button: confirm=true → DELETE → success → onUpdated/onClose
 *  (7) Delete returning 409 (children) shows inline "Cannot delete — this team has sub-teams."
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditTeamModal } from "@/components/organizations/edit-team-modal";
import type { ApiTeamNode } from "@/components/organizations/members-teams-view";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Tree shape for the Parent picker:
 *
 *   Engineering (team-eng)
 *     └── Frontend (team-frontend)
 *           └── Web (team-web)
 *   Marketing  (team-mkt)
 *
 * When editing `Engineering`, the Parent picker must EXCLUDE:
 *   - team-eng       (self)
 *   - team-frontend  (descendant)
 *   - team-web       (descendant)
 * and INCLUDE only `Marketing`.
 */

const TEAM_WEB: ApiTeamNode = {
  id: "team-web",
  organizationId: "org-1",
  parentTeamId: "team-frontend",
  name: "Web",
  type: "team",
  description: null,
  children: [],
};

const TEAM_FRONTEND: ApiTeamNode = {
  id: "team-frontend",
  organizationId: "org-1",
  parentTeamId: "team-eng",
  name: "Frontend",
  type: "team",
  description: null,
  children: [TEAM_WEB],
};

const TEAM_ENG: ApiTeamNode = {
  id: "team-eng",
  organizationId: "org-1",
  parentTeamId: null,
  name: "Engineering",
  type: "department",
  description: "Builds the product",
  children: [TEAM_FRONTEND],
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

const ALL_TEAMS: ApiTeamNode[] = [TEAM_ENG, TEAM_MKT];

// The team we are EDITING in most tests:
const EDIT_TARGET = {
  id: "team-eng",
  orgId: "org-1",
  name: "Engineering",
  type: "department",
  description: "Builds the product",
  parentTeamId: null as string | null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(
  overrides: Partial<React.ComponentProps<typeof EditTeamModal>> = {}
) {
  const onClose = jest.fn();
  const onUpdated = jest.fn();
  const defaults: React.ComponentProps<typeof EditTeamModal> = {
    open: true,
    onClose,
    onUpdated,
    team: { ...EDIT_TARGET },
    teams: ALL_TEAMS,
  };
  const props = { ...defaults, ...overrides };
  render(<EditTeamModal {...props} />);
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

describe("EditTeamModal", () => {
  /**
   * (1) Pre-fill: opening with a team populates Name/Type/Parent/Description.
   *     The "Engineering" team is currently at root (parentTeamId=null);
   *     since the EDIT modal omits root, the Parent should default to an
   *     in-modal placeholder ("Select a parent…") — but Name/Type/Description
   *     must be populated.
   */
  test("(1) pre-fills Name, Type, and Description from the team prop", () => {
    // For pre-fill of Parent we need a team that has a non-null parentTeamId,
    // because the EDIT modal removes "— none (root) —" from options. Use
    // Frontend (parent=team-eng).
    renderModal({
      team: {
        id: "team-frontend",
        orgId: "org-1",
        name: "Frontend",
        type: "team",
        description: "Web stack",
        parentTeamId: "team-eng",
      },
    });

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Frontend");

    const typeSelect = screen.getByTestId("select-type") as HTMLSelectElement;
    expect(typeSelect.value).toBe("team");

    const parentSelect = screen.getByTestId("select-parent") as HTMLSelectElement;
    expect(parentSelect.value).toBe("team-eng");

    const descTextarea = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    expect(descTextarea.value).toBe("Web stack");
  });

  /**
   * (2) Type select does NOT include "Company".
   *     The remaining options should be Department / Team / Folder.
   */
  test("(2) Type select omits 'Company'", () => {
    renderModal();
    const typeSelect = screen.getByTestId("select-type") as HTMLSelectElement;
    const optionValues = Array.from(typeSelect.options).map((o) => o.value);
    expect(optionValues).not.toContain("company");
    // Should include the other three:
    expect(optionValues).toEqual(expect.arrayContaining(["department", "team", "folder"]));
    // The visible labels should not contain "Company"
    for (const opt of Array.from(typeSelect.options)) {
      expect(opt.textContent?.toLowerCase()).not.toMatch(/^company$/);
    }
  });

  /**
   * (3) Parent select does NOT include:
   *      - a "none (root)" or "no parent" option that would let users move
   *        a team to root (schema invariant: sub-teams cannot become root)
   *      - the team being edited (team-eng)
   *      - any descendants of the team being edited (team-frontend, team-web)
   *     It SHOULD include any sibling/unrelated team (team-mkt).
   *
   *     NOTE: The select DOES include a disabled placeholder with value ""
   *     (renders as "— select a parent (required) —") — this is intentional
   *     for root-level teams so the user must consciously choose a parent.
   *     The placeholder carries no "no parent" semantic; validate() blocks
   *     save when value is "" anyway.
   */
  test("(3) Parent select omits root-option, self, and descendants; placeholder value is ''", () => {
    renderModal(); // editing team-eng (parentTeamId=null → placeholder shown)
    const parentSelect = screen.getByTestId("select-parent") as HTMLSelectElement;
    const values = Array.from(parentSelect.options).map((o) => o.value);

    // The only "" entry must be the required-choice placeholder (disabled)
    const emptyOptions = Array.from(parentSelect.options).filter((o) => o.value === "");
    expect(emptyOptions).toHaveLength(1);
    expect(emptyOptions[0].disabled).toBe(true);

    // No "root" value entry
    expect(values).not.toContain("root");
    // Self and descendants excluded
    expect(values).not.toContain("team-eng");       // self
    expect(values).not.toContain("team-frontend");  // descendant
    expect(values).not.toContain("team-web");       // descendant
    // Sibling/unrelated team is present
    expect(values).toContain("team-mkt");

    // No option label should convey "move to root" semantics
    const labels = Array.from(parentSelect.options).map((o) => o.textContent ?? "");
    for (const l of labels) {
      expect(l).not.toMatch(/none.*root/i);
      expect(l).not.toMatch(/^—\s*root\s*—$/i);
    }

    // The select itself defaults to the placeholder (value="") for a
    // root-level team — user must consciously choose before saving.
    expect(parentSelect.value).toBe("");
  });

  /**
   * (4) Valid submit PATCHes /api/organizations/{orgId}/teams/{teamId}
   *     with { name, type, description, parentTeamId } and calls onUpdated + onClose.
   */
  test("(4) valid submit PATCHes the team and calls onUpdated + onClose", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: "team-frontend",
          organizationId: "org-1",
          name: "Front-end",
          type: "team",
          description: "Renamed",
          parentTeamId: "team-mkt",
        },
      }),
    });

    const { onUpdated, onClose } = renderModal({
      team: {
        id: "team-frontend",
        orgId: "org-1",
        name: "Frontend",
        type: "team",
        description: "Web stack",
        parentTeamId: "team-eng",
      },
    });

    // Edit Name
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Front-end" },
    });
    // Edit Description
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Renamed" },
    });
    // Edit Parent → Marketing
    fireEvent.change(screen.getByTestId("select-parent"), {
      target: { value: "team-mkt" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/teams/team-frontend",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    // Verify the body shape
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(call[1].body as string);
    expect(sentBody).toEqual({
      name: "Front-end",
      type: "team",
      description: "Renamed",
      parentTeamId: "team-mkt",
    });

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * (5) Failed PATCH ({ success:false, error:[{message:"Some Zod issue"}] })
   *     shows the specific Zod message; modal stays open.
   */
  test("(5) 400 with Zod array error surfaces the specific message + modal stays open", async () => {
    const zodMessage = "Name must be at most 200 characters";
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: [{ message: zodMessage, path: ["name"], code: "too_big" }],
      }),
    });

    const { onUpdated, onClose } = renderModal({
      team: {
        id: "team-frontend",
        orgId: "org-1",
        name: "Frontend",
        type: "team",
        description: null,
        parentTeamId: "team-eng",
      },
    });

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "A".repeat(201) },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(zodMessage);
    });

    expect(onUpdated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * (6) Delete button: confirm=true → DELETE → success → onUpdated/onClose.
   */
  test("(6) delete button → confirm → DELETE → success → onUpdated/onClose", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: "Team deleted" }),
    });

    const { onUpdated, onClose } = renderModal({
      team: {
        id: "team-mkt",
        orgId: "org-1",
        name: "Marketing",
        type: "department",
        description: null,
        parentTeamId: "team-eng", // give it a non-null parent so Parent select can pre-fill
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /delete team/i }));

    expect(confirmSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/teams/team-mkt",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled();
    });
    expect(onClose).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  /**
   * (7) Delete returning 409 (children exist) shows inline:
   *     "Cannot delete — this team has sub-teams. Move or delete them first."
   *     The modal stays open.
   */
  test("(7) delete 409 children shows inline error; modal stays open", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        error:
          "Team has child teams. Soft-delete child teams first before deleting their parent.",
      }),
    });

    const { onUpdated, onClose } = renderModal({
      team: {
        id: "team-frontend",
        orgId: "org-1",
        name: "Frontend",
        type: "team",
        description: null,
        parentTeamId: "team-eng",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /delete team/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /cannot delete.*sub-teams/i
      );
    });

    expect(onUpdated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  /**
   * Bonus: confirming the dialog is cancelled (confirm=false) — should NOT
   * call fetch. Cheap extra coverage for the delete affordance.
   */
  test("(bonus) cancelling the delete confirm does NOT fire DELETE", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);

    renderModal({
      team: {
        id: "team-frontend",
        orgId: "org-1",
        name: "Frontend",
        type: "team",
        description: null,
        parentTeamId: "team-eng",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /delete team/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  /**
   * Test gap #4 — null-type save flow.
   *
   * Part A: open Edit on a team with type=null, click Save without picking a
   *         type → inline "Type is required." alert appears, no fetch fired.
   * Part B: pick type="team" + a valid parent, click Save → PATCH fires with
   *         the expected body shape.
   */
  test("(#4a) null-type: Save without type shows 'Type is required.' and no fetch", async () => {
    renderModal({
      team: {
        id: "team-frontend",
        orgId: "org-1",
        name: "Frontend",
        type: null,      // legacy team — no type set
        description: null,
        parentTeamId: "team-eng", // has a parent so Parent select is pre-filled
      },
    });

    // Type select starts at placeholder value ""
    const typeSelect = screen.getByTestId("select-type") as HTMLSelectElement;
    expect(typeSelect.value).toBe("");

    // Inline hint for null-type teams should be visible
    expect(
      screen.getByText(/this team has no type set/i)
    ).toBeInTheDocument();

    // Click Save without picking a type
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // Inline error appears; no fetch fired
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Type is required.");
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("(#4b) null-type: pick type + save → PATCH fires with expected body", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: "team-frontend",
          organizationId: "org-1",
          name: "Frontend",
          type: "team",
          description: null,
          parentTeamId: "team-eng",
        },
      }),
    });

    renderModal({
      team: {
        id: "team-frontend",
        orgId: "org-1",
        name: "Frontend",
        type: null,
        description: null,
        parentTeamId: "team-eng",
      },
    });

    // Pick a type
    fireEvent.change(screen.getByTestId("select-type"), {
      target: { value: "team" },
    });

    // Type hint should disappear once a type is chosen
    expect(screen.queryByText(/this team has no type set/i)).not.toBeInTheDocument();

    // Parent is already pre-filled to "team-eng" — just submit
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/organizations/org-1/teams/team-frontend",
        expect.objectContaining({ method: "PATCH" })
      );
    });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(call[1].body as string);
    expect(sentBody).toEqual({
      name: "Frontend",
      type: "team",
      description: null,
      parentTeamId: "team-eng",
    });
  });
});

