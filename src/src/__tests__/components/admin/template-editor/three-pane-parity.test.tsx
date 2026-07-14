/**
 * ED4 — Parameterized parity contract suite (flag-ON ≡ flag-OFF).
 *
 * Spec 19af §3.5 / plan Task 2 / co-validate C3. For each ED3 mutation
 * scenario this suite renders the editor through the SAME entry point
 * (`TemplateEditorController` re-exported as `TemplateEditorTabbed`) TWICE —
 * once with `threePaneEnabled={false}` (legacy `QuestionsTab`) and once with
 * `{true}` (the `ThreePaneWorkspace`) — performs the IDENTICAL logical
 * authoring action in each, captures the outgoing fetch transcript
 * (ordered `{method,url,body}` + count), and asserts the two transcripts are
 * DEEP-EQUAL, plus asserts UI-state + dirty-state parity (Save disabled/enabled,
 * toasts, modal presence, refresh) at the key moments.
 *
 * WHY equality ⇒ frozen: the ED3 guard (`editor-byte-equivalence.test.tsx`)
 * separately freezes the flag-OFF transcript byte-exact, so deep-equality here
 * transitively freezes the flag-ON transcript too. That is the whole point of
 * the "extract, don't fork" migration — one model, two presentations, provably
 * equivalent I/O.
 *
 * REACHABILITY (T3 stub state): T3 mounts the REAL `QuestionInspector` in the
 * right pane but the LEFT outline (T4) and CENTER canvas (T5) are still
 * placeholders. The inspector edits `model.selection.focusedQuestionUid`, but
 * that starts `null` and the ONLY DOM affordance to focus a question is the
 * outline — not built yet. So any scenario that requires editing a *focused*
 * question via the inspector (label edit, add, delete, within-section reorder,
 * the Wave-T follow-up-save regression, focus-preservation, AND the
 * MULTI_CHOICE serializer guard — which fires only on a questions-DIRTY save,
 * code-verified in build-version-payload.ts) is `it.skip`-ped with reason
 * "pending T4 outline". The reachable-now scenarios drive the version PATCH via
 * the reused Sections tab (raw pass-through of the clean questions) and
 * metadata via the reused Metadata tab (both single-source in BOTH modes), plus
 * the reused header/Versions actions (Save/Publish/Duplicate) — all fully
 * mode-independent today.
 *
 * `genUid` is mocked to a deterministic counter exactly as the ED3 guard does,
 * reset before each mode's render, so both modes mint identical uids (belt-and-
 * suspenders — no transcript keys off a uid).
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
// Mocks — same harness as the ED3 byte-equivalence guard.
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

// Deterministic genUid (identical mechanism to the ED3 guard).
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

afterEach(() => {
  cleanup();
});

function resetHarness() {
  toastMock.mockClear();
  replaceMock.mockClear();
  refreshMock.mockClear();
  pushMock.mockClear();
  (window.confirm as jest.Mock).mockClear();
  (window.confirm as jest.Mock).mockImplementation(() => true);
  mockSearchParams = new URLSearchParams("");
  mockUidCounter = 0;
}

// ────────────────────────────────────────────────────────────────────────
// Fetch transcript recorder (verbatim from the ED3 guard).
// ────────────────────────────────────────────────────────────────────────
interface FetchCall {
  method: string;
  url: string;
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

/** Normalize captured calls to a deep-equal-able transcript. */
function transcriptOf(calls: FetchCall[]): FetchCall[] {
  return calls.map((c) => ({ method: c.method, url: c.url, body: c.body }));
}

/** Snapshot the toast call arguments (deep-equal-able across modes). */
function toastArgs(): unknown[] {
  return toastMock.mock.calls.map((c) => c[0]);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// ────────────────────────────────────────────────────────────────────────
// Fixtures — every editor flag ON + a DRAFT version. `threePaneEnabled` is
// injected per mode by the parity runner.
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

// Slider-heavy — 3 SLIDER_LIKERT across 2 sections (mirrors ED3 fixture (a)).
function fixtureA(threePaneEnabled: boolean) {
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
    threePaneEnabled,
    ...ALL_FLAGS,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Interaction helpers (mode-agnostic — they touch reused single-source tabs).
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
  return screen.getByTestId(
    "template-editor-save-draft-btn",
  ) as HTMLButtonElement;
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(saveBtn());
  });
}

