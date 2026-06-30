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
import {
  DEFAULT_INVITATION_BODY,
  DEFAULT_INVITATION_SUBJECT,
} from "@/lib/assessments/invitation-defaults";
import type { CustomSlide } from "@/lib/assessments/custom-slides";
import {
  CustomSlidesPanel,
  type CustomSlidesPanelSection,
} from "@/components/assessments/CustomSlidesPanel";
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
  /** Computed server-side via isResultsEmailApproved. Controls #15 toggle gate. */
  resultsEmailApproved: boolean;
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
  // Task 12 (#20) — per-campaign FULL-HTML invitation body. Empty = fall back to the
  // markdown/template default. When set + flag on, REPLACES the entire branded email.
  invitationBodyHtml: string;
  // Task 6b — #15/#16 result/notify toggles.
  /** Whether the selected template has an approved results email (server-computed).
   *  Ephemeral — not persisted to the draft; re-evaluated when template is picked. */
  templateResultsEmailApproved: boolean;
  /** #15: Send each respondent their results email on submit. Gated on templateResultsEmailApproved. */
  sendResultsToRespondent: boolean;
  /** #16: Send coach a notification when a respondent completes. */
  notifyCoachOnCompletion: boolean;
  // Task 10 — #2/#3 timing radio.
  /** IMMEDIATELY: invitations send at creation (openAt forced to now by server).
   *  ON_OPEN: invitations send when campaign opens (openAt must be future). */
  inviteTiming: "IMMEDIATELY" | "ON_OPEN";
  // Wave M (#19) — coach-authored custom slides on this campaign. Static
  // sanitized HTML interstitials. Empty = none. NOT persisted to the draft
  // (slides are authored in-session; see persistDraft).
  customSlides: CustomSlide[];
  /** Resolved published versionId for the picked template — sent as
   *  `expectedVersionId` so the server anchor-validates against the same
   *  version the picker's sections came from. "" until resolved. */
  customSlidesVersionId: string;
  /** Sections of the resolved version — drives the "Before section" picker. */
  customSlidesSections: CustomSlidesPanelSection[];
}

interface StepDef {
  id: number;
  title: string;
}

/**
 * Build the ordered step list. The "Custom slides" step (Wave M) is inserted
 * before Review ONLY when the flag is on; step ids are assigned by position so
 * `state.step` stays a contiguous 0..N index whether or not the slides step is
 * present. Review is always the last step.
 */
function buildSteps(customSlidesEnabled: boolean): StepDef[] {
  const titles = [
    "Organization",
    "Template",
    "Participants",
    "Schedule",
    ...(customSlidesEnabled ? ["Custom slides"] : []),
    "Review",
  ];
  return titles.map((title, id) => ({ id, title }));
}

