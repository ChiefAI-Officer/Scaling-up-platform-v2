"use client";

/**
 * EditOrganizationModal — edit an Organization (company root node).
 *
 * Mirrors EditTeamModal conventions exactly:
 *   - Dialog + DialogDescription for a11y
 *   - useId-linked labels
 *   - submitting guard, setError(null) reset on open + on each attempt
 *   - res.ok && json.success checks
 *   - Array.isArray(json.error) ? json.error[0]?.message : ... unwrap
 *   - onUpdated awaited BEFORE onClose()
 *
 * API: PATCH /api/organizations/{organization.id}
 * Body: { name, externalId } — externalId is null when cleared (API maps
 *   empty-string → null per updateOrganizationSchema).
 *
 * PROPS
 * ─────
 * open         — controls visibility
 * onClose      — called when the modal should close (cancel or success)
 * onUpdated    — async callback; awaited before onClose
 * organization — the org being edited (id, name, externalId?)
 */

import React, { useState, useEffect, useId } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditOrganizationModalOrg {
  id: string;
  name: string;
  externalId?: string | null;
}

export interface EditOrganizationModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called after a successful PATCH so the parent can re-render.
   * May return a Promise — the modal awaits it before calling onClose(),
   * keeping buttons disabled throughout.
   */
  onUpdated: () => void | Promise<void>;
  /** The organization being edited. */
  organization: EditOrganizationModalOrg;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditOrganizationModal({
  open,
  onClose,
  onUpdated,
  organization,
}: EditOrganizationModalProps) {
  const nameId     = useId();
  const extIdId    = useId();

  // Form state — pre-filled from organization prop
  const [name,       setName]       = useState(organization.name);
  const [externalId, setExternalId] = useState(organization.externalId ?? "");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Reset form whenever the dialog opens (sync to new organization prop)
  useEffect(() => {
    if (open) {
      setName(organization.name);
      setExternalId(organization.externalId ?? "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organization.id, organization.name, organization.externalId]);

  // ---------------------------------------------------------------------------
  // Validation + submit
  // ---------------------------------------------------------------------------

  function validate(): string | null {
    if (!name.trim()) return "Name is required.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        // Per updateOrganizationSchema + route: empty string or null → null (clears the field).
        // We send null explicitly when cleared so the API coerces correctly.
        externalId: externalId.trim() ? externalId.trim() : null,
      };

      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(
          Array.isArray(json.error)
            ? (json.error[0]?.message ?? "Failed to update organization. Please try again.")
            : typeof json.error === "string"
            ? json.error
            : "Failed to update organization. Please try again."
        );
        return;
      }

      // Await the refresh callback before closing so the parent's data is up
      // to date and any refresh error surfaces before the modal disappears.
      // `submitting` stays true through the await so buttons remain disabled.
      await onUpdated();
      onClose();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Organization</DialogTitle>
          <DialogDescription>
            Update this company&apos;s name and external reference. Fields marked * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 py-2">
            {/* ---- Name ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={nameId}>Name *</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                disabled={submitting}
                required
              />
            </div>

            {/* ---- External ID (optional) ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={extIdId}>External ID</Label>
              <Input
                id={extIdId}
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="e.g. acme-ext-001"
                disabled={submitting}
                aria-describedby={`${extIdId}-hint`}
              />
              <p id={`${extIdId}-hint`} className="text-xs text-muted-foreground italic">
                Optional reference id for syncing with an external system.
              </p>
            </div>

            {/* ---- Inline error ---- */}
            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
