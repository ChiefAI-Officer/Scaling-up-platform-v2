/**
 * Wave T (spec 19t §T-3/§T-4, D8) — TemplateEditorTabbed save path via
 * buildQuestionsPayload.
 *
 * - New question added while unlocked gets a slug key derived AT SAVE
 *   (section prefix + lower_snake(label)) and a per-type payload (no
 *   `scale` on TEXT rows).
 * - Serializer guard violations (MULTI_CHOICE with zero options) surface
 *   as a destructive toast and NO version PATCH is dispatched.
 * - assignedKeys are applied back to state after a successful save (the
 *   key badge appears in the question list).
 * - Duplicating a MULTI_CHOICE marks all copied options isNew:true so a
 *   save does not trip INHERITED_OPTION_KEY_MUTATED.
 */

import React from "react";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ────────────────────────────────────────────────────────────────────────
// Mocks (same pattern as TemplateEditorTabbed.test.tsx)
// ────────────────────────────────────────────────────────────────────────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const replaceMock = jest.fn();
const refreshMock = jest.fn();
const pushMock = jest.fn();

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));

const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
});

beforeEach(() => {
  toastMock.mockClear();
  replaceMock.mockClear();
  refreshMock.mockClear();
  pushMock.mockClear();
  (window.confirm as jest.Mock).mockClear();
  (window.confirm as jest.Mock).mockImplementation(() => true);
  mockSearchParams = new URLSearchParams("tab=questions");
});

afterEach(() => {
  cleanup();
});

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

