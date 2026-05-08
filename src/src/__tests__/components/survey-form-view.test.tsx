/**
 * ENH-MAY6-3: SurveyFormView pure renderer used in the template editor's
 * Preview modal. Submit button must be DISABLED in preview mode and no
 * fetch/network calls fire — the renderer is purely visual.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SurveyFormView } from "@/components/surveys/survey-form-view";

const baseQuestions = [
    {
        id: "q1",
        questionType: "TEXT",
        label: "What did you think?",
        description: null,
        isRequired: true,
        sortOrder: 0,
    },
    {
        id: "q2",
        questionType: "RATING",
        label: "Rate the workshop 1-5",
        description: null,
        isRequired: false,
        sortOrder: 1,
    },
    {
        id: "q3",
        questionType: "SINGLE_CHOICE",
        label: "How did you hear about us?",
        description: null,
        isRequired: false,
        options: ["Friend", "LinkedIn", "Email"],
        sortOrder: 2,
    },
];

describe("SurveyFormView (preview mode)", () => {
    let originalFetch: typeof global.fetch;
    beforeEach(() => {
        originalFetch = global.fetch;
        global.fetch = jest.fn();
    });
    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("renders all question types provided", () => {
        render(
            <SurveyFormView
                templateName="Post-Workshop Survey"
                workshopTitle="Test Workshop"
                questions={baseQuestions}
                mode="preview"
            />
        );
        expect(screen.getByText("Post-Workshop Survey")).toBeInTheDocument();
        expect(screen.getByText(/what did you think/i)).toBeInTheDocument();
        expect(screen.getByText(/rate the workshop/i)).toBeInTheDocument();
        expect(screen.getByText(/how did you hear about us/i)).toBeInTheDocument();
        // Single choice options
        expect(screen.getByText("Friend")).toBeInTheDocument();
        expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    });

    it("Submit button is disabled in preview mode", () => {
        render(
            <SurveyFormView
                templateName="X"
                questions={baseQuestions}
                mode="preview"
            />
        );
        const submit = screen.getByRole("button", { name: /submit survey/i });
        expect(submit).toBeDisabled();
    });

    it("does NOT fire any fetch when interacting with the form", () => {
        render(
            <SurveyFormView
                templateName="X"
                questions={baseQuestions}
                mode="preview"
            />
        );
        // Type in a text question and click a rating button
        const textInput = screen.getByPlaceholderText(/your answer/i);
        fireEvent.change(textInput, { target: { value: "great workshop" } });

        const ratingThree = screen.getAllByRole("button").find((b) => b.textContent === "3");
        if (ratingThree) fireEvent.click(ratingThree);

        // Try clicking the disabled submit
        const submit = screen.getByRole("button", { name: /submit survey/i });
        fireEvent.click(submit);

        // No fetch ever fires from this component
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("renders the preview-mode disclaimer", () => {
        render(
            <SurveyFormView
                templateName="X"
                questions={baseQuestions}
                mode="preview"
            />
        );
        expect(
            screen.getByText(/preview mode — answers are not saved/i)
        ).toBeInTheDocument();
    });

    it("renders questions in sortOrder, not array order", () => {
        const reordered = [
            { ...baseQuestions[2], sortOrder: 0 },
            { ...baseQuestions[0], sortOrder: 1 },
            { ...baseQuestions[1], sortOrder: 2 },
        ];
        render(
            <SurveyFormView
                templateName="X"
                questions={[baseQuestions[1], baseQuestions[0], baseQuestions[2]]}
                mode="preview"
            />
        );
        // The first question rendered (index 1.) should be the one with sortOrder 0
        const labels = screen.getAllByText(/^[123]\./);
        expect(labels[0].textContent).toMatch(/what did you think/i);
        // Reordered test:
        const { unmount } = render(
            <SurveyFormView
                templateName="X"
                questions={reordered}
                mode="preview"
            />
        );
        unmount();
    });
});
