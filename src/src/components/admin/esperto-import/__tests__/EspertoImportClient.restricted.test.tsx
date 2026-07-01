/**
 * RTL tests — EspertoImportClient's Wave O "restrictedResults" (SU-Full
 * historical) kind. Sibling to EspertoImportClient.test.tsx (which covers
 * roster/results and stays untouched) since this batch of coverage is large
 * enough to warrant its own file, matching this directory's one-file-per-slice
 * precedent.
 *
 * Covers: dark-by-default (no suFullImportEnabled prop), visible when enabled,
 * round-label + org required before Preview, multi-file parse + malformed-file
 * blocking, preview request body shape + summary/blocks/warnings rendering,
 * commit request body shape (expectedVersionId) + outcome.kind rendering, and
 * kind-switch reset.
 *
 * Fetch mocking is URL-routed (the org-list endpoint always succeeds
 * regardless of call count/order; only the user-driven import POST calls are
 * a FIFO queue) -- NOT order-based mockResolvedValueOnce chaining, which
 * proved flaky under full-suite parallel-worker load. File uploads wait for
 * a concrete DOM signal (the filename appearing) rather than a fixed
 * setTimeout, for the same reason.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { EspertoImportClient } from "@/components/admin/esperto-import/EspertoImportClient";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORGS = [
  { id: "org-1", name: "Acme Corp" },
  { id: "org-2", name: "Rockefeller Habits Inc" },
];

const INDIVIDUAL_PAYLOAD_1 = { kind: "restricted-individual", cid: "c1", mid: "m1" };
const INDIVIDUAL_PAYLOAD_2 = { kind: "restricted-individual", cid: "c1", mid: "m2" };
const AGGREGATE_PAYLOAD = { kind: "restricted-aggregate", cid: "c1" };

// ---------------------------------------------------------------------------
// fetch-mock helpers
// ---------------------------------------------------------------------------

/**
 * Queue BOTH the admin variant's mount-time /api/coaches fetch AND the
 * /api/organizations fetch (fired once the SU-Full kind is selected). The
 * component's default variant is "admin", which fetches coaches on mount
 * regardless of which kind is active — that mock must be queued first or it
 * consumes the organizations mock instead (fetch mocks are FIFO).
 */
// The org-list effect is URL-routed (always succeeds with ORGS), never queue-order-based
// -- it must not matter how many times it fires (e.g. under StrictMode double-invoke, or
// extra re-renders under full-suite CPU contention). Only the user-driven import POST calls
// (preview/commit, one at a time) are order-sensitive, so THOSE stay a FIFO queue.
let importResponseQueue: { ok: boolean; status: number; body: Record<string, unknown> }[] = [];

function installFetchMock() {
  importResponseQueue = [];
  global.fetch = jest.fn((url: string) => {
    if (url === "/api/organizations") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: ORGS }),
      });
    }
    const next = importResponseQueue.shift();
    if (!next) {
      return Promise.reject(new Error(`unexpected fetch call to ${url} with no queued response`));
    }
    return Promise.resolve({
      ok: next.ok,
      status: next.status,
      json: async () => next.body,
    });
  }) as unknown as typeof global.fetch;
}

/** No-op -- kept so existing call sites read the same; org responses are always URL-routed now. */
function mockOrgsOk() {}

function mockJsonResponse(
  ok: boolean,
  status: number,
  body: Record<string, unknown>,
) {
  importResponseQueue.push({ ok, status, body });
}

function jsonFile(obj: unknown, name: string): File {
  return new File([JSON.stringify(obj)], name, { type: "application/json" });
}

function badFile(name: string): File {
  return new File(["not { json"], name, { type: "application/json" });
}

/** Fire a multi-file change on an <input type="file" multiple>, flushing FileReader reads. */
/**
 * Fire a multi-file change on an <input type="file" multiple> and wait for
 * each file's async FileReader-based parse to genuinely finish, evidenced by
 * its name appearing in the DOM (either the loaded-filename text, or a
 * parseError message -- both embed the filename). A fixed setTimeout(0) is
 * NOT reliable here: under full-suite parallel-worker CPU contention, one
 * microtask flush is not always enough to drain every FileReader.onload +
 * its dependent state updates before the test proceeds.
 */
