/**
 * TDD Red Phase — ImportMembersModal tests.
 *
 * Test matrix:
 *  (1) Live preview parses pasted CSV — paste 3-row valid CSV; parsed-row count + table rows appear.
 *  (2) Errors block import — paste CSV with bad email; Import disabled + error listed.
 *  (3) Valid submit POSTs the right body — 2 valid rows, mode=merge → asserts URL + body shape.
 *  (4) Result summary — mock success response; summary text appears, onUpdated awaited before onClose.
 *  (5) Failure — mock { success:false, error:[{message}] }; specific message renders, modal stays open.
 *  (6) Empty paste — Import button disabled with no rows.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ImportMembersModal } from "@/components/organizations/import-members-modal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID   = "org-abc";
const ORG_NAME = "Acme Corp";

const VALID_CSV_3_ROWS =
  "name,email,team\n" +
  "Alice Smith,alice@example.com,Engineering\n" +
  "Bob Jones,bob@example.com,Engineering/Frontend\n" +
  "Carol White,carol@example.com,\n";

const VALID_CSV_2_ROWS =
  "name,email\n" +
  "Alice Smith,alice@example.com\n" +
  "Bob Jones,bob@example.com\n";

const CSV_WITH_BAD_EMAIL =
  "name,email\n" +
  "Alice Smith,alice@example.com\n" +
  "Bob Jones,not-an-email\n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ImportMembersModal>> = {}
) {
  const onClose    = jest.fn();
  const onUpdated  = jest.fn().mockResolvedValue(undefined);

  const defaults: React.ComponentProps<typeof ImportMembersModal> = {
    open:      true,
    onClose,
    onUpdated,
    orgId:     ORG_ID,
    orgName:   ORG_NAME,
  };
  const props = { ...defaults, ...overrides };
  render(<ImportMembersModal {...props} />);
  return {
    onClose:   props.onClose   as jest.Mock,
    onUpdated: props.onUpdated as jest.Mock,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = jest.fn();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ImportMembersModal", () => {
  /**
   * (1) Live preview parses pasted CSV — paste a 3-row valid CSV;
   *     assert the parsed-rows count + table rows.
   */
  test("(1) live preview parses pasted CSV and shows row count + table", async () => {
    renderModal();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: VALID_CSV_3_ROWS } });

    // "Parsed N rows" summary appears (3 data rows + possible empty trailing row = 3)
    await waitFor(() => {
      expect(screen.getByText(/parsed 3 rows/i)).toBeInTheDocument();
    });

    // Preview table shows the three names
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Carol White")).toBeInTheDocument();
  });

  /**
   * (2) Errors block import — paste a CSV with a bad email;
   *     assert Import button is disabled AND the error is listed.
   */
  test("(2) CSV with bad email disables Import and shows the error", async () => {
    renderModal();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: CSV_WITH_BAD_EMAIL } });

    await waitFor(() => {
      expect(screen.getByText(/1 error/i)).toBeInTheDocument();
    });

    // Import button is disabled because errors.length > 0
    const importBtn = screen.getByRole("button", { name: /import/i });
    expect(importBtn).toBeDisabled();

    // Error details mention the bad-email row
    expect(screen.getByText(/not a valid email/i)).toBeInTheDocument();
  });

  /**
   * (3) Valid submit POSTs the right body — paste 2 valid rows, pick merge,
   *     click Import; assert POST URL + body { rows: [...], mode: "merge" }.
   */
  test("(3) valid submit POSTs to the correct URL with rows + mode in the body", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { created: [{ id: "r1", email: "alice@example.com" }], updated: [], skipped: [], errors: [] },
      }),
    });

    renderModal();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: VALID_CSV_2_ROWS } });

    await waitFor(() => {
      expect(screen.getByText(/parsed 2 rows/i)).toBeInTheDocument();
    });

    // Change mode to merge
    fireEvent.click(screen.getByLabelText(/merge/i));

    fireEvent.click(screen.getByRole("button", { name: /import 2 respondents/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/organizations/${ORG_ID}/respondents/bulk`);

    const body = JSON.parse(init.body as string) as { rows: unknown[]; mode: string };
    expect(body.mode).toBe("merge");
    expect(body.rows).toHaveLength(2);
    // Each row must have name, email, teamPath
    const row0 = body.rows[0] as { name: string; email: string; teamPath: string[] };
    expect(row0.name).toBe("Alice Smith");
    expect(row0.email).toBe("alice@example.com");
    expect(row0.teamPath).toEqual([]);
  });

  /**
   * (4) Result summary — mock success response; summary text appears,
   *     onUpdated awaited before onClose.
   */
  test("(4) success: summary renders, onUpdated awaited before onClose", async () => {
    const onUpdatedMock = jest.fn().mockResolvedValue(undefined);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          created: [{ id: "r1", email: "alice@example.com" }],
          updated: [{ id: "r2", email: "bob@example.com" }],
          skipped: [],
          errors:  [],
        },
      }),
    });

    renderModal({ onUpdated: onUpdatedMock });

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: VALID_CSV_2_ROWS } });

    await waitFor(() => {
      expect(screen.getByText(/parsed 2 rows/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /import 2 respondents/i }));

    // Summary text must appear
    await waitFor(() => {
      expect(screen.getByText(/imported 2/i)).toBeInTheDocument();
    });

    // "1 created, 1 updated" details visible too
    expect(screen.getByText(/1 created/i)).toBeInTheDocument();
    expect(screen.getByText(/1 updated/i)).toBeInTheDocument();

    // onUpdated must have been called
    expect(onUpdatedMock).toHaveBeenCalled();

    // After the brief display delay, onClose fires
    // (advance timers past the ~1500ms display window)
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
  });

  /**
   * (5) Failure — mock { success:false, error:[{message}] };
   *     the specific message renders + modal stays open.
   */
  test("(5) server failure shows specific error and keeps modal open", async () => {
    const errMsg = "Row 2: email invalid";

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: [{ message: errMsg }],
      }),
    });

    const { onClose } = renderModal();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: VALID_CSV_2_ROWS } });

    await waitFor(() => {
      expect(screen.getByText(/parsed 2 rows/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /import 2 respondents/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(errMsg);
    });

    // Modal stays open
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * (6) Empty paste — Import disabled with no rows.
   */
  test("(6) empty textarea keeps Import button disabled", () => {
    renderModal();

    const importBtn = screen.getByRole("button", { name: /import/i });
    // No text pasted yet → button disabled
    expect(importBtn).toBeDisabled();
  });
});
