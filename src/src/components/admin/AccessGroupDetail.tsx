"use client";

/**
 * AccessGroupDetail — Wave 5 wireframe 22 detail client component.
 *
 * Renders the group metadata card (with inline edit), coaches table with
 * Remove buttons (open the preview modal), templates table with Remove
 * buttons (open the preview modal), Add Coach + Add Template dialogs
 * (using the autocomplete components), and an Archive group button.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
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
import { CoachAutocomplete } from "@/components/admin/CoachAutocomplete";
import { TemplateAutocomplete } from "@/components/admin/TemplateAutocomplete";
import {
  AccessGroupPreviewModal,
  type PreviewTarget,
} from "@/components/admin/AccessGroupPreviewModal";

interface CoachMember {
  id: string;
  coachId: string;
  addedAt: string;
  addedBy: string;
  coach: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    certificationStatus: string | null;
  };
}

interface TemplateAccess {
  id: string;
  templateId: string;
  addedAt: string;
  template: {
    id: string;
    name: string;
    alias: string;
    aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  };
}

interface AccessGroupDetailData {
  id: string;
  name: string;
  description: string | null;
  accessPolicyVersion: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  creator: { id: string; email: string | null; name: string | null } | null;
  coachMembers: CoachMember[];
  templateAccess: TemplateAccess[];
}

interface Props {
  accessGroupId: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString();
}

export function AccessGroupDetail({ accessGroupId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<AccessGroupDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit metadata state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add coach dialog
  const [addCoachOpen, setAddCoachOpen] = useState(false);
  // Add template dialog
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);

  // Preview modal target
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);

  // Archive confirmation
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/access-groups/${encodeURIComponent(accessGroupId)}?includeArchived=true`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        success: boolean;
        data: AccessGroupDetailData;
      };
      setData(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [accessGroupId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const existingTemplateIds = useMemo(
    () => (data ? data.templateAccess.map((t) => t.templateId) : []),
    [data],
  );

  const openEdit = () => {
    if (!data) return;
    setEditName(data.name);
    setEditDescription(data.description ?? "");
    setEditError(null);
    setEditOpen(true);
  };

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch(
        `/api/admin/access-groups/${encodeURIComponent(accessGroupId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName.trim(),
            description: editDescription.trim() || null,
          }),
        },
      );
      const body = (await res.json()) as {
        success: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Group updated" });
      setEditOpen(false);
      await loadDetail();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleAddCoach(coachId: string) {
    try {
      const res = await fetch(
        `/api/admin/access-groups/${encodeURIComponent(accessGroupId)}/coaches`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coachId }),
        },
      );
      const body = (await res.json()) as {
        success: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Coach added" });
      setAddCoachOpen(false);
      await loadDetail();
    } catch (e) {
      toast({
        title: "Failed to add coach",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleAddTemplate(templateId: string) {
    try {
      const res = await fetch(
        `/api/admin/access-groups/${encodeURIComponent(accessGroupId)}/templates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId }),
        },
      );
      const body = (await res.json()) as {
        success: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Template added" });
      setAddTemplateOpen(false);
      await loadDetail();
    } catch (e) {
      toast({
        title: "Failed to add template",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function handleArchive() {
    setArchiveSubmitting(true);
    setArchiveError(null);
    try {
      const res = await fetch(
        `/api/admin/access-groups/${encodeURIComponent(accessGroupId)}/archive`,
        { method: "POST" },
      );
      const body = (await res.json()) as {
        success: boolean;
        error?: string;
      };
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Group archived" });
      router.push("/admin/access-groups");
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiveSubmitting(false);
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!data) return null;

  const isArchived = !!data.deletedAt;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{data.name}</h1>
            <Badge variant={isArchived ? "secondary" : "success"}>
              {isArchived ? "Archived" : "Active"}
            </Badge>
          </div>
          {data.description && (
            <p className="text-sm text-muted-foreground">{data.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEdit} disabled={isArchived}>
            Edit metadata
          </Button>
        </div>
      </header>

      {/* Metadata card */}
      <div className="rounded-lg border bg-card p-4 text-sm">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">ACCESS_POLICY_VERSION</dt>
            <dd>
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {data.accessPolicyVersion}
              </code>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Created by</dt>
            <dd className="text-muted-foreground">
              {data.creator?.email ?? data.createdBy}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Created at</dt>
            <dd className="text-muted-foreground">
              {formatTimestamp(data.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Updated at</dt>
            <dd className="text-muted-foreground">
              {formatTimestamp(data.updatedAt)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-foreground">Archived (deletedAt)</dt>
            <dd className="text-muted-foreground">
              {isArchived ? (
                formatTimestamp(data.deletedAt as string)
              ) : (
                <span className="italic">— not archived</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Coaches table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Coaches in this group ({data.coachMembers.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Removing a coach runs evaluateAccessChange against their
              remaining groups.
            </p>
          </div>
          <Button
            onClick={() => setAddCoachOpen(true)}
            disabled={isArchived}
            data-testid="add-coach-button"
          >
            + Add Coach
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.coachMembers.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No coaches in this group yet.
                </TableCell>
              </TableRow>
            )}
            {data.coachMembers.map((m) => {
              const name = [m.coach.firstName, m.coach.lastName]
                .filter((s) => s && s.length > 0)
                .join(" ")
                .trim();
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {name || "(no name)"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.coach.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestamp(m.addedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPreviewTarget({
                          kind: "REMOVE_COACH_FROM_GROUP",
                          accessGroupId,
                          coachId: m.coachId,
                          label: `Remove ${name || m.coach.email} from ${data.name}`,
                        })
                      }
                      disabled={isArchived}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {/* Templates table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Templates this group accesses ({data.templateAccess.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Removing a template runs evaluateAccessChange against ALL
              coaches in this group.
            </p>
          </div>
          <Button
            onClick={() => setAddTemplateOpen(true)}
            disabled={isArchived}
            data-testid="add-template-button"
          >
            + Add Template
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Alias</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.templateAccess.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No templates granted yet.
                </TableCell>
              </TableRow>
            )}
            {data.templateAccess.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  {t.template.name}
                  {t.template.aggregationMode === "CEO_ONLY" && (
                    <span
                      className="ml-1"
                      title="CEO_ONLY aggregation"
                      aria-label="CEO_ONLY aggregation"
                    >
                      👑
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.template.alias}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatTimestamp(t.addedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPreviewTarget({
                        kind: "REMOVE_TEMPLATE_FROM_GROUP",
                        accessGroupId,
                        templateId: t.templateId,
                        label: `Remove ${t.template.name} from ${data.name}`,
                      })
                    }
                    disabled={isArchived}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* Archive button */}
      {!isArchived && (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <h2 className="text-sm font-semibold text-foreground">Archive group</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Soft-deletes the group. Coach + template memberships are preserved
            but the group stops granting access until undeleted.
          </p>
          <div className="mt-3">
            <Button
              variant="destructive"
              onClick={() => setArchiveOpen(true)}
            >
              Archive group
            </Button>
          </div>
        </section>
      )}

      {/* Edit metadata dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form onSubmit={handleEditSave}>
            <DialogHeader>
              <DialogTitle>Edit access group</DialogTitle>
              <DialogDescription>
                Updates write an AuditLog entry with before/after values.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </div>
              {editError && (
                <p className="text-sm text-destructive">{editError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={editSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={editSubmitting || editName.trim().length === 0}
              >
                {editSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add coach dialog */}
      <Dialog open={addCoachOpen} onOpenChange={setAddCoachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add coach to {data.name}</DialogTitle>
            <DialogDescription>
              Search by name or email. The coach will see the INTERSECTION of
              templates granted by all groups they belong to.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <CoachAutocomplete
              excludeGroupId={accessGroupId}
              onSelect={(c) => handleAddCoach(c.id)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddCoachOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add template dialog */}
      <Dialog open={addTemplateOpen} onOpenChange={setAddTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add template to {data.name}</DialogTitle>
            <DialogDescription>
              Templates granted here are intersected with every other group
              each coach belongs to.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <TemplateAutocomplete
              excludeIds={existingTemplateIds}
              onSelect={(t) => handleAddTemplate(t.id)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddTemplateOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {data.name}?</DialogTitle>
            <DialogDescription>
              Coaches in this group will lose any template access granted only
              by this group. Memberships are preserved and can be restored by
              undeleting later.
            </DialogDescription>
          </DialogHeader>
          {archiveError && (
            <p className="text-sm text-destructive">{archiveError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveOpen(false)}
              disabled={archiveSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={archiveSubmitting}
            >
              {archiveSubmitting ? "Archiving…" : "Confirm archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview modal */}
      <AccessGroupPreviewModal
        open={previewTarget !== null}
        target={previewTarget}
        onClose={() => setPreviewTarget(null)}
        onConfirmed={async () => {
          const lbl = previewTarget?.label ?? "Change applied";
          setPreviewTarget(null);
          toast({ title: "Change applied", description: lbl });
          await loadDetail();
        }}
      />
    </div>
  );
}
