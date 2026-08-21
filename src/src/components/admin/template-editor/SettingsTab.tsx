"use client";

/**
 * SettingsTab — Wave ED10 (spec 19am §3.3, plan Task 8).
 *
 * ONE plain-language column that replaces the Metadata field wall. Every label
 * / helper is verbatim from the spec's C-2 table. The dropped-from-Metadata
 * items (v7.5 badge, the `INVITED_RESULTS_EMAIL_COPY_APPROVED` flag copy, the
 * dead PUBLIC radio, the duplicate Sections card, the editable Alias input) do
 * NOT appear here.
 *
 * Two save lanes (the heart of the tab):
 *   1. Save-Draft lane (version-governed, draft-only) — Invitation email
 *      (Subject/Message) + Language. Wired to `onTemplateFieldChange` /
 *      `onVersionFieldChange` exactly like MetadataTab; the header "Save Draft"
 *      button persists them. DISABLED when the version is published
 *      (`isReadOnly`) because the invitation email is part of the version
 *      `contentHash` and language is version content.
 *   2. Per-card Save lane (template-row, not hashed) — Aggregation + Results
 *      email. Each card has its OWN explicit Save button →
 *      `handleTemplateRowSave` (Task 7); editable while published (NOT gated by
 *      `isReadOnly`) with an "applies to live campaigns" impact line.
 *
 * Results-email approval interlock (SEC-H2): approval must always correspond to
 * the currently-saved content. The displayed approved state is driven from the
 * server-truth `templateValues.resultsEmailContentApproved`; the "Approved to
 * send" toggle is DISABLED while the card is dirty; toggling it sends content +
 * approval together (atomic hash bind); a content Save sends
 * `resultsEmailContentApproved:false` to mirror the server's auto-clear, and
 * coerces empty strings → null (matching the Save-Draft lane's semantics).
 */

import Link from "next/link";
import React, { useEffect, useState } from "react";
import type { AssessmentTemplateDeliveryType } from "@prisma/client";

import { AssessmentDeliveryTypePicker } from "@/components/admin/AssessmentDeliveryTypePicker";
import { MarketingCtaEditor } from "@/components/admin/template-editor/MarketingCtaEditor";
import type { MarketingCtaConfigV1 } from "@/lib/assessments/marketing-cta";
import { LANGUAGE_LABELS } from "./enum-labels";
import {
  PeerBenchmarksPanel,
  type PeerBenchmarkRow,
} from "@/components/assessments/PeerBenchmarksPanel";
import { ReportStylePicker } from "@/components/assessments/ReportStylePicker";
import {
  resolveReportStylePreviewAnatomy,
  type ReportStyleKey,
  type ReportStylePreviewCapabilities,
} from "@/lib/assessments/report-style-registry";

// ────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────

/** Mirrors the shape the model exposes as `templateValues` (name/description
 *  are unused here — Name/Description live on the ED9 Build hero, D6 — but are
 *  accepted so `model.templateValues` can be passed straight through). */
export interface SettingsTabTemplateValues {
  name: string;
  alias: string;
  description: string;
  invitationSubject: string;
  invitationBodyMarkdown: string;
  resultsEmailSubject: string | null;
  resultsEmailBodyMarkdown: string | null;
  resultsEmailContentApproved: boolean;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  deliveryType?: AssessmentTemplateDeliveryType;
  /** Optional only for legacy isolated editor fixtures; live page always supplies it. */
  defaultReportStyle?: ReportStyleKey;
}

/**
 * The per-card Save payload (Task 8 owns null-coercion). Widens the results-
 * email string fields to `string | null` vs the hook's `TemplateRowPatch`
 * (which types them `string`) so we can send `null` for an emptied field — the
 * `PATCH /api/admin/assessment-templates/{id}` route already accepts null
 * (`.nullable()`), and the Save-Draft lane already sends null. Task 10 threads
 * `model.handleTemplateRowSave` in (see the note in the wave plan).
 */
export type SettingsRowPatch = Partial<{
  deliveryType: AssessmentTemplateDeliveryType;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  resultsEmailSubject: string | null;
  resultsEmailBodyMarkdown: string | null;
  resultsEmailContentApproved: boolean;
  defaultReportStyle: ReportStyleKey;
}>;

