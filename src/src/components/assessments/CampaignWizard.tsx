"use client";

/**
 * Assessment v7.6 — Coach Campaign Wizard.
 *
 * Setup-first flip (Slice 1): coaches set up Company → Team → Users in the
 * Members lane FIRST, then a campaign PICKS an existing company + a subset
 * of its existing members. No inline create here.
 *
 * 5 steps:
 *   0. Pick an EXISTING organization (no inline-create; CTA to /portal/members
 *      when the coach has none yet).
 *   1. Pick template (INTERSECTION-filtered).
 *   2. Pick EXISTING participants (grouped by team) + manually mark a CEO.
 *   3. Schedule (name, openAt, endMode, closeAt).
 *   4. Review → "Save Draft" or "Create + Activate".
 *
 * Wiring:
 *   GET  /api/organizations
 *   GET  /api/assessment-templates
 *   GET  /api/organizations/[orgId]/teams
 *   GET  /api/organizations/[orgId]/respondents
 *   POST /api/assessment-campaigns
 *   POST /api/assessment-campaigns/[id]/participants
 *   POST /api/assessment-campaigns/[id]/activate
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Building2,
  Users,
  UserPlus,
} from "lucide-react";
import { isCEOFamily } from "@/lib/assessments/respondent-levels";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { AddMemberModal } from "@/components/organizations/add-member-modal";
import type { MemberCreatedResult } from "@/components/organizations/add-member-modal";

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

/**
 * API error fields come back as either a string or a Zod issues array
 * (`[{ message, path }]`). Reduce either to a single human-readable reason,
 * falling back to `fallback` when nothing useful is present.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim() !== "") return error;
  if (Array.isArray(error)) {
    const messages = error
      .map((issue) =>
        issue && typeof issue === "object" && "message" in issue
          ? String((issue as { message: unknown }).message)
          : "",
      )
      .filter((m) => m.trim() !== "");
    if (messages.length > 0) return messages.join("; ");
  }
  return fallback;
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
  roleType?: string | null;
}

/** Shape returned by GET /api/organizations/[id]/teams (nested tree). */
interface ApiTeamNode {
  id: string;
  organizationId: string;
  parentTeamId: string | null;
  name: string;
  type: string | null;
  description: string | null;
  children: ApiTeamNode[];
}

