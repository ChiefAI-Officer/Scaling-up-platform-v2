"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  SURVEY_TYPES,
  SURVEY_TYPE_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
} from "@/lib/surveys/survey-types";
import type { SurveyType, QuestionType } from "@/lib/surveys/survey-types";
// ENH-MAY6-3: pure read-only renderer for the Preview modal.
import { SurveyFormView } from "@/components/surveys/survey-form-view";
// BUG-MAY13-2 (Task B2): the Results tab now uses the same per-question
// per-person renderer as the workshop-page survey view (no more aggregate-only
// SurveyResultsPanel). `showWorkshop` is enabled because responses on a
// template span multiple workshops, unlike the per-workshop pages.
import {
  SurveyResultsContent,
  type SurveyResultTemplateGroup,
} from "@/components/surveys/survey-results-view";

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

// BUG-MAY13-2 (Task B2): per-answer shape carried alongside each Survey so
// the Results tab can mount <SurveyResultsContent>. The fields below mirror
// what <SurveyResultsContent>/SurveyResultAnswer consume — id, questionId,
// value, numValue. The joined `question` row is required to build the
// SurveyResultQuestion list passed to the renderer.
interface SerializedSurveyAnswer {
  id: string;
  questionId: string;
  value: string | null;
  numValue: number | null;
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
  // BUG-MAY13-2 (Task B2): joined answers (with their question row attached
  // by the page-level Prisma include). Required by <SurveyResultsContent>.
  answers: SerializedSurveyAnswer[];
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

