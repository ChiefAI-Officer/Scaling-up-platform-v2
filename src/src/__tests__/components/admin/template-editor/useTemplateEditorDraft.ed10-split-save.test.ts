/**
 * Wave ED10 (spec 19am-plan, Task 7) — split save model in the editor draft
 * hook (`useTemplateEditorDraft`).
 *
 * Two lanes:
 *   1. Save-Draft (version-governed) — the metadata PATCH body. The
 *      invitation email STAYS here (it's in the version contentHash,
 *      draft-only). When ED10 is ACTIVE the per-card Settings tab owns
 *      aggregationMode + the results-email content, so those are TRIMMED out
 *      of this body. When ED10 is NOT active (default) the body is the FULL
 *      set exactly as today — the flag-OFF trap: the legacy MetadataTab still
 *      edits those fields via Save Draft, so trimming unconditionally would
 *      silently stop persisting them.
 *   2. Per-card Save (`handleTemplateRowSave`) — an immediate PATCH of
 *      template-row fields (NOT hashed, NOT the version), fired on an explicit
 *      Save click, editable even while the version is published (mirrors the
 *      Wave-Q `sendResultsDefault` path). The results-email approval carries
 *      approved + subject + body TOGETHER in ONE body (SEC-H2 atomic hash).
 */

import { renderHook, act } from "@testing-library/react";

import { useTemplateEditorDraft } from "@/components/admin/template-editor/hooks/useTemplateEditorDraft";
import type {
  TemplateEditorTabbedTemplate,
  TemplateEditorTabbedVersion,
} from "@/components/admin/template-editor/TabbedShell";

// ── Mocks (the hook reads useToast + useRouter at the top) ────────────────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

// ── Fetch capture (mirrors template-editor-send-results-default.test.tsx) ──
interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}
let fetchCalls: FetchCall[];
let patchStatus: number;

function installFetch() {
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
      return {
        ok: patchStatus >= 200 && patchStatus < 300,
        status: patchStatus,
        json: async () =>
          patchStatus >= 200 && patchStatus < 300
            ? { success: true }
            : { success: false, error: "BOOM" },
      } as unknown as Response;
    },
  ) as unknown as typeof fetch;
}

// ── Fixtures ──────────────────────────────────────────────────────────────
const template: TemplateEditorTabbedTemplate = {
  id: "tpl_1",
  name: "Alpha",
  alias: "ALPHA",
  description: null,
  invitationSubject: "You're invited",
  invitationBodyMarkdown: "Hi",
  resultsEmailSubject: null,
  resultsEmailBodyMarkdown: null,
  resultsEmailContentApproved: false,
  aggregationMode: "FULL_VISIBILITY",
  accessMode: "INVITED",
  sendResultsDefault: false,
};

function makeVersion(
  publishedAt: string | null = null,
): TemplateEditorTabbedVersion {
  return {
    id: "ver_1",
    versionNumber: 1,
    language: "en-US",
    publishedAt,
    contentHash: "abcdef012345",
    questions: [],
    sections: [],
    scoringConfig: {},
    reportConfig: null,
  };
}

function renderDraft(
  opts: { ed10Active?: boolean; publishedAt?: string | null } = {},
) {
  return renderHook(() =>
    useTemplateEditorDraft({
      template,
      version: makeVersion(opts.publishedAt ?? null),
      publishedQuestionKeys: [],
      publishedOptionKeys: {},
      questionEditorUnlocked: true,
      waveQEnabled: false,
      ed10Active: opts.ed10Active ?? false,
    }),
  );
}

const TEMPLATE_PATCH_URL = "/api/admin/assessment-templates/tpl_1";
function templatePatches(): FetchCall[] {
  return fetchCalls.filter(
    (c) => c.method === "PATCH" && c.url === TEMPLATE_PATCH_URL,
  );
}

