"use client";

import React from "react";
import type {
  ReportHtmlConfigV1,
} from "@/lib/assessments/report-html";
import {
  REPORT_HTML_LIMITS,
  reportHtmlSourceCharacterIssue,
} from "@/lib/assessments/report-html-sanitizer";

function HtmlRegion({
  id,
  title,
  label,
  helper,
  value,
  position,
  onChange,
  isReadOnly,
}: {
  id: string;
  title: string;
  label: string;
  helper: string;
  value: string | null;
  position: "introduction" | "conclusion";
  onChange: (value: string) => void;
  isReadOnly: boolean;
}) {
  const html = value ?? "";
  const sourceCharacterIssue = reportHtmlSourceCharacterIssue(html, position);
  const errorId = `${id}-error`;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="p-5">
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Optional HTML
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <label className="sr-only" htmlFor={id}>
            {label}
          </label>
          <textarea
            id={id}
            aria-label={label}
            value={html}
            onChange={(event) => onChange(event.target.value)}
            disabled={isReadOnly}
            aria-invalid={sourceCharacterIssue ? true : undefined}
            aria-describedby={sourceCharacterIssue ? errorId : undefined}
            spellCheck={false}
            className={`min-h-[168px] w-full resize-y rounded-lg border bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 ${sourceCharacterIssue ? "border-destructive focus:border-destructive focus:ring-destructive/20" : "border-slate-700 focus:border-primary focus:ring-primary/20"}`}
          />
          <div className="mt-2 flex items-start justify-between gap-4 text-[11px] text-muted-foreground">
            {sourceCharacterIssue ? (
              <span id={errorId} role="alert" className="text-destructive">
                {sourceCharacterIssue}
              </span>
            ) : (
              <span>
                Paste HTML. Unsafe scripts and attributes are removed when you save the draft.
              </span>
            )}
            <span className={`shrink-0 ${sourceCharacterIssue ? "font-semibold text-destructive" : ""}`}>
              {html.length.toLocaleString()} / {REPORT_HTML_LIMITS[position].rawCharacters.toLocaleString()}
            </span>
          </div>
      </div>
    </section>
  );
}

function PreviewLink({
  href,
  children,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  disabled: boolean;
}) {
  return (
    <a
      href={href}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={disabled ? (event) => event.preventDefault() : undefined}
      className={disabled ? "pointer-events-none opacity-50" : undefined}
    >
      {children}
    </a>
  );
}

export function ReportsTab({
  value,
  previewHref,
  historicalPreviewHref,
  previewDisabled,
  onChange,
  isReadOnly,
}: {
  value: ReportHtmlConfigV1;
  previewHref: string;
  historicalPreviewHref: string | null;
  previewDisabled: boolean;
  onChange: (next: ReportHtmlConfigV1) => void;
  isReadOnly: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="reports-tab">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Report content</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add optional content to the Welcome and Closing sections. The generated report between them stays unchanged.
        </p>
      </div>

      <HtmlRegion
        id="report-introduction-html"
        title="Welcome section"
        label="Introduction / preface HTML"
        helper="Replaces the default Welcome content on page 2."
        value={value.introductionHtml}
        position="introduction"
        onChange={(introductionHtml) =>
          onChange({ ...value, introductionHtml })
        }
        isReadOnly={isReadOnly}
      />

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">Full report preview</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Preview uses the last saved content and the exact report styling.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <PreviewLink href={previewHref} disabled={previewDisabled}>
            Open full report preview
          </PreviewLink>
          {historicalPreviewHref ? (
            <PreviewLink href={historicalPreviewHref} disabled={previewDisabled}>
              Open historical report preview
            </PreviewLink>
          ) : null}
        </div>
        {previewDisabled ? <p className="mt-3 text-xs text-muted-foreground">Save the draft to preview your latest changes.</p> : null}
      </section>

      <section className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground">
          ▥
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Generated report</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Scores, phase, You and Peers comparisons, explanations, feedback, and question order are generated automatically and cannot be replaced here.
          </p>
        </div>
      </section>

      <HtmlRegion
        id="report-conclusion-html"
        title="Closing message"
        label="Conclusion / call-to-action HTML"
        helper="Appears after the respondent's score and strongest/focus summary on page 25. It replaces only the default next steps and coach link."
        value={value.conclusionHtml}
        position="conclusion"
        onChange={(conclusionHtml) => onChange({ ...value, conclusionHtml })}
        isReadOnly={isReadOnly}
      />
    </div>
  );
}
