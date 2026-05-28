"use client";

/**
 * AddTeamModal — dual-create Company (Organization) or Team (OrgTeam).
 *
 * MODEL MAPPING
 * ─────────────
 * "Company" = an Organization (no parent).  Created via POST /api/organizations.
 * "Team"    = an OrgTeam under a company.    Created via POST /api/organizations/{orgId}/teams.
 * "Sub-team"= an OrgTeam with a parentTeamId. Same endpoint, parentTeamId populated.
 *
 * GUARDS (enforced before submit)
 * ─────────────────────────────────
 * • Type = Company  is ONLY valid when Parent = root.
 * • Parent = root   is ONLY valid when Type  = Company.
 *
 * PROPS
 * ─────
 * open          — controls visibility
 * onClose       — called when the modal should close (cancel or success)
 * onCreated     — called after a successful create so the parent can refresh
 *                  { kind: "organization", org }  → refresh companies list
 *                  { kind: "team", team, orgId }   → refresh that org's team tree
 * organizations — the coach's existing companies (OrgSummary[])
 * loadedTeams   — already-fetched teams per org keyed by orgId (may be incomplete)
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { OrgSummary, ApiTeamNode } from "./members-teams-view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeamType = "company" | "department" | "team" | "folder";

/** Possible parent selections */
type ParentValue =
  | "root"                 // — none (root) —
  | `org:${string}`        // a company
  | `team:${string}:${string}`; // team:<orgId>:<teamId>

/** What we call back with on success */
export type CreatedResult =
  | { kind: "organization"; org: OrgSummary }
  | { kind: "team"; team: Record<string, unknown>; orgId: string };

export interface AddTeamModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreatedResult) => void;
  /** Coach's existing companies */
  organizations: OrgSummary[];
  /**
   * Already-loaded team lists keyed by orgId.
   * If an org has not been expanded yet the key may be absent or [].
   */
  loadedTeams: Record<string, ApiTeamNode[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FlatTeamEntry = { teamId: string; orgId: string; name: string; depth: number };

/** Flatten nested ApiTeamNode tree into a list for the Parent select. */
function flattenTeams(
  nodes: ApiTeamNode[],
  orgId: string,
  depth: number
): FlatTeamEntry[] {
  const result: FlatTeamEntry[] = [];
  for (const n of nodes) {
    result.push({ teamId: n.id, orgId, name: n.name, depth });
    result.push(...flattenTeams(n.children, orgId, depth + 1));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddTeamModal({
  open,
  onClose,
  onCreated,
  organizations,
  loadedTeams,
}: AddTeamModalProps) {
  const nameId  = useId();
  const typeId  = useId();
  const parentId = useId();
  const descId  = useId();

  // Form state
  const [name, setName]           = useState("");
  const [type, setType]           = useState<TeamType | "">("");
  const [parent, setParent]       = useState<ParentValue>("root");
  const [description, setDescription] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Reset form whenever the dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setType("");
      setParent("root");
      setDescription("");
      setError(null);
    }
  }, [open]);

  // ---------------------------------------------------------------------------
  // Validation + submit
  // ---------------------------------------------------------------------------

  function validate(): string | null {
    if (!name.trim()) return "Name is required.";
    if (!type) return "Type is required.";

    if (type === "company" && parent !== "root") {
      return 'A Company type must have no parent — set Parent to "— none (root) —".';
    }
    if (type !== "company" && parent === "root") {
      return "Only the Company type may be at root. Choose a parent company or team.";
    }
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
      if (parent === "root") {
        // Create a Company (Organization)
        const res = await fetch("/api/organizations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(
            Array.isArray(json.error)
              ? (json.error[0]?.message ?? "Failed to create company. Please try again.")
              : typeof json.error === "string"
              ? json.error
              : "Failed to create company. Please try again."
          );
          return;
        }
        onCreated({ kind: "organization", org: json.data as OrgSummary });
        onClose();
      } else if (parent.startsWith("org:")) {
        // Create a Team directly under a company
        const orgId = parent.slice(4); // strip "org:"
        const body: Record<string, unknown> = {
          name: name.trim(),
          type: type as string,
          parentTeamId: null,
        };
        if (description.trim()) body.description = description.trim();

        const res = await fetch(`/api/organizations/${orgId}/teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(
            Array.isArray(json.error)
              ? (json.error[0]?.message ?? "Failed to create team. Please try again.")
              : typeof json.error === "string"
              ? json.error
              : "Failed to create team. Please try again."
          );
          return;
        }
        onCreated({ kind: "team", team: json.data as Record<string, unknown>, orgId });
        onClose();
      } else {
        // parent starts with "team:<orgId>:<teamId>"
        const parts   = parent.slice(5).split(":"); // strip "team:"
        const orgId   = parts[0];
        const teamId  = parts[1];
        const body: Record<string, unknown> = {
          name: name.trim(),
          type: type as string,
          parentTeamId: teamId,
        };
        if (description.trim()) body.description = description.trim();

        const res = await fetch(`/api/organizations/${orgId}/teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(
            Array.isArray(json.error)
              ? (json.error[0]?.message ?? "Failed to create team. Please try again.")
              : typeof json.error === "string"
              ? json.error
              : "Failed to create team. Please try again."
          );
          return;
        }
        onCreated({ kind: "team", team: json.data as Record<string, unknown>, orgId });
        onClose();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Parent options: root + companies + their teams
  // ---------------------------------------------------------------------------

  const parentOptions: Array<{ value: string; label: string; indent: number }> = [
    { value: "root", label: "— none (root) —", indent: 0 },
  ];
  for (const org of organizations) {
    parentOptions.push({ value: `org:${org.id}`, label: org.name, indent: 0 });
    const teams = loadedTeams[org.id] ?? [];
    for (const t of flattenTeams(teams, org.id, 1)) {
      parentOptions.push({
        value: `team:${t.orgId}:${t.teamId}`,
        label: `${"  ".repeat(t.depth)}${t.name}`,
        indent: t.depth,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Team / Company</DialogTitle>
          <DialogDescription>
            Create a company, department, team, or folder.
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
                placeholder="e.g. Engineering"
                disabled={submitting}
                required
              />
            </div>

            {/* ---- Type ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={typeId}>Type *</Label>
              {/*
                We use a native <select> here so that jest/fireEvent.change works
                reliably in tests without @testing-library/user-event.
                Styled to match the rest of the UI.
              */}
              <select
                id={typeId}
                data-testid="select-type"
                value={type}
                onChange={(e) => setType(e.target.value as TeamType | "")}
                disabled={submitting}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>Select a type…</option>
                <option value="company">Company</option>
                <option value="department">Department</option>
                <option value="team">Team</option>
                <option value="folder">Folder</option>
              </select>
            </div>

            {/* ---- Parent ---- */}
            <div className="space-y-1.5">
              <Label htmlFor={parentId}>Parent</Label>
              <select
                id={parentId}
                data-testid="select-parent"
                value={parent}
                onChange={(e) => setParent(e.target.value as ParentValue)}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {parentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* ---- Description (optional, not sent for orgs; hidden when Type=Company) ---- */}
            {type !== "company" && (
              <div className="space-y-1.5">
                <Label htmlFor={descId}>Description</Label>
                <Textarea
                  id={descId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  disabled={submitting}
                  className="min-h-[72px] resize-none"
                />
              </div>
            )}

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
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
