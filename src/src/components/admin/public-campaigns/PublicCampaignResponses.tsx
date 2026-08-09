"use client";

import { Fragment, useEffect, useState } from "react";
import { SubmissionResult } from "@/components/admin/public-campaigns/SubmissionResult";
import type { PublicResultSummary } from "@/lib/assessments/public-referrals";
import { fourDecisionDomains } from "@/lib/assessments/public-result-summary";

interface PublicCampaignResponsesProps {
  campaignId: string;
  expanded: boolean;
}

interface ResponseRow {
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

interface ResponsesEnvelope {
  success?: boolean;
  data?: ResponseRow[];
}

export function PublicCampaignResponses({
  campaignId,
  expanded,
}: PublicCampaignResponsesProps) {
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || rows !== null) return;

    let active = true;
    setLoading(true);
    setLoadError(false);

    async function loadResponses() {
      try {
        const response = await fetch(
          `/api/admin/public-campaigns/${campaignId}/submissions`,
        );
        const body = (await response.json()) as ResponsesEnvelope;
        if (!response.ok || body.success !== true || !Array.isArray(body.data)) {
          throw new Error("Invalid responses envelope");
        }
        if (active) setRows(body.data);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadResponses();
    return () => {
      active = false;
    };
  }, [campaignId, expanded, rows]);

  if (!expanded) return null;

  if (loading) {
    return (
      <p role="status" className="wf-muted-text">
        Loading responses…
      </p>
    );
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        We couldn&apos;t load responses. Try again.
      </p>
    );
  }

  if (rows === null) return null;

  if (rows.length === 0) {
    return <p className="wf-muted-text">No responses yet.</p>;
  }

  const enriched = rows.some(
    (response) =>
      response.summary !== undefined && response.reportHref !== undefined,
  );

  return (
    <div className="wf-table-wrap">
      <table className="wf-table" aria-label="Campaign responses">
        <thead>
          <tr>
            <th>Respondent</th>
            <th>{enriched ? "Referring coach" : "Referred by coach"}</th>
            {enriched && <th>Result</th>}
            <th>Submitted</th>
            {enriched && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((response) => {
            const details = fourDecisionDomains(response.summary);
            const detailsExpanded = expandedResponseId === response.id;

            return (
              <Fragment key={response.id}>
                <tr>
                  <td>
                    {response.takerName}
                    {response.takerEmail &&
                      response.takerEmail !== response.takerName && (
                        <div className="wf-muted-text text-[0.85em]">
                          {response.takerEmail}
                        </div>
                      )}
                  </td>
                  <td>
                    {enriched ? (
                      response.referringCoach ? (
                        <>
                          {response.referringCoach.name}
                          <div className="wf-muted-text text-[0.85em]">
                            {response.referringCoach.email}
                          </div>
                        </>
                      ) : (
                        "Scaling Up only"
                      )
                    ) : (
                      response.referringCoachEmail ?? "—"
                    )}
                  </td>
                  {enriched && (
                    <td>
                      {response.summary && (
                        <SubmissionResult summary={response.summary} />
                      )}
                    </td>
                  )}
                  <td>{response.submittedAt.slice(0, 10)}</td>
                  {enriched && (
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {details && (
                          <button
                            type="button"
                            className="wf-btn wf-btn-sm"
                            aria-expanded={detailsExpanded}
                            onClick={() =>
                              setExpandedResponseId(
                                detailsExpanded ? null : response.id,
                              )
                            }
                          >
                            {detailsExpanded ? "Hide details" : "Details"}
                          </button>
                        )}
                        {response.reportHref && (
                          <a
                            className="wf-btn wf-btn-sm"
                            href={response.reportHref}
                          >
                            View report
                          </a>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                {detailsExpanded && details && (
                  <tr>
                    <td colSpan={enriched ? 5 : 3}>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {details.map(({ key, domain }) => (
                          <div key={key}>
                            <span className="wf-muted-text">{domain.label}</span>
                            <strong className="block">
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
    </div>
  );
}
