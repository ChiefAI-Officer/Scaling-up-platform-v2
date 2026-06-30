"use client";

/**
 * CustomSlidesPanel — Wave M (#19) coach-authored custom-slide editor.
 *
 * A controlled list editor for a campaign's `customSlides`. Each slide has an
 * optional plain-text title, an HTML body, and a position (Start / Before a
 * named section / End), plus reorder + remove. The panel mirrors Wave B's
 * `custom-html-panel.tsx`: a sandboxed-iframe LIVE PREVIEW of the SANITIZED
 * slide + the sanitizer's strip-warnings surfaced inline.
 *
 * Trust boundary: the preview imports `sanitizeSlideHtml` (pure JS, server-safe
 * AND browser-safe) so the coach sees exactly what participants will see — the
 * participant survey still sanitizes server-side; this editor's client-side
 * sanitize is for PREVIEW + warnings only and is NOT a security boundary.
 *
 * Caps (client-side hints; the server is authoritative): ≤MAX_SLIDES_PER_CAMPAIGN
 * slides, ≤MAX_SLIDE_HTML_BYTES per body, ≤MAX_SLIDE_TITLE_LENGTH per title.
 *
 * This component is purely CONTROLLED: it never persists. Both mount points
 * (CampaignWizard create step + CampaignDetail edit panel) own the POST/PATCH.
 */

import { useMemo } from "react";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import {
  MAX_SLIDES_PER_CAMPAIGN,
  MAX_SLIDE_HTML_BYTES,
  MAX_SLIDE_TITLE_LENGTH,
  type CustomSlide,
  type SlidePosition,
} from "@/lib/assessments/custom-slides";
import { sanitizeSlideHtml } from "@/lib/assessments/slide-sanitizer";

export interface CustomSlidesPanelSection {
  stableKey: string;
  name: string;
}

export interface CustomSlidesPanelProps {
  /** Controlled value — the current slide list. */
  value: CustomSlide[];
  /** Called with the next slide list on every edit. */
  onChange: (next: CustomSlide[]) => void;
  /** Sections of the campaign's pinned/selected version — drives the "Before section" picker. */
  sections: CustomSlidesPanelSection[];
  /** When true, every control is read-only (e.g. CLOSED campaign or in-flight save). */
  disabled?: boolean;
}

/** UTF-8 byte length (matches the server-side cap check in custom-slides-write.ts). */
function byteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x7f) bytes += 1;
    else if (cp <= 0x7ff) bytes += 2;
    else if (cp <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * Generate a cuid-ish id matching the `CUID_ISH` regex used by
 * `CustomSlideSchema` (`/^[a-z0-9][a-z0-9_-]{7,63}$/`): a lowercase
 * alphanumeric token, length 8..64. Dependency-free so it works identically in
 * the browser, Node, and the jsdom test sandbox.
 */
function newSlideId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 24; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `slide${out}`; // "slide" + 24 chars → always starts lowercase, 8..64 long
}

/** Serialize a SlidePosition to a stable <select> option value. */
function positionToOptionValue(pos: SlidePosition): string {
  if (pos.kind === "start") return "start";
  if (pos.kind === "end") return "end";
  return `before:${pos.sectionStableKey}`;
}

/** Parse a <select> option value back to a SlidePosition. */
function optionValueToPosition(v: string): SlidePosition {
  if (v === "start") return { kind: "start" };
  if (v === "end") return { kind: "end" };
  if (v.startsWith("before:")) {
    return { kind: "before-section", sectionStableKey: v.slice("before:".length) };
  }
  return { kind: "end" };
}

