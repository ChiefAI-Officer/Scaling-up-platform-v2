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

    expect(screen.getByRole("radio", { name: /executive boardroom/i })).toBeChecked();
    expect(
      screen.getByRole("img", { name: "Executive Boardroom Cover preview" }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/qualitative/executive-boardroom/cover.webp",
    );
  });

  it("keeps every tab panel mounted for its aria-controls relationship", () => {
    render(<PickerHarness />);

    screen.getAllByRole("tab").forEach((tab) => {
      const panelId = tab.getAttribute("aria-controls");
      expect(panelId).toBeTruthy();
      expect(document.getElementById(panelId!)).toHaveAttribute("role", "tabpanel");
    });
  });

  it("keeps style selection usable after a preview failure and remounts only the failed image on retry", () => {
    const { container } = render(<PickerHarness />);

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

  it("keeps compact selection usable and exposes retry when its thumbnail fails", () => {
    render(<PickerHarness initialValue="MODERN_DASHBOARD" compact />);

    const thumbnail = screen.getByRole("img", {
      name: "Modern Dashboard selected thumbnail",
    });
    fireEvent.error(thumbnail);

    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    const classic = screen.getByRole("radio", { name: /classic/i });
    expect(classic).not.toBeDisabled();
    fireEvent.click(classic);
    expect(classic).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /modern dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      screen.getByRole("img", {
        name: "Modern Dashboard selected thumbnail",
      }),
    ).toBeInTheDocument();
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
    expect(screen.getByRole("img", { name: "Modern Dashboard Cover preview" })).toBeInTheDocument();
  });
});
