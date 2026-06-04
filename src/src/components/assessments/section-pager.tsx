// src/src/components/assessments/section-pager.tsx
"use client";
import React from "react";
import { isAnswered, type SectionPage } from "@/lib/assessments/section-pages";
import { QuestionInput } from "@/components/assessments/question-input";

type AnswersMap = Record<string, number | string | string[]>;
interface SectionPagerProps {
  pages: SectionPage[];
  answers: AnswersMap;
  onAnswerChange: (stableKey: string, value: number | string | string[]) => void;
  onSubmit: () => void;
  submitting?: boolean;
  onExit?: () => void;
}

function pageHasIntro(p: SectionPage): boolean {
  const hasQuestions = p.questions.length > 0;
  return (p.description?.trim()?.length ?? 0) > 0 || !hasQuestions;
}

export function SectionPager({ pages, answers, onAnswerChange, onSubmit, submitting, onExit }: SectionPagerProps) {
  const [sectionIndex, setSectionIndex] = React.useState(0);
  const page = pages[sectionIndex];
  const [view, setView] = React.useState<"intro" | "questions">(page && pageHasIntro(page) ? "intro" : "questions");
  const [showGateError, setShowGateError] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  if (!page) {
    return (
      <div className="su-assessment-brand survey-section">
        <p>Nothing to answer yet.</p>
        <button type="button" onClick={onSubmit} disabled={submitting}>Submit</button>
      </div>
    );
  }

  const hasQuestions = page.questions.length > 0;
  const hasIntro = pageHasIntro(page);
  const isLast = sectionIndex === pages.length - 1;
  const answeredCount = pages.flatMap((p) => p.questions).filter((q) => isAnswered(answers[q.stableKey])).length;
  const total = pages.flatMap((p) => p.questions).length;

  function focusHeading() { requestAnimationFrame(() => headingRef.current?.focus()); }

  function handleAnswerChange(stableKey: string, value: number | string | string[]) {
    setShowGateError(false);
    onAnswerChange(stableKey, value);
  }

  function goToSection(idx: number) {
    const next = pages[idx];
    setSectionIndex(idx);
    setView(pageHasIntro(next) ? "intro" : "questions");
    setShowGateError(false);
    focusHeading();
  }
  function advance() { if (isLast) { onSubmit(); return; } goToSection(sectionIndex + 1); }
  function handleForwardFromIntro() {
    if (hasQuestions) { setView("questions"); setShowGateError(false); focusHeading(); }
    else { advance(); }
  }
  function handleNext() {
    const unanswered = page.questions.filter((q) => q.isRequired && !isAnswered(answers[q.stableKey]));
    if (unanswered.length > 0) { setShowGateError(true); return; }
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

  const introForwardLabel = isLast && !hasQuestions ? "Submit" : "Start";

  return (
    <div className="su-assessment-brand survey-section">
      <p aria-live="polite">Section {sectionIndex + 1} of {pages.length}</p>
      <div role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answeredCount} className="survey-progress">
        <div className="survey-progress-fill" style={{ width: total ? `${(answeredCount / total) * 100}%` : "0%" }} />
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="survey-section-title">
        {page.partLabel ? `${page.partLabel}: ` : ""}{page.name}
      </h2>

      {view === "intro" ? (
        <>
          {page.description ? <p className="survey-section-desc">{page.description}</p> : null}
          <div className="survey-nav">
            <button type="button" onClick={handleBack}>Back</button>
            <button type="button" onClick={handleForwardFromIntro} disabled={submitting}>{introForwardLabel}</button>
          </div>
        </>
      ) : (
        <>
          <ul className="survey-question-list">
            {page.questions.map((q) => (
              <li key={q.stableKey} className="survey-question">
                <label htmlFor={`q-${q.stableKey}`} className="survey-question-label">
                  {q.label}{q.isRequired ? <span className="survey-required" aria-hidden="true"> *</span> : null}
                </label>
                {q.helpText ? <p className="survey-question-help">{q.helpText}</p> : null}
                <QuestionInput question={q} value={answers[q.stableKey]} onChange={handleAnswerChange} disabled={submitting} />
              </li>
            ))}
          </ul>
          {showGateError ? <p role="alert" className="survey-error">Please answer all required questions before continuing.</p> : null}
          <div className="survey-nav">
            <button type="button" onClick={handleBack}>Back</button>
            <button type="button" onClick={handleNext} disabled={submitting}>{isLast ? "Submit" : "Next"}</button>
          </div>
        </>
      )}
    </div>
  );
}
