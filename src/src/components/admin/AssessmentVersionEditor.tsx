"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// ────────────────────────────────────────────────────────────────────────
// Local draft shapes — same as AssessmentTemplateForm. Kept duplicated for
// now since the wire shape that goes to the API is built per-flow (create
// template vs edit version).
// ────────────────────────────────────────────────────────────────────────

interface SectionDraft {
  uid: string;
  stableKey: string;
  name: string;
  description: string;
  partLabel: string;
}

interface QuestionDraft {
  uid: string;
  sectionUid: string;
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
  maxMetric: string;
  label: string;
  message: string;
}

type TierMetric = "countAchieved" | "overallTotal" | "overallAvg";

interface FetchedVersion {
  version: {
    id: string;
    versionNumber: number;
    language: string;
    questions: unknown;
    sections: unknown;
    scoringConfig: unknown;
    reportConfig: unknown;
    publishedAt: string | null;
  };
  template: { id: string; name: string; alias: string };
}

function genUid(): string {
  return `u${Math.random().toString(36).slice(2, 10)}`;
}

// Hydrate existing JSON content into the draft shape. Tolerant of partial /
// unfamiliar JSON — anything missing falls back to a sensible default.
function hydrateFromServer(version: FetchedVersion["version"]): {
  sections: SectionDraft[];
  questions: QuestionDraft[];
  tierMetric: TierMetric;
  passThreshold: number;
  tiers: TierDraft[];
  reportConfigJson: string;
} {
  // Sections.
  const rawSections = Array.isArray(version.sections) ? version.sections : [];
  type RawSec = {
    stableKey?: unknown;
    name?: unknown;
    description?: unknown;
    partLabel?: unknown;
  };
  const sections: SectionDraft[] = rawSections.map((raw, idx) => {
    const s = raw as RawSec;
    return {
      uid: genUid(),
      stableKey: typeof s.stableKey === "string" ? s.stableKey : `S${idx + 1}`,
      name: typeof s.name === "string" ? s.name : "",
      description: typeof s.description === "string" ? s.description : "",
      partLabel: typeof s.partLabel === "string" ? s.partLabel : "",
    };
  });
  if (sections.length === 0) {
    sections.push({
      uid: genUid(),
      stableKey: "S1",
      name: "",
      description: "",
      partLabel: "",
    });
  }

  // Index sections by stableKey for question section lookup.
  const sectionUidByStableKey: Record<string, string> = {};
  sections.forEach((s) => {
    sectionUidByStableKey[s.stableKey] = s.uid;
  });

  // Questions.
  type RawScale = {
    min?: unknown;
    max?: unknown;
    step?: unknown;
    anchorMin?: unknown;
    anchorMax?: unknown;
  };
  type RawQ = {
    label?: unknown;
    helpText?: unknown;
    sectionStableKey?: unknown;
    isRequired?: unknown;
    scale?: RawScale;
  };
  const rawQuestions = Array.isArray(version.questions) ? version.questions : [];
  const questions: QuestionDraft[] = rawQuestions.map((raw) => {
    const q = raw as RawQ;
    const sectionStableKey =
      typeof q.sectionStableKey === "string" ? q.sectionStableKey : "";
    const sectionUid =
      sectionUidByStableKey[sectionStableKey] ?? sections[0].uid;
    const scale = q.scale ?? {};
    return {
      uid: genUid(),
      sectionUid,
      label: typeof q.label === "string" ? q.label : "",
      helpText: typeof q.helpText === "string" ? q.helpText : "",
      isRequired: typeof q.isRequired === "boolean" ? q.isRequired : true,
      scaleMin: typeof scale.min === "number" ? scale.min : 0,
      scaleMax: typeof scale.max === "number" ? scale.max : 3,
      scaleStep: typeof scale.step === "number" ? scale.step : 1,
      anchorMin: typeof scale.anchorMin === "string" ? scale.anchorMin : "Not true",
      anchorMax:
        typeof scale.anchorMax === "string" ? scale.anchorMax : "Completely true",
    };
  });

  // Scoring config.
  type RawTier = {
    minMetric?: unknown;
    maxMetric?: unknown;
    label?: unknown;
    message?: unknown;
  };
  type RawScoring = {
    tierMetric?: unknown;
    passThreshold?: unknown;
    tiers?: unknown;
  };
  const rawScoring = (version.scoringConfig ?? {}) as RawScoring;
  const tierMetricRaw = rawScoring.tierMetric;
  const tierMetric: TierMetric =
    tierMetricRaw === "overallTotal" || tierMetricRaw === "overallAvg"
      ? tierMetricRaw
      : "countAchieved";
  const passThreshold =
    typeof rawScoring.passThreshold === "number" ? rawScoring.passThreshold : 0;
  const rawTiers = Array.isArray(rawScoring.tiers) ? rawScoring.tiers : [];
  const tiers: TierDraft[] = rawTiers.map((raw) => {
    const t = raw as RawTier;
    return {
      uid: genUid(),
      minMetric: typeof t.minMetric === "number" ? t.minMetric : 0,
      maxMetric: typeof t.maxMetric === "number" ? String(t.maxMetric) : "",
      label: typeof t.label === "string" ? t.label : "",
      message: typeof t.message === "string" ? t.message : "",
    };
  });
  if (tiers.length === 0) {
    tiers.push({
      uid: genUid(),
      minMetric: 0,
      maxMetric: "",
      label: "",
      message: "",
    });
  }

  const reportConfigJson =
    version.reportConfig === null || version.reportConfig === undefined
      ? ""
      : JSON.stringify(version.reportConfig, null, 2);

  return { sections, questions, tierMetric, passThreshold, tiers, reportConfigJson };
}

