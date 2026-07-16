/**
 * Wave ED8 (spec 19ak §7; plan T8) — TabbedShell header pill + caption.
 *
 * TESTS ONLY. Rendered through TemplateEditorTabbed (the real shell) using
 * the F1 harness. Two behaviours:
 *   - Pill wording: flag ON derives the OPEN version's lifecycle status from
 *     `allVersions` (active / superseded / draft / archived); flag OFF keeps
 *     the exact legacy `v{n} (published|draft)` wording.
 *   - Caption language-scoping (the T7 UNCONDITIONAL fix): the "Published vN
 *     active since …" caption must come from the SAME language as the open
 *     version, so an en-US draft with only an es-ES published sibling never
 *     claims the ES version is active.
 *
 * The ED3/ED4 frozen guards are untouched — this is an additive wave suite.
 */

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ────────────────────────────────────────────────────────────────────────
// Mocks (mirrors TemplateEditorTabbed.test.tsx)
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
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_x/edit",
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
  mockSearchParams = new URLSearchParams("");
});

afterEach(() => {
  cleanup();
});

// ────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────
const baseTemplate = {
  id: "tpl_1",
  name: "Rockefeller Habits Checklist",
  alias: "RockHabits",
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

// A single-language history: v3 published (Active), v2 published
// (Superseded), v4 draft.
const versionsMulti = [
  {
    id: "en_v4",
    versionNumber: 4,
    language: "en-US",
    publishedAt: null,
    contentHash: "hash_en_v4",
  },
  {
    id: "en_v3",
    versionNumber: 3,
    language: "en-US",
    publishedAt: "2026-05-20T00:00:00.000Z",
    contentHash: "hash_en_v3",
  },
  {
    id: "en_v2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: "2026-05-10T00:00:00.000Z",
    contentHash: "hash_en_v2",
  },
];

// A history with an archived row (v3 Active, v1 published+archived).
const versionsArchived = [
  {
    id: "en_v3",
    versionNumber: 3,
    language: "en-US",
    publishedAt: "2026-05-20T00:00:00.000Z",
    contentHash: "hash_en_v3",
  },
  {
    id: "en_v1",
    versionNumber: 1,
    language: "en-US",
    publishedAt: "2026-05-01T00:00:00.000Z",
    contentHash: "hash_en_v1",
    archivedAt: "2026-05-05T00:00:00.000Z",
  },
];

function versionMeta(id: string) {
  const all = [...versionsMulti, ...versionsArchived];
  const v = all.find((x) => x.id === id)!;
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    language: v.language,
    publishedAt: v.publishedAt,
    contentHash: v.contentHash,
  };
}

function pillText() {
  return screen.getByTestId("template-editor-version-pill").textContent ?? "";
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────
describe("TabbedShell header pill — Wave ED8 (flag ON derives lifecycle status)", () => {
  it("Active version → 'v{n} (active)'", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={versionMeta("en_v3")}
        allVersions={versionsMulti}
        versionLifecycleEnabled
      />,
    );
    expect(pillText()).toMatch(/v3 \(active\)/i);
  });

  it("Superseded version → 'v{n} (superseded)'", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={versionMeta("en_v2")}
        allVersions={versionsMulti}
        versionLifecycleEnabled
      />,
    );
    expect(pillText()).toMatch(/v2 \(superseded\)/i);
  });

  it("Draft version → 'v{n} (draft)'", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={versionMeta("en_v4")}
        allVersions={versionsMulti}
        versionLifecycleEnabled
      />,
    );
    expect(pillText()).toMatch(/v4 \(draft\)/i);
  });

  it("Archived version → 'v{n} (archived)'", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={versionMeta("en_v1")}
        allVersions={versionsArchived}
        versionLifecycleEnabled
      />,
    );
    expect(pillText()).toMatch(/v1 \(archived\)/i);
  });
});

describe("TabbedShell header pill — Wave ED8 flag-OFF pins (legacy wording)", () => {
  it("published version → exactly 'v{n} (published)'", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={versionMeta("en_v3")}
        allVersions={versionsMulti}
      />,
    );
    expect(pillText()).toMatch(/v3 \(published\)/i);
    // Never leaks a lifecycle word when the flag is off.
    expect(pillText()).not.toMatch(/active|superseded|archived/i);
  });

  it("draft version → exactly 'v{n} (draft)'", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={versionMeta("en_v4")}
        allVersions={versionsMulti}
      />,
    );
    expect(pillText()).toMatch(/v4 \(draft\)/i);
  });
});

describe("TabbedShell caption — Wave ED8 language-scoped Active (T7 fix)", () => {
  const enUsDraft = {
    id: "enus_draft",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
    contentHash: "hash_enus_draft",
  };
  // An es-ES published sibling and NO en-US published sibling.
  const crossLangVersions = [
    {
      id: "eses_v1",
      versionNumber: 1,
      language: "es-ES",
      publishedAt: "2026-05-01T00:00:00.000Z",
      contentHash: "hash_eses_v1",
    },
    {
      id: "enus_draft",
      versionNumber: 2,
      language: "en-US",
      publishedAt: null,
      contentHash: "hash_enus_draft",
    },
  ];

  it("flag ON → the en-US draft caption does NOT claim the es-ES version is active", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={enUsDraft}
        allVersions={crossLangVersions}
        versionLifecycleEnabled
      />,
    );

    // The cross-language "Published v1 active since …" caption must NOT appear.
    expect(
      screen.queryByText(/Published v1 active since/i),
    ).not.toBeInTheDocument();
    // Flag ON removes the Metadata strip, so "(you are here)" is unique to
    // the header caption — the correct fallback for a draft with no
    // same-language published sibling.
    expect(screen.getByText(/\(you are here\)/i)).toBeInTheDocument();
  });

  it("flag OFF → same unconditional language scope (no cross-language 'active since')", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={enUsDraft}
        allVersions={crossLangVersions}
      />,
    );

    expect(
      screen.queryByText(/Published v1 active since/i),
    ).not.toBeInTheDocument();
  });
});
