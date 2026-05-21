"use client";

/**
 * Assessment v7.6 — Coach Campaign Wizard.
 *
 * 5 steps:
 *   0. Pick organization (or inline-create one).
 *   1. Pick template (INTERSECTION-filtered).
 *   2. Assign participants + CEO (or inline-create respondents).
 *   3. Schedule (name, openAt, endMode, closeAt).
 *   4. Review → "Save Draft" or "Create + Activate".
 *
 * Wiring:
 *   GET  /api/organizations
 *   POST /api/organizations
 *   GET  /api/assessment-templates
 *   GET  /api/organizations/[orgId]/respondents
 *   POST /api/organizations/[orgId]/respondents
 *   POST /api/assessment-campaigns
 *   POST /api/assessment-campaigns/[id]/participants
 *   POST /api/assessment-campaigns/[id]/activate
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, FileUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  parseRespondentCsv,
  type ParsedRow,
} from "@/lib/assessments/respondent-csv";

const DRAFT_ENDPOINT = "/api/assessment-campaign-drafts";
const DRAFT_DEBOUNCE_MS = 800;

type SaveStatus = "idle" | "saving" | "saved" | "error";

function relativeTimeFrom(d: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type EndMode = "OPEN_END" | "ENDS_AFTER";

interface Organization {
  id: string;
  name: string;
  externalId: string | null;
}

interface TemplateSummary {
  id: string;
  name: string;
  alias: string;
  description: string | null;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
}

interface Respondent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  teamId: string | null;
}

interface WizardState {
  step: number;
  organizationId: string;
  templateId: string;
  respondentIds: string[];
  ceoRespondentId: string | null;
  name: string;
  openAt: string; // datetime-local string
  endMode: EndMode;
  closeAt: string;
  // Task M — bulk CSV import staged in the wizard. Server-side
  // `POST /api/assessment-campaigns` accepts this alongside the singly-
  // assigned `respondentIds` and creates OrgRespondent rows after the
  // campaign exists. Skipped on resubmit (idempotent dedupe).
  bulkRespondents: ParsedRow[];
  // Task O UI — per-campaign invitation email overrides. Null/empty = fall back to template default.
  invitationSubject: string;
  invitationBodyMarkdown: string;
}

const STEPS = [
  { id: 0, title: "Organization" },
  { id: 1, title: "Template" },
  { id: 2, title: "Participants" },
  { id: 3, title: "Schedule" },
  { id: 4, title: "Review" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="wf-stepper">
      {STEPS.map((s) => {
        const done = current > s.id;
        const active = current === s.id;
        const itemCls = `wf-stepper-item${active ? " is-active" : ""}${
          done ? " is-done" : ""
        }`;
        return (
          <li key={s.id} className={itemCls}>
            <div className="wf-stepper-circle">
              {done ? <Check className="w-4 h-4" /> : s.id + 1}
            </div>
            <span className="wf-stepper-label">{s.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

function formatDateTimeLocal(d: Date): string {
  // yyyy-MM-ddTHH:mm in local time.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

export function CampaignWizard() {
  const router = useRouter();
  const { toast } = useToast();

  const [state, setState] = useState<WizardState>(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      step: 0,
      organizationId: "",
      templateId: "",
      respondentIds: [],
      ceoRespondentId: null,
      name: "",
      openAt: formatDateTimeLocal(tomorrow),
      endMode: "OPEN_END",
      closeAt: "",
      bulkRespondents: [],
      invitationSubject: "",
      invitationBodyMarkdown: "",
    };
  });

  const [submitting, setSubmitting] = useState(false);

  // ── Auto-save drafts (Task K) ──────────────────────────────────────────
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<{
    state: WizardState;
    lastSavedAt: Date;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef<boolean>(false);

  // Initial fetch — check for a resumable draft.
  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      try {
        const res = await fetch(DRAFT_ENDPOINT, { method: "GET" });
        if (!res.ok) {
          if (!cancelled) setDraftLoaded(true);
          return;
        }
        const body = await res.json();
        const draft = body?.data;
        if (!draft || !draft.stepsData) {
          if (!cancelled) setDraftLoaded(true);
          return;
        }
        let parsed: Partial<WizardState> | null = null;
        try {
          parsed = JSON.parse(draft.stepsData);
        } catch {
          // Bad JSON — wipe the row and start fresh.
          await fetch(DRAFT_ENDPOINT, { method: "DELETE" }).catch(() => {});
          if (!cancelled) setDraftLoaded(true);
          return;
        }
        if (!parsed || typeof parsed !== "object") {
          if (!cancelled) setDraftLoaded(true);
          return;
        }
        const merged: WizardState = {
          step: typeof draft.currentStep === "number" ? draft.currentStep : 0,
          organizationId: parsed.organizationId ?? "",
          templateId: parsed.templateId ?? "",
          respondentIds: Array.isArray(parsed.respondentIds)
            ? parsed.respondentIds
            : [],
          ceoRespondentId: parsed.ceoRespondentId ?? null,
          name: parsed.name ?? "",
          openAt: parsed.openAt ?? state.openAt,
          endMode: parsed.endMode === "ENDS_AFTER" ? "ENDS_AFTER" : "OPEN_END",
          closeAt: parsed.closeAt ?? "",
          bulkRespondents: Array.isArray(parsed.bulkRespondents)
            ? (parsed.bulkRespondents as ParsedRow[])
            : [],
          invitationSubject:
            typeof parsed.invitationSubject === "string"
              ? parsed.invitationSubject
              : "",
          invitationBodyMarkdown:
            typeof parsed.invitationBodyMarkdown === "string"
              ? parsed.invitationBodyMarkdown
              : "",
        };
        if (!cancelled) {
          setPendingDraft({
            state: merged,
            lastSavedAt: draft.lastSavedAt
              ? new Date(draft.lastSavedAt)
              : new Date(),
          });
          setDraftLoaded(true);
        }
      } catch {
        if (!cancelled) setDraftLoaded(true);
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistDraft = useCallback(async (snapshot: WizardState) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(DRAFT_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: snapshot.step,
          data: {
            organizationId: snapshot.organizationId,
            templateId: snapshot.templateId,
            respondentIds: snapshot.respondentIds,
            ceoRespondentId: snapshot.ceoRespondentId,
            name: snapshot.name,
            openAt: snapshot.openAt,
            endMode: snapshot.endMode,
            closeAt: snapshot.closeAt,
            bulkRespondents: snapshot.bulkRespondents,
          },
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setLastSavedAt(new Date());
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, []);

  // Debounced auto-save: when state changes (after the draft has been
  // loaded/handled), schedule a PUT in 800ms. Step transitions can flush
  // immediately via flushSave().
  useEffect(() => {
    if (!draftLoaded || pendingDraft) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persistDraft(state);
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state, draftLoaded, pendingDraft, persistDraft]);

  const flushSave = useCallback(
    (next: WizardState) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void persistDraft(next);
    },
    [persistDraft],
  );

  const resumeDraft = useCallback(() => {
    if (!pendingDraft) return;
    skipNextSaveRef.current = true;
    setState(pendingDraft.state);
    setLastSavedAt(pendingDraft.lastSavedAt);
    setSaveStatus("saved");
    setPendingDraft(null);
  }, [pendingDraft]);

  const discardDraft = useCallback(async () => {
    skipNextSaveRef.current = true;
    setPendingDraft(null);
    try {
      await fetch(DRAFT_ENDPOINT, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }, []);

  const update = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
      setState((s) => ({ ...s, [key]: value }));
    },
    [],
  );

  const next = () =>
    setState((s) => {
      const updated = { ...s, step: Math.min(s.step + 1, 4) };
      flushSave(updated);
      return updated;
    });
  const back = () =>
    setState((s) => {
      const updated = { ...s, step: Math.max(s.step - 1, 0) };
      flushSave(updated);
      return updated;
    });

  const canActivate =
    state.organizationId &&
    state.templateId &&
    (state.respondentIds.length > 0 ||
      state.bulkRespondents.length > 0) &&
    state.name &&
    state.openAt &&
    (state.endMode === "OPEN_END" || state.closeAt);

  async function saveCampaign({
    activate,
  }: {
    activate: boolean;
  }) {
    if (!canActivate) return;
    setSubmitting(true);
    try {
      // 1) Create campaign (Task M: include staged bulkRespondents so the
      // server creates the OrgRespondent rows in the same request — they
      // were parsed client-side from a CSV but couldn't be POSTed earlier
      // because the wizard hasn't created the Organization yet).
      const createRes = await fetch("/api/assessment-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name,
          templateId: state.templateId,
          organizationId: state.organizationId,
          openAt: new Date(state.openAt).toISOString(),
          endMode: state.endMode,
          closeAt:
            state.endMode === "ENDS_AFTER" && state.closeAt
              ? new Date(state.closeAt).toISOString()
              : null,
          bulkRespondents:
            state.bulkRespondents.length > 0
              ? state.bulkRespondents
              : undefined,
          invitationSubject:
            state.invitationSubject.trim() !== ""
              ? state.invitationSubject.trim()
              : undefined,
          invitationBodyMarkdown:
            state.invitationBodyMarkdown.trim() !== ""
              ? state.invitationBodyMarkdown.trim()
              : undefined,
        }),
      });
      const createBody = await createRes.json();
      if (!createRes.ok || !createBody.success) {
        throw new Error(
          typeof createBody.error === "string"
            ? createBody.error
            : "Failed to create campaign",
        );
      }
      const campaignId = createBody.data.id as string;

      // 2) Add participants.
      const partRes = await fetch(
        `/api/assessment-campaigns/${campaignId}/participants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            respondentIds: state.respondentIds,
            ceoRespondentId: state.ceoRespondentId ?? undefined,
          }),
        },
      );
      const partBody = await partRes.json();
      if (!partRes.ok || !partBody.success) {
        throw new Error(
          typeof partBody.error === "string"
            ? partBody.error
            : "Failed to assign participants",
        );
      }

      // 3) Optionally activate.
      if (activate) {
        const actRes = await fetch(
          `/api/assessment-campaigns/${campaignId}/activate`,
          { method: "POST" },
        );
        const actBody = await actRes.json();
        if (!actRes.ok || !actBody.success) {
          throw new Error(
            typeof actBody.error === "string"
              ? actBody.error
              : "Failed to activate campaign",
          );
        }
      }

      // Task K: clear the wizard auto-save draft now that the campaign exists.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        await fetch(DRAFT_ENDPOINT, { method: "DELETE" });
      } catch {
        // best-effort; the campaign was already created
      }

      toast({
        title: activate ? "Campaign activated" : "Campaign saved",
        description: activate
          ? "Your assessment campaign is now active."
          : "Saved as a draft. You can activate it later.",
      });
      router.push(`/portal/assessments/${campaignId}`);
    } catch (err) {
      toast({
        title: "Could not save campaign",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const saveIndicator = useMemo(() => {
    if (pendingDraft) return null;
    if (saveStatus === "saving") {
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Saving…
        </span>
      );
    }
    if (saveStatus === "saved" && lastSavedAt) {
      return (
        <span className="text-xs text-muted-foreground">
          Saved {relativeTimeFrom(lastSavedAt)}
        </span>
      );
    }
    if (saveStatus === "error") {
      return (
        <span className="text-xs text-destructive">
          Couldn’t save draft. Will retry on next change.
        </span>
      );
    }
    return null;
  }, [pendingDraft, saveStatus, lastSavedAt]);

  return (
    <div>
      {pendingDraft && (
        <div
          className="mb-6 border border-primary/30 bg-primary/5 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          role="status"
        >
          <div className="text-sm">
            <div className="font-medium text-foreground">
              Resume your draft?
            </div>
            <div className="text-muted-foreground">
              Last saved {relativeTimeFrom(pendingDraft.lastSavedAt)}.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void discardDraft()}
            >
              Discard
            </Button>
            <Button type="button" size="sm" onClick={resumeDraft}>
              Resume
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end mb-2 min-h-[20px]">
        {saveIndicator}
      </div>

      <StepIndicator current={state.step} />

      <div className="bg-card border border-border rounded-xl p-6 min-h-[400px]">
        {state.step === 0 && (
          <OrganizationStep
            value={state.organizationId}
            onChange={(v) => update("organizationId", v)}
            onNext={next}
          />
        )}
        {state.step === 1 && (
          <TemplateStep
            value={state.templateId}
            onChange={(v) => update("templateId", v)}
            onBack={back}
            onNext={next}
          />
        )}
        {state.step === 2 && (
          <ParticipantsStep
            organizationId={state.organizationId}
            respondentIds={state.respondentIds}
            ceoRespondentId={state.ceoRespondentId}
            bulkRespondents={state.bulkRespondents}
            onChange={(rIds, ceoId) => {
              setState((s) => ({
                ...s,
                respondentIds: rIds,
                ceoRespondentId: ceoId,
              }));
            }}
            onChangeBulk={(rows) =>
              setState((s) => ({ ...s, bulkRespondents: rows }))
            }
            onBack={back}
            onNext={next}
          />
        )}
        {state.step === 3 && (
          <ScheduleStep
            name={state.name}
            openAt={state.openAt}
            endMode={state.endMode}
            closeAt={state.closeAt}
            onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            onBack={back}
            onNext={next}
          />
        )}
        {state.step === 4 && (
          <ReviewStep
            state={state}
            submitting={submitting}
            onBack={back}
            onSaveDraft={() => saveCampaign({ activate: false })}
            onActivate={() => saveCampaign({ activate: true })}
            canActivate={Boolean(canActivate)}
            onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
          />
        )}
      </div>
    </div>
  );
}

// ── Step 0 — Organization ───────────────────────────────────────────────

function OrganizationStep({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/organizations");
      const body = await res.json();
      if (res.ok && body.success) {
        setOrgs(body.data as Organization[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          externalId: externalId.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Failed to create",
        );
      }
      setName("");
      setExternalId("");
      setShowCreate(false);
      onChange(body.data.id);
      await refresh();
    } catch (err) {
      toast({
        title: "Failed to create organization",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Pick an organization
        </h2>
        <p className="text-sm text-muted-foreground">
          Assessments are scoped to a single organization that you own.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
        </div>
      ) : orgs.length === 0 && !showCreate ? (
        <div className="text-sm text-muted-foreground">
          You don&apos;t have any organizations yet.{" "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setShowCreate(true)}
          >
            Create one
          </button>
          .
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map((o) => (
            <label
              key={o.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                value === o.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <input
                type="radio"
                name="org"
                value={o.id}
                checked={value === o.id}
                onChange={() => onChange(o.id)}
                className="accent-primary"
              />
              <div>
                <div className="font-medium text-foreground">{o.name}</div>
                {o.externalId && (
                  <div className="text-xs text-muted-foreground">
                    {o.externalId}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      {!showCreate ? (
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => setShowCreate(true)}
        >
          + New organization
        </button>
      ) : (
        <form
          onSubmit={handleCreate}
          className="border border-border rounded-lg p-4 space-y-3 bg-muted/30"
        >
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization name</Label>
            <Input
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgExt">External ID (optional)</Label>
            <Input
              id="orgExt"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="HUB-12345"
              maxLength={200}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </form>
      )}

      <div className="flex justify-end pt-4">
        <Button onClick={onNext} disabled={!value}>
          Next <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 1 — Template ──────────────────────────────────────────────────

function TemplateStep({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/assessment-templates");
        const body = await res.json();
        if (res.ok && body.success) {
          setTemplates(body.data as TemplateSummary[]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Pick a template
        </h2>
        <p className="text-sm text-muted-foreground">
          You can only see templates your access groups grant you.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No accessible templates. Ask an admin to add you to a group that
          grants the template you want.
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <label
              key={t.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                value === t.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <input
                type="radio"
                name="template"
                value={t.id}
                checked={value === t.id}
                onChange={() => onChange(t.id)}
                className="accent-primary mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-foreground">{t.name}</div>
                  {t.aggregationMode === "CEO_ONLY" && (
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      CEO only
                    </span>
                  )}
                </div>
                {t.description && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {t.description}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={onNext} disabled={!value}>
          Next <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 2 — Participants ──────────────────────────────────────────────

function ParticipantsStep({
  organizationId,
  respondentIds,
  ceoRespondentId,
  bulkRespondents,
  onChange,
  onChangeBulk,
  onBack,
  onNext,
}: {
  organizationId: string;
  respondentIds: string[];
  ceoRespondentId: string | null;
  bulkRespondents: ParsedRow[];
  onChange: (rIds: string[], ceoId: string | null) => void;
  onChangeBulk: (rows: ParsedRow[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(bulkRespondents.length > 0);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // Task M — live-parse the CSV textarea so the preview/error counters
  // update on every keystroke.
  const bulkParsed = useMemo(
    () => (bulkCsvText.trim().length > 0 ? parseRespondentCsv(bulkCsvText) : null),
    [bulkCsvText],
  );

  function applyParsedBulk() {
    if (!bulkParsed) return;
    if (bulkParsed.errors.length > 0) return;
    if (bulkParsed.rows.length === 0) return;
    onChangeBulk(bulkParsed.rows);
    setBulkCsvText("");
    toast({
      title: "Staged for import",
      description: `${bulkParsed.rows.length} respondent${bulkParsed.rows.length === 1 ? "" : "s"} will be created when you save the campaign.`,
    });
  }

  function clearStagedBulk() {
    onChangeBulk([]);
  }

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/respondents`);
      const body = await res.json();
      if (res.ok && body.success) {
        setRespondents(body.data as Respondent[]);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggleRespondent(id: string, checked: boolean) {
    let next = respondentIds.slice();
    let ceo = ceoRespondentId;
    if (checked) {
      if (!next.includes(id)) next.push(id);
    } else {
      next = next.filter((r) => r !== id);
      if (ceo === id) ceo = null;
    }
    onChange(next, ceo);
  }

  function setCEO(id: string) {
    if (!respondentIds.includes(id)) {
      // Auto-include if user clicked CEO without checking first.
      onChange([...respondentIds, id], id);
    } else {
      onChange(respondentIds, id);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/respondents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            jobTitle: jobTitle.trim() || undefined,
          }),
        },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Failed to create",
        );
      }
      // Auto-add the new respondent.
      onChange([...respondentIds, body.data.id], ceoRespondentId);
      setFirstName("");
      setLastName("");
      setEmail("");
      setJobTitle("");
      setShowCreate(false);
      await refresh();
    } catch (err) {
      toast({
        title: "Failed to add respondent",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Assign participants
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick the respondents who will take this assessment. Choose one as
          CEO if needed.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading respondents...
        </div>
      ) : respondents.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No respondents yet for this organization. Add one below.
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {respondents.map((r) => {
            const checked = respondentIds.includes(r.id);
            const isCEO = ceoRespondentId === r.id;
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleRespondent(r.id, e.target.checked)}
                  className="accent-primary"
                  aria-label={`Include ${r.firstName} ${r.lastName}`}
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium text-foreground">
                    {r.firstName} {r.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.email}
                    {r.jobTitle ? ` • ${r.jobTitle}` : ""}
                  </div>
                </div>
                <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="ceo"
                    checked={isCEO}
                    onChange={() => setCEO(r.id)}
                    className="accent-primary"
                  />
                  CEO
                </label>
              </div>
            );
          })}
        </div>
      )}

      {!showCreate ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => setShowCreate(true)}
          >
            + New respondent
          </button>
          <button
            type="button"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            onClick={() => setShowBulk((v) => !v)}
            data-testid="wizard-toggle-bulk-csv"
          >
            <FileUp className="w-3.5 h-3.5" />
            {showBulk ? "Hide bulk import" : "Bulk import from CSV"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleCreate}
          className="border border-border rounded-lg p-4 space-y-3 bg-muted/30"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={200}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={320}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jobTitle">Job title (optional)</Label>
            <Input
              id="jobTitle"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={creating || !firstName.trim() || !lastName.trim() || !email.trim()}
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Adding...
                </>
              ) : (
                "Add respondent"
              )}
            </Button>
          </div>
        </form>
      )}

      {showBulk && (
        <div
          className="border border-border rounded-lg p-4 space-y-3 bg-muted/20"
          data-testid="wizard-bulk-csv-panel"
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Bulk import respondents from CSV
            </h3>
            <p className="text-xs text-muted-foreground">
              Paste CSV with header row{" "}
              <code className="font-mono">name,email,team</code> (team
              optional, slash-delimited). Rows will be created with the
              campaign and skipped if the email already exists. Max 500
              rows.
            </p>
          </div>

          <textarea
            data-testid="wizard-bulk-csv-textarea"
            value={bulkCsvText}
            onChange={(e) => setBulkCsvText(e.target.value)}
            placeholder={`name,email,team\nAlice Example,alice@example.com,Marketing/Brand\nBob Tester,bob@example.com,`}
            rows={6}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {bulkParsed && (
            <div
              className="text-xs space-y-2"
              data-testid="wizard-bulk-csv-preview"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-foreground">
                  {bulkParsed.rows.length} valid row
                  {bulkParsed.rows.length === 1 ? "" : "s"}
                </span>
                {bulkParsed.errors.length > 0 && (
                  <span className="text-destructive font-medium">
                    {bulkParsed.errors.length} error
                    {bulkParsed.errors.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {bulkParsed.rows.length > 0 && (
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Name
                        </th>
                        <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Email
                        </th>
                        <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Team
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {bulkParsed.rows.slice(0, 10).map((row, i) => (
                        <tr key={`${row.email}-${i}`}>
                          <td className="px-2 py-1 text-foreground">
                            {row.name}
                          </td>
                          <td className="px-2 py-1 text-foreground font-mono">
                            {row.email}
                          </td>
                          <td className="px-2 py-1 text-muted-foreground">
                            {row.teamPath.length > 0
                              ? row.teamPath.join(" / ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bulkParsed.rows.length > 10 && (
                    <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/30 border-t border-border">
                      + {bulkParsed.rows.length - 10} more rows…
                    </div>
                  )}
                </div>
              )}

              {bulkParsed.errors.length > 0 && (
                <ul className="border border-destructive/40 rounded-md p-2 bg-destructive/5 max-h-40 overflow-y-auto space-y-1">
                  {bulkParsed.errors.slice(0, 20).map((e, i) => (
                    <li key={i} className="text-destructive">
                      Row {e.row}: {e.reason}
                    </li>
                  ))}
                  {bulkParsed.errors.length > 20 && (
                    <li className="text-destructive/80 italic">
                      + {bulkParsed.errors.length - 20} more errors…
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={applyParsedBulk}
              disabled={
                !bulkParsed ||
                bulkParsed.rows.length === 0 ||
                bulkParsed.errors.length > 0
              }
              data-testid="wizard-bulk-csv-apply"
            >
              Stage for import
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setBulkCsvText("")}
              disabled={bulkCsvText.length === 0}
            >
              Clear textarea
            </Button>
          </div>

          {bulkRespondents.length > 0 && (
            <div className="border-t border-border pt-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {bulkRespondents.length} respondent
                  {bulkRespondents.length === 1 ? "" : "s"} staged for
                  creation
                </span>
                <button
                  type="button"
                  onClick={clearStagedBulk}
                  className="text-destructive hover:underline"
                  data-testid="wizard-bulk-csv-clear-staged"
                >
                  Remove staged
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button
          onClick={onNext}
          disabled={
            respondentIds.length === 0 && bulkRespondents.length === 0
          }
        >
          Next <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 3 — Schedule ──────────────────────────────────────────────────

function ScheduleStep({
  name,
  openAt,
  endMode,
  closeAt,
  onChange,
  onBack,
  onNext,
}: {
  name: string;
  openAt: string;
  endMode: EndMode;
  closeAt: string;
  onChange: (patch: Partial<WizardState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const valid = useMemo(() => {
    if (!name.trim() || !openAt) return false;
    if (endMode === "ENDS_AFTER") {
      if (!closeAt) return false;
      const o = Date.parse(openAt);
      const c = Date.parse(closeAt);
      if (Number.isNaN(o) || Number.isNaN(c)) return false;
      if (c <= o) return false;
    }
    return true;
  }, [name, openAt, endMode, closeAt]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Schedule</h2>
        <p className="text-sm text-muted-foreground">
          When should this campaign open and close?
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cName">Campaign name</Label>
          <Input
            id="cName"
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Q3 Rockefeller Assessment"
            required
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="openAt">Opens at</Label>
          <Input
            id="openAt"
            type="datetime-local"
            value={openAt}
            onChange={(e) => onChange({ openAt: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>End</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="endMode"
                checked={endMode === "OPEN_END"}
                onChange={() => onChange({ endMode: "OPEN_END" })}
                className="accent-primary"
              />
              Open-ended
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="endMode"
                checked={endMode === "ENDS_AFTER"}
                onChange={() => onChange({ endMode: "ENDS_AFTER" })}
                className="accent-primary"
              />
              Ends at a specific time
            </label>
          </div>
        </div>

        {endMode === "ENDS_AFTER" && (
          <div className="space-y-2">
            <Label htmlFor="closeAt">Closes at</Label>
            <Input
              id="closeAt"
              type="datetime-local"
              value={closeAt}
              onChange={(e) => onChange({ closeAt: e.target.value })}
              required={endMode === "ENDS_AFTER"}
            />
            {closeAt && openAt && Date.parse(closeAt) <= Date.parse(openAt) && (
              <p className="text-xs text-destructive">
                Close time must be after open time.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={onNext} disabled={!valid}>
          Next <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 4 — Review ────────────────────────────────────────────────────

function ReviewStep({
  state,
  submitting,
  canActivate,
  onBack,
  onSaveDraft,
  onActivate,
  onChange,
}: {
  state: WizardState;
  submitting: boolean;
  canActivate: boolean;
  onBack: () => void;
  onSaveDraft: () => void;
  onActivate: () => void;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const [orgName, setOrgName] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);

  useEffect(() => {
    (async () => {
      // Org name
      if (state.organizationId) {
        const r = await fetch(`/api/organizations/${state.organizationId}`);
        const body = await r.json();
        if (r.ok && body.success) setOrgName(body.data.name);
      }
      // Template name
      if (state.templateId) {
        const r = await fetch("/api/assessment-templates");
        const body = await r.json();
        if (r.ok && body.success) {
          const t = (body.data as TemplateSummary[]).find(
            (x) => x.id === state.templateId,
          );
          if (t) setTemplateName(t.name);
        }
      }
      // Respondent details
      if (state.organizationId) {
        const r = await fetch(`/api/organizations/${state.organizationId}/respondents`);
        const body = await r.json();
        if (r.ok && body.success) {
          setRespondents(
            (body.data as Respondent[]).filter((x) =>
              state.respondentIds.includes(x.id),
            ),
          );
        }
      }
    })();
  }, [state.organizationId, state.templateId, state.respondentIds]);

  const ceo = respondents.find((r) => r.id === state.ceoRespondentId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Review</h2>
        <p className="text-sm text-muted-foreground">
          Confirm everything before saving.
        </p>
      </div>

      <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Campaign name</span>
          <span className="font-medium text-foreground text-right">{state.name}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Organization</span>
          <span className="font-medium text-foreground text-right">{orgName}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Template</span>
          <span className="font-medium text-foreground text-right">{templateName}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Participants</span>
          <span className="font-medium text-foreground text-right">
            {state.respondentIds.length}
            {ceo && (
              <span className="block text-xs text-muted-foreground">
                CEO: {ceo.firstName} {ceo.lastName}
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Opens</span>
          <span className="font-medium text-foreground text-right">{state.openAt}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Closes</span>
          <span className="font-medium text-foreground text-right">
            {state.endMode === "OPEN_END" ? "Open-ended" : state.closeAt}
          </span>
        </div>
      </div>

      {/* Task O UI — per-campaign invitation email overrides */}
      <div className="border border-border rounded-lg">
        <button
          type="button"
          onClick={() => setEmailPanelOpen((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
          data-testid="email-overrides-toggle"
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Customize invitation email
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state.invitationSubject.trim() ||
              state.invitationBodyMarkdown.trim()
                ? "Custom subject/body set for this campaign"
                : "Optional — leave blank to use the template default"}
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {emailPanelOpen ? "Hide" : "Edit"}
          </span>
        </button>
        {emailPanelOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Available tokens:{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                {"{{respondentFirstName}}"}
              </code>
              ,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                {"{{respondentFullName}}"}
              </code>
              ,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                {"{{campaignName}}"}
              </code>
              ,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                {"{{invitationUrl}}"}
              </code>
              ,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                {"{{closeAt}}"}
              </code>
              .
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Subject
              </label>
              <input
                type="text"
                value={state.invitationSubject}
                onChange={(e) =>
                  onChange({ invitationSubject: e.target.value })
                }
                maxLength={200}
                placeholder="Leave blank to use template default"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="invitation-subject-input"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Body (Markdown)
              </label>
              <textarea
                value={state.invitationBodyMarkdown}
                onChange={(e) =>
                  onChange({ invitationBodyMarkdown: e.target.value })
                }
                maxLength={5000}
                rows={8}
                placeholder="Leave blank to use template default"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="invitation-body-input"
              />
              <p className="text-[11px] text-muted-foreground">
                {state.invitationBodyMarkdown.length} / 5000 characters
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onSaveDraft}
            disabled={submitting || !canActivate}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Save as Draft
          </Button>
          <Button onClick={onActivate} disabled={submitting || !canActivate}>
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Create + Activate
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CampaignWizard;
