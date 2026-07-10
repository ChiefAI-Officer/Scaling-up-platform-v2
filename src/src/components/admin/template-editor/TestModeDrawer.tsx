"use client";

/**
 * Wave ED1 Test Mode drawer (spec 19ac). While editing a DRAFT, an admin fills
 * sample answers and immediately sees the computed result — per-section/domain
 * scores, the tier (when the instrument shows one), and which findings fire.
 * Writes NOTHING: it assembles the live draft via the SHARED
 * buildVersionScoringPayload (same as Save Draft) and scores via the SHARED
 * computeScoreResult (same as the submit routes) — no second code path. All
 * pure/client-side. Close discards everything.
 */
import * as React from "react";
import { QuestionInput } from "@/components/assessments/question-input";
import {
  buildVersionScoringPayload,
} from "@/components/admin/template-editor/build-version-payload";
import {
  buildTestModeDisplay,
  type TestModeDisplay,
} from "@/components/admin/template-editor/test-mode-display";
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import { filterVisibleSurveyQuestions } from "@/lib/assessments/form-visibility";
import {
  TemplateVersionForScoringSchema,
  ScoringValidationError,
  type Answer,
} from "@/lib/assessments/scoring";
import { QuestionSerializationError } from "@/components/admin/template-editor/question-serialization";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { PagerQuestion } from "@/lib/assessments/section-pages";

export interface TestModeDrawerProps {
  open: boolean;
  onClose: () => void;
  templateAlias: string | null;
  questions: QuestionDraftRow[];
  sections: SectionDraft[];
  rawQuestions: unknown[];
  rawSections: unknown[];
  scoringConfig: unknown;
  publishedKeys: ReadonlySet<string>;
  publishedOptionKeys: Readonly<Record<string, readonly string[]>>;
  dirty: { questions: boolean; sections: boolean };
}

type Answers = Record<string, number | string | string[]>;
const MIN_TO_SCORE = 1;

type Parsed =
  | { kind: "ok"; version: ReturnType<typeof TemplateVersionForScoringSchema.parse> }
  | { kind: "config-error"; messages: string[] };

