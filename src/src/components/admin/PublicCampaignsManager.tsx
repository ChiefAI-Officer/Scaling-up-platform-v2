"use client";

/**
 * Admin — Public Campaigns Manager.
 *
 * Lists existing PUBLIC campaigns and provides a form to create new ones.
 * Serves POST /api/admin/public-campaigns (create) and
 * POST /api/admin/public-campaigns/[id]/publish (DRAFT → ACTIVE).
 *
 * Task 8: Quick Assessment PUBLIC campaign flow.
 */

import { Fragment, useEffect, useState } from "react";
import type { PublicResultSummary } from "@/lib/assessments/public-referrals";
import {
  FOUR_DECISION_STYLES,
  fourDecisionDomains,
} from "@/lib/assessments/public-result-summary";

interface TemplateSummary {
  id: string;
  name: string;
  alias: string;
  disabledAt?: string | null;
}

interface OrgSummary {
  id: string;
  name: string;
}

interface PublicCampaignRow {
  id: string;
  name: string;
  alias: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  accessMode: string;
  openAt: string;
  closeAt?: string | null;
  template?: { id: string; name: string; alias: string } | null;
  organization?: { id: string; name: string } | null;
}

/** #83 — a public-quiz submission row (from the admin submissions endpoint). */
interface SubmissionRow {
  id: string;
  takerName: string;
  takerEmail: string | null;
  referringCoachEmail: string | null;
  submittedAt: string;
  referringCoach?: { name: string; email: string } | null;
  template?: { id: string; name: string; alias: string };
  summary?: PublicResultSummary;
  reportHref?: string;
}

