"use client";

import { useId, useMemo, useState } from "react";
import {
  REPORT_STYLE_KEYS,
  REPORT_STYLE_REGISTRY,
  getReportStylePreviewPath,
  type ReportStylePreviewAnatomy,
  type ReportStyleKey,
} from "@/lib/assessments/report-style-registry";

type PreviewPage = "cover" | "summary" | "detail";

const PREVIEW_TABS: ReadonlyArray<{ key: PreviewPage; label: string }> = [
  { key: "cover", label: "Cover" },
  { key: "summary", label: "Summary" },
  { key: "detail", label: "Detail" },
];

export interface ReportStylePickerProps {
  value: ReportStyleKey;
  onChange: (value: ReportStyleKey) => void;
  disabled?: boolean;
  sourceLabel?: string;
  lockedAt?: Date | string | null;
  previewAnatomy?: ReportStylePreviewAnatomy;
  heading?: string;
  disabledExplanation?: string | null;
}

function previewId(
  anatomy: ReportStylePreviewAnatomy,
  style: ReportStyleKey,
  page: PreviewPage,
) {
  return `${anatomy}:${style}:${page}`;
}

function formatLockTimestamp(lockedAt: Date | string) {
  const parsed = lockedAt instanceof Date ? lockedAt : new Date(lockedAt);

  if (Number.isNaN(parsed.getTime())) return null;

  return {
    iso: parsed.toISOString(),
    text: new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(parsed),
  };
}