export function CustomSlidesPanel({
  value,
  onChange,
  sections,
  disabled = false,
}: CustomSlidesPanelProps) {
  const atCap = value.length >= MAX_SLIDES_PER_CAMPAIGN;

  function addSlide() {
    if (disabled || atCap) return;
    const next: CustomSlide = {
      id: newSlideId(),
      title: "",
      html: "",
      position: { kind: "end" },
      // Append after the current max sortOrder so a new slide lands last.
      sortOrder:
        value.length === 0
          ? 0
          : Math.max(...value.map((s) => s.sortOrder)) + 1,
    };
    onChange([...value, next]);
  }

  function updateSlide(index: number, patch: Partial<CustomSlide>) {
    if (disabled) return;
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeSlide(index: number) {
    if (disabled) return;
    onChange(value.filter((_, i) => i !== index));
  }

  /** Move a slide up/down in the visible list AND keep sortOrder monotonic. */
  function move(index: number, dir: -1 | 1) {
    if (disabled) return;
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    // Renumber sortOrder to match the new visual order so persistence + render
    // ordering agree with what the coach sees.
    onChange(next.map((s, i) => ({ ...s, sortOrder: i })));
  }

  return (
    <div className="su-assessment-brand space-y-4" data-testid="custom-slides-panel">
      <div className="space-y-1 text-sm text-muted-foreground">
        <p className="rounded-md bg-muted px-3 py-2 border border-border">
          Custom slides are branded interstitial pages woven into the survey.
          They are not counted in &ldquo;Section N of M&rdquo; and collect no
          answers. Scripts, styles, and iframes are removed for safety.
        </p>
      </div>

      {value.length === 0 ? (
        <div
          className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground"
          data-testid="custom-slides-empty"
        >
          No custom slides yet. Add one to show a branded message inside the
          assessment.
        </div>
      ) : (
        <ol className="space-y-4" data-testid="custom-slides-list">
          {value.map((slide, index) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              index={index}
              total={value.length}
              sections={sections}
              disabled={disabled}
              onPatch={(patch) => updateSlide(index, patch)}
              onRemove={() => removeSlide(index)}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
            />
          ))}
        </ol>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addSlide}
          disabled={disabled || atCap}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="custom-slides-add"
        >
          <Plus className="w-4 h-4" />
          Add slide
        </button>
        <span className="text-xs text-muted-foreground" data-testid="custom-slides-count">
          {value.length} / {MAX_SLIDES_PER_CAMPAIGN} slides
        </span>
        {atCap && (
          <span className="text-xs text-warning-foreground" data-testid="custom-slides-cap">
            Slide limit reached.
          </span>
        )}
      </div>
    </div>
  );
}

function SlideCard({
  slide,
  index,
  total,
  sections,
  disabled,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  slide: CustomSlide;
  index: number;
  total: number;
  sections: CustomSlidesPanelSection[];
  disabled: boolean;
  onPatch: (patch: Partial<CustomSlide>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  // Sanitize the live body for the preview + surface the sanitizer's warnings.
  const { html: safeHtml, warnings } = useMemo(
    () => sanitizeSlideHtml(slide.html ?? ""),
    [slide.html],
  );

  const titleLen = (slide.title ?? "").length;
  const htmlBytes = byteLength(slide.html ?? "");
  const titleOver = titleLen > MAX_SLIDE_TITLE_LENGTH;
  const htmlOver = htmlBytes > MAX_SLIDE_HTML_BYTES;

  // The preview document: the sanitized body inside a minimal branded shell.
  const previewDoc = useMemo(() => {
    const titleHtml =
      slide.title && slide.title.trim() !== ""
        ? `<h2 style="font-family:Roboto,Helvetica,Arial,sans-serif;color:#522583;margin:0 0 12px">${escapeHtml(
            slide.title,
          )}</h2>`
        : "";
    return `<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta charset="utf-8"><style>body{font-family:Roboto,Helvetica,Arial,sans-serif;color:#1f2937;margin:16px;line-height:1.5}img{max-width:100%}</style></head><body>${titleHtml}${safeHtml}</body></html>`;
  }, [slide.title, safeHtml]);

  return (
    <li
      className="border border-border rounded-lg bg-card p-4 space-y-3"
      data-testid="custom-slide-card"
    >
      {/* Header row: slide index + reorder/remove controls */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          Slide {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={disabled || index === 0}
            aria-label="Move slide up"
            className="p-1.5 rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="custom-slide-move-up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={disabled || index === total - 1}
            aria-label="Move slide down"
            className="p-1.5 rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="custom-slide-move-down"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove slide"
            className="p-1.5 rounded-md border border-border text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="custom-slide-remove"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="space-y-1">
        <label
          htmlFor={`slide-title-${slide.id}`}
          className="block text-xs font-medium text-foreground"
        >
          Title (optional)
        </label>
        <input
          id={`slide-title-${slide.id}`}
          type="text"
          value={slide.title ?? ""}
          disabled={disabled}
          maxLength={MAX_SLIDE_TITLE_LENGTH * 2 /* let the over-cap warning show */}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="e.g. A note from your coach"
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          data-testid="custom-slide-title"
        />
        <p
          className={`text-[11px] ${titleOver ? "text-destructive" : "text-muted-foreground"}`}
          data-testid="custom-slide-title-count"
        >
          {titleLen} / {MAX_SLIDE_TITLE_LENGTH} characters
        </p>
      </div>

      {/* HTML body */}
      <div className="space-y-1">
        <label
          htmlFor={`slide-html-${slide.id}`}
          className="block text-xs font-medium text-foreground"
        >
          Content (HTML)
        </label>
        <textarea
          id={`slide-html-${slide.id}`}
          value={slide.html ?? ""}
          disabled={disabled}
          rows={8}
          onChange={(e) => onPatch({ html: e.target.value })}
          placeholder="<p>Write your message here. Bold, lists, links and images are supported.</p>"
          className="w-full px-3 py-2 font-mono text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          data-testid="custom-slide-html"
        />
        <p
          className={`text-[11px] ${htmlOver ? "text-destructive" : "text-muted-foreground"}`}
          data-testid="custom-slide-html-count"
        >
          {htmlBytes} / {MAX_SLIDE_HTML_BYTES} bytes
        </p>
      </div>

      {/* Position picker */}
      <div className="space-y-1">
        <label
          htmlFor={`slide-position-${slide.id}`}
          className="block text-xs font-medium text-foreground"
        >
          Show this slide
        </label>
        <select
          id={`slide-position-${slide.id}`}
          value={positionToOptionValue(slide.position)}
          disabled={disabled}
          onChange={(e) => onPatch({ position: optionValueToPosition(e.target.value) })}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          data-testid="custom-slide-position"
        >
          <option value="start">At the start (before section 1)</option>
          {sections.map((s) => (
            <option key={s.stableKey} value={`before:${s.stableKey}`}>
              Before section: {s.name}
            </option>
          ))}
          <option value="end">At the end (before submit)</option>
        </select>
      </div>

      {/* Sanitizer strip-warnings */}
      {warnings.length > 0 && (
        <div
          role="status"
          className="bg-warning/10 border border-warning/20 text-warning-foreground px-3 py-2 rounded-md text-xs"
          data-testid="custom-slide-warnings"
        >
          Some content was removed for safety: {warnings.join("; ")}.
        </div>
      )}

      {/* Live preview (sandboxed iframe — no scripts, no same-origin) */}
      <div className="space-y-1">
        <span className="block text-xs font-medium text-foreground">
          Live preview
        </span>
        <iframe
          title={`Slide ${index + 1} preview`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={previewDoc}
          className="w-full h-48 rounded-md border border-border bg-white"
          data-testid="custom-slide-preview"
        />
      </div>
    </li>
  );
}

/** Minimal HTML-escape for the (plain-text) title injected into the preview shell. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default CustomSlidesPanel;
