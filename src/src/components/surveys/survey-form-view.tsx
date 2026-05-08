"use client";

/**
 * ENH-MAY6-3: pure read-only survey renderer used in the template editor's
 * Preview modal. NO submission side effects — Submit button is rendered
 * disabled and there is no `onSubmit` prop. The live submission surface lives
 * separately at app/survey/[id]/page.tsx and does not import this component.
 *
 * Mode is always preview today; the prop is left in place so a future refactor
 * could DRY the live page into the same renderer with mode="live" + an
 * onSubmit prop.
 */

import { useState } from "react";

export interface SurveyFormQuestion {
    id: string;
    questionType: string;
    label: string;
    description?: string | null;
    isRequired: boolean;
    options?: string[];
    sortOrder: number;
}

interface Props {
    templateName: string;
    workshopTitle?: string;
    questions: SurveyFormQuestion[];
    mode: "preview";
}

export function SurveyFormView({ templateName, workshopTitle, questions, mode }: Props) {
    // Local answer state — purely for visual interactivity in the preview.
    // No persistence, no submission, no network calls.
    const [answers, setAnswers] = useState<Record<string, string>>({});

    function setAnswer(questionId: string, value: string) {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    }

    function toggleMultiChoice(questionId: string, option: string) {
        setAnswers((prev) => {
            const current = prev[questionId] ? JSON.parse(prev[questionId]) : [];
            const updated = current.includes(option)
                ? current.filter((o: string) => o !== option)
                : [...current, option];
            return { ...prev, [questionId]: JSON.stringify(updated) };
        });
    }

    const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);

    return (
        <div className="bg-muted py-4">
            <div className="mx-auto max-w-2xl px-4">
                {/* Header */}
                <div className="mb-6 text-center">
                    <h2 className="text-xl font-bold text-foreground">{templateName}</h2>
                    {workshopTitle && (
                        <p className="mt-1 text-muted-foreground text-sm">{workshopTitle}</p>
                    )}
                    {mode === "preview" && (
                        <p className="mt-2 text-xs text-warning">
                            Preview mode — answers are not saved, no submission will fire.
                        </p>
                    )}
                </div>

                <div className="space-y-4">
                    {sorted.map((question, index) => (
                        <div key={question.id} className="rounded-lg bg-card p-5 shadow-sm">
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-foreground">
                                    {index + 1}. {question.label}
                                    {question.isRequired && (
                                        <span className="ml-1 text-destructive">*</span>
                                    )}
                                </label>
                                {question.description && (
                                    <p className="mt-1 text-xs text-muted-foreground">{question.description}</p>
                                )}
                            </div>

                            {question.questionType === "TEXT" && (
                                <input
                                    type="text"
                                    value={answers[question.id] || ""}
                                    onChange={(e) => setAnswer(question.id, e.target.value)}
                                    className="block w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
                                    placeholder="Your answer..."
                                />
                            )}

                            {question.questionType === "TEXTAREA" && (
                                <textarea
                                    value={answers[question.id] || ""}
                                    onChange={(e) => setAnswer(question.id, e.target.value)}
                                    rows={4}
                                    className="block w-full rounded-md border border-border px-3 py-2 text-sm bg-background"
                                    placeholder="Your answer..."
                                />
                            )}

                            {question.questionType === "RATING" && (
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map((n) => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setAnswer(question.id, String(n))}
                                            className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 text-base font-medium ${
                                                answers[question.id] === String(n)
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border text-muted-foreground"
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {question.questionType === "NPS" && (
                                <div>
                                    <div className="flex gap-1 flex-wrap">
                                        {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setAnswer(question.id, String(n))}
                                                className={`flex h-9 w-9 items-center justify-center rounded-md border text-xs font-medium ${
                                                    answers[question.id] === String(n)
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-border text-muted-foreground"
                                                }`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                                        <span>Not at all likely</span>
                                        <span>Extremely likely</span>
                                    </div>
                                </div>
                            )}

                            {question.questionType === "SINGLE_CHOICE" && question.options && (
                                <div className="space-y-2">
                                    {question.options.map((opt) => (
                                        <label key={opt} className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-2 hover:bg-accent text-sm">
                                            <input
                                                type="radio"
                                                name={question.id}
                                                value={opt}
                                                checked={answers[question.id] === opt}
                                                onChange={() => setAnswer(question.id, opt)}
                                                className="h-4 w-4 border-border text-primary"
                                            />
                                            <span className="text-foreground">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {question.questionType === "MULTI_CHOICE" && question.options && (
                                <div className="space-y-2">
                                    {question.options.map((opt) => {
                                        const selected = answers[question.id]
                                            ? (JSON.parse(answers[question.id]) as string[]).includes(opt)
                                            : false;
                                        return (
                                            <label key={opt} className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-2 hover:bg-accent text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleMultiChoice(question.id, opt)}
                                                    className="h-4 w-4 rounded border-border text-primary"
                                                />
                                                <span className="text-foreground">{opt}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}

                            {question.questionType === "YES_NO" && (
                                <div className="flex gap-3">
                                    {["Yes", "No"].map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setAnswer(question.id, val)}
                                            className={`rounded-md border-2 px-6 py-2 text-sm font-medium ${
                                                answers[question.id] === val
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border text-muted-foreground"
                                            }`}
                                        >
                                            {val}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* ENH-MAY6-3: Submit button DISABLED in preview mode. No onSubmit prop. */}
                <div className="mt-6 text-center">
                    <button
                        type="button"
                        disabled
                        aria-label="Submit Survey (preview mode — disabled)"
                        className="rounded-md bg-primary/50 px-8 py-3 text-sm font-medium text-primary-foreground cursor-not-allowed"
                    >
                        Submit Survey
                    </button>
                </div>
            </div>
        </div>
    );
}
