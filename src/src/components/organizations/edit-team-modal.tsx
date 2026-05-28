"use client";

/**
 * EditTeamModal — edit a single OrgTeam (rename / change type / reparent /
 * edit description) + a destructive Delete affordance.
 *
 * SCHEMA INVARIANT
 * ─────────────────
 * Our schema distinguishes `Organization` (the company; no parent; no team
 * type) from `OrgTeam` (has `organizationId` + optional `parentTeamId`).
 * The schema CANNOT convert one to the other. Therefore on EDIT we enforce:
 *
 *   • Type may NOT change to "Company"  — Company is root-only AND Org-only.
 *     → "Company" is OMITTED from the Type <select> (visual + DOM-level).
 *     → Submit-time guard rejects if value is somehow "company".
 *
 *   • Parent may NOT change to root     — would hoist a sub-team to a company.
 *     → "— none (root) —" is OMITTED from the Parent <select>.
 *     → Submit-time guard rejects if parentTeamId is null/empty.
 *
 *   • Parent may NOT be the team itself or any of its descendants — cycle.
 *     → Those entries are excluded from the Parent options client-side
 *       (defense in depth; the API also returns 400 on cycle detection).
 *
 * Mirrors AddTeamModal conventions exactly:
 *   - Dialog + DialogDescription for a11y
 *   - native <select> with `data-testid` + linked <Label> via useId
 *   - submitting guard, setError(null) reset on open + on each attempt
 *   - res.ok && json.success checks
 *   - Array.isArray(json.error) ? json.error[0]?.message : ... unwrap
 *   - onUpdated callback + onClose
 *
 * API endpoints used:
 *   PATCH  /api/organizations/{orgId}/teams/{teamId}
 *   DELETE /api/organizations/{orgId}/teams/{teamId}   (409 when children exist)
 */

import React, { useState, useEffect, useId, useMemo } from "react";
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
import type { ApiTeamNode } from "./members-teams-view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Same vocabulary as AddTeamModal but the EDIT modal omits "company". */
export type EditableTeamType = "department" | "team" | "folder";

export interface EditTeamModalTeam {
  id: string;
  orgId: string;
  name: string;
  type?: string | null;
  description?: string | null;
  parentTeamId?: string | null;
}

