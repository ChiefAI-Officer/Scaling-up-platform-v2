"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  PublicReferralListItem,
  PublicResultSummary,
} from "@/lib/assessments/public-referrals";
import {
  MAX_PUBLIC_REFERRAL_CURSOR_TRAIL,
  normalizePublicReferralCursorTrail,
} from "@/lib/assessments/referred-results-page-state";
import {
  FOUR_DECISION_STYLES,
  fourDecisionDomains,
} from "@/lib/assessments/public-result-summary";

interface ReferredResultsListProps {
  coachLink: string | null;
  initialQuery?: string;
  initialTemplateId?: string;
  initialCursorTrail?: string[];
}

interface DisplayReferral
  extends Omit<PublicReferralListItem, "submittedAt"> {
  submittedAt: string;
}

interface ReferredResultsResponse {
  success: boolean;
  items?: DisplayReferral[];
  nextCursor?: string | null;
  assessmentOptions?: Array<{ id: string; name: string }>;
  totalCount?: number;
  ownedTotalCount?: number;
}

function formatScore(score: number | null): string {
  return score === null ? "—" : score.toFixed(1);
}

function formatSubmitted(value: string): { date: string; time: string } {
  const submittedAt = new Date(value);
  if (Number.isNaN(submittedAt.getTime())) {
    return { date: "Date unavailable", time: "" };
  }

  return {
    date: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(submittedAt),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(submittedAt),
  };
}

