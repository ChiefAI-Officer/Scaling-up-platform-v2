"use client";

/**
 * AccessGroups list client component — Wave 5 wireframe 21.
 *
 * Renders the INTERSECTION info banner, show-archived toggle, list table,
 * and the "New Access Group" creation dialog.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

interface AccessGroupRow {
  id: string;
  name: string;
  description: string | null;
  deletedAt: string | null;
  coachCount: number;
  templateCount: number;
  createdAt: string;
  updatedAt: string;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = now - t;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? "" : "s"} ago`;
  const year = Math.floor(day / 365);
  return `${year} year${year === 1 ? "" : "s"} ago`;
}

export function AccessGroupsList() {
  const router = useRouter();
  const { toast } = useToast();
  const [groups, setGroups] = useState<AccessGroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = showArchived ? "?includeArchived=true" : "";
      const res = await fetch(`/api/admin/access-groups${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        success: boolean;
        data: AccessGroupRow[];
      };
      setGroups(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const counts = useMemo(() => {
    let active = 0;
    let archived = 0;
    for (const g of groups) {
      if (g.deletedAt) archived++;
      else active++;
    }
    return { active, archived };
  }, [groups]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/access-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || null,
        }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data?: { id: string };
        error?: string;
      };
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast({
        title: "Access group created",
        description: createName,
      });
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      router.push(`/admin/assessments/access-groups/${body.data.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreateSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="wf-page-action-row">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="wf-btn wf-btn-primary"
        >
          + New Access Group
        </button>
      </div>

      {/* INTERSECTION info banner */}
      <div className="wf-intersection-banner">
        <p>
          <strong>Access Groups</strong> grant template access to coaches via
          INTERSECTION semantics. A coach in multiple groups sees only
          templates that <strong>ALL</strong> their groups grant.{" "}
          <code>ACCESS_POLICY_VERSION</code> runtime flag controls policy
          (current default: <code>v1.intersection</code>).
        </p>
      </div>

      <div className="flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <p className="text-xs text-muted-foreground">
          {counts.active} active
          {counts.archived > 0 ? ` · ${counts.archived} archived` : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Coaches</TableHead>
            <TableHead className="text-right">Templates</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {!loading && groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No access groups yet. Click <strong>+ New Access Group</strong>{" "}
                to create one.
              </TableCell>
            </TableRow>
          )}
          {groups.map((g) => {
            const archived = !!g.deletedAt;
            return (
              <TableRow key={g.id} className={archived ? "opacity-60" : ""}>
                <TableCell>
                  <Link
                    href={`/admin/assessments/access-groups/${g.id}`}
                    className={`text-primary hover:underline ${
                      archived ? "italic" : ""
                    }`}
                  >
                    {g.name}
                    {archived && " (Archived)"}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[28rem] truncate text-sm text-muted-foreground">
                  {g.description ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {archived ? "—" : g.coachCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {archived ? "—" : g.templateCount}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {archived ? "—" : formatRelative(g.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/admin/assessments/access-groups/${g.id}`}
                    className="text-primary hover:underline"
                    aria-label={`Manage ${g.name}`}
                  >
                    Manage ›
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New Access Group</DialogTitle>
              <DialogDescription>
                Coaches added to this group will see templates this group
                grants — intersected with their other groups.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="ag-name">Name</Label>
                <Input
                  id="ag-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="ag-description">Description (optional)</Label>
                <Textarea
                  id="ag-description"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createSubmitting || createName.trim().length === 0}
              >
                {createSubmitting ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
