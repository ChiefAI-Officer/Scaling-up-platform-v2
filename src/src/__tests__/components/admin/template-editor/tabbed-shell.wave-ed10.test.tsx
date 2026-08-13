/**
 * Wave ED10 (spec 19am-plan, T2) — TabbedShell header access/aggregation pills.
 *
 * TESTS ONLY. Rendered through TemplateEditorTabbed (the real shell) using the
 * ED10-golden forms-mode fixture. One behaviour:
 *   - The header access/aggregation pill TEXT is humanized through the
 *     enum-label maps ("Invited" / "Everyone" / "CEO-only" / "Public") EXACTLY
 *     when `ed10Active` — i.e. previewSettingsEnabled && formsBuildEnabled &&
 *     the single-column authoring mode. Otherwise the raw enum shows
 *     (INVITED / FULL_VISIBILITY), byte-identical to today.
 *
 * The pill CLASSES (wf-pill-access-invited / wf-pill-agg-full) are static and
 * do NOT change — only the visible text does. So the ED10-golden + frozen
 * byte-equivalence / three-pane-parity suites stay green: none of them pass
 * `previewSettingsEnabled`, so `ed10Active` is false and the pills stay raw.
 */

import React from "react";
import { render, cleanup, screen } from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ────────────────────────────────────────────────────────────────────────
// Mocks (mirror ed10-golden-snapshots / tabbed-shell.wave-ed8)
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
type Overrides = {
  aggregationMode?: "FULL_VISIBILITY" | "CEO_ONLY";
  accessMode?: "INVITED" | "PUBLIC";
  previewSettingsEnabled?: boolean;
  singleColumnEnabled?: boolean;
  formsBuildEnabled?: boolean;
  mobileResponsiveEnabled?: boolean;
};

function shellProps(o: Overrides = {}) {
  return {
    template: {
      id: "tpl_1",
      name: "Alpha Template",
      alias: "ALPHA",
      aggregationMode: o.aggregationMode ?? ("FULL_VISIBILITY" as const),
      accessMode: o.accessMode ?? ("INVITED" as const),
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
    singleColumnEnabled: o.singleColumnEnabled ?? true,
    formsBuildEnabled: o.formsBuildEnabled ?? true,
    previewSettingsEnabled: o.previewSettingsEnabled ?? false,
    mobileResponsiveEnabled: o.mobileResponsiveEnabled ?? false,
  };
}

function accessPill(container: HTMLElement): string {
  return (
    container.querySelector(".wf-pill-access-invited")?.textContent?.trim() ?? ""
  );
}
function aggPill(container: HTMLElement): string {
  return container.querySelector(".wf-pill-agg-full")?.textContent?.trim() ?? "";
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────
describe("TabbedShell header pills — Wave ED10 humanized when ed10Active", () => {
  it("all three flags on → 'Invited' / 'Everyone'", () => {
    const { container } = render(
      <TemplateEditorTabbed {...shellProps({ previewSettingsEnabled: true })} />,
    );
    expect(accessPill(container)).toBe("Invited");
    expect(aggPill(container)).toBe("Everyone");
  });

  it("CEO_ONLY aggregation → 'CEO-only'", () => {
    const { container } = render(
      <TemplateEditorTabbed
        {...shellProps({
          previewSettingsEnabled: true,
          aggregationMode: "CEO_ONLY",
        })}
      />,
    );
    expect(aggPill(container)).toBe("CEO-only");
  });

  it("PUBLIC access → 'Public'", () => {
    const { container } = render(
      <TemplateEditorTabbed
        {...shellProps({ previewSettingsEnabled: true, accessMode: "PUBLIC" })}
      />,
    );
    expect(accessPill(container)).toBe("Public");
  });

  it("keeps the same static pill classes (only text changes)", () => {
    const { container } = render(
      <TemplateEditorTabbed {...shellProps({ previewSettingsEnabled: true })} />,
    );
    expect(container.querySelector(".wf-pill-access-invited")).not.toBeNull();
    expect(container.querySelector(".wf-pill-agg-full")).not.toBeNull();
  });
});

describe("TabbedShell header pills — Wave ED10 raw enums when NOT ed10Active", () => {
  it("ED10 flag OFF (the golden config) → raw 'INVITED' / 'FULL_VISIBILITY'", () => {
    const { container } = render(
      <TemplateEditorTabbed {...shellProps({ previewSettingsEnabled: false })} />,
    );
    expect(accessPill(container)).toBe("INVITED");
    expect(aggPill(container)).toBe("FULL_VISIBILITY");
  });

  it("ED10 flag ON but NOT forms-build → raw enums (gate needs formsBuild)", () => {
    const { container } = render(
      <TemplateEditorTabbed
        {...shellProps({
          previewSettingsEnabled: true,
          formsBuildEnabled: false,
        })}
      />,
    );
    expect(accessPill(container)).toBe("INVITED");
    expect(aggPill(container)).toBe("FULL_VISIBILITY");
  });

  it("ED10 flag ON but NOT single-column (legacy mode) → raw enums", () => {
    const { container } = render(
      <TemplateEditorTabbed
        {...shellProps({
          previewSettingsEnabled: true,
          singleColumnEnabled: false,
          formsBuildEnabled: false,
        })}
      />,
    );
    expect(accessPill(container)).toBe("INVITED");
    expect(aggPill(container)).toBe("FULL_VISIBILITY");
  });
});

describe("TabbedShell mobile-responsive presentation", () => {
  it("bounds the ED10 tab rail and stacks the header action cluster only when enabled", () => {
    render(
      <TemplateEditorTabbed
        {...shellProps({
          previewSettingsEnabled: true,
          mobileResponsiveEnabled: true,
        })}
      />,
    );

    expect(
      screen.getByRole("tablist", { name: "Template editor tabs" }),
    ).toHaveAttribute("data-responsive-tabs");
    expect(screen.getByTestId("template-editor-actions")).toHaveClass("flex-col");
    expect(screen.getByTestId("template-editor-actions")).toHaveClass("sm:flex-row");
    expect(screen.getByTestId("template-editor-save-draft-btn")).toBeVisible();
    expect(screen.getByTestId("template-editor-publish-btn")).toBeVisible();
  });

  it("keeps the legacy tab rail and header action DOM untouched when disabled", () => {
    const { container } = render(
      <TemplateEditorTabbed
        {...shellProps({
          previewSettingsEnabled: true,
          mobileResponsiveEnabled: false,
        })}
      />,
    );

    expect(
      screen.getByRole("tablist"),
    ).not.toHaveAttribute("data-responsive-tabs");
    expect(container.querySelector(".wf-page-action-row")).toHaveClass(
      "wf-page-action-row",
    );
    expect(container.querySelector(".wf-page-action-row")).not.toHaveClass("flex-col");
    expect(screen.queryByTestId("template-editor-actions")).not.toBeInTheDocument();
  });
});
