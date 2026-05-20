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
//
// Phase E1.1: see Step 0 raw-object preservation comments below — the
// editable surfaces (sections/questions/scoringConfig) round-trip via a
// dirty-tracked spread + overlay so unknown / unedited fields are never
// dropped. SectionDraft / QuestionDraft hold ONLY the UI-editable subset.
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
  stableKey: string;
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

// E1.1 — D2 metadata refs held alongside raw scoringConfig so the read-only
// context panel + per-domain editor can render. NOT editable.
interface DomainMeta {
  key: string;
  label: string;
}
type RollupOverall = "meanOfQuestions" | "meanOfSections" | "meanOfDomains";

type DomainTiersDraft = Record<string, TierDraft[]>;

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

function rollupLabel(overall: RollupOverall): string {
  switch (overall) {
    case "meanOfQuestions":
      return "Mean of question values";
    case "meanOfSections":
      return "Mean of section means";
    case "meanOfDomains":
      return "Mean of domain means";
    default:
      return overall;
  }
}

// Hydrate existing JSON content into the draft shape. Tolerant of partial /
// unfamiliar JSON — anything missing falls back to a sensible default.
//
// E1.1 — ALSO returns the raw server JSON for sections/questions/scoringConfig/
// reportConfig so buildPayload() can spread + overlay only the UI-editable
// fields and preserve everything else (stableKey, sortOrder, section.domain,
// question.recommendations[], scoringConfig.rollup / domains / scaleUpScore,
// any unknown future fields).
function hydrateFromServer(version: FetchedVersion["version"]): {
  sections: SectionDraft[];
  questions: QuestionDraft[];
  tierMetric: TierMetric;
  passThreshold: number;
  tiers: TierDraft[];
  reportConfigJson: string;
  rawSections: unknown[];
  rawQuestions: unknown[];
  rawScoringConfig: Record<string, unknown>;
  rawReportConfig: unknown;
  domainsMeta: DomainMeta[];
  rollupOverall: RollupOverall | null;
  scaleUpScoreEnabled: boolean;
  domainTiers: DomainTiersDraft;
} {
  // Sections.
  const rawSectionsArr = Array.isArray(version.sections) ? version.sections : [];
  type RawSec = {
    stableKey?: unknown;
    name?: unknown;
    description?: unknown;
    partLabel?: unknown;
  };
  const sections: SectionDraft[] = rawSectionsArr.map((raw, idx) => {
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
    stableKey?: unknown;
    label?: unknown;
    helpText?: unknown;
    sectionStableKey?: unknown;
    isRequired?: unknown;
    scale?: RawScale;
  };
  const rawQuestionsArr = Array.isArray(version.questions) ? version.questions : [];
  const questions: QuestionDraft[] = rawQuestionsArr.map((raw, idx) => {
    const q = raw as RawQ;
    const sectionStableKey =
      typeof q.sectionStableKey === "string" ? q.sectionStableKey : "";
    const sectionUid =
      sectionUidByStableKey[sectionStableKey] ?? sections[0].uid;
    const scale = q.scale ?? {};
    // Preserve canonical stableKey from server (e.g. SU Full's "Q01") so
    // raw-by-stableKey lookup in buildPayload survives reorder/add/delete
    // without misaligning recommendations / unknown fields.
    const stableKey =
      typeof q.stableKey === "string" && q.stableKey.length > 0
        ? q.stableKey
        : `${sectionStableKey || "S?"}_Q${idx + 1}`;
    return {
      uid: genUid(),
      stableKey,
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
  type RawDomain = {
    key?: unknown;
    label?: unknown;
    tiers?: unknown;
  };
  type RawRollup = { overall?: unknown };
  type RawScoring = {
    tierMetric?: unknown;
    passThreshold?: unknown;
    tiers?: unknown;
    domains?: unknown;
    rollup?: RawRollup;
    scaleUpScore?: unknown;
  };
  const rawScoringObj = (version.scoringConfig ?? {}) as RawScoring;
  const rawScoringRecord = (
    version.scoringConfig && typeof version.scoringConfig === "object"
      ? (version.scoringConfig as Record<string, unknown>)
      : {}
  );
  const tierMetricRaw = rawScoringObj.tierMetric;
  const tierMetric: TierMetric =
    tierMetricRaw === "overallTotal" || tierMetricRaw === "overallAvg"
      ? tierMetricRaw
      : "countAchieved";
  const passThreshold =
    typeof rawScoringObj.passThreshold === "number"
      ? rawScoringObj.passThreshold
      : 0;
  const rawTiers = Array.isArray(rawScoringObj.tiers) ? rawScoringObj.tiers : [];
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

  // D2 metadata — domains + rollup + scaleUpScore. These are NOT editable
  // in the editor (set at seed time), but the per-domain tier editor needs
  // to know their structure to render.
  const rawDomainsArr = Array.isArray(rawScoringObj.domains)
    ? (rawScoringObj.domains as RawDomain[])
    : [];
  const domainsMeta: DomainMeta[] = rawDomainsArr.map((d) => ({
    key: typeof d.key === "string" ? d.key : "",
    label: typeof d.label === "string" ? d.label : "",
  }));
  const domainTiers: DomainTiersDraft = {};
  for (const d of rawDomainsArr) {
    const key = typeof d.key === "string" ? d.key : "";
    if (!key) continue;
    const dTiers = Array.isArray(d.tiers) ? (d.tiers as RawTier[]) : [];
    domainTiers[key] = dTiers.map((raw) => ({
      uid: genUid(),
      minMetric: typeof raw.minMetric === "number" ? raw.minMetric : 0,
      maxMetric: typeof raw.maxMetric === "number" ? String(raw.maxMetric) : "",
      label: typeof raw.label === "string" ? raw.label : "",
      message: typeof raw.message === "string" ? raw.message : "",
    }));
    if (domainTiers[key].length === 0) {
      domainTiers[key].push({
        uid: genUid(),
        minMetric: 0,
        maxMetric: "",
        label: "",
        message: "",
      });
    }
  }

  const rollupOverallRaw = rawScoringObj.rollup?.overall;
  const rollupOverall: RollupOverall | null =
    rollupOverallRaw === "meanOfQuestions" ||
    rollupOverallRaw === "meanOfSections" ||
    rollupOverallRaw === "meanOfDomains"
      ? rollupOverallRaw
      : null;
  const scaleUpScoreEnabled = rawScoringObj.scaleUpScore === true;

  const reportConfigJson =
    version.reportConfig === null || version.reportConfig === undefined
      ? ""
      : JSON.stringify(version.reportConfig, null, 2);

  return {
    sections,
    questions,
    tierMetric,
    passThreshold,
    tiers,
    reportConfigJson,
    rawSections: rawSectionsArr,
    rawQuestions: rawQuestionsArr,
    rawScoringConfig: rawScoringRecord,
    rawReportConfig: version.reportConfig ?? null,
    domainsMeta,
    rollupOverall,
    scaleUpScoreEnabled,
    domainTiers,
  };
}

// E1.1 — metric mode for tier-tile validation. Per the plan:
//   Integer mode: legacy tierMetric === "countAchieved" OR "overallTotal"
//     AND no rollup.overall (Rockefeller / QSP integer-domain semantics).
//   Fractional mode: any rollup.overall is set OR tierMetric === "overallAvg"
//     OR (always) per-domain tier sets.
function getGlobalMetricMode(opts: {
  tierMetric: TierMetric;
  rollupOverall: RollupOverall | null;
}): "integer" | "fractional" {
  if (opts.rollupOverall !== null) return "fractional";
  if (opts.tierMetric === "overallAvg") return "fractional";
  return "integer";
}

interface TierTilingError {
  message: string;
}

function validateTierTilingClient(
  tiers: TierDraft[],
  mode: "integer" | "fractional",
  surfaceLabel: string,
): TierTilingError | null {
  if (tiers.length === 0) {
    return { message: `${surfaceLabel}: add at least one tier.` };
  }
  for (const t of tiers) {
    if (!t.label.trim() || !t.message.trim()) {
      return {
        message: `${surfaceLabel}: every tier needs a label and a message.`,
      };
    }
    const maxNum = t.maxMetric.trim() === "" ? undefined : Number(t.maxMetric);
    if (maxNum !== undefined && Number.isNaN(maxNum)) {
      return {
        message: `${surfaceLabel}: tier "${t.label}" has a non-numeric max.`,
      };
    }
    if (maxNum !== undefined && maxNum < t.minMetric) {
      return {
        message: `${surfaceLabel}: tier "${t.label}" max (${maxNum}) is less than min (${t.minMetric}).`,
      };
    }
  }
  // Tile-touching check.
  // Sort by minMetric; we deliberately KEEP the operator's authoring order
  // for the error message but compute adjacency on sorted order.
  const sorted = [...tiers]
    .map((t, idx) => ({
      idx,
      minMetric: t.minMetric,
      maxMetric:
        t.maxMetric.trim() === "" ? undefined : Number(t.maxMetric),
      label: t.label,
    }))
    .sort((a, b) => a.minMetric - b.minMetric);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.maxMetric === undefined) {
      return {
        message: `${surfaceLabel}: only the highest tier may omit max (open-ended).`,
      };
    }
    const expected = mode === "integer" ? a.maxMetric + 1 : a.maxMetric;
    if (b.minMetric !== expected) {
      if (mode === "integer") {
        return {
          message: `${surfaceLabel}: tier "${a.label}" ends at ${a.maxMetric}; tier "${b.label}" must start at ${expected} (no gap, no overlap).`,
        };
      }
      // Fractional
      return {
        message:
          b.minMetric > expected
            ? `${surfaceLabel}: gap between tier "${a.label}" (max ${a.maxMetric}) and tier "${b.label}" (min ${b.minMetric}) — tiers must touch (try setting "${b.label}" min to ${a.maxMetric}).`
            : `${surfaceLabel}: overlap between tier "${a.label}" (max ${a.maxMetric}) and tier "${b.label}" (min ${b.minMetric}) — tiers must touch (try setting "${b.label}" min to ${a.maxMetric}).`,
      };
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// Reusable tier-list editor. Used both by the global tier editor and by
// each per-domain card.
// ────────────────────────────────────────────────────────────────────────
function TierListEditor({
  title,
  description,
  tiers,
  onChange,
  disabled,
  testIdPrefix = "tier",
}: {
  title: string;
  description?: string;
  tiers: TierDraft[];
  onChange: (next: TierDraft[]) => void;
  disabled: boolean;
  testIdPrefix?: string;
}) {
  function addRow() {
    onChange([
      ...tiers,
      {
        uid: genUid(),
        minMetric: 0,
        maxMetric: "",
        label: "",
        message: "",
      },
    ]);
  }
  function moveRow(idx: number, dir: -1 | 1) {
    const next = [...tiers];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    onChange(next);
  }
  function removeRow(idx: number) {
    if (tiers.length === 1) return;
    onChange(tiers.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<TierDraft>) {
    onChange(
      tiers.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-border bg-card text-foreground hover:bg-muted"
            data-testid={`${testIdPrefix}-add`}
          >
            <Plus className="w-3.5 h-3.5" /> Tier
          </button>
        )}
      </div>
      {tiers.map((t, idx) => (
        <div
          key={t.uid}
          className="border border-border rounded-md p-3 space-y-2"
          data-testid={`${testIdPrefix}-row-${idx}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
            <NumInput
              label="min"
              value={t.minMetric}
              disabled={disabled}
              onChange={(v) => updateRow(idx, { minMetric: v })}
              className="sm:col-span-2"
              testId={`${testIdPrefix}-min-${idx}`}
            />
            <div className="sm:col-span-2">
              <label className="block text-[10px] text-muted-foreground mb-0.5">
                max (blank = unbounded)
              </label>
              <input
                type="text"
                value={t.maxMetric}
                onChange={(e) => updateRow(idx, { maxMetric: e.target.value })}
                disabled={disabled}
                data-testid={`${testIdPrefix}-max-${idx}`}
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
                onChange={(e) => updateRow(idx, { label: e.target.value })}
                disabled={disabled}
                data-testid={`${testIdPrefix}-label-${idx}`}
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
                onChange={(e) => updateRow(idx, { message: e.target.value })}
                disabled={disabled}
                data-testid={`${testIdPrefix}-message-${idx}`}
                className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
            </div>
            <div className="sm:col-span-1 flex items-end justify-end gap-1">
              {!disabled && (
                <>
                  <button
                    type="button"
                    onClick={() => moveRow(idx, -1)}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRow(idx, 1)}
                    disabled={idx === tiers.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={tiers.length === 1}
                    data-testid={`${testIdPrefix}-delete-${idx}`}
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
  );
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

  const [sections, setSectionsState] = useState<SectionDraft[]>([]);
  const [questions, setQuestionsState] = useState<QuestionDraft[]>([]);
  const [tierMetric, setTierMetric] = useState<TierMetric>("countAchieved");
  const [passThreshold, setPassThreshold] = useState<number>(0);
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [reportConfigJson, setReportConfigJsonState] = useState("");

  // E1.1 — Raw server JSON refs. Used by buildPayload to pass through
  // unedited surfaces opaquely, preserving every unknown / unedited field.
  const [rawSections, setRawSections] = useState<unknown[]>([]);
  const [rawQuestions, setRawQuestions] = useState<unknown[]>([]);
  const [rawScoringConfig, setRawScoringConfig] = useState<
    Record<string, unknown>
  >({});
  const [rawReportConfig, setRawReportConfig] = useState<unknown>(null);

  // E1.1 — Dirty tracking. Each editable surface defaults to false; any
  // UI mutation flips its flag, and buildPayload uses raw pass-through
  // for non-dirty surfaces.
  const [sectionsDirty, setSectionsDirty] = useState(false);
  const [questionsDirty, setQuestionsDirty] = useState(false);
  const [reportConfigDirty, setReportConfigDirty] = useState(false);

  // E1.1 — D2 metadata (read-only) + per-domain tier drafts.
  const [domainsMeta, setDomainsMeta] = useState<DomainMeta[]>([]);
  const [rollupOverall, setRollupOverall] = useState<RollupOverall | null>(
    null,
  );
  const [scaleUpScoreEnabled, setScaleUpScoreEnabled] = useState(false);
  const [domainTiers, setDomainTiers] = useState<DomainTiersDraft>({});

  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Wrapped setters that also flip dirty flags. Used by all UI inputs so
  // structural and field-level edits both trigger the overlay path in
  // buildPayload.
  const setSections = useCallback(
    (next: SectionDraft[] | ((cur: SectionDraft[]) => SectionDraft[])) => {
      setSectionsDirty(true);
      setSectionsState(next);
    },
    [],
  );
  const setQuestions = useCallback(
    (
      next: QuestionDraft[] | ((cur: QuestionDraft[]) => QuestionDraft[]),
    ) => {
      setQuestionsDirty(true);
      setQuestionsState(next);
    },
    [],
  );
  const setReportConfigJson = useCallback((next: string) => {
    setReportConfigDirty(true);
    setReportConfigJsonState(next);
  }, []);

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
      // hydrated state — use the underlying state setters to avoid
      // flipping dirty flags on initial load.
      setSectionsState(hydrated.sections);
      setQuestionsState(hydrated.questions);
      setTierMetric(hydrated.tierMetric);
      setPassThreshold(hydrated.passThreshold);
      setTiers(hydrated.tiers);
      setReportConfigJsonState(hydrated.reportConfigJson);
      setRawSections(hydrated.rawSections);
      setRawQuestions(hydrated.rawQuestions);
      setRawScoringConfig(hydrated.rawScoringConfig);
      setRawReportConfig(hydrated.rawReportConfig);
      setDomainsMeta(hydrated.domainsMeta);
      setRollupOverall(hydrated.rollupOverall);
      setScaleUpScoreEnabled(hydrated.scaleUpScoreEnabled);
      setDomainTiers(hydrated.domainTiers);
      // Reset dirty flags after hydration completes.
      setSectionsDirty(false);
      setQuestionsDirty(false);
      setReportConfigDirty(false);
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
  const showD2Panel = rollupOverall !== null || scaleUpScoreEnabled;

  const sectionStableKeyByUid = useMemo(() => {
    const out: Record<string, string> = {};
    sections.forEach((s) => {
      out[s.uid] = s.stableKey;
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
  function buildPayload(): {
    questions: unknown[];
    sections: unknown[];
    scoringConfig: unknown;
    reportConfig: unknown;
  } | null {
    // Basic UI-editable shape checks.
    if (sectionsDirty) {
      if (sections.some((s) => !s.name.trim())) {
        setValidationError("Every section needs a name.");
        return null;
      }
    }
    if (questions.length === 0) {
      setValidationError("Add at least one question.");
      return null;
    }
    if (questionsDirty) {
      if (questions.some((q) => !q.label.trim() || !q.sectionUid)) {
        setValidationError("Every question needs a label and a section.");
        return null;
      }
      if (
        questions.some((q) => q.scaleMax <= q.scaleMin || q.scaleStep <= 0)
      ) {
        setValidationError("Question scale: max > min and step > 0 required.");
        return null;
      }
    }

    // E1.1 — Validate the global tier editor (always; this catches the
    // case where the operator only edits tiers + nothing else).
    const globalMode = getGlobalMetricMode({ tierMetric, rollupOverall });
    const globalErr = validateTierTilingClient(
      tiers,
      globalMode,
      "Global tiers",
    );
    if (globalErr) {
      setValidationError(globalErr.message);
      return null;
    }

    // E1.1 — Validate every per-domain tier set (always fractional mode).
    for (const meta of domainsMeta) {
      const dt = domainTiers[meta.key] ?? [];
      const err = validateTierTilingClient(
        dt,
        "fractional",
        `Domain "${meta.label}" tiers`,
      );
      if (err) {
        setValidationError(err.message);
        return null;
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // E1.1 — Raw pass-through OR overlay-from-draft per surface.
    //
    // Sections / questions / reportConfig: opaque raw pass-through when
    // not dirty; overlay-from-draft when dirty. Per Codex round-3 #1:
    // treat all non-tier JSON as opaque unless the operator actually
    // edited it.
    //
    // ScoringConfig: ALWAYS surgically rebuilt (tier editing is E1's
    // whole point). Tier rows + domain rows are themselves spread to
    // preserve unknown row-level fields (Codex round-4).
    // ──────────────────────────────────────────────────────────────────

    // Look raw rows up by stableKey, not by index. After reorder / move /
    // add / delete, positional alignment between raw[] and drafts[] is
    // broken — pairing the wrong raw with a draft would corrupt unknown
    // fields (e.g. SU Full's question.recommendations would get rebound
    // to a different question).
    const rawSectionByStableKey = new Map<string, Record<string, unknown>>();
    for (const r of rawSections) {
      const row = r as Record<string, unknown>;
      if (typeof row.stableKey === "string")
        rawSectionByStableKey.set(row.stableKey, row);
    }
    const rawQuestionByStableKey = new Map<string, Record<string, unknown>>();
    for (const r of rawQuestions) {
      const row = r as Record<string, unknown>;
      if (typeof row.stableKey === "string")
        rawQuestionByStableKey.set(row.stableKey, row);
    }

    let questionsOut: unknown[];
    if (questionsDirty) {
      questionsOut = questions.map((q, idx) => {
        const raw = rawQuestionByStableKey.get(q.stableKey) ?? {};
        const sectionStableKey = sectionStableKeyByUid[q.sectionUid];
        return {
          ...raw,
          stableKey: q.stableKey,
          sortOrder: idx + 1,
          type: typeof raw.type === "string" ? raw.type : "SLIDER_LIKERT",
          label: q.label.trim(),
          ...(q.helpText.trim() ? { helpText: q.helpText.trim() } : {}),
          sectionStableKey,
          isRequired: q.isRequired,
          scale: {
            ...((raw.scale && typeof raw.scale === "object"
              ? raw.scale
              : {}) as Record<string, unknown>),
            min: q.scaleMin,
            max: q.scaleMax,
            step: q.scaleStep,
            anchorMin: q.anchorMin,
            anchorMax: q.anchorMax,
          },
        };
      });
    } else {
      questionsOut = rawQuestions;
    }

    let sectionsOut: unknown[];
    if (sectionsDirty) {
      sectionsOut = sections.map((s, i) => {
        const raw = rawSectionByStableKey.get(s.stableKey) ?? {};
        return {
          ...raw,
          stableKey: s.stableKey,
          sortOrder: i + 1,
          name: s.name.trim(),
          ...(s.description.trim()
            ? { description: s.description.trim() }
            : {}),
          ...(s.partLabel.trim() ? { partLabel: s.partLabel.trim() } : {}),
        };
      });
    } else {
      sectionsOut = rawSections;
    }

    // Global tier rows — spread raw row to preserve unknown fields.
    const rawGlobalTiers = (rawScoringConfig.tiers as
      | Array<Record<string, unknown>>
      | undefined) ?? [];
    const tiersOut = tiers.map((t, idx) => {
      const rawRow = rawGlobalTiers[idx] ?? {};
      const maxNum = t.maxMetric.trim() === "" ? undefined : Number(t.maxMetric);
      const minMetric = Number(t.minMetric);
      const base: Record<string, unknown> = {
        ...rawRow,
        minMetric,
        label: t.label.trim(),
        message: t.message.trim(),
      };
      if (maxNum !== undefined && !Number.isNaN(maxNum)) {
        base.maxMetric = maxNum;
      } else {
        // Operator cleared the max field → top tier open-ended; remove
        // any pre-existing maxMetric from the raw row.
        delete base.maxMetric;
      }
      return base;
    });

    // Domains — spread raw domain + overlay tiers per key.
    const rawDomains = (rawScoringConfig.domains as
      | Array<Record<string, unknown>>
      | undefined) ?? [];
    let updatedDomains: Array<Record<string, unknown>> | undefined;
    if (rawDomains.length > 0) {
      updatedDomains = rawDomains.map((rawDomain) => {
        const key =
          typeof rawDomain.key === "string" ? (rawDomain.key as string) : "";
        const rawDomainTiers = (rawDomain.tiers as
          | Array<Record<string, unknown>>
          | undefined) ?? [];
        const dts = domainTiers[key] ?? [];
        const editedTiers = dts.map((draftTier, idx) => {
          const rawRow = rawDomainTiers[idx] ?? {};
          const maxNum =
            draftTier.maxMetric.trim() === ""
              ? undefined
              : Number(draftTier.maxMetric);
          const out: Record<string, unknown> = {
            ...rawRow,
            minMetric: Number(draftTier.minMetric),
            label: draftTier.label.trim(),
            message: draftTier.message.trim(),
          };
          if (maxNum !== undefined && !Number.isNaN(maxNum)) {
            out.maxMetric = maxNum;
          } else {
            delete out.maxMetric;
          }
          return out;
        });
        return {
          ...rawDomain,
          tiers: editedTiers,
        };
      });
    }

    const scoringConfigOut: Record<string, unknown> = {
      ...rawScoringConfig,
      tierMetric,
      passThreshold: Number(passThreshold),
      tiers: tiersOut,
    };
    if (updatedDomains) {
      scoringConfigOut.domains = updatedDomains;
    }

    // Report config — opaque pass-through unless edited.
    let reportConfigOut: unknown;
    if (reportConfigDirty) {
      if (reportConfigJson.trim()) {
        try {
          reportConfigOut = JSON.parse(reportConfigJson);
        } catch (e) {
          setValidationError(
            `reportConfig: invalid JSON — ${
              e instanceof Error ? e.message : "parse error"
            }`,
          );
          return null;
        }
      } else {
        reportConfigOut = null;
      }
    } else {
      reportConfigOut = rawReportConfig;
    }

    setValidationError(null);
    return {
      questions: questionsOut,
      sections: sectionsOut,
      scoringConfig: scoringConfigOut,
      reportConfig: reportConfigOut,
    };
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
      router.push(`/admin/assessments/templates/${templateId}`);
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
          href={`/admin/assessments/templates/${templateId}`}
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
        href={`/admin/assessments/templates/${templateId}`}
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
                    stableKey: `S_NEW_${genUid()}`,
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
                    stableKey: `Q_NEW_${genUid()}`,
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

        {/* E1.1 — Read-only D2 context panel. Renders ONLY when rollup
            or scaleUpScore is present on the raw scoringConfig. Legacy
            templates render nothing here. */}
        {showD2Panel && (
          <div
            className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1"
            data-testid="d2-context-panel"
          >
            {rollupOverall && (
              <div>
                <span className="text-muted-foreground">Overall rollup:</span>{" "}
                <span className="font-medium">
                  {rollupLabel(rollupOverall)}
                </span>
              </div>
            )}
            {scaleUpScoreEnabled && (
              <div>
                <span className="text-muted-foreground">
                  ScaleUp Score (0-100):
                </span>{" "}
                <span className="font-medium">enabled</span>
              </div>
            )}
          </div>
        )}

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

        {/* E1.1 — Global tier editor uses the shared TierListEditor. */}
        <div className="pt-2">
          <TierListEditor
            title="Global tiers"
            description={
              rollupOverall
                ? `Resolved against the overall canonical metric (${rollupLabel(rollupOverall).toLowerCase()}).`
                : "Resolved against the configured tier metric."
            }
            tiers={tiers}
            onChange={setTiers}
            disabled={isPublished}
            testIdPrefix="tier"
          />
        </div>
      </div>

      {/* E1.1 — Per-domain tier editor stack. Renders one Card per domain
          when scoringConfig.domains[] is set on the raw config. Vertical
          stack, default open, no collapse. */}
      {domainsMeta.length > 0 && (
        <div className="space-y-4" data-testid="per-domain-cards">
          {domainsMeta.map((domain) => (
            <div
              key={domain.key}
              className="bg-card border border-border rounded-xl p-6 space-y-3"
              data-testid={`domain-card-${domain.key}`}
            >
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {domain.label}
                </h2>
                <span className="text-xs font-normal text-muted-foreground">
                  ({domain.key})
                </span>
              </div>
              <TierListEditor
                title={`${domain.label} tiers`}
                description={`Resolved against the average score across ${domain.label} sections.`}
                tiers={domainTiers[domain.key] ?? []}
                onChange={(next) =>
                  setDomainTiers((cur) => ({ ...cur, [domain.key]: next }))
                }
                disabled={isPublished}
                testIdPrefix={`domain-${domain.key}-tier`}
              />
            </div>
          ))}
        </div>
      )}

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
        <div
          className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-2 rounded-md"
          data-testid="validation-error"
          role="alert"
        >
          {validationError}
        </div>
      )}

      {!isPublished && (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(`/admin/assessments/templates/${templateId}`)
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
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
  disabled?: boolean;
  testId?: string;
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
        data-testid={testId}
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
