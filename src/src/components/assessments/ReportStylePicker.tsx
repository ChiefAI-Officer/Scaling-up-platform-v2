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
  compact?: boolean;
  previewAnatomy?: ReportStylePreviewAnatomy;
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
  compact = false,
  previewAnatomy = "scored",
}: ReportStylePickerProps) {
  const radioName = useId();
  const [previewPage, setPreviewPage] = useState<PreviewPage>("cover");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [failedPreviews, setFailedPreviews] = useState<ReadonlySet<string>>(() => new Set());
  const [retryVersions, setRetryVersions] = useState<Readonly<Record<string, number>>>({});

  const selectedMetadata = REPORT_STYLE_REGISTRY[value];
  const selectedThumbnailId = previewId(previewAnatomy, value, "cover");
  const selectedThumbnailFailed = failedPreviews.has(selectedThumbnailId);
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
    <section
      aria-label="Report style selection"
      className={compact ? "space-y-3" : "space-y-5"}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">Report style</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {REPORT_STYLE_KEYS.map((style) => {
            const metadata = REPORT_STYLE_REGISTRY[style];
            const isSelected = style === value;

            return (
              <label
                key={style}
                className={`block cursor-pointer rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-700 has-[:checked]:border-slate-900 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-75 ${
                  compact ? "p-2" : "p-4"
                }`}
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
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{metadata.label}</span>
                  {isSelected && (
                    <span className="text-sm font-medium" aria-live="polite">
                      Selected
                    </span>
                  )}
                </span>
                <span className="mt-2 block text-sm text-slate-700">{metadata.description}</span>
                <span className="mt-2 block text-sm text-slate-700">
                  Paper format: {metadata.paperFormat}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {disabled && (
        <div className="space-y-1 text-sm text-slate-700" aria-live="polite">
          {sourceLabel && <p>Source: {sourceLabel}</p>}
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
        </div>
      )}

      {compact &&
        (selectedThumbnailFailed ? (
          <div
            className="space-y-2 rounded-lg border border-slate-300 p-4"
            role="status"
          >
            <p>Preview unavailable</p>
            <button
              type="button"
              className="rounded-md border border-slate-500 px-3 py-1.5 text-sm font-medium text-slate-900 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-700"
              onClick={() => retryPreview("cover")}
            >
              Retry
            </button>
          </div>
        ) : (
          // Compact creation surfaces keep one selected thumbnail visible while
          // the full anatomy preview remains available on demand below.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${selectedThumbnailId}-${retryVersions[selectedThumbnailId] ?? 0}`}
            src={getReportStylePreviewPath(value, previewAnatomy, "cover")}
            alt={`${selectedMetadata.label} selected thumbnail`}
            className="h-28 w-full rounded-lg border border-slate-300 object-cover object-top"
            onError={() =>
              setFailedPreviews((current) =>
                new Set(current).add(selectedThumbnailId),
              )
            }
          />
        ))}

      {compact && (
        <button
          type="button"
          aria-expanded={previewExpanded}
          className="text-sm font-medium text-slate-900 underline underline-offset-2"
          onClick={() => setPreviewExpanded((expanded) => !expanded)}
        >
          Preview selected appearance
        </button>
      )}
      {(!compact || previewExpanded) && (
        <div className="mt-3 space-y-3">
        <div role="tablist" aria-label="Report style preview pages" className="flex gap-2">
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
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-700"
                onClick={() => setPreviewPage(tab.key)}
                onKeyDown={(event) => handlePreviewTabKeyDown(event, tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

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
              {failedPreview ? (
                <div className="space-y-2 rounded-lg border border-slate-300 p-4" role="status">
                  <p>Preview unavailable</p>
                  <button
                    type="button"
                    className="rounded-md border border-slate-500 px-3 py-1.5 text-sm font-medium text-slate-900 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-700"
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
                  className="w-full rounded-lg border border-slate-300"
                  onError={() =>
                    setFailedPreviews((current) => new Set(current).add(currentPreviewId))
                  }
                />
              )}
            </div>
          );
        })}
        </div>
      )}
    </section>
  );
}
