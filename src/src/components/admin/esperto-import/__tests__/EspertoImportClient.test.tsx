/**
 * RTL tests — EspertoImportClient (admin Esperto import UI, Slice 7c).
 *
 * Covers: mode switch + file input + coach picker, coach picker population,
 * roster preview request shape + rendered counts, blocks gate commit,
 * clean-preview → commit success, commit 409 with blocks keeps panel open,
 * results mode hides roster fields + posts kind:results + surfaces a 422
 * version error, and a malformed file → inline parse error with no fetch.
 *
 * fetch is mocked per call. File reads use `file.text()` (jsdom supports it),
 * which the component uses in place of FileReader.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { EspertoImportClient } from "@/components/admin/esperto-import/EspertoImportClient";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COACHES = [
  { id: "coach-1", firstName: "Casey", lastName: "Coach", email: "casey@x.com" },
  { id: "coach-2", firstName: "Dana", lastName: "Doe", email: "dana@x.com" },
];

const ROSTER_PAYLOAD = {
  members: [{ memberid: "m1", email: "a@acme.com", name: "Alice" }],
};

const REPORT_PAYLOAD = {
  report: { personal: [{ memberid: "m1", variant: "rockefeller" }] },
};

// ---------------------------------------------------------------------------
// fetch-mock helpers
// ---------------------------------------------------------------------------

function mockCoachesOk() {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: COACHES }),
  });
}

function mockJsonResponse(
  ok: boolean,
  status: number,
  body: Record<string, unknown>,
) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  });
}

/** Build a JSON File whose `.text()` resolves to the given object. */
function jsonFile(obj: unknown, name = "Acme_Members.json"): File {
  return new File([JSON.stringify(obj)], name, { type: "application/json" });
}

/** Build a File whose contents are NOT valid JSON. */
function badFile(name = "broken.json"): File {
  return new File(["this is { not json"], name, { type: "application/json" });
}