export function TestModeDrawer(props: TestModeDrawerProps) {
  const [answers, setAnswers] = React.useState<Answers>({});

  // Assemble the live draft + parse. Config errors (serialization or scoring
  // schema) surface here. Depends only on structural inputs — stable while the
  // admin fills answers, so this doesn't re-run per keystroke.
  const parsed: Parsed = React.useMemo(() => {
    try {
      const built = buildVersionScoringPayload({
        questions: props.questions,
        sections: props.sections,
        rawQuestions: props.rawQuestions,
        rawSections: props.rawSections,
        scoringConfig: props.scoringConfig,
        publishedKeys: props.publishedKeys,
        publishedOptionKeys: props.publishedOptionKeys,
        dirty: props.dirty,
      });
      const res = TemplateVersionForScoringSchema.safeParse(built);
      if (!res.success) {
        return { kind: "config-error", messages: dedupe(res.error.issues.map((i) => i.message)) };
      }
      return { kind: "ok", version: res.data };
    } catch (e) {
      if (e instanceof QuestionSerializationError) return { kind: "config-error", messages: [e.message] };
      throw e;
    }
  }, [
    props.questions,
    props.sections,
    props.rawQuestions,
    props.rawSections,
    props.scoringConfig,
    props.publishedKeys,
    props.publishedOptionKeys,
    props.dirty,
  ]);

  const answerList: Answer[] = Object.entries(answers).map(([stableKey, value]) => ({ stableKey, value }));

  const visible: PagerQuestion[] =
    parsed.kind === "ok"
      ? filterVisibleSurveyQuestions({
          templateAlias: props.templateAlias ?? "",
          questions: parsed.version.questions as unknown as PagerQuestion[],
          answers,
        })
      : [];

  const scored = scoreDraft(parsed, answerList, props.templateAlias);

  if (!props.open) return null;

  return (
    <aside
      role="dialog"
      aria-label="Test Mode"
      className="fixed inset-y-0 right-0 z-50 w-[min(720px,100vw)] overflow-y-auto border-l bg-background p-6 shadow-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Test Mode</h2>
        <button type="button" onClick={props.onClose} className="text-sm underline">
          Close
        </button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Sample answers — nothing is saved. See the scores, tier, and recommendations a respondent would get.
      </p>

      {parsed.kind === "config-error" ? (
        <ConfigError messages={parsed.messages} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            {visible.map((q) => (
              <div key={q.stableKey} className="space-y-2">
                <label htmlFor={`q-${q.stableKey}`} className="block text-sm font-medium">
                  {q.label}
                  {q.isRequired && <span className="text-destructive"> *</span>}
                </label>
                {q.helpText && <p className="text-xs text-muted-foreground">{q.helpText}</p>}
                <QuestionInput
                  question={q}
                  value={answers[q.stableKey]}
                  onChange={(stableKey, value) =>
                    setAnswers((prev) => ({ ...prev, [stableKey]: value }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="rounded-lg border p-4">
            {scored.kind === "empty" && (
              <p className="text-sm text-muted-foreground">Answer some questions to see results.</p>
            )}
            {scored.kind === "config-error" && <ConfigError messages={scored.messages} />}
            {scored.kind === "result" && <ResultPanel display={scored.display} />}
          </div>
        </div>
      )}
    </aside>
  );
}

type Scored =
  | { kind: "empty" }
  | { kind: "config-error"; messages: string[] }
  | { kind: "result"; display: TestModeDisplay };

function scoreDraft(parsed: Parsed, answerList: Answer[], templateAlias: string | null): Scored {
  if (parsed.kind !== "ok") return { kind: "config-error", messages: parsed.messages };
  // Empty / too-few answers is the NORMAL state — don't call the scorer
  // (scoreSubmission throws EMPTY_ANSWERS on zero answers). Spec 19ac C3.
  if (answerList.length < MIN_TO_SCORE) return { kind: "empty" };
  try {
    const { result } = computeScoreResult(
      parsed.version,
      parsed.version.questions as unknown as PagerQuestion[],
      answerList,
      { allowMissingRequired: true },
    );
    return { kind: "result", display: buildTestModeDisplay(result, templateAlias) };
  } catch (e) {
    if (e instanceof ScoringValidationError) {
      if (e.code === "EMPTY_ANSWERS") return { kind: "empty" };
      if (e.code === "INVALID_SCORING_CONFIG") return { kind: "config-error", messages: [e.message] };
    }
    // Answer-shape codes (UNKNOWN_STABLE_KEY / OUT_OF_RANGE / duplicate) are
    // unreachable via the constrained QuestionInput → a real bug; let it throw.
    throw e;
  }
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

function ConfigError({ messages }: { messages: string[] }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-medium text-destructive">Can&apos;t test yet — fix these:</p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

function ResultPanel({ display }: { display: TestModeDisplay }) {
  const r = display.result;
  return (
    <div className="space-y-3 text-sm">
      {display.showTier && r.tier && (
        <p>
          <span className="font-medium">Tier:</span> {r.tier.label}
        </p>
      )}
      {typeof r.scaleUpScore === "number" && (
        <p>
          <span className="font-medium">ScaleUp Score:</span> {r.scaleUpScore}
        </p>
      )}
      {display.showScoreTable && r.perDomain && r.perDomain.length > 0 && (
        <div>
          <p className="font-medium">Domains</p>
          <ul className="list-disc pl-5">
            {r.perDomain.map((d) => (
              <li key={d.key}>
                {d.label}: {d.averagePoints ?? "—"}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="font-medium">Sections</p>
        <ul className="list-disc pl-5">
          {r.perSection.map((s) => (
            <li key={s.stableKey}>
              {s.name}: {s.averagePoints}
            </li>
          ))}
        </ul>
      </div>
      {display.findings.length > 0 && (
        <div>
          <p className="font-medium">Recommendations that fire ({display.findings.length})</p>
          <ul className="list-disc pl-5">
            {display.findings.map((f) => (
              <li key={f.stableKey}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}
      {display.unansweredCount > 0 && (
        <p className="text-muted-foreground">
          Computed over answered questions only — {display.unansweredCount} unanswered.
        </p>
      )}
    </div>
  );
}