export interface SettingsTabProps {
  templateId: string;
  versionId?: string;
  templateValues: SettingsTabTemplateValues;
  /** Version-level language (real stored value, e.g. `enUS`). */
  language: string;
  /** True when the viewed version is published — gates the Save-Draft lane. */
  isReadOnly: boolean;

  // ── Save-Draft lane (invitation email + language) ──
  onTemplateFieldChange: (
    patch: Partial<{ invitationSubject: string; invitationBodyMarkdown: string }>,
  ) => void;
  onVersionFieldChange: (patch: { language?: string }) => void;

  // ── Per-card Save lane (aggregation + results email) ──
  handleTemplateRowSave: (patch: SettingsRowPatch) => void | Promise<void>;
  templateRowSaving: boolean;
  templateRowError: string | null;

  // ── Wave Q immediate toggle ──
  sendResultsDefault: boolean;
  onSendResultsDefaultChange: (next: boolean) => void;
  savingSendResultsDefault: boolean;
  waveQEnabled: boolean;
  /** Legacy picker only; successor HTML reports retire new style choices. */
  reportStylesEnabled?: boolean;
  reportStylePreviewCapabilities: ReportStylePreviewCapabilities;
  /**
   * Server-resolved peer benchmark rows. Null/omitted means the capability is
   * unavailable for this template; an array mounts the existing editor here
   * instead of below the whole tabbed shell.
   */
  peerBenchmarkRows?: PeerBenchmarkRow[] | null;
  /** Public-quiz classification is editable only until the first publication. */
  deliveryType?: AssessmentTemplateDeliveryType;
  hasPublishedVersion?: boolean;
  publicMarketingCtaEnabled?: boolean;
  marketingCta?: MarketingCtaConfigV1 | null;
  onMarketingCtaChange?: (next: MarketingCtaConfigV1) => void;
  marketingCtaDirty?: boolean;
  /** Successor Reports experience owns the canonical report conclusion. */
  reportsActive?: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────
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

const RESULTS_VARS = ["{{respondentFirstName}}"];

/** Real stored language values (NOT the hyphenated `en-US…`, C6). */
const LANGUAGE_OPTIONS = ["enUS", "enGB", "esES", "frFR"];

const IMPACT_LINE =
  "Changes apply to every campaign launched from this assessment (including live ones).";

const inputCls = "wf-input";
const textareaCls = "wf-textarea";
const selectCls = "wf-select";

const coerceNull = (v: string): string | null => (v.length > 0 ? v : null);

// ────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────
export function SettingsTab({
  templateId,
  versionId = "",
  templateValues,
  language,
  isReadOnly,
  onTemplateFieldChange,
  onVersionFieldChange,
  handleTemplateRowSave,
  templateRowSaving,
  templateRowError,
  sendResultsDefault,
  onSendResultsDefaultChange,
  savingSendResultsDefault,
  waveQEnabled,
  reportStylesEnabled = false,
  reportStylePreviewCapabilities,
  peerBenchmarkRows = null,
  deliveryType = templateValues.deliveryType ?? "INVITED_ASSESSMENT",
  hasPublishedVersion = false,
  publicMarketingCtaEnabled = false,
  marketingCta = null,
  onMarketingCtaChange = () => {},
  marketingCtaDirty = false,
  reportsActive = false,
}: SettingsTabProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      <AudienceCard
        aggregationMode={templateValues.aggregationMode}
        deliveryType={deliveryType}
        hasPublishedVersion={hasPublishedVersion}
        publicMarketingCtaEnabled={publicMarketingCtaEnabled}
        handleTemplateRowSave={handleTemplateRowSave}
        templateRowSaving={templateRowSaving}
        templateRowError={templateRowError}
      />
      {!reportsActive && reportStylesEnabled && (
        <DefaultReportAppearanceCard
          templateAlias={templateValues.alias}
          previewCapabilities={reportStylePreviewCapabilities}
          defaultReportStyle={templateValues.defaultReportStyle ?? "CLASSIC"}
          handleTemplateRowSave={handleTemplateRowSave}
          templateRowSaving={templateRowSaving}
          templateRowError={templateRowError}
        />
      )}
      {peerBenchmarkRows && (
        <PeerBenchmarksPanel templateId={templateId} rows={peerBenchmarkRows} />
      )}
      <LanguageCard
        language={language}
        onVersionFieldChange={onVersionFieldChange}
        isReadOnly={isReadOnly}
      />
      {!reportsActive &&
        publicMarketingCtaEnabled &&
        deliveryType === "PUBLIC_MARKETING_QUIZ" && (
          <MarketingCtaEditor
            templateId={templateId}
            value={marketingCta}
            onChange={onMarketingCtaChange}
            previewDisabled={marketingCtaDirty}
            onPreview={() => {
              window.open(
                `/admin/assessments/templates/${templateId}/versions/${versionId}/preview-public-result`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          />
        )}
      <InvitationEmailCard
        subject={templateValues.invitationSubject}
        body={templateValues.invitationBodyMarkdown}
        onTemplateFieldChange={onTemplateFieldChange}
        isReadOnly={isReadOnly}
      />
      <ResultsEmailCard
        savedSubject={templateValues.resultsEmailSubject ?? ""}
        savedBody={templateValues.resultsEmailBodyMarkdown ?? ""}
        approved={templateValues.resultsEmailContentApproved}
        handleTemplateRowSave={handleTemplateRowSave}
        templateRowSaving={templateRowSaving}
        templateRowError={templateRowError}
        sendResultsDefault={sendResultsDefault}
        onSendResultsDefaultChange={onSendResultsDefaultChange}
        savingSendResultsDefault={savingSendResultsDefault}
        waveQEnabled={waveQEnabled}
      />
      <AccessGroupsRow />
      <AdvancedCard alias={templateValues.alias} />
    </div>
  );
}

function DefaultReportAppearanceCard({
  templateAlias,
  previewCapabilities,
  defaultReportStyle,
  handleTemplateRowSave,
  templateRowSaving,
  templateRowError,
}: {
  templateAlias: string;
  previewCapabilities: ReportStylePreviewCapabilities;
  defaultReportStyle: ReportStyleKey;
  handleTemplateRowSave: (patch: SettingsRowPatch) => void | Promise<void>;
  templateRowSaving: boolean;
  templateRowError: string | null;
}) {
  const [selectedStyle, setSelectedStyle] = useState(defaultReportStyle);
  const dirty = selectedStyle !== defaultReportStyle;

  useEffect(() => {
    setSelectedStyle(defaultReportStyle);
  }, [defaultReportStyle]);

  return (
    <section
      className="wf-card"
      style={{ padding: "1.5rem" }}
      data-testid="settings-default-report-style-card"
    >
      <h3 className="wf-card-title" style={{ marginBottom: "0.25rem" }}>
        Default report appearance
      </h3>
      <p className="text-[0.6875rem] text-muted-foreground" style={{ marginBottom: "1rem" }}>
        This default is copied into future campaigns only. Existing campaigns and reports do not change.
      </p>
      <div aria-busy={templateRowSaving} className="min-w-0">
        <ReportStylePicker
          value={selectedStyle}
          onChange={templateRowSaving ? () => {} : setSelectedStyle}
          disabled={templateRowSaving}
          disabledExplanation={null}
          previewAnatomy={resolveReportStylePreviewAnatomy({
            templateAlias,
            capabilities: previewCapabilities,
          })}
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || templateRowSaving}
          onClick={() => handleTemplateRowSave({ defaultReportStyle: selectedStyle })}
          className="wf-btn wf-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {templateRowSaving ? "Saving…" : "Save default"}
        </button>
        {templateRowSaving && (
          <span role="status" className="text-xs text-muted-foreground">
            Saving default…
          </span>
        )}
        {templateRowError && (
          <span role="alert" className="text-xs text-destructive">
            {templateRowError}
          </span>
        )}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Card: Who takes it & who sees results (Access read-only + Aggregation)
// ────────────────────────────────────────────────────────────────────────
function AudienceCard({
  aggregationMode,
  deliveryType,
  hasPublishedVersion,
  publicMarketingCtaEnabled,
  handleTemplateRowSave,
  templateRowSaving,
  templateRowError,
}: {
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  deliveryType: AssessmentTemplateDeliveryType;
  hasPublishedVersion: boolean;
  publicMarketingCtaEnabled: boolean;
  handleTemplateRowSave: (patch: SettingsRowPatch) => void | Promise<void>;
  templateRowSaving: boolean;
  templateRowError: string | null;
}) {
  const [mode, setMode] = useState<"FULL_VISIBILITY" | "CEO_ONLY">(
    aggregationMode,
  );
  const [selectedDeliveryType, setSelectedDeliveryType] =
    useState<AssessmentTemplateDeliveryType>(deliveryType);
  const dirty = mode !== aggregationMode;
  const deliveryTypeDirty = selectedDeliveryType !== deliveryType;

  useEffect(() => {
    setSelectedDeliveryType(deliveryType);
  }, [deliveryType]);

  return (
    <section className="wf-card" style={{ padding: "1.5rem" }} data-testid="settings-audience-card">
      <h3 className="wf-card-title" style={{ marginBottom: "1rem" }}>
        Who takes it &amp; who sees results
      </h3>

      {publicMarketingCtaEnabled ? (
        <div className="space-y-3">
          {hasPublishedVersion ? (
            <>
              <span className="wf-label">Assessment type</span>
              <p className="text-sm font-semibold text-foreground">
                {deliveryType === "PUBLIC_MARKETING_QUIZ"
                  ? "Public marketing quiz"
                  : "Invited assessment"}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">
                Locked after this template&apos;s first published version.
              </p>
            </>
          ) : (
            <>
              <AssessmentDeliveryTypePicker
                value={selectedDeliveryType}
                onChange={setSelectedDeliveryType}
                disabled={templateRowSaving}
              />
              <button
                type="button"
                disabled={!deliveryTypeDirty || templateRowSaving}
                onClick={() =>
                  handleTemplateRowSave({ deliveryType: selectedDeliveryType })
                }
                className="wf-btn wf-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {templateRowSaving ? "Saving…" : "Save assessment type"}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <span className="wf-label">Who can take it</span>
          <p className="text-sm text-foreground">
            <strong>Invited only</strong> — each respondent gets a private magic
            link; answers are attributable.
          </p>
        </div>
      )}

      {/* Aggregation — editable radios (humanized), per-card Save. */}
      <div className="space-y-2" style={{ marginTop: "1.25rem" }}>
        <span className="wf-label">Who sees individual answers</span>
        <div role="radiogroup" aria-label="Who sees individual answers" className="space-y-2">
          <AggregationOption
            value="FULL_VISIBILITY"
            title="Everyone"
            description="All viewers see each person's individual answers."
            checked={mode === "FULL_VISIBILITY"}
            onSelect={() => setMode("FULL_VISIBILITY")}
            disabled={templateRowSaving}
          />
          <AggregationOption
            value="CEO_ONLY"
            title="CEO only"
            description="Others see just their own answers; the CEO sees the team average (no individual rows)."
            checked={mode === "CEO_ONLY"}
            onSelect={() => setMode("CEO_ONLY")}
            disabled={templateRowSaving}
          />
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">{IMPACT_LINE}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="settings-aggregation-save"
            disabled={!dirty || templateRowSaving}
            onClick={() => handleTemplateRowSave({ aggregationMode: mode })}
            className="wf-btn wf-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {templateRowSaving ? "Saving…" : "Save"}
          </button>
          {templateRowError && (
            <span role="alert" className="text-xs text-destructive">
              {templateRowError}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function AggregationOption({
  value,
  title,
  description,
  checked,
  onSelect,
  disabled,
}: {
  value: "FULL_VISIBILITY" | "CEO_ONLY";
  title: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2 rounded border p-3 ${
        checked ? "border-primary bg-primary/5" : "border-border"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        name="settings-aggregation"
        value={value}
        aria-label={title}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="block text-[0.6875rem] text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Card: Language (Save-Draft lane)
// ────────────────────────────────────────────────────────────────────────
function LanguageCard({
  language,
  onVersionFieldChange,
  isReadOnly,
}: {
  language: string;
  onVersionFieldChange: (patch: { language?: string }) => void;
  isReadOnly: boolean;
}) {
  return (
    <section className="wf-card" style={{ padding: "1.5rem" }} data-testid="settings-language-card">
      <div className="space-y-1.5">
        <label htmlFor="settings-language" className="wf-label">
          Language
        </label>
        <select
          id="settings-language"
          value={language}
          onChange={(e) => onVersionFieldChange({ language: e.target.value })}
          disabled={isReadOnly}
          className={selectCls}
        >
          {LANGUAGE_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {LANGUAGE_LABELS[v] ?? v}
            </option>
          ))}
        </select>
        <span className="block text-[0.6875rem] text-muted-foreground">
          Applies to this version&apos;s content
        </span>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Card: Invitation email (Save-Draft lane, disabled when published)
// ────────────────────────────────────────────────────────────────────────
function InvitationEmailCard({
  subject,
  body,
  onTemplateFieldChange,
  isReadOnly,
}: {
  subject: string;
  body: string;
  onTemplateFieldChange: (
    patch: Partial<{ invitationSubject: string; invitationBodyMarkdown: string }>,
  ) => void;
  isReadOnly: boolean;
}) {
  return (
    <section className="wf-card" style={{ padding: "1.5rem" }} data-testid="settings-invitation-card">
      <h3 className="wf-card-title" style={{ marginBottom: "0.25rem" }}>
        Invitation email
      </h3>
      <p className="text-[0.6875rem] text-muted-foreground" style={{ marginBottom: "1rem" }}>
        Sent when a respondent is invited.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="settings-inv-subject" className="wf-label">
          Subject
        </label>
        <input
          id="settings-inv-subject"
          type="text"
          value={subject}
          onChange={(e) =>
            onTemplateFieldChange({ invitationSubject: e.target.value })
          }
          disabled={isReadOnly}
          className={inputCls}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="settings-inv-message" className="wf-label">
          Message
        </label>
        <textarea
          id="settings-inv-message"
          rows={6}
          value={body}
          onChange={(e) =>
            onTemplateFieldChange({ invitationBodyMarkdown: e.target.value })
          }
          disabled={isReadOnly}
          className={textareaCls + " font-mono text-xs"}
        />
        <InsertChips
          vars={INVITATION_VARS}
          disabled={isReadOnly}
          onInsert={(token) =>
            onTemplateFieldChange({ invitationBodyMarkdown: body + token })
          }
        />
      </div>

      <p className="text-[0.6875rem] text-muted-foreground" style={{ marginTop: "0.75rem" }}>
        Part of this version&apos;s content — saved with the draft, so it locks
        once the version is published.
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Card: Results email (per-card Save lane, editable while published)
// ────────────────────────────────────────────────────────────────────────
function ResultsEmailCard({
  savedSubject,
  savedBody,
  approved,
  handleTemplateRowSave,
  templateRowSaving,
  templateRowError,
  sendResultsDefault,
  onSendResultsDefaultChange,
  savingSendResultsDefault,
  waveQEnabled,
}: {
  savedSubject: string;
  savedBody: string;
  approved: boolean;
  handleTemplateRowSave: (patch: SettingsRowPatch) => void | Promise<void>;
  templateRowSaving: boolean;
  templateRowError: string | null;
  sendResultsDefault: boolean;
  onSendResultsDefaultChange: (next: boolean) => void;
  savingSendResultsDefault: boolean;
  waveQEnabled: boolean;
}) {
  const [subject, setSubject] = useState(savedSubject);
  const [body, setBody] = useState(savedBody);
  // Dirty vs the server-truth saved values (null-normalized so a save that
  // coerced "" → null does not read back as dirty).
  const cardDirty = subject !== savedSubject || body !== savedBody;

  const saveContent = () =>
    handleTemplateRowSave({
      resultsEmailSubject: coerceNull(subject),
      resultsEmailBodyMarkdown: coerceNull(body),
      // Mirror the server's auto-clear: any content edit drops approval, so we
      // keep local == server by sending false here (re-approve is a separate,
      // clean-card action).
      resultsEmailContentApproved: false,
    });

  const toggleApprove = () =>
    handleTemplateRowSave({
      resultsEmailContentApproved: !approved,
      // Send the (clean) saved content alongside so the server binds the
      // approval hash to the exact approved content atomically (SEC-H2).
      resultsEmailSubject: coerceNull(savedSubject),
      resultsEmailBodyMarkdown: coerceNull(savedBody),
    });

  return (
    <section className="wf-card" style={{ padding: "1.5rem" }} data-testid="settings-results-card">
      <h3 className="wf-card-title" style={{ marginBottom: "0.25rem" }}>
        Results email
      </h3>
      <p className="text-[0.6875rem] text-muted-foreground" style={{ marginBottom: "1rem" }}>
        The email respondents receive with their results.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="settings-res-subject" className="wf-label">
          Subject
        </label>
        <input
          id="settings-res-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Your results are ready"
          className={inputCls}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="settings-res-message" className="wf-label">
          Message
        </label>
        <textarea
          id="settings-res-message"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"Hi {{respondentFirstName}},\n\nYour results are ready to view."}
          className={textareaCls}
        />
        <InsertChips
          vars={RESULTS_VARS}
          disabled={false}
          onInsert={(token) => setBody((prev) => prev + token)}
        />
      </div>

      <p className="text-[0.6875rem] text-muted-foreground">{IMPACT_LINE}</p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="settings-results-save"
          disabled={!cardDirty || templateRowSaving}
          onClick={saveContent}
          className="wf-btn wf-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {templateRowSaving ? "Saving…" : "Save"}
        </button>
        {templateRowError && (
          <span role="alert" className="text-xs text-destructive">
            {templateRowError}
          </span>
        )}
      </div>

      {/* Approved to send — disabled while dirty (can't approve unsaved copy). */}
      <ToggleRow
        label="Allow coaches to enable results emails for respondents"
        helper="Coaches decide separately for each campaign."
        checked={approved}
        disabled={cardDirty || templateRowSaving}
        onToggle={toggleApprove}
      />

      {/* Send results by default — Wave Q immediate PATCH. */}
      {waveQEnabled && (
        <div className="ml-4">
          <ToggleRow
            label="Pre-select for new campaigns"
            helper="New campaigns start with respondent results emails enabled."
            checked={sendResultsDefault}
            disabled={savingSendResultsDefault}
            onToggle={() => onSendResultsDefaultChange(!sendResultsDefault)}
          />
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Row: Access groups link
// ────────────────────────────────────────────────────────────────────────
function AccessGroupsRow() {
  return (
    <section
      className="wf-card flex items-center justify-between gap-3"
      style={{ padding: "1rem 1.5rem" }}
      data-testid="settings-access-groups-row"
    >
      <span className="text-sm text-foreground">
        Manage who&apos;s allowed to take this assessment.
      </span>
      <Link
        href="/admin/assessments/access-groups"
        className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
      >
        Manage &rarr;
      </Link>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Card: Advanced — Alias (read-only)
// ────────────────────────────────────────────────────────────────────────
function AdvancedCard({ alias }: { alias: string }) {
  return (
    <section className="wf-card" style={{ padding: "1.5rem" }} data-testid="settings-advanced-card">
      <h3 className="wf-card-title" style={{ marginBottom: "1rem" }}>
        Advanced
      </h3>
      <div className="space-y-1.5">
        <label htmlFor="settings-alias" className="wf-label">
          Alias
        </label>
        <input
          id="settings-alias"
          type="text"
          value={alias}
          disabled
          readOnly
          className={inputCls}
        />
        <span className="block text-[0.6875rem] text-muted-foreground">
          Used internally to wire reports, benchmarks, and links. Changing it
          can silently break existing campaigns, so it&apos;s locked here.
        </span>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Shared: Insert chips + toggle row
// ────────────────────────────────────────────────────────────────────────
function InsertChips({
  vars,
  disabled,
  onInsert,
}: {
  vars: string[];
  disabled: boolean;
  onInsert: (token: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 mt-2 p-2 rounded bg-muted/40 border border-border">
      <strong className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mr-1">
        Insert
      </strong>
      {vars.map((v) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onInsert(v)}
          className="text-[0.6875rem] font-mono px-1.5 py-0.5 rounded bg-background text-foreground border border-border hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  helper,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  helper: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-1" style={{ marginTop: "1rem" }}>
      <div className="flex items-center justify-between gap-2 p-3 rounded border border-border bg-muted/30">
        <span className="text-xs text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
            {checked ? "On" : "Off"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={onToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              checked ? "bg-primary border-primary" : "bg-muted border-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow transition-transform ${
                checked ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">{helper}</p>
    </div>
  );
}
