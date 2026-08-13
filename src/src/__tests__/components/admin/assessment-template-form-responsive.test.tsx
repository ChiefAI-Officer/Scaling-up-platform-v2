import { fireEvent, render, screen, within } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

import { AssessmentTemplateForm } from "@/components/admin/AssessmentTemplateForm";

describe("AssessmentTemplateForm responsive presentation", () => {
  it("leaves the legacy form and controls untouched by default", () => {
    const { container } = render(<AssessmentTemplateForm mode="create" />);

    expect(container.querySelector("form")).toHaveAttribute("class", "space-y-6");
    expect(screen.getByTestId("add-section")).not.toHaveClass("min-h-11");
    expect(screen.getByTestId("template-name")).not.toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Cancel" })).not.toHaveClass("min-h-11");
  });

  it("contains the form and gives mobile controls 44px targets", () => {
    const { container } = render(<AssessmentTemplateForm mode="create" responsiveEnabled />);

    expect(container.querySelector("form")).toHaveClass("min-w-0", "max-w-full");
    expect(screen.getByTestId("add-section")).toHaveClass("min-h-11");
    expect(screen.getByTestId("add-question")).toHaveClass("min-h-11");
    expect(screen.getByTestId("add-tier")).toHaveClass("min-h-11");
    expect(screen.getByTestId("template-name")).toHaveClass("min-h-11", "min-w-0");
    expect(screen.getByTestId("template-aggregation-mode")).toHaveClass("min-h-11", "min-w-0");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("min-h-11");
    expect(screen.getByTestId("template-submit")).toHaveClass("min-h-11");
  });

  it("adds accessible 44px question and tier reorder controls", () => {
    render(<AssessmentTemplateForm mode="create" responsiveEnabled />);

    fireEvent.click(screen.getByTestId("add-question"));
    fireEvent.click(screen.getByTestId("add-tier"));

    for (const name of [
      "Move question 1 up",
      "Move question 1 down",
      "Remove question 1",
      "Move tier 1 up",
      "Move tier 1 down",
      "Remove tier 1",
    ]) {
      expect(screen.getByRole("button", { name })).toHaveClass("min-h-11", "min-w-11");
    }

    expect(screen.getByPlaceholderText("Question label")).toHaveClass("min-h-11", "min-w-0");
    expect(screen.getAllByRole("combobox")[1]).toHaveClass("min-h-11", "min-w-0");
    expect(screen.getByText("Required").closest("label")).toHaveClass("min-h-11");
  });

  it("keeps dynamic question and tier icon controls unnamed while responsive mode is off", () => {
    render(<AssessmentTemplateForm mode="create" />);

    fireEvent.click(screen.getByTestId("add-question"));
    fireEvent.click(screen.getByTestId("add-tier"));

    for (const button of within(screen.getByTestId("question-row-0")).getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-label");
    }
    for (const button of within(screen.getByTestId("tier-row-0")).getAllByRole("button")) {
      expect(button).not.toHaveAttribute("aria-label");
    }
  });

  it("gives responsive tier actions a full grid row that can wrap at sm widths", () => {
    render(<AssessmentTemplateForm mode="create" responsiveEnabled />);

    const actionGroup = screen.getByTestId("tier-row-0").firstElementChild?.lastElementChild;
    expect(actionGroup).toHaveClass("sm:col-span-12", "flex-wrap");
    expect(actionGroup).not.toHaveClass("sm:flex-nowrap");
  });
});
