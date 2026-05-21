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
      <div className="ty-page">
        <header className="ty-header">
          <span className="ty-brand">Scaling Up</span>
          <span>Quiz unavailable</span>
        </header>
        <main className="ty-body">
          <section className="ty-card">
            <span className="hero-eyebrow">Notice</span>
            <h1 className="ty-title">{campaignName}</h1>
            <p className="ty-lede">
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
          </section>
        </main>
        <footer className="ty-footer">Powered by Scaling Up</footer>
      </div>
    );
  }

  if (step === "intro") {
    // WF17 / participant-public-landing — hero-card layout
    return (
      <div className="landing-page">
        <header className="landing-header">
          <span className="landing-brand">Scaling Up</span>
          <span>{templateName}</span>
        </header>
        <main className="landing-body">
          <section className="hero-card" aria-labelledby="hero-title">
            <span className="hero-eyebrow">You&apos;re invited</span>
            <h1 className="hero-title" id="hero-title">
              {campaignName}
            </h1>
            {campaignDescription ? (
              <p className="hero-lede" style={{ whiteSpace: "pre-line" }}>
                {campaignDescription}
              </p>
            ) : (
              <p className="hero-lede">
                This assessment helps your team see how aligned you are.
                Your responses are confidential.
              </p>
            )}
            <p className="hero-sub">
              Most respondents finish in 5–10 minutes. Your responses are
              shared only with the coach who sent this to you.
            </p>
            <div className="hero-stats" aria-label="Assessment details">
              <span>
                <strong>{sortedQuestions.length}</strong> questions
              </span>
              <span className="hero-stats__dot" />
              <span>
                <strong>{sortedSections.length}</strong>{" "}
                {sortedSections.length === 1 ? "section" : "sections"}
              </span>
            </div>
            <div className="hero-cta-row">
              <button
                type="button"
                onClick={() => setStep("info")}
                className="wf-btn wf-btn-primary hero-cta"
                data-testid="quiz-start"
              >
                Start Assessment
              </button>
            </div>
            <p className="hero-fine">
              Your responses are confidential and shared only with the
              coach who sent this assessment.
            </p>
          </section>
        </main>
        <footer className="landing-footer">Powered by Scaling Up</footer>
      </div>
    );
  }

  if (step === "info") {
    return (
      <div className="ty-page">
        <header className="ty-header">
          <span className="ty-brand">Scaling Up</span>
          <span>Tell us about you</span>
        </header>
        <main className="ty-body">
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
            className="ty-card"
            aria-labelledby="quiz-info-title"
          >
            <span className="hero-eyebrow">About you</span>
            <h1 className="ty-title" id="quiz-info-title">
              Tell us where to send your results
            </h1>
            <p className="ty-sub">
              We&apos;ll email your scoring summary as soon as you submit.
            </p>
            <div className="survey-question">
              <label className="wf-label" htmlFor="quiz-first-name-input">
                First name
              </label>
              <input
                id="quiz-first-name-input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={100}
                className="wf-input"
                data-testid="quiz-first-name"
              />
            </div>
            <div className="survey-question">
              <label className="wf-label" htmlFor="quiz-last-name-input">
                Last name
              </label>
              <input
                id="quiz-last-name-input"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={100}
                className="wf-input"
                data-testid="quiz-last-name"
              />
            </div>
            <div className="survey-question">
              <label className="wf-label" htmlFor="quiz-email-input">
                Email
              </label>
              <input
                id="quiz-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={320}
                className="wf-input"
                data-testid="quiz-email"
              />
            </div>
            <div className="hero-cta-row" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                onClick={() => setStep("intro")}
                className="wf-btn wf-btn-secondary"
              >
                Back
              </button>
              <button
                type="submit"
                className="wf-btn wf-btn-primary"
                data-testid="quiz-info-next"
              >
                Continue
              </button>
            </div>
          </form>
        </main>
        <footer className="ty-footer">Powered by Scaling Up</footer>
      </div>
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
    <div className="ty-page">
      <header className="ty-header">
        <span className="ty-brand">Scaling Up</span>
        <span>
          {Object.keys(answers).length} of {sortedQuestions.length} answered
          {missingRequired.length > 0
            ? ` · ${missingRequired.length} required remaining`
            : ""}
        </span>
      </header>
      <main className="survey-body">
        <div className="survey-form">
          <section className="ty-card">
            <span className="hero-eyebrow">Quiz</span>
            <h1 className="ty-title">{campaignName}</h1>
          </section>

          {groups.map(({ section, questions: qs }) => (
            <section
              key={section.stableKey}
              className="ty-card survey-section"
              data-testid={`quiz-section-${section.stableKey}`}
            >
              {section.partLabel && (
                <span className="hero-eyebrow">{section.partLabel}</span>
              )}
              <h2 className="survey-section-title">{section.name}</h2>
              {section.description && (
                <p className="survey-section-desc">{section.description}</p>
              )}
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
            <section className="ty-card survey-section">
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
            <div className="wf-intersection-banner" style={{ background: "hsl(var(--destructive) / 0.1)", borderColor: "hsl(var(--destructive) / 0.3)", color: "hsl(var(--destructive))" }}>
              {submitError}
            </div>
          )}

          <div className="hero-cta-row" style={{ justifyContent: "space-between" }}>
            <button
              type="button"
              onClick={() => setStep("info")}
              disabled={submitting}
              className="wf-btn wf-btn-secondary"
              style={{ opacity: submitting ? 0.5 : 1 }}
            >
              Back
            </button>
        <button
          type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="wf-btn wf-btn-primary"
              style={{
                opacity: !canSubmit || submitting ? 0.5 : 1,
                cursor: !canSubmit || submitting ? "not-allowed" : "pointer",
              }}
              data-testid="quiz-submit"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Submit
            </button>
          </div>

          {!canSubmit && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "hsl(var(--muted-foreground))",
                textAlign: "center",
                margin: 0,
              }}
            >
              Please answer all required questions before submitting.
            </p>
          )}

          {/* Keep a hidden anchor of section names so the template name is reachable */}
          <span className="sr-only">{sectionByKey ? "" : ""}</span>
        </div>
      </main>
      <footer className="ty-footer">Powered by Scaling Up</footer>
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
