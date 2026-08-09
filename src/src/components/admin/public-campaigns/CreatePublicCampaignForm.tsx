"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReportStylePicker } from "@/components/assessments/ReportStylePicker";
import type { PublicCampaignCreateOption } from "@/lib/assessments/public-campaign-create-options";
import {
  resolveReportStylePreviewAnatomy,
  type ReportStyleKey,
} from "@/lib/assessments/report-style-registry";
import { publicCampaignCreateError } from "@/lib/assessments/public-campaign-ui";

type StartsMode = "IMMEDIATE" | "SCHEDULED";
type EndsMode = "NONE" | "SCHEDULED";
type ReportStyleIntent = "INHERITED" | "EXPLICIT";

interface CreatePublicCampaignFormProps {
  options: PublicCampaignCreateOption[];
}

interface FieldErrors {
  templateId?: string;
  name?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

interface CreateResponseBody {
  error?: unknown;
  data?: { id?: unknown };
}

const LIST_PATH = "/admin/assessments/public-campaigns";
const REQUIRED_ERROR = "Complete the highlighted fields.";

function responseBody(value: unknown): CreateResponseBody {
  return value !== null && typeof value === "object"
    ? (value as CreateResponseBody)
    : {};
}

export function CreatePublicCampaignForm({
  options,
}: CreatePublicCampaignFormProps) {
  const router = useRouter();
  const assessmentRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [startsMode, setStartsMode] = useState<StartsMode>("IMMEDIATE");
  const [endsMode, setEndsMode] = useState<EndsMode>("NONE");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [reportStyle, setReportStyle] = useState<ReportStyleKey>("CLASSIC");
  const [reportStyleIntent, setReportStyleIntent] =
    useState<ReportStyleIntent>("INHERITED");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const busy = submitting || redirecting;

  if (options.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
        <h3 className="text-base font-semibold text-foreground">
          No published assessments are available.
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Publish an assessment before creating a public campaign.
        </p>
        <Link
          className="wf-btn mt-5 border border-border bg-background text-foreground"
          href="/admin/assessments/templates"
        >
          Manage assessments
        </Link>
      </section>
    );
  }

  const selectedOption = options.find((option) => option.id === templateId);

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function changeAssessment(nextTemplateId: string) {
    const nextOption = options.find((option) => option.id === nextTemplateId);
    setTemplateId(nextTemplateId);
    setReportStyle(
      nextOption?.reportStylesEnabled
        ? nextOption.defaultReportStyle
        : "CLASSIC",
    );
    setReportStyleIntent("INHERITED");
    clearFieldError("templateId");
  }

  function validate(now: Date): {
    errors: FieldErrors;
    openAt: string | null;
    closeAt: string | null;
  } {
    const errors: FieldErrors = {};
    if (!templateId) errors.templateId = "Choose an assessment.";
    if (!name.trim()) errors.name = "Enter a campaign name.";

    let openAt: string | null = now.toISOString();
    if (startsMode === "SCHEDULED") {
      const parsedStart = new Date(scheduledStart);
      if (!scheduledStart || Number.isNaN(parsedStart.getTime())) {
        errors.scheduledStart = "Choose a start date and time.";
        openAt = null;
      } else {
        openAt = parsedStart.toISOString();
      }
    }

    let closeAt: string | null = null;
    if (endsMode === "SCHEDULED") {
      const parsedEnd = new Date(scheduledEnd);
      if (!scheduledEnd || Number.isNaN(parsedEnd.getTime())) {
        errors.scheduledEnd = "Choose an end date and time.";
      } else if (openAt !== null && parsedEnd.getTime() <= new Date(openAt).getTime()) {
        errors.scheduledEnd = "Choose an end date after the start date.";
      } else {
        closeAt = parsedEnd.toISOString();
      }
    }

    return { errors, openAt, closeAt };
  }

