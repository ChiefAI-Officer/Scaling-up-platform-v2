"use client";

import React, { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { InvitedWelcomeCard } from "@/components/assessments/InvitedWelcomeCard";
import {
  splitWelcomeMessage,
  type InvitedWelcomeAuthoringInputV1,
} from "@/lib/assessments/invited-welcome-config";
import type { WelcomeQuestion } from "@/components/assessments/assessment-welcome";

export type WelcomeFieldErrors = Partial<
  Record<keyof InvitedWelcomeAuthoringInputV1, string>
>;

interface EditorQuestion {
  type: string;
  scaleMin?: number;
  scaleMax?: number;
}

export function WelcomeScreenCard({
  values,
  finePrint,
  questions,
  sections,
  isReadOnly,
  errors = {},
  expanded: controlledExpanded,
  onExpandedChange,
  focusField,
  focusRequestToken,
  onChange,
}: {
  values: InvitedWelcomeAuthoringInputV1;
  finePrint: string | null;
  questions: readonly EditorQuestion[];
  sections: readonly unknown[];
  isReadOnly: boolean;
  errors?: WelcomeFieldErrors;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  focusField?: keyof InvitedWelcomeAuthoringInputV1 | null;
  focusRequestToken?: number;
  onChange: (patch: Partial<InvitedWelcomeAuthoringInputV1>) => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const [messageDraft, setMessageDraft] = useState(() =>
    values.ledeParagraphs.join("\n\n"),
  );
  const panelId = useId();
  const previewQuestions: WelcomeQuestion[] = questions.map((question) => ({
    type: question.type,
    ...(question.scaleMin !== undefined && question.scaleMax !== undefined
      ? { scale: { min: question.scaleMin, max: question.scaleMax } }
      : {}),
  }));
  const summary = values.ledeParagraphs[0] || "Set the first message respondents see.";
  const shortenedSummary = summary.length > 88 ? `${summary.slice(0, 85).trimEnd()}…` : summary;
  const config = { schemaVersion: 1 as const, ...values, finePrint };

  function setExpanded(next: boolean) {
    if (controlledExpanded === undefined) setLocalExpanded(next);
    onExpandedChange?.(next);
  }

  React.useEffect(() => {
    if (!expanded || !focusField) return;
    const id = focusField === "ledeParagraphs"
      ? "welcome-ledeParagraphs"
      : `welcome-${focusField}`;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }, [expanded, focusField, focusRequestToken]);

  const field = (
    key: Exclude<keyof InvitedWelcomeAuthoringInputV1, "ledeParagraphs">,
    label: string,
    options: { help?: string; multiline?: boolean } = {},
  ) => {
    const inputId = `welcome-${key}`;
    const helpId = `welcome-${key}-help`;
    const errorId = `welcome-${key}-error`;
    const describedBy = [options.help ? helpId : null, errors[key] ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;
    const common = {
      id: inputId,
      value: values[key],
      disabled: isReadOnly,
      "aria-invalid": errors[key] ? (true as const) : undefined,
      "aria-describedby": describedBy,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => onChange({ [key]: event.target.value }),
      className:
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
    };
    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {options.multiline ? <textarea {...common} rows={3} /> : <input {...common} />}
        {options.help ? (
          <p id={helpId} className="text-xs text-muted-foreground">
            {options.help}
          </p>
        ) : null}
        {errors[key] ? (
          <p id={errorId} className="text-xs text-destructive">
            {errors[key]}
          </p>
        ) : null}
      </div>
    );
  };

  const messageErrorId = "welcome-ledeParagraphs-error";

  return (
    <section
      data-testid="welcome-screen-card"
      className="overflow-hidden rounded-xl border border-primary/30 bg-card shadow-sm"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${expanded ? "Collapse" : "Expand"} Welcome screen`}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start justify-between gap-4 p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">Welcome screen</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              Fixed
            </span>
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            First screen respondents see
          </span>
          <span className="mt-2 block text-xs font-medium text-primary">
            Before Section 1
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {shortenedSummary}
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="mt-1 size-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="mt-1 size-4 shrink-0" aria-hidden="true" />
        )}
      </button>

      {expanded ? (
        <div
          id={panelId}
          data-testid="welcome-screen-expanded"
          className="border-t border-border p-5"
        >
          <p className="mb-5 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
            Changes become the default for future invited campaigns. Campaigns already
            created keep the Welcome screen they started with.
          </p>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
            <div data-testid="welcome-screen-fields" className="space-y-4">
              {field("eyebrow", "Invitation label")}
              {field("headingTemplate", "Heading", {
                help: "Keep {{campaignName}} so the campaign name appears automatically.",
              })}
              <div className="space-y-1.5">
                <label htmlFor="welcome-ledeParagraphs" className="text-sm font-medium text-foreground">
                  Welcome message
                </label>
                <textarea
                  id="welcome-ledeParagraphs"
                  rows={5}
                  value={messageDraft}
                  disabled={isReadOnly}
                  aria-invalid={errors.ledeParagraphs ? true : undefined}
                  aria-describedby={errors.ledeParagraphs ? messageErrorId : undefined}
                  onChange={(event) => {
                    setMessageDraft(event.target.value);
                    onChange({
                      ledeParagraphs: splitWelcomeMessage(event.target.value),
                    });
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="text-xs text-muted-foreground">
                  Separate paragraphs with a blank line.
                </p>
                {errors.ledeParagraphs ? (
                  <p id={messageErrorId} className="text-xs text-destructive">
                    {errors.ledeParagraphs}
                  </p>
                ) : null}
              </div>
              {field("sharingHeading", "Sharing heading")}
              {field("scoresHeading", "Scores heading")}
              {field("scoresDescription", "Scores explanation")}
              {field("ctaLabel", "Button label")}
            </div>

            <div data-testid="welcome-screen-preview" className="min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Respondent preview
              </p>
              <div className="su-public-brand su-assessment-brand overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                <InvitedWelcomeCard
                  config={config}
                  campaignName="Example campaign"
                  questions={previewQuestions}
                  sections={[...sections]}
                  onStart={() => undefined}
                  headingId="welcome-preview-heading"
                  preview
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