async function uploadFile(file: File) {
  const input = screen.getByLabelText(/Esperto export/i) as HTMLInputElement;
  // The component reads the file via FileReader (async). Wrap the change +
  // microtask/onload flush in act() so the post-read state (payload OR parse
  // error) is committed before assertions run. A bare waitFor on the filename
  // would resolve on the *synchronous* setFilename, before the read settles.
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
    // Flush the FileReader onload callback + the promise chain it resolves.
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("EspertoImportClient", () => {
  it("renders the mode switch, file input, and (roster) coach picker", async () => {
    mockCoachesOk();
    render(<EspertoImportClient />);

    expect(
      screen.getByRole("radio", { name: /Roster \(people\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Results \(past answers\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Esperto export/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Owning coach/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Company name/i)).toBeInTheDocument();
  });

  it("populates the coach picker from /api/coaches", async () => {
    mockCoachesOk();
    render(<EspertoImportClient />);

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /Casey Coach/i }),
      ).toBeInTheDocument(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/coaches"),
    );
    expect(
      screen.getByRole("option", { name: /Dana Doe/i }),
    ).toBeInTheDocument();
  });

  it("roster preview: posts mode:preview kind:roster and renders summary counts", async () => {
    mockCoachesOk();
    render(<EspertoImportClient />);
    await waitFor(() =>
      screen.getByRole("option", { name: /Casey Coach/i }),
    );

    await uploadFile(jsonFile(ROSTER_PAYLOAD));
    fireEvent.change(screen.getByLabelText(/Owning coach/i), {
      target: { value: "coach-1" },
    });

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        plan: { creates: [], backfills: [], skips: [], blocks: [] },
        summary: {
          orgAction: "create",
          creates: 3,
          backfills: 1,
          skips: 0,
          blocks: 0,
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));

    await waitFor(() =>
      expect(screen.getByTestId("preview-panel")).toBeInTheDocument(),
    );

    // The Preview POST body has the right shape.
    const previewCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => url === "/api/admin/assessments/import",
    );
    expect(previewCall).toBeTruthy();
    const body = JSON.parse(previewCall![1].body);
    expect(body).toMatchObject({
      mode: "preview",
      kind: "roster",
      ownerCoachId: "coach-1",
      companyName: "Acme",
    });
    expect(body.payload).toEqual(ROSTER_PAYLOAD);

    // Counts render.
    const panel = screen.getByTestId("preview-panel");
    expect(within(panel).getByText("creates")).toBeInTheDocument();
    expect(within(panel).getByText("3")).toBeInTheDocument();
    expect(within(panel).getByText("backfills")).toBeInTheDocument();
  });

  it("blocks present in preview → Commit stays disabled and blocks are shown", async () => {
    mockCoachesOk();
    render(<EspertoImportClient />);
    await waitFor(() =>
      screen.getByRole("option", { name: /Casey Coach/i }),
    );

    await uploadFile(jsonFile(ROSTER_PAYLOAD));
    fireEvent.change(screen.getByLabelText(/Owning coach/i), {
      target: { value: "coach-1" },
    });

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        plan: {
          creates: [],
          backfills: [],
          skips: [],
          blocks: [{ email: "dup@acme.com", reason: "duplicate email" }],
        },
        summary: { orgAction: "merge", creates: 0, backfills: 0, skips: 0, blocks: 1 },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));

    await waitFor(() =>
      expect(screen.getByTestId("preview-panel")).toBeInTheDocument(),
    );

    // Block surfaced in an alert.
    const alerts = screen.getAllByRole("alert");
    expect(
      alerts.some((el) => /duplicate email/i.test(el.textContent || "")),
    ).toBe(true);

    // Commit disabled.
    expect(screen.getByRole("button", { name: /^Commit$/i })).toBeDisabled();
  });

  it("clean preview → Commit enabled → commit success renders committed counts", async () => {
    mockCoachesOk();
    render(<EspertoImportClient />);
    await waitFor(() =>
      screen.getByRole("option", { name: /Casey Coach/i }),
    );

    await uploadFile(jsonFile(ROSTER_PAYLOAD));
    fireEvent.change(screen.getByLabelText(/Owning coach/i), {
      target: { value: "coach-1" },
    });

    // Preview (clean).
    mockJsonResponse(true, 200, {
      success: true,
      data: {
        plan: { creates: [], backfills: [], skips: [], blocks: [] },
        summary: { orgAction: "create", creates: 2, backfills: 0, skips: 0, blocks: 0 },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Commit$/i })).toBeEnabled(),
    );

    // Commit.
    mockJsonResponse(true, 200, {
      success: true,
      data: { created: 2, updated: 0, skipped: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Commit$/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText(/committed successfully/i)).toBeInTheDocument();
    expect(within(status).getByText("created")).toBeInTheDocument();
    expect(within(status).getByText("2")).toBeInTheDocument();

    // The commit POST had mode:commit.
    const commitCall = (global.fetch as jest.Mock).mock.calls
      .filter(([url]) => url === "/api/admin/assessments/import")
      .pop();
    const body = JSON.parse(commitCall![1].body);
    expect(body.mode).toBe("commit");
    expect(body.kind).toBe("roster");
  });

  it("commit 409 with blocks → error + blocks shown, preview panel stays open", async () => {
    mockCoachesOk();
    render(<EspertoImportClient />);
    await waitFor(() =>
      screen.getByRole("option", { name: /Casey Coach/i }),
    );

    await uploadFile(jsonFile(ROSTER_PAYLOAD));
    fireEvent.change(screen.getByLabelText(/Owning coach/i), {
      target: { value: "coach-1" },
    });

    // Clean preview unlocks commit.
    mockJsonResponse(true, 200, {
      success: true,
      data: {
        plan: { creates: [], backfills: [], skips: [], blocks: [] },
        summary: { creates: 1, backfills: 0, skips: 0, blocks: 0 },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Commit$/i })).toBeEnabled(),
    );

    // Commit fails 409 (stale plan diverged).
    mockJsonResponse(false, 409, {
      success: false,
      error: "Plan has blocking errors; cannot commit.",
      blocks: [{ email: "late@acme.com", reason: "added since preview" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Commit$/i }));

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(
        alerts.some((el) =>
          /added since preview/i.test(el.textContent || ""),
        ),
      ).toBe(true);
    });

    // The error text shows.
    expect(
      screen.getByText(/Plan has blocking errors/i),
    ).toBeInTheDocument();
    // Preview panel stays open.
    expect(screen.getByTestId("preview-panel")).toBeInTheDocument();
  });

  it("results mode hides coach/company, posts kind:results, and shows a 422 version error", async () => {
    mockCoachesOk();
    render(<EspertoImportClient />);
    await waitFor(() =>
      screen.getByRole("option", { name: /Casey Coach/i }),
    );

    // Switch to results.
    fireEvent.click(
      screen.getByRole("radio", { name: /Results \(past answers\)/i }),
    );

    // Roster-only fields gone.
    expect(screen.queryByLabelText(/Owning coach/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Company name/i)).not.toBeInTheDocument();

    await uploadFile(jsonFile(REPORT_PAYLOAD, "AcmeReport.json"));

    // 422 unpublished version.
    mockJsonResponse(false, 422, {
      success: false,
      error: "TEMPLATE_VERSION_NOT_PUBLISHED",
      details: { alias: "rockefeller" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/TEMPLATE_VERSION_NOT_PUBLISHED/i),
      ).toBeInTheDocument(),
    );

    const resultsCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => url === "/api/admin/assessments/import",
    );
    const body = JSON.parse(resultsCall![1].body);
    expect(body.kind).toBe("results");
    expect(body.mode).toBe("preview");
    expect(body).not.toHaveProperty("ownerCoachId");
  });

  it("malformed file → inline parse error and NO import fetch", async () => {
    mockCoachesOk();
    render(<EspertoImportClient />);
    await waitFor(() =>
      screen.getByRole("option", { name: /Casey Coach/i }),
    );

    await uploadFile(badFile());

    expect(screen.getByText(/Could not parse/i)).toBeInTheDocument();

    // Preview is disabled (no valid payload).
    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeDisabled();

    // Only the coaches fetch happened — never the import endpoint.
    const importCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === "/api/admin/assessments/import",
    );
    expect(importCalls).toHaveLength(0);
  });

  it("admin variant (default) renders the coach picker and posts to the admin route", async () => {
    // This re-asserts the admin invariant alongside the coach variant below,
    // so a regression in either path is caught here.
    mockCoachesOk();
    render(<EspertoImportClient variant="admin" />);

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /Casey Coach/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/Owning coach/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/coaches"),
    );

    await uploadFile(jsonFile(ROSTER_PAYLOAD));
    fireEvent.change(screen.getByLabelText(/Owning coach/i), {
      target: { value: "coach-1" },
    });

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        plan: { creates: [], backfills: [], skips: [], blocks: [] },
        summary: { orgAction: "create", creates: 1, backfills: 0, skips: 0, blocks: 0 },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));

    await waitFor(() =>
      expect(screen.getByTestId("preview-panel")).toBeInTheDocument(),
    );

    const adminCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => url === "/api/admin/assessments/import",
    );
    expect(adminCall).toBeTruthy();
    // The coach route was never hit in admin mode.
    expect(
      (global.fetch as jest.Mock).mock.calls.some(
        ([url]) => url === "/api/assessments/import",
      ),
    ).toBe(false);
    const body = JSON.parse(adminCall![1].body);
    expect(body.ownerCoachId).toBe("coach-1");
  });

  describe('variant="coach"', () => {
    it("does NOT render the coach picker and does NOT fetch /api/coaches", async () => {
      render(<EspertoImportClient variant="coach" />);

      // Mode switch + file input still present.
      expect(
        screen.getByRole("radio", { name: /Roster \(people\)/i }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Esperto export/i)).toBeInTheDocument();

      // Company name is still required for roster…
      expect(screen.getByLabelText(/Company name/i)).toBeInTheDocument();
      // …but there is NO owning-coach picker.
      expect(screen.queryByLabelText(/Owning coach/i)).not.toBeInTheDocument();

      // /api/coaches is never requested in the coach variant.
      const coachFetches = (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) =>
          typeof url === "string" && url.includes("/api/coaches"),
      );
      expect(coachFetches).toHaveLength(0);
    });

    it("roster preview posts to /api/assessments/import with NO ownerCoachId", async () => {
      render(<EspertoImportClient variant="coach" />);

      await uploadFile(jsonFile(ROSTER_PAYLOAD));
      // No coach to pick — company name auto-fills from the filename ("Acme").

      mockJsonResponse(true, 200, {
        success: true,
        data: {
          plan: { creates: [], backfills: [], skips: [], blocks: [] },
          summary: { orgAction: "create", creates: 2, backfills: 0, skips: 0, blocks: 0 },
        },
      });

      fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));

      await waitFor(() =>
        expect(screen.getByTestId("preview-panel")).toBeInTheDocument(),
      );

      // Posted to the COACH route, never the admin route.
      const coachCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url]) => url === "/api/assessments/import",
      );
      expect(coachCall).toBeTruthy();
      expect(
        (global.fetch as jest.Mock).mock.calls.some(
          ([url]) => url === "/api/admin/assessments/import",
        ),
      ).toBe(false);

      const body = JSON.parse(coachCall![1].body);
      expect(body).toMatchObject({
        mode: "preview",
        kind: "roster",
        companyName: "Acme",
      });
      // The coach is implicit (server-derived) — never sent from the client.
      expect(body).not.toHaveProperty("ownerCoachId");
      expect(body.payload).toEqual(ROSTER_PAYLOAD);
    });
  });
});