/** Rename section S1 on the reused Sections tab → dirties the version surface. */
function renameSectionS1(value: string) {
  switchTab(/^Sections$/, "sections");
  const row = screen
    .getAllByLabelText(/Section S1 name/)
    .find(Boolean) as HTMLInputElement;
  act(() => {
    fireEvent.change(row, { target: { value } });
  });
}

/** Edit the template Name on the reused Metadata tab → dirties metadata. */
function editTemplateName(value: string) {
  switchTab(/^Metadata$/, "metadata");
  act(() => {
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value },
    });
  });
}

// MULTI_CHOICE fixture with ZERO options (serializer-guard scenario). Mirrors
// the ED3 guard's fixture (b) emptied — a dirty questions save throws
// MULTI_CHOICE_NO_OPTIONS before any fetch dispatches.
function fixtureMC(threePaneEnabled: boolean) {
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
          options: [] as Array<{ key: string; label: string }>,
          maxChoices: null,
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: allVersionsMeta,
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    threePaneEnabled,
    ...ALL_FLAGS,
  };
}

// @dnd-kit keyboard-reorder enablement (jsdom has no layout) — verbatim from
// the ED3 byte-equivalence guard. jsdom cannot dispatch real PointerEvents, so
// the KEYBOARD sensor is the only way to drive a REAL reorder at the public
// surface; both sensors call the same onDragEnd → reorder command.
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
      return { top, bottom: top + 50, left: 0, right: 200, width: 200, height: 50, x: 0, y: top, toJSON() {} } as DOMRect;
    }
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = origRect;
    if (hadRO) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = origRO;
    else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  };
}

// ── Mode-aware authoring helpers ─────────────────────────────────────────
// flag-ON drives the NEW outline + reused inspector; flag-OFF drives the
// legacy QuestionsTab. Both call the SAME shared model commands underneath.

/** Reach the question-authoring surface. flag-ON: "Edit" is the default tab. */
function goToEditor(threePane: boolean) {
  if (!threePane) switchTab(/^Questions$/, "questions");
}

/** Focus a question by stableKey (its section is assumed visible/selected). */
function focusQuestion(threePane: boolean, stableKey: string) {
  if (threePane) {
    act(() => {
      fireEvent.click(screen.getByTestId(`outline-focus-${stableKey}`));
    });
  } else {
    const card = screen.getByTestId(`question-card-${stableKey}`);
    act(() => {
      fireEvent.click(within(card).getByRole("button", { name: /^Edit$/ }));
    });
  }
}

/** Edit the FOCUSED question's Label in the reused inspector (both modes). */
function editFocusedLabel(value: string) {
  act(() => {
    fireEvent.change(
      within(screen.getByTestId("questions-config-form")).getByLabelText(
        "Label",
      ),
      { target: { value } },
    );
  });
}

/** Set the FOCUSED question's Type in the reused inspector (both modes). */
function setFocusedType(value: string) {
  act(() => {
    fireEvent.change(
      within(screen.getByTestId("questions-config-form")).getByLabelText(
        "Question Type",
      ),
      { target: { value } },
    );
  });
}

/** Add a question to S1 and leave the reused inspector focused on it. */
function addAndFocusNewInS1(threePane: boolean) {
  if (threePane) {
    // Outline "+ Add question" focuses the returned new uid automatically.
    act(() => {
      fireEvent.click(screen.getByTestId("outline-add-question-S1"));
    });
  } else {
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
    act(() => {
      fireEvent.click(within(newCard!).getByRole("button", { name: /^Edit$/ }));
    });
  }
}

/** Delete an S1 question by stableKey (confirm is globally mocked → true). */
function deleteS1Question(threePane: boolean, stableKey: string) {
  if (!threePane) {
    act(() => {
      fireEvent.click(screen.getByTestId("section-nav-item-S1"));
    });
  }
  const card = screen.getByTestId(`question-card-${stableKey}`);
  act(() => {
    fireEvent.click(within(card).getByRole("button", { name: /^Delete$/ }));
  });
}

/** Keyboard-reorder S1's first question one slot down (needs fake timers). */
function keyboardReorderS1FirstDown(threePane: boolean) {
  if (!threePane) {
    act(() => {
      fireEvent.click(screen.getByTestId("section-nav-item-S1"));
    });
  }
  const handle = screen.getByTestId("drag-handle-S1_q1");
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
}

const isVersionPatch = (c: FetchCall) =>
  c.url === "/api/admin/assessment-templates/tpl_1/versions/ver_2" &&
  c.method === "PATCH";

