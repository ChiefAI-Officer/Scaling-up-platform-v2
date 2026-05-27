"use client";

/**
 * AddMemberModal — single-respondent create within one organization.
 *
 * Mirrors AddTeamModal conventions exactly:
 *   - Dialog + DialogDescription for a11y
 *   - native <select> with data-testid + linked <Label> via useId
 *   - submitting guard, setError(null) reset
 *   - res.ok && json.success checks
 *   - Array.isArray(json.error) ? json.error[0]?.message : ... unwrap
 *   - onCreated callback + onClose
 *
 * PROPS
 * ─────
 * open         — controls visibility
 * onClose      — called when modal should close (cancel or success)
 * onCreated    — called after successful create { respondent } so caller refreshes
 * orgId        — the organization to create the respondent under (one at a time)
 * teams        — flat list of teams belonging to orgId (pre-fetched by parent)
 * defaultTeamId — pre-select this team in the selector (pass when a team node is selected)
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
import type { ApiTeamNode } from "./members-teams-view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What we call back with on success */
export type MemberCreatedResult = {
  respondent: Record<string, unknown>;
};

export interface AddMemberModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (result: MemberCreatedResult) => void;
  /** The organization under which the respondent will be created */
  orgId: string;
  /** Flat team list for this org (already loaded by the parent view) */
  teams: ApiTeamNode[];
  /** Pre-selected team (the currently selected TreeNode when it's a team) */
  defaultTeamId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Very permissive email shape check — server validates strictly with Zod */
function isEmailShape(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddMemberModal({
  open,
  onClose,
  onCreated,
  orgId,
  teams,
  defaultTeamId,
}: AddMemberModalProps) {
  const firstNameId = useId();
  const lastNameId  = useId();
  const emailId     = useId();
  const jobTitleId  = useId();
  const teamId_id   = useId();

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [jobTitle,  setJobTitle]  = useState("");
  const [teamId,    setTeamId]    = useState<string>(defaultTeamId ?? "");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Reset form whenever the dialog opens or the defaultTeamId changes
  useEffect(() => {
    if (open) {
      setFirstName("");
      setLastName("");
      setEmail("");
      setJobTitle("");
      setTeamId(defaultTeamId ?? "");
      setError(null);
    }
  }, [open, defaultTeamId]);

  // ---------------------------------------------------------------------------
  // Validation + submit
  // ---------------------------------------------------------------------------

  function validate(): string | null {
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim())  return "Last name is required.";
    if (!email.trim())     return "Email is required.";
    if (!isEmailShape(email.trim())) return "Please enter a valid email address.";
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
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim(),
      };
      if (jobTitle.trim()) body.jobTitle = jobTitle.trim();
      // Send teamId only when a team is actually selected
      if (teamId) {
        body.teamId = teamId;
      }

      const res = await fetch(`/api/organizations/${orgId}/respondents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(
          Array.isArray(json.error)
            ? (json.error[0]?.message ?? "Failed to add member. Please try again.")
            : typeof json.error === "string"
            ? json.error
            : "Failed to add member. Please try again."
        );
        return;
      }

      onCreated({ respondent: json.data as Record<string, unknown> });
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
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Add a respondent to this organization. Fields marked * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 py-2">
            {/* ---- First name ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={firstNameId}>First name *</Label>
              <Input
                id={firstNameId}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Jane"
                disabled={submitting}
                required
              />
            </div>

            {/* ---- Last name ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={lastNameId}>Last name *</Label>
              <Input
                id={lastNameId}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Smith"
                disabled={submitting}
                required
              />
            </div>

            {/* ---- E-mail ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={emailId}>E-mail *</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane.smith@company.com"
                disabled={submitting}
                required
              />
            </div>

            {/* ---- Job title (optional) ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={jobTitleId}>Job title</Label>
              <Input
                id={jobTitleId}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Director of Operations"
                disabled={submitting}
              />
            </div>

            {/* ---- Team (optional) ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={teamId_id}>Team</Label>
              {/*
                Native <select> so jest/fireEvent.change works reliably
                without @testing-library/user-event — same pattern as AddTeamModal.
              */}
              <select
                id={teamId_id}
                data-testid="select-team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">— no team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
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
              {submitting ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
