import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReportsTab } from "@/components/admin/template-editor/ReportsTab";

const value = {
  schemaVersion: 1 as const,
  introductionHtml: "<p>Intro</p>",
  conclusionHtml: "<p>CTA</p>",
};

describe("ReportsTab", () => {
  it("shows the two raw HTML regions around the generated report", () => {
    render(<ReportsTab value={value} onChange={jest.fn()} isReadOnly={false} />);

    expect(screen.getByLabelText("Introduction / preface HTML")).toHaveValue(
      "<p>Intro</p>",
    );
    expect(screen.getByText("Generated report")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Conclusion / call-to-action HTML"),
    ).toHaveValue("<p>CTA</p>");
    expect(screen.queryByText(/WYSIWYG|Add block|preset/i)).toBeNull();
  });

  it("updates one fragment without changing the other", () => {
    const onChange = jest.fn();
    render(<ReportsTab value={value} onChange={onChange} isReadOnly={false} />);

    fireEvent.change(screen.getByLabelText("Introduction / preface HTML"), {
      target: { value: "<h2>New intro</h2>" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      schemaVersion: 1,
      introductionHtml: "<h2>New intro</h2>",
      conclusionHtml: "<p>CTA</p>",
    });
  });

  it("previews draft HTML only inside a scriptless sandbox", () => {
    render(<ReportsTab value={value} onChange={jest.fn()} isReadOnly={false} />);

    const preview = screen.getByTitle("Introduction HTML preview");
    expect(preview).toHaveAttribute("sandbox", "");
    expect(preview.getAttribute("srcdoc")).toContain(
      "default-src 'none'",
    );
    expect(preview.getAttribute("srcdoc")).toContain("<p>Intro</p>");
  });

  it("disables both fields for a published version", () => {
    render(<ReportsTab value={value} onChange={jest.fn()} isReadOnly />);

    expect(screen.getByLabelText("Introduction / preface HTML")).toBeDisabled();
    expect(
      screen.getByLabelText("Conclusion / call-to-action HTML"),
    ).toBeDisabled();
  });
});