function SubmissionResult({ summary }: { summary: PublicResultSummary }) {
  if (summary.kind !== "scored") {
    return <span>{summary.label}</span>;
  }

  const decisions = fourDecisionDomains(summary);
  return (
    <div>
      <strong>{summary.overallScore.toFixed(1)}</strong>
      {summary.tierLabel && (
        <div className="wf-muted-text">{summary.tierLabel}</div>
      )}
      {decisions && (
        <div
          aria-label="Four Decisions result"
          style={{ display: "flex", gap: "0.25rem", marginTop: "0.25rem" }}
        >
          {decisions.map(({ key }) => (
            <span
              key={key}
              aria-hidden="true"
              data-testid="four-decisions-segment"
              style={{
                display: "block",
                width: "1.25rem",
                height: "0.25rem",
                borderRadius: "999px",
                background: FOUR_DECISION_STYLES[key].color,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PublicCampaignsManager() {
  const [campaigns, setCampaigns] = useState<PublicCampaignRow[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // #83 — per-campaign public-quiz submissions, lazy-loaded when a row expands.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submissionsByCampaign, setSubmissionsByCampaign] = useState<
    Record<string, SubmissionRow[]>
  >({});
  const [subsLoading, setSubsLoading] = useState<string | null>(null);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(
    null,
  );

  async function toggleSubmissions(id: string) {
    // Collapse if already open.
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setSubsError(null);
    // Serve from cache if we've already loaded this campaign's submissions.
    if (submissionsByCampaign[id]) return;
    setSubsLoading(id);
    try {
      const res = await fetch(`/api/admin/public-campaigns/${id}/submissions`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubsError(
          typeof json.error === "string"
            ? json.error
            : "Failed to load submissions.",
        );
        return;
      }
      setSubmissionsByCampaign((prev) => ({ ...prev, [id]: json.data ?? [] }));
    } catch {
      setSubsError("Failed to load submissions.");
    } finally {
      setSubsLoading(null);
    }
  }

  // Form state
  const [templateId, setTemplateId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [name, setName] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Load campaigns filtered to PUBLIC
      const [campsRes, tmplRes, orgsRes] = await Promise.all([
        fetch("/api/assessment-campaigns"),
        fetch("/api/admin/assessment-templates"),
        fetch("/api/organizations"),
      ]);

      if (campsRes.ok) {
        const body = (await campsRes.json()) as {
          data: PublicCampaignRow[];
        };
        setCampaigns(
          (body.data ?? []).filter((c) => c.accessMode === "PUBLIC")
        );
      }

      if (tmplRes.ok) {
        const body = (await tmplRes.json()) as { data: TemplateSummary[] };
        // Wave Q (#6): the admin list keeps disabled templates (for the
        // badge/enable UI) — but they must not be offered for NEW public
        // campaigns. The POST 409s regardless; this hides them up front.
        setTemplates((body.data ?? []).filter((t) => !t.disabledAt));
      }

      if (orgsRes.ok) {
        const body = (await orgsRes.json()) as { data: OrgSummary[] };
        setOrgs(body.data ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!templateId || !organizationId || !name || !openAt) {
      setFormError("Template, Organization, Name, and Open Date are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/public-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          organizationId,
          name,
          openAt: new Date(openAt).toISOString(),
          closeAt: closeAt ? new Date(closeAt).toISOString() : null,
        }),
      });
      const body = (await res.json()) as { success: boolean; error?: unknown };
      if (!res.ok || !body.success) {
        const msg =
          typeof body.error === "string"
            ? body.error
            : JSON.stringify(body.error);
        setFormError(`Error ${res.status}: ${msg}`);
        return;
      }
      setSuccess("Campaign created as DRAFT.");
      setTemplateId("");
      setOrganizationId("");
      setName("");
      setOpenAt("");
      setCloseAt("");
      await loadData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(id: string) {
    setFormError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/public-campaigns/${id}/publish`, {
        method: "POST",
      });
      const body = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !body.success) {
        setFormError(`Publish failed: ${body.error ?? res.status}`);
        return;
      }
      setSuccess("Campaign published — now ACTIVE.");
      await loadData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unexpected error");
    }
  }

  if (loading) {
    return <p className="wf-muted-text">Loading…</p>;
  }

  return (
    <div>
      {error && (
        <div className="wf-callout wf-callout-error" role="alert">
          {error}
        </div>
      )}

      {/* ── Campaign List ─────────────────────────────────────────── */}
      <section aria-label="Public campaigns list">
        <h3 className="wf-section-title">Existing PUBLIC Campaigns</h3>
        {campaigns.length === 0 ? (
          <p className="wf-muted-text">No PUBLIC campaigns yet.</p>
        ) : (
          <table className="wf-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th className="wf-th">Name</th>
                <th className="wf-th">Alias</th>
                <th className="wf-th">Template</th>
                <th className="wf-th">Status</th>
                <th className="wf-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const rows = submissionsByCampaign[c.id] ?? [];
                const enriched = rows.some(
                  (submission) =>
                    submission.summary !== undefined &&
                    submission.reportHref !== undefined,
                );
                return (
                <Fragment key={c.id}>
                  <tr className="wf-tr">
                    <td className="wf-td">{c.name}</td>
                    <td className="wf-td">
                      <code className="wf-code">{c.alias}</code>
                    </td>
                    <td className="wf-td">{c.template?.name ?? c.template?.alias ?? "—"}</td>
                    <td className="wf-td">
                      <span
                        className={
                          c.status === "ACTIVE"
                            ? "wf-badge wf-badge-green"
                            : c.status === "CLOSED"
                            ? "wf-badge wf-badge-red"
                            : "wf-badge wf-badge-yellow"
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="wf-td">
                      {c.status === "DRAFT" && (
                        <button
                          className="wf-btn wf-btn-primary wf-btn-sm"
                          onClick={() => handlePublish(c.id)}
                        >
                          Publish
                        </button>
                      )}
                      {/* #83 — self-enrolled submissions + which coach referred them */}
                      <button
                        className="wf-btn wf-btn-sm"
                        onClick={() => toggleSubmissions(c.id)}
                        aria-expanded={expandedId === c.id}
                      >
                        {expandedId === c.id ? "Hide" : "View submissions"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr className="wf-tr">
                      <td className="wf-td" colSpan={5}>
                        {subsLoading === c.id ? (
                          <p className="wf-muted-text">Loading…</p>
                        ) : subsError ? (
                          <p className="wf-muted-text" role="alert">
                            {subsError}
                          </p>
                        ) : rows.length === 0 ? (
                          <p className="wf-muted-text">No submissions yet.</p>
                        ) : (
                          <table className="wf-table" style={{ width: "100%" }}>
                            <thead>
                              <tr>
                                <th className="wf-th">Respondent</th>
                                <th className="wf-th">
                                  {enriched
                                    ? "Referring coach"
                                    : "Referred by coach"}
                                </th>
                                {enriched && (
                                  <th className="wf-th">Result</th>
                                )}
                                <th className="wf-th">Submitted</th>
                                {enriched && (
                                  <th className="wf-th">Actions</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((s) => {
                                const details = fourDecisionDomains(s.summary);
                                const isExpanded =
                                  expandedSubmissionId === s.id;
                                return (
                                <Fragment key={s.id}>
                                <tr className="wf-tr">
                                  <td className="wf-td">
                                    {s.takerName}
                                    {s.takerEmail &&
                                      s.takerEmail !== s.takerName && (
                                        <div
                                          className="wf-muted-text"
                                          style={{ fontSize: "0.85em" }}
                                        >
                                          {s.takerEmail}
                                        </div>
                                      )}
                                  </td>
                                  <td className="wf-td">
                                    {enriched ? (
                                      s.referringCoach ? (
                                        <>
                                          {s.referringCoach.name}
                                          <div
                                            className="wf-muted-text"
                                            style={{ fontSize: "0.85em" }}
                                          >
                                            {s.referringCoach.email}
                                          </div>
                                        </>
                                      ) : (
                                        "Scaling Up only"
                                      )
                                    ) : (
                                      s.referringCoachEmail ?? "—"
                                    )}
                                  </td>
                                  {enriched && (
                                    <td className="wf-td">
                                      {s.summary && (
                                        <SubmissionResult summary={s.summary} />
                                      )}
                                    </td>
                                  )}
                                  <td className="wf-td">
                                    {s.submittedAt.slice(0, 10)}
                                  </td>
                                  {enriched && (
                                    <td className="wf-td">
                                      {details && (
                                        <button
                                          type="button"
                                          className="wf-btn wf-btn-sm"
                                          aria-expanded={isExpanded}
                                          onClick={() =>
                                            setExpandedSubmissionId(
                                              isExpanded ? null : s.id,
                                            )
                                          }
                                        >
                                          {isExpanded
                                            ? "Hide details"
                                            : "Details"}
                                        </button>
                                      )}
                                      {s.reportHref && (
                                        <a
                                          className="wf-btn wf-btn-sm"
                                          href={s.reportHref}
                                        >
                                          View report
                                        </a>
                                      )}
                                    </td>
                                  )}
                                </tr>
                                {isExpanded && details && (
                                  <tr className="wf-tr">
                                    <td
                                      className="wf-td"
                                      colSpan={enriched ? 5 : 3}
                                    >
                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns:
                                            "repeat(4, minmax(0, 1fr))",
                                          gap: "0.5rem",
                                        }}
                                      >
                                        {details.map(({ key, domain }) => (
                                          <div key={key}>
                                            <span className="wf-muted-text">
                                              {domain.label}
                                            </span>
                                            <strong style={{ display: "block" }}>
                                              {domain.score === null
                                                ? "—"
                                                : domain.score.toFixed(1)}
                                            </strong>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Create Form ───────────────────────────────────────────── */}
      <section aria-label="Create public campaign" style={{ marginTop: "2rem" }}>
        <h3 className="wf-section-title">Create New PUBLIC Campaign</h3>

        {formError && (
          <div className="wf-callout wf-callout-error" role="alert">
            {formError}
          </div>
        )}
        {success && (
          <div className="wf-callout wf-callout-success" role="status">
            {success}
          </div>
        )}

        <form onSubmit={handleCreate} className="wf-form">
          {/* Template */}
          <div className="wf-field">
            <label htmlFor="pc-template" className="wf-label">
              Template <span aria-hidden="true">*</span>
            </label>
            <select
              id="pc-template"
              className="wf-select"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              <option value="">— select a template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.alias})
                </option>
              ))}
            </select>
            <p className="wf-field-hint">
              The API returns 422 if the selected template has no published
              version.
            </p>
          </div>

          {/* Organization */}
          <div className="wf-field">
            <label htmlFor="pc-org" className="wf-label">
              Organization <span aria-hidden="true">*</span>
            </label>
            <select
              id="pc-org"
              className="wf-select"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              required
            >
              <option value="">— select an organization —</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <p className="wf-field-hint">
              organizationId is required by the schema (NOT NULL FK). The
              campaign attaches to a real organization even for PUBLIC access.
            </p>
          </div>

          {/* Campaign name */}
          <div className="wf-field">
            <label htmlFor="pc-name" className="wf-label">
              Campaign Name <span aria-hidden="true">*</span>
            </label>
            <input
              id="pc-name"
              type="text"
              className="wf-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
              placeholder="e.g. Q3 2026 Public Rockefeller Habits"
            />
          </div>

          {/* Open date */}
          <div className="wf-field">
            <label htmlFor="pc-open-at" className="wf-label">
              Open At <span aria-hidden="true">*</span>
            </label>
            <input
              id="pc-open-at"
              type="datetime-local"
              className="wf-input"
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
              required
            />
          </div>

          {/* Close date (optional → ENDS_AFTER) */}
          <div className="wf-field">
            <label htmlFor="pc-close-at" className="wf-label">
              Close At{" "}
              <span className="wf-muted-text">(optional — omit for open-ended)</span>
            </label>
            <input
              id="pc-close-at"
              type="datetime-local"
              className="wf-input"
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
            />
            <p className="wf-field-hint">
              Leave blank → <code>OPEN_END</code>. Set a date →{" "}
              <code>ENDS_AFTER</code>.
            </p>
          </div>

          <button
            type="submit"
            className="wf-btn wf-btn-primary"
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create PUBLIC Campaign"}
          </button>
        </form>
      </section>
    </div>
  );
}