const MODES: { threePane: boolean; key: "off" | "on" }[] = [
  { threePane: false, key: "off" },
  { threePane: true, key: "on" },
];

// ════════════════════════════════════════════════════════════════════════
// Parity scenarios — GREEN in BOTH modes.
// ════════════════════════════════════════════════════════════════════════
describe("ED4 three-pane parity contract (flag-ON ≡ flag-OFF)", () => {
  // ── smoke: the flag actually swaps the Questions body in each mode ──
  it("mounts QuestionsTab (flag-OFF) vs ThreePaneWorkspace (flag-ON) — mode-specific", () => {
    resetHarness();
    installFetch();
    render(<TemplateEditorTabbed {...fixtureA(false)} />);
    // flag-OFF: default tab Metadata; no workspace; the tab reads "Questions".
    expect(screen.queryByTestId("three-pane-workspace")).toBeNull();
    expect(
      screen.getByRole("tab", { name: /^Questions$/ }),
    ).toBeInTheDocument();

    cleanup();
    resetHarness();
    installFetch();
    render(<TemplateEditorTabbed {...fixtureA(true)} />);
    // flag-ON: the workspace mounts (default tab), tab relabeled "Edit", and
    // the reused inspector is present (empty state until T4 focuses one).
    expect(screen.getByTestId("three-pane-workspace")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Edit$/ })).toBeInTheDocument();
    expect(screen.getByTestId("questions-config-form")).toHaveTextContent(
      /Select a question/i,
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Happy-path save transcript: metadata edit + section rename → Save issues
  // [metadata PATCH, version PATCH] in order. Both surfaces are reused/single-
  // source, so the action is identical in both modes.
  // ──────────────────────────────────────────────────────────────────────
  it("metadata + section-rename → Save: [metadata PATCH, version PATCH] transcript + Save-state parity", async () => {
    const cap: Record<string, {
      transcript: FetchCall[];
      saveDisabledInitial: boolean;
      saveDisabledAfterDirty: boolean;
      saveDisabledAfterSave: boolean;
      toasts: unknown[];
    }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch();
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      const saveDisabledInitial = saveBtn().disabled;
      editTemplateName("Alpha Renamed");
      renameSectionS1("Section One (renamed)");
      const saveDisabledAfterDirty = saveBtn().disabled;

      await clickSave();
      await waitFor(() => expect(calls.length).toBe(2));
      await waitFor(() => expect(saveBtn().disabled).toBe(true));

      cap[key] = {
        transcript: transcriptOf(calls),
        saveDisabledInitial,
        saveDisabledAfterDirty,
        saveDisabledAfterSave: saveBtn().disabled,
        toasts: toastArgs(),
      };
      cleanup();
    }

    // Transcript parity (the core contract).
    expect(cap.on.transcript).toEqual(cap.off.transcript);
    // Two PATCHes, metadata then version, in BOTH modes.
    expect(cap.off.transcript).toHaveLength(2);
    expect(cap.off.transcript[0]).toMatchObject({
      method: "PATCH",
      url: "/api/admin/assessment-templates/tpl_1",
    });
    expect(cap.off.transcript[1]).toMatchObject({
      method: "PATCH",
      url: "/api/admin/assessment-templates/tpl_1/versions/ver_2",
    });
    // UI + dirty parity at each moment.
    expect(cap.on.saveDisabledInitial).toBe(cap.off.saveDisabledInitial);
    expect(cap.on.saveDisabledInitial).toBe(true);
    expect(cap.on.saveDisabledAfterDirty).toBe(cap.off.saveDisabledAfterDirty);
    expect(cap.on.saveDisabledAfterDirty).toBe(false);
    expect(cap.on.saveDisabledAfterSave).toBe(cap.off.saveDisabledAfterSave);
    expect(cap.on.saveDisabledAfterSave).toBe(true);
    // Toast parity ("Draft saved").
    expect(cap.on.toasts).toEqual(cap.off.toasts);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Double-save prevention: a second click while a save is in flight issues
  // no extra fetch. Dirtied via the reused Metadata Name field.
  // ──────────────────────────────────────────────────────────────────────
  it("double-save prevention — second click while in flight issues no extra fetch (parity)", async () => {
    const cap: Record<string, {
      afterFirstClick: number;
      saveDisabledAfterFirst: boolean;
      afterSecondClick: number;
      afterRelease: number;
      transcript: FetchCall[];
    }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const gate = deferred<void>();
      const calls: FetchCall[] = [];
      global.fetch = jest.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          calls.push({
            method: init?.method ?? "GET",
            url: typeof input === "string" ? input : String(input),
            body: init?.body != null ? String(init.body) : null,
          });
          await gate.promise;
          return jsonResponse({ success: true });
        },
      ) as unknown as typeof fetch;

      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      // Dirty ONLY metadata so a save == exactly one PATCH (crisp count).
      editTemplateName("Alpha Renamed");

      await act(async () => {
        fireEvent.click(saveBtn());
      });
      const afterFirstClick = calls.length;
      const saveDisabledAfterFirst = saveBtn().disabled;

      await act(async () => {
        fireEvent.click(saveBtn());
      });
      const afterSecondClick = calls.length;

      await act(async () => {
        gate.resolve();
        await gate.promise;
      });
      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Draft saved" }),
        );
      });

      cap[key] = {
        afterFirstClick,
        saveDisabledAfterFirst,
        afterSecondClick,
        afterRelease: calls.length,
        transcript: transcriptOf(calls),
      };
      cleanup();
    }

    expect(cap.on).toEqual(cap.off);
    expect(cap.off.afterFirstClick).toBe(1);
    expect(cap.off.saveDisabledAfterFirst).toBe(true);
    expect(cap.off.afterSecondClick).toBe(1);
    expect(cap.off.afterRelease).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Failed version PATCH → destructive toast, dirty NOT reset, retry issues a
  // second transcript. Dirtied via the reused Sections tab.
  // ──────────────────────────────────────────────────────────────────────
  it("failed version PATCH → toast, dirty NOT reset, retry issues a 2nd transcript (parity)", async () => {
    const cap: Record<string, {
      afterFirstSave: FetchCall[];
      saveDisabledAfterFail: boolean;
      afterRetry: FetchCall[];
      toasts: unknown[];
    }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch(({ callIndex }) =>
        callIndex === 0
          ? { ok: false, status: 500, json: { error: "boom" } }
          : { json: { success: true } },
      );
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      renameSectionS1("Section One (renamed)");

      await clickSave();
      await waitFor(() => expect(calls.length).toBe(1));
      const afterFirstSave = transcriptOf(calls);
      const saveDisabledAfterFail = saveBtn().disabled;

      await clickSave();
      await waitFor(() => expect(calls.length).toBe(2));
      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Draft saved" }),
        );
      });

      cap[key] = {
        afterFirstSave,
        saveDisabledAfterFail,
        afterRetry: transcriptOf(calls),
        toasts: toastArgs(),
      };
      cleanup();
    }

    expect(cap.on.afterFirstSave).toEqual(cap.off.afterFirstSave);
    expect(cap.on.afterRetry).toEqual(cap.off.afterRetry);
    // First (failed) save = exactly one version PATCH; retry adds a second.
    expect(cap.off.afterFirstSave).toHaveLength(1);
    expect(cap.off.afterFirstSave[0]).toMatchObject({
      method: "PATCH",
      url: "/api/admin/assessment-templates/tpl_1/versions/ver_2",
    });
    expect(cap.off.afterRetry).toHaveLength(2);
    // Dirty NOT reset after failure → Save still enabled (both modes).
    expect(cap.on.saveDisabledAfterFail).toBe(cap.off.saveDisabledAfterFail);
    expect(cap.on.saveDisabledAfterFail).toBe(false);
    // Toast sequence parity (destructive failure, then success).
    expect(cap.on.toasts).toEqual(cap.off.toasts);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Publish happy path → POST .../publish; success toast + refresh (parity).
  // ──────────────────────────────────────────────────────────────────────
  it("publish (reused header) → POST .../publish + success toast + refresh (parity)", async () => {
    const cap: Record<string, {
      transcript: FetchCall[];
      toasts: unknown[];
      refreshCount: number;
    }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch(({ url, method }) =>
        method === "POST" && url.includes("/publish")
          ? { json: { success: true, data: {} } }
          : { json: { success: true } },
      );
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("template-editor-publish-btn"));
      });
      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Version published" }),
        );
      });

      cap[key] = {
        transcript: transcriptOf(calls),
        toasts: toastArgs(),
        refreshCount: refreshMock.mock.calls.length,
      };
      cleanup();
    }

    expect(cap.on.transcript).toEqual(cap.off.transcript);
    expect(cap.off.transcript).toEqual([
      {
        method: "POST",
        url: "/api/admin/assessment-templates/tpl_1/versions/ver_2/publish",
        body: null,
      },
    ]);
    expect(cap.on.toasts).toEqual(cap.off.toasts);
    expect(cap.on.refreshCount).toBe(cap.off.refreshCount);
    expect(cap.off.refreshCount).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Publish 422 with issues[] → PublishFailureModal (parity).
  // ──────────────────────────────────────────────────────────────────────
  it("publish 422 with issues[] opens the PublishFailureModal (parity)", async () => {
    const cap: Record<string, {
      transcript: FetchCall[];
      modalPresent: boolean;
      issueText: boolean;
    }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch(({ url, method }) =>
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
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("template-editor-publish-btn"));
      });
      await waitFor(() => {
        expect(
          screen.getByTestId("publish-failure-modal"),
        ).toBeInTheDocument();
      });

      cap[key] = {
        transcript: transcriptOf(calls),
        modalPresent: !!screen.queryByTestId("publish-failure-modal"),
        issueText: !!screen.queryByText(/Tier 0 must start at 0\./),
      };
      cleanup();
    }

    expect(cap.on.transcript).toEqual(cap.off.transcript);
    expect(cap.on.modalPresent).toBe(cap.off.modalPresent);
    expect(cap.on.modalPresent).toBe(true);
    expect(cap.on.issueText).toBe(cap.off.issueText);
    expect(cap.on.issueText).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Publish 409 → "Already published" toast + refresh, no modal (parity).
  // ──────────────────────────────────────────────────────────────────────
  it("publish 409 → 'Already published' toast + refresh, no modal (parity)", async () => {
    const cap: Record<string, {
      transcript: FetchCall[];
      toasts: unknown[];
      refreshCount: number;
      modalPresent: boolean;
    }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch(({ url, method }) =>
        method === "POST" && url.includes("/publish")
          ? { ok: false, status: 409, json: { error: "ALREADY_PUBLISHED" } }
          : { json: { success: true } },
      );
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

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

      cap[key] = {
        transcript: transcriptOf(calls),
        toasts: toastArgs(),
        refreshCount: refreshMock.mock.calls.length,
        modalPresent: !!screen.queryByTestId("publish-failure-modal"),
      };
      cleanup();
    }

    expect(cap.on.transcript).toEqual(cap.off.transcript);
    expect(cap.on.toasts).toEqual(cap.off.toasts);
    expect(cap.on.refreshCount).toBe(cap.off.refreshCount);
    expect(cap.off.refreshCount).toBe(1);
    expect(cap.on.modalPresent).toBe(cap.off.modalPresent);
    expect(cap.on.modalPresent).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Duplicate (reused Versions tab) → POST .../duplicate + navigation path.
  //
  // As in the ED3 guard: jsdom can't stub window.location.href, so the
  // strongest observable is the exact POST + the success toast (which only
  // fires once the handler reaches the navigation line). The jsdom
  // "Not implemented: navigation" console error is suppressed.
  // ──────────────────────────────────────────────────────────────────────
  it("duplicate → POST .../duplicate + reaches client-navigation success path (parity)", async () => {
    const cap: Record<string, {
      transcript: FetchCall[];
      toasts: unknown[];
    }> = {};

    const origError = console.error;
    const errSpy = jest
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        const flat = args
          .map((a) => (a instanceof Error ? a.message : String(a)))
          .join(" ");
        if (flat.includes("Not implemented: navigation")) return;
        (origError as (...a: unknown[]) => void)(...args);
      });

    try {
      for (const { threePane, key } of MODES) {
        resetHarness();
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
        render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

        switchTab(/^Versions$/, "versions");
        await act(async () => {
          fireEvent.click(screen.getByTestId("duplicate-version-ver_2"));
        });
        await waitFor(() => {
          expect(toastMock).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "New draft created",
              description: expect.stringContaining("v3"),
            }),
          );
        });

        cap[key] = {
          transcript: transcriptOf(
            calls.filter(
              (c) => c.method === "POST" && c.url.includes("/duplicate"),
            ),
          ),
          toasts: toastArgs(),
        };
        cleanup();
      }
    } finally {
      errSpy.mockRestore();
    }

    expect(cap.on.transcript).toEqual(cap.off.transcript);
    expect(cap.off.transcript).toEqual([
      {
        method: "POST",
        url: "/api/admin/assessment-templates/tpl_1/versions/ver_2/duplicate",
        body: null,
      },
    ]);
    expect(cap.on.toasts).toEqual(cap.off.toasts);
  });

  // ══════════════════════════════════════════════════════════════════════
  // Navigation — `?tab=` routing default differs BY DESIGN (spec 19af §3.2):
  // flag-OFF defaults to Metadata; flag-ON defaults to the "Edit" (questions)
  // tab, which becomes the param-less default. Asserted PER-MODE, never cross-
  // asserted.
  // ══════════════════════════════════════════════════════════════════════
  it("[flag-OFF] tab clicks route via router.replace with ?tab=; metadata clears it", () => {
    resetHarness();
    installFetch();
    render(<TemplateEditorTabbed {...fixtureA(false)} />);

    const clickAndRead = (name: RegExp, sourceParam: string) => {
      mockSearchParams = new URLSearchParams(sourceParam);
      const tab = screen.getByRole("tab", { name });
      act(() => {
        fireEvent.mouseDown(tab);
        fireEvent.click(tab);
      });
      return String(
        replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0],
      );
    };

    expect(clickAndRead(/^Sections$/, "")).toBe(`${PATHNAME}?tab=sections`);
    expect(clickAndRead(/^Questions$/, "tab=sections")).toBe(
      `${PATHNAME}?tab=questions`,
    );
    // Metadata is the default tab → the ?tab param is DELETED (bare pathname).
    expect(clickAndRead(/^Metadata$/, "tab=questions")).toBe(PATHNAME);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("[flag-ON] 'Edit' is the param-less default; Metadata sets ?tab=metadata", () => {
    resetHarness();
    installFetch();
    render(<TemplateEditorTabbed {...fixtureA(true)} />);

    const clickAndRead = (name: RegExp, sourceParam: string) => {
      mockSearchParams = new URLSearchParams(sourceParam);
      const tab = screen.getByRole("tab", { name });
      act(() => {
        fireEvent.mouseDown(tab);
        fireEvent.click(tab);
      });
      return String(
        replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0],
      );
    };

    // Leaving the default (Edit) → ?tab=sections.
    expect(clickAndRead(/^Sections$/, "")).toBe(`${PATHNAME}?tab=sections`);
    // Metadata is NOT the default in flag-ON → the param is SET.
    expect(clickAndRead(/^Metadata$/, "tab=sections")).toBe(
      `${PATHNAME}?tab=metadata`,
    );
    // Returning to Edit (the default) DELETES the param (bare pathname).
    expect(clickAndRead(/^Edit$/, "tab=metadata")).toBe(PATHNAME);
    expect(pushMock).not.toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════
  // INTENTIONAL DIVERGENCE (spec 19af §3.2/§3.5, G5) — documented, NOT a bug:
  // the ED3 guard pins that legacy `QuestionsTab` RESETS question selection to
  // the initial focus when you leave the Questions tab and return (its non-
  // force-mounted TabsContent unmounts). The three-pane deliberately PRESERVES
  // `focusedQuestionUid` across tab switches (the model lives above the shell).
  // This is a per-mode difference and must NEVER be cross-asserted.
  // ══════════════════════════════════════════════════════════════════════
  it("[flag-ON] focus persists across tab switches (vs. QuestionsTab mount-reset)", () => {
    resetHarness();
    installFetch();
    render(<TemplateEditorTabbed {...fixtureA(true)} />);

    // Edit is the default tab. Focus S1_q2 via the outline (NOT the default).
    focusQuestion(true, "S1_q2");
    expect(screen.getByTestId("questions-config-form")).toHaveTextContent(
      "Edit Question — S1_q2",
    );

    // Leave to Metadata (workspace unmounts) then return to Edit (remounts).
    switchTab(/^Metadata$/, "metadata");
    switchTab(/^Edit$/, "");

    // The three-pane PRESERVES focus (model lives above the shell) — S1_q2 is
    // still focused, the OPPOSITE of the ED3-pinned flag-OFF reset to S1_q1.
    expect(screen.getByTestId("questions-config-form")).toHaveTextContent(
      "Edit Question — S1_q2",
    );
    expect(screen.getByTestId("question-card-S1_q2")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  // ══════════════════════════════════════════════════════════════════════
  // Per-question authoring parity — flag-ON via the outline + reused inspector,
  // flag-OFF via QuestionsTab. Both route through the SAME shared model
  // commands, so the fetch transcripts are DEEP-EQUAL.
  // ══════════════════════════════════════════════════════════════════════
  it("edit a question label via the inspector → Save (transcript parity)", async () => {
    const cap: Record<string, { transcript: FetchCall[]; toasts: unknown[] }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch();
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      goToEditor(threePane);
      focusQuestion(threePane, "S1_q1");
      editFocusedLabel("Q1 relabelled");
      await clickSave();
      await waitFor(() => expect(calls.filter(isVersionPatch).length).toBe(1));

      cap[key] = { transcript: transcriptOf(calls), toasts: toastArgs() };
      cleanup();
    }

    expect(cap.on.transcript).toEqual(cap.off.transcript);
    // Exactly one version PATCH; body carries the relabeled question.
    expect(cap.off.transcript).toHaveLength(1);
    expect(cap.off.transcript[0]).toMatchObject({
      method: "PATCH",
      url: "/api/admin/assessment-templates/tpl_1/versions/ver_2",
    });
    expect(cap.off.transcript[0].body).toContain("Q1 relabelled");
    expect(cap.on.toasts).toEqual(cap.off.toasts);
  });

  it("serializer guard (MULTI_CHOICE zero options) → ZERO fetch + destructive toast (parity)", async () => {
    const cap: Record<string, { count: number; toasts: unknown[] }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch();
      render(<TemplateEditorTabbed {...fixtureMC(threePane)} />);

      goToEditor(threePane);
      focusQuestion(threePane, "S1_pick");
      // Dirty the questions surface → the serializer re-validates on save and
      // throws MULTI_CHOICE_NO_OPTIONS BEFORE dispatching any fetch.
      editFocusedLabel("Pick (edited)");
      await clickSave();

      cap[key] = { count: calls.length, toasts: toastArgs() };
      cleanup();
    }

    expect(cap.on.count).toBe(cap.off.count);
    expect(cap.off.count).toBe(0);
    expect(cap.on.toasts).toEqual(cap.off.toasts);
    // Both surfaced the same destructive "at least one option" toast.
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not save draft",
        variant: "destructive",
        description: expect.stringMatching(/at least one option/i),
      }),
    );
  });

  it("add-question via the outline → focus-new + Save (transcript parity)", async () => {
    const cap: Record<string, { transcript: FetchCall[] }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch();
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      goToEditor(threePane);
      addAndFocusNewInS1(threePane);
      // The new question is focused in the reused inspector (flag-ON: the
      // outline focused the returned uid; flag-OFF: we clicked its card Edit).
      editFocusedLabel("Added Slider");
      await clickSave();
      await waitFor(() => expect(calls.filter(isVersionPatch).length).toBe(1));

      cap[key] = { transcript: transcriptOf(calls) };
      cleanup();
    }

    expect(cap.on.transcript).toEqual(cap.off.transcript);
    // The new slider (slug-derived key) is present in the emitted body.
    expect(cap.off.transcript.filter(isVersionPatch)[0].body).toContain(
      "S1_added_slider",
    );
  });

  it("delete-question via the outline (shared confirm) → Save (transcript parity)", async () => {
    const cap: Record<string, { transcript: FetchCall[]; confirmed: boolean }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch();
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      goToEditor(threePane);
      deleteS1Question(threePane, "S1_q2");
      const confirmed = (window.confirm as jest.Mock).mock.calls.length === 1;
      await clickSave();
      await waitFor(() => expect(calls.filter(isVersionPatch).length).toBe(1));

      cap[key] = { transcript: transcriptOf(calls), confirmed };
      cleanup();
    }

    expect(cap.on.transcript).toEqual(cap.off.transcript);
    expect(cap.on.confirmed).toBe(cap.off.confirmed);
    expect(cap.on.confirmed).toBe(true);
    // The deleted question is gone from the emitted body in BOTH modes.
    const body = cap.off.transcript.filter(isVersionPatch)[0].body!;
    expect(body).not.toContain("S1_q2");
    expect(body).toContain("S1_q1");
  });

  it("within-section reorder (keyboard) via the outline → Save (transcript parity)", async () => {
    const cap: Record<string, { transcript: FetchCall[] }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const restoreDnd = installDndLayout();
      jest.useFakeTimers();
      const { calls } = installFetch();
      try {
        render(<TemplateEditorTabbed {...fixtureA(threePane)} />);
        goToEditor(threePane);
        keyboardReorderS1FirstDown(threePane);
      } finally {
        jest.useRealTimers();
        restoreDnd();
      }

      await clickSave();
      await waitFor(() => expect(calls.filter(isVersionPatch).length).toBe(1));

      cap[key] = { transcript: transcriptOf(calls) };
      cleanup();
    }

    expect(cap.on.transcript).toEqual(cap.off.transcript);
    // Byte-exact swap: S1_q1 → sortOrder 2, S1_q2 → sortOrder 1.
    const body = cap.off.transcript.filter(isVersionPatch)[0].body!;
    expect(body).toContain('"stableKey":"S1_q1","sectionStableKey":"S1","label":"Q1 label","type":"SLIDER_LIKERT","isRequired":true,"sortOrder":2');
    expect(body).toContain('"stableKey":"S1_q2","sectionStableKey":"S1","label":"Q2 label","type":"SLIDER_LIKERT","isRequired":true,"sortOrder":1');
  });

  // Pointer-drag reorder: jsdom cannot dispatch the real PointerEvents dnd-kit's
  // PointerSensor needs (documented in the ED3 byte-equivalence guard, which
  // drives reorder via the keyboard sensor for the same reason). Both sensors
  // call the identical onDragEnd → reorderQuestions, so the DROP→transcript is
  // proven by the keyboard scenario above; here we assert the pointer-drag
  // AFFORDANCE is present + enabled in BOTH modes (draft) — full parity of the
  // reorder capability without fabricating pointer events.
  it("within-section reorder (drag) affordance parity — draggable handles present + enabled", () => {
    const cap: Record<string, { enabled: boolean; sortable: boolean }> = {};
    for (const { threePane, key } of MODES) {
      resetHarness();
      installFetch();
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);
      goToEditor(threePane);
      if (!threePane) {
        act(() => {
          fireEvent.click(screen.getByTestId("section-nav-item-S1"));
        });
      }
      const handle = screen.getByTestId("drag-handle-S1_q1") as HTMLButtonElement;
      cap[key] = {
        enabled: !handle.disabled,
        sortable: handle.getAttribute("aria-roledescription") === "sortable",
      };
      cleanup();
    }
    expect(cap.on).toEqual(cap.off);
    expect(cap.off.enabled).toBe(true);
    expect(cap.off.sortable).toBe(true);
  });

  it("Wave-T follow-up-save data-loss regression (add question, then sections-only save) — parity", async () => {
    const cap: Record<string, {
      body1Keys: string[];
      body2Keys: string[];
    }> = {};

    for (const { threePane, key } of MODES) {
      resetHarness();
      const { calls } = installFetch();
      render(<TemplateEditorTabbed {...fixtureA(threePane)} />);

      // Save 1 — add a TEXT question to S1 and persist it.
      goToEditor(threePane);
      addAndFocusNewInS1(threePane);
      editFocusedLabel("Top Priorities");
      setFocusedType("TEXT");
      await clickSave();
      await waitFor(() => expect(calls.filter(isVersionPatch).length).toBe(1));
      const body1 = JSON.parse(calls.filter(isVersionPatch)[0].body!) as {
        questions: Array<{ stableKey: string }>;
      };

      // Save 2 — dirty ONLY the sections surface (rename S1) and save again.
      renameSectionS1("Section One (renamed)");
      await clickSave();
      await waitFor(() => expect(calls.filter(isVersionPatch).length).toBe(2));
      const body2 = JSON.parse(calls.filter(isVersionPatch)[1].body!) as {
        questions: Array<{ stableKey: string }>;
      };

      cap[key] = {
        body1Keys: body1.questions.map((q) => q.stableKey),
        body2Keys: body2.questions.map((q) => q.stableKey),
      };
      cleanup();
    }

    expect(cap.on).toEqual(cap.off);
    // First save: 3 sliders + the new TEXT (slug-derived key).
    expect(cap.off.body1Keys).toHaveLength(4);
    expect(cap.off.body1Keys).toEqual(
      expect.arrayContaining(["S1_top_priorities"]),
    );
    // Follow-up sections-only save STILL carries the added question (raw-ref
    // sync) — the Wave-T data-loss regression, in BOTH modes.
    expect(cap.off.body2Keys).toHaveLength(4);
    expect(cap.off.body2Keys).toEqual(
      expect.arrayContaining(["S1_top_priorities"]),
    );
  });
});
