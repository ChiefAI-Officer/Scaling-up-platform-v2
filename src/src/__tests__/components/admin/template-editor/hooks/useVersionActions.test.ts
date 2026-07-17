/**
 * Wave ED8 (spec 19ak §2/§5), Task T6 — useVersionActions lifecycle handlers.
 *
 * T5 shipped the server endpoints (archive / unarchive / draft-delete). T6
 * extends the existing `useVersionActions` hook — which already owns publish +
 * duplicate in the house style (window.confirm gate, per-action in-flight
 * versionId state, useToast, router.refresh() on success, body.error coded
 * failures) — with the three lifecycle handlers. These tests pin the extended
 * contract directly at the hook surface via renderHook (mirroring
 * useEditorCommands.test.ts): the exact confirm copy (spec §2/§5), the fetch
 * URL + method, the coded-failure → toast mapping, refresh vs. no-refresh, the
 * hard-navigate on deleting the OPEN version, and in-flight re-entry blocking.
 *
 * jsdom pins `window.location`/`location.href` as non-configurable (see the
 * editor-byte-equivalence guard's note), so the hard-navigate can't be stubbed
 * or read back. We assert the strongest observable equivalent: the jsdom
 * "Not implemented: navigation" console error (which fires ONLY when the
 * `window.location.href = …` line actually executes) plus the ABSENCE of a
 * router.refresh() — the else-branch's tell.
 */

import { act, renderHook } from "@testing-library/react";

import { useVersionActions } from "@/components/admin/template-editor/hooks/useVersionActions";
import type {
  TemplateEditorTabbedTemplate,
  TemplateEditorTabbedVersion,
} from "@/components/admin/template-editor/TabbedShell";

// ── Router + toast mocks ────────────────────────────────────────────────────
const refreshMock = jest.fn();
const pushMock = jest.fn();
const replaceMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

// ── window.confirm ──────────────────────────────────────────────────────────
const originalConfirm = window.confirm;
// installFetch() reassigns global.fetch directly (not a jest.spyOn), so
// afterEach's restoreAllMocks() would not undo it — snapshot + restore it here
// for hygiene parity with window.confirm. (jsdom recreates the global sandbox
// per test file, so this can't cross file boundaries either way.)
const originalFetch = global.fetch;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
  global.fetch = originalFetch;
});

// ── console.error — capture the jsdom navigation signal, forward the rest ────
let navErrors: string[] = [];
let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  refreshMock.mockClear();
  pushMock.mockClear();
  replaceMock.mockClear();
  toastMock.mockClear();
  (window.confirm as jest.Mock).mockClear();
  (window.confirm as jest.Mock).mockImplementation(() => true);

  navErrors = [];
  const forward = console.error;
  consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      const flat = args
        .map((a) => (a instanceof Error ? a.message : String(a)))
        .join(" ");
      if (flat.includes("Not implemented: navigation")) {
        navErrors.push(flat);
        return;
      }
      (forward as (...a: unknown[]) => void)(...args);
    });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  jest.restoreAllMocks();
});

// ── Fetch helpers ────────────────────────────────────────────────────────────
type FetchCall = { url: string; method: string };

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

function installFetch(
  handler: (call: FetchCall) => Response | Promise<Response>,
): { calls: FetchCall[]; fetchMock: jest.Mock } {
  const calls: FetchCall[] = [];
  const fetchMock = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      return handler({ url, method });
    },
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return { calls, fetchMock };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const template: TemplateEditorTabbedTemplate = {
  id: "tpl_1",
  name: "Rockefeller Habits Checklist",
  alias: "RockHabits",
  aggregationMode: "FULL_VISIBILITY",
  accessMode: "INVITED",
};

const version: TemplateEditorTabbedVersion = {
  id: "ver_open",
  versionNumber: 4,
  language: "enUS",
  publishedAt: null,
  contentHash: "abcdef012345",
};

function setup(isPublished = false) {
  return renderHook(() =>
    useVersionActions({ template, version, isPublished }),
  );
}

const ARCHIVE_URL = (vid: string) =>
  `/api/admin/assessment-templates/tpl_1/versions/${vid}/archive`;
const VERSIONS_URL = (vid: string) =>
  `/api/admin/assessment-templates/tpl_1/versions/${vid}`;

