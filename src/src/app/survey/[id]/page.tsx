"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface SurveyQuestion {
  id: string;
  questionType: string;
  label: string;
  description: string | null;
  isRequired: boolean;
  options?: string[];
  sortOrder: number;
}

interface SurveyData {
  id: string;
  surveyType: string;
  workshopTitle: string;
  workshopCode: string;
  templateName: string;
  questions: SurveyQuestion[];
}

export default function PublicSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/surveys/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSurvey(data.data);
        } else if (data.error === "Survey already completed") {
          setSubmitted(true);
        } else {
          setError(data.error || "Failed to load survey");
        }
      })
      .catch(() => setError("Failed to load survey"))
      .finally(() => setLoading(false));
  }, [id]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!survey) return;

    // Validate required fields
    const missing = survey.questions.filter(
      (q) => q.isRequired && !answers[q.id]?.trim()
    );
    if (missing.length > 0) {
      setError(`Please answer all required questions (${missing.length} remaining)`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const formattedAnswers = Object.entries(answers).map(([questionId, value]) => {
      const question = survey.questions.find((q) => q.id === questionId);
      const numValue =
        question?.questionType === "RATING" || question?.questionType === "NPS"
          ? parseInt(value)
          : undefined;
      return { questionId, value, numValue: Number.isNaN(numValue) ? undefined : numValue };
    });

    try {
      const res = await fetch(`/api/surveys/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: formattedAnswers }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || "Failed to submit survey");
      }
    } catch {
      setError("Failed to submit survey");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <p className="text-muted-foreground">Loading survey...</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="mx-auto max-w-md rounded-lg bg-card p-8 text-center shadow-lg">
          <div className="mb-4 text-4xl">&#10003;</div>
          <h1 className="text-2xl font-bold text-foreground">Thank You!</h1>
          <p className="mt-2 text-muted-foreground">
            Your feedback has been recorded. We appreciate you taking the time to
            share your thoughts.
          </p>
        </div>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="mx-auto max-w-md rounded-lg bg-card p-8 text-center shadow-lg">
          <h1 className="text-xl font-bold text-foreground">Survey Unavailable</h1>
          <p className="mt-2 text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!survey) return null;

  return (
    <div className="min-h-screen bg-muted py-8">
      <div className="mx-auto max-w-2xl px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">{survey.templateName}</h1>
          <p className="mt-1 text-muted-foreground">{survey.workshopTitle}</p>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {survey.questions.map((question, index) => (
            <div key={question.id} className="rounded-lg bg-card p-6 shadow-sm">
              <div className="mb-3">
                <label className="block text-sm font-medium text-foreground">
                  {index + 1}. {question.label}
                  {question.isRequired && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </label>
                {question.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{question.description}</p>
                )}
              </div>

              {/* Text input */}
              {question.questionType === "TEXT" && (
                <input
                  type="text"
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswer(question.id, e.target.value)}
                  className="block w-full rounded-md border border-border px-3 py-2 text-sm"
                  placeholder="Your answer..."
                />
              )}

              {/* Textarea */}
              {question.questionType === "TEXTAREA" && (
                <textarea
                  value={answers[question.id] || ""}
                  onChange={(e) => setAnswer(question.id, e.target.value)}
                  rows={4}
                  className="block w-full rounded-md border border-border px-3 py-2 text-sm"
                  placeholder="Your answer..."
                />
              )}

              {/* Rating 1-5 */}
              {question.questionType === "RATING" && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAnswer(question.id, String(n))}
                      className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 text-lg font-medium transition-colors ${
                        answers[question.id] === String(n)
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-border text-muted-foreground hover:border-gray-400"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {/* NPS 0-10 */}
              {question.questionType === "NPS" && (
                <div>
                  <div className="flex gap-1">
                    {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAnswer(question.id, String(n))}
                        className={`flex h-10 w-10 items-center justify-center rounded-md border text-sm font-medium transition-colors ${
                          answers[question.id] === String(n)
                            ? n <= 6
                              ? "border-red-500 bg-red-50 text-red-700"
                              : n <= 8
                                ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                                : "border-green-500 bg-green-50 text-green-700"
                            : "border-border text-muted-foreground hover:border-gray-400"
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

              {/* Single Choice */}
              {question.questionType === "SINGLE_CHOICE" && question.options && (
                <div className="space-y-2">
                  {question.options.map((opt) => (
                    <label
                      key={opt}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-accent"
                    >
                      <input
                        type="radio"
                        name={question.id}
                        value={opt}
                        checked={answers[question.id] === opt}
                        onChange={() => setAnswer(question.id, opt)}
                        className="h-4 w-4 border-border text-blue-600"
                      />
                      <span className="text-sm text-foreground">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Multi Choice */}
              {question.questionType === "MULTI_CHOICE" && question.options && (
                <div className="space-y-2">
                  {question.options.map((opt) => {
                    const selected = answers[question.id]
                      ? (JSON.parse(answers[question.id]) as string[]).includes(opt)
                      : false;
                    return (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleMultiChoice(question.id, opt)}
                          className="h-4 w-4 rounded border-border text-blue-600"
                        />
                        <span className="text-sm text-foreground">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Yes/No */}
              {question.questionType === "YES_NO" && (
                <div className="flex gap-3">
                  {["Yes", "No"].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAnswer(question.id, val)}
                      className={`rounded-md border-2 px-6 py-2 text-sm font-medium transition-colors ${
                        answers[question.id] === val
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-border text-muted-foreground hover:border-gray-400"
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Submit */}
          <div className="text-center">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Survey"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
