import { fireEvent, render, screen } from "@testing-library/react";

import { MarketingCtaEditor } from "@/components/admin/template-editor/MarketingCtaEditor";
import type { MarketingCtaConfigV1 } from "@/lib/assessments/marketing-cta";

function Harness() {
  const React = jest.requireActual<typeof import("react")>("react");
  const [value, setValue] = React.useState<MarketingCtaConfigV1 | null>(null);
  return (
    <MarketingCtaEditor
      templateId="tpl-1"
      value={value}
      onChange={setValue}
      onPreview={jest.fn()}
      previewDisabled
    />
  );
}

describe("MarketingCtaEditor", () => {
  it("starts with three plain-language presets and no selection", () => {
    render(<Harness />);

    expect(screen.getByRole("radio", { name: /full marketing/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /scaling up quick/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /start blank/i })).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /html/i })).not.toBeInTheDocument();
  });

  it("copies Full Marketing into editable blocks with real books and three actions", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /full marketing/i }));

    expect(
      screen.getByRole("img", {
        name: /mastering the rockefeller habits and scaling up books/i,
      }),
    ).toHaveAttribute("src", "/brand/scaling-up-books.png");
    expect(screen.getAllByTestId("marketing-cta-button-block")).toHaveLength(3);
    expect(screen.getByDisplayValue("Take the 32-question assessment")).toBeInTheDocument();
  });

  it("can add and remove structured blocks without HTML", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /start blank/i }));
    fireEvent.click(screen.getByRole("button", { name: /add text/i }));
    fireEvent.click(screen.getByRole("button", { name: /add image/i }));
    fireEvent.click(screen.getByRole("button", { name: /add button/i }));
    fireEvent.click(screen.getByRole("button", { name: /add divider/i }));

    expect(screen.getByLabelText("Heading or lead")).toBeInTheDocument();
    expect(screen.getByLabelText("Image URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Button text")).toBeInTheDocument();
    expect(screen.getByText("Divider")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(screen.queryByLabelText("Heading or lead")).not.toBeInTheDocument();
  });
});