// ═══════════════════════════════════════════════════════════════════════════
// handleArchiveVersion
// ═══════════════════════════════════════════════════════════════════════════
describe("handleArchiveVersion", () => {
  it("confirm declined → no fetch", async () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const { fetchMock } = installFetch(() => makeResponse({ success: true }));
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_2", {
        isActive: true,
        versionNumber: 2,
        nextActiveVersionNumber: 1,
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("roll-back confirm copy is exact WITH a next active version", async () => {
    installFetch(() =>
      makeResponse({ success: true, data: { versionId: "ver_3" } }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_3", {
        isActive: true,
        versionNumber: 3,
        nextActiveVersionNumber: 2,
      });
    });

    expect(window.confirm).toHaveBeenCalledWith(
      "Roll back v3? v3 will stop being used for new campaigns; v2 becomes Active. Campaigns already running keep v3.",
    );
  });

  it("roll-back confirm copy is exact WITHOUT a next active version", async () => {
    installFetch(() =>
      makeResponse({ success: true, data: { versionId: "ver_3" } }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_3", {
        isActive: true,
        versionNumber: 3,
        nextActiveVersionNumber: null,
      });
    });

    expect(window.confirm).toHaveBeenCalledWith(
      "Roll back v3? v3 will stop being used for new campaigns. Campaigns already running keep v3.",
    );
  });

  it("plain-archive confirm copy is exact (not the active version)", async () => {
    installFetch(() =>
      makeResponse({ success: true, data: { versionId: "ver_1" } }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_1", {
        isActive: false,
        versionNumber: 1,
        nextActiveVersionNumber: null,
      });
    });

    expect(window.confirm).toHaveBeenCalledWith(
      "Archive v1? It stays available to campaigns that already used it; it will no longer appear as a published option.",
    );
  });

  it("archive success → POST the archive URL, refresh, and 'Version archived' toast", async () => {
    const { calls, fetchMock } = installFetch(() =>
      makeResponse({ success: true, data: { versionId: "ver_1" } }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_1", {
        isActive: false,
        versionNumber: 1,
        nextActiveVersionNumber: null,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual({ url: ARCHIVE_URL("ver_1"), method: "POST" });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Version archived" }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(result.current.archivingVersionId).toBeNull();
  });

  it("roll-back success (isActive) → 'Rolled back' toast + refresh", async () => {
    installFetch(() =>
      makeResponse({ success: true, data: { versionId: "ver_3" } }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_3", {
        isActive: true,
        versionNumber: 3,
        nextActiveVersionNumber: 2,
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Rolled back" }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("LAST_PUBLISHED_VERSION 409 → error toast, NO refresh", async () => {
    installFetch(() =>
      makeResponse({ success: false, error: "LAST_PUBLISHED_VERSION" }, 409),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_1", {
        isActive: false,
        versionNumber: 1,
        nextActiveVersionNumber: null,
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Can't archive the last published version",
        description: "New campaigns would have no version to use.",
        variant: "destructive",
      }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("ALREADY_ARCHIVED 409 → 'Already archived' toast + refresh", async () => {
    installFetch(() =>
      makeResponse({ success: false, error: "ALREADY_ARCHIVED" }, 409),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_1", {
        isActive: false,
        versionNumber: 1,
        nextActiveVersionNumber: null,
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Already archived" }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("NOT_PUBLISHED 409 → 'Drafts can't be archived' toast, NO refresh", async () => {
    installFetch(() =>
      makeResponse({ success: false, error: "NOT_PUBLISHED" }, 409),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_1", {
        isActive: false,
        versionNumber: 1,
        nextActiveVersionNumber: null,
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Drafts can't be archived" }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("unmapped failure → generic 'Could not archive' with body.error fallback", async () => {
    installFetch(() =>
      makeResponse({ success: false, error: "Boom happened" }, 500),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleArchiveVersion("ver_1", {
        isActive: false,
        versionNumber: 1,
        nextActiveVersionNumber: null,
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not archive",
        description: "Boom happened",
        variant: "destructive",
      }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("in-flight re-entry is blocked (second call while pending is a no-op)", async () => {
    const d = deferred<Response>();
    const { fetchMock } = installFetch(() => d.promise);
    const { result } = setup();

    await act(async () => {
      void result.current.handleArchiveVersion("ver_1", {
        isActive: false,
        versionNumber: 1,
        nextActiveVersionNumber: null,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.archivingVersionId).toBe("ver_1");

    await act(async () => {
      void result.current.handleArchiveVersion("ver_1", {
        isActive: false,
        versionNumber: 1,
        nextActiveVersionNumber: null,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Drain the pending request so React state settles inside act().
    await act(async () => {
      d.resolve(makeResponse({ success: true, data: {} }));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleUnarchiveVersion
// ═══════════════════════════════════════════════════════════════════════════
describe("handleUnarchiveVersion", () => {
  it("confirm copy is exact WITHOUT willBecomeActive", async () => {
    installFetch(() => makeResponse({ success: true, data: {} }));
    const { result } = setup();

    await act(async () => {
      await result.current.handleUnarchiveVersion("ver_2", {
        versionNumber: 2,
        willBecomeActive: false,
      });
    });

    expect(window.confirm).toHaveBeenCalledWith("Unarchive v2?");
  });

  it("confirm copy is exact WITH willBecomeActive", async () => {
    installFetch(() => makeResponse({ success: true, data: {} }));
    const { result } = setup();

    await act(async () => {
      await result.current.handleUnarchiveVersion("ver_2", {
        versionNumber: 2,
        willBecomeActive: true,
      });
    });

    expect(window.confirm).toHaveBeenCalledWith(
      "Unarchive v2? v2 will become the Active version for new campaigns.",
    );
  });

  it("confirm declined → no fetch", async () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const { fetchMock } = installFetch(() => makeResponse({ success: true }));
    const { result } = setup();

    await act(async () => {
      await result.current.handleUnarchiveVersion("ver_2", {
        versionNumber: 2,
        willBecomeActive: false,
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unarchive success → DELETE the archive URL, refresh, 'Version unarchived' toast", async () => {
    const { calls, fetchMock } = installFetch(() =>
      makeResponse({ success: true, data: { versionId: "ver_2" } }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleUnarchiveVersion("ver_2", {
        versionNumber: 2,
        willBecomeActive: true,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual({ url: ARCHIVE_URL("ver_2"), method: "DELETE" });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Version unarchived" }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(result.current.unarchivingVersionId).toBeNull();
  });

  it("NOT_ARCHIVED 409 → 'Not archived' toast + refresh", async () => {
    installFetch(() =>
      makeResponse({ success: false, error: "NOT_ARCHIVED" }, 409),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleUnarchiveVersion("ver_2", {
        versionNumber: 2,
        willBecomeActive: false,
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Not archived" }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("in-flight re-entry is blocked", async () => {
    const d = deferred<Response>();
    const { fetchMock } = installFetch(() => d.promise);
    const { result } = setup();

    await act(async () => {
      void result.current.handleUnarchiveVersion("ver_2", {
        versionNumber: 2,
        willBecomeActive: false,
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.unarchivingVersionId).toBe("ver_2");

    await act(async () => {
      void result.current.handleUnarchiveVersion("ver_2", {
        versionNumber: 2,
        willBecomeActive: false,
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(makeResponse({ success: true, data: {} }));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleDeleteVersion
// ═══════════════════════════════════════════════════════════════════════════
describe("handleDeleteVersion", () => {
  it("confirm copy is exact", async () => {
    installFetch(() => makeResponse({ success: true, data: {} }));
    const { result } = setup();

    await act(async () => {
      await result.current.handleDeleteVersion("ver_other", {
        versionNumber: 2,
      });
    });

    expect(window.confirm).toHaveBeenCalledWith(
      "Delete this draft? This cannot be undone.",
    );
  });

  it("confirm declined → no fetch", async () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const { fetchMock } = installFetch(() => makeResponse({ success: true }));
    const { result } = setup();

    await act(async () => {
      await result.current.handleDeleteVersion("ver_other", {
        versionNumber: 2,
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delete success on the OPEN version → hard-navigate to the template page, NO refresh", async () => {
    const { calls, fetchMock } = installFetch(() =>
      makeResponse({ success: true, data: { deletedVersionId: "ver_open" } }),
    );
    const { result } = setup();

    // version.id === "ver_open" is the currently-open version.
    await act(async () => {
      await result.current.handleDeleteVersion("ver_open", {
        versionNumber: 4,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual({ url: VERSIONS_URL("ver_open"), method: "DELETE" });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Draft deleted" }),
    );
    // The hard navigate fired (jsdom logs "Not implemented: navigation" ONLY
    // when window.location.href is actually assigned) …
    expect(navErrors.length).toBeGreaterThan(0);
    // … and the open-version branch never calls router.refresh().
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("delete success on a DIFFERENT version → router.refresh, no navigation", async () => {
    installFetch(() =>
      makeResponse({ success: true, data: { deletedVersionId: "ver_other" } }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleDeleteVersion("ver_other", {
        versionNumber: 2,
      });
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(navErrors.length).toBe(0);
  });

  it("ALREADY_PUBLISHED 409 → 'Published versions can't be deleted' toast + refresh", async () => {
    installFetch(() =>
      makeResponse({ success: false, error: "ALREADY_PUBLISHED" }, 409),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleDeleteVersion("ver_other", {
        versionNumber: 2,
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Published versions can't be deleted" }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(navErrors.length).toBe(0);
  });

  it("VERSION_IN_USE 409 → 'This version is in use by a campaign' toast, NO refresh/navigation", async () => {
    installFetch(() =>
      makeResponse({ success: false, error: "VERSION_IN_USE" }, 409),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.handleDeleteVersion("ver_other", {
        versionNumber: 2,
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "This version is in use by a campaign",
      }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(navErrors.length).toBe(0);
  });

  it("in-flight re-entry is blocked", async () => {
    const d = deferred<Response>();
    const { fetchMock } = installFetch(() => d.promise);
    const { result } = setup();

    await act(async () => {
      void result.current.handleDeleteVersion("ver_other", {
        versionNumber: 2,
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.deletingVersionId).toBe("ver_other");

    await act(async () => {
      void result.current.handleDeleteVersion("ver_other", {
        versionNumber: 2,
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(
        makeResponse({ success: true, data: { deletedVersionId: "ver_other" } }),
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Return shape
// ═══════════════════════════════════════════════════════════════════════════
describe("returned surface", () => {
  it("exposes the three lifecycle handlers + three in-flight ids", () => {
    const { result } = setup();
    expect(typeof result.current.handleArchiveVersion).toBe("function");
    expect(typeof result.current.handleUnarchiveVersion).toBe("function");
    expect(typeof result.current.handleDeleteVersion).toBe("function");
    expect(result.current.archivingVersionId).toBeNull();
    expect(result.current.unarchivingVersionId).toBeNull();
    expect(result.current.deletingVersionId).toBeNull();
  });
});
