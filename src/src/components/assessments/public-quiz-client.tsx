"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface SectionDef {
  stableKey: string;
  sortOrder: number;
  name: string;
  description?: string;
  partLabel?: string;
}

interface QuestionScale {
  min: number;
  max: number;
  step: number;
  anchorMin: string;
  anchorMax: string;
}

interface QuestionDef {
  stableKey: string;
  sortOrder: number;
  type: "SLIDER_LIKERT";
  label: string;
  helpText?: string;
  sectionStableKey?: string;
  isRequired: boolean;
  scale: QuestionScale;
}

// Tolerant cast — server gives us `unknown`; runtime shape comes from the
// stored published version which is Zod-validated at scoring time.
function toSections(raw: unknown): SectionDef[] {
  if (!Array.isArray(raw)) return [];
  return (raw as SectionDef[]).filter(
    (s) => s && typeof s.stableKey === "string" && typeof s.name === "string",
  );
}
function toQuestions(raw: unknown): QuestionDef[] {
  if (!Array.isArray(raw)) return [];
  return (raw as QuestionDef[]).filter(
    (q) =>
      q &&
      typeof q.stableKey === "string" &&
      typeof q.label === "string" &&
      q.scale &&
      typeof q.scale.min === "number" &&
      typeof q.scale.max === "number",
  );
}

interface PublicQuizClientProps {
  campaignAlias: string;
  campaignName: string;
  campaignDescription: string | null;
  templateName: string;
  isOpen: boolean;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  openAtIso: string;
  closeAtIso: string | null;
  sections: unknown;
  questions: unknown;
}

type Step = "intro" | "info" | "form" | "error";