async function uploadFiles(input: HTMLInputElement, files: File[]) {
  fireEvent.change(input, { target: { files } });
  await waitFor(() => {
    for (const file of files) {
      expect(
        screen.getByText((content) => content.includes(file.name)),
      ).toBeInTheDocument();
    }
  });
}

function selectSuFullKind() {
  fireEvent.click(
    screen.getByRole("radio", { name: /SU-Full \(historical\)/i }),
  );
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("EspertoImportClient — restrictedResults (Wave O SU-Full)", () => {
  it("does NOT render the SU-Full kind button when suFullImportEnabled is false/omitted", async () => {
    render(<EspertoImportClient />);
    expect(
      screen.queryByRole("radio", { name: /SU-Full \(historical\)/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the SU-Full kind button when suFullImportEnabled is explicitly false", async () => {
    render(<EspertoImportClient suFullImportEnabled={false} />);
    expect(
      screen.queryByRole("radio", { name: /SU-Full \(historical\)/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the SU-Full kind button when suFullImportEnabled is true, and selecting it swaps in the round-label/org/multi-file UI", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);

    const kindButton = screen.getByRole("radio", {
      name: /SU-Full \(historical\)/i,
    });
    expect(kindButton).toBeInTheDocument();

    fireEvent.click(kindButton);

    expect(screen.getByLabelText(/Round label/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Individual files/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Aggregate export/i)).toBeInTheDocument();

    // Roster/results-only fields are gone in this kind.
    expect(screen.queryByLabelText(/Owning coach/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Company name/i)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /Acme Corp/i }),
      ).toBeInTheDocument(),
    );
  });

  it("Preview stays disabled until round label AND target org are both set", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );

    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    // Still no files loaded.
    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeDisabled();

    const filesInput = screen.getByLabelText(
      /Individual files/i,
    ) as HTMLInputElement;
    await uploadFiles(filesInput, [
      jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json"),
    ]);

    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeEnabled();
  });

  it("blocks Preview and shows an inline hint when round label exceeds 64 characters", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );

    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "x".repeat(65) },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    const filesInput = screen.getByLabelText(
      /Individual files/i,
    ) as HTMLInputElement;
    await uploadFiles(filesInput, [
      jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json"),
    ]);

    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeDisabled();
    expect(screen.getByText(/64/)).toBeInTheDocument();
  });

  it("multi-file selection parses each file and shows the loaded-file count", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );

    const filesInput = screen.getByLabelText(
      /Individual files/i,
    ) as HTMLInputElement;
    await uploadFiles(filesInput, [
      jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json"),
      jsonFile(INDIVIDUAL_PAYLOAD_2, "person2.json"),
    ]);

    expect(screen.getByText(/2 files loaded/i)).toBeInTheDocument();
    expect(screen.getByText("person1.json")).toBeInTheDocument();
    expect(screen.getByText("person2.json")).toBeInTheDocument();
  });

  it("a malformed file among the selection shows a clear per-file error and blocks Preview", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );

    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });

    const filesInput = screen.getByLabelText(
      /Individual files/i,
    ) as HTMLInputElement;
    await uploadFiles(filesInput, [
      jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json"),
      badFile("broken.json"),
    ]);

    expect(screen.getByText(/broken\.json/)).toBeInTheDocument();
    expect(screen.getByText(/Could not parse/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeDisabled();
  });

  it("aggregate files are optional and validated only for JSON-parseability", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );

    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    await uploadFiles(
      screen.getByLabelText(/Individual files/i) as HTMLInputElement,
      [jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json")],
    );

    // Preview is enabled with NO aggregate file attached.
    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeEnabled();

    await uploadFiles(
      screen.getByLabelText(/Aggregate export/i) as HTMLInputElement,
      [jsonFile(AGGREGATE_PAYLOAD, "aggregate.json")],
    );

    expect(screen.getByText("aggregate.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeEnabled();
  });

  it("sends the exact preview body shape and renders summary/blocks/warnings from a mocked response", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );

    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    await uploadFiles(
      screen.getByLabelText(/Individual files/i) as HTMLInputElement,
      [jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json")],
    );
    await uploadFiles(
      screen.getByLabelText(/Aggregate export/i) as HTMLInputElement,
      [jsonFile(AGGREGATE_PAYLOAD, "aggregate.json")],
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        summary: {
          creates: 5,
          skips: 1,
          blocks: [],
          warnings: [
            { reason: "aggregate-cid-mismatch", detail: "cid does not match" },
          ],
          ignoredArtifacts: 1,
        },
        resolvedVersionId: "version-abc",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));

    await waitFor(() =>
      expect(screen.getByTestId("preview-panel")).toBeInTheDocument(),
    );

    const previewCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => url === "/api/admin/assessments/import",
    );
    expect(previewCall).toBeTruthy();
    const body = JSON.parse(previewCall![1].body);
    expect(body).toMatchObject({
      mode: "preview",
      kind: "restrictedResults",
      batchKind: "esperto-sufull-restricted-v1",
      roundLabel: "2025 Annual",
      targetOrgId: "org-1",
    });
    expect(body.files).toEqual([INDIVIDUAL_PAYLOAD_1]);
    expect(body.aggregateFiles).toEqual([AGGREGATE_PAYLOAD]);
    expect(body).not.toHaveProperty("payload");

    const panel = screen.getByTestId("preview-panel");
    expect(within(panel).getByText(/aggregate-cid-mismatch/i)).toBeInTheDocument();
  });

  it("commit sends expectedVersionId captured from preview, and renders each outcome.kind message", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );

    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    await uploadFiles(
      screen.getByLabelText(/Individual files/i) as HTMLInputElement,
      [jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json")],
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        summary: { creates: 1, skips: 0, blocks: [], warnings: [], ignoredArtifacts: 0 },
        resolvedVersionId: "version-xyz",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Commit$/i })).toBeEnabled(),
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        outcome: { kind: "created", campaignId: "camp-1", submissionsCreated: 1 },
        skippedArtifacts: 0,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Commit$/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );

    const commitCall = (global.fetch as jest.Mock).mock.calls
      .filter(([url]) => url === "/api/admin/assessments/import")
      .pop();
    const body = JSON.parse(commitCall![1].body);
    expect(body.mode).toBe("commit");
    expect(body.kind).toBe("restrictedResults");
    expect(body.expectedVersionId).toBe("version-xyz");

    const status = screen.getByRole("status");
    expect(
      within(status).getByText(/created a new imported round/i),
    ).toBeInTheDocument();
    expect(within(status).getByText(/1/)).toBeInTheDocument();
  });

  it("renders the reused-noop outcome in plain language", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );
    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    await uploadFiles(
      screen.getByLabelText(/Individual files/i) as HTMLInputElement,
      [jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json")],
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        summary: { creates: 1, skips: 0, blocks: [], warnings: [], ignoredArtifacts: 0 },
        resolvedVersionId: "version-xyz",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Commit$/i })).toBeEnabled(),
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        outcome: { kind: "reused-noop", campaignId: "camp-1" },
        skippedArtifacts: 0,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Commit$/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/already imported.*nothing changed/i),
    ).toBeInTheDocument();
  });

  it("renders the reused-appended outcome + skippedArtifacts count in plain language", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );
    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    await uploadFiles(
      screen.getByLabelText(/Individual files/i) as HTMLInputElement,
      [jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json")],
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        summary: { creates: 1, skips: 0, blocks: [], warnings: [], ignoredArtifacts: 0 },
        resolvedVersionId: "version-xyz",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Commit$/i })).toBeEnabled(),
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        outcome: { kind: "reused-appended", campaignId: "camp-1", submissionsCreated: 3 },
        skippedArtifacts: 2,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Commit$/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );
    const status = screen.getByRole("status");
    expect(
      within(status).getByText(/added.*new respondents.*existing round/i),
    ).toBeInTheDocument();
    expect(within(status).getByText(/3/)).toBeInTheDocument();
    expect(
      within(status).getByText(/2 aggregate file\(s\) were inspected but not imported/i),
    ).toBeInTheDocument();
  });

  it("a low-resolution-batch 409 on commit shows an ack checkbox + retry affordance, and retrying sends ackLowResolution:true", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );
    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    await uploadFiles(
      screen.getByLabelText(/Individual files/i) as HTMLInputElement,
      [jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json")],
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        summary: { creates: 1, skips: 0, blocks: [], warnings: [], ignoredArtifacts: 0 },
        resolvedVersionId: "version-xyz",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Commit$/i })).toBeEnabled(),
    );

    mockJsonResponse(false, 409, {
      success: false,
      error: "low-resolution-batch",
      message: "This batch covers a small share of the org's roster.",
      details: { resolvedCount: 1, rosterCount: 50 },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Commit$/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/small share of the org's roster/i),
      ).toBeInTheDocument(),
    );

    const ackCheckbox = screen.getByRole("checkbox", {
      name: /proceed anyway/i,
    });
    expect(ackCheckbox).toBeInTheDocument();
    fireEvent.click(ackCheckbox);

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        outcome: { kind: "created", campaignId: "camp-1", submissionsCreated: 1 },
        skippedArtifacts: 0,
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /retry with acknowledg/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );

    const retryCall = (global.fetch as jest.Mock).mock.calls
      .filter(([url]) => url === "/api/admin/assessments/import")
      .pop();
    const body = JSON.parse(retryCall![1].body);
    expect(body.ackLowResolution).toBe(true);
    expect(body.expectedVersionId).toBe("version-xyz");
  });

  it("maps a distinct commit error code (e.g. divergent-reimport) to a specific message, not a generic catch-all", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );
    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    await uploadFiles(
      screen.getByLabelText(/Individual files/i) as HTMLInputElement,
      [jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json")],
    );

    mockJsonResponse(true, 200, {
      success: true,
      data: {
        summary: { creates: 1, skips: 0, blocks: [], warnings: [], ignoredArtifacts: 0 },
        resolvedVersionId: "version-xyz",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Commit$/i })).toBeEnabled(),
    );

    mockJsonResponse(false, 409, {
      success: false,
      error: "divergent-reimport",
      message: "This batch conflicts with a previously imported round.",
      details: {},
    });
    fireEvent.click(screen.getByRole("button", { name: /^Commit$/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/conflicts with a previously imported round/i),
      ).toBeInTheDocument(),
    );
    // NOT the generic catch-all used by roster/results.
    expect(
      screen.queryByText(/^Commit request failed$/i),
    ).not.toBeInTheDocument();
  });

  it("switching kind away and back resets the batch-specific state", async () => {
    mockOrgsOk();
    render(<EspertoImportClient suFullImportEnabled />);
    selectSuFullKind();
    await waitFor(() =>
      screen.getByRole("option", { name: /Acme Corp/i }),
    );

    fireEvent.change(screen.getByLabelText(/Round label/i), {
      target: { value: "2025 Annual" },
    });
    fireEvent.change(screen.getByLabelText(/Target organization/i), {
      target: { value: "org-1" },
    });
    await uploadFiles(
      screen.getByLabelText(/Individual files/i) as HTMLInputElement,
      [jsonFile(INDIVIDUAL_PAYLOAD_1, "person1.json")],
    );
    expect(screen.getByText(/1 file loaded/i)).toBeInTheDocument();

    // Switch away to roster, then back to SU-Full.
    fireEvent.click(screen.getByRole("radio", { name: /Roster \(people\)/i }));
    selectSuFullKind();

    expect(
      (screen.getByLabelText(/Round label/i) as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText(/Target organization/i) as HTMLSelectElement)
        .value,
    ).toBe("");
    expect(screen.queryByText(/file loaded/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Preview$/i })).toBeDisabled();
  });
});
