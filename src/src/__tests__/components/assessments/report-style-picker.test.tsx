import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReportStylePicker } from "@/components/assessments/ReportStylePicker";
import type { ReportStyleKey } from "@/lib/assessments/report-style-registry";

function PickerHarness({
  initialValue = "CLASSIC",
  ...props
}: Omit<React.ComponentProps<typeof ReportStylePicker>, "value" | "onChange"> & {
  initialValue?: ReportStyleKey;
}) {
  const [value, setValue] = useState<ReportStyleKey>(initialValue);

  return <ReportStylePicker value={value} onChange={setValue} {...props} />;
}

describe("ReportStylePicker", () => {
  it("renders the three catalog options with their non-color selection details", () => {
    render(<PickerHarness initialValue="EXECUTIVE_BOARDROOM" />);

    expect(screen.getByRole("group", { name: "Report style" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /classic/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /executive boardroom/i })).toBeChecked();
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByText("A clear, familiar report presentation.")).toBeInTheDocument();
    expect(screen.getByText("Editorial, restrained, and board-ready.")).toBeInTheDocument();
    expect(screen.getByText("Compact, visual, and data-forward.")).toBeInTheDocument();
    expect(screen.getAllByText(/Paper format:/)).toHaveLength(3);
  });

  it("starts with compact cards and no mounted preview assets", () => {
    render(<PickerHarness initialValue="EXECUTIVE_BOARDROOM" />);

    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /executive boardroom/i })).toBeChecked();
    expect(screen.getByText("Editorial, restrained, and board-ready.")).toBeInTheDocument();
    expect(screen.getAllByText(/Paper format:/)).toHaveLength(3);

    const selectedCard = screen
      .getByRole("radio", { name: /executive boardroom/i })
      .closest("label");
    expect(selectedCard).toHaveClass("p-3");
    expect(selectedCard).toHaveTextContent("Selected");

    const disclosure = screen.getByRole("button", { name: "Show preview" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveAttribute("aria-controls");
    expect(screen.queryByRole("tablist", { name: "Report style preview pages" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows only the active preview image and hides it again", () => {
    render(<PickerHarness initialValue="MODERN_DASHBOARD" />);

    const show = screen.getByRole("button", { name: "Show preview" });
    const regionId = show.getAttribute("aria-controls");
    fireEvent.click(show);

    expect(screen.getByRole("button", { name: "Hide preview" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(document.getElementById(regionId!)).toHaveAttribute("role", "region");
    expect(screen.getByRole("img", { name: "Modern Dashboard Cover preview" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(screen.getByRole("img", { name: "Modern Dashboard Summary preview" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Modern Dashboard Cover preview" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByRole("tablist", { name: "Report style preview pages" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("preserves the active page and disclosure while changing styles", () => {
    render(<PickerHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    fireEvent.click(screen.getByRole("tab", { name: "Detail" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

    expect(screen.getByRole("tab", { name: "Detail" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("radio", { name: /executive boardroom/i }));
    expect(screen.getByRole("button", { name: "Hide preview" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("img", { name: "Executive Boardroom Detail preview" }),
    ).toBeInTheDocument();
  });

  it("resets a fresh mount to a collapsed Cover preview", () => {
    const firstMount = render(<PickerHarness initialValue="MODERN_DASHBOARD" />);

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    fireEvent.click(screen.getByRole("tab", { name: "Detail" }));
    expect(screen.getByRole("tab", { name: "Detail" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    firstMount.unmount();

    render(<PickerHarness initialValue="MODERN_DASHBOARD" />);
    expect(screen.getByRole("button", { name: "Show preview" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(screen.getByRole("tab", { name: "Cover" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("img", { name: "Modern Dashboard Cover preview" }),
    ).toBeInTheDocument();
  });

  it("exposes the disclosure as a focusable native button and preserves focus while toggling", () => {
    render(<PickerHarness />);

    const show = screen.getByRole("button", { name: "Show preview" });
    expect(show).toHaveAttribute("type", "button");
    expect(show).toBeEnabled();
    expect(show.tabIndex).toBe(0);
    show.focus();
    expect(show).toHaveFocus();

    fireEvent.click(show);
    const hide = screen.getByRole("button", { name: "Hide preview" });
    expect(hide).toHaveFocus();
    expect(hide).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(hide);
    expect(screen.getByRole("button", { name: "Show preview" })).toHaveFocus();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("uses project semantic tokens for selection, focus, surfaces, and preview failure states", () => {
    const { container } = render(<PickerHarness />);
    const classic = screen.getByRole("radio", { name: /classic/i });
    const option = classic.closest("label");

    expect(option).toHaveClass("border-border bg-background text-foreground");
    expect(option?.className).toContain("focus-within:outline-ring");
    expect(option?.className).toContain("has-[:checked]:border-primary");

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    fireEvent.error(screen.getByRole("img", { name: "Classic Cover preview" }));
    const failure = screen.getByRole("status");
    expect(failure).toHaveClass("border-border bg-muted/20 text-foreground");
    expect(screen.getByRole("button", { name: "Retry" })).toHaveClass(
      "border-border text-foreground focus:outline-ring",
    );

    expect(container.innerHTML).not.toMatch(/(?:slate-|blue-700|bg-white)/);
  });

  it("changes the selected native radio with click and arrow-key interaction", () => {
    render(<PickerHarness />);

    const classic = screen.getByRole("radio", { name: /classic/i });
    const boardroom = screen.getByRole("radio", { name: /executive boardroom/i });
    const dashboard = screen.getByRole("radio", { name: /modern dashboard/i });

    fireEvent.click(boardroom);
    expect(boardroom).toBeChecked();
    expect(classic).not.toBeChecked();

    fireEvent.keyDown(boardroom, { key: "ArrowRight" });
    expect(dashboard).toBeChecked();
    expect(boardroom).not.toBeChecked();
    expect(dashboard).toHaveFocus();
  });

  it("changes preview pages through selected keyboard tab buttons", () => {
    render(<PickerHarness initialValue="MODERN_DASHBOARD" />);

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

    const cover = screen.getByRole("tab", { name: "Cover" });
    const summary = screen.getByRole("tab", { name: "Summary" });
    const detail = screen.getByRole("tab", { name: "Detail" });

    expect(cover).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: "Modern Dashboard Cover preview" })).toBeInTheDocument();

    cover.focus();
    fireEvent.keyDown(cover, { key: "ArrowRight" });
    expect(summary).toHaveFocus();
    expect(summary).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: "Modern Dashboard Summary preview" })).toBeInTheDocument();

    fireEvent.keyDown(summary, { key: "Enter" });
    expect(summary).toHaveAttribute("aria-selected", "true");
    expect(cover).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("img", { name: "Modern Dashboard Summary preview" })).toBeInTheDocument();

    fireEvent.click(detail);
    expect(detail).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: "Modern Dashboard Detail preview" })).toBeInTheDocument();
  });

  it("selects the committed preview anatomy without changing appearance selection", () => {
    render(
      <PickerHarness
        initialValue="EXECUTIVE_BOARDROOM"
        previewAnatomy="qualitative"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

    expect(screen.getByRole("radio", { name: /executive boardroom/i })).toBeChecked();
    expect(
      screen.getByRole("img", { name: "Executive Boardroom Cover preview" }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/qualitative/executive-boardroom/cover.webp",
    );
  });

  it("keeps every tab panel mounted for its aria-controls relationship while only mounting the active image", () => {
    render(<PickerHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

    screen.getAllByRole("tab").forEach((tab) => {
      const panelId = tab.getAttribute("aria-controls");
      expect(panelId).toBeTruthy();
      expect(document.getElementById(panelId!)).toHaveAttribute("role", "tabpanel");
    });
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(3);
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("keeps style selection usable after a preview failure and remounts only the failed image on retry", () => {
    const { container } = render(<PickerHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    const initialPreview = screen.getByRole("img", { name: "Classic Cover preview" });
    fireEvent.error(initialPreview);

    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Classic Cover preview" })).not.toBeInTheDocument();

    const boardroom = screen.getByRole("radio", { name: /executive boardroom/i });
    expect(boardroom).not.toBeDisabled();
    fireEvent.click(boardroom);
    expect(boardroom).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /classic/i }));
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const retriedPreview = screen.getByRole("img", { name: "Classic Cover preview" });
    expect(retriedPreview).not.toBe(initialPreview);
    expect(container.querySelectorAll('img[alt="Classic Cover preview"]')).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /classic/i })).toBeChecked();
  });

  it("scopes a qualitative Detail failure to its exact style, anatomy, and page", () => {
    const { rerender } = render(
      <PickerHarness
        initialValue="MODERN_DASHBOARD"
        previewAnatomy="qualitative"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    fireEvent.click(screen.getByRole("tab", { name: "Detail" }));
    fireEvent.error(
      screen.getByRole("img", { name: "Modern Dashboard Detail preview" }),
    );
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();

    rerender(
      <PickerHarness
        initialValue="MODERN_DASHBOARD"
        previewAnatomy="sparse-custom"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Modern Dashboard Detail preview" }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/sparse-custom/modern-dashboard/detail.webp",
    );

    rerender(
      <PickerHarness
        initialValue="MODERN_DASHBOARD"
        previewAnatomy="qualitative"
      />,
    );
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /executive boardroom/i }));
    expect(
      screen.getByRole("img", { name: "Executive Boardroom Detail preview" }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/qualitative/executive-boardroom/detail.webp",
    );

    fireEvent.click(screen.getByRole("radio", { name: /modern dashboard/i }));
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(
      screen.getByRole("img", { name: "Modern Dashboard Summary preview" }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/qualitative/modern-dashboard/summary.webp",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Detail" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      screen.getByRole("img", { name: "Modern Dashboard Detail preview" }),
    ).toBeInTheDocument();
  });

  it("keeps disabled radios separate from preview tab, collapse, and retry controls", () => {
    render(<PickerHarness initialValue="EXECUTIVE_BOARDROOM" disabled />);

    screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));

    const cover = screen.getByRole("tab", { name: "Cover" });
    cover.focus();
    fireEvent.keyDown(cover, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveFocus();
    expect(
      screen.getByRole("img", { name: "Executive Boardroom Summary preview" }),
    ).toBeInTheDocument();

    fireEvent.error(
      screen.getByRole("img", { name: "Executive Boardroom Summary preview" }),
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      screen.getByRole("img", { name: "Executive Boardroom Summary preview" }),
    ).toBeInTheDocument();
    screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());
  });

  it("keeps the selected option and previews readable while immutable", () => {
    render(
      <PickerHarness
        initialValue="EXECUTIVE_BOARDROOM"
        disabled
        sourceLabel="Campaign default"
        lockedAt="2026-08-05T06:30:00.000Z"
      />,
    );

    expect(screen.getByRole("radio", { name: /executive boardroom/i })).toBeChecked();
    screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());
    expect(screen.getByText(/Campaign default/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /report appearance was fixed when the first response was completed/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Locked on/).querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-08-05T06:30:00.000Z",
    );
    expect(screen.getByRole("button", { name: "Show preview" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(screen.getByRole("button", { name: "Hide preview" })).toBeEnabled();
    expect(screen.getByRole("img", { name: "Executive Boardroom Cover preview" })).toBeInTheDocument();
  });

  it("explains immutable selection when optional lock context is absent", () => {
    render(<PickerHarness initialValue="MODERN_DASHBOARD" disabled />);

    expect(
      screen.getByText(
        "Report appearance was fixed when the first response was completed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /modern dashboard/i })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(screen.getByRole("img", { name: "Modern Dashboard Cover preview" })).toBeInTheDocument();
  });

  it("lets a surface opt into design terminology and its own disabled explanation", () => {
    render(
      <PickerHarness
        initialValue="MODERN_DASHBOARD"
        disabled
        heading="Report design"
        disabledExplanation={null}
      />,
    );

    expect(screen.getByRole("group", { name: "Report design" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Report design selection" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Report style" })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/report appearance was fixed|locked on/i),
    ).not.toBeInTheDocument();
  });
});