export function AssessmentVersionEditor({
  templateId,
  versionId,
}: {
  templateId: string;
  versionId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<FetchedVersion | null>(null);

  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [tierMetric, setTierMetric] = useState<TierMetric>("countAchieved");
  const [passThreshold, setPassThreshold] = useState<number>(0);
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [reportConfigJson, setReportConfigJson] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/admin/assessment-templates/${templateId}/versions/${versionId}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        success: boolean;
        data: FetchedVersion;
      };
      const hydrated = hydrateFromServer(body.data.version);
      setMeta(body.data);
      setSections(hydrated.sections);
      setQuestions(hydrated.questions);
      setTierMetric(hydrated.tierMetric);
      setPassThreshold(hydrated.passThreshold);
      setTiers(hydrated.tiers);
      setReportConfigJson(hydrated.reportConfigJson);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [templateId, versionId]);

  useEffect(() => {
    load();
  }, [load]);

  const isPublished = meta?.version.publishedAt !== null;

  const sectionStableKeyByUid = useMemo(() => {
    const out: Record<string, string> = {};
    sections.forEach((s, i) => {
      out[s.uid] = `S${i + 1}`;
    });
    return out;
  }, [sections]);

  function moveSection(idx: number, dir: -1 | 1) {
    const next = [...sections];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setSections(next);
  }
  function moveQuestion(idx: number, dir: -1 | 1) {
    const next = [...questions];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setQuestions(next);
  }
  function moveTier(idx: number, dir: -1 | 1) {
    const next = [...tiers];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setTiers(next);
  }

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
    if (tiers.length === 0 || tiers.some((t) => !t.label.trim() || !t.message.trim())) {
      setValidationError("Every tier needs a label and a message.");
      return null;
    }

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
    return { questions: questionsOut, sections: sectionsOut, scoringConfig, reportConfig };
  }

  async function handleSave() {
    if (submitting || isPublished) return;
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/assessment-templates/${templateId}/versions/${versionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && body.error === "ALREADY_PUBLISHED") {
          toast({
            title: "Already published",
            description: "Content is immutable once published.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({ title: "Version saved" });
      router.push(`/admin/assessment-templates/${templateId}`);
    } catch (e) {
      toast({
        title: "Could not save version",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        Loading version…
      </div>
    );
  }
  if (loadError || !meta) {
    return (
      <div className="space-y-4">
        <Link
          href={`/admin/assessment-templates/${templateId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="px-6 py-12 text-center text-sm text-destructive">
          {loadError || "Version not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/assessment-templates/${templateId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Template
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">
          v{meta.version.versionNumber} ({meta.version.language})
          {isPublished && (
            <span className="ml-3 text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-success/10 text-success ring-1 ring-success/20 align-middle">
              Published
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {meta.template.name} · {meta.template.alias}
        </p>
        {isPublished && (
          <p className="text-xs text-muted-foreground italic pt-1">
            Published versions are read-only. Duplicate this version into a
            new draft from the template detail page to evolve the content.
          </p>
        )}
      </header>

      {/* Sections */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Sections</h2>
          {!isPublished && (
            <button
              type="button"
              onClick={() =>
                setSections((s) => [
                  ...s,
                  {
                    uid: genUid(),
                    stableKey: `S${s.length + 1}`,
                    name: "",
                    description: "",
                    partLabel: "",
                  },
                ])
              }
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-card text-foreground hover:bg-muted"
              data-testid="add-section"
            >
              <Plus className="w-3.5 h-3.5" /> Section
            </button>
          )}
        </div>
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
                disabled={isPublished}
                placeholder="Section name"
                className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
              {!isPublished && (
                <>
                  <button
                    type="button"
                    onClick={() => moveSection(idx, -1)}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(idx, 1)}
                    disabled={idx === sections.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
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
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
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
              disabled={isPublished}
              placeholder="Optional: part label"
              className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
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
              disabled={isPublished}
              placeholder="Optional: description"
              rows={2}
              className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
          </div>
        ))}
      </div>

      {/* Questions */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Questions</h2>
          {!isPublished && (
            <button
              type="button"
              onClick={() =>
                setQuestions((q) => [
                  ...q,
                  {
                    uid: genUid(),
                    sectionUid: sections[0]?.uid ?? "",
                    label: "",
                    helpText: "",
                    isRequired: true,
                    scaleMin: 0,
                    scaleMax: 3,
                    scaleStep: 1,
                    anchorMin: "Not true",
                    anchorMax: "Completely true",
                  },
                ])
              }
              disabled={sections.length === 0}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
              data-testid="add-question"
            >
              <Plus className="w-3.5 h-3.5" /> Question
            </button>
          )}
        </div>
        {questions.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            No questions.
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
                disabled={isPublished}
                placeholder="Question label"
                className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
              {!isPublished && (
                <>
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, -1)}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, 1)}
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
                </>
              )}
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
                disabled={isPublished}
                className="px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
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
                        i === idx
                          ? { ...row, isRequired: e.target.checked }
                          : row,
                      ),
                    )
                  }
                  disabled={isPublished}
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
              disabled={isPublished}
              placeholder="Optional: help text"
              className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
            <fieldset className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <NumInput
                label="min"
                value={q.scaleMin}
                disabled={isPublished}
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
                disabled={isPublished}
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
                disabled={isPublished}
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
                disabled={isPublished}
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
                disabled={isPublished}
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

      {/* Scoring */}
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
              disabled={isPublished}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            >
              <option value="countAchieved">countAchieved</option>
              <option value="overallTotal">overallTotal</option>
              <option value="overallAvg">overallAvg</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Pass threshold
            </label>
            <input
              type="number"
              value={passThreshold}
              onChange={(e) => setPassThreshold(Number(e.target.value))}
              disabled={isPublished}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <h3 className="text-xs font-semibold text-foreground">Tiers</h3>
          {!isPublished && (
            <button
              type="button"
              onClick={() =>
                setTiers((t) => [
                  ...t,
                  {
                    uid: genUid(),
                    minMetric: 0,
                    maxMetric: "",
                    label: "",
                    message: "",
                  },
                ])
              }
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-card text-foreground hover:bg-muted"
              data-testid="add-tier"
            >
              <Plus className="w-3.5 h-3.5" /> Tier
            </button>
          )}
        </div>
        {tiers.map((t, idx) => (
          <div
            key={t.uid}
            className="border border-border rounded-md p-3 space-y-2"
            data-testid={`tier-row-${idx}`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <NumInput
                label="min"
                value={t.minMetric}
                disabled={isPublished}
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
                  disabled={isPublished}
                  className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
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
                  disabled={isPublished}
                  className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
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
                  disabled={isPublished}
                  className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                />
              </div>
              <div className="sm:col-span-1 flex items-end justify-end gap-1">
                {!isPublished && (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Report config */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Report config (paste-JSON, optional)
        </h2>
        <textarea
          value={reportConfigJson}
          onChange={(e) => setReportConfigJson(e.target.value)}
          disabled={isPublished}
          rows={4}
          className="w-full px-3 py-2 text-xs border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          placeholder="Leave blank for null"
        />
      </div>

      {validationError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-2 rounded-md">
          {validationError}
        </div>
      )}

      {!isPublished && (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(`/admin/assessment-templates/${templateId}`)
            }
            disabled={submitting}
            className="inline-flex items-center text-sm font-medium px-3 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            data-testid="save-version-btn"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save draft
          </button>
        </div>
      )}
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  className,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
  disabled?: boolean;
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
        disabled={disabled}
        className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
      />
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
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
        disabled={disabled}
        className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
      />
    </div>
  );
}