function updateBrowserQuery(input: {
  query: string;
  templateId: string;
  cursorTrail: string[];
}) {
  const params = new URLSearchParams();
  if (input.query) params.set("query", input.query);
  if (input.templateId) params.set("templateId", input.templateId);
  for (const cursor of input.cursorTrail) {
    params.append("cursor", cursor);
  }
  const suffix = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${suffix ? `?${suffix}` : ""}`,
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function DecisionStrip({
  summary,
}: {
  summary: PublicResultSummary;
}) {
  const domains = fourDecisionDomains(summary);
  if (!domains) return null;

  return (
    <div
      className="mt-1.5 grid grid-cols-4 gap-1"
      aria-label="Four Decisions result"
    >
      {domains.map(({ key }) => (
        <span
          key={key}
          className={`h-1 w-5 rounded-full ${FOUR_DECISION_STYLES[key].stripClass}`}
        />
      ))}
    </div>
  );
}

function ResultSummary({ summary }: { summary: PublicResultSummary }) {
  if (summary.kind === "qualitative" || summary.kind === "degraded") {
    return (
      <span className="text-sm font-medium text-foreground">
        {summary.label}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="font-serif text-2xl text-primary">
        {summary.overallScore.toFixed(1)}
      </span>
      <div>
        {summary.tierLabel && (
          <span className="text-xs font-semibold text-foreground">
            {summary.tierLabel}
          </span>
        )}
        <DecisionStrip summary={summary} />
      </div>
    </div>
  );
}

function DomainBreakdown({
  summary,
  id,
}: {
  summary: PublicResultSummary;
  id: string;
}) {
  const domains = fourDecisionDomains(summary);
  if (!domains) return null;

  return (
    <div
      id={id}
      className="grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {domains.map(({ key, domain }) => (
        <div
          key={key}
          className={`border-l-4 bg-card px-3 py-1 ${FOUR_DECISION_STYLES[key].borderClass}`}
        >
          <span className="block text-[11px] text-muted-foreground">
            {domain.label}
          </span>
          <strong className="text-sm text-foreground">
            {formatScore(domain.score)}
          </strong>
        </div>
      ))}
    </div>
  );
}

function ResultActions({
  item,
  expanded,
  onToggle,
  suffix,
}: {
  item: DisplayReferral;
  expanded: boolean;
  onToggle: () => void;
  suffix: string;
}) {
  const detailsId = `referral-domains-${item.submissionId}-${suffix}`;
  const supportsDetails = fourDecisionDomains(item.summary) !== null;

  return (
    <div className="flex items-center justify-end gap-2">
      {supportsDetails && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onToggle}
          className="rounded-md px-1.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Hide details" : "Details"}
        </button>
      )}
      <a
        href={`/assessments/public-submissions/${encodeURIComponent(item.submissionId)}/report`}
        className="rounded-md border border-primary/25 px-2.5 py-2 text-xs font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        View report
      </a>
    </div>
  );
}

export function ReferredResultsList({
  coachLink,
  initialQuery = "",
  initialTemplateId = "",
  initialCursorTrail = [],
}: ReferredResultsListProps) {
  const [initialState] = useState(() => ({
    query: initialQuery.trim(),
    templateId: initialTemplateId.trim(),
    cursorTrail: normalizePublicReferralCursorTrail(initialCursorTrail),
  }));
  const [items, setItems] = useState<DisplayReferral[]>([]);
  const [inputQuery, setInputQuery] = useState(initialState.query);
  const [appliedQuery, setAppliedQuery] = useState(initialState.query);
  const [templateId, setTemplateId] = useState(initialState.templateId);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [ownedTotalCount, setOwnedTotalCount] = useState<number | null>(null);
  const [cursorTrail, setCursorTrail] = useState(initialState.cursorTrail);
  const pageIndex = cursorTrail.length;
  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedQuery) params.set("query", appliedQuery);
    if (templateId) params.set("templateId", templateId);
    const suffix = params.toString();
    return `/api/assessments/referred-results/export.csv${
      suffix ? `?${suffix}` : ""
    }`;
  }, [appliedQuery, templateId]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<
    Map<string, { id: string; name: string }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const latestRequestId = useRef(0);

  const loadPage = useCallback(
    async ({
      query,
      filter,
      trail,
    }: {
      query: string;
      filter: string;
      trail: string[];
    }) => {
      const requestId = ++latestRequestId.current;
      const safeTrail = normalizePublicReferralCursorTrail(trail);
      setLoading(true);
      setError(false);
      setExpandedIds(new Set());
      setCursorTrail(safeTrail);

      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (filter) params.set("templateId", filter);
      const cursor = safeTrail.at(-1);
      if (cursor) params.set("cursor", cursor);
      params.set("take", "25");

      try {
        const response = await fetch(
          `/api/assessments/referred-results?${params.toString()}`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
        );
        const payload = (await response.json()) as ReferredResultsResponse;
        if (requestId !== latestRequestId.current) return;
        if (!response.ok || !payload.success || !Array.isArray(payload.items)) {
          throw new Error("Request failed");
        }

        setItems(payload.items);
        setNextCursor(payload.nextCursor ?? null);
        setTotalCount(
          typeof payload.totalCount === "number" &&
            Number.isInteger(payload.totalCount) &&
            payload.totalCount >= 0
            ? payload.totalCount
            : null,
        );
        setOwnedTotalCount(
          typeof payload.ownedTotalCount === "number" &&
            Number.isInteger(payload.ownedTotalCount) &&
            payload.ownedTotalCount >= 0
            ? payload.ownedTotalCount
            : null,
        );
        setTemplates((current) => {
          const updated = new Map(current);
          const options =
            payload.assessmentOptions ??
            payload.items!.map((item) => item.template);
          for (const template of options) {
            updated.set(template.id, {
              id: template.id,
              name: template.name,
            });
          }
          return updated;
        });
        updateBrowserQuery({
          query,
          templateId: filter,
          cursorTrail: safeTrail,
        });
      } catch {
        if (requestId !== latestRequestId.current) return;
        setItems([]);
        setNextCursor(null);
        setError(true);
      } finally {
        if (requestId === latestRequestId.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadPage({
      query: initialState.query,
      filter: initialState.templateId,
      trail: initialState.cursorTrail,
    });
    return () => {
      latestRequestId.current += 1;
    };
  }, [initialState, loadPage]);

  const assessmentOptions = useMemo(
    () =>
      [...templates.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [templates],
  );

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = inputQuery.trim().replace(/\s+/g, " ");
    setInputQuery(query);
    setAppliedQuery(query);
    void loadPage({ query, filter: templateId, trail: [] });
  }

  function changeAssessment(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    void loadPage({
      query: appliedQuery,
      filter: nextTemplateId,
      trail: [],
    });
  }

  function toggleDetails(submissionId: string) {
    setExpandedIds((current) => {
      const updated = new Set(current);
      if (updated.has(submissionId)) updated.delete(submissionId);
      else updated.add(submissionId);
      return updated;
    });
  }

  function nextPage() {
    if (
      !nextCursor ||
      cursorTrail.length >= MAX_PUBLIC_REFERRAL_CURSOR_TRAIL
    ) {
      return;
    }
    const trail = [...cursorTrail, nextCursor];
    void loadPage({
      query: appliedQuery,
      filter: templateId,
      trail,
    });
  }

  function previousPage() {
    if (pageIndex === 0) return;
    void loadPage({
      query: appliedQuery,
      filter: templateId,
      trail: cursorTrail.slice(0, -1),
    });
  }

  return (
    <div className="space-y-5">
      {coachLink && (
        <section className="grid gap-4 rounded-xl border border-primary/25 border-l-4 border-l-primary bg-gradient-to-r from-card to-primary/[0.03] p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">
              Your Quick Assessment link
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Share this link. Completed assessments will appear below.
            </p>
            <div className="mt-3 flex min-w-0 items-center gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
                title={coachLink}
              >
                {coachLink}
              </code>
              <CopyLinkButton url={coachLink} />
            </div>
          </div>
          <div className="border-border text-left md:min-w-32 md:border-l md:pl-5 md:text-center">
            <strong className="block font-serif text-3xl font-normal text-primary">
              {ownedTotalCount ?? "—"}
            </strong>
            <span className="text-xs text-muted-foreground">
              referred results
            </span>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <form
          role="search"
          onSubmit={submitSearch}
          className="flex min-w-0 flex-1 gap-2"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="referred-results-search" className="sr-only">
              Search referred results
            </label>
            <input
              id="referred-results-search"
              type="search"
              value={inputQuery}
              onChange={(event) => setInputQuery(event.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Search
          </button>
        </form>
        <div>
          <label
            htmlFor="referred-results-assessment"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Assessment
          </label>
          <select
            id="referred-results-assessment"
            value={templateId}
            onChange={(event) => changeAssessment(event.target.value)}
            className="w-full min-w-52 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All assessments</option>
            {assessmentOptions.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        {!loading && !error && totalCount !== null && totalCount > 0 ? (
          <a
            href={exportHref}
            aria-label="Export filtered referred results as CSV"
            className="rounded-md bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Export CSV
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Export filtered referred results as CSV"
            className="cursor-not-allowed rounded-md border border-border px-3 py-2 text-sm font-semibold text-muted-foreground opacity-60"
          >
            Export CSV
          </button>
        )}
        <p className="pb-2 text-xs text-muted-foreground md:ml-auto">
          {loading
            ? "Loading…"
            : `${totalCount ?? "—"} results · newest first`}
        </p>
      </div>

      {loading ? (
        <div
          role="status"
          className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground"
        >
          Loading referred results…
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-border bg-card p-8 text-center"
        >
          <p className="text-sm text-muted-foreground">
            We couldn’t load referred results. Please try again.
          </p>
          <button
            type="button"
            onClick={() =>
              void loadPage({
                query: appliedQuery,
                filter: templateId,
                trail: cursorTrail,
              })
            }
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {appliedQuery || templateId
              ? "No referred results match your search or assessment filter."
              : "Results will appear here after someone submits through your coach link."}
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <table
            aria-label="Referred results"
            className="hidden w-full border-collapse md:table"
          >
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {["Taker", "Assessment", "Result", "Submitted", ""].map(
                  (label, index) => (
                    <th
                      key={`${label}-${index}`}
                      scope="col"
                      className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const submitted = formatSubmitted(item.submittedAt);
                const expanded = expandedIds.has(item.submissionId);
                const detailsId = `referral-domains-${item.submissionId}-desktop`;
                return (
                  <Fragment key={item.submissionId}>
                    <tr className="border-b border-border last:border-b-0">
                      <td className="px-4 py-4 align-middle">
                        <strong className="block text-sm text-foreground">
                          {item.takerName}
                        </strong>
                        {item.takerEmail && (
                          <span className="text-xs text-muted-foreground">
                            {item.takerEmail}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <strong className="block text-sm text-foreground">
                          {item.template.name}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          Public assessment
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <ResultSummary summary={item.summary} />
                      </td>
                      <td className="px-4 py-4 align-middle text-sm text-foreground">
                        {submitted.date}
                        {submitted.time && (
                          <span className="block text-xs text-muted-foreground">
                            {submitted.time}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <ResultActions
                          item={item}
                          expanded={expanded}
                          onToggle={() => toggleDetails(item.submissionId)}
                          suffix="desktop"
                        />
                      </td>
                    </tr>
                    {expanded && fourDecisionDomains(item.summary) && (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={5} className="px-4 pb-4">
                          <DomainBreakdown
                            id={detailsId}
                            summary={item.summary}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div
            role="list"
            data-testid="referred-results-mobile"
            className="divide-y divide-border md:hidden"
          >
            {items.map((item) => {
              const submitted = formatSubmitted(item.submittedAt);
              const expanded = expandedIds.has(item.submissionId);
              const detailsId = `referral-domains-${item.submissionId}-mobile`;
              return (
                <article
                  role="listitem"
                  key={item.submissionId}
                  className="space-y-4 p-4"
                >
                  <div>
                    <strong className="block text-sm text-foreground">
                      {item.takerName}
                    </strong>
                    {item.takerEmail && (
                      <span className="text-xs text-muted-foreground">
                        {item.takerEmail}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Assessment
                      </span>
                      <span className="text-sm text-foreground">
                        {item.template.name}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Submitted
                      </span>
                      <span className="text-sm text-foreground">
                        {submitted.date}
                      </span>
                    </div>
                  </div>
                  <ResultSummary summary={item.summary} />
                  <ResultActions
                    item={item}
                    expanded={expanded}
                    onToggle={() => toggleDetails(item.submissionId)}
                    suffix="mobile"
                  />
                  {expanded && (
                    <DomainBreakdown id={detailsId} summary={item.summary} />
                  )}
                </article>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Showing {pageIndex * 25 + 1}–
              {Math.min(pageIndex * 25 + items.length, totalCount ?? Infinity)}{" "}
              of {totalCount ?? "—"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={previousPage}
                disabled={pageIndex === 0}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={nextPage}
                disabled={
                  !nextCursor ||
                  cursorTrail.length >= MAX_PUBLIC_REFERRAL_CURSOR_TRAIL
                }
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
