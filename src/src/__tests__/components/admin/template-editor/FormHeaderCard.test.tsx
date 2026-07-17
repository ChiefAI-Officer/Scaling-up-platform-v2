/**
 * FormHeaderCard — ED9 Task 9 (spec 19al-plan) tests.
 *
 * The Google-Forms-style form-identity hero card atop the ED9 Build column:
 * an editable title + description bound to the template row via the SAME
 * `onTemplateFieldChange(patch)` callback `MetadataTab`/`TabbedShell` already
 * use (a PATCH-object shape, e.g. `{ name: value }` — NOT `(field, value)`),
 * so title/description stay two-way synced with the Metadata tab. Plus a meta
 * row of per-type question counts + a section/question totals chip, and a
 * top accent bar (Google-Forms hero motif).
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  FormHeaderCard,
  type FormHeaderCardProps,
  type FormHeaderCardQuestion,
  type FormHeaderCardTemplate,
} from "@/components/admin/template-editor/FormHeaderCard";

afterEach(() => cleanup());

function baseTemplate(
  overrides: Partial<FormHeaderCardTemplate> = {},
): FormHeaderCardTemplate {
  return {
    name: "Leadership Vitality Assessment",
    description: "A quick pulse check for your leadership team.",
    ...overrides,
  };
}

function q(type: string): FormHeaderCardQuestion {
  return { type };
}

function baseProps(
  overrides: Partial<FormHeaderCardProps> = {},
): FormHeaderCardProps {
  return {
    template: baseTemplate(),
    questions: [
      q("SLIDER_LIKERT"),
      q("SLIDER_LIKERT"),
      q("SLIDER_LIKERT"),
      q("MULTI_CHOICE"),
    ],
    sectionCount: 2,
    isReadOnly: false,
    onTemplateFieldChange: jest.fn(),
    ...overrides,
  };
}

describe("FormHeaderCard — title", () => {
  it("renders the title input bound to template.name", () => {
    render(<FormHeaderCard {...baseProps()} />);
    const title = screen.getByTestId("form-header-title") as HTMLInputElement;
    expect(title.value).toBe("Leadership Vitality Assessment");
  });

  it("calls onTemplateFieldChange({ name }) on change", () => {
    const onTemplateFieldChange = jest.fn();
    render(<FormHeaderCard {...baseProps({ onTemplateFieldChange })} />);
    const title = screen.getByTestId("form-header-title");
    fireEvent.change(title, { target: { value: "New Title" } });
    expect(onTemplateFieldChange).toHaveBeenCalledWith({ name: "New Title" });
  });
});

describe("FormHeaderCard — description", () => {
  it("renders the description input bound to template.description", () => {
    render(<FormHeaderCard {...baseProps()} />);
    const desc = screen.getByTestId(
      "form-header-description",
    ) as HTMLInputElement;
    expect(desc.value).toBe("A quick pulse check for your leadership team.");
  });

  it("calls onTemplateFieldChange({ description }) on change", () => {
    const onTemplateFieldChange = jest.fn();
    render(<FormHeaderCard {...baseProps({ onTemplateFieldChange })} />);
    const desc = screen.getByTestId("form-header-description");
    fireEvent.change(desc, { target: { value: "Updated description" } });
    expect(onTemplateFieldChange).toHaveBeenCalledWith({
      description: "Updated description",
    });
  });

  it("shows the placeholder copy and an empty value when description is null", () => {
    render(
      <FormHeaderCard
        {...baseProps({ template: baseTemplate({ description: null }) })}
      />,
    );
    const desc = screen.getByTestId(
      "form-header-description",
    ) as HTMLInputElement;
    expect(desc.value).toBe("");
    expect(
      screen.getByPlaceholderText("Add a description (optional)"),
    ).toBeInTheDocument();
  });
});

describe("FormHeaderCard — meta row", () => {
  it("shows per-type counts using QUESTION_TYPE_LABELS, only for types with count > 0", () => {
    render(<FormHeaderCard {...baseProps()} />);
    const meta = screen.getByTestId("form-header-meta");
    expect(meta.textContent).toContain("Slider ×3");
    expect(meta.textContent).toContain("Multiple choice ×1");
    expect(meta.textContent).not.toContain("Number ×");
    expect(meta.textContent).not.toContain("Short text ×");
  });

  it("falls back to the raw type string for an unmapped type", () => {
    render(
      <FormHeaderCard
        {...baseProps({ questions: [q("SOMETHING_NEW")] })}
      />,
    );
    expect(screen.getByTestId("form-header-meta").textContent).toContain(
      "SOMETHING_NEW ×1",
    );
  });

  it("shows a totals chip with section count and question count", () => {
    render(<FormHeaderCard {...baseProps()} />);
    const meta = screen.getByTestId("form-header-meta");
    expect(meta.textContent).toContain("2 sections");
    expect(meta.textContent).toContain("4 questions");
  });

  it("singularizes the totals chip for a count of 1", () => {
    render(
      <FormHeaderCard
        {...baseProps({ sectionCount: 1, questions: [q("TEXT")] })}
      />,
    );
    const meta = screen.getByTestId("form-header-meta");
    expect(meta.textContent).toContain("1 section");
    expect(meta.textContent).not.toContain("1 sections");
    expect(meta.textContent).toContain("1 question");
    expect(meta.textContent).not.toContain("1 questions");
  });

  it("renders no type-count text when there are no questions", () => {
    render(<FormHeaderCard {...baseProps({ questions: [] })} />);
    const meta = screen.getByTestId("form-header-meta");
    expect(meta.textContent).not.toContain("×");
    expect(meta.textContent).toContain("0 questions");
  });
});

describe("FormHeaderCard — top accent bar", () => {
  it("renders a shadcn-token top accent bar (no hardcoded colors)", () => {
    render(<FormHeaderCard {...baseProps()} />);
    const card = screen.getByTestId("form-header-card");
    expect(card.className).toContain("border-t-primary");
    expect(card.className).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});

describe("FormHeaderCard — isReadOnly", () => {
  it("disables the title and description inputs", () => {
    render(<FormHeaderCard {...baseProps({ isReadOnly: true })} />);
    expect(screen.getByTestId("form-header-title")).toBeDisabled();
    expect(screen.getByTestId("form-header-description")).toBeDisabled();
  });

  it("still shows the current title/description values while disabled", () => {
    render(<FormHeaderCard {...baseProps({ isReadOnly: true })} />);
    const title = screen.getByTestId("form-header-title") as HTMLInputElement;
    const desc = screen.getByTestId(
      "form-header-description",
    ) as HTMLInputElement;
    expect(title.value).toBe("Leadership Vitality Assessment");
    expect(desc.value).toBe("A quick pulse check for your leadership team.");
  });
});
