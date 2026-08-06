import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

let mockSearchParams = new URLSearchParams("tab=settings");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));

function shellProps(overrides: {
  alias?: string;
  previewSettingsEnabled?: boolean;
  reportStylesEnabled?: boolean;
  defaultReportStyle?: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD";
} = {}) {
  return {
    template: {
      id: "tpl_1",
      name: "Scaling Up Full",
      alias: overrides.alias ?? "scaling-up-full",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
      defaultReportStyle: overrides.defaultReportStyle ?? "CLASSIC",
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "enUS",
      publishedAt: "2026-08-05T00:00:00.000Z",
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "Section One" }],
      questions: [],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: [{
      id: "ver_2",
      versionNumber: 2,
      language: "enUS",
      publishedAt: "2026-08-05T00:00:00.000Z",
      contentHash: "abcdef012345",
    }],
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    singleColumnEnabled: true,
    formsBuildEnabled: true,
    previewSettingsEnabled: overrides.previewSettingsEnabled ?? true,
    reportStylesEnabled: overrides.reportStylesEnabled ?? true,
  };
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams("tab=settings");
  toastMock.mockClear();
  global.fetch = jest.fn();
});

afterEach(() => cleanup());

describe("admin default report appearance", () => {
  it("appears after Audience for every template when ED10 and report styles are available", () => {
    render(<TemplateEditorTabbed {...shellProps()} />);

    const audience = screen.getByTestId("settings-audience-card");
    const defaultAppearance = screen.getByTestId("settings-default-report-style-card");
    expect(audience.compareDocumentPosition(defaultAppearance)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(defaultAppearance).getByText("Default report appearance")).toBeInTheDocument();
    expect(within(defaultAppearance).getByText(/future campaigns only/i)).toBeInTheDocument();
    expect(within(defaultAppearance).getByRole("button", { name: "Save default" })).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByRole("tablist")[0].className).toContain(
      "flex items-center gap-5 border-b border-border overflow-x-auto mb-6",
    );
  });

  it.each([
    ["report styles unavailable", { reportStylesEnabled: false }],
    ["ED10 unavailable", { previewSettingsEnabled: false }],
  ])("is absent for %s", (_label, overrides) => {
    render(<TemplateEditorTabbed {...shellProps(overrides)} />);

    expect(screen.queryByTestId("settings-default-report-style-card")).toBeNull();
  });

  it("uses the canonical qualitative preview anatomy for qualitative aliases", () => {
    render(<TemplateEditorTabbed {...shellProps({ alias: "qsp-v2" })} />);

    expect(
      within(screen.getByTestId("settings-default-report-style-card")).getByRole(
        "img",
        { name: "Classic Cover preview" },
      ),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/qualitative/classic/cover.webp",
    );
  });

  it("disables style changes while the template-row PATCH is pending", async () => {
    let resolvePatch!: (response: {
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void;
    (global.fetch as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = resolve;
      }),
    );
    render(<TemplateEditorTabbed {...shellProps()} />);

    const card = screen.getByTestId("settings-default-report-style-card");
    const boardroom = within(card).getByRole("radio", { name: /executive boardroom/i });
    const dashboard = within(card).getByRole("radio", { name: /modern dashboard/i });
    fireEvent.click(boardroom);
    fireEvent.click(within(card).getByRole("button", { name: "Save default" }));

    await waitFor(() => {
      within(card).getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());
    });
    expect(within(card).getByText("Saving default…")).toBeInTheDocument();
    expect(
      within(card).queryByText(/changes are unavailable after the first completed response/i),
    ).toBeNull();

    fireEvent.click(dashboard);
    expect(boardroom).toBeChecked();
    expect(dashboard).not.toBeChecked();
    expect(
      within(card).getByRole("img", { name: "Executive Boardroom Cover preview" }),
    ).toBeInTheDocument();

    resolvePatch({
      ok: true,
      json: async () => ({
        success: true,
        data: { defaultReportStyle: "EXECUTIVE_BOARDROOM" },
      }),
    });
    await waitFor(() => expect(boardroom).not.toBeDisabled());
  });

  it("supports keyboard style selection with an announced selected radio", () => {
    render(<TemplateEditorTabbed {...shellProps()} />);

    const card = screen.getByTestId("settings-default-report-style-card");
    const classic = within(card).getByRole("radio", { name: /classic/i });
    const boardroom = within(card).getByRole("radio", { name: /executive boardroom/i });
    classic.focus();
    fireEvent.keyDown(classic, { key: "ArrowRight" });

    expect(boardroom).toHaveFocus();
    expect(boardroom).toBeChecked();
    expect(within(card).getByText("Selected")).toBeInTheDocument();
  });

  it("saves through the immediate template-row PATCH and treats the returned enum as server truth", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { defaultReportStyle: "MODERN_DASHBOARD" },
      }),
    });
    render(<TemplateEditorTabbed {...shellProps()} />);

    const card = screen.getByTestId("settings-default-report-style-card");
    fireEvent.click(within(card).getByRole("radio", { name: /executive boardroom/i }));
    fireEvent.click(within(card).getByRole("button", { name: "Save default" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/assessment-templates/tpl_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ defaultReportStyle: "EXECUTIVE_BOARDROOM" }),
        }),
      );
    });
    await waitFor(() => {
      expect(within(card).getByRole("radio", { name: /modern dashboard/i })).toBeChecked();
      expect(within(card).getByRole("button", { name: "Save default" })).toBeDisabled();
    });
  });

  it("keeps the saved selection and shows the inline API error when the save fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Report appearance is unavailable." }),
    });
    render(<TemplateEditorTabbed {...shellProps({ defaultReportStyle: "EXECUTIVE_BOARDROOM" })} />);

    const card = screen.getByTestId("settings-default-report-style-card");
    fireEvent.click(within(card).getByRole("radio", { name: /modern dashboard/i }));
    fireEvent.click(within(card).getByRole("button", { name: "Save default" }));

    await waitFor(() => {
      expect(within(card).getByText("Report appearance is unavailable.")).toBeInTheDocument();
    });
    expect(within(card).getByRole("radio", { name: /modern dashboard/i })).toBeChecked();
    expect(within(card).getByRole("button", { name: "Save default" })).not.toBeDisabled();
  });
});