interface WizardState {
  step: number;
  organizationId: string;
  /** Display name of the selected org — tracked so ParticipantsStep can show
   *  the decision-#8 "adds to <orgName>'s roster" hint without an extra fetch.
   *  NOT persisted to the draft (ephemeral UI label only). */
  orgName: string;
  templateId: string;
  /** Display name of the selected template — shown on the Schedule step (#17).
   *  NOT persisted to the draft (ephemeral UI label only). */
  templateName: string;
  respondentIds: string[];
  ceoRespondentId: string | null;
  name: string;
  openAt: string; // datetime-local string
  endMode: EndMode;
  closeAt: string;
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
      orgName: "",
      templateId: "",
      templateName: "",
      respondentIds: [],
      ceoRespondentId: null,
      name: "",
      openAt: formatDateTimeLocal(tomorrow),
      endMode: "OPEN_END",
      closeAt: "",
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
          orgName: "", // ephemeral — not persisted; will re-populate when org is re-selected
          templateId: parsed.templateId ?? "",
          templateName: "", // ephemeral — not persisted; will re-populate when template is re-selected
          respondentIds: Array.isArray(parsed.respondentIds)
            ? parsed.respondentIds
            : [],
          ceoRespondentId: parsed.ceoRespondentId ?? null,
          name: parsed.name ?? "",
          openAt: parsed.openAt ?? state.openAt,
          endMode: parsed.endMode === "ENDS_AFTER" ? "ENDS_AFTER" : "OPEN_END",
          closeAt: parsed.closeAt ?? "",
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
    state.respondentIds.length > 0 &&
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
      // 1) Create campaign. Setup-first flip: participants are EXISTING
      // members picked in Step 2, so the create body no longer carries a
      // `bulkRespondents` array — the company + members already exist.
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
      // TODO: atomic create+participants — the create route does NOT accept
      // respondentIds/ceoRespondentId (only the deprecated bulkRespondents
      // create-new path), so picking EXISTING members requires this second
      // call. Until the create route grows a "pick-existing participants"
      // input, the campaign row exists before participants are attached, so a
      // failure here leaves a created-but-empty campaign. We surface that
      // partial state explicitly (below) rather than a generic error, and do
      // NOT delete-rollback.
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
        // The campaign WAS created — make the partial state understandable
        // instead of a generic "Could not save campaign" toast.
        const reason = extractErrorMessage(
          partBody.error,
          "the participants could not be added",
        );
        // Clear the auto-save draft: the campaign exists, so resuming the
        // wizard draft would create a duplicate. The coach finishes in the
        // campaign detail page.
        if (debounceRef.current) clearTimeout(debounceRef.current);
        try {
          await fetch(DRAFT_ENDPOINT, { method: "DELETE" });
        } catch {
          // best-effort; the campaign was already created
        }
        toast({
          title: "Campaign created, but adding participants failed",
          description: `${reason}. Open the campaign to add them.`,
          variant: "destructive",
        });
        router.push(`/portal/assessments/${campaignId}`);
        return;
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
            onChange={({ id, name }) =>
              setState((s) => {
                // Re-selecting the same org must NOT wipe a valid member
                // selection. Only on an actual company change do we clear the
                // picked members + CEO — otherwise their (other-company) ids
                // would persist and get rejected by /participants later,
                // leaving an orphaned empty campaign.
                if (s.organizationId === id) return s;
                return {
                  ...s,
                  organizationId: id,
                  orgName: name,
                  respondentIds: [],
                  ceoRespondentId: null,
                };
              })
            }
            onNext={next}
          />
        )}
        {state.step === 1 && (
          <TemplateStep
            value={state.templateId}
            onChange={(id, name) =>
              setState((s) => ({ ...s, templateId: id, templateName: name }))
            }
            onBack={back}
            onNext={next}
          />
        )}
        {state.step === 2 && (
          <ParticipantsStep
            organizationId={state.organizationId}
            orgName={state.orgName}
            respondentIds={state.respondentIds}
            ceoRespondentId={state.ceoRespondentId}
            onChange={(rIds, ceoId) => {
              setState((s) => ({
                ...s,
                respondentIds: rIds,
                ceoRespondentId: ceoId,
              }));
            }}
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
            templateName={state.templateName}
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
  onChange: (v: { id: string; name: string }) => void;
  onNext: () => void;
}) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Pick a company
        </h2>
        <p className="text-sm text-muted-foreground">
          Assessments are scoped to a single company you&apos;ve set up. Pick
          the one this campaign is for.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
        </div>
      ) : orgs.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-6 text-center space-y-3">
          <Building2 className="w-8 h-8 mx-auto text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            You haven&apos;t set up any companies yet. Create a company and add
            its people before you start a campaign.
          </div>
          <Link
            href="/portal/members"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Set up a company first
          </Link>
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
                onChange={() => onChange({ id: o.id, name: o.name })}
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
  onChange: (id: string, name: string) => void;
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
                onChange={() => onChange(t.id, t.name)}
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

/**
 * Internal CEO pick source discriminator.
 *   'auto'  — the system derived the CEO from a single CEO-family Level member
 *   'user'  — the coach explicitly clicked a CEO radio button
 *   null    — no CEO set
 */
type CeoPickSource = "auto" | "user" | null;