function installFetchMock(): jest.Mock {
  const fetchMock = jest.fn(async () => makeJsonResponse({ success: true }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function versionPatchCalls(fetchMock: jest.Mock): unknown[][] {
  return fetchMock.mock.calls.filter(
    (c: unknown[]) =>
      String(c[0]).includes("/versions/ver_2") &&
      !String(c[0]).includes("/publish"),
  );
}

function lastVersionPatchBody(fetchMock: jest.Mock): {
  questions?: Array<Record<string, unknown>>;
} {
  const calls = versionPatchCalls(fetchMock);
  const init = calls[calls.length - 1][1] as RequestInit;
  return JSON.parse(String(init.body)) as {
    questions?: Array<Record<string, unknown>>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────
const baseTemplate = {
  id: "tpl_1",
  name: "Leadership Vision Alignment",
  alias: "LVA",
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

const sectionsFixture = [
  { stableKey: "P1_x", name: "Part 1", description: "" },
];

const sliderQuestion = {
  stableKey: "P1_rating",
  sectionStableKey: "P1_x",
  label: "Rate the quarter",
  type: "SLIDER_LIKERT",
  isRequired: true,
  sortOrder: 1,
  scale: { min: 0, max: 10, step: 1, anchorMin: "Poor", anchorMax: "Great" },
};

const multiChoiceQuestion = {
  stableKey: "P1_pick",
  sectionStableKey: "P1_x",
  label: "Pick some obstacles",
  type: "MULTI_CHOICE",
  isRequired: true,
  sortOrder: 2,
  options: [
    { key: "alpha", label: "Alpha" },
    { key: "beta", label: "Beta" },
  ],
  maxChoices: 2,
};

function makeDraftVersion(questions: unknown[]): {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: null;
  contentHash: string;
  questions: unknown[];
  sections: unknown[];
  scoringConfig: Record<string, unknown>;
  reportConfig: null;
} {
  return {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
    contentHash: "abcdef",
    questions,
    sections: sectionsFixture,
    scoringConfig: {},
    reportConfig: null,
  };
}

const allVersions = [
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
    contentHash: "abcdef",
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────
describe("TemplateEditorTabbed — Wave T save path", () => {
  it("adding a question while unlocked derives its key at save (P1_top_priorities) with NO scale on a TEXT row, then applies the key to state", async () => {
    const fetchMock = installFetchMock();
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={makeDraftVersion([sliderQuestion])}
        allVersions={allVersions}
        questionEditorUnlocked
        publishedQuestionKeys={["P1_rating"]}
        publishedOptionKeys={{}}
      />,
    );

    // Add a question in section P1_x.
    const list = screen.getByTestId("questions-question-list");
    act(() => {
      fireEvent.click(
        within(list).getByRole("button", { name: /^\+ Add Question$/ }),
      );
    });

    // Focus the new card (the one showing "(assigned on save)").
    const newCard = within(list)
      .getAllByTestId(/^question-card-/)
      .find((c) => c.textContent?.includes("(assigned on save)"));
    expect(newCard).toBeTruthy();
    act(() => {
      fireEvent.click(within(newCard!).getByRole("button", { name: /^Edit$/ }));
    });

    // Label + retype to TEXT while new-to-draft.
    const form = screen.getByTestId("questions-config-form");
    act(() => {
      fireEvent.change(within(form).getByLabelText("Label"), {
        target: { value: "Top Priorities" },
      });
    });
    act(() => {
      fireEvent.change(within(form).getByLabelText("Question Type"), {
        target: { value: "TEXT" },
      });
    });

    // Save Draft.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }));
    });

    await waitFor(() => {
      expect(versionPatchCalls(fetchMock).length).toBe(1);
    });
    const body = lastVersionPatchBody(fetchMock);
    const newRow = body.questions!.find(
      (q) => q.stableKey === "P1_top_priorities",
    );
    expect(newRow).toBeTruthy();
    expect(newRow!.type).toBe("TEXT");
    expect(newRow!.label).toBe("Top Priorities");
    expect("scale" in newRow!).toBe(false);
    expect("options" in newRow!).toBe(false);

    // The inherited slider row still carries its scale.
    const sliderRow = body.questions!.find(
      (q) => q.stableKey === "P1_rating",
    );
    expect(sliderRow!.scale).toEqual(sliderQuestion.scale);

    // assignedKeys applied to state — the key badge appears in the list.
    await waitFor(() => {
      expect(
        screen.getByTestId("question-card-P1_top_priorities"),
      ).toBeInTheDocument();
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Draft saved" }),
    );
  });

  it("serializer guard (MULTI_CHOICE with zero options) → destructive toast, NO version PATCH", async () => {
    const fetchMock = installFetchMock();
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={makeDraftVersion([
          { ...multiChoiceQuestion, options: [], maxChoices: null },
        ])}
        allVersions={allVersions}
        questionEditorUnlocked
        publishedQuestionKeys={[]}
        publishedOptionKeys={{}}
      />,
    );

    // Dirty the questions surface (edit the label).
    const form = screen.getByTestId("questions-config-form");
    act(() => {
      fireEvent.change(within(form).getByLabelText("Label"), {
        target: { value: "Pick some obstacles (edited)" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }));
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not save draft",
        variant: "destructive",
        description: expect.stringMatching(/at least one option/i),
      }),
    );
    expect(versionPatchCalls(fetchMock).length).toBe(0);
  });

  it("duplicating a MULTI_CHOICE copies options with isNew semantics that survive a save", async () => {
    const fetchMock = installFetchMock();
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={makeDraftVersion([multiChoiceQuestion])}
        allVersions={allVersions}
        questionEditorUnlocked
        publishedQuestionKeys={["P1_pick"]}
        publishedOptionKeys={{ P1_pick: ["alpha", "beta"] }}
      />,
    );

    const list = screen.getByTestId("questions-question-list");
    act(() => {
      fireEvent.click(
        within(list).getByRole("button", { name: /^Duplicate$/ }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }));
    });

    // NO INHERITED_OPTION_KEY_MUTATED — the save went through.
    await waitFor(() => {
      expect(versionPatchCalls(fetchMock).length).toBe(1);
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Draft saved" }),
    );

    const body = lastVersionPatchBody(fetchMock);
    const mcRows = body.questions!.filter((q) => q.type === "MULTI_CHOICE");
    expect(mcRows.length).toBe(2);
    // The copy got a fresh derived key (label collision with the original
    // section prefix path resolves cleanly) and kept the option keys.
    const copy = mcRows.find((q) => q.stableKey !== "P1_pick")!;
    expect(copy).toBeTruthy();
    expect(String(copy.stableKey)).toMatch(/^P1_/);
    expect(copy.options).toEqual([
      { key: "alpha", label: "Alpha" },
      { key: "beta", label: "Beta" },
    ]);
  });

  it("flag off (default) — add still generates a Q_NEW_ key immediately", () => {
    installFetchMock();
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={makeDraftVersion([sliderQuestion])}
        allVersions={allVersions}
      />,
    );

    const list = screen.getByTestId("questions-question-list");
    act(() => {
      fireEvent.click(
        within(list).getByRole("button", { name: /^\+ Add Question$/ }),
      );
    });

    const newCard = within(list)
      .getAllByTestId(/^question-card-/)
      .find((c) => (c.getAttribute("data-testid") ?? "").includes("Q_NEW_"));
    expect(newCard).toBeTruthy();
  });

  it("a later save with questions NOT dirty does not drop questions persisted by an earlier save (raw-ref sync, adversarial-review fix)", async () => {
    const fetchMock = installFetchMock();
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={makeDraftVersion([sliderQuestion])}
        allVersions={allVersions}
        questionEditorUnlocked
        publishedQuestionKeys={["P1_rating"]}
        publishedOptionKeys={{}}
      />,
    );

    // Save 1 — add a TEXT question.
    const list = screen.getByTestId("questions-question-list");
    act(() => {
      fireEvent.click(
        within(list).getByRole("button", { name: /^\+ Add Question$/ }),
      );
    });
    const newCard = within(list)
      .getAllByTestId(/^question-card-/)
      .find((c) => c.textContent?.includes("(assigned on save)"));
    act(() => {
      fireEvent.click(within(newCard!).getByRole("button", { name: /^Edit$/ }));
    });
    const form = screen.getByTestId("questions-config-form");
    act(() => {
      fireEvent.change(within(form).getByLabelText("Label"), {
        target: { value: "Top Priorities" },
      });
    });
    act(() => {
      fireEvent.change(within(form).getByLabelText("Question Type"), {
        target: { value: "TEXT" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }));
    });
    await waitFor(() => {
      expect(versionPatchCalls(fetchMock).length).toBe(1);
    });
    expect(lastVersionPatchBody(fetchMock).questions).toHaveLength(2);

    // Save 2 — dirty ONLY the version surface (language) on the Metadata tab.
    // The component re-syncs activeTab from the URL on every render, so the
    // mocked search params must agree with the tab we activate (otherwise
    // the sync effect snaps straight back to ?tab=questions).
    mockSearchParams = new URLSearchParams("tab=metadata");
    const metaTab = screen.getByRole("tab", { name: /^Metadata$/ });
    act(() => {
      fireEvent.mouseDown(metaTab);
      fireEvent.focus(metaTab);
      fireEvent.click(metaTab);
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("Language (this version)"), {
        target: { value: "en-GB" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }));
    });
    await waitFor(() => {
      expect(versionPatchCalls(fetchMock).length).toBe(2);
    });

    // Without the raw-ref sync, this second (questions-not-dirty) PATCH
    // would pass the page-load rows through and silently delete
    // P1_top_priorities.
    const body2 = lastVersionPatchBody(fetchMock);
    expect(body2.questions).toHaveLength(2);
    expect(
      body2.questions!.map((q) => q.stableKey),
    ).toEqual(expect.arrayContaining(["P1_rating", "P1_top_priorities"]));
  });

  it("renaming an option label after a save keeps the option's persisted key (post-save option sync, adversarial-review fix)", async () => {
    const fetchMock = installFetchMock();
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={makeDraftVersion([sliderQuestion])}
        allVersions={allVersions}
        questionEditorUnlocked
        publishedQuestionKeys={["P1_rating"]}
        publishedOptionKeys={{}}
      />,
    );

    // Add a MULTI_CHOICE with one option "Cash" and save (key derives to "cash").
    const list = screen.getByTestId("questions-question-list");
    act(() => {
      fireEvent.click(
        within(list).getByRole("button", { name: /^\+ Add Question$/ }),
      );
    });
    const newCard = within(list)
      .getAllByTestId(/^question-card-/)
      .find((c) => c.textContent?.includes("(assigned on save)"));
    act(() => {
      fireEvent.click(within(newCard!).getByRole("button", { name: /^Edit$/ }));
    });
    const form = screen.getByTestId("questions-config-form");
    act(() => {
      fireEvent.change(within(form).getByLabelText("Label"), {
        target: { value: "Obstacles" },
      });
    });
    act(() => {
      fireEvent.change(within(form).getByLabelText("Question Type"), {
        target: { value: "MULTI_CHOICE" },
      });
    });
    act(() => {
      fireEvent.click(screen.getByTestId("q-option-add"));
    });
    act(() => {
      fireEvent.change(screen.getByTestId("q-option-label-0"), {
        target: { value: "Cash" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }));
    });
    await waitFor(() => {
      expect(versionPatchCalls(fetchMock).length).toBe(1);
    });
    const row1 = lastVersionPatchBody(fetchMock).questions!.find(
      (q) => q.stableKey === "P1_obstacles",
    )!;
    expect(row1.options).toEqual([{ key: "cash", label: "Cash" }]);

    // Rename the option label and save again — the key must NOT re-derive.
    act(() => {
      fireEvent.change(screen.getByTestId("q-option-label-0"), {
        target: { value: "Cash flow" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save Draft/ }));
    });
    await waitFor(() => {
      expect(versionPatchCalls(fetchMock).length).toBe(2);
    });
    const row2 = lastVersionPatchBody(fetchMock).questions!.find(
      (q) => q.stableKey === "P1_obstacles",
    )!;
    expect(row2.options).toEqual([{ key: "cash", label: "Cash flow" }]);
  });
});
