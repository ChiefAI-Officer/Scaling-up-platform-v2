/**
 * Wave ED8 (spec 19ak §7; plan T8) — MetadataTab lifecycle gating.
 *
 * TESTS ONLY. The Metadata tab's "Version History" strip labels EVERY
 * published version "● Active", which is wrong under the lifecycle model
 * (Active is derived, exactly one per language). ED8 removes the strip when
 * `versionLifecycleEnabled` is true; the Versions tab becomes the single
 * lifecycle surface. Flag OFF renders the strip byte-identically (pinned
 * here + in the frozen F2 MetadataTab suite).
 *
 * Rendered through TemplateEditorTabbed (the real shell) so the flag threads
 * exactly as production does. Harness/fixtures mirror MetadataTab.test.tsx.
 */

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ────────────────────────────────────────────────────────────────────────
// Mocks (mirrors MetadataTab.test.tsx)
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
  description: "A good strategy falls apart without great execution.",
  invitationSubject: "{{respondentFirstName}}, your checklist is ready",
  invitationBodyMarkdown: "Hi {{respondentFirstName}},\n\nYou've been invited.",
  resultsEmailSubject: null as string | null,
  resultsEmailBodyMarkdown: null as string | null,
  resultsEmailContentApproved: false,
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

const sectionsFixture = [
  { stableKey: "S1", name: "Section 1 — Strategy", description: "" },
  { stableKey: "S2", name: "Section 2 — Execution", description: "" },
];

const questionsFixture = [
  { stableKey: "Q1", sectionStableKey: "S1", label: "Q1 label" },
  { stableKey: "Q2", sectionStableKey: "S2", label: "Q2 label" },
];

const draftVersion = {
  id: "ver_2",
  versionNumber: 2,
  language: "en-US",
  publishedAt: null,
  contentHash: "abcdef0123456789",
  questions: questionsFixture,
  sections: sectionsFixture,
  scoringConfig: { tierMetric: "overallAvg", passThreshold: 3, tiers: [] },
  reportConfig: null,
};

const allVersions = [
  {
    id: "ver_1",
    versionNumber: 1,
    language: "en-US",
    publishedAt: "2026-05-05T00:00:00.000Z",
    contentHash: "abcdef0123456789",
  },
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
    contentHash: "abcdef0123456789",
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────
describe("MetadataTab — Wave ED8 Version History strip gating", () => {
  it("flag ON → the Version History strip is NOT rendered", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
        versionLifecycleEnabled
      />,
    );

    // The strip's per-version cards + its heading are gone.
    expect(
      screen.queryByTestId("version-history-card-ver_1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("version-history-card-ver_2"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Version History$/)).not.toBeInTheDocument();
    // And the strip's misleading all-"● Active" label never appears.
    expect(screen.queryByText(/●\s*Active/)).not.toBeInTheDocument();
  });

  it("flag OFF → the Version History strip renders (byte-identical pre-ED8)", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    expect(screen.getByText(/^Version History$/)).toBeInTheDocument();
    expect(
      screen.getByTestId("version-history-card-ver_1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("version-history-card-ver_2"),
    ).toBeInTheDocument();
  });

  it("flag OFF (explicit false) also renders the strip", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
        versionLifecycleEnabled={false}
      />,
    );

    expect(
      screen.getByTestId("version-history-card-ver_2"),
    ).toBeInTheDocument();
  });
});