function ParticipantsStep({
  organizationId,
  orgName,
  respondentIds,
  ceoRespondentId,
  onChange,
  onBack,
  onNext,
}: {
  organizationId: string;
  /** Display name of the selected org — used for the quick-add modal hint. */
  orgName: string;
  respondentIds: string[];
  ceoRespondentId: string | null;
  onChange: (rIds: string[], ceoId: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [teams, setTeams] = useState<ApiTeamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Tracks whether the current ceoRespondentId was auto-derived (vs. user-clicked).
  const [ceoPickSource, setCeoPickSource] = useState<CeoPickSource>(null);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(false);
    try {
      // Fetch the team tree + all members for THIS company only. The picker
      // is strictly scoped to the selected org — other companies are never
      // requested or shown.
      const [teamsRes, respRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/teams`),
        fetch(`/api/organizations/${organizationId}/respondents`),
      ]);
      const teamsBody = await teamsRes.json();
      const respBody = await respRes.json();
      const teamsOk = teamsRes.ok && teamsBody.success;
      const respOk = respRes.ok && respBody.success;
      // BOTH fetches must succeed. If teams fails but members load, every
      // member would silently fall into the "Not associated with any team"
      // bucket — wrong grouping shown as correct. Surface the error (with the
      // same Retry affordance) instead.
      if (!teamsOk || !respOk) {
        setError(true);
        return;
      }
      setTeams(teamsBody.data as ApiTeamNode[]);
      setRespondents(respBody.data as Respondent[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── CEO-from-Level suggestion (decision #5) ───────────────────────────────
  // Runs whenever the selection or loaded member list changes. Only applies
  // when ceoPickSource !== 'user' (i.e., no deliberate user pick is in effect
  // for a still-selected member).
  useEffect(() => {
    if (loading || error) return;

    // If the user explicitly picked a CEO and that member is still selected,
    // their manual choice wins — do nothing.
    if (ceoPickSource === "user" && ceoRespondentId !== null && respondentIds.includes(ceoRespondentId)) {
      return;
    }

    // C = selected members whose roleType is in the CEO/Founder family.
    const ceoFamilySelected = respondentIds
      .map((id) => respondents.find((r) => r.id === id))
      .filter((r): r is Respondent => r !== undefined && isCEOFamily(r.roleType ?? null));

    if (ceoFamilySelected.length === 1) {
      // Exactly one CEO-family member selected → auto-suggest.
      const suggested = ceoFamilySelected[0].id;
      if (ceoRespondentId !== suggested || ceoPickSource !== "auto") {
        setCeoPickSource("auto");
        onChange(respondentIds, suggested);
      }
    } else {
      // 0 or >1 CEO-family members → clear auto-suggest.
      if (ceoPickSource === "auto" && ceoRespondentId !== null) {
        setCeoPickSource(null);
        onChange(respondentIds, null);
      } else if (ceoPickSource !== "user" && ceoRespondentId !== null && ceoFamilySelected.length === 0) {
        // The previously auto-set CEO is no longer selected at all.
        setCeoPickSource(null);
        onChange(respondentIds, null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respondentIds, respondents, loading, error]);

  function toggleRespondent(id: string, checked: boolean) {
    let next = respondentIds.slice();
    let ceo = ceoRespondentId;
    let pickSource = ceoPickSource;
    if (checked) {
      if (!next.includes(id)) next.push(id);
    } else {
      next = next.filter((r) => r !== id);
      if (ceo === id) {
        ceo = null;
        pickSource = null;
        setCeoPickSource(null);
      }
    }
    onChange(next, ceo);
    // If we just cleared an auto-pick via uncheck, the effect will re-run.
    // Keep pickSource in sync locally so the effect's guard sees the right state.
    void pickSource;
  }

  function setCEO(id: string) {
    // Explicit user click — mark as user pick.
    setCeoPickSource("user");
    if (!respondentIds.includes(id)) {
      // Auto-include if the coach marked CEO without checking the box first.
      onChange([...respondentIds, id], id);
    } else {
      onChange(respondentIds, id);
    }
  }

  /**
   * Called by AddMemberModal on successful create.
   *
   * Decision: we use the typed `created` payload returned directly from the
   * modal (rather than a re-fetch + email match) because:
   *  1. It's synchronous — no extra round-trip before we can check the id.
   *  2. The `created.id` is authoritative (from the DB response).
   *  3. The email-match approach would be ambiguous if the same email was
   *     somehow added twice (e.g., re-opened after a network timeout).
   *
   * We still re-fetch the full respondents list so the new member appears in
   * the picker with correct team grouping and full metadata. The auto-include
   * sets `respondentIds` immediately (before the re-fetch resolves) so the
   * CEO-suggestion useEffect fires on the next render with the new id already
   * in the selection.
   */
  async function handleMemberCreated(result: MemberCreatedResult) {
    const newId = result.created.id;
    // 1. Auto-include the new member.
    onChange([...respondentIds, newId], ceoRespondentId);
    // 2. Re-fetch so the picker row renders with correct metadata + team group.
    await refresh();
  }

  // Build ordered team groups (flattened, with depth) + an "unassigned"
  // bucket for members whose teamId is null or points at a team we don't
  // have. Members within a group keep the server order (lastName, firstName).
  const groups = useMemo(() => {
    const flat: Array<{ id: string; name: string; depth: number }> = [];
    const walk = (nodes: ApiTeamNode[], depth: number) => {
      for (const n of nodes) {
        flat.push({ id: n.id, name: n.name, depth });
        if (n.children?.length) walk(n.children, depth + 1);
      }
    };
    walk(teams, 0);

    const knownTeamIds = new Set(flat.map((t) => t.id));
    const byTeam = new Map<string, Respondent[]>();
    const unassigned: Respondent[] = [];
    for (const r of respondents) {
      if (r.teamId && knownTeamIds.has(r.teamId)) {
        const list = byTeam.get(r.teamId) ?? [];
        list.push(r);
        byTeam.set(r.teamId, list);
      } else {
        unassigned.push(r);
      }
    }

    const result: Array<{
      key: string;
      label: string;
      depth: number;
      members: Respondent[];
    }> = [];
    for (const t of flat) {
      const members = byTeam.get(t.id) ?? [];
      if (members.length > 0) {
        result.push({ key: t.id, label: t.name, depth: t.depth, members });
      }
    }
    if (unassigned.length > 0) {
      result.push({
        key: "__unassigned__",
        label: "Not associated with any team",
        depth: 0,
        members: unassigned,
      });
    }
    return result;
  }, [teams, respondents]);

  // Apply search filter: only keep members whose name or email contains the
  // search query (case-insensitive). Groups with no visible members are hidden.
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        members: g.members.filter(
          (r) =>
            `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.members.length > 0);
  }, [groups, searchQuery]);

  /** Toggle all currently-visible members of a group on or off. */
  function toggleSelectAll(groupKey: string, visibleIds: string[], selectAll: boolean) {
    let next = respondentIds.slice();
    if (selectAll) {
      for (const id of visibleIds) {
        if (!next.includes(id)) next.push(id);
      }
    } else {
      const visibleSet = new Set(visibleIds);
      next = next.filter((id) => !visibleSet.has(id));
    }
    // CEO is unchanged by Select-All; keep existing CEO if they're still in selection.
    const ceo = next.includes(ceoRespondentId ?? "") ? ceoRespondentId : null;
    if (ceo !== ceoRespondentId) setCeoPickSource(null);
    onChange(next, ceo);
  }

  function renderRow(r: Respondent) {
    const checked = respondentIds.includes(r.id);
    const isCEO = ceoRespondentId === r.id;
    const isAutoSuggested = isCEO && ceoPickSource === "auto";
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
        <div className="flex flex-col items-end gap-0.5">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="radio"
              name="ceo"
              checked={isCEO}
              onChange={() => setCEO(r.id)}
              className="accent-primary"
              aria-label={`Mark ${r.firstName} ${r.lastName} as CEO`}
            />
            CEO
          </label>
          {isAutoSuggested && (
            <span className="text-xs text-muted-foreground italic">
              Suggested by Level
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Pick participants
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose the existing members of this company who will take the
          assessment. Mark one as CEO if needed. Need to add someone?{" "}
          <Link href="/portal/members" className="text-primary hover:underline">
            Manage members
          </Link>
          .
        </p>
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setAddMemberOpen(true)}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add new member
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading members...
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-destructive" role="alert">
            Failed to load members.
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-primary underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : respondents.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-6 text-center space-y-3">
          <Users className="w-8 h-8 mx-auto text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            This company has no members yet. Add people to the company before
            you can pick participants.
          </div>
          <Link
            href="/portal/members"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Manage members
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            type="search"
            placeholder="Search members…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search members"
          />
          {filteredGroups.map((g) => {
            const visibleIds = g.members.map((m) => m.id);
            const selectedInGroup = visibleIds.filter((id) =>
              respondentIds.includes(id),
            );
            const allSelected =
              visibleIds.length > 0 &&
              selectedInGroup.length === visibleIds.length;
            return (
              <div
                key={g.key}
                className="border border-border rounded-lg overflow-hidden"
                data-testid={`participant-group-${g.key}`}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border"
                  style={{ paddingLeft: `${g.depth * 16 + 12}px` }}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) =>
                      toggleSelectAll(g.key, visibleIds, e.target.checked)
                    }
                    aria-label={`Select all ${g.label}`}
                    className="accent-primary"
                  />
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({g.members.length})
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {g.members.map(renderRow)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={onNext} disabled={respondentIds.length === 0}>
          Next <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Quick-add modal — creates the member in the org roster, then auto-includes them */}
      <AddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        onCreated={(result) => {
          // The modal calls onClose() itself after onCreated(), so we don't
          // need to close manually here. Just trigger the auto-include + re-fetch.
          void handleMemberCreated(result);
        }}
        orgId={organizationId}
        teams={teams}
        defaultTeamId={null}
        description={`Adds this person to ${orgName || "this company"}'s roster (not just this campaign).`}
      />
    </div>
  );
}

// ── Step 3 — Schedule ──────────────────────────────────────────────────

function ScheduleStep({
  name,
  openAt,
  endMode,
  closeAt,
  templateName,
  onChange,
  onBack,
  onNext,
}: {
  name: string;
  openAt: string;
  endMode: EndMode;
  closeAt: string;
  templateName: string;
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
        {templateName && (
          <p
            className="mt-2 text-sm text-muted-foreground"
            data-testid="schedule-template-name"
          >
            Assessment:{" "}
            <span className="font-medium text-foreground">{templateName}</span>
          </p>
        )}
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
