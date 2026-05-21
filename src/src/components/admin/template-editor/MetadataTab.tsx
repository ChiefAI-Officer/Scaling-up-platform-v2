"use client";

/**
 * MetadataTab — F2 (Checkpoint 1b).
 *
 * Two-column body grid per WF16 lines 820-1100:
 *   LEFT (60%) — Template Metadata + Invitation Email + Results Email
 *   RIGHT (40%) — Sections card
 * + Version History strip below.
 *
 * Every label / helper text / variable-reference panel / toggle copy is
 * verbatim from WF16. Implementer must not deviate from the wireframe —
 * if WF looks wrong, STOP and ask.
 */

import React from "react";
import { SectionsCard, type SectionDraft } from "./SectionsCard";

// ────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────
export interface MetadataTabTemplate {
  id: string;
  name: string;
  alias: string;
  description: string | null;
  invitationSubject: string;
  invitationBodyMarkdown: string;
  resultsEmailSubject: string | null;
  resultsEmailBodyMarkdown: string | null;
  resultsEmailContentApproved: boolean;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  accessMode?: "INVITED" | "PUBLIC";
}

export interface MetadataTabVersion {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
}

export interface MetadataTabVersionMeta {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
}

export interface MetadataTabValues {
  // Template-level
  name: string;
  alias: string;
  description: string;
  invitationSubject: string;
  invitationBodyMarkdown: string;
  resultsEmailSubject: string;
  resultsEmailBodyMarkdown: string;
  resultsEmailContentApproved: boolean;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  // Version-level
  language: string;
}

