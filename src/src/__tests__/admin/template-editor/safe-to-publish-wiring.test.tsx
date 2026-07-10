/**
 * Wave ED2 (spec 19ad) — Safe-to-Publish badge wiring into
 * TemplateEditorTabbed. Mirrors the render harness used for the F1 chrome
 * suite (src/__tests__/components/admin/TemplateEditorTabbed.test.tsx):
 * same mocks for useToast/next-navigation, same template/version fixtures.
 *
 * The badge is PASSIVE — these tests only assert presence/absence via
 * `data-testid="safe-to-publish-badge"`, gated on `!isPublished &&
 * safeToPublishEnabled`, exactly like the existing Test Mode button.
 */

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ────────────────────────────────────────────────────────────────────────
// Mocks (copied from TemplateEditorTabbed.test.tsx's harness)
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
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_1/edit",
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
  (window.confirm as jest.Mock).mockClear?.();
  mockSearchParams = new URLSearchParams("");
});

afterEach(() => {
  cleanup();
});

// Canonical template / version props the editor receives from the page
// server component.
const baseTemplate = {
  id: "tpl_1",
  name: "Rockefeller Habits Checklist",
  alias: "RockHabits",
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

const draftVersion = {
  id: "ver_2",
  versionNumber: 2,
  language: "en-US",
  publishedAt: null,
  contentHash: "abcdef0123456789",
};

const publishedVersion = {
  id: "ver_1",
  versionNumber: 1,
  language: "en-US",
  publishedAt: "2026-05-05T00:00:00.000Z",
  contentHash: "abcdef0123456789",
};

const allVersions = [
  {
    id: "ver_1",
    versionNumber: 1,
    language: "en-US",
    publishedAt: "2026-05-05T00:00:00.000Z",
  },
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────
describe("Wave ED2 — Safe-to-Publish badge wiring", () => {
  it("shows the badge on a DRAFT version when the flag is on", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
        safeToPublishEnabled
      />,
    );

    expect(screen.getByTestId("safe-to-publish-badge")).toBeInTheDocument();
  });

  it("hides the badge on a DRAFT version when the flag is off (default)", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
        safeToPublishEnabled={false}
      />,
    );

    expect(screen.queryByTestId("safe-to-publish-badge")).toBeNull();
  });

  it("hides the badge on a PUBLISHED version even when the flag is on", () => {
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={publishedVersion}
        allVersions={allVersions}
        safeToPublishEnabled
      />,
    );

    expect(screen.queryByTestId("safe-to-publish-badge")).toBeNull();
  });
});
