// src/src/components/assessments/section-pager.tsx
"use client";
import React from "react";
import { isAnswered } from "@/lib/assessments/section-pages";
import type { PagerPage } from "@/lib/assessments/custom-slides";
import { QuestionInput } from "@/components/assessments/question-input";
import { AssessmentShellHeader } from "@/components/assessments/AssessmentShellHeader";
import { domainColor } from "@/lib/assessments/report-presentation";
import { PhaseTile } from "@/components/assessments/phase-tile";
import { computeGrowthPhase } from "@/lib/assessments/su-full-phase";

type AnswersMap = Record<string, number | string | string[]>;

/**
 * Wave M: flatten the questions across SECTION pages only. Slide pages carry no
 * questions, so the answered/total counters never see them.
 */
function sectionQuestions(pages: PagerPage[]) {
  return pages.flatMap((p) => (p.kind === "section" ? p.questions : []));
}

/** SU-Full growth-phase interstitial gating (Wave J-1). */
const SU_FULL_ALIAS = "scaling-up-full";
/** The CEO background FTE question whose answer drives the growth phase. */
const FTE_CONTRACT_KEY = "Q_FTE_CONTRACT";

interface SectionPagerProps {
  /**
   * The pager page array. A discriminated union of `kind:"section"` pages (the
   * normal questionnaire sections, incl. the trailing "Other" orphan page) and
   * `kind:"slide"` pages (Wave M coach-authored interstitials). Callers that
   * have no custom slides pass section pages wrapped via `mergeCustomSlides`
   * (which wraps every `SectionPage` as `{kind:"section", ...}`), so the
   * existing flows behave byte-for-byte unchanged.
   */
  pages: PagerPage[];
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
  /**
   * Template alias of the assessment. Gates SU-Full-only behavior (the
   * growth-phase interstitial). Unknown/other aliases behave exactly as before.
   */
  templateAlias?: string;
  /**
   * Whether THIS respondent is the campaign CEO. The growth-phase interstitial
   * is SU-Full-only AND CEO-only (team members never see it).
   */
  isCEO?: boolean;
}