function StepIndicator({
  current,
  steps,
}: {
  current: number;
  steps: StepDef[];
}) {
  return (
    <ol className="wf-stepper">
      {steps.map((s) => {
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

export function CampaignWizard({
  customHtmlEmailEnabled = false,
  autoSend = false,
  resultsEmailEnabled = false,
  coachNotifyEnabled = false,
  customSlidesEnabled = false,
}: {
  /** Wave D #20 — gate the full-HTML invitation editor (mirrors the server flag). */
  customHtmlEmailEnabled?: boolean;
  /**
   * Wave D — gate the auto-send timing radio + the `inviteTiming` create-payload
   * field behind WAVE_D_AUTO_SEND_ENABLED (mirrors the server flag). When false
   * (the default merge state) the wizard takes the LEGACY path: no timing radio,
   * no `inviteTiming` sent, the coach's chosen `openAt` is shown + honored, and
   * the campaign is created DRAFT (the manual "Send Invitations" path works).
   */
  autoSend?: boolean;
  /**
   * Wave D FIX 2 — gate the #15 "Email each respondent their results" checkbox
   * behind WAVE_D_RESULTS_EMAIL_ENABLED (mirrors the server flag). When false
   * (the default merge state) the checkbox is hidden AND sendResultsToRespondent
   * is never sent true — otherwise the thank-you page would promise a results
   * email that the (flag-gated) send path never delivers.
   */
  resultsEmailEnabled?: boolean;
  /**
   * Wave D FIX 2 — gate the #16 "Email me when someone completes" checkbox
   * behind WAVE_D_COACH_NOTIFY_ENABLED (mirrors the server flag). When false,
   * the checkbox is hidden AND notifyCoachOnCompletion is never sent true.
   */
  coachNotifyEnabled?: boolean;
  /**
   * Wave M (#19) — gate the optional "Custom slides" step + the `customSlides`
   * create-payload field behind WAVE_M_CUSTOM_SLIDES_ENABLED (mirrors the
   * server flag, computed server-side with the GLOBAL gate since no campaign id
   * exists yet). When false (the default merge state) the step is absent AND
   * `customSlides`/`expectedVersionId` are never sent — the server also ignores
   * the field when its flag is off, so a stale client can't persist slides.
   */
  customSlidesEnabled?: boolean;
} = {}) {
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
      invitationBodyHtml: "",
      templateResultsEmailApproved: false,
      sendResultsToRespondent: false,
      notifyCoachOnCompletion: false,
      inviteTiming: "IMMEDIATELY" as const,
      customSlides: [],
      customSlidesVersionId: "",
      customSlidesSections: [],
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
          invitationBodyHtml:
            typeof parsed.invitationBodyHtml === "string"
              ? parsed.invitationBodyHtml
              : "",
          // Task 6b — not persisted to draft (approved state is re-derived from template);
          // toggles are persisted so a resumed draft keeps the user's choices.
          templateResultsEmailApproved: false,
          sendResultsToRespondent: parsed.sendResultsToRespondent === true,
          notifyCoachOnCompletion: parsed.notifyCoachOnCompletion === true,
          // Task 10 — inviteTiming defaults to IMMEDIATELY if not persisted.
          inviteTiming:
            parsed.inviteTiming === "ON_OPEN" ? "ON_OPEN" : "IMMEDIATELY",
          // Wave M — slides are authored in-session, not persisted to the draft.
          customSlides: [],
          customSlidesVersionId: "",
          customSlidesSections: [],
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

  // Wave M — the step list (and therefore Review's index + the clamp ceiling)
  // depends on whether the optional "Custom slides" step is present.
  const steps = useMemo(
    () => buildSteps(customSlidesEnabled),
    [customSlidesEnabled],
  );
  const lastStepIndex = steps.length - 1;
  const reviewStepIndex = lastStepIndex; // Review is always last.
  const slidesStepIndex = customSlidesEnabled ? reviewStepIndex - 1 : -1;

  const next = () =>
    setState((s) => {
      const updated = { ...s, step: Math.min(s.step + 1, lastStepIndex) };
      flushSave(updated);
      return updated;
    });
  const back = () =>
    setState((s) => {
      const updated = { ...s, step: Math.max(s.step - 1, 0) };
      flushSave(updated);
      return updated;
    });

  // Wave M — resolve the picked template's published version (id + sections)
  // so the slides step can show the "Before section" picker and post
  // `expectedVersionId`. Re-fetch whenever the template changes; if the
  // resolved version id changes, drop any now-stale `before-section` anchors
  // that no longer match a known section (the server would 400 them anyway).
  useEffect(() => {
    if (!customSlidesEnabled || !state.templateId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/assessment-templates/${state.templateId}/version-sections`,
        );
        const body = await res.json();
        if (cancelled) return;
        if (res.ok && body.success) {
          const versionId = String(body.data.versionId ?? "");
          const sections = (body.data.sections ??
            []) as CustomSlidesPanelSection[];
          const knownKeys = new Set(sections.map((s) => s.stableKey));
          setState((s) => ({
            ...s,
            customSlidesVersionId: versionId,
            customSlidesSections: sections,
            // Drop slides whose before-section anchor no longer resolves.
            customSlides:
              s.customSlidesVersionId === versionId
                ? s.customSlides
                : s.customSlides.filter(
                    (sl) =>
                      sl.position.kind !== "before-section" ||
                      knownKeys.has(sl.position.sectionStableKey),
                  ),
          }));
        }
      } catch {
        // best-effort; the slides step still renders (picker shows start/end
        // only), and the server re-validates on create.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customSlidesEnabled, state.templateId]);

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
      // When Wave D auto-send is active and the coach chooses the primary
      // create button, create+participant attach must be atomic. The create
      // route advances IMMEDIATELY campaigns out of DRAFT before returning, so
      // the follow-up DRAFT-only /participants endpoint would reject them.
      const attachParticipantsInCreate = autoSend && activate;

      // 1) Create campaign. Setup-first flip: participants are EXISTING
      // members picked in Step 2, so the create body never carries a
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
          // Task 12 (#20) — full-HTML body. Sent RAW (the server validates +
          // stores raw, then sanitizes at render). Only sent when the flag is
          // on AND non-empty; the server ignores it when its flag is off.
          invitationBodyHtml:
            customHtmlEmailEnabled && state.invitationBodyHtml.trim() !== ""
              ? state.invitationBodyHtml
              : undefined,
          // Task 6b — #15/#16 toggles. #15 is only meaningful when approved, but
          // the server re-validates at send time; we pass the user's intent through.
          // FIX 2 (dark-merge): when the corresponding flag is OFF the checkbox
          // is hidden, so its state stays false; we additionally force false here
          // so a stale persisted draft value can never sneak through as true and
          // make the thank-you page promise an email the send path won't deliver.
          sendResultsToRespondent: resultsEmailEnabled
            ? state.sendResultsToRespondent
            : false,
          notifyCoachOnCompletion: coachNotifyEnabled
            ? state.notifyCoachOnCompletion
            : false,
          // Task 10 — #2/#3 timing radio: tell server when to send invitations.
          // Gated on the auto-send flag (dark-merge fix): when auto-send is OFF
          // we MUST NOT send inviteTiming — sending it marks the create as a
          // "Wave-D create" (auto-send lifecycle), which with the flag off
          // strands the campaign at the manual /invite 409 gate. Omitting it
          // takes the legacy DRAFT create path (coach's openAt honored).
          // Also omit it for "Save as Draft": that button must stay on the
          // legacy DRAFT path even when the feature flag is on.
          inviteTiming: attachParticipantsInCreate
            ? state.inviteTiming
            : undefined,
          participantIds: attachParticipantsInCreate
            ? state.respondentIds
            : undefined,
          ceoRespondentId:
            attachParticipantsInCreate && state.ceoRespondentId
              ? state.ceoRespondentId
              : undefined,
          // Wave M (#19) — custom slides on the create payload. Only sent when
          // the flag is ON; the server also ignores the field when its flag is
          // off. `expectedVersionId` lets the server anchor-validate the slides
          // against the same version the picker's sections came from (a
          // publish-race between section-load and create ⇒ 400, never a silent
          // bad anchor). Sent RAW html — the server sanitizes on save.
          customSlides: customSlidesEnabled ? state.customSlides : undefined,
          expectedVersionId:
            customSlidesEnabled &&
            state.customSlides.length > 0 &&
            state.customSlidesVersionId !== ""
              ? state.customSlidesVersionId
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

      // 2) Add participants. Wave-D primary creates already attached them in
      // the create transaction, before auto-send emit. Legacy creates and
      // "Save as Draft" still use the DRAFT-only participant endpoint.
      if (!attachParticipantsInCreate) {
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
      }

      // 3) Optionally activate.
      if (activate && !attachParticipantsInCreate) {
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

      <StepIndicator current={state.step} steps={steps} />

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
            onChange={(id, name, resultsEmailApproved) =>
              setState((s) => ({
                ...s,
                templateId: id,
                templateName: name,
                templateResultsEmailApproved: resultsEmailApproved,
                // If the template changes and is no longer approved, clear #15.
                sendResultsToRespondent:
                  resultsEmailApproved ? s.sendResultsToRespondent : false,
              }))
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
            resultsEmailApproved={state.templateResultsEmailApproved}
            sendResultsToRespondent={state.sendResultsToRespondent}
            notifyCoachOnCompletion={state.notifyCoachOnCompletion}
            inviteTiming={state.inviteTiming}
            autoSend={autoSend}
            resultsEmailEnabled={resultsEmailEnabled}
            coachNotifyEnabled={coachNotifyEnabled}
            onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            onBack={back}
            onNext={next}
          />
        )}
        {customSlidesEnabled && state.step === slidesStepIndex && (
          <SlidesStep
            slides={state.customSlides}
            sections={state.customSlidesSections}
            onChange={(next) =>
              setState((s) => ({ ...s, customSlides: next }))
            }
            onBack={back}
            onNext={next}
          />
        )}
        {state.step === reviewStepIndex && (
          <ReviewStep
            state={state}
            submitting={submitting}
            onBack={back}
            onSaveDraft={() => saveCampaign({ activate: false })}
            onActivate={() => saveCampaign({ activate: true })}
            canActivate={Boolean(canActivate)}
            customHtmlEmailEnabled={customHtmlEmailEnabled}
            autoSend={autoSend}
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
  onChange: (id: string, name: string, resultsEmailApproved: boolean) => void;
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
                onChange={() => onChange(t.id, t.name, t.resultsEmailApproved)}
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
  resultsEmailApproved,
  sendResultsToRespondent,
  notifyCoachOnCompletion,
  inviteTiming,
  autoSend,
  resultsEmailEnabled,
  coachNotifyEnabled,
  onChange,
  onBack,
  onNext,
}: {
  name: string;
  openAt: string;
  endMode: EndMode;
  closeAt: string;
  templateName: string;
  resultsEmailApproved: boolean;
  sendResultsToRespondent: boolean;
  notifyCoachOnCompletion: boolean;
  inviteTiming: "IMMEDIATELY" | "ON_OPEN";
  /** Wave D auto-send flag — when false, hide the timing radio + show the
   *  legacy openAt picker (the inviteTiming state is ignored on the create). */
  autoSend: boolean;
  /** Wave D FIX 2 — gate the #15 results-email checkbox (mirrors server flag). */
  resultsEmailEnabled: boolean;
  /** Wave D FIX 2 — gate the #16 coach-notify checkbox (mirrors server flag). */
  coachNotifyEnabled: boolean;
  onChange: (patch: Partial<WizardState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Capture the current time once at mount. Because "is openAt in the past?"
  // only needs to be checked at the moment the user edits the field (not
  // continuously refreshed), a mount-time snapshot is correct and avoids the
  // react-hooks/purity lint error that firing Date.now() inside useMemo would
  // trigger.
  const [mountedAt] = useState(() => Date.now());

  const openAtParsed = openAt ? Date.parse(openAt) : NaN;
  const openAtInPast = useMemo(
    () =>
      inviteTiming === "ON_OPEN" &&
      !Number.isNaN(openAtParsed) &&
      openAtParsed <= mountedAt,
    [inviteTiming, openAtParsed, mountedAt],
  );

  const valid = useMemo(() => {
    if (!name.trim()) return false;
    if (!autoSend) {
      // Legacy path (auto-send OFF): the openAt picker is always shown and the
      // open date is required (matching origin/main). No future-only constraint.
      if (!openAt) return false;
    } else if (inviteTiming === "ON_OPEN") {
      if (!openAt) return false;
      if (openAtInPast) return false;
    }
    if (endMode === "ENDS_AFTER") {
      if (!closeAt) return false;
      const o = Date.parse(openAt);
      const c = Date.parse(closeAt);
      if (Number.isNaN(o) || Number.isNaN(c)) return false;
      if (c <= o) return false;
    }
    return true;
  }, [name, openAt, openAtInPast, inviteTiming, endMode, closeAt, autoSend]);

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

        {/* Task 10 — #2/#3: timing radio. Gated on the auto-send flag — hidden
            entirely when auto-send is OFF (dark merge), where the create takes
            the legacy DRAFT path and the openAt picker is always shown. */}
        {autoSend && (
          <div className="space-y-2">
            <Label>When to send invitations</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="inviteTiming"
                  checked={inviteTiming === "IMMEDIATELY"}
                  onChange={() => onChange({ inviteTiming: "IMMEDIATELY" })}
                  className="accent-primary"
                  aria-label="Immediately"
                />
                Immediately
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="inviteTiming"
                  checked={inviteTiming === "ON_OPEN"}
                  onChange={() => onChange({ inviteTiming: "ON_OPEN" })}
                  className="accent-primary"
                  aria-label="When the campaign opens"
                />
                When the campaign opens
              </label>
            </div>
            {inviteTiming === "IMMEDIATELY" && (
              <p className="text-xs text-muted-foreground" data-testid="immediately-note">
                Invitations send as soon as you create this campaign.
              </p>
            )}
          </div>
        )}

        {/* Auto-send OFF (legacy) OR auto-send ON + ON_OPEN → show the picker.
            Auto-send ON + IMMEDIATELY → openAt is forced to now server-side, so
            the picker is hidden (kept in DOM disabled for state continuity). */}
        {!autoSend || inviteTiming === "ON_OPEN" ? (
          <div className="space-y-2">
            <Label htmlFor="openAt">Opens at</Label>
            <Input
              id="openAt"
              type="datetime-local"
              value={openAt}
              onChange={(e) => onChange({ openAt: e.target.value })}
              required
            />
            {openAtInPast && (
              <p className="text-xs text-destructive" data-testid="openat-past-error">
                Open time must be in the future when scheduling invitations.
              </p>
            )}
          </div>
        ) : (
          <Input
            id="openAt"
            type="datetime-local"
            value={openAt}
            onChange={(e) => onChange({ openAt: e.target.value })}
            disabled
            aria-hidden="true"
            className="hidden"
          />
        )}

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

      {/* Task 6b — #15/#16 email toggles.
          FIX 2 (dark-merge): each checkbox is gated behind its own Wave-D flag.
          With a flag OFF the checkbox is hidden AND its field is forced false on
          the create (in saveCampaign) — so the thank-you page can never promise
          a results email the (flag-gated) send path won't actually deliver.
          The whole panel is hidden when BOTH flags are off. */}
      {(resultsEmailEnabled || coachNotifyEnabled) && (
        <div className="space-y-3 border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground">Email notifications</h3>

          {/* #15 — Respondent results email */}
          {resultsEmailEnabled && (
            <div className="space-y-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  id="sendResultsToRespondent"
                  type="checkbox"
                  checked={sendResultsToRespondent}
                  disabled={!resultsEmailApproved}
                  onChange={(e) =>
                    onChange({ sendResultsToRespondent: e.target.checked })
                  }
                  className="accent-primary w-4 h-4"
                  aria-label="Email each respondent their results"
                />
                <span className={`text-sm ${!resultsEmailApproved ? "text-muted-foreground" : "text-foreground"}`}>
                  Email each respondent their results
                </span>
              </label>
              {!resultsEmailApproved && (
                <p className="text-xs text-muted-foreground pl-7">
                  Results email not yet approved for this template — ask an admin.
                </p>
              )}
            </div>
          )}

          {/* #16 — Coach completion notify */}
          {coachNotifyEnabled && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="notifyCoachOnCompletion"
                type="checkbox"
                checked={notifyCoachOnCompletion}
                onChange={(e) =>
                  onChange({ notifyCoachOnCompletion: e.target.checked })
                }
                className="accent-primary w-4 h-4"
                aria-label="Email me when someone completes"
              />
              <span className="text-sm text-foreground">
                Email me when someone completes
              </span>
            </label>
          )}
        </div>
      )}

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

// ── Optional Step — Custom slides (Wave M #19) ──────────────────────────

function SlidesStep({
  slides,
  sections,
  onChange,
  onBack,
  onNext,
}: {
  slides: CustomSlide[];
  sections: CustomSlidesPanelSection[];
  onChange: (next: CustomSlide[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Custom slides
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            optional
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Add branded interstitial pages your participants see inside the
          assessment. Leave empty to skip.
        </p>
      </div>

      <CustomSlidesPanel value={slides} onChange={onChange} sections={sections} />

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={onNext}>
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
  customHtmlEmailEnabled = false,
  autoSend = false,
  onChange,
}: {
  state: WizardState;
  submitting: boolean;
  canActivate: boolean;
  onBack: () => void;
  onSaveDraft: () => void;
  onActivate: () => void;
  customHtmlEmailEnabled?: boolean;
  /** Wave D auto-send flag — drives the consequence-labeled activate button. */
  autoSend?: boolean;
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
                : "Optional — leave blank to send the default invitation shown below"}
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
              ,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                {"{{organizationName}}"}
              </code>
              ,{" "}
              <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                {"{{templateName}}"}
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
                placeholder={DEFAULT_INVITATION_SUBJECT}
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
                placeholder={DEFAULT_INVITATION_BODY}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="invitation-body-input"
              />
              <p className="text-[11px] text-muted-foreground">
                {state.invitationBodyMarkdown.length} / 5000 characters
              </p>
            </div>
            {customHtmlEmailEnabled && (
              <div className="space-y-1 border-t border-border pt-3">
                <label className="text-xs font-medium text-foreground">
                  Full custom HTML (advanced)
                </label>
                <p className="text-[11px] text-muted-foreground">
                  When set, this HTML <strong>replaces the entire branded
                  email</strong> (no template wrap). It must include the survey
                  link token{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                    {"{{invitationUrl}}"}
                  </code>{" "}
                  — either as a link <code className="text-[10px]">href</code> or
                  as plain text. The same merge tokens above are available.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".html,.htm,text/html"
                    className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-muted file:px-2 file:py-1 file:text-xs"
                    data-testid="invitation-html-file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const text =
                          typeof reader.result === "string" ? reader.result : "";
                        onChange({ invitationBodyHtml: text });
                      };
                      reader.readAsText(file);
                      // Reset so re-selecting the same file re-fires onChange.
                      e.target.value = "";
                    }}
                  />
                  {state.invitationBodyHtml.trim() !== "" && (
                    <button
                      type="button"
                      className="text-xs font-medium text-destructive hover:underline"
                      data-testid="invitation-html-clear"
                      onClick={() => onChange({ invitationBodyHtml: "" })}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  value={state.invitationBodyHtml}
                  onChange={(e) =>
                    onChange({ invitationBodyHtml: e.target.value })
                  }
                  maxLength={50000}
                  rows={10}
                  placeholder="Paste your full HTML email here, or upload an .html file above. Leave blank to use the body above."
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="invitation-html-input"
                />
                <p className="text-[11px] text-muted-foreground">
                  {state.invitationBodyHtml.length} / 50000 characters
                </p>
              </div>
            )}
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
            {!autoSend
              ? // Legacy path (auto-send OFF): create + activate the campaign;
                // invitations are sent later via the manual "Send Invitations".
                "Create campaign"
              : state.inviteTiming === "IMMEDIATELY"
                ? `Create & send ${state.respondentIds.length} invitation(s) now`
                : state.openAt
                  ? `Schedule for ${new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(state.openAt))}`
                  : "Schedule campaign"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CampaignWizard;