export interface MetadataTabProps {
  values: MetadataTabValues;
  onTemplateFieldChange: (
    patch: Partial<Omit<MetadataTabValues, "language">>,
  ) => void;
  onVersionFieldChange: (patch: { language?: string }) => void;
  sections: SectionDraft[];
  questionCountByStableKey: Record<string, number>;
  onSectionsAdd: () => void;
  onSectionsRename: (uid: string, name: string) => void;
  onSectionsDelete: (uid: string) => void;
  onSectionsMoveUp: (uid: string) => void;
  onSectionsMoveDown: (uid: string) => void;
  onSectionsReorder?: (newOrderUids: string[]) => void;
  allVersions: MetadataTabVersionMeta[];
  currentVersionId: string;
  isReadOnly: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────
export function MetadataTab({
  values,
  onTemplateFieldChange,
  onVersionFieldChange,
  sections,
  questionCountByStableKey,
  onSectionsAdd,
  onSectionsRename,
  onSectionsDelete,
  onSectionsMoveUp,
  onSectionsMoveDown,
  onSectionsReorder,
  allVersions,
  currentVersionId,
  isReadOnly,
}: MetadataTabProps) {
  return (
    <div className="space-y-8">
      {/* ───────────────────── Two-column body grid ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        {/* ============== LEFT (60%) ============== */}
        <div className="space-y-6">
          {/* Card 1 — Template Metadata */}
          <TemplateMetadataCard
            values={values}
            onTemplateFieldChange={onTemplateFieldChange}
            onVersionFieldChange={onVersionFieldChange}
            isReadOnly={isReadOnly}
          />
          {/* Card 2 — Invitation Email */}
          <InvitationEmailCard
            subject={values.invitationSubject}
            body={values.invitationBodyMarkdown}
            onSubjectChange={(v) =>
              onTemplateFieldChange({ invitationSubject: v })
            }
            onBodyChange={(v) =>
              onTemplateFieldChange({ invitationBodyMarkdown: v })
            }
            isReadOnly={isReadOnly}
          />
          {/* Card 3 — Results Email */}
          <ResultsEmailCard
            subject={values.resultsEmailSubject}
            body={values.resultsEmailBodyMarkdown}
            contentApproved={values.resultsEmailContentApproved}
            onSubjectChange={(v) =>
              onTemplateFieldChange({ resultsEmailSubject: v })
            }
            onBodyChange={(v) =>
              onTemplateFieldChange({ resultsEmailBodyMarkdown: v })
            }
            onContentApprovedChange={(v) =>
              onTemplateFieldChange({ resultsEmailContentApproved: v })
            }
            isReadOnly={isReadOnly}
          />
        </div>

        {/* ============== RIGHT (40%) ============== */}
        <div>
          <SectionsCard
            sections={sections}
            questionCountByStableKey={questionCountByStableKey}
            onAdd={onSectionsAdd}
            onRename={onSectionsRename}
            onDelete={onSectionsDelete}
            onMoveUp={onSectionsMoveUp}
            onMoveDown={onSectionsMoveDown}
            onReorder={onSectionsReorder}
            isReadOnly={isReadOnly}
            layout="compact"
          />
        </div>
      </div>

      {/* ───────────────────── Version History strip ───────────────────── */}
      <VersionHistoryStrip
        allVersions={allVersions}
        currentVersionId={currentVersionId}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────
interface TemplateMetadataCardProps {
  values: MetadataTabValues;
  onTemplateFieldChange: (
    patch: Partial<Omit<MetadataTabValues, "language">>,
  ) => void;
  onVersionFieldChange: (patch: { language?: string }) => void;
  isReadOnly: boolean;
}

function TemplateMetadataCard({
  values,
  onTemplateFieldChange,
  onVersionFieldChange,
  isReadOnly,
}: TemplateMetadataCardProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <h3 className="text-base font-semibold text-foreground">
        Template Metadata
      </h3>
      <div className="space-y-1.5">
        <label
          htmlFor="tpl-name"
          className="block text-xs font-medium text-foreground"
        >
          Name
        </label>
        <input
          id="tpl-name"
          type="text"
          value={values.name}
          onChange={(e) => onTemplateFieldChange({ name: e.target.value })}
          disabled={isReadOnly}
          className={inputCls}
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="tpl-alias"
          className="block text-xs font-medium text-foreground"
        >
          Alias
        </label>
        <input
          id="tpl-alias"
          type="text"
          value={values.alias}
          onChange={(e) => onTemplateFieldChange({ alias: e.target.value })}
          disabled={isReadOnly}
          className={inputCls}
        />
        <span className="block text-[0.6875rem] text-muted-foreground">
          Used in URLs. Lowercase, no spaces.
        </span>
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="tpl-description"
          className="block text-xs font-medium text-foreground"
        >
          Description
        </label>
        <textarea
          id="tpl-description"
          rows={3}
          value={values.description}
          onChange={(e) =>
            onTemplateFieldChange({ description: e.target.value })
          }
          disabled={isReadOnly}
          className={textareaCls}
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="tpl-language"
          className="block text-xs font-medium text-foreground"
        >
          Language (this version)
        </label>
        <select
          id="tpl-language"
          value={values.language}
          onChange={(e) =>
            onVersionFieldChange({ language: e.target.value })
          }
          disabled={isReadOnly}
          className={selectCls}
        >
          <option value="en-US">en-US</option>
          <option value="en-GB">en-GB</option>
          <option value="es-ES">es-ES</option>
          <option value="fr-FR">fr-FR</option>
        </select>
      </div>
      <AccessModeRadioGroup isReadOnly={isReadOnly} />
      <AggregationModeRadioGroup
        value={values.aggregationMode}
        onChange={(v) => onTemplateFieldChange({ aggregationMode: v })}
        isReadOnly={isReadOnly}
      />
    </section>
  );
}

// ─── Access Mode read-only display (Gap A) ──────────────────────────────
function AccessModeRadioGroup({ isReadOnly }: { isReadOnly: boolean }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-foreground">
        Access Mode
      </span>
      <div
        role="radiogroup"
        aria-label="Access mode"
        className="grid grid-cols-1 md:grid-cols-2 gap-2"
      >
        <label
          className="flex items-start gap-2 rounded border border-primary bg-primary/5 p-3 cursor-default"
          aria-disabled="true"
        >
          <input
            type="radio"
            name="access-mode"
            value="INVITED"
            checked
            readOnly
            disabled={isReadOnly}
            className="mt-0.5"
            aria-label="INVITED"
          />
          <span className="space-y-0.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.625rem] font-semibold bg-primary/10 text-primary">
              INVITED
            </span>
            <span className="block text-[0.6875rem] text-muted-foreground">
              Magic-link invite per respondent, attributable.
            </span>
          </span>
        </label>
        <label
          className="flex items-start gap-2 rounded border border-border bg-muted/40 p-3 opacity-60 cursor-not-allowed"
          title="v1 PUBLIC mode is hardcoded for Website Assessment templates only"
        >
          <input
            type="radio"
            name="access-mode"
            value="PUBLIC"
            disabled
            className="mt-0.5"
            aria-label="PUBLIC"
          />
          <span className="space-y-0.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.625rem] font-semibold bg-muted text-muted-foreground">
              PUBLIC
            </span>
            <span className="block text-[0.6875rem] text-muted-foreground">
              v1 PUBLIC mode is hardcoded for Website Assessment; admin-authored
              PUBLIC templates ship v2.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

// ─── Aggregation Mode radio group ────────────────────────────────────────
function AggregationModeRadioGroup({
  value,
  onChange,
  isReadOnly,
}: {
  value: "FULL_VISIBILITY" | "CEO_ONLY";
  onChange: (v: "FULL_VISIBILITY" | "CEO_ONLY") => void;
  isReadOnly: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-foreground">
        Aggregation Mode
      </span>
      <div
        role="radiogroup"
        aria-label="Aggregation mode"
        className="grid grid-cols-1 md:grid-cols-2 gap-2"
      >
        <label
          className={`flex items-start gap-2 rounded border p-3 ${
            value === "FULL_VISIBILITY"
              ? "border-primary bg-primary/5"
              : "border-border"
          } ${isReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <input
            type="radio"
            name="aggregation-mode"
            value="FULL_VISIBILITY"
            checked={value === "FULL_VISIBILITY"}
            onChange={() => onChange("FULL_VISIBILITY")}
            disabled={isReadOnly}
            className="mt-0.5"
            aria-label="FULL_VISIBILITY"
          />
          <span className="space-y-0.5">
            <span className="block text-xs font-semibold text-foreground">
              FULL_VISIBILITY
            </span>
            <span className="block text-[0.6875rem] text-muted-foreground">
              All viewers see per-respondent rows.
            </span>
          </span>
        </label>
        <label
          className={`flex items-start gap-2 rounded border p-3 ${
            value === "CEO_ONLY"
              ? "border-primary bg-primary/5"
              : "border-border"
          } ${isReadOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <input
            type="radio"
            name="aggregation-mode"
            value="CEO_ONLY"
            checked={value === "CEO_ONLY"}
            onChange={() => onChange("CEO_ONLY")}
            disabled={isReadOnly}
            className="mt-0.5"
            aria-label="CEO_ONLY"
          />
          <span className="space-y-0.5">
            <span className="block text-xs font-semibold text-foreground">
              CEO_ONLY
            </span>
            <span className="block text-[0.6875rem] text-muted-foreground">
              Non-CEO respondents see only their own row; CEO sees own + team
              aggregate (no per-respondent rows). v7.5 — Scaling Up Assessment
              uses this mode.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

// ─── Invitation Email card ───────────────────────────────────────────────
const INVITATION_VARS = [
  "{{respondentFirstName}}",
  "{{respondentLastName}}",
  "{{campaignName}}",
  "{{templateName}}",
  "{{invitationUrl}}",
  "{{closeAt}}",
  "{{coachName}}",
  "{{orgName}}",
];

function InvitationEmailCard({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  isReadOnly,
}: {
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  isReadOnly: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <h3 className="text-base font-semibold text-foreground">
        Invitation Email
      </h3>
      <div className="space-y-1.5">
        <label
          htmlFor="inv-subject"
          className="block text-xs font-medium text-foreground"
        >
          Subject
        </label>
        <input
          id="inv-subject"
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          disabled={isReadOnly}
          className={inputCls}
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="inv-body"
          className="block text-xs font-medium text-foreground"
        >
          Body (Markdown)
        </label>
        <textarea
          id="inv-body"
          rows={6}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          disabled={isReadOnly}
          className={textareaCls + " font-mono text-xs"}
        />
        <div className="flex flex-wrap items-center gap-1 mt-2 p-2 rounded bg-muted/40 border border-border">
          <strong className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mr-1">
            Available variables
          </strong>
          {INVITATION_VARS.map((v) => (
            <code
              key={v}
              className="text-[0.6875rem] font-mono px-1.5 py-0.5 rounded bg-background text-foreground border border-border"
            >
              {v}
            </code>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Results Email card (F0 fields) ──────────────────────────────────────
const RESULTS_VARS = [
  "{{respondentFirstName}}",
  "{{templateName}}",
  "{{tierLabel}}",
  "{{tierMessage}}",
  "{{perSectionList}}",
];

function ResultsEmailCard({
  subject,
  body,
  contentApproved,
  onSubjectChange,
  onBodyChange,
  onContentApprovedChange,
  isReadOnly,
}: {
  subject: string;
  body: string;
  contentApproved: boolean;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onContentApprovedChange: (v: boolean) => void;
  isReadOnly: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          Results Email
        </h3>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.625rem] font-bold uppercase tracking-wider bg-warning/20 text-warning">
          v7.5
        </span>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">
        Content-flagged behind{" "}
        <code className="font-mono px-1 py-0.5 rounded bg-muted">
          INVITED_RESULTS_EMAIL_COPY_APPROVED
        </code>
        . Email contains respondent&apos;s own individual result only — never
        team aggregate or others&apos; data (anonymity constraint).
      </p>

      <div className="space-y-1.5">
        <label
          htmlFor="res-subject"
          className="block text-xs font-medium text-foreground"
        >
          Subject
        </label>
        <input
          id="res-subject"
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Your {{templateName}} results"
          disabled={isReadOnly}
          className={inputCls}
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="res-body"
          className="block text-xs font-medium text-foreground"
        >
          Body (Markdown)
        </label>
        <textarea
          id="res-body"
          rows={5}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Hi {{respondentFirstName}}, your results are ready."
          disabled={isReadOnly}
          className={textareaCls + " font-mono text-xs"}
        />
        <div className="flex flex-wrap items-center gap-1 mt-2 p-2 rounded bg-muted/40 border border-border">
          <strong className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mr-1">
            Available variables (results email only)
          </strong>
          {RESULTS_VARS.map((v) => (
            <code
              key={v}
              className="text-[0.6875rem] font-mono px-1.5 py-0.5 rounded bg-background text-foreground border border-border"
            >
              {v}
            </code>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 p-3 rounded border border-border bg-muted/30">
        <span className="text-xs text-foreground">
          Content approved (flips{" "}
          <code className="font-mono px-1 py-0.5 rounded bg-muted">
            INVITED_RESULTS_EMAIL_COPY_APPROVED
          </code>
          )
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
            {contentApproved ? "On" : "Off"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={contentApproved}
            aria-label="Content approved"
            disabled={isReadOnly}
            onClick={() => onContentApprovedChange(!contentApproved)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              contentApproved
                ? "bg-primary border-primary"
                : "bg-muted border-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow transition-transform ${
                contentApproved ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Version History strip ───────────────────────────────────────────────
function VersionHistoryStrip({
  allVersions,
  currentVersionId,
}: {
  allVersions: MetadataTabVersionMeta[];
  currentVersionId: string;
}) {
  return (
    <section
      aria-label="Version history"
      className="rounded-lg border border-border bg-card p-5 space-y-3"
    >
      <h4 className="text-sm font-semibold text-foreground">
        Version History
      </h4>
      <div className="flex flex-wrap gap-2">
        {allVersions.map((v) => {
          const isPublished = v.publishedAt !== null;
          const isCurrent = v.id === currentVersionId;
          const dateStr = v.publishedAt
            ? new Date(v.publishedAt).toLocaleDateString("en-US", {
                dateStyle: "medium",
              })
            : null;
          return (
            <div
              key={v.id}
              className={`rounded border px-3 py-2 min-w-[12rem] ${
                isCurrent
                  ? "ring-2 ring-primary border-primary bg-primary/5"
                  : "border-border bg-background"
              }`}
              data-testid={`version-history-card-${v.id}`}
            >
              <div className="text-xs font-semibold text-foreground">
                v{v.versionNumber} —{" "}
                {isPublished
                  ? `Published ${dateStr}`
                  : `Draft${isCurrent ? " (you are here)" : ""}`}
              </div>
              <div className="mt-1">
                {isPublished ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.625rem] font-semibold bg-success/10 text-success">
                    ● Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.625rem] font-semibold bg-warning/10 text-warning">
                    Draft
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[0.6875rem] italic text-muted-foreground">
        Publishing a draft makes it the active version; earlier versions
        remain queryable for historical campaigns.
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Shared input classes — local to keep WF-styled inputs uniform without
// pulling shadcn Input (which has slightly different padding/border).
// ────────────────────────────────────────────────────────────────────────
const inputCls =
  "block w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";
const textareaCls =
  "block w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";
const selectCls =
  "block w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";