export function SectionPager({ pages, answers, onAnswerChange, onSubmit, submitting, onExit, assessmentName, companyName, requireAtLeastOneAnswer, templateAlias, isCEO }: SectionPagerProps) {
  const [sectionIndex, setSectionIndex] = React.useState(0);
  // Wave J-1: when set, the SU-Full growth-phase interstitial is shown in place
  // of the next section. Continue clears it and performs the real advance. It is
  // NOT a counted section (the shell header / progress bar are not rendered on
  // the tile). null = no tile showing.
  const [phaseTile, setPhaseTile] = React.useState<ReturnType<typeof computeGrowthPhase>>(null);
  const page = pages[sectionIndex];
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

  // Wave J-1: the SU-Full growth-phase interstitial takes over the screen when
  // set. It is NOT a counted section (no shell header / progress bar). Continue
  // advances to the next real section. Rendered before the section UI so it
  // fully replaces it while showing.
  if (phaseTile) {
    return <PhaseTile phase={phaseTile} onContinue={continueFromPhaseTile} />;
  }

  const isLast = sectionIndex === pages.length - 1;
  // Wave M: slide pages carry no questions. `pageQuestions` returns [] on a
  // slide, so every question-counting / gating path below is a no-op on a
  // slide (R3-Low-2 exhaustive kind handling).
  const pageQuestions = page.kind === "section" ? page.questions : [];
  // answered/total count questions across SECTION pages only (slides have none).
  const answeredCount = sectionQuestions(pages).filter((q) => isAnswered(answers[q.stableKey])).length;
  const total = sectionQuestions(pages).length;
  // "Section N of M": denominator + active index count `kind==="section"` pages
  // ONLY (slides are rendered-but-uncounted, like the existing phase tile / the
  // "Other" page). active = the 1-based ordinal of the current page among the
  // section pages; on a slide it carries the most-recently-passed section's
  // ordinal so the header would read correctly — but slides render NO header.
  const totalSections = pages.filter((p) => p.kind === "section").length;
  const currentSection = pages
    .slice(0, sectionIndex + 1)
    .filter((p) => p.kind === "section").length;

  function focusHeading() { requestAnimationFrame(() => headingRef.current?.focus()); }
  function focusFirstInvalid(stableKey: string) {
    requestAnimationFrame(() => document.getElementById(`q-${stableKey}`)?.focus());
  }
  function focusFirstAnswerable() {
    const first = pageQuestions[0];
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

  // Wave J-1: the growth-phase interstitial fires ONCE, when a SU-Full CEO
  // leaves the section that holds Q_FTE_CONTRACT, and only when the FTE answer
  // resolves to a real phase. Anything else (other template, non-CEO, no/invalid
  // FTE) skips it and advances normally — the CEO is never blocked.
  function phaseTileForLeaving(currentPage: PagerPage): ReturnType<typeof computeGrowthPhase> {
    if (templateAlias !== SU_FULL_ALIAS || !isCEO) return null;
    // Slide pages carry no questions → the phase tile never fires when leaving
    // a slide (R3-Low-2: a slide adjacent to the SU-Full phase-tile section must
    // not break the trigger).
    if (currentPage.kind !== "section") return null;
    const carriesFte = currentPage.questions.some((q) => q.stableKey === FTE_CONTRACT_KEY);
    if (!carriesFte) return null;
    const raw = answers[FTE_CONTRACT_KEY];
    const fte = typeof raw === "number" ? raw : Number(raw);
    return computeGrowthPhase(fte);
  }

  function advance() {
    // Intercept BEFORE incrementing: if leaving the SU-Full background section
    // and a phase is computable, show the interstitial instead of the next
    // section. Continue (continueFromPhaseTile) performs the real advance.
    const tile = phaseTileForLeaving(page);
    if (tile) {
      setPhaseTile(tile);
      setShowGateError(false);
      setInvalidKeys(new Set());
      return;
    }
    setSectionIndex(sectionIndex + 1);
    setShowGateError(false);
    setInvalidKeys(new Set());
    focusHeading();
  }
  function continueFromPhaseTile() {
    setPhaseTile(null);
    setSectionIndex(sectionIndex + 1);
    focusHeading();
  }
  function attemptSubmit() {
    const totalAnswered = sectionQuestions(pages).filter((q) => isAnswered(answers[q.stableKey])).length;
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
    // The required-answer gate is a no-op on a slide page (pageQuestions === []),
    // so a slide's forward button always advances (or submits, if trailing).
    const unanswered = pageQuestions.filter((q) => q.isRequired && !isAnswered(answers[q.stableKey]));
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
    if (sectionIndex === 0) { onExit?.(); return; }
    setSectionIndex(sectionIndex - 1);
    setShowGateError(false);
    focusHeading();
  }

  // Wave M: a custom-slide page renders as a branded interstitial — NO shell
  // header / NO "Section N of M" counter / NO progress bar (mirrors the
  // uncounted PhaseTile pattern). Optional title → sanitized HTML body (already
  // sanitized SERVER-SIDE by sanitizeSlideHtml; the client only injects it via
  // the raw-HTML prop, never sanitizes — the sanitizer is server-only, Wave M/N
  // item 5/6) → a single forward button (Submit when this slide is the trailing
  // page). Back behaves normally (Back at page 0 ⇒ onExit, via handleBack).
  if (page.kind === "slide") {
    const slideHtml = { __html: page.safeHtml };
    return (
      <div className="su-assessment-brand survey-section">
        <section className="su-custom-slide" aria-labelledby={page.title?.trim() ? "su-slide-heading" : undefined}>
          {/* Always a focusable heading so advance() lands focus on the
              interstitial (a11y). When the slide has no title it is rendered
              empty + aria-hidden (a focus anchor only). */}
          <h2
            ref={headingRef}
            tabIndex={-1}
            id={page.title?.trim() ? "su-slide-heading" : undefined}
            className="su-slide-heading"
            aria-hidden={page.title?.trim() ? undefined : true}
          >
            {page.title?.trim() ? page.title : null}
          </h2>
          <div className="su-slide-body" dangerouslySetInnerHTML={slideHtml} />
        </section>

        {/* A trailing END slide is the Submit page; the survey-wide
            requireAtLeastOneAnswer gate (attemptSubmit) can block it, so the
            slide must surface that non-field alert too. */}
        {showGateError ? <p role="alert" className="survey-error">{gateMessage}</p> : null}

        <div className="survey-nav">
          <button type="button" className="wf-btn wf-btn-secondary" onClick={handleBack}>Back</button>
          <button type="button" className="wf-btn wf-btn-primary" onClick={handleNext} disabled={submitting}>{isLast ? "Submit" : "Next"}</button>
        </div>
      </div>
    );
  }

  // From here, `page` is a SECTION page (the slide branch returned above).
  const sectionPage = page;

  // Domain accent for the section-intro rail. Neutral grey when the section
  // carries no domain (report-presentation handles the fallback).
  const accent = domainColor(sectionPage.domain ?? "");
  // Step label = the section's own partLabel ("Fundamental 1" in the mockup)
  // when present. The shell header already carries the canonical "Section N of
  // M", so we degrade gracefully (omit the step label) rather than duplicate it.
  const stepLabel = sectionPage.partLabel?.trim() ? sectionPage.partLabel : null;

  return (
    <div className="su-assessment-brand survey-section">
      <AssessmentShellHeader
        currentSection={currentSection}
        totalSections={totalSections}
        assessmentName={assessmentName}
        companyName={companyName}
        answeredCount={answeredCount}
        totalQuestions={total}
      />

      <section
        className="su-section-intro"
        style={{ ["--su-section-accent" as string]: accent }}
      >
        {/* Domain accent rail — colored top bar (neutral when no domain). */}
        <div className="su-intro-rail" aria-hidden="true" />
        {stepLabel ? <span className="su-intro-label">{stepLabel}</span> : null}
        <h2 ref={headingRef} tabIndex={-1} className="survey-section-title">
          {sectionPage.name}
        </h2>
        {sectionPage.description?.trim() ? (
          <div className="su-intro-covers">
            <span className="su-intro-covers-k">What this section covers</span>
            <p className="su-intro-desc">{sectionPage.description}</p>
          </div>
        ) : null}
      </section>

      {sectionPage.questions.length > 0 ? (
        <ul className="survey-question-list">
          {sectionPage.questions.map((q) => (
            <li key={q.stableKey} className="survey-question">
              <label htmlFor={`q-${q.stableKey}`} className="survey-question-label">
                {q.label}{q.isRequired ? <span className="survey-required" aria-hidden="true"> *</span> : null}
              </label>
              {q.helpText ? <p className="survey-question-help">{q.helpText}</p> : null}
              <QuestionInput question={q} value={answers[q.stableKey]} onChange={handleAnswerChange} disabled={submitting} invalid={invalidKeys.has(q.stableKey)} />
            </li>
          ))}
        </ul>
      ) : null}

      {showGateError ? <p role="alert" className="survey-error">{gateMessage}</p> : null}

      <div className="survey-nav">
        <button type="button" className="wf-btn wf-btn-secondary" onClick={handleBack}>Back</button>
        <button type="button" className="wf-btn wf-btn-primary" onClick={handleNext} disabled={submitting}>{isLast ? "Submit" : "Next"}</button>
      </div>
    </div>
  );
}