export interface EditTeamModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful PATCH or DELETE so the parent can re-render.
   * May return a Promise — the modal awaits it before closing, keeping buttons
   * disabled throughout so the parent's refresh completes before the UI closes. */
  onUpdated: () => void | Promise<void>;
  /** The OrgTeam being edited. */
  team: EditTeamModalTeam;
  /**
   * The full flat list of teams in the same organization, for the Parent
   * picker. Caller is responsible for already excluding the editing team +
   * its descendants OR for passing all teams — this component excludes them
   * a second time, belt-and-suspenders.
   */
  teams: ApiTeamNode[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FlatTeamEntry = { teamId: string; name: string; depth: number };

/** Flatten a nested ApiTeamNode tree into a list for the Parent select. */
function flattenTeams(nodes: ApiTeamNode[], depth: number): FlatTeamEntry[] {
  const result: FlatTeamEntry[] = [];
  for (const n of nodes) {
    result.push({ teamId: n.id, name: n.name, depth });
    result.push(...flattenTeams(n.children, depth + 1));
  }
  return result;
}

/**
 * Collect the ids of `teamId` AND all of its descendants in the given tree.
 * If the team is not found in the tree (e.g. caller already pruned it), the
 * set is empty.
 */
function collectSubtreeIds(nodes: ApiTeamNode[], teamId: string): Set<string> {
  const out = new Set<string>();

  function findAndCollect(arr: ApiTeamNode[]): boolean {
    for (const n of arr) {
      if (n.id === teamId) {
        // Add self + every descendant under n.children
        out.add(n.id);
        const stack = [...n.children];
        while (stack.length) {
          const cur = stack.pop()!;
          out.add(cur.id);
          for (const c of cur.children) stack.push(c);
        }
        return true;
      }
      if (findAndCollect(n.children)) return true;
    }
    return false;
  }

  findAndCollect(nodes);
  return out;
}

/**
 * Helper exported for callers (members-teams-view) — returns a flat tree
 * pruned of the given team + its descendants. Kept here so all subtree
 * exclusion logic lives in one place.
 */
export function excludeTeamSubtree(
  nodes: ApiTeamNode[],
  teamId: string
): ApiTeamNode[] {
  function recurse(arr: ApiTeamNode[]): ApiTeamNode[] {
    const result: ApiTeamNode[] = [];
    for (const n of arr) {
      if (n.id === teamId) continue; // drop self + entire subtree
      result.push({ ...n, children: recurse(n.children) });
    }
    return result;
  }
  return recurse(nodes);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditTeamModal({
  open,
  onClose,
  onUpdated,
  team,
  teams,
}: EditTeamModalProps) {
  const nameId = useId();
  const typeId = useId();
  const parentId = useId();
  const descId = useId();

  // ---- Parent options: pruned of self + descendants + root ------------------
  // Computed first so the form-state initialiser can fall back to the first
  // valid parent when the current parentTeamId is null or excluded.
  const parentOptions = useMemo<FlatTeamEntry[]>(() => {
    const exclude = collectSubtreeIds(teams, team.id);
    return flattenTeams(teams, 0).filter((entry) => !exclude.has(entry.teamId));
  }, [teams, team.id]);

  const validParentValues = useMemo(
    () => new Set(parentOptions.map((o) => o.teamId)),
    [parentOptions]
  );

  /**
   * Choose the initial Parent <select> value.
   *  - "" (placeholder) when the team currently has no parent (root-level),
   *    so the user must consciously choose a parent before saving — prevents
   *    silent auto-reparent to the first sibling on rename-only edits.
   *  - team.parentTeamId if it is a valid (non-self, non-descendant) team
   *  - otherwise "" (no valid options OR stale parentTeamId → submit blocked
   *    by validate() which requires a non-empty parent)
   */
  function pickInitialParent(): string {
    if (!team.parentTeamId) {
      // Root-level team: start at the placeholder so the user must explicitly
      // choose a parent (prevents silent reparent on save).
      return "";
    }
    if (validParentValues.has(team.parentTeamId)) {
      return team.parentTeamId;
    }
    return "";
  }

  // ---- Form state -----------------------------------------------------------
  const [name, setName] = useState(team.name);
  const [type, setType] = useState<EditableTeamType | "">(
    (team.type as EditableTeamType | undefined) ?? ""
  );
  const [parent, setParent] = useState<string>(pickInitialParent());
  const [description, setDescription] = useState(team.description ?? "");
  /**
   * Track whether the team's initial type was null so we can show the
   * "no type set" helper without re-inspecting the live `type` state (which
   * the user may have already changed).  Reset on each modal open.
   */
  const [initialTypeWasNull, setInitialTypeWasNull] = useState(
    !team.type
  );

  // ---- Submission state -----------------------------------------------------
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the dialog opens (sync to new team prop)
  useEffect(() => {
    if (open) {
      setName(team.name);
      setType((team.type as EditableTeamType | undefined) ?? "");
      setParent(pickInitialParent());
      setDescription(team.description ?? "");
      setInitialTypeWasNull(!team.type);
      setError(null);
    }
    // pickInitialParent depends on team + parentOptions+validParentValues which
    // derive from teams. Intentionally exhaustive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team.id, team.name, team.type, team.parentTeamId, team.description, teams]);

  // ---------------------------------------------------------------------------
  // Validation + PATCH submit
  // ---------------------------------------------------------------------------

  function validate(): string | null {
    if (!name.trim()) return "Name is required.";
    if (!type) return "Type is required.";
    // Defense in depth: "company" is not in the Type <select>, but if it
    // somehow ended up in state we MUST block the submit.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((type as any) === "company") {
      return "An existing team cannot be changed to a Company. Create a new Company instead.";
    }
    // Parent may NOT be root: it must be a valid (non-self, non-descendant)
    // team in the same organization.
    if (!parent) {
      return "Parent is required — a team cannot be moved to root.";
    }
    if (!validParentValues.has(parent)) {
      return "Parent must be a different team in this organization.";
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
      const body: Record<string, unknown> = {
        name: name.trim(),
        type: type as string,
        description: description.trim() ? description.trim() : null,
        parentTeamId: parent,
      };

      const res = await fetch(
        `/api/organizations/${team.orgId}/teams/${team.id}`,
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
            ? json.error[0]?.message ?? "Failed to update team. Please try again."
            : typeof json.error === "string"
            ? json.error
            : "Failed to update team. Please try again."
        );
        return;
      }
      // Await the refresh callback before closing so the parent's data is up
      // to date and any refresh error is surfaced before the modal disappears.
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
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete() {
    setError(null);
    if (typeof window === "undefined") return;
    const confirmed = window.confirm(
      `Delete team "${team.name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/organizations/${team.orgId}/teams/${team.id}`,
        { method: "DELETE" }
      );
      // 409 path = team has child teams; surface a friendlier inline message.
      if (res.status === 409) {
        setError(
          "Cannot delete — this team has sub-teams. Move or delete them first."
        );
        return;
      }
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || (json && (json as { success?: boolean }).success === false)) {
        const errField = (json as { error?: unknown }).error;
        setError(
          Array.isArray(errField)
            ? (errField as Array<{ message?: string }>)[0]?.message ??
                "Failed to delete team. Please try again."
            : typeof errField === "string"
            ? errField
            : "Failed to delete team. Please try again."
        );
        return;
      }
      // Await the refresh callback before closing (same as handleSubmit).
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
          <DialogTitle>Edit Team</DialogTitle>
          <DialogDescription>
            Rename, reparent, or describe this team. A team cannot be promoted
            to a Company or moved to root.
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

            {/* ---- Type ---- (NO "Company" option) */}
            <div className="space-y-1.5">
              <Label htmlFor={typeId}>Type *</Label>
              <select
                id={typeId}
                data-testid="select-type"
                value={type}
                onChange={(e) => setType(e.target.value as EditableTeamType | "")}
                disabled={submitting}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>Select a type…</option>
                <option value="department">Department</option>
                <option value="team">Team</option>
                <option value="folder">Folder</option>
              </select>
              {/* I3: hint for legacy teams that were saved without a type */}
              {initialTypeWasNull && !type && (
                <p className="text-xs italic text-muted-foreground">
                  This team has no type set. Please assign one before saving.
                </p>
              )}
            </div>

            {/* ---- Parent ---- (NO root, NO self, NO descendants) */}
            <div className="space-y-1.5">
              <Label htmlFor={parentId}>Parent *</Label>
              <select
                id={parentId}
                data-testid="select-parent"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                disabled={submitting}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {/*
                  Always render the disabled placeholder so:
                  (a) root-level teams open with a visible "pick a parent" prompt
                      instead of silently landing on the first sibling.
                  (b) teams with no valid options also get a clear message.
                  The placeholder is shown as the selected option only when
                  parent === "" (controlled select).
                */}
                <option value="" disabled>
                  {parentOptions.length === 0
                    ? "No valid parent — cannot reparent here"
                    : "— select a parent (required) —"}
                </option>
                {parentOptions.map((opt) => (
                  <option key={opt.teamId} value={opt.teamId}>
                    {`${"  ".repeat(opt.depth)}${opt.name}`}
                  </option>
                ))}
              </select>
              {/* Inline hint — only shown when the team currently has no parent */}
              {!team.parentTeamId && (
                <p className="text-xs italic text-muted-foreground">
                  This team currently has no parent. Pick a parent before saving.
                </p>
              )}
            </div>

            {/* ---- Description (optional) ---- */}
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

          <DialogFooter className="mt-4 sm:justify-between">
            {/* Destructive action — left-aligned via flex parent */}
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={submitting}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Delete team
            </Button>
            <div className="flex items-center gap-2">
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
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