  // ENH-MAY6-3: Preview modal state.
  const [showPreview, setShowPreview] = useState(false);

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
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to Templates
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            {isNew ? "New Survey Template" : template?.name || ""}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* ENH-MAY6-3: open the preview modal — read-only render of the template's questions */}
          {!isNew && questions.length > 0 && (
            <button
              onClick={() => setShowPreview(true)}
              className="text-sm text-primary hover:text-primary/80 underline"
              type="button"
            >
              Preview
            </button>
          )}
          {!isNew && (
            <button
              onClick={deleteTemplate}
              className="text-sm text-destructive hover:text-destructive/80"
            >
              Delete Template
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Template Details */}
      <div className="rounded-lg bg-card p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Template Details</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
              placeholder="e.g., Post-Workshop Feedback"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Survey Type</label>
            <select
              value={surveyType}
              onChange={(e) => setSurveyType(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              {Object.entries(SURVEY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="">All Categories (Generic)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Auto-assigned to workshops in this category</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
              placeholder="Optional description"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          {!isNew && (
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border"
              />
              Active
            </label>
          )}
          <button
            onClick={saveTemplate}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : isNew ? "Create Template" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Tabs (only for existing templates) */}
      {!isNew && template && (
        <>
          <div className="border-b border-border">
            <nav className="-mb-px flex space-x-8">
              {(["builder", "assign", "results"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-1 py-3 text-sm font-medium ${
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
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
              <div className="rounded-lg border-2 border-dashed border-border p-6">
                <p className="mb-3 text-sm font-medium text-foreground">Add Question</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(QUESTION_TYPE_LABELS).map(([type, label]) => (
                    <button
                      key={type}
                      onClick={() => addNewQuestion(type as QuestionType)}
                      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
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
              <div className="rounded-lg bg-card p-6 shadow">
                <h3 className="mb-4 text-lg font-semibold text-foreground">
                  Assign Survey to Workshop
                </h3>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-foreground">
                      Workshop
                    </label>
                    <select
                      value={assignWorkshopId}
                      onChange={(e) => setAssignWorkshopId(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
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
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {assigning ? "Assigning..." : "Assign"}
                  </button>
                </div>
              </div>

              {/* Assigned Surveys List */}
              {template.surveys.length > 0 && (
                <div className="rounded-lg bg-card shadow">
                  <div className="border-b px-6 py-4">
                    <h3 className="text-lg font-semibold text-foreground">
                      Assigned Surveys ({template.surveys.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                            Workshop
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                            Attendee
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                            NPS
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {template.surveys.map((survey) => (
                          <tr key={survey.id}>
                            <td className="px-6 py-3 text-sm">
                              <span className="font-mono text-xs text-muted-foreground">
                                {survey.workshop.workshopCode}
                              </span>{" "}
                              {survey.workshop.title}
                            </td>
                            <td className="px-6 py-3 text-sm text-foreground">
                              {survey.registration
                                ? `${survey.registration.firstName} ${survey.registration.lastName}`
                                : "—"}
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  survey.completedAt
                                    ? "bg-success/10 text-success"
                                    : "bg-warning/10 text-warning"
                                }`}
                              >
                                {survey.completedAt ? "Completed" : "Pending"}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-sm text-foreground">
                              {survey.npsScore !== null ? survey.npsScore : "—"}
                            </td>
                            <td className="px-6 py-3 text-sm">
                              {!survey.completedAt && (
                                <button
                                  onClick={() => {
                                    const url = `${window.location.origin}/survey/${survey.id}`;
                                    navigator.clipboard.writeText(url);
                                  }}
                                  className="text-primary hover:text-primary/80"
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

          {/* Results Tab — BUG-MAY13-2 (Task B2):
              Mounts the same <SurveyResultsContent> body used by the per-workshop
              survey pages, ensuring the template-editor Results view shows the
              same per-question + per-person shape (RATING/NPS bullets, text
              answer attribution, Respondents pill panel). `showWorkshop` is on
              because responses span multiple workshops here.

              Empty-state semantics: if no completed surveys exist, we pass an
              empty `templateGroups` array so the component renders its built-in
              "No survey responses yet" card (replaces the prior aggregate-only
              panel's "No responses collected yet" copy). */}
          {activeTab === "results" && (() => {
            const completedResponses = template.surveys
              .filter((s) => s.completedAt !== null)
              .map((s) => ({
                id: s.id,
                answers: s.answers.map((a) => ({
                  id: a.id,
                  questionId: a.questionId,
                  value: a.value,
                  numValue: a.numValue,
                })),
                registration: s.registration,
                workshop: s.workshop,
              }));
            const templateGroups: SurveyResultTemplateGroup[] =
              completedResponses.length === 0
                ? []
                : [
                    {
                      templateName: template.name,
                      surveyType: template.surveyType,
                      questions: template.questions.map((q) => ({
                        id: q.id,
                        label: q.label,
                        questionType: q.questionType,
                      })),
                      responses: completedResponses,
                    },
                  ];
            return (
              <SurveyResultsContent showWorkshop templateGroups={templateGroups} />
            );
          })()}
        </>
      )}

      {/* ENH-MAY6-3: Preview modal — pure read-only render of the questions */}
      {showPreview && template && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-6 py-3">
              <h3 className="text-sm font-semibold text-foreground">Survey Preview</h3>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                aria-label="Close preview"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ✕ Close
              </button>
            </div>
            <SurveyFormView
              templateName={name || template.name}
              questions={questions.map((q) => ({
                id: q.id,
                questionType: q.questionType,
                label: q.label,
                description: q.description,
                isRequired: q.isRequired,
                options: q.options ? JSON.parse(q.options) : undefined,
                sortOrder: q.sortOrder,
              }))}
              mode="preview"
            />
          </div>
        </div>
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
    TEXT: "bg-muted text-foreground",
    TEXTAREA: "bg-muted text-foreground",
    RATING: "bg-warning/10 text-warning",
    NPS: "bg-status-post/10 text-status-post",
    SINGLE_CHOICE: "bg-primary/10 text-primary",
    MULTI_CHOICE: "bg-primary/10 text-primary",
    YES_NO: "bg-success/10 text-success",
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-primary/20 bg-card p-5 shadow-sm">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground">Question Text</label>
            <input
              type="text"
              defaultValue={question.label}
              onBlur={(e) => onUpdate(question.id, "label", e.target.value)}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground">
              Help Text (optional)
            </label>
            <input
              type="text"
              defaultValue={question.description || ""}
              onBlur={(e) => onUpdate(question.id, "description", e.target.value)}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                defaultChecked={question.isRequired}
                onChange={(e) => onUpdate(question.id, "isRequired", e.target.checked)}
                className="rounded border-border"
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
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm hover:border-border">
      {/* Reorder buttons */}
      <div className="flex flex-col gap-1 pt-1">
        <button
          onClick={() => onMove(index, "up")}
          disabled={index === 0}
          className="text-muted-foreground hover:text-muted-foreground disabled:opacity-30"
          title="Move up"
        >
          &#9650;
        </button>
        <button
          onClick={() => onMove(index, "down")}
          disabled={index === total - 1}
          className="text-muted-foreground hover:text-muted-foreground disabled:opacity-30"
          title="Move down"
        >
          &#9660;
        </button>
      </div>

      {/* Question content */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Q{index + 1}</span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              typeColor[question.questionType] || "bg-muted text-foreground"
            }`}
          >
            {QUESTION_TYPE_LABELS[question.questionType as QuestionType] || question.questionType}
          </span>
          {question.isRequired && (
            <span className="text-xs text-destructive">Required</span>
          )}
        </div>
        <p className="mt-1 text-sm text-foreground">{question.label}</p>
        {question.description && (
          <p className="text-xs text-muted-foreground">{question.description}</p>
        )}
        {parsedOptions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {parsedOptions.map((opt, i) => (
              <span key={i} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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
          className="text-sm text-primary hover:text-primary/80"
        >
          Edit
        </button>
        <button
          onClick={() => onRemove(question.id)}
          className="text-sm text-destructive hover:text-destructive/80"
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
      <label className="block text-sm font-medium text-foreground">Options</label>
      <div className="mt-1 space-y-2">
        {localOptions.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              onBlur={commitOptions}
              className="block w-full rounded-md border border-border px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => removeOption(i)}
              className="text-sm text-destructive hover:text-destructive/80"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addOption}
        className="mt-2 text-sm text-primary hover:text-primary/80"
      >
        + Add Option
      </button>
    </div>
  );
}

// BUG-MAY13-2 (Task B2): the legacy <SurveyResultsPanel> sub-component
// (aggregate-only, fetched from /api/survey-templates/[id]/results) was
// removed in favor of <SurveyResultsContent showWorkshop /> imported from
// @/components/surveys/survey-results-view. See the Results tab above.
//
// The /api/survey-templates/[id]/results API route remains because it is
// kept available for other potential consumers (e.g., the aggregate page),
// even though this file no longer fetches from it.