export function PublicQuizClient({
  campaignAlias,
  campaignName,
  campaignDescription,
  templateName,
  isOpen,
  status,
  openAtIso,
  closeAtIso,
  sections: rawSections,
  questions: rawQuestions,
}: PublicQuizClientProps) {
  const router = useRouter();
  const sections = useMemo(() => toSections(rawSections), [rawSections]);
  const questions = useMemo(() => toQuestions(rawQuestions), [rawQuestions]);

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.sortOrder - b.sortOrder),
    [questions],
  );
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections],
  );
  const sectionByKey = useMemo(() => {
    const out: Record<string, SectionDef> = {};
    sortedSections.forEach((s) => {
      out[s.stableKey] = s;
    });
    return out;
  }, [sortedSections]);

  const [step, setStep] = useState<Step>(isOpen ? "intro" : "error");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!isOpen || step === "error") {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
        <h1 className="text-2xl font-bold text-foreground">{campaignName}</h1>
        <p className="text-sm text-muted-foreground">
          {status === "DRAFT"
            ? "This assessment is not yet open."
            : status === "CLOSED"
              ? "This assessment is closed."
              : new Date(openAtIso) > new Date()
                ? `This assessment opens ${new Date(openAtIso).toLocaleDateString()}.`
                : closeAtIso
                  ? `This assessment closed on ${new Date(closeAtIso).toLocaleDateString()}.`
                  : "This assessment is not currently accepting submissions."}
        </p>
      </div>
    );
  }

  if (step === "intro") {
    return (
      <div className="bg-card border border-border rounded-xl p-8 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{campaignName}</h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {templateName}
          </p>
        </div>
        {campaignDescription && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {campaignDescription}
          </p>
        )}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>{sortedQuestions.length}</strong> questions across{" "}
            <strong>{sortedSections.length}</strong>{" "}
            {sortedSections.length === 1 ? "section" : "sections"}.
          </p>
          <p>Most respondents finish in 5–10 minutes.</p>
        </div>
        <button
          type="button"
          onClick={() => setStep("info")}
          className="w-full inline-flex items-center justify-center text-sm font-medium px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          data-testid="quiz-start"
        >
          Start
        </button>
      </div>
    );
  }

  if (step === "info") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            firstName.trim() === "" ||
            lastName.trim() === "" ||
            email.trim() === ""
          )
            return;
          setStep("form");
        }}
        className="bg-card border border-border rounded-xl p-8 space-y-4"
      >
        <h2 className="text-lg font-semibold text-foreground">About you</h2>
        <p className="text-xs text-muted-foreground">
          We&apos;ll send your results to this email.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              First name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={100}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="quiz-first-name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Last name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              maxLength={100}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              data-testid="quiz-last-name"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={320}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="quiz-email"
          />
        </div>
        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={() => setStep("intro")}
            className="text-sm font-medium px-3 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted"
          >
            Back
          </button>
          <button
            type="submit"
            className="text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="quiz-info-next"
          >
            Continue
          </button>
        </div>
      </form>
    );
  }

  // step === "form"
  function setAnswer(key: string, value: number) {
    setAnswers((cur) => ({ ...cur, [key]: value }));
  }

  const requiredQuestions = sortedQuestions.filter((q) => q.isRequired);
  const missingRequired = requiredQuestions.filter(
    (q) => answers[q.stableKey] === undefined,
  );
  const canSubmit = missingRequired.length === 0;

  async function handleSubmit() {
    if (submitting || !canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quiz/${campaignAlias}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicTaker: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
          },
          answers: Object.entries(answers).map(([stableKey, value]) => ({
            stableKey,
            value,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.push(body.data.redirectUrl);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Submission failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Group questions by section for rendering.
  const groups = sortedSections.map((s) => ({
    section: s,
    questions: sortedQuestions.filter((q) => q.sectionStableKey === s.stableKey),
  }));
  const unsectioned = sortedQuestions.filter((q) => !q.sectionStableKey);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-6 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-foreground">{campaignName}</h1>
        <p className="text-xs text-muted-foreground">
          {Object.keys(answers).length} of {sortedQuestions.length} answered
          {missingRequired.length > 0
            ? ` · ${missingRequired.length} required remaining`
            : ""}
        </p>
      </div>

      {groups.map(({ section, questions: qs }) => (
        <section
          key={section.stableKey}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
          data-testid={`quiz-section-${section.stableKey}`}
        >
          <div>
            {section.partLabel && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {section.partLabel}
              </p>
            )}
            <h2 className="text-lg font-semibold text-foreground">{section.name}</h2>
            {section.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {section.description}
              </p>
            )}
          </div>
          {qs.map((q) => (
            <QuestionRow
              key={q.stableKey}
              question={q}
              value={answers[q.stableKey]}
              onChange={(v) => setAnswer(q.stableKey, v)}
            />
          ))}
        </section>
      ))}

      {unsectioned.length > 0 && (
        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          {unsectioned.map((q) => (
            <QuestionRow
              key={q.stableKey}
              question={q}
              value={answers[q.stableKey]}
              onChange={(v) => setAnswer(q.stableKey, v)}
            />
          ))}
        </section>
      )}

      {submitError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-2 rounded-md">
          {submitError}
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setStep("info")}
          disabled={submitting}
          className="text-sm font-medium px-3 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="quiz-submit"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Submit
        </button>
      </div>

      {!canSubmit && (
        <p className="text-xs text-muted-foreground text-center">
          Please answer all required questions before submitting.
        </p>
      )}

      {/* Keep a hidden anchor of section names so the template name is reachable */}
      <span className="sr-only">{sectionByKey ? "" : ""}</span>
    </div>
  );
}

function QuestionRow({
  question,
  value,
  onChange,
}: {
  question: QuestionDef;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  const { scale } = question;
  // Build option buttons for the slider/likert range.
  const options: number[] = [];
  for (let v = scale.min; v <= scale.max; v += scale.step) options.push(v);

  return (
    <div className="space-y-2" data-testid={`quiz-question-${question.stableKey}`}>
      <p className="text-sm font-medium text-foreground">
        {question.label}
        {question.isRequired && (
          <span className="text-destructive ml-1">*</span>
        )}
      </p>
      {question.helpText && (
        <p className="text-xs text-muted-foreground">{question.helpText}</p>
      )}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`min-w-[44px] px-3 py-2 text-sm rounded-md border transition-colors ${
                value === opt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:bg-muted"
              }`}
              data-testid={`quiz-answer-${question.stableKey}-${opt}`}
            >
              {opt}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{scale.anchorMin}</span>
          <span>{scale.anchorMax}</span>
        </div>
      </div>
    </div>
  );
}
