"use client";

/**
 * useVersionActions — ED3 (spec 19ae), Task 5.
 *
 * Headless owner of the editor's VERSION-lifecycle actions — publish and
 * duplicate — lifted VERBATIM out of `TabbedShell`. These are independent of
 * the draft document/save flow (they hit different routes, don't read the
 * dirty models, and duplicate hard-navigates), so per Codex C3 / grill G2
 * they live in their own hook, NOT inside `useTemplateEditorDraft`. Owns its
 * own router/toast + in-flight ids + the 422 `publishIssues` (the
 * PublishFailureModal is rendered by the view from these). MECHANICAL LIFT —
 * zero behavior change; pinned by the golden guard's publish/duplicate tests.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import type { PublishFailureIssue } from "@/components/admin/PublishFailureModal";
import type {
  TemplateEditorTabbedTemplate,
  TemplateEditorTabbedVersion,
} from "@/components/admin/template-editor/TabbedShell";

export function useVersionActions({
  template,
  version,
  isPublished,
}: {
  template: TemplateEditorTabbedTemplate;
  version: TemplateEditorTabbedVersion;
  isPublished: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  // ─── Publish (mirrors AssessmentTemplateDetail.handlePublish) ─────────
  // F5: handler accepts an explicit versionId so VersionsTab can publish
  // any draft row, not just the currently-edited version. Header button
  // calls it with the current version's id.
  const [publishingVersionId, setPublishingVersionId] = useState<
    string | null
  >(null);
  const publishing = publishingVersionId !== null;
  const [publishIssues, setPublishIssues] = useState<
    PublishFailureIssue[] | null
  >(null);
  const [duplicatingVersionId, setDuplicatingVersionId] = useState<
    string | null
  >(null);
  // ─── Wave ED8 (spec 19ak §2/§5) — version-lifecycle in-flight ids ─────────
  const [archivingVersionId, setArchivingVersionId] = useState<string | null>(
    null,
  );
  const [unarchivingVersionId, setUnarchivingVersionId] = useState<
    string | null
  >(null);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(
    null,
  );

  const handlePublishVersion = useCallback(
    async (versionId: string) => {
      if (publishingVersionId) return;
      const confirmed = window.confirm(
        "Publish this version? Once published, content is immutable.",
      );
      if (!confirmed) return;
      setPublishIssues(null);
      setPublishingVersionId(versionId);
      try {
        const res = await fetch(
          `/api/admin/assessment-templates/${template.id}/versions/${versionId}/publish`,
          { method: "POST" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (
            res.status === 422 &&
            Array.isArray(body?.issues) &&
            body.issues.every(
              (i: unknown) =>
                i !== null &&
                typeof i === "object" &&
                Array.isArray((i as { path?: unknown }).path) &&
                typeof (i as { message?: unknown }).message === "string",
            )
          ) {
            setPublishIssues(body.issues as PublishFailureIssue[]);
            return;
          }
          if (res.status === 409) {
            toast({
              title: "Already published",
              variant: "destructive",
            });
            router.refresh();
            return;
          }
          toast({
            title: "Could not publish",
            description:
              typeof body?.error === "string"
                ? body.error
                : "Please try again.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Version published" });
        router.refresh();
      } catch (e) {
        toast({
          title: "Could not publish",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setPublishingVersionId(null);
      }
    },
    [publishingVersionId, router, template.id, toast],
  );

  const handlePublish = useCallback(() => {
    if (isPublished) return;
    return handlePublishVersion(version.id);
  }, [handlePublishVersion, isPublished, version.id]);

  const handleDuplicateVersion = useCallback(
    async (sourceVersionId: string) => {
      if (duplicatingVersionId) return;
      setDuplicatingVersionId(sourceVersionId);
      try {
        const res = await fetch(
          `/api/admin/assessment-templates/${template.id}/versions/${sourceVersionId}/duplicate`,
          { method: "POST" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        toast({
          title: "New draft created",
          description: `v${body.data.versionNumber} — opening editor…`,
        });
        window.location.href = `/admin/assessments/templates/${template.id}/versions/${body.data.newVersionId}/edit`;
      } catch (e) {
        toast({
          title: "Could not duplicate version",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        });
        setDuplicatingVersionId(null);
      }
    },
    [duplicatingVersionId, template.id, toast],
  );

  // ─── Wave ED8 (spec 19ak §2) — archive / roll back ────────────────────────
  // POST .../archive. Serves BOTH the Active row's "Roll back…" (isActive) and
  // a Superseded row's plain "Archive" — the server just archives; the copy +
  // success title differ by isActive. The coded 409s map to human toasts.
  const handleArchiveVersion = useCallback(
    async (
      versionId: string,
      opts: {
        isActive: boolean;
        versionNumber: number;
        nextActiveVersionNumber: number | null;
      },
    ) => {
      if (archivingVersionId) return;
      const { isActive, versionNumber, nextActiveVersionNumber } = opts;
      const message = isActive
        ? `Roll back v${versionNumber}? v${versionNumber} will stop being used for new campaigns${
            nextActiveVersionNumber != null
              ? `; v${nextActiveVersionNumber} becomes Active`
              : ""
          }. Campaigns already running keep v${versionNumber}.`
        : `Archive v${versionNumber}? It stays available to campaigns that already used it; it will no longer appear as a published option.`;
      if (!window.confirm(message)) return;
      setArchivingVersionId(versionId);
      try {
        const res = await fetch(
          `/api/admin/assessment-templates/${template.id}/versions/${versionId}/archive`,
          { method: "POST" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = typeof body?.error === "string" ? body.error : "";
          if (code === "LAST_PUBLISHED_VERSION") {
            toast({
              title: "Can't archive the last published version",
              description: "New campaigns would have no version to use.",
              variant: "destructive",
            });
            return;
          }
          if (code === "ALREADY_ARCHIVED") {
            toast({ title: "Already archived", variant: "destructive" });
            router.refresh();
            return;
          }
          if (code === "NOT_PUBLISHED") {
            toast({
              title: "Drafts can't be archived",
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Could not archive",
            description: code || "Please try again.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: isActive ? "Rolled back" : "Version archived" });
        router.refresh();
      } catch (e) {
        toast({
          title: "Could not archive",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setArchivingVersionId(null);
      }
    },
    [archivingVersionId, router, template.id, toast],
  );

  // ─── Wave ED8 (spec 19ak §5) — unarchive ──────────────────────────────────
  // DELETE .../archive. When unarchiving would make this the newest active
  // version, the confirm spells out the Active-version consequence (§5).
  const handleUnarchiveVersion = useCallback(
    async (
      versionId: string,
      opts: { versionNumber: number; willBecomeActive: boolean },
    ) => {
      if (unarchivingVersionId) return;
      const { versionNumber, willBecomeActive } = opts;
      const message =
        `Unarchive v${versionNumber}?` +
        (willBecomeActive
          ? ` v${versionNumber} will become the Active version for new campaigns.`
          : "");
      if (!window.confirm(message)) return;
      setUnarchivingVersionId(versionId);
      try {
        const res = await fetch(
          `/api/admin/assessment-templates/${template.id}/versions/${versionId}/archive`,
          { method: "DELETE" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = typeof body?.error === "string" ? body.error : "";
          if (code === "NOT_ARCHIVED") {
            toast({ title: "Not archived", variant: "destructive" });
            router.refresh();
            return;
          }
          toast({
            title: "Could not unarchive",
            description: code || "Please try again.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Version unarchived" });
        router.refresh();
      } catch (e) {
        toast({
          title: "Could not unarchive",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setUnarchivingVersionId(null);
      }
    },
    [unarchivingVersionId, router, template.id, toast],
  );

  // ─── Wave ED8 (spec 19ak §2) — delete a draft version ─────────────────────
  // DELETE the version URL (draft-only server-side). On success, if the
  // deleted row is the version currently OPEN in this editor, hard-navigate to
  // the template page (the edit page just lost its row); otherwise refresh.
  const handleDeleteVersion = useCallback(
    async (versionId: string, opts: { versionNumber: number }) => {
      void opts;
      if (deletingVersionId) return;
      if (!window.confirm("Delete this draft? This cannot be undone.")) return;
      setDeletingVersionId(versionId);
      try {
        const res = await fetch(
          `/api/admin/assessment-templates/${template.id}/versions/${versionId}`,
          { method: "DELETE" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = typeof body?.error === "string" ? body.error : "";
          if (code === "ALREADY_PUBLISHED") {
            toast({
              title: "Published versions can't be deleted",
              variant: "destructive",
            });
            router.refresh();
            return;
          }
          if (code === "VERSION_IN_USE") {
            toast({
              title: "This version is in use by a campaign",
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Could not delete",
            description: code || "Please try again.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Draft deleted" });
        if (versionId === version.id) {
          // The current edit page just lost its row — hard-navigate away.
          window.location.href = `/admin/assessments/templates/${template.id}`;
        } else {
          router.refresh();
        }
      } catch (e) {
        toast({
          title: "Could not delete",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setDeletingVersionId(null);
      }
    },
    [deletingVersionId, router, template.id, version.id, toast],
  );

  return {
    publishingVersionId,
    duplicatingVersionId,
    publishing,
    publishIssues,
    setPublishIssues,
    handlePublishVersion,
    handlePublish,
    handleDuplicateVersion,
    // Wave ED8 (spec 19ak) — version-lifecycle actions.
    archivingVersionId,
    unarchivingVersionId,
    deletingVersionId,
    handleArchiveVersion,
    handleUnarchiveVersion,
    handleDeleteVersion,
  };
}
