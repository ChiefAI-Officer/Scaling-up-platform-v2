"use client";

/**
 * TierBandBar — ED5 T17/T18 (B-5). A visual, draggable + keyboard-movable band
 * editor rendered ABOVE the number-input TierTable (which stays authoritative
 * for precise entry + a11y). Dragging/arrowing a shared divider moves the
 * boundary between two adjacent tiers using the CANONICAL conversion in
 * `tier-band-math` (the SAME one the tiling validator uses — co-validate C2), so
 * bands stay contiguous by construction. Shown only for a FINITE metric domain;
 * the parent renders inputs-only + a note when the domain is open-ended.
 */

import { useRef } from "react";
import type { TierDomain } from "@/lib/assessments/scoring";
import type { TierRow } from "./ScoringTiersTab";
import {
  tiersToBoundaries,
  boundaryToTiers,
  clampBoundary,
  type TierMode,
} from "./tier-band-math";

export interface TierBandBarProps {
  tiers: TierRow[];
  domain: TierDomain;
  mode: TierMode;
  /** Fractional snap step (integer mode always snaps to 1). */
  step?: number;
  onChange: (next: TierRow[]) => void;
  isReadOnly: boolean;
  testIdPrefix?: string;
}

export function TierBandBar({
  tiers,
  domain,
  mode,
  step = 1,
  onChange,
  isReadOnly,
  testIdPrefix = "tier-band",
}: TierBandBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Bar only makes sense over a finite, positive-width domain.
  if (!Number.isFinite(domain.max) || domain.max <= domain.min) return null;

  const span = domain.max - domain.min;
  const minGap = mode === "integer" ? 1 : step;
  const boundaries = tiersToBoundaries(tiers);
  const sortedTiers = [...tiers].sort((a, b) => a.minMetric - b.minMetric);

  const pct = (v: number) => ((v - domain.min) / span) * 100;

  // Allowed [min,max] for the i-th interior boundary so no adjacent tier
  // collapses below one grid step. Plain functions (not hooks) so they can live
  // after the early return above without violating the rules of hooks.
  const rangeFor = (i: number): { min: number; max: number } => {
    const lo = i > 0 ? boundaries[i - 1] + minGap : domain.min;
    const hi =
      i < boundaries.length - 1
        ? boundaries[i + 1] - minGap
        : domain.max - minGap;
    return { min: lo, max: Math.max(lo, hi) };
  };

  const commit = (i: number, rawValue: number) => {
    if (isReadOnly) return;
    const value = clampBoundary(rawValue, rangeFor(i), mode, step);
    if (value === boundaries[i]) return;
    onChange(boundaryToTiers(tiers, mode, i, value));
  };

  const onKeyDown = (i: number) => (e: React.KeyboardEvent) => {
    if (isReadOnly) return;
    const cur = boundaries[i];
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + minGap;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - minGap;
    else if (e.key === "Home") next = domain.min;
    else if (e.key === "End") next = domain.max;
    if (next !== null) {
      e.preventDefault();
      commit(i, next);
    }
  };

  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const move = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      commit(i, domain.min + ratio * span);
    };
    const onMove = (ev: PointerEvent) => move(ev.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="space-y-1" data-testid={`${testIdPrefix}-bar`}>
      <div
        ref={trackRef}
        className="relative h-8 rounded border border-border bg-muted/40"
        role="group"
        aria-label="Tier band editor"
      >
        {/* Tier segment labels */}
        {sortedTiers.map((t, si) => {
          const left = pct(t.minMetric);
          const right =
            typeof t.maxMetric === "number" ? pct(t.maxMetric) : 100;
          return (
            <div
              key={si}
              className="absolute top-0 bottom-0 flex items-center justify-center overflow-hidden text-[0.625rem] text-muted-foreground"
              style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
            >
              <span className="truncate px-1">{t.label || `Tier ${si + 1}`}</span>
            </div>
          );
        })}
        {/* Interior dividers */}
        {boundaries.map((b, i) => (
          <button
            key={i}
            type="button"
            role="slider"
            aria-label={`Tier boundary ${i + 1}`}
            aria-valuemin={rangeFor(i).min}
            aria-valuemax={rangeFor(i).max}
            aria-valuenow={b}
            disabled={isReadOnly}
            data-testid={`${testIdPrefix}-divider-${i}`}
            onKeyDown={onKeyDown(i)}
            onPointerDown={onPointerDown(i)}
            className="absolute top-0 bottom-0 -ml-1 w-2 cursor-ew-resize rounded bg-primary/70 hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            style={{ left: `${pct(b)}%` }}
          />
        ))}
      </div>
      <p className="text-[0.625rem] text-muted-foreground">
        Drag or arrow-key the dividers to set tier boundaries (
        {domain.min}–{domain.max}). Precise values in the table below.
      </p>
    </div>
  );
}
