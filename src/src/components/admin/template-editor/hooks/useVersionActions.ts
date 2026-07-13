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

  return {
    publishingVersionId,
    duplicatingVersionId,
    publishing,
    publishIssues,
    setPublishIssues,
    handlePublishVersion,
    handlePublish,
    handleDuplicateVersion,
  };
}
