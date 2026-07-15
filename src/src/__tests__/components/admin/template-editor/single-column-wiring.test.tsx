/**
 * ED6 Task 14 — the single-column surface's OWN interaction contract (co-validate
 * C5: do NOT cross-assert DOM against legacy). Proves (a) structural mutations
 * dirty the shared model + persist through the reused Save, and (b) an author edit
 * reaches the save PAYLOAD (payload parity, not DOM parity). Affordance→command
 * dispatch is covered per-affordance by the T7/T8/T11/T12 suites.
 */
import { render, screen, fireEvent, act, within, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
const mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({
    get: (k: string) => mockSearchParams.get(k),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));
jest.mock("@/components/admin/template-editor/sections-serialization", () => {
  const actual = jest.requireActual(
    "@/components/admin/template-editor/sections-serialization",
  );
  let n = 0;
  return { ...actual, genUid: jest.fn(() => `uid-${++n}`) };
});

interface FetchCall {
  method: string;
  url: string;
  body: string | null;
}
let calls: FetchCall[] = [];
const originalFetch = global.fetch;
const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
  global.fetch = originalFetch;
});
beforeEach(() => {
  toastMock.mockClear();
  calls = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: typeof input === "string" ? input : String(input),
      body: init?.body != null ? String(init.body) : null,
    });
    return {
      ok: true,
      status: 200,
      async json() {
        return { success: true };
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => cleanup());

function props() {
  return {
    template: {
      id: "tpl_1",
      name: "Alpha",
      alias: "ALPHA",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "en-US",
      publishedAt: null,
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "Financials" }],
      questions: [
        {
          stableKey: "S1_rev",
          sectionStableKey: "S1",
          label: "Revenue",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: [
      { id: "ver_2", versionNumber: 2, language: "en-US", publishedAt: null, contentHash: "abcdef012345" },
    ],
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    waveQEnabled: true,
    questionEditorUnlocked: true,
    findingsEnabled: true,
    conditionalAuthoringEnabled: true,
    testModeEnabled: true,
    safeToPublishEnabled: true,
    singleColumnEnabled: true,
  };
}

function saveBtn() {
  return screen.getByTestId("template-editor-save-draft-btn") as HTMLButtonElement;
}

describe("SingleColumnFormBuilder wiring contract (ED6 T14)", () => {
  it("starts clean (Save disabled); adding a question dirties it (Save enabled)", () => {
    render(<TemplateEditorTabbed {...props()} />);
    expect(saveBtn()).toBeDisabled();
    fireEvent.click(screen.getByTestId("sc-section-add-q-S1"));
    expect(
      within(screen.getByTestId("sc-section-S1")).queryAllByTestId((id) =>
        id.startsWith("question-card-"),
      ).length,
    ).toBe(2);
    expect(saveBtn()).toBeEnabled();
  });

  it("an author edit reaches the save PAYLOAD (payload parity, C5)", async () => {
    render(<TemplateEditorTabbed {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    fireEvent.change(screen.getByDisplayValue("Revenue"), {
      target: { value: "Total revenue" },
    });
    await act(async () => {
      fireEvent.click(saveBtn());
    });
    // A PATCH carrying the new label was emitted (single-column mutations flow
    // through the same buildVersionScoringPayload save path).
    expect(calls.some((c) => c.method === "PATCH" && c.body?.includes("Total revenue"))).toBe(true);
  });
});
