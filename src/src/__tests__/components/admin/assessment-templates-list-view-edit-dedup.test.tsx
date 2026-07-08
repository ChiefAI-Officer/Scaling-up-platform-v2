/**
 * Templates-list View==Edit de-duplication (Jul-8 roadmap target #2).
 *
 * Before: the row rendered NAME, "View", and "Edit" — all three linking to
 * `/admin/assessments/templates/{id}` (which redirects into the editor), so
 * three controls pointed at one destination (bad UX; user-flagged).
 *
 * After: the redundant "View" link is removed. The template NAME is the open
 * affordance (→ editor) and "Edit" stays as the explicit verb; both point at
 * the same editor URL, which is the conventional list pattern (name-click vs.
 * action verb) — the confusing duplicate "View" verb is gone. "Access", the
 * Enable/Disable flag-gated action, and "Delete" are untouched.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { AssessmentTemplatesList } from "@/components/admin/AssessmentTemplatesList";

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const ROWS = [
  {
    id: "tpl-a",
    name: "Rockefeller Habits",
    alias: "rockefeller",
    aggregationMode: "FULL_VISIBILITY" as const,
    disabledAt: null,
  },
  {
    id: "tpl-b",
    name: "Leadership Vision",
    alias: "lva",
    aggregationMode: "CEO_ONLY" as const,
    disabledAt: null,
  },
];

beforeEach(() => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.endsWith("/api/admin/assessment-templates")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: ROWS }),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ success: false }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AssessmentTemplatesList — View/Edit de-duplication", () => {
  it("renders NO 'View' action link", async () => {
    render(<AssessmentTemplatesList />);
    await screen.findByText("Rockefeller Habits");
    expect(screen.queryAllByText("View")).toHaveLength(0);
  });

  it("keeps 'Edit' on every row, still linking to the editor URL", async () => {
    render(<AssessmentTemplatesList />);
    await screen.findByText("Rockefeller Habits");
    const edits = screen.getAllByRole("link", { name: "Edit" });
    expect(edits).toHaveLength(2);
    expect(edits[0]).toHaveAttribute(
      "href",
      "/admin/assessments/templates/tpl-a",
    );
  });

  it("keeps the template NAME as the open affordance (→ editor)", async () => {
    render(<AssessmentTemplatesList />);
    const nameLink = await screen.findByRole("link", {
      name: "Rockefeller Habits",
    });
    expect(nameLink).toHaveAttribute(
      "href",
      "/admin/assessments/templates/tpl-a",
    );
  });

  it("leaves Access and Delete untouched", async () => {
    render(<AssessmentTemplatesList />);
    await screen.findByText("Rockefeller Habits");
    expect(screen.getAllByText(/access/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Delete")).toHaveLength(2);
  });
});