  function focusFirstInvalid(errors: FieldErrors) {
    if (errors.templateId) assessmentRef.current?.focus();
    else if (errors.name) nameRef.current?.focus();
    else if (errors.scheduledStart) startRef.current?.focus();
    else if (errors.scheduledEnd) endRef.current?.focus();
  }

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setPageError(null);
    const { errors, openAt, closeAt } = validate(new Date());
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || openAt === null) {
      setPageError(REQUIRED_ERROR);
      focusFirstInvalid(errors);
      return;
    }

    const body = {
      templateId,
      name: name.trim(),
      openAt,
      closeAt,
      ...(selectedOption?.reportStylesEnabled &&
      reportStyleIntent === "EXPLICIT"
        ? { reportStyle }
        : {}),
    };

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/public-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let parsed: unknown = {};
      try {
        parsed = await response.json();
      } catch {
        parsed = {};
      }
      const result = responseBody(parsed);

      if (
        response.status === 201 &&
        typeof result.data?.id === "string" &&
        result.data.id.length > 0
      ) {
        setRedirecting(true);
        router.push(`${LIST_PATH}?created=${encodeURIComponent(result.data.id)}`);
        return;
      }

      const errorCode =
        typeof result.error === "string" ? result.error : "";
      setPageError(publicCampaignCreateError(response.status, errorCode));
    } catch {
      setRedirecting(false);
      setPageError(publicCampaignCreateError(0, ""));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="wf-card max-w-5xl overflow-hidden" noValidate onSubmit={createCampaign}>
      <div className="wf-card-body space-y-6">
        {pageError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
          >
            {pageError}
          </div>
        )}

        <div className="wf-field !mb-0">
          <label className="wf-label" htmlFor="public-campaign-assessment">
            Assessment <span aria-hidden="true">*</span>
          </label>
          <select
            ref={assessmentRef}
            id="public-campaign-assessment"
            className="wf-select"
            value={templateId}
            required
            aria-invalid={fieldErrors.templateId ? "true" : "false"}
            aria-describedby={
              fieldErrors.templateId ? "public-campaign-assessment-error" : undefined
            }
            onChange={(event) => changeAssessment(event.target.value)}
          >
            <option value="">Choose an assessment</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Only assessments that are ready to share are available.
          </p>
          {fieldErrors.templateId && (
            <p
              id="public-campaign-assessment-error"
              className="mt-1.5 text-sm font-medium text-destructive"
            >
              {fieldErrors.templateId}
            </p>
          )}
        </div>

        {selectedOption?.reportStylesEnabled && (
          <section
            className="space-y-4 border-y border-border py-6"
            aria-labelledby="public-campaign-report-design-heading"
          >
            <div>
              <h3
                id="public-campaign-report-design-heading"
                className="text-base font-semibold text-foreground"
              >
                Report design
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose how individual results will look.
              </p>
            </div>
            <ReportStylePicker
              value={reportStyle}
              heading="Report design"
              disabledExplanation={null}
              previewAnatomy={resolveReportStylePreviewAnatomy({
                templateAlias: selectedOption.alias,
                capabilities: selectedOption.reportStylePreviewCapabilities,
              })}
              onChange={(value) => {
                setReportStyle(value);
                setReportStyleIntent("EXPLICIT");
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                {reportStyleIntent === "INHERITED"
                  ? "Uses the assessment's default design."
                  : "Customized for this campaign."}
              </p>
              {reportStyleIntent === "EXPLICIT" && (
                <button
                  type="button"
                  className="wf-btn border border-border bg-background text-foreground"
                  onClick={() => {
                    setReportStyle(selectedOption.defaultReportStyle);
                    setReportStyleIntent("INHERITED");
                  }}
                >
                  Use assessment default
                </button>
              )}
            </div>
          </section>
        )}

        <div className="wf-field !mb-0">
          <label className="wf-label" htmlFor="public-campaign-name">
            Campaign name <span aria-hidden="true">*</span>
          </label>
          <input
            ref={nameRef}
            id="public-campaign-name"
            type="text"
            className="wf-input"
            maxLength={200}
            value={name}
            required
            aria-invalid={fieldErrors.name ? "true" : "false"}
            aria-describedby={fieldErrors.name ? "public-campaign-name-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError("name");
            }}
          />
          {fieldErrors.name && (
            <p
              id="public-campaign-name-error"
              className="mt-1.5 text-sm font-medium text-destructive"
            >
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <fieldset className="wf-field !mb-0 space-y-3">
            <legend className="wf-label">Starts</legend>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium">
                <input
                  type="radio"
                  name="public-campaign-starts"
                  value="IMMEDIATE"
                  checked={startsMode === "IMMEDIATE"}
                  onChange={() => {
                    setStartsMode("IMMEDIATE");
                    clearFieldError("scheduledStart");
                  }}
                />
                Open immediately
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium">
                <input
                  type="radio"
                  name="public-campaign-starts"
                  value="SCHEDULED"
                  checked={startsMode === "SCHEDULED"}
                  onChange={() => setStartsMode("SCHEDULED")}
                />
                Choose a date and time
              </label>
            </div>
            {startsMode === "SCHEDULED" && (
              <div className="pt-1">
                <label className="wf-label" htmlFor="public-campaign-start-date">
                  Start date and time
                </label>
                <input
                  ref={startRef}
                  id="public-campaign-start-date"
                  type="datetime-local"
                  className="wf-input"
                  value={scheduledStart}
                  required
                  aria-invalid={fieldErrors.scheduledStart ? "true" : "false"}
                  aria-describedby={
                    fieldErrors.scheduledStart
                      ? "public-campaign-start-date-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setScheduledStart(event.target.value);
                    clearFieldError("scheduledStart");
                  }}
                />
                {fieldErrors.scheduledStart && (
                  <p
                    id="public-campaign-start-date-error"
                    className="mt-1.5 text-sm font-medium text-destructive"
                  >
                    {fieldErrors.scheduledStart}
                  </p>
                )}
              </div>
            )}
          </fieldset>

          <fieldset className="wf-field !mb-0 space-y-3">
            <legend className="wf-label">Ends</legend>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium">
                <input
                  type="radio"
                  name="public-campaign-ends"
                  value="NONE"
                  checked={endsMode === "NONE"}
                  onChange={() => {
                    setEndsMode("NONE");
                    clearFieldError("scheduledEnd");
                  }}
                />
                No end date
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium">
                <input
                  type="radio"
                  name="public-campaign-ends"
                  value="SCHEDULED"
                  checked={endsMode === "SCHEDULED"}
                  onChange={() => setEndsMode("SCHEDULED")}
                />
                Choose an end date
              </label>
            </div>
            {endsMode === "SCHEDULED" && (
              <div className="pt-1">
                <label className="wf-label" htmlFor="public-campaign-end-date">
                  End date and time
                </label>
                <input
                  ref={endRef}
                  id="public-campaign-end-date"
                  type="datetime-local"
                  className="wf-input"
                  value={scheduledEnd}
                  required
                  aria-invalid={fieldErrors.scheduledEnd ? "true" : "false"}
                  aria-describedby={
                    fieldErrors.scheduledEnd
                      ? "public-campaign-end-date-error"
                      : undefined
                  }
                  onChange={(event) => {
                    setScheduledEnd(event.target.value);
                    clearFieldError("scheduledEnd");
                  }}
                />
                {fieldErrors.scheduledEnd && (
                  <p
                    id="public-campaign-end-date-error"
                    className="mt-1.5 text-sm font-medium text-destructive"
                  >
                    {fieldErrors.scheduledEnd}
                  </p>
                )}
              </div>
            )}
          </fieldset>
        </div>
      </div>

      <div className="wf-card-footer justify-end bg-muted/20">
        <Link
          className="wf-btn border border-border bg-background text-foreground"
          href={LIST_PATH}
          aria-disabled={busy ? "true" : undefined}
          tabIndex={busy ? -1 : undefined}
          onClick={busy ? (event) => event.preventDefault() : undefined}
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="wf-btn wf-btn-primary"
          disabled={busy}
          aria-busy={busy}
        >
          {redirecting
            ? "Redirecting…"
            : submitting
              ? "Creating…"
              : "Create draft"}
        </button>
      </div>
    </form>
  );
}
