"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  SURVEY_TYPES,
  SURVEY_TYPE_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
} from "@/lib/survey-types";
import type { SurveyType, QuestionType } from "@/lib/survey-types";

// ============================================
// Types
// ============================================

interface SerializedQuestion {
  id: string;
  templateId: string;
  sortOrder: number;
  questionType: string;
  label: string;
  description: string | null;
  isRequired: boolean;
  options: string | null; // JSON string
  createdAt: string;
  updatedAt: string;
}

interface SerializedSurvey {
  id: string;
  surveyType: string;
  completedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  npsScore: number | null;
  workshop: { title: string; workshopCode: string };
  registration: { firstName: string; lastName: string; email: string } | null;
}

interface SerializedTemplate {
  id: string;
  name: string;
  description: string | null;
  surveyType: string;
  isActive: boolean;
  categoryId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  questions: SerializedQuestion[];
  surveys: SerializedSurvey[];
}

interface Props {
  template: SerializedTemplate | null;
  workshops: { id: string; title: string; workshopCode: string }[];
  categories: { id: string; name: string }[];
  isNew: boolean;
}

// ============================================
// Main Component
// ============================================

export function SurveyTemplateEditor({ template, workshops, categories, isNew }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template form state
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [surveyType, setSurveyType] = useState<string>(
    template?.surveyType || SURVEY_TYPES.POST_WORKSHOP
  );
  const [categoryId, setCategoryId] = useState<string>(template?.categoryId || "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);

  // Questions state
  const [questions, setQuestions] = useState<SerializedQuestion[]>(
    template?.questions || []
  );

  // Active tab
  const [activeTab, setActiveTab] = useState<"builder" | "assign" | "results">("builder");

  // Assignment state
  const [assignWorkshopId, setAssignWorkshopId] = useState("");
  const [assigning, setAssigning] = useState(false);

  // ============================================
  // Template CRUD
  // ============================================

  async function saveTemplate() {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      if (isNew) {
        const res = await fetch("/api/survey-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, surveyType, categoryId: categoryId || undefined }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        router.push(`/admin/surveys/templates/${data.data.id}`);
      } else {
        const res = await fetch(`/api/survey-templates/${template!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, surveyType, categoryId: categoryId || null, isActive }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!confirm("Delete this template? All associated surveys will be affected.")) return;
    try {
      await fetch(`/api/survey-templates/${template!.id}`, { method: "DELETE" });
      router.push("/admin/surveys");
    } catch {
      setError("Failed to delete template");
    }
  }

  // ============================================
  // Question CRUD
  // ============================================

  async function addNewQuestion(questionType: QuestionType) {
    if (!template) return;
    setError(null);

    const defaultLabels: Record<string, string> = {
      TEXT: "Enter your response",
      TEXTAREA: "Please share your thoughts",
      RATING: "How would you rate this?",
      NPS: "How likely are you to recommend this workshop to a colleague?",
      SINGLE_CHOICE: "Select one option",
      MULTI_CHOICE: "Select all that apply",
      YES_NO: "Yes or No?",
    };

    try {
      const res = await fetch(`/api/survey-templates/${template.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionType,
          label: defaultLabels[questionType] || "New question",
          sortOrder: questions.length,
          isRequired: true,
          options:
            questionType === "SINGLE_CHOICE" || questionType === "MULTI_CHOICE"
              ? ["Option 1", "Option 2", "Option 3"]
              : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setQuestions([...questions, { ...data.data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add question");
    }
  }

  async function updateQuestionField(
    questionId: string,
    field: string,
    value: string | boolean | string[]
  ) {
    if (!template) return;

    // Optimistic update
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, [field]: field === "options" ? JSON.stringify(value) : value } : q))
    );

    try {
      const res = await fetch(
        `/api/survey-templates/${template.id}/questions/${questionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update question");
      router.refresh();
    }
  }

  async function removeQuestion(questionId: string) {
    if (!template) return;
    if (!confirm("Remove this question?")) return;

    setQuestions((prev) => prev.filter((q) => q.id !== questionId));

    try {
      await fetch(
        `/api/survey-templates/${template.id}/questions/${questionId}`,
        { method: "DELETE" }
      );
    } catch {
      setError("Failed to delete question");
      router.refresh();
    }
  }

  async function moveQuestion(index: number, direction: "up" | "down") {
    if (!template) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    const reordered = [...questions];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setQuestions(reordered);

    try {
      await fetch(`/api/survey-templates/${template.id}/questions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: reordered.map((q) => q.id) }),
      });
    } catch {
      setError("Failed to reorder questions");
    }
  }

  // ============================================
  // Workshop Assignment
  // ============================================

  async function assignToWorkshop() {
    if (!template || !assignWorkshopId) return;
    setAssigning(true);
    setError(null);

    try {
      const res = await fetch("/api/surveys/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          workshopId: assignWorkshopId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAssignWorkshopId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign survey");
    } finally {
      setAssigning(false);
    }
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/surveys"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Templates
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? "New Survey Template" : template?.name || ""}
          </h1>
        </div>
        {!isNew && (
          <button
            onClick={deleteTemplate}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Delete Template
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Template Details */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Template Details</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g., Post-Workshop Feedback"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Survey Type</label>
            <select
              value={surveyType}
              onChange={(e) => setSurveyType(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {Object.entries(SURVEY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All Categories (Generic)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">Auto-assigned to workshops in this category</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Optional description"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          {!isNew && (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              Active
            </label>
          )}
          <button
            onClick={saveTemplate}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : isNew ? "Create Template" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Tabs (only for existing templates) */}
      {!isNew && template && (
        <>
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {(["builder", "assign", "results"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-1 py-3 text-sm font-medium ${
                    activeTab === tab
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  }`}
                >
                  {tab === "builder" ? `Questions (${questions.length})` : tab === "assign" ? "Assign to Workshops" : "Results"}
                </button>
              ))}
            </nav>
          </div>

          {/* Builder Tab */}
          {activeTab === "builder" && (
            <div className="space-y-4">
              {/* Question List */}
              {questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  total={questions.length}
                  onUpdate={updateQuestionField}
                  onRemove={removeQuestion}
                  onMove={moveQuestion}
                />
              ))}

              {/* Add Question Buttons */}
              <div className="rounded-lg border-2 border-dashed border-gray-300 p-6">
                <p className="mb-3 text-sm font-medium text-gray-700">Add Question</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(QUESTION_TYPE_LABELS).map(([type, label]) => (
                    <button
                      key={type}
                      onClick={() => addNewQuestion(type as QuestionType)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      + {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Assign Tab */}
          {activeTab === "assign" && (
            <div className="space-y-6">
              <div className="rounded-lg bg-white p-6 shadow">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  Assign Survey to Workshop
                </h3>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Workshop
                    </label>
                    <select
                      value={assignWorkshopId}
                      onChange={(e) => setAssignWorkshopId(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select a workshop...</option>
                      {workshops.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.workshopCode} — {w.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={assignToWorkshop}
                    disabled={!assignWorkshopId || assigning}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {assigning ? "Assigning..." : "Assign"}
                  </button>
                </div>
              </div>

              {/* Assigned Surveys List */}
              {template.surveys.length > 0 && (
                <div className="rounded-lg bg-white shadow">
                  <div className="border-b px-6 py-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Assigned Surveys ({template.surveys.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Workshop
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Attendee
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            NPS
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {template.surveys.map((survey) => (
                          <tr key={survey.id}>
                            <td className="px-6 py-3 text-sm">
                              <span className="font-mono text-xs text-gray-500">
                                {survey.workshop.workshopCode}
                              </span>{" "}
                              {survey.workshop.title}
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-700">
                              {survey.registration
                                ? `${survey.registration.firstName} ${survey.registration.lastName}`
                                : "—"}
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  survey.completedAt
                                    ? "bg-green-100 text-green-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {survey.completedAt ? "Completed" : "Pending"}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-700">
                              {survey.npsScore !== null ? survey.npsScore : "—"}
                            </td>
                            <td className="px-6 py-3 text-sm">
                              {!survey.completedAt && (
                                <button
                                  onClick={() => {
                                    const url = `${window.location.origin}/survey/${survey.id}`;
                                    navigator.clipboard.writeText(url);
                                  }}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  Copy Link
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results Tab */}
          {activeTab === "results" && (
            <SurveyResultsPanel templateId={template.id} />
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// QuestionCard Sub-component
// ============================================

function QuestionCard({
  question,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  question: SerializedQuestion;
  index: number;
  total: number;
  onUpdate: (id: string, field: string, value: string | boolean | string[]) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, direction: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const parsedOptions: string[] = question.options ? JSON.parse(question.options) : [];

  const typeColor: Record<string, string> = {
    TEXT: "bg-gray-100 text-gray-700",
    TEXTAREA: "bg-gray-100 text-gray-700",
    RATING: "bg-yellow-100 text-yellow-700",
    NPS: "bg-purple-100 text-purple-700",
    SINGLE_CHOICE: "bg-blue-100 text-blue-700",
    MULTI_CHOICE: "bg-blue-100 text-blue-700",
    YES_NO: "bg-green-100 text-green-700",
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Question Text</label>
            <input
              type="text"
              defaultValue={question.label}
              onBlur={(e) => onUpdate(question.id, "label", e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Help Text (optional)
            </label>
            <input
              type="text"
              defaultValue={question.description || ""}
              onBlur={(e) => onUpdate(question.id, "description", e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                defaultChecked={question.isRequired}
                onChange={(e) => onUpdate(question.id, "isRequired", e.target.checked)}
                className="rounded border-gray-300"
              />
              Required
            </label>
          </div>

          {/* Options editor for choice questions */}
          {(question.questionType === "SINGLE_CHOICE" ||
            question.questionType === "MULTI_CHOICE") && (
            <OptionsEditor
              options={parsedOptions}
              onChange={(opts) => onUpdate(question.id, "options", opts)}
            />
          )}

          <button
            onClick={() => setEditing(false)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300">
      {/* Reorder buttons */}
      <div className="flex flex-col gap-1 pt-1">
        <button
          onClick={() => onMove(index, "up")}
          disabled={index === 0}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
          title="Move up"
        >
          &#9650;
        </button>
        <button
          onClick={() => onMove(index, "down")}
          disabled={index === total - 1}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
          title="Move down"
        >
          &#9660;
        </button>
      </div>

      {/* Question content */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Q{index + 1}</span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              typeColor[question.questionType] || "bg-gray-100 text-gray-700"
            }`}
          >
            {QUESTION_TYPE_LABELS[question.questionType as QuestionType] || question.questionType}
          </span>
          {question.isRequired && (
            <span className="text-xs text-red-500">Required</span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-900">{question.label}</p>
        {question.description && (
          <p className="text-xs text-gray-500">{question.description}</p>
        )}
        {parsedOptions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {parsedOptions.map((opt, i) => (
              <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {opt}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Edit
        </button>
        <button
          onClick={() => onRemove(question.id)}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ============================================
// OptionsEditor Sub-component
// ============================================

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  const [localOptions, setLocalOptions] = useState(options);

  function updateOption(index: number, value: string) {
    const updated = [...localOptions];
    updated[index] = value;
    setLocalOptions(updated);
  }

  function addOption() {
    const updated = [...localOptions, `Option ${localOptions.length + 1}`];
    setLocalOptions(updated);
    onChange(updated);
  }

  function removeOption(index: number) {
    const updated = localOptions.filter((_, i) => i !== index);
    setLocalOptions(updated);
    onChange(updated);
  }

  function commitOptions() {
    onChange(localOptions);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">Options</label>
      <div className="mt-1 space-y-2">
        {localOptions.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              onBlur={commitOptions}
              className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => removeOption(i)}
              className="text-sm text-red-500 hover:text-red-700"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addOption}
        className="mt-2 text-sm text-blue-600 hover:text-blue-800"
      >
        + Add Option
      </button>
    </div>
  );
}

// ============================================
// SurveyResultsPanel Sub-component
// ============================================

function SurveyResultsPanel({ templateId }: { templateId: string }) {
  const [results, setResults] = useState<{
    templateName: string;
    surveyType: string;
    totalResponses: number;
    questionStats: {
      questionId: string;
      label: string;
      type: string;
      totalResponses: number;
      avgNumeric?: number;
      distribution?: Record<string, number>;
    }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/survey-templates/${templateId}/results`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setResults(data.data);
      })
      .finally(() => setLoading(false));
  }, [templateId]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-gray-500">
        Loading results...
      </div>
    );
  }

  if (!results || results.totalResponses === 0) {
    return (
      <div className="rounded-lg bg-white p-8 text-center shadow">
        <p className="text-gray-500">No responses collected yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-blue-50 p-4 text-center">
            <p className="text-3xl font-bold text-blue-700">{results.totalResponses}</p>
            <p className="text-sm text-blue-600">Total Responses</p>
          </div>
          {results.questionStats
            .filter((q) => q.avgNumeric !== undefined)
            .slice(0, 2)
            .map((q) => (
              <div key={q.questionId} className="rounded-lg bg-purple-50 p-4 text-center">
                <p className="text-3xl font-bold text-purple-700">
                  {q.avgNumeric?.toFixed(1)}
                </p>
                <p className="text-sm text-purple-600">
                  Avg {q.type === "NPS" ? "NPS" : "Rating"}
                </p>
              </div>
            ))}
        </div>
      </div>

      {/* Per-question breakdown */}
      {results.questionStats.map((stat) => (
        <div key={stat.questionId} className="rounded-lg bg-white p-6 shadow">
          <h4 className="text-sm font-semibold text-gray-900">{stat.label}</h4>
          <p className="text-xs text-gray-500">
            {stat.totalResponses} responses &middot; {stat.type}
          </p>

          {stat.avgNumeric !== undefined && (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{
                      width: `${
                        stat.type === "NPS"
                          ? (stat.avgNumeric / 10) * 100
                          : (stat.avgNumeric / 5) * 100
                      }%`,
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {stat.avgNumeric.toFixed(1)}{stat.type === "NPS" ? "/10" : "/5"}
                </span>
              </div>
            </div>
          )}

          {stat.distribution && (
            <div className="mt-3 space-y-1">
              {Object.entries(stat.distribution)
                .sort(([, a], [, b]) => b - a)
                .map(([value, count]) => (
                  <div key={value} className="flex items-center gap-2 text-sm">
                    <div className="h-2 rounded-full bg-blue-400" style={{
                      width: `${(count / stat.totalResponses) * 100}%`,
                      minWidth: "8px",
                    }} />
                    <span className="flex-shrink-0 text-gray-600">{value}</span>
                    <span className="text-gray-400">({count})</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
