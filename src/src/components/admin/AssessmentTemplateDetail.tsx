"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  PublishFailureModal,
  type PublishFailureIssue,
} from "@/components/admin/PublishFailureModal";

interface VersionRow {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
  publishedBy: string | null;
  contentHash: string;
  createdAt: string;
}

interface TemplateDetail {
  id: string;
  name: string;
  alias: string;
  description: string | null;
  invitationSubject: string;
  invitationBodyMarkdown: string;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  createdAt: string;
  updatedAt: string;
  versions: VersionRow[];
}

export function AssessmentTemplateDetail({ templateId }: { templateId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [invitationSubject, setInvitationSubject] = useState("");
  const [invitationBodyMarkdown, setInvitationBodyMarkdown] = useState("");
  const [aggregationMode, setAggregationMode] = useState<
    "FULL_VISIBILITY" | "CEO_ONLY"
  >("FULL_VISIBILITY");
  const [saving, setSaving] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null);
  const [duplicatingVersionId, setDuplicatingVersionId] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<PublishFailureIssue[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/assessment-templates/${templateId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Template not found");
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as { success: boolean; data: TemplateDetail };
      setTemplate(body.data);
      setName(body.data.name);
      setDescription(body.data.description ?? "");
      setInvitationSubject(body.data.invitationSubject);
      setInvitationBodyMarkdown(body.data.invitationBodyMarkdown);
      setAggregationMode(body.data.aggregationMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/assessment-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || null,
          invitationSubject,
          invitationBodyMarkdown,
          aggregationMode,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({ title: "Template updated" });
      setEditing(false);
      await load();
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(sourceVersionId: string) {
    if (duplicatingVersionId) return;
    setDuplicatingVersionId(sourceVersionId);
    try {
      const res = await fetch(
        `/api/admin/assessment-templates/${templateId}/versions/${sourceVersionId}/duplicate`,
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
      window.location.href = `/admin/assessments/templates/${templateId}/versions/${body.data.newVersionId}/edit`;
    } catch (e) {
      toast({
        title: "Could not duplicate version",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
      setDuplicatingVersionId(null);
    }
  }

  async function handlePublish(versionId: string) {
    if (publishingVersionId) return;
    const confirmed = window.confirm(
      "Publish this version? Once published, content is immutable.",
    );
    if (!confirmed) return;
    setPublishingVersionId(versionId);
    try {
      const res = await fetch(
        `/api/admin/assessment-templates/${templateId}/versions/${versionId}/publish`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // E1.2: narrow modal scope — only publish-validation 422s open the
        // modal. 409 ALREADY_PUBLISHED gets a dedicated toast. Everything
        // else (500s, 401/403, 422-without-issues) falls through to the
        // generic toast.
        if (res.status === 422 && Array.isArray(body?.issues)) {
          setPublishIssues(body.issues as PublishFailureIssue[]);
          return;
        }
        if (res.status === 409) {
          toast({
            title: "Already published",
            variant: "destructive",
          });
          await load();
          return;
        }
        toast({
          title: "Could not publish",
          description:
            typeof body?.error === "string" ? body.error : "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Version published" });
      router.refresh();
      await load();
    } catch (e) {
      toast({
        title: "Could not publish",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPublishingVersionId(null);
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        Loading template…
      </div>
    );
  }
  if (error || !template) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/assessments/templates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="px-6 py-12 text-center text-sm text-destructive">
          {error || "Template not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/assessments/templates"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Templates
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{template.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {template.alias}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-muted"
            data-testid="edit-template-btn"
          >
            Edit metadata
          </button>
        )}
      </header>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Metadata</h2>
        {editing ? (
          <>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="edit-name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="edit-description"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Aggregation mode
              </label>
              <select
                value={aggregationMode}
                onChange={(e) =>
                  setAggregationMode(
                    e.target.value as "FULL_VISIBILITY" | "CEO_ONLY",
                  )
                }
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="edit-aggregation-mode"
              >
                <option value="FULL_VISIBILITY">FULL_VISIBILITY</option>
                <option value="CEO_ONLY">CEO_ONLY</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Invitation subject
              </label>
              <input
                type="text"
                value={invitationSubject}
                onChange={(e) => setInvitationSubject(e.target.value)}
                maxLength={200}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="edit-invitation-subject"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Invitation body (Markdown)
              </label>
              <textarea
                value={invitationBodyMarkdown}
                onChange={(e) => setInvitationBodyMarkdown(e.target.value)}
                rows={8}
                maxLength={5000}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="edit-invitation-body"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(template.name);
                  setDescription(template.description ?? "");
                  setInvitationSubject(template.invitationSubject);
                  setInvitationBodyMarkdown(template.invitationBodyMarkdown);
                  setAggregationMode(template.aggregationMode);
                }}
                disabled={saving}
                className="text-sm font-medium px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                data-testid="save-template-btn"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Description</dt>
              <dd className="text-foreground mt-0.5">
                {template.description || (
                  <span className="text-muted-foreground italic">none</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Aggregation mode</dt>
              <dd className="text-foreground mt-0.5">{template.aggregationMode}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Invitation subject</dt>
              <dd className="text-foreground mt-0.5">{template.invitationSubject}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">
                Invitation body (Markdown)
              </dt>
              <dd className="text-foreground mt-0.5 whitespace-pre-wrap text-xs font-mono bg-muted/30 border border-border rounded p-2 max-h-48 overflow-y-auto">
                {template.invitationBodyMarkdown}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Versions</h2>
          <p className="text-xs text-muted-foreground">
            Content is version-locked. Publishing a draft makes it immutable
            and available to coaches.
          </p>
        </div>
        {template.versions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No versions yet.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  v#
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Lang
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Content hash
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {template.versions.map((v) => (
                <tr
                  key={v.id}
                  className="hover:bg-muted/30 transition-colors"
                  data-testid={`version-row-${v.id}`}
                >
                  <td className="px-4 py-3 text-sm font-medium">{v.versionNumber}</td>
                  <td className="px-4 py-3 text-sm font-mono">{v.language}</td>
                  <td className="px-4 py-3 text-xs">
                    {v.publishedAt ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-success/10 text-success ring-1 ring-success/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Published
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground">
                    {v.contentHash.slice(0, 12)}…
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {!v.publishedAt && (
                        <Link
                          href={`/admin/assessments/templates/${templateId}/versions/${v.id}/edit`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted"
                          data-testid={`edit-version-${v.id}`}
                        >
                          Edit
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDuplicate(v.id)}
                        disabled={duplicatingVersionId !== null}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50"
                        data-testid={`duplicate-version-${v.id}`}
                      >
                        {duplicatingVersionId === v.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : null}
                        Duplicate
                      </button>
                      {!v.publishedAt && (
                        <button
                          type="button"
                          onClick={() => handlePublish(v.id)}
                          disabled={publishingVersionId !== null}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-border bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          data-testid={`publish-version-${v.id}`}
                        >
                          {publishingVersionId === v.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : null}
                          Publish
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PublishFailureModal
        open={publishIssues !== null}
        issues={publishIssues ?? []}
        onClose={() => setPublishIssues(null)}
      />
    </div>
  );
}
