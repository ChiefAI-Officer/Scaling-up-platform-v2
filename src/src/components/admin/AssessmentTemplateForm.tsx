"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export interface AssessmentTemplateFormProps {
  mode: "create";
}

// ────────────────────────────────────────────────────────────────────────
// Local form state shapes. Mirror src/lib/assessments/scoring.ts Zod schemas
// at submit-time; stableKey is auto-derived (hidden from UI).
// ────────────────────────────────────────────────────────────────────────

interface SectionDraft {
  // Stable client-side id for React keys; stripped at submit.
  uid: string;
  name: string;
  description: string;
  partLabel: string;
}

interface QuestionDraft {
  uid: string;
  sectionUid: string; // local FK; resolved to sectionStableKey at submit
  label: string;
  helpText: string;
  isRequired: boolean;
  scaleMin: number;
  scaleMax: number;
  scaleStep: number;
  anchorMin: string;
  anchorMax: string;
}

interface TierDraft {
  uid: string;
  minMetric: number;
  maxMetric: string; // string so empty = unbounded; numeric parse at submit
  label: string;
  message: string;
}

type TierMetric = "countAchieved" | "overallTotal" | "overallAvg";

function genUid(): string {
  return `u${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_SECTION: Omit<SectionDraft, "uid"> = {
  name: "",
  description: "",
  partLabel: "",
};

const DEFAULT_QUESTION: Omit<QuestionDraft, "uid" | "sectionUid"> = {
  label: "",
  helpText: "",
  isRequired: true,
  scaleMin: 0,
  scaleMax: 3,
  scaleStep: 1,
  anchorMin: "Not true",
  anchorMax: "Completely true",
};

const DEFAULT_TIER: Omit<TierDraft, "uid"> = {
  minMetric: 0,
  maxMetric: "",
  label: "",
  message: "",
};

export function AssessmentTemplateForm({ mode: _mode }: AssessmentTemplateFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  // ─── Metadata ─────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState("");
  const [invitationSubject, setInvitationSubject] = useState(
    "You're invited to take an assessment",
  );
  const [invitationBodyMarkdown, setInvitationBodyMarkdown] = useState(
    "Hi {{respondentFirstName}},\n\nYou've been invited to take the {{campaignName}} assessment.\n\n[Start the assessment]({{invitationUrl}})\n\nThe survey closes on {{closeAt}}.",
  );
  const [aggregationMode, setAggregationMode] = useState<
    "FULL_VISIBILITY" | "CEO_ONLY"
  >("FULL_VISIBILITY");
  const [language, setLanguage] = useState("en");

  // ─── Sections ─────────────────────────────────────────────────────────
  const [sections, setSections] = useState<SectionDraft[]>([
    { uid: genUid(), ...DEFAULT_SECTION },
  ]);

  // ─── Questions ────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  // ─── Scoring ──────────────────────────────────────────────────────────
  const [tierMetric, setTierMetric] = useState<TierMetric>("countAchieved");
  const [passThreshold, setPassThreshold] = useState<number>(0);
  const [tiers, setTiers] = useState<TierDraft[]>([
    { uid: genUid(), ...DEFAULT_TIER },
  ]);

  // ─── reportConfig (kept as paste-JSON for now — not part of scoring engine) ─
  const [reportConfigJson, setReportConfigJson] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function moveSection(idx: number, dir: -1 | 1) {
    const next = [...sections];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSections(next);
  }

  function moveQuestionWithinAll(idx: number, dir: -1 | 1) {
    const next = [...questions];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setQuestions(next);
  }

  function moveTier(idx: number, dir: -1 | 1) {
    const next = [...tiers];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setTiers(next);
  }

  // Section uid → stableKey at build time, deterministic on order.
  const sectionStableKeyByUid = useMemo(() => {
    const out: Record<string, string> = {};
    sections.forEach((s, i) => {
      out[s.uid] = `S${i + 1}`;
    });
    return out;
  }, [sections]);

  function buildPayload(): {
    questions: unknown[];
    sections: unknown[];
    scoringConfig: unknown;
    reportConfig: unknown;
  } | null {
    if (sections.some((s) => !s.name.trim())) {
      setValidationError("Every section needs a name.");
      return null;
    }
    if (questions.length === 0) {
      setValidationError("Add at least one question.");
      return null;
    }
    if (questions.some((q) => !q.label.trim() || !q.sectionUid)) {
      setValidationError("Every question needs a label and a section.");
      return null;
    }
    if (questions.some((q) => q.scaleMax <= q.scaleMin || q.scaleStep <= 0)) {
      setValidationError("Question scale: max > min and step > 0 required.");
      return null;
    }
    if (tiers.length === 0) {
      setValidationError("Add at least one scoring tier.");
      return null;
    }
    if (tiers.some((t) => !t.label.trim() || !t.message.trim())) {
      setValidationError("Every tier needs a label and a message.");
      return null;
    }

    // Per-section running counter for stableKey: S1_Q1, S1_Q2, S2_Q1, ...
    const perSectionCounter: Record<string, number> = {};
    const questionsOut: unknown[] = [];
    questions.forEach((q, idx) => {
      const sectionStableKey = sectionStableKeyByUid[q.sectionUid];
      perSectionCounter[sectionStableKey] =
        (perSectionCounter[sectionStableKey] ?? 0) + 1;
      const stableKey = `${sectionStableKey}_Q${perSectionCounter[sectionStableKey]}`;
      questionsOut.push({
        stableKey,
        sortOrder: idx + 1,
        type: "SLIDER_LIKERT",
        label: q.label.trim(),
        ...(q.helpText.trim() ? { helpText: q.helpText.trim() } : {}),
        sectionStableKey,
        isRequired: q.isRequired,
        scale: {
          min: q.scaleMin,
          max: q.scaleMax,
          step: q.scaleStep,
          anchorMin: q.anchorMin,
          anchorMax: q.anchorMax,
        },
      });
    });

    const sectionsOut = sections.map((s, i) => ({
      stableKey: `S${i + 1}`,
      sortOrder: i + 1,
      name: s.name.trim(),
      ...(s.description.trim() ? { description: s.description.trim() } : {}),
      ...(s.partLabel.trim() ? { partLabel: s.partLabel.trim() } : {}),
    }));

    const tiersOut = tiers.map((t) => {
      const maxNum = t.maxMetric.trim() === "" ? undefined : Number(t.maxMetric);
      return {
        minMetric: Number(t.minMetric),
        ...(maxNum !== undefined && !Number.isNaN(maxNum)
          ? { maxMetric: maxNum }
          : {}),
        label: t.label.trim(),
        message: t.message.trim(),
      };
    });

    const scoringConfig = {
      tierMetric,
      passThreshold: Number(passThreshold),
      tiers: tiersOut,
    };

    let reportConfig: unknown = null;
    if (reportConfigJson.trim()) {
      try {
        reportConfig = JSON.parse(reportConfigJson);
      } catch (e) {
        setValidationError(
          `reportConfig: invalid JSON — ${
            e instanceof Error ? e.message : "parse error"
          }`,
        );
        return null;
      }
    }

    setValidationError(null);
    return {
      questions: questionsOut,
      sections: sectionsOut,
      scoringConfig,
      reportConfig,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/assessment-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          alias,
          description: description.trim() || null,
          invitationSubject,
          invitationBodyMarkdown,
          aggregationMode,
          language,
          ...payload,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          toast({
            title: "Alias already in use",
            description: "Pick a different alias and try again.",
            variant: "destructive",
          });
          return;
        }
        if (res.status === 400 && body.details) {
          toast({
            title: "Validation failed",
            description: JSON.stringify(body.details.fieldErrors ?? body.details),
            variant: "destructive",
          });
          return;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({ title: "Template created" });
      router.push(`/admin/assessments/templates/${body.data.id}`);
    } catch (err) {
      toast({
        title: "Could not create template",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ─── Metadata ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Metadata</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="template-name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Alias (URL slug, immutable)
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value.toLowerCase())}
              required
              pattern="[a-z0-9][a-z0-9-]*"
              maxLength={80}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="my-template"
              data-testid="template-alias"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Lowercase, digits, dashes only.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="template-description"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Aggregation mode
            </label>
            <select
              value={aggregationMode}
              onChange={(e) =>
                setAggregationMode(
                  e.target.value as "FULL_VISIBILITY" | "CEO_ONLY",
                )
              }
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="template-aggregation-mode"
            >
              <option value="FULL_VISIBILITY">FULL_VISIBILITY</option>
              <option value="CEO_ONLY">CEO_ONLY</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Language
            </label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              required
              maxLength={8}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="template-language"
            />
          </div>
        </div>
      </div>

      {/* ─── Invitation email ─────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Invitation email</h2>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Subject
          </label>
          <input
            type="text"
            value={invitationSubject}
            onChange={(e) => setInvitationSubject(e.target.value)}
            required
            maxLength={200}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="template-invitation-subject"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Body (Markdown)
          </label>
          <textarea
            value={invitationBodyMarkdown}
            onChange={(e) => setInvitationBodyMarkdown(e.target.value)}
            required
            rows={6}
            maxLength={5000}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="template-invitation-body"
          />
        </div>
      </div>

      {/* ─── Sections ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Sections</h2>
          <button
            type="button"
            onClick={() =>
              setSections((s) => [...s, { uid: genUid(), ...DEFAULT_SECTION }])
            }
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-card text-foreground hover:bg-muted"
            data-testid="add-section"
          >
            <Plus className="w-3.5 h-3.5" /> Section
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sections group questions and drive per-section averages in reports.
          Identifiers (S1, S2…) are auto-generated from order.
        </p>
        {sections.map((s, idx) => (
          <div
            key={s.uid}
            className="border border-border rounded-md p-3 space-y-2"
            data-testid={`section-row-${idx}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                S{idx + 1}
              </span>
              <input
                type="text"
                value={s.name}
                onChange={(e) =>
                  setSections((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, name: e.target.value } : row,
                    ),
                  )
                }
                placeholder="Section name"
                className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => moveSection(idx, -1)}
                disabled={idx === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveSection(idx, 1)}
                disabled={idx === sections.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sections.length === 1) return;
                  const removingUid = s.uid;
                  setSections((cur) => cur.filter((_, i) => i !== idx));
                  setQuestions((cur) =>
                    cur.filter((q) => q.sectionUid !== removingUid),
                  );
                }}
                disabled={sections.length === 1}
                className="text-destructive hover:text-destructive/80 disabled:opacity-30"
                aria-label="Remove section"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={s.partLabel}
              onChange={(e) =>
                setSections((cur) =>
                  cur.map((row, i) =>
                    i === idx ? { ...row, partLabel: e.target.value } : row,
                  ),
                )
              }
              placeholder="Optional: part label (e.g. 'Part 1: Leadership')"
              className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <textarea
              value={s.description}
              onChange={(e) =>
                setSections((cur) =>
                  cur.map((row, i) =>
                    i === idx ? { ...row, description: e.target.value } : row,
                  ),
                )
              }
              placeholder="Optional: section description shown to respondents"
              rows={2}
              className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        ))}
      </div>

      {/* ─── Questions ────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Questions</h2>
          <button
            type="button"
            onClick={() =>
              setQuestions((q) => [
                ...q,
                {
                  uid: genUid(),
                  sectionUid: sections[0]?.uid ?? "",
                  ...DEFAULT_QUESTION,
                },
              ])
            }
            disabled={sections.length === 0}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
            data-testid="add-question"
          >
            <Plus className="w-3.5 h-3.5" /> Question
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          All questions today are SLIDER_LIKERT type. Identifiers (S1_Q1…) are
          auto-generated from section + position.
        </p>
        {questions.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            No questions yet. Click <strong>Question</strong> to add one.
          </p>
        )}
        {questions.map((q, idx) => (
          <div
            key={q.uid}
            className="border border-border rounded-md p-3 space-y-2"
            data-testid={`question-row-${idx}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                Q{idx + 1}
              </span>
              <input
                type="text"
                value={q.label}
                onChange={(e) =>
                  setQuestions((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, label: e.target.value } : row,
                    ),
                  )
                }
                placeholder="Question label"
                className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => moveQuestionWithinAll(idx, -1)}
                disabled={idx === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveQuestionWithinAll(idx, 1)}
                disabled={idx === questions.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setQuestions((cur) => cur.filter((_, i) => i !== idx))
                }
                className="text-destructive hover:text-destructive/80"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={q.sectionUid}
                onChange={(e) =>
                  setQuestions((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, sectionUid: e.target.value } : row,
                    ),
                  )
                }
                className="px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {sections.map((s, sIdx) => (
                  <option key={s.uid} value={s.uid}>
                    S{sIdx + 1} — {s.name || "(unnamed)"}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={q.isRequired}
                  onChange={(e) =>
                    setQuestions((cur) =>
                      cur.map((row, i) =>
                        i === idx ? { ...row, isRequired: e.target.checked } : row,
                      ),
                    )
                  }
                />
                Required
              </label>
            </div>
            <input
              type="text"
              value={q.helpText}
              onChange={(e) =>
                setQuestions((cur) =>
                  cur.map((row, i) =>
                    i === idx ? { ...row, helpText: e.target.value } : row,
                  ),
                )
              }
              placeholder="Optional: help text shown below the question"
              className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <fieldset className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <NumInput
                label="min"
                value={q.scaleMin}
                onChange={(v) =>
                  setQuestions((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, scaleMin: v } : row,
                    ),
                  )
                }
              />
              <NumInput
                label="max"
                value={q.scaleMax}
                onChange={(v) =>
                  setQuestions((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, scaleMax: v } : row,
                    ),
                  )
                }
              />
              <NumInput
                label="step"
                value={q.scaleStep}
                onChange={(v) =>
                  setQuestions((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, scaleStep: v } : row,
                    ),
                  )
                }
              />
              <TextInput
                label="anchor min"
                value={q.anchorMin}
                onChange={(v) =>
                  setQuestions((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, anchorMin: v } : row,
                    ),
                  )
                }
              />
              <TextInput
                label="anchor max"
                value={q.anchorMax}
                onChange={(v) =>
                  setQuestions((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, anchorMax: v } : row,
                    ),
                  )
                }
              />
            </fieldset>
          </div>
        ))}
      </div>

      {/* ─── Scoring ──────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Scoring</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Tier metric
            </label>
            <select
              value={tierMetric}
              onChange={(e) => setTierMetric(e.target.value as TierMetric)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="countAchieved">countAchieved</option>
              <option value="overallTotal">overallTotal</option>
              <option value="overallAvg">overallAvg</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Pass threshold (a question is &quot;achieved&quot; when value ≥ this)
            </label>
            <input
              type="number"
              value={passThreshold}
              onChange={(e) => setPassThreshold(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-xs font-semibold text-foreground">Tiers</h3>
          <button
            type="button"
            onClick={() =>
              setTiers((t) => [...t, { uid: genUid(), ...DEFAULT_TIER }])
            }
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-card text-foreground hover:bg-muted"
            data-testid="add-tier"
          >
            <Plus className="w-3.5 h-3.5" /> Tier
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A tier matches when <code>minMetric ≤ metric &lt; maxMetric</code>.
          Leave maxMetric blank to make the tier unbounded (top tier).
        </p>
        {tiers.map((t, idx) => (
          <div
            key={t.uid}
            className="border border-border rounded-md p-3 space-y-2"
            data-testid={`tier-row-${idx}`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <NumInput
                label="min"
                value={t.minMetric}
                onChange={(v) =>
                  setTiers((cur) =>
                    cur.map((row, i) =>
                      i === idx ? { ...row, minMetric: v } : row,
                    ),
                  )
                }
                className="sm:col-span-2"
              />
              <div className="sm:col-span-2">
                <label className="block text-[10px] text-muted-foreground mb-0.5">
                  max (blank = unbounded)
                </label>
                <input
                  type="text"
                  value={t.maxMetric}
                  onChange={(e) =>
                    setTiers((cur) =>
                      cur.map((row, i) =>
                        i === idx ? { ...row, maxMetric: e.target.value } : row,
                      ),
                    )
                  }
                  placeholder=""
                  className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[10px] text-muted-foreground mb-0.5">
                  label
                </label>
                <input
                  type="text"
                  value={t.label}
                  onChange={(e) =>
                    setTiers((cur) =>
                      cur.map((row, i) =>
                        i === idx ? { ...row, label: e.target.value } : row,
                      ),
                    )
                  }
                  className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-[10px] text-muted-foreground mb-0.5">
                  message
                </label>
                <input
                  type="text"
                  value={t.message}
                  onChange={(e) =>
                    setTiers((cur) =>
                      cur.map((row, i) =>
                        i === idx ? { ...row, message: e.target.value } : row,
                      ),
                    )
                  }
                  className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="sm:col-span-1 flex items-end justify-end gap-1">
                <button
                  type="button"
                  onClick={() => moveTier(idx, -1)}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveTier(idx, 1)}
                  disabled={idx === tiers.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTiers((cur) => cur.filter((_, i) => i !== idx))
                  }
                  disabled={tiers.length === 1}
                  className="text-destructive hover:text-destructive/80 disabled:opacity-30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── reportConfig (advanced) ─────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Report config (advanced, optional)
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Paste-JSON for now — used by future report templates. Leave blank for
          null.
        </p>
        <textarea
          value={reportConfigJson}
          onChange={(e) => setReportConfigJson(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-xs border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Leave blank for null"
        />
      </div>

      {validationError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-2 rounded-md">
          {validationError}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/admin/assessments/templates")}
          disabled={submitting}
          className="inline-flex items-center text-sm font-medium px-3 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="template-submit"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Create template
        </button>
      </div>
    </form>
  );
}

function NumInput({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] text-muted-foreground mb-0.5">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground mb-0.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
