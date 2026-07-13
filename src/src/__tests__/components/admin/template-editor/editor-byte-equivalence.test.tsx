/**
 * ED3 — Golden byte-equivalence guard for TemplateEditorTabbed.
 *
 * SAFETY NET for the Wave-ED3 refactor (extract the editor's state + save
 * logic into headless hooks — a mechanical lift with ZERO intended behavior
 * change). This suite captures the CURRENT editor's EXACT outgoing HTTP
 * behavior (method + url + raw request-body STRING, in order) plus the
 * derived state for scripted edits, and freezes it as a golden master. It
 * must stay byte-green through the whole refactor: any change to which
 * fetches fire, their order, or the serialized bodies is a regression.
 *
 * Methodology: golden master. The expected body STRINGS below are the CURRENT
 * shipped serializer output (question-serialization.ts / sections-
 * serialization.ts, assembled by build-version-payload.ts and dispatched by
 * handleSaveDraft). They are deterministic because the emitted PATCH payload
 * never contains a uid or timestamp (verified at question-serialization.ts
 * :514-553) — only stableKeys, which the fixtures pin.
 *
 * genUid is mocked to a deterministic counter (belt-and-suspenders; see the
 * jest.mock note below — hydration uses the module-internal genUid, but no
 * assertion keys off a uid).
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
// Mocks — same harness as TemplateEditorTabbed.test.tsx / *.wave-t.test.tsx
// ────────────────────────────────────────────────────────────────────────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const replaceMock = jest.fn();
const refreshMock = jest.fn();
const pushMock = jest.fn();

const PATHNAME = "/admin/assessments/templates/tpl_1/versions/ver_2/edit";
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
  usePathname: () => PATHNAME,
}));

// Deterministic genUid. NOTE: `genUid` is imported into TemplateEditorTabbed
// from sections-serialization and called directly when the editor CREATES new
// rows at runtime (new section / new question / duplicated question), so this
// mock pins those uids. `hydrateSectionsFromJson` / QuestionsTab hydration
// call a module-internal genUid the export-mock can't reach, so initial
// hydrated uids stay random — but no assertion keys off a uid (new-question
// cards are located by "(assigned on save)" text or by post-save stableKey).
let mockUidCounter = 0;
jest.mock(
  "@/components/admin/template-editor/sections-serialization",
  () => {
    const actual = jest.requireActual(
      "@/components/admin/template-editor/sections-serialization",
    );
    return {
      ...actual,
      genUid: jest.fn(() => `uid-${++mockUidCounter}`),
    };
  },
);

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
  mockSearchParams = new URLSearchParams("");
  mockUidCounter = 0;
});

afterEach(() => {
  cleanup();
});

// ────────────────────────────────────────────────────────────────────────
// Fetch transcript recorder
// ────────────────────────────────────────────────────────────────────────
interface FetchCall {
  method: string;
  url: string;
  /** RAW string passed to fetch (never JSON.parse'd — asserted verbatim). */
  body: string | null;
}

interface Responder {
  (call: FetchCall & { callIndex: number }): {
    ok?: boolean;
    status?: number;
    json: unknown;
  };
}

function jsonResponse(json: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return json;
    },
  } as unknown as Response;
}

function installFetch(responder?: Responder): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  global.fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method ?? "GET";
      const body = init?.body != null ? String(init.body) : null;
      const call: FetchCall = { method, url, body };
      calls.push(call);
      if (responder) {
        const r = responder({ ...call, callIndex: calls.length - 1 });
        return jsonResponse(r.json, r.status ?? (r.ok === false ? 500 : 200));
      }
      return jsonResponse({ success: true });
    },
  ) as unknown as typeof fetch;
  return { calls };
}

const isVersionPatch = (c: FetchCall) =>
  c.url === "/api/admin/assessment-templates/tpl_1/versions/ver_2" &&
  c.method === "PATCH";

// A deferred promise so a save can be held mid-flight (double-save guard test).
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// ────────────────────────────────────────────────────────────────────────
// Fixtures — all three render with EVERY editor flag ON + a DRAFT version.
// ────────────────────────────────────────────────────────────────────────
const ALL_FLAGS = {
  waveQEnabled: true,
  questionEditorUnlocked: true,
  findingsEnabled: true,
  conditionalAuthoringEnabled: true,
  testModeEnabled: true,
  safeToPublishEnabled: true,
} as const;

const allVersionsMeta = [
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
    contentHash: "abcdef012345",
  },
];

