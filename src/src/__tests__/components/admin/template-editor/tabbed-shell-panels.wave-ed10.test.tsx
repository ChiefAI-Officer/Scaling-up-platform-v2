/**
 * Wave ED10 (spec 19am-plan, T10) — TabbedShell seam: mount Preview + Settings.
 *
 * TESTS ONLY. Rendered through TemplateEditorTabbed (the real shell) using the
 * ED9-production forms-mode fixture (singleColumn + formsBuild), with the ED10
 * flag toggled per test. This locks the T10 integration:
 *
 *   ed10Active (previewSettings + formsBuild + single-column all on):
 *     - the tab bar shows Preview + Settings triggers,
 *     - NO Metadata trigger, NO Access <Link>,
 *     - the param-less default active tab is Preview,
 *     - <TabsContent value="preview"> mounts PreviewTab (a read-only respondent
 *       render — asserted via a PreviewTab-distinctive marker),
 *     - <TabsContent value="settings"> mounts SettingsTab (asserted via its
 *       AudienceCard) when ?tab=settings.
 *
 *   NOT ed10Active (the flag-OFF golden config):
 *     - Metadata trigger + Access <Link> present,
 *     - no Preview / Settings triggers or panels anywhere.
 *   (Byte-identity of the flag-OFF render is pinned by ed10-golden-snapshots +
 *    the frozen editor-byte-equivalence / three-pane-parity suites; this file
 *    only asserts presence/absence, not the exact DOM.)
 */

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ────────────────────────────────────────────────────────────────────────
// Mocks (mirror tabbed-shell.wave-ed10 / ed10-golden-snapshots)
// ────────────────────────────────────────────────────────────────────────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));

beforeEach(() => {
  toastMock.mockClear();
  mockSearchParams = new URLSearchParams("");
});
afterEach(() => cleanup());

// ────────────────────────────────────────────────────────────────────────
// Fixture — the ED9 production shell config (singleColumn + formsBuild),
// mirroring ed10-golden-snapshots.formsModeProps(). ED10 flag toggled per test.
// ────────────────────────────────────────────────────────────────────────
function shellProps(previewSettingsEnabled: boolean) {
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
      sections: [{ stableKey: "S1", name: "Section One" }],
      questions: [
        {
          stableKey: "S1_q1",
          sectionStableKey: "S1",
          label: "Q1 label",
          type: "SLIDER_LIKERT" as const,
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: [
      {
        id: "ver_2",
        versionNumber: 2,
        language: "en-US",
        publishedAt: null,
        contentHash: "abcdef012345",
      },
    ],
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    waveQEnabled: true,
    questionEditorUnlocked: true,
    findingsEnabled: true,
    conditionalAuthoringEnabled: true,
    testModeEnabled: true,
    safeToPublishEnabled: true,
    versionLifecycleEnabled: true,
    singleColumnEnabled: true,
    formsBuildEnabled: true,
    previewSettingsEnabled,
  };
}

// ════════════════════════════════════════════════════════════════════════
// ed10Active — Preview + Settings replace Metadata + Access
// ════════════════════════════════════════════════════════════════════════
describe("TabbedShell seam — ed10Active (Preview + Settings)", () => {
  it("tab bar: Preview + Settings triggers, NO Metadata trigger, NO Access link", () => {
    render(<TemplateEditorTabbed {...shellProps(true)} />);

    expect(screen.getByRole("tab", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
    // Build + Scoring & Tiers + Versions remain (shared triggers).
    expect(screen.getByRole("tab", { name: "Build" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Scoring & Tiers" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Versions" })).toBeInTheDocument();

    // Metadata trigger + Access link are gone under ED10.
    expect(screen.queryByRole("tab", { name: "Metadata" })).toBeNull();
    expect(screen.queryByTestId("template-editor-access-link")).toBeNull();
    // Sections stays folded in single mode (as it already is under ED9).
    expect(screen.queryByRole("tab", { name: "Sections" })).toBeNull();
  });

  it("param-less default active tab is Preview; PreviewTab is mounted", () => {
    render(<TemplateEditorTabbed {...shellProps(true)} />);

    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
      "data-state",
      "active",
    );
    // The preview panel is the mounted one …
    expect(screen.getByTestId("tab-panel-preview")).toBeInTheDocument();
    // … and it renders PreviewTab (distinctive read-only respondent copy).
    expect(
      screen.getByText(/exactly what respondents see/i),
    ).toBeInTheDocument();
    // The Settings panel is NOT mounted while Preview is the active tab.
    expect(screen.queryByTestId("tab-panel-settings")).toBeNull();
  });

  it("?tab=settings mounts SettingsTab", () => {
    mockSearchParams = new URLSearchParams("tab=settings");
    render(<TemplateEditorTabbed {...shellProps(true)} />);

    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("tab-panel-settings")).toBeInTheDocument();
    // SettingsTab-distinctive: the "who takes it & who sees results" card.
    expect(screen.getByTestId("settings-audience-card")).toBeInTheDocument();
    // Preview panel is unmounted while Settings is active.
    expect(screen.queryByTestId("tab-panel-preview")).toBeNull();
  });

  it("?tab=metadata resolves to Settings (Metadata absorbed — T3 routing)", () => {
    mockSearchParams = new URLSearchParams("tab=metadata");
    render(<TemplateEditorTabbed {...shellProps(true)} />);

    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("tab-panel-settings")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════
// NOT ed10Active — the flag-OFF shell (Metadata + Access, no Preview/Settings)
// ════════════════════════════════════════════════════════════════════════
describe("TabbedShell seam — flag OFF (Metadata + Access preserved)", () => {
  it("Metadata trigger + Access link present; no Preview/Settings triggers", () => {
    render(<TemplateEditorTabbed {...shellProps(false)} />);

    expect(screen.getByRole("tab", { name: "Metadata" })).toBeInTheDocument();
    expect(
      screen.getByTestId("template-editor-access-link"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
  });

  it("no Preview / Settings panels are mounted in any tab (flag OFF)", () => {
    // Build is the flag-OFF forms-mode default; the preview/settings panels
    // must not exist even as inactive mounts.
    render(<TemplateEditorTabbed {...shellProps(false)} />);
    expect(screen.queryByTestId("tab-panel-preview")).toBeNull();
    expect(screen.queryByTestId("tab-panel-settings")).toBeNull();

    // …and even when a stale ?tab=metadata routes to the Metadata panel, no
    // Preview/Settings surface leaks in.
    cleanup();
    mockSearchParams = new URLSearchParams("tab=metadata");
    render(<TemplateEditorTabbed {...shellProps(false)} />);
    expect(screen.getByTestId("tab-panel-metadata")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-panel-preview")).toBeNull();
    expect(screen.queryByTestId("tab-panel-settings")).toBeNull();
  });
});
