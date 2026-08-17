import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

import { CreateTemplateForm } from "@/app/(dashboard)/templates/new/create-template-form";
import { TemplateContentEditor } from "@/components/templates/template-content-editor";

const editorProps = {
  templateId: "template-1",
  templateType: "SOLO_LANDING",
  templateName: "Long Workshop Landing Template",
  categoryName: "AI",
  isActive: true,
  initialContent: "{}",
  initialCustomCode: null,
  initialCustomHtml: "",
};

it("keeps create-template controls unchanged by default", () => {
  render(<CreateTemplateForm categories={[]} />);

  expect(screen.getByPlaceholderText("e.g., AI Workshop Solo Landing")).not.toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Create Template" })).not.toHaveClass("min-h-11");
});

it("gives the responsive create form contained fields and 44px controls", () => {
  render(<CreateTemplateForm categories={[]} responsiveEnabled />);

  expect(screen.getByRole("form")).toHaveClass("min-w-0");
  expect(screen.getByLabelText(/template name/i)).toHaveClass("min-h-11 min-w-0");
  expect(screen.getByLabelText(/template type/i)).toHaveClass("min-h-11 min-w-0");
  expect(screen.getByRole("button", { name: "Create Template" })).toHaveClass("min-h-11 w-full sm:w-auto");
});

it("keeps the existing five-column template editor by default", () => {
  const { container } = render(<TemplateContentEditor {...editorProps} />);

  const layout = container.querySelector(".grid.grid-cols-5.gap-6");
  expect(layout).toBeInTheDocument();
  expect(layout).not.toHaveAttribute("data-testid");
  expect(screen.getByRole("button", { name: "Save Template" })).not.toHaveClass("min-h-11");
});

it("reflows the responsive template editor and keeps save reachable", () => {
  render(<TemplateContentEditor {...editorProps} responsiveEnabled />);

  const layout = screen.getByTestId("template-editor-layout");
  expect(layout).toHaveClass("min-w-0 grid-cols-1 xl:grid-cols-5");
  expect(screen.getByTestId("template-editor-form-panel")).toHaveClass("min-w-0 xl:col-span-2");
  expect(screen.getByTestId("template-editor-preview-panel")).toHaveClass("min-w-0 xl:col-span-3");
  expect(screen.getByRole("button", { name: "Save Template" })).toHaveClass("min-h-11");
});
