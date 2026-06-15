// src/src/components/assessments/section-pager.tsx
"use client";
import React from "react";
import { isAnswered, type SectionPage } from "@/lib/assessments/section-pages";
import { QuestionInput } from "@/components/assessments/question-input";
import { AssessmentShellHeader } from "@/components/assessments/AssessmentShellHeader";
import { domainColor } from "@/lib/assessments/report-presentation";

type AnswersMap = Record<string, number | string | string[]>;
interface SectionPagerProps {
  pages: SectionPage[];
  answers: AnswersMap;
  onAnswerChange: (stableKey: string, value: number | string | string[]) => void;
  onSubmit: () => void;
  submitting?: boolean;
  onExit?: () => void;
  /** Assessment / campaign / template name shown in the branded shell header. */
  assessmentName?: string;
  /** Company / organization name shown in the shell header (invited flow only). */
  companyName?: string;
  /** Public/optional surveys: require at least one answered question before submit. */
  requireAtLeastOneAnswer?: boolean;
}

function pageHasIntro(p: SectionPage): boolean {
  const hasQuestions = p.questions.length > 0;
  return (p.description?.trim()?.length ?? 0) > 0 || !hasQuestions;
}

export function SectionPager({ pages, answers, onAnswerChange, onSubmit, submitting, onExit, assessmentName, companyName, requireAtLeastOneAnswer }: SectionPagerProps) {
  const [sectionIndex, setSectionIndex] = React.useState(0);
  const page = pages[sectionIndex];
  const [view, setView] = React.useState<"intro" | "questions">(page && pageHasIntro(page) ? "intro" : "questions");
  const [showGateError, setShowGateError] = React.useState(false);
  const [invalidKeys, setInvalidKeys] = React.useState<Set<string>>(new Set());
  const [gateMessage, setGateMessage] = React.useState<string>("");
  const submitLatch = React.useRef(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Release the synchronous double-click latch once a submit settles.
  React.useEffect(() => { if (!submitting) submitLatch.current = false; }, [submitting]);

  if (!page) {
    return (
      <div className="su-assessment-brand survey-section">
        <p>Nothing to answer yet.</p>
        <button type="button" className="wf-btn wf-btn-primary" onClick={onSubmit} disabled={submitting}>Submit</button>
      </div>
    );
  }

  const hasQuestions = page.questions.length > 0;
  const hasIntro = pageHasIntro(page);
  const isLast = sectionIndex === pages.length - 1;
  const answeredCount = pages.flatMap((p) => p.questions).filter((q) => isAnswered(answers[q.stableKey])).length;
  const total = pages.flatMap((p) => p.questions).length;

  function focusHeading() { requestAnimationFrame(() => headingRef.current?.focus()); }
  function focusFirstInvalid(stableKey: string) {
    requestAnimationFrame(() => document.getElementById(`q-${stableKey}`)?.focus());
  }
  function focusFirstAnswerable() {
    const first = page.questions[0];
    if (first) requestAnimationFrame(() => document.getElementById(`q-${first.stableKey}`)?.focus());
  }

  function handleAnswerChange(stableKey: string, value: number | string | string[]) {
    onAnswerChange(stableKey, value);
    setInvalidKeys((prev) => {
      if (!prev.has(stableKey) || !isAnswered(value)) return prev; // whitespace/empty STAYS invalid
      const next = new Set(prev);
      next.delete(stableKey);
      if (next.size === 0) setShowGateError(false);
      return next;
    });
  }

  function goToSection(idx: number) {
    const next = pages[idx];
    setSectionIndex(idx);
    setView(pageHasIntro(next) ? "intro" : "questions");
    setShowGateError(false);
    setInvalidKeys(new Set());
    focusHeading();
  }
  function advance() { if (isLast) { attemptSubmit(); return; } goToSection(sectionIndex + 1); }
  function handleForwardFromIntro() {
    if (hasQuestions) { setView("questions"); setShowGateError(false); focusHeading(); }
    else { advance(); }
  }
  function attemptSubmit() {
    const totalAnswered = pages.flatMap((p) => p.questions).filter((q) => isAnswered(answers[q.stableKey])).length;
    if (requireAtLeastOneAnswer && totalAnswered === 0) {
      setGateMessage("Please answer at least one question before submitting.");
      setShowGateError(true);
      focusFirstAnswerable(); // NON-field alert; do NOT mark optional questions invalid
      return;
    }
    if (submitLatch.current || submitting) return; // synchronous double-click guard
    submitLatch.current = true;
    onSubmit();
  }
  function handleNext() {
    const unanswered = page.questions.filter((q) => q.isRequired && !isAnswered(answers[q.stableKey]));
    if (unanswered.length > 0) {
      setInvalidKeys(new Set(unanswered.map((q) => q.stableKey)));
      setGateMessage("Please answer all required questions before continuing.");
      setShowGateError(true);
      focusFirstInvalid(unanswered[0].stableKey);
      return;
    }
    if (isLast) { attemptSubmit(); return; }
    advance();
  }
  function handleBack() {
    if (view === "questions" && hasIntro) { setView("intro"); setShowGateError(false); focusHeading(); return; }
    if (sectionIndex === 0) { onExit?.(); return; }
    const prev = sectionIndex - 1;
    setSectionIndex(prev);
    setView(pages[prev].questions.length > 0 ? "questions" : "intro");
    setShowGateError(false);
    focusHeading();
  }

  const introForwardLabel = isLast && !hasQuestions ? "Submit" : "Begin section →";
  const questionCount = page.questions.length;

  // Domain accent for the section-intro rail + number badge. Neutral grey when
  // the section carries no domain (report-presentation handles the fallback).
  const accent = domainColor(page.domain ?? "");
  // Step label = the section's own partLabel ("Fundamental 1" in the mockup)
  // when present. The shell header already carries the canonical "Section N of
  // M", so we degrade gracefully (omit the step label) rather than duplicate it.
  const stepLabel = page.partLabel?.trim() ? page.partLabel : null;

  return (
    <div className="su-assessment-brand survey-section">
      <AssessmentShellHeader
        currentSection={sectionIndex + 1}
        totalSections={pages.length}
        assessmentName={assessmentName}
        companyName={companyName}
        answeredCount={answeredCount}
        totalQuestions={total}
      />

      {view === "intro" ? (
        <section
          className="su-intro-slide"
          aria-labelledby="su-intro-heading"
          style={{ ["--su-section-accent" as string]: accent }}
        >
          {/* Domain accent rail — colored top bar (neutral when no domain). */}
          <div className="su-intro-rail" aria-hidden="true" />
          <div className="su-intro-kicker">
            <span className="su-intro-stepblock">
              {stepLabel ? <span className="su-intro-label">{stepLabel}</span> : null}
              <h2
                id="su-intro-heading"
                ref={headingRef}
                tabIndex={-1}
                className="su-intro-title"
              >
                {page.name}
              </h2>
            </span>
          </div>
          {page.description?.trim() ? (
            <div className="su-intro-covers">
              <span className="su-intro-covers-k">What this section covers</span>
              <p className="su-intro-desc">{page.description}</p>
            </div>
          ) : null}
          <div className="su-intro-meta">
            {questionCount > 0 ? (
              <span className="su-intro-estimate">
                {questionCount} question{questionCount !== 1 ? "s" : ""}
              </span>
            ) : <span />}
            <button
              type="button"
              className="su-intro-begin"
              onClick={handleForwardFromIntro}
              disabled={submitting}
            >
              {introForwardLabel}
            </button>
          </div>
          <div className="survey-nav su-intro-back-row">
            <button type="button" className="wf-btn wf-btn-ghost su-intro-back" onClick={handleBack}>← Back</button>
          </div>
        </section>
      ) : (
        <>
          <h2 ref={headingRef} tabIndex={-1} className="survey-section-title">
            {page.partLabel ? `${page.partLabel}: ` : ""}{page.name}
          </h2>
          <ul className="survey-question-list">
            {page.questions.map((q) => (
              <li key={q.stableKey} className="survey-question">
                <label htmlFor={`q-${q.stableKey}`} className="survey-question-label">
                  {q.label}{q.isRequired ? <span className="survey-required" aria-hidden="true"> *</span> : null}
                </label>
                {q.helpText ? <p className="survey-question-help">{q.helpText}</p> : null}
                <QuestionInput question={q} value={answers[q.stableKey]} onChange={handleAnswerChange} disabled={submitting} invalid={invalidKeys.has(q.stableKey)} />
              </li>
            ))}
          </ul>
          {showGateError ? <p role="alert" className="survey-error">{gateMessage}</p> : null}
          <div className="survey-nav">
            <button type="button" className="wf-btn wf-btn-secondary" onClick={handleBack}>Back</button>
            <button type="button" className="wf-btn wf-btn-primary" onClick={handleNext} disabled={submitting}>{isLast ? "Submit" : "Next"}</button>
          </div>
        </>
      )}
    </div>
  );
}