beforeEach(() => {
  toastMock.mockClear();
  installFetch();
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════
// Lane 1 — Save-Draft metadata PATCH body (the flag-OFF trap)
// ════════════════════════════════════════════════════════════════════════
describe("useTemplateEditorDraft — Save-Draft metadata body (ED10 trim)", () => {
  it("ed10Active=false (default): body INCLUDES aggregationMode + results-email fields (byte-identical to today)", async () => {
    const { result } = renderDraft({ ed10Active: false });

    act(() => {
      result.current.handleTemplateFieldChange({ name: "Renamed" });
    });
    await act(async () => {
      await result.current.handleSaveDraft();
    });

    const patches = templatePatches();
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({
      name: "Renamed",
      description: null,
      invitationSubject: "You're invited",
      invitationBodyMarkdown: "Hi",
      aggregationMode: "FULL_VISIBILITY",
      resultsEmailSubject: null,
      resultsEmailBodyMarkdown: null,
      resultsEmailContentApproved: false,
    });
  });

  it("ed10Active=true: body EXCLUDES aggregationMode + results-email; keeps name/description/invitation*", async () => {
    const { result } = renderDraft({ ed10Active: true });

    act(() => {
      result.current.handleTemplateFieldChange({ name: "Renamed" });
    });
    await act(async () => {
      await result.current.handleSaveDraft();
    });

    const patches = templatePatches();
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({
      name: "Renamed",
      description: null,
      invitationSubject: "You're invited",
      invitationBodyMarkdown: "Hi",
    });
    // The per-card lane owns these — they must NOT ride the Save-Draft body.
    expect(patches[0].body).not.toHaveProperty("aggregationMode");
    expect(patches[0].body).not.toHaveProperty("resultsEmailSubject");
    expect(patches[0].body).not.toHaveProperty("resultsEmailBodyMarkdown");
    expect(patches[0].body).not.toHaveProperty("resultsEmailContentApproved");
  });
});

// ════════════════════════════════════════════════════════════════════════
// Lane 2 — per-card Save (handleTemplateRowSave)
// ════════════════════════════════════════════════════════════════════════
describe("useTemplateEditorDraft — handleTemplateRowSave (per-card immediate save)", () => {
  it("{aggregationMode} PATCHes immediately, merges into templateValues, does NOT flip isAnyDirty", async () => {
    const { result } = renderDraft({ ed10Active: true });
    expect(result.current.isAnyDirty).toBe(false);

    await act(async () => {
      await result.current.handleTemplateRowSave({
        aggregationMode: "CEO_ONLY",
      });
    });

    const patches = templatePatches();
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ aggregationMode: "CEO_ONLY" });
    expect(result.current.templateValues.aggregationMode).toBe("CEO_ONLY");
    // The per-card lane is immediate — it must never dirty the Save-Draft flow.
    expect(result.current.isAnyDirty).toBe(false);
  });

  it("works on a PUBLISHED version (template-row field, not gated by isReadOnly)", async () => {
    const { result } = renderDraft({
      ed10Active: true,
      publishedAt: "2026-05-05T00:00:00.000Z",
    });

    await act(async () => {
      await result.current.handleTemplateRowSave({
        aggregationMode: "CEO_ONLY",
      });
    });

    const patches = templatePatches();
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ aggregationMode: "CEO_ONLY" });
    expect(result.current.templateValues.aggregationMode).toBe("CEO_ONLY");
  });

  it("SEC-H2: sends resultsEmailContentApproved + subject + body TOGETHER in ONE body", async () => {
    const { result } = renderDraft({ ed10Active: true });

    await act(async () => {
      await result.current.handleTemplateRowSave({
        resultsEmailContentApproved: true,
        resultsEmailSubject: "Your results",
        resultsEmailBodyMarkdown: "Here they are",
      });
    });

    const patches = templatePatches();
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({
      resultsEmailContentApproved: true,
      resultsEmailSubject: "Your results",
      resultsEmailBodyMarkdown: "Here they are",
    });
    // Local mirror so the tab reflects the persisted approval immediately.
    expect(result.current.templateValues.resultsEmailContentApproved).toBe(
      true,
    );
    expect(result.current.templateValues.resultsEmailSubject).toBe(
      "Your results",
    );
    expect(result.current.templateValues.resultsEmailBodyMarkdown).toBe(
      "Here they are",
    );
  });

  it("on a failed PATCH sets templateRowError, does NOT merge, and toasts destructively", async () => {
    const { result } = renderDraft({ ed10Active: true });
    patchStatus = 500;

    await act(async () => {
      await result.current.handleTemplateRowSave({
        aggregationMode: "CEO_ONLY",
      });
    });

    expect(result.current.templateRowError).toBeTruthy();
    // Unchanged local value — the failed write never merged.
    expect(result.current.templateValues.aggregationMode).toBe(
      "FULL_VISIBILITY",
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });
});
