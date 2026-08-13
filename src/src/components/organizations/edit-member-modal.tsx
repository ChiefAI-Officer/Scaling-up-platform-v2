"use client";

/**
 * EditMemberModal — edit a single OrgRespondent within one organization.
 *
 * Mirrors EditTeamModal conventions exactly:
 *   - Dialog + DialogDescription for a11y
 *   - native <select> with data-testid + linked <Label> via useId
 *   - submitting guard, setError(null) reset on open + on each attempt
 *   - res.ok && json.success checks
 *   - Array.isArray(json.error) ? json.error[0]?.message : ... unwrap
 *   - onUpdated awaited BEFORE onClose()
 *
 * EMAIL IS EDITABLE (#60): the PATCH API accepts an email change and recomputes
 * normalizedEmail (and, for email-sourced members, the dedupe key). A collision
 * with another member in the org comes back as a 409 shown inline.
 *
 * PROPS
 * ─────
 * open         — controls visibility
 * onClose      — called when the modal should close (cancel or success)
 * onUpdated    — async callback; awaited before onClose so parent refresh
 *                completes before the modal disappears
 * member       — the respondent being edited (id, orgId, firstName, lastName,
 *                email, jobTitle?, teamId?)
 * teams        — flat list of teams belonging to the same org
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
import { RESPONDENT_LEVELS, RESPONDENT_LEVEL_VALUES } from "@/lib/assessments/respondent-levels";

type FieldError = { id: string; message: string };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditMemberModalMember {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
  teamId?: string | null;
  roleType?: string | null;
}

export interface EditMemberModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called after a successful PATCH so the parent can re-render.
   * May return a Promise — the modal awaits it before calling onClose(),
   * keeping buttons disabled throughout.
   */
  onUpdated: () => void | Promise<void>;
  /** The respondent being edited. */
  member: EditMemberModalMember;
  /** Flat list of teams for this org (pre-fetched by parent). */
  teams: ApiTeamNode[];
  responsiveEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditMemberModal({
  open,
  onClose,
  onUpdated,
  member,
  teams,
  responsiveEnabled = false,
}: EditMemberModalProps) {
  const firstNameId = useId();
  const lastNameId  = useId();
  const emailId     = useId();
  const jobTitleId  = useId();
  const teamId_id   = useId();
  const levelId     = useId();

  // Form state — pre-filled from member prop
  const [email,           setEmail]           = useState(member.email);
  const [firstName,       setFirstName]       = useState(member.firstName);
  const [lastName,        setLastName]        = useState(member.lastName);
  const [jobTitle,        setJobTitle]        = useState(member.jobTitle ?? "");
  const [teamId,          setTeamId]          = useState<string>(member.teamId ?? "");
  const [roleType,        setRoleType]        = useState<string>(member.roleType ?? "");
  // Track the value that was in the DB when the modal opened so we can detect
  // if the user actually changed it (needed for legacy-slug preservation below).
  const [initialRoleType, setInitialRoleType] = useState<string | null | undefined>(member.roleType);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // Reset form whenever the dialog opens (sync to new member prop)
  useEffect(() => {
    if (open) {
      setEmail(member.email);
      setFirstName(member.firstName);
      setLastName(member.lastName);
      setJobTitle(member.jobTitle ?? "");
      setTeamId(member.teamId ?? "");
      setRoleType(member.roleType ?? "");
      setInitialRoleType(member.roleType);
      setError(null);
      setFieldErrors([]);
    }
  }, [open, member.id, member.email, member.firstName, member.lastName, member.jobTitle, member.teamId, member.roleType]);

  // ---------------------------------------------------------------------------
  // Validation + submit
  // ---------------------------------------------------------------------------

  function validate(): string | null {
    if (!email.trim())     return "Email is required.";
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim())  return "Last name is required.";
    return null;
  }

  function validateFields(): FieldError[] {
    const errors: FieldError[] = [];
    if (!email.trim()) errors.push({ id: emailId, message: "Email is required." });
    if (!firstName.trim()) errors.push({ id: firstNameId, message: "First name is required." });
    if (!lastName.trim()) errors.push({ id: lastNameId, message: "Last name is required." });
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors([]);

    const responsiveFieldErrors = responsiveEnabled ? validateFields() : [];
    const validationError = responsiveEnabled ? responsiveFieldErrors[0]?.message ?? null : validate();
    if (validationError) {
      setError(validationError);
      setFieldErrors(responsiveFieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        email:     email.trim(),
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
      };
      // Include jobTitle only if it has a value; send null to clear
      if (jobTitle.trim()) {
        body.jobTitle = jobTitle.trim();
      }
      // Include teamId only when a team is actually selected (mirror Add Member omit logic)
      if (teamId) {
        body.teamId = teamId;
      }
      // email is always sent (#60) — the server recomputes normalizedEmail and,
      // for email-sourced members, the dedupe key; sending the unchanged value
      // is idempotent.
      // roleType handling:
      //  - If the user explicitly cleared the field (empty string), send null to wipe it.
      //  - If the user explicitly picked a known slug, send it.
      //  - If the value is unchanged AND it's a legacy/unknown slug (not in the known list),
      //    omit roleType entirely so the unknown slug passes through the Zod enum guard on
      //    PATCH without a 400 rejection.
      const isLegacyUnchanged =
        roleType === (initialRoleType ?? "") &&
        initialRoleType != null &&
        !(RESPONDENT_LEVEL_VALUES as readonly string[]).includes(initialRoleType);
      if (!isLegacyUnchanged) {
        body.roleType = roleType || null;
      }

      const res = await fetch(
        `/api/organizations/${member.orgId}/respondents/${member.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(
          Array.isArray(json.error)
            ? (json.error[0]?.message ?? "Failed to update member. Please try again.")
            : typeof json.error === "string"
            ? json.error
            : "Failed to update member. Please try again."
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
      <DialogContent
        responsiveEnabled={responsiveEnabled}
        className={responsiveEnabled
          ? "sm:max-w-md [&_input]:min-h-11 [&_select]:min-h-11"
          : "sm:max-w-md"}
      >
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>
            Update this respondent&apos;s details. Fields marked * are required.
          </DialogDescription>
        </DialogHeader>

        {responsiveEnabled && error && (
          <div role="alert" aria-label="Edit member error summary" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {fieldErrors.length > 0 ? <ul className="space-y-1">{fieldErrors.map((item) => <li key={`${item.id}-${item.message}`}><a className="underline" href={`#${item.id}`}>{item.message}</a></li>)}</ul> : error}
          </div>
        )}

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
                disabled={!responsiveEnabled && submitting}
                required
                aria-invalid={responsiveEnabled && fieldErrors.some((item) => item.id === firstNameId) ? true : undefined}
              />
              {responsiveEnabled && fieldErrors.find((item) => item.id === firstNameId) && <p className="text-sm text-destructive">{fieldErrors.find((item) => item.id === firstNameId)?.message}</p>}
            </div>

            {/* ---- Last name ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={lastNameId}>Last name *</Label>
              <Input
                id={lastNameId}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Smith"
                disabled={!responsiveEnabled && submitting}
                required
                aria-invalid={responsiveEnabled && fieldErrors.some((item) => item.id === lastNameId) ? true : undefined}
              />
              {responsiveEnabled && fieldErrors.find((item) => item.id === lastNameId) && <p className="text-sm text-destructive">{fieldErrors.find((item) => item.id === lastNameId)?.message}</p>}
            </div>

            {/* ---- E-mail (editable — #60) ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={emailId}>E-mail *</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. jane@example.com"
                disabled={!responsiveEnabled && submitting}
                required
                aria-describedby={`${emailId}-hint`}
                aria-invalid={responsiveEnabled && fieldErrors.some((item) => item.id === emailId) ? true : undefined}
              />
              <p id={`${emailId}-hint`} className="text-xs text-muted-foreground italic">
                Used for assessment invitations.
              </p>
              {responsiveEnabled && fieldErrors.find((item) => item.id === emailId) && <p className="text-sm text-destructive">{fieldErrors.find((item) => item.id === emailId)?.message}</p>}
            </div>

            {/* ---- Job title (optional) ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={jobTitleId}>Job title</Label>
              <Input
                id={jobTitleId}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Director of Operations"
                disabled={!responsiveEnabled && submitting}
              />
            </div>

            {/* ---- Team (optional) ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={teamId_id}>Team</Label>
              {/*
                Native <select> so jest/fireEvent.change works reliably
                without @testing-library/user-event — same pattern as AddMemberModal.
              */}
              <select
                id={teamId_id}
                data-testid="select-team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                disabled={!responsiveEnabled && submitting}
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

            {/* ---- Level (optional) ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={levelId}>Level</Label>
              {/*
                Native <select> — same pattern as Team selector.
                Six Esperto-aligned options; always sends roleType (null = clear).
                If member.roleType is set but isn't one of the 6 known values (legacy
                data), a "(legacy)" option is appended so the saved value is preserved.
              */}
              <select
                id={levelId}
                data-testid="select-level"
                value={roleType}
                onChange={(e) => setRoleType(e.target.value)}
                disabled={!responsiveEnabled && submitting}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">— no level —</option>
                {RESPONDENT_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
                {/* Passthrough for legacy values not in the 6 known slugs */}
                {member.roleType &&
                  !(RESPONDENT_LEVEL_VALUES as readonly string[]).includes(member.roleType) && (
                    <option value={member.roleType}>
                      {member.roleType} (legacy)
                    </option>
                  )}
              </select>
            </div>

            {/* ---- Inline error ---- */}
            {!responsiveEnabled && error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter className={responsiveEnabled
            ? "mt-4 gap-2 [&_button]:min-h-11 [&_button]:w-full sm:[&_button]:w-auto"
            : "mt-4"}
          >
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={!responsiveEnabled && submitting}
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
