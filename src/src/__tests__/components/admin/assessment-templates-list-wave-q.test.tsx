/**
 * Wave Q item #6 — Disable retired templates: admin templates list surface.
 *
 * - `Disabled` badge renders on rows carrying `disabledAt` (unconditional —
 *   persisted admin intent is always visible).
 * - The Enable/Disable row action renders ONLY when `waveQEnabled` (the
 *   capability is flag-gated); View/Access/Edit/Delete stay exactly as-is.
 * - Disable confirms first ("Hidden from new-campaign setup. Existing
 *   campaigns and reports are not affected."), then PATCHes
 *   `{ disabled: true }`; Enable PATCHes `{ disabled: false }`.
 * - A 403 from the PATCH (wave flag off server-side) surfaces as a toast,
 *   following the existing handleDelete 409 pattern.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AssessmentTemplatesList } from "@/components/admin/AssessmentTemplatesList";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const ACTIVE_ROW = {
  id: "tpl-active",
  name: "Rockefeller Habits",
  alias: "rockefeller",
  aggregationMode: "FULL_VISIBILITY" as const,
  disabledAt: null,
};

const DISABLED_ROW = {
  id: "tpl-disabled",
  name: "QSP V1",
  alias: "qsp-v1",
  aggregationMode: "FULL_VISIBILITY" as const,
  disabledAt: "2026-07-02T00:00:00.000Z",
};

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}
let fetchCalls: FetchCall[];
let patchStatus: number;

function installFetch(rows: unknown[] = [ACTIVE_ROW, DISABLED_ROW]) {
  fetchCalls = [];
  patchStatus = 200;
  global.fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      let body: unknown = undefined;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      fetchCalls.push({ url, method, body });

      if (url.endsWith("/api/admin/assessment-templates") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: rows }),
        } as unknown as Response;
      }
      if (method === "PATCH") {
        return {
          ok: patchStatus >= 200 && patchStatus < 300,
          status: patchStatus,
          json: async () =>
            patchStatus === 403
              ? { success: false, error: "FORBIDDEN" }
              : { success: true },
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: "unhandled" }),
      } as unknown as Response;
    },
  ) as unknown as typeof fetch;
}

const originalConfirm = window.confirm;
beforeEach(() => {
  toastMock.mockClear();
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterEach(() => {
  window.confirm = originalConfirm;
  jest.restoreAllMocks();
});

describe("AssessmentTemplatesList — Disabled badge", () => {
  it("renders the badge only on rows with disabledAt", async () => {
    installFetch();
    render(<AssessmentTemplatesList />);
    await screen.findByText("QSP V1");

    const badges = screen.getAllByText(/^disabled$/i);
    expect(badges).toHaveLength(1);
    expect(
      screen.getByTestId(`disabled-badge-${DISABLED_ROW.id}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`disabled-badge-${ACTIVE_ROW.id}`),
    ).not.toBeInTheDocument();
  });
});

describe("AssessmentTemplatesList — responsive collection", () => {
  it("keeps only the legacy table when responsive presentation is disabled", async () => {
    installFetch();
    render(<AssessmentTemplatesList responsiveEnabled={false} />);
    await screen.findByText("QSP V1");

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Assessment templates" }),
    ).not.toBeInTheDocument();
  });

  it("presents every template field and action through compact records", async () => {
    installFetch();
    render(<AssessmentTemplatesList responsiveEnabled waveQEnabled />);
    const cards = await screen.findByRole("list", {
      name: "Assessment templates",
    });
    const card = within(cards).getByRole("article", {
      name: "Rockefeller Habits",
    });

    expect(within(card).getByText("INVITED")).toBeInTheDocument();
    expect(within(card).getByText("FULL_VISIBILITY")).toBeInTheDocument();
    expect(within(card).getByText("v1 (1 total)")).toBeInTheDocument();
    expect(within(card).getByText("Active", { exact: true })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Edit" })).toHaveClass(
      "min-h-11",
    );
    const more = within(card).getByRole("button", {
      name: "More Rockefeller Habits actions",
    });
    expect(more).toHaveClass("min-h-11");
    expect(more).toHaveClass("min-w-11");
    fireEvent.keyDown(more, { key: "ArrowDown" });
    expect(await screen.findByRole("menuitem", { name: /access/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /disable rockefeller habits/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /soft-delete rockefeller habits/i })).toBeInTheDocument();
  });

  it("gives the actual wide Edit and Delete nodes direct 44px target contracts", async () => {
    installFetch([ACTIVE_ROW]);
    render(<AssessmentTemplatesList responsiveEnabled />);

    const wide = await screen.findByTestId("responsive-wide-view");
    const edit = within(wide).getByRole("link", { name: "Edit" });
    expect(edit).toHaveClass("min-h-11");
    expect(edit).toHaveClass("min-w-11");
    const remove = within(wide).getByRole("button", {
      name: "Soft-delete Rockefeller Habits",
    });
    expect(remove).toHaveClass("min-h-11");
    expect(remove).toHaveClass("min-w-11");
  });
});

describe("AssessmentTemplatesList — flag-gated Enable/Disable action", () => {
  it("hides the action when waveQEnabled is false (default) and keeps existing actions", async () => {
    installFetch();
    render(<AssessmentTemplatesList />);
    await screen.findByText("QSP V1");

    expect(
      screen.queryByRole("button", { name: /disable rockefeller habits/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /enable qsp v1/i }),
    ).not.toBeInTheDocument();
    // Existing actions untouched. ("View" was removed Jul-8 roadmap #2 —
    // it duplicated the name + Edit editor link; see the dedup test.)
    expect(screen.queryAllByText("View")).toHaveLength(0);
    expect(screen.getAllByText("Edit")).toHaveLength(2);
    expect(screen.getAllByText("Delete")).toHaveLength(2);
    expect(screen.getAllByText(/access/i).length).toBeGreaterThanOrEqual(2);
  });

  it("shows Disable on active rows and Enable on disabled rows when waveQEnabled", async () => {
    installFetch();
    render(<AssessmentTemplatesList waveQEnabled />);
    await screen.findByText("QSP V1");

    expect(
      screen.getByRole("button", { name: /disable rockefeller habits/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enable qsp v1/i }),
    ).toBeInTheDocument();
  });

  it("Disable confirms with the blast-radius copy then PATCHes { disabled: true }", async () => {
    installFetch();
    render(<AssessmentTemplatesList waveQEnabled />);
    await screen.findByText("QSP V1");

    fireEvent.click(
      screen.getByRole("button", { name: /disable rockefeller habits/i }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining(
        "Hidden from new-campaign setup. Existing campaigns and reports are not affected.",
      ),
    );
    await waitFor(() => {
      const patch = fetchCalls.find((c) => c.method === "PATCH");
      expect(patch).toBeDefined();
      expect(patch!.url).toContain(
        `/api/admin/assessment-templates/${ACTIVE_ROW.id}`,
      );
      expect(patch!.body).toEqual({ disabled: true });
    });
  });

  it("cancelled confirm sends no PATCH", async () => {
    installFetch();
    (window.confirm as jest.Mock).mockReturnValue(false);
    render(<AssessmentTemplatesList waveQEnabled />);
    await screen.findByText("QSP V1");

    fireEvent.click(
      screen.getByRole("button", { name: /disable rockefeller habits/i }),
    );

    expect(fetchCalls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });

  it("Enable PATCHes { disabled: false } without a confirm", async () => {
    installFetch();
    render(<AssessmentTemplatesList waveQEnabled />);
    await screen.findByText("QSP V1");

    fireEvent.click(screen.getByRole("button", { name: /enable qsp v1/i }));

    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => {
      const patch = fetchCalls.find((c) => c.method === "PATCH");
      expect(patch).toBeDefined();
      expect(patch!.url).toContain(
        `/api/admin/assessment-templates/${DISABLED_ROW.id}`,
      );
      expect(patch!.body).toEqual({ disabled: false });
    });
  });

  it("surfaces a 403 from the PATCH as a destructive toast", async () => {
    installFetch();
    render(<AssessmentTemplatesList waveQEnabled />);
    await screen.findByText("QSP V1");
    patchStatus = 403;

    fireEvent.click(
      screen.getByRole("button", { name: /disable rockefeller habits/i }),
    );

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
  });
});