// ── Fixture (a): slider-heavy — 3 SLIDER_LIKERT across 2 sections ──
function fixtureA() {
  return {
    template: {
      id: "tpl_1",
      name: "Alpha Template",
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
      sections: [
        { stableKey: "S1", name: "Section One" },
        { stableKey: "S2", name: "Section Two" },
      ],
      questions: [
        {
          stableKey: "S1_q1",
          sectionStableKey: "S1",
          label: "Q1 label",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
        {
          stableKey: "S1_q2",
          sectionStableKey: "S1",
          label: "Q2 label",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 2,
          scale: { min: 0, max: 5, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
        {
          stableKey: "S2_q3",
          sectionStableKey: "S2",
          label: "Q3 label",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 1,
          scale: {
            min: 0,
            max: 3,
            step: 1,
            anchorMin: "Not true",
            anchorMax: "Completely true",
          },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: allVersionsMeta,
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    ...ALL_FLAGS,
  };
}

// ── Fixture (b): a MULTI_CHOICE question with options ──
function fixtureB() {
  return {
    template: {
      id: "tpl_1",
      name: "Beta Template",
      alias: "BETA",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "en-US",
      publishedAt: null,
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "Only Section" }],
      questions: [
        {
          stableKey: "S1_pick",
          sectionStableKey: "S1",
          label: "Pick",
          type: "MULTI_CHOICE",
          isRequired: true,
          sortOrder: 1,
          options: [
            { key: "a", label: "Alpha" },
            { key: "b", label: "Beta" },
          ],
          maxChoices: 2,
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: allVersionsMeta,
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    ...ALL_FLAGS,
  };
}

// ── Fixture (c): TEXT + NUMBER mix ──
function fixtureC() {
  return {
    template: {
      id: "tpl_1",
      name: "Gamma Template",
      alias: "GAMMA",
      aggregationMode: "CEO_ONLY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "en-US",
      publishedAt: null,
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "Mix Section" }],
      questions: [
        {
          stableKey: "S1_notes",
          sectionStableKey: "S1",
          label: "Notes",
          type: "TEXT",
          isRequired: false,
          sortOrder: 1,
        },
        {
          stableKey: "S1_count",
          sectionStableKey: "S1",
          label: "Count",
          type: "NUMBER",
          isRequired: true,
          sortOrder: 2,
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: allVersionsMeta,
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    ...ALL_FLAGS,
  };
}

// ── Reorder fixture: two SLIDER questions in one section (drag-reorder) ──
function fixtureReorder() {
  return {
    template: {
      id: "tpl_1",
      name: "Reorder Template",
      alias: "REORD",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "en-US",
      publishedAt: null,
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "S1" }],
      questions: [
        {
          stableKey: "S1_a",
          sectionStableKey: "S1",
          label: "A",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
        },
        {
          stableKey: "S1_b",
          sectionStableKey: "S1",
          label: "B",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 2,
          scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: allVersionsMeta,
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    ...ALL_FLAGS,
  };
}

// ────────────────────────────────────────────────────────────────────────
// @dnd-kit keyboard-reorder enablement (jsdom has no layout). Give each
// question-card <li> a distinct vertical slot by its index among sibling
// cards, polyfill ResizeObserver (dnd-kit measures through it), and use fake
// timers (dnd-kit schedules the keyboard move on a timer). This is the ONLY
// way to drive a REAL question reorder — handleReorderQuestions — at the
// component's public surface. Verified: the drop actually swaps the rows.
function installDndLayout(): () => void {
  const origRect = Element.prototype.getBoundingClientRect;
  const hadRO = "ResizeObserver" in globalThis;
  const origRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  Element.prototype.getBoundingClientRect = function () {
    const el = this as HTMLElement;
    const tid = el.getAttribute?.("data-testid") ?? "";
    if (tid.startsWith("question-card-")) {
      const parent = el.parentElement;
      const sibs = parent
        ? Array.from(parent.children).filter((c) =>
            (c.getAttribute("data-testid") ?? "").startsWith("question-card-"),
          )
        : [el];
      const top = sibs.indexOf(el) * 60;
      return {
        top,
        bottom: top + 50,
        left: 0,
        right: 200,
        width: 200,
        height: 50,
        x: 0,
        y: top,
        toJSON() {},
      } as DOMRect;
    }
    return {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = origRect;
    if (hadRO) {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = origRO;
    } else {
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    }
  };
}

// ────────────────────────────────────────────────────────────────────────
// Interaction helpers
// ────────────────────────────────────────────────────────────────────────
function switchTab(name: RegExp, tabParam: string) {
  mockSearchParams = new URLSearchParams(tabParam ? `tab=${tabParam}` : "");
  const tab = screen.getByRole("tab", { name });
  act(() => {
    fireEvent.mouseDown(tab);
    fireEvent.focus(tab);
    fireEvent.click(tab);
  });
}

function saveBtn(): HTMLButtonElement {
  return screen.getByTestId("template-editor-save-draft-btn") as HTMLButtonElement;
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(saveBtn());
  });
}

// ────────────────────────────────────────────────────────────────────────
// GOLDEN expected request bodies (frozen from current shipped serializers)
// ────────────────────────────────────────────────────────────────────────
const META_BODY_A =
  '{"name":"Alpha Renamed","description":null,"invitationSubject":"","invitationBodyMarkdown":"","aggregationMode":"FULL_VISIBILITY","resultsEmailSubject":null,"resultsEmailBodyMarkdown":null,"resultsEmailContentApproved":false}';

const VERSION_BODY_A =
  '{"questions":[' +
  '{"stableKey":"S1_q1","sectionStableKey":"S1","label":"Q1 label","type":"SLIDER_LIKERT","isRequired":true,"sortOrder":1,"scale":{"min":0,"max":10,"step":1,"anchorMin":"Low","anchorMax":"High"},"recommendations":[{"minScore":0,"maxScore":10,"text":"Great"}]},' +
  '{"stableKey":"S1_q2","sectionStableKey":"S1","label":"Q2 label","type":"SLIDER_LIKERT","isRequired":true,"sortOrder":2,"scale":{"min":0,"max":5,"step":1,"anchorMin":"Low","anchorMax":"High"}},' +
  '{"stableKey":"S2_q3","sectionStableKey":"S2","label":"Q3 label","type":"SLIDER_LIKERT","isRequired":true,"sortOrder":1,"scale":{"min":0,"max":3,"step":1,"anchorMin":"Not true","anchorMax":"Completely true"}},' +
  '{"stableKey":"S1_added_slider","sectionStableKey":"S1","sortOrder":3,"type":"SLIDER_LIKERT","label":"Added Slider","isRequired":true,"scale":{"min":0,"max":3,"step":1,"anchorMin":"Not true","anchorMax":"Completely true"}}' +
  '],"sections":[' +
  '{"stableKey":"S2","name":"Section Two","sortOrder":1},' +
  '{"stableKey":"S1","name":"Section One","sortOrder":2}' +
  '],"scoringConfig":{},"reportConfig":null}';

const META_BODY_B =
  '{"name":"Beta Renamed","description":null,"invitationSubject":"","invitationBodyMarkdown":"","aggregationMode":"FULL_VISIBILITY","resultsEmailSubject":null,"resultsEmailBodyMarkdown":null,"resultsEmailContentApproved":false}';

const VERSION_BODY_B =
  '{"questions":[' +
  '{"stableKey":"S1_pick","sectionStableKey":"S1","label":"Pick edited","type":"MULTI_CHOICE","isRequired":true,"sortOrder":1,"options":[{"key":"a","label":"Alpha"},{"key":"b","label":"Beta"}],"maxChoices":2}' +
  '],"sections":[{"stableKey":"S1","name":"Only Section"}],"scoringConfig":{},"reportConfig":null}';

const META_BODY_C =
  '{"name":"Gamma Renamed","description":null,"invitationSubject":"","invitationBodyMarkdown":"","aggregationMode":"CEO_ONLY","resultsEmailSubject":null,"resultsEmailBodyMarkdown":null,"resultsEmailContentApproved":false}';

const VERSION_BODY_C =
  '{"questions":[' +
  '{"stableKey":"S1_notes","sectionStableKey":"S1","label":"Notes edited","type":"TEXT","isRequired":false,"sortOrder":1},' +
  '{"stableKey":"S1_count","sectionStableKey":"S1","label":"Count","type":"NUMBER","isRequired":true,"sortOrder":2}' +
  '],"sections":[{"stableKey":"S1","name":"Mix Section"}],"scoringConfig":{},"reportConfig":null}';

// Reorder: drag S1_a below S1_b. handleReorderQuestions reassigns sortOrder by
// new position (S1_b→1, S1_a→2) but preserves the `questions` STATE array
// order, so the emitted array stays [S1_a, S1_b] with the swapped sortOrders.
const VERSION_BODY_REORDER =
  '{"questions":[' +
  '{"stableKey":"S1_a","sectionStableKey":"S1","label":"A","type":"SLIDER_LIKERT","isRequired":true,"sortOrder":2,"scale":{"min":0,"max":3,"step":1,"anchorMin":"lo","anchorMax":"hi"}},' +
  '{"stableKey":"S1_b","sectionStableKey":"S1","label":"B","type":"SLIDER_LIKERT","isRequired":true,"sortOrder":1,"scale":{"min":0,"max":3,"step":1,"anchorMin":"lo","anchorMax":"hi"}}' +
  '],"sections":[{"stableKey":"S1","name":"S1"}],"scoringConfig":{},"reportConfig":null}';

// ════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════
describe("editor byte-equivalence guard", () => {
  it("renders the editor with all flags on and a DRAFT version (smoke)", () => {
    installFetch();
    render(<TemplateEditorTabbed {...fixtureA()} />);
    expect(
      screen.getByRole("heading", { name: /Alpha Template/ }),
    ).toBeInTheDocument();
    expect(saveBtn()).toBeInTheDocument();
    // A draft is editable: Save Draft starts disabled (nothing dirty yet).
    expect(saveBtn()).toBeDisabled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Happy-path full transcript — fixture (a)
  // ──────────────────────────────────────────────────────────────────────
  it("fixture (a): name + add-question + finding-bands + section-reorder → exact metadata-then-version transcript + post-save reconciliation", async () => {
    const { calls } = installFetch();
    render(<TemplateEditorTabbed {...fixtureA()} />);

    // Nothing dirty → Save disabled.
    expect(saveBtn()).toBeDisabled();

    // (1) Edit template name (Metadata tab is active by default).
    act(() => {
      fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: "Alpha Renamed" },
      });
    });
    // A dirty surface enables Save.
    expect(saveBtn()).not.toBeDisabled();

    // (2) Reorder sections via the Move buttons on the Sections tab.
    switchTab(/^Sections$/, "sections");
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /^Move down S1$/ }),
      );
    });

    // (3) Questions tab — select S1, add a question, set its label.
    switchTab(/^Questions$/, "questions");
    act(() => {
      fireEvent.click(screen.getByTestId("section-nav-item-S1"));
    });
    const list = screen.getByTestId("questions-question-list");
    act(() => {
      fireEvent.click(
        within(list).getByRole("button", { name: /^\+ Add Question$/ }),
      );
    });
    const newCard = within(list)
      .getAllByTestId(/^question-card-/)
      .find((c) => c.textContent?.includes("(assigned on save)"));
    expect(newCard).toBeTruthy();
    act(() => {
      fireEvent.click(within(newCard!).getByRole("button", { name: /^Edit$/ }));
    });
    act(() => {
      fireEvent.change(
        within(screen.getByTestId("questions-config-form")).getByLabelText(
          "Label",
        ),
        { target: { value: "Added Slider" } },
      );
    });

    // (4) Edit finding bands on the existing slider S1_q1.
    const q1Card = within(list).getByTestId("question-card-S1_q1");
    act(() => {
      fireEvent.click(within(q1Card).getByRole("button", { name: /^Edit$/ }));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("q-findings-toggle"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("q-finding-band-add"));
    });
    act(() => {
      fireEvent.change(screen.getByTestId("q-finding-band-min-0"), {
        target: { value: "0" },
      });
    });
    act(() => {
      fireEvent.change(screen.getByTestId("q-finding-band-max-0"), {
        target: { value: "10" },
      });
    });
    act(() => {
      fireEvent.change(screen.getByTestId("q-finding-band-text-0"), {
        target: { value: "Great" },
      });
    });

    // (5) Save Draft.
    await clickSave();

    // ── Transcript: exactly [metadata PATCH, version PATCH] in that order ──
    await waitFor(() => {
      expect(calls.length).toBe(2);
    });
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("/api/admin/assessment-templates/tpl_1");
    expect(calls[0].body).toBe(META_BODY_A);

    expect(calls[1].method).toBe("PATCH");
    expect(calls[1].url).toBe(
      "/api/admin/assessment-templates/tpl_1/versions/ver_2",
    );
    expect(calls[1].body).toBe(VERSION_BODY_A);

    // ── Post-save reconciliation: the new question's slug-derived stableKey
    //    is applied to state (assert by stableKey, never uid). ──
    await waitFor(() => {
      expect(
        within(screen.getByTestId("questions-question-list")).getByTestId(
          "question-card-S1_added_slider",
        ),
      ).toBeInTheDocument();
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Draft saved" }),
    );

    // Dirty cleared on success → Save disabled again.
    await waitFor(() => {
      expect(saveBtn()).toBeDisabled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Core transcript — fixture (b): MULTI_CHOICE
  // ──────────────────────────────────────────────────────────────────────
  it("fixture (b): rename + MULTI_CHOICE label edit → exact metadata-then-version transcript (options+maxChoices serialized)", async () => {
    const { calls } = installFetch();
    render(<TemplateEditorTabbed {...fixtureB()} />);

    act(() => {
      fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: "Beta Renamed" },
      });
    });

    switchTab(/^Questions$/, "questions");
    act(() => {
      fireEvent.change(
        within(screen.getByTestId("questions-config-form")).getByLabelText(
          "Label",
        ),
        { target: { value: "Pick edited" } },
      );
    });

    await clickSave();

    await waitFor(() => {
      expect(calls.length).toBe(2);
    });
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      url: "/api/admin/assessment-templates/tpl_1",
    });
    expect(calls[0].body).toBe(META_BODY_B);
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      url: "/api/admin/assessment-templates/tpl_1/versions/ver_2",
    });
    expect(calls[1].body).toBe(VERSION_BODY_B);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Core transcript — fixture (c): TEXT + NUMBER
  // ──────────────────────────────────────────────────────────────────────
  it("fixture (c): rename + TEXT label edit → exact transcript (TEXT/NUMBER rows carry NO scale/options)", async () => {
    const { calls } = installFetch();
    render(<TemplateEditorTabbed {...fixtureC()} />);

    act(() => {
      fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: "Gamma Renamed" },
      });
    });

    switchTab(/^Questions$/, "questions");
    act(() => {
      fireEvent.change(
        within(screen.getByTestId("questions-config-form")).getByLabelText(
          "Label",
        ),
        { target: { value: "Notes edited" } },
      );
    });

    await clickSave();

    await waitFor(() => {
      expect(calls.length).toBe(2);
    });
    expect(calls[0].body).toBe(META_BODY_C);
    expect(calls[1].body).toBe(VERSION_BODY_C);
    // Belt-and-suspenders: no scale/options leaked into non-slider rows.
    expect(calls[1].body).not.toContain('"scale"');
    expect(calls[1].body).not.toContain('"options"');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: serializer failure ⇒ ZERO fetch + destructive toast
  // ──────────────────────────────────────────────────────────────────────
  it("serializer guard (MULTI_CHOICE with zero options) ⇒ ZERO fetch calls + destructive toast", async () => {
    const { calls } = installFetch();
    const props = fixtureB();
    // Empty the MC options so buildQuestionsPayload throws
    // MULTI_CHOICE_NO_OPTIONS before any fetch is dispatched.
    props.version.questions = [
      {
        ...props.version.questions[0],
        options: [],
        maxChoices: null,
      },
    ];
    render(<TemplateEditorTabbed {...props} />);

    switchTab(/^Questions$/, "questions");
    // Dirty the questions surface (edit the label).
    act(() => {
      fireEvent.change(
        within(screen.getByTestId("questions-config-form")).getByLabelText(
          "Label",
        ),
        { target: { value: "Pick (edited)" } },
      );
    });

    await clickSave();

    expect(calls.length).toBe(0);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not save draft",
        variant: "destructive",
        description: expect.stringMatching(/at least one option/i),
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: double-save prevention (2 rapid clicks ⇒ 1 transcript)
  // ──────────────────────────────────────────────────────────────────────
  it("double-save prevention — a second click while a save is in flight issues no extra fetch", async () => {
    const gate = deferred<void>();
    const calls: FetchCall[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? "GET",
        url: typeof input === "string" ? input : String(input),
        body: init?.body != null ? String(init.body) : null,
      });
      await gate.promise; // hold the save in flight
      return jsonResponse({ success: true });
    }) as unknown as typeof fetch;

    render(<TemplateEditorTabbed {...fixtureA()} />);

    // Dirty ONLY metadata so a save == exactly one PATCH (crisp count).
    act(() => {
      fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: "Alpha Renamed" },
      });
    });

    // Click 1 — starts the save; savingDraft flips true → button disables.
    await act(async () => {
      fireEvent.click(saveBtn());
    });
    expect(calls.length).toBe(1);
    expect(saveBtn()).toBeDisabled();

    // Click 2 — the disabled button ignores it (no extra fetch).
    await act(async () => {
      fireEvent.click(saveBtn());
    });
    expect(calls.length).toBe(1);

    // Release the in-flight save.
    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Draft saved" }),
      );
    });
    expect(calls.length).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: failed save → retry
  // ──────────────────────────────────────────────────────────────────────
  it("failed version PATCH ⇒ destructive toast, dirty NOT reset, a retry issues a second transcript", async () => {
    const { calls } = installFetch(({ callIndex }) =>
      // First save fails on the version PATCH; the retry succeeds.
      callIndex === 0
        ? { ok: false, status: 500, json: { error: "boom" } }
        : { json: { success: true } },
    );
    render(<TemplateEditorTabbed {...fixtureA()} />);

    // Dirty ONLY the questions surface (edit a slider label) → 1 version PATCH.
    switchTab(/^Questions$/, "questions");
    act(() => {
      fireEvent.change(
        within(screen.getByTestId("questions-config-form")).getByLabelText(
          "Label",
        ),
        { target: { value: "Q1 relabelled" } },
      );
    });

    // Save 1 — fails.
    await clickSave();
    await waitFor(() => {
      expect(calls.length).toBe(1);
    });
    expect(calls[0].url).toBe(
      "/api/admin/assessment-templates/tpl_1/versions/ver_2",
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not save draft",
        variant: "destructive",
        description: expect.stringMatching(/version/i),
      }),
    );
    // Dirty NOT reset → Save still enabled.
    expect(saveBtn()).not.toBeDisabled();

    // Save 2 — succeeds and issues a fresh transcript.
    await clickSave();
    await waitFor(() => {
      expect(calls.length).toBe(2);
    });
    expect(calls[1].url).toBe(
      "/api/admin/assessment-templates/tpl_1/versions/ver_2",
    );
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Draft saved" }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: ?tab= routing per tab (router.replace, no history push)
  // ──────────────────────────────────────────────────────────────────────
  it("tab clicks route via router.replace with the right ?tab= (metadata clears it)", () => {
    installFetch();
    render(<TemplateEditorTabbed {...fixtureA()} />);

    // `sourceParam` = the ?tab value the editor sees at click time (the
    // re-sync effect keeps activeTab in step with mockSearchParams, so each
    // click must move to a DIFFERENT tab to fire onValueChange — this is how
    // the real URL evolves as the user clicks through the tabs).
    const clickAndRead = (name: RegExp, sourceParam: string) => {
      mockSearchParams = new URLSearchParams(sourceParam);
      const tab = screen.getByRole("tab", { name });
      act(() => {
        fireEvent.mouseDown(tab);
        fireEvent.click(tab);
      });
      return String(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]);
    };

    expect(clickAndRead(/^Sections$/, "")).toBe(`${PATHNAME}?tab=sections`);
    expect(clickAndRead(/^Questions$/, "tab=sections")).toBe(
      `${PATHNAME}?tab=questions`,
    );
    expect(clickAndRead(/Scoring & Tiers/, "tab=questions")).toBe(
      `${PATHNAME}?tab=scoring`,
    );
    expect(clickAndRead(/^Versions$/, "tab=scoring")).toBe(
      `${PATHNAME}?tab=versions`,
    );
    // Metadata is the default tab → the ?tab param is DELETED (bare pathname).
    expect(clickAndRead(/^Metadata$/, "tab=versions")).toBe(PATHNAME);
    // Never a history push.
    expect(pushMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: independent sendResultsDefault PATCH (outside Save Draft)
  // ──────────────────────────────────────────────────────────────────────
  it("sendResultsDefault toggle fires its own template PATCH independent of Save Draft", async () => {
    const { calls } = installFetch();
    render(<TemplateEditorTabbed {...fixtureA()} />);

    // The toggle is on the Metadata tab (active by default); Wave-Q flag on.
    const toggle = screen.getByRole("switch", {
      name: /Send results to respondents by default/,
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      fireEvent.click(toggle);
    });

    // Exactly one PATCH, to the TEMPLATE row, body == { sendResultsDefault: true }.
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      url: "/api/admin/assessment-templates/tpl_1",
    });
    expect(calls[0].body).toBe('{"sendResultsDefault":true}');
    // It is NOT part of Save Draft — Save is still disabled (nothing dirty).
    expect(saveBtn()).toBeDisabled();
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-checked", "true");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: Wave-T follow-up-save regression
  // (add question → save → sections-only edit → save → 2nd version PATCH
  //  body STILL contains the added question)
  // ──────────────────────────────────────────────────────────────────────
  it("follow-up save (sections-only) still carries a question added by an earlier save (raw-ref sync)", async () => {
    const { calls } = installFetch();
    render(<TemplateEditorTabbed {...fixtureA()} />);

    // Save 1 — add a TEXT question in S1 and persist it.
    switchTab(/^Questions$/, "questions");
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
    await clickSave();
    await waitFor(() => {
      expect(calls.filter(isVersionPatch).length).toBe(1);
    });
    const body1 = JSON.parse(
      calls.filter(isVersionPatch)[0].body!,
    ) as { questions: Array<{ stableKey: string }> };
    expect(body1.questions).toHaveLength(4); // 3 sliders + the new TEXT
    expect(body1.questions.map((q) => q.stableKey)).toEqual(
      expect.arrayContaining(["S1_top_priorities"]),
    );

    // Save 2 — dirty ONLY the sections surface (Sections tab, rename S1).
    switchTab(/^Sections$/, "sections");
    const s1Row = screen
      .getAllByLabelText(/Section S1 name/)
      .find(Boolean) as HTMLInputElement;
    act(() => {
      fireEvent.change(s1Row, { target: { value: "Section One (renamed)" } });
    });
    await clickSave();
    await waitFor(() => {
      expect(calls.filter(isVersionPatch).length).toBe(2);
    });

    // Without the raw-ref sync, this questions-not-dirty PATCH would pass the
    // page-load rows through and silently DROP S1_top_priorities.
    const body2 = JSON.parse(
      calls.filter(isVersionPatch)[1].body!,
    ) as { questions: Array<{ stableKey: string }> };
    expect(body2.questions).toHaveLength(4);
    expect(body2.questions.map((q) => q.stableKey)).toEqual(
      expect.arrayContaining(["S1_top_priorities"]),
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: question drag-reorder (handleReorderQuestions) via keyboard
  // ──────────────────────────────────────────────────────────────────────
  it("keyboard drag-reorder of two questions (handleReorderQuestions) → exact version body with swapped sortOrder", async () => {
    const restoreDnd = installDndLayout();
    jest.useFakeTimers();
    const { calls } = installFetch();
    try {
      render(<TemplateEditorTabbed {...fixtureReorder()} />);

      switchTab(/^Questions$/, "questions");
      const list = screen.getByTestId("questions-question-list");
      const orderNow = () =>
        within(list)
          .getAllByTestId(/^question-card-/)
          .map((c) => c.getAttribute("data-testid"));

      expect(orderNow()).toEqual([
        "question-card-S1_a",
        "question-card-S1_b",
      ]);

      // Pick up S1_a (Space on its drag handle), move down (ArrowDown), drop
      // (Space). dnd-kit listens at the document level once lifted, and
      // schedules the move on a timer — flush it after each key.
      const handle = screen.getByTestId("drag-handle-S1_a");
      act(() => {
        handle.focus();
      });
      act(() => {
        fireEvent.keyDown(handle, { key: " ", code: "Space" });
        jest.runOnlyPendingTimers();
      });
      act(() => {
        fireEvent.keyDown(document, { key: "ArrowDown", code: "ArrowDown" });
        jest.runOnlyPendingTimers();
      });
      act(() => {
        fireEvent.keyDown(document, { key: " ", code: "Space" });
        jest.runOnlyPendingTimers();
      });

      // The drop actually reordered the rows (proves onReorderQuestions fired).
      expect(orderNow()).toEqual([
        "question-card-S1_b",
        "question-card-S1_a",
      ]);

      jest.useRealTimers();

      // Reorder dirtied the questions surface → Save issues one version PATCH.
      await clickSave();
      await waitFor(() => {
        expect(calls.filter(isVersionPatch).length).toBe(1);
      });
      // Byte-exact: the emitted array keeps state order [S1_a, S1_b] with the
      // swapped sortOrders (S1_a→2, S1_b→1).
      expect(calls.filter(isVersionPatch)[0].body).toBe(VERSION_BODY_REORDER);
      // No metadata PATCH — only the version surface was dirtied.
      expect(calls.length).toBe(1);
    } finally {
      jest.useRealTimers();
      restoreDnd();
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: publish 422 → PublishFailureModal
  // ──────────────────────────────────────────────────────────────────────
  it("publish 422 with issues[] opens the PublishFailureModal", async () => {
    installFetch(({ url, method }) =>
      method === "POST" && url.includes("/publish")
        ? {
            ok: false,
            status: 422,
            json: {
              success: false,
              error: "PUBLISH_VALIDATION_FAILED",
              issues: [
                {
                  path: ["scoringConfig", "tiers", 0, "minMetric"],
                  code: "custom",
                  message: "Tier 0 must start at 0.",
                },
              ],
            },
          }
        : { json: { success: true, data: {} } },
    );
    render(<TemplateEditorTabbed {...fixtureA()} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("template-editor-publish-btn"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("publish-failure-modal")).toBeInTheDocument();
    });
    expect(screen.getByText(/Tier 0 must start at 0\./)).toBeInTheDocument();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: publish 409 → toast + refresh
  // ──────────────────────────────────────────────────────────────────────
  it("publish 409 shows an 'Already published' toast and refreshes", async () => {
    installFetch(({ url, method }) =>
      method === "POST" && url.includes("/publish")
        ? { ok: false, status: 409, json: { error: "ALREADY_PUBLISHED" } }
        : { json: { success: true } },
    );
    render(<TemplateEditorTabbed {...fixtureA()} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("template-editor-publish-btn"));
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Already published",
          variant: "destructive",
        }),
      );
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(
      screen.queryByTestId("publish-failure-modal"),
    ).not.toBeInTheDocument();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transition: duplicate → POST + client navigation
  // ──────────────────────────────────────────────────────────────────────
  // NOTE: jsdom defines both `window.location` and `location.href` as
  // NON-configurable, so the actual href assignment can't be stubbed or read
  // back (assigning it merely logs "Not implemented: navigation" and does not
  // throw). We therefore assert the strongest observable equivalent: the exact
  // POST fired AND the success toast — which only fires if the handler ran all
  // the way through to the `window.location.href = …` navigation line without
  // throwing. The navigation console-error is suppressed locally.
  it("duplicate issues a POST .../duplicate and reaches the client-navigation success path", async () => {
    const { calls } = installFetch(({ url, method }) =>
      method === "POST" && url.includes("/duplicate")
        ? {
            json: {
              success: true,
              data: { versionNumber: 3, newVersionId: "ver_3" },
            },
          }
        : { json: { success: true } },
    );

    const origError = console.error;
    const errSpy = jest
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        // jsdom logs the un-implemented navigation as an Error object, not a
        // string — flatten all args before matching.
        const flat = args
          .map((a) => (a instanceof Error ? a.message : String(a)))
          .join(" ");
        if (flat.includes("Not implemented: navigation")) return;
        // Re-surface anything else.
        (origError as (...a: unknown[]) => void)(...args);
      });

    try {
      render(<TemplateEditorTabbed {...fixtureA()} />);
      // The Duplicate button lives on the Versions tab.
      switchTab(/^Versions$/, "versions");
      await act(async () => {
        fireEvent.click(screen.getByTestId("duplicate-version-ver_2"));
      });

      const dup = calls.find(
        (c) => c.method === "POST" && c.url.includes("/duplicate"),
      );
      expect(dup).toBeTruthy();
      expect(dup!.method).toBe("POST");
      expect(dup!.url).toBe(
        "/api/admin/assessment-templates/tpl_1/versions/ver_2/duplicate",
      );
      // The success toast fires only after the navigation line was reached.
      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "New draft created",
            description: expect.stringContaining("v3"),
          }),
        );
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // ED3 Task 3 — CHARACTERIZATION of the CURRENT question-selection behavior
  // across a tab switch, BEFORE selection is lifted into useEditorSelection.
  //
  // Today selection (`focusedQuestionUid` + `selectedSectionStableKey`) is
  // LOCAL state inside QuestionsTab. The Questions `TabsContent` is NOT
  // force-mounted, so leaving the tab UNMOUNTS QuestionsTab and returning
  // REMOUNTS it — which RESETS selection to its initial value: the FIRST
  // section (S1) and, via the section-change effect, the first question of
  // that section (S1_q1). This test pins that reset so the lift (which moves
  // the state ABOVE QuestionsTab, where it would otherwise PERSIST across the
  // remount) must reproduce it exactly.
  it("selection resets to the initial focus (S1 / first question) after leaving Questions and coming back — current behavior, ED3-pinned", () => {
    installFetch();
    render(<TemplateEditorTabbed {...fixtureA()} />);

    // Open the Questions tab (mounts QuestionsTab → initial focus computed).
    switchTab(/^Questions$/, "questions");

    // Initial focus: first section S1, first question S1_q1.
    const list1 = screen.getByTestId("questions-question-list");
    expect(within(list1).getByTestId("question-card-S1_q1")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      within(list1).getByTestId("question-card-S1_q2"),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("questions-config-form")).toHaveTextContent(
      "Edit Question — S1_q1",
    );
    // Section S1 is the selected section.
    expect(screen.getByTestId("section-nav-item-S1")).toHaveAttribute(
      "aria-current",
      "true",
    );

    // Move selection AWAY from the initial: focus a non-default question
    // (S1_q2) …
    act(() => {
      fireEvent.click(
        within(within(list1).getByTestId("question-card-S1_q2")).getByRole(
          "button",
          { name: /^Edit$/ },
        ),
      );
    });
    expect(within(list1).getByTestId("question-card-S1_q2")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("questions-config-form")).toHaveTextContent(
      "Edit Question — S1_q2",
    );

    // … and switch to a DIFFERENT section (S2), which focuses its own first
    // question (S2_q3). Selection is now well away from the initial state.
    act(() => {
      fireEvent.click(screen.getByTestId("section-nav-item-S2"));
    });
    expect(screen.getByTestId("section-nav-item-S2")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("questions-config-form")).toHaveTextContent(
      "Edit Question — S2_q3",
    );

    // Leave Questions → Scoring, then come back to Questions.
    switchTab(/Scoring & Tiers/, "scoring");
    switchTab(/^Questions$/, "questions");

    // CURRENT behavior: focus RESET to the initial focus (S1_q1), NOT the
    // last-focused S1_q2; the selected section is back to S1.
    const list2 = screen.getByTestId("questions-question-list");
    expect(within(list2).getByTestId("question-card-S1_q1")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      within(list2).getByTestId("question-card-S1_q2"),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("questions-config-form")).toHaveTextContent(
      "Edit Question — S1_q1",
    );
    expect(screen.getByTestId("section-nav-item-S1")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