export function ReportStylePicker({
  value,
  onChange,
  disabled = false,
  sourceLabel,
  lockedAt,
  previewAnatomy = "scored",
  heading = "Report style",
  disabledExplanation,
}: ReportStylePickerProps) {
  const radioName = useId();
  const previewRegionId = `${radioName}-preview`;
  const [previewPage, setPreviewPage] = useState<PreviewPage>("cover");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [failedPreviews, setFailedPreviews] = useState<ReadonlySet<string>>(() => new Set());
  const [retryVersions, setRetryVersions] = useState<Readonly<Record<string, number>>>({});

  const selectedMetadata = REPORT_STYLE_REGISTRY[value];
  const lockedTimestamp = useMemo(
    () => (lockedAt == null ? null : formatLockTimestamp(lockedAt)),
    [lockedAt],
  );

  function selectStyle(style: ReportStyleKey) {
    if (!disabled) onChange(style);
  }

  function handleRadioKeyDown(event: React.KeyboardEvent<HTMLInputElement>, style: ReportStyleKey) {
    if (disabled || !["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = REPORT_STYLE_KEYS.indexOf(style);
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + REPORT_STYLE_KEYS.length) % REPORT_STYLE_KEYS.length;
    const nextRadio = document.getElementsByName(radioName).item(nextIndex);

    if (nextRadio instanceof HTMLInputElement) nextRadio.focus();
    onChange(REPORT_STYLE_KEYS[nextIndex]);
  }

  function handlePreviewTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, page: PreviewPage) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPreviewPage(page);
      return;
    }

    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;

    event.preventDefault();
    const currentIndex = PREVIEW_TABS.findIndex((tab) => tab.key === page);
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + PREVIEW_TABS.length) % PREVIEW_TABS.length;
    const nextPage = PREVIEW_TABS[nextIndex].key;
    const nextTab = document.getElementById(`${radioName}-${nextPage}-tab`);

    if (nextTab instanceof HTMLButtonElement) nextTab.focus();
    setPreviewPage(nextPage);
  }

  function retryPreview(page: PreviewPage) {
    const currentPreviewId = previewId(previewAnatomy, value, page);

    setFailedPreviews((current) => {
      const next = new Set(current);
      next.delete(currentPreviewId);
      return next;
    });
    setRetryVersions((current) => ({
      ...current,
      [currentPreviewId]: (current[currentPreviewId] ?? 0) + 1,
    }));
  }

  return (
    <section aria-label={`${heading} selection`} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">{heading}</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {REPORT_STYLE_KEYS.map((style) => {
            const metadata = REPORT_STYLE_REGISTRY[style];
            const isSelected = style === value;

            return (
              <label
                key={style}
                className="block cursor-pointer rounded-lg border border-border bg-background p-3 text-foreground shadow-sm transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring has-[:checked]:border-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-75"
              >
                <input
                  type="radio"
                  name={radioName}
                  value={style}
                  checked={isSelected}
                  disabled={disabled}
                  aria-checked={isSelected}
                  className="sr-only"
                  onChange={() => selectStyle(style)}
                  onKeyDown={(event) => handleRadioKeyDown(event, style)}
                />
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold leading-tight">{metadata.label}</span>
                  {isSelected && (
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      <span aria-hidden="true">✓</span>
                      <span className="sr-only">Selected</span>
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block text-xs leading-snug text-muted-foreground">
                  {metadata.description}
                </span>
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  Paper format: {metadata.paperFormat}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {disabled &&
        (disabledExplanation !== null || sourceLabel) && (
          <div className="space-y-1 text-sm text-muted-foreground" aria-live="polite">
            {sourceLabel && <p>Source: {sourceLabel}</p>}
            {disabledExplanation === undefined ? (
              <p>
                {lockedAt != null &&
                  (lockedTimestamp ? (
                    <>
                      Locked on <time dateTime={lockedTimestamp.iso}>{lockedTimestamp.text}</time>.{" "}
                    </>
                  ) : (
                    "Lock timestamp could not be read. "
                  ))}
                Report appearance was fixed when the first response was completed.
              </p>
            ) : (
              disabledExplanation != null && <p>{disabledExplanation}</p>
            )}
          </div>
        )}

      <div
        className={`mt-3 flex flex-wrap gap-3 ${
          previewExpanded ? "items-start justify-between" : "justify-end"
        }`}
      >
        {previewExpanded && (
          <div
            role="tablist"
            aria-label={`${heading} preview pages`}
            className="flex flex-wrap gap-2"
          >
            {PREVIEW_TABS.map((tab) => {
              const isActive = tab.key === previewPage;

              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`${radioName}-${tab.key}-tab`}
                  aria-selected={isActive}
                  aria-controls={`${radioName}-${tab.key}-panel`}
                  tabIndex={isActive ? 0 : -1}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
                  onClick={() => setPreviewPage(tab.key)}
                  onKeyDown={(event) => handlePreviewTabKeyDown(event, tab.key)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          aria-expanded={previewExpanded}
          aria-controls={previewRegionId}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          onClick={() => setPreviewExpanded((expanded) => !expanded)}
        >
          {previewExpanded ? "Hide preview" : "Show preview"}
        </button>
      </div>

      {previewExpanded && (
        <div
          id={previewRegionId}
          role="region"
          aria-label={`${heading} preview`}
          className="mt-3"
        >
          {PREVIEW_TABS.map((tab) => {
            const currentPreviewId = previewId(previewAnatomy, value, tab.key);
            const isActive = tab.key === previewPage;
            const failedPreview = failedPreviews.has(currentPreviewId);

            return (
              <div
                key={tab.key}
                id={`${radioName}-${tab.key}-panel`}
                role="tabpanel"
                aria-labelledby={`${radioName}-${tab.key}-tab`}
                aria-label={`${selectedMetadata.label} ${tab.key} preview`}
                hidden={!isActive}
              >
                {isActive &&
                  (failedPreview ? (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4 text-foreground" role="status">
                    <p>Preview unavailable</p>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
                      onClick={() => retryPreview(tab.key)}
                    >
                      Retry
                    </button>
                  </div>
                  ) : (
                  // Preview URLs are chosen at runtime from the closed registry; native image events
                  // let Retry remount only the failed preview without changing the selected style.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${currentPreviewId}-${retryVersions[currentPreviewId] ?? 0}`}
                    src={getReportStylePreviewPath(
                      value,
                      previewAnatomy,
                      tab.key,
                    )}
                    alt={`${selectedMetadata.label} ${tab.label} preview`}
                    className="w-full rounded-lg border border-border"
                    onError={() =>
                      setFailedPreviews((current) => new Set(current).add(currentPreviewId))
                    }
                  />
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
