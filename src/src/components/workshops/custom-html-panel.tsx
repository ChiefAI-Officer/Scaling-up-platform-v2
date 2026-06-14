"use client";

/**
 * CustomHtmlPanel — per-workshop landing-page HTML override editor.
 *
 * Rendered ONLY when the GET response has `customHtmlEditor === true` (flag ON + actor is
 * privileged). Both solo-landing and duo-landing wire this component identically; it owns
 * its own PUT calls and NEVER touches the `content` / `status` fields used by the
 * surrounding editor's "Save Draft" / "Save & Publish" buttons.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

export interface CustomHtmlPanelProps {
  workshopId: string;
  templateKey: "SOLO_LANDING" | "DUO_LANDING";
  /** "DRAFT" | "PUBLISHED" | null — drives the publish-state notice */
  pageStatus: string | null;
  /** Loaded from GET response. Non-empty value wins over resolvedHtml (Q5b). */
  initialCustomHtml: string | null;
  /**
   * Pre-fetched resolved HTML snapshot (`?resolved=1`).
   * Empty string means no active template / nothing to resolve.
   */
  resolvedHtml: string;
  /**
   * Optional callback fired whenever the live textarea value changes (including
   * on mount and after programmatic Restore/Refresh). The parent editor uses
   * this to mirror the live HTML into the Live Preview pane.
   */
  onValueChange?: (value: string) => void;
}

export function CustomHtmlPanel({
  workshopId,
  templateKey,
  pageStatus,
  initialCustomHtml,
  resolvedHtml,
  onValueChange,
}: CustomHtmlPanelProps) {
  // Q5b: non-empty stored value → else resolvedHtml → else ""
  const initialValue =
    initialCustomHtml && initialCustomHtml.trim() !== ""
      ? initialCustomHtml
      : resolvedHtml;

  const [htmlValue, setHtmlValue] = useState<string>(initialValue);

  // Report live value to parent (for Live Preview) — fires on mount + every change.
  useEffect(() => {
    onValueChange?.(htmlValue);
  }, [htmlValue, onValueChange]);

  // CAS anchor: what was last loaded from the server
  const [loadedHtml, setLoadedHtml] = useState<string | null>(
    initialCustomHtml ?? null
  );
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);

  const baseUrl = `/api/workshops/${workshopId}/landing-pages/${templateKey}`;

  // ── Save HTML ─────────────────────────────────────────────────────────────
  const handleSaveHtml = async () => {
    setSaving(true);
    setError(null);
    setWarning(null);

    try {
      const response = await fetch(baseUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customHtml: htmlValue.trim() === "" ? null : htmlValue,
          expectedCustomHtml: loadedHtml,
        }),
      });

      const data = await response.json() as {
        success?: boolean;
        error?: string;
        customHtml?: string | null;
        sanitizerStripped?: boolean;
      };

      if (response.status === 409) {
        setError(
          "This page changed since you opened it — reload and re-apply."
        );
      } else if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to save HTML");
      } else {
        setLoadedHtml(data.customHtml ?? null);
        if (data.sanitizerStripped) {
          setWarning(
            "Some content was removed for safety (scripts/disallowed tags)."
          );
        }
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Restore ───────────────────────────────────────────────────────────────
  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    setWarning(null);

    try {
      const response = await fetch(`${baseUrl}?action=restore-html`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCustomHtml: loadedHtml }),
      });

      const data = await response.json() as {
        success?: boolean;
        error?: string;
        customHtml?: string | null;
        sanitizerStripped?: boolean;
      };

      if (response.status === 409) {
        setError(
          "This page changed since you opened it — reload and re-apply."
        );
      } else if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to restore HTML");
      } else {
        const restored = data.customHtml ?? "";
        setLoadedHtml(data.customHtml ?? null);
        setHtmlValue(restored);
        if (data.sanitizerStripped) {
          setWarning(
            "Some content was removed for safety (scripts/disallowed tags)."
          );
        }
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setRestoring(false);
    }
  };

  // ── Refresh (after confirm) ───────────────────────────────────────────────
  const handleRefreshConfirmed = async () => {
    setShowRefreshConfirm(false);
    setRefreshing(true);
    setError(null);
    setWarning(null);

    try {
      const response = await fetch(`${baseUrl}?resolved=1`);
      const data = await response.json() as {
        success?: boolean;
        customHtmlResolved?: string;
      };
      if (data.success) {
        setHtmlValue(data.customHtmlResolved ?? "");
        // NO save — textarea state only
      } else {
        setError("Failed to fetch resolved HTML.");
      }
    } catch {
      setError("Failed to fetch resolved HTML.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <ConfirmationModal
        isOpen={showRefreshConfirm}
        onClose={() => setShowRefreshConfirm(false)}
        onConfirm={handleRefreshConfirmed}
        title="Refresh from current workshop data"
        description="This replaces the editor with a fresh copy built from the latest workshop details. Your current edits will be lost. Continue?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Custom HTML Override</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Informational notices */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="rounded-md bg-muted px-3 py-2 border border-border">
              A non-empty HTML override replaces the block layout.
            </p>
            <p className="rounded-md bg-muted px-3 py-2 border border-border">
              This HTML is a static snapshot — later workshop edits (date/venue/price/link) won&rsquo;t update it.
            </p>
            {pageStatus && (
              <p
                className={`rounded-md px-3 py-2 border ${
                  pageStatus === "PUBLISHED"
                    ? "bg-success/10 border-success/20 text-success-foreground"
                    : "bg-warning/10 border-warning/20 text-warning-foreground"
                }`}
              >
                {pageStatus === "PUBLISHED"
                  ? "This page is published."
                  : `This page is a draft — your HTML won't be public until the page is published.`}
              </p>
            )}
          </div>

          {/* Error / warning banners */}
          {error && (
            <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}
          {warning && (
            <div role="status" className="bg-warning/10 border border-warning/20 text-warning-foreground px-3 py-2 rounded-md text-sm">
              {warning}
            </div>
          )}

          {/* Textarea */}
          <div>
            <label
              htmlFor="custom-html-textarea"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Custom HTML
            </label>
            <textarea
              id="custom-html-textarea"
              aria-label="Custom HTML"
              value={htmlValue}
              onChange={(e) => {
                setHtmlValue(e.target.value);
                setError(null);
                setWarning(null);
              }}
              rows={14}
              className="block w-full rounded-md border border-border px-3 py-2 font-mono text-sm focus:border-primary focus:ring-primary"
              placeholder="Paste your full HTML here…"
            />
          </div>

          {/* Action row */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleSaveHtml}
              disabled={saving || restoring || refreshing}
            >
              {saving ? "Saving…" : "Save HTML"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleRestore}
              disabled={saving || restoring || refreshing}
            >
              {restoring ? "Restoring…" : "Restore previous version"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRefreshConfirm(true)}
              disabled={
                saving ||
                restoring ||
                refreshing ||
                resolvedHtml === ""
              }
            >
              {refreshing ? "Refreshing…" : "Refresh from current workshop data"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
