"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

const RELEASE_REASON = "DRIFT_REVIEWED_SEND_FROZEN";
const CANCELLATION_REASONS = [
  ["DELIVERY_NO_LONGER_AUTHORIZED", "Delivery no longer authorized"],
  ["RECIPIENT_SUPERSEDED", "Recipient superseded"],
  ["CAMPAIGN_RETIRED", "Campaign retired"],
  ["DUPLICATE_CONFIRMED", "Duplicate confirmed"],
  ["POLICY_DECISION", "Policy decision"],
] as const;

const STALE_REVIEW_ERRORS = new Set([
  "VERSION_CONFLICT",
  "REVIEW_TOKEN_INVALID",
  "REVIEW_TOKEN_EXPIRED",
  "REVIEW_TOKEN_ACTOR_MISMATCH",
  "REVIEW_TOKEN_INTENT_MISMATCH",
  "REVIEW_TOKEN_VERSION_MISMATCH",
  "REVIEW_CONTEXT_CHANGED",
]);

type HeldListRow = {
  id: string;
  version: number;
  submissionId: string;
  campaignId: string;
  recipientRole: string;
  emailType: string;
  maskedRecipient: string;
  holdReason: string;
  createdAt: string;
  heldAt: string;
  expiresAt: string;
  provenance: {
    templateId: string;
    versionId: string;
    templateAlias: string;
    reportType: string;
    rendererContractVersion: number;
  };
};

type HeldDetail = {
  id: string;
  recipientEmail: string;
  subject: string;
  previewDocument: string;
  version: number;
  holdReason: string | null;
  holdReasons: unknown;
  heldAt: string | null;
  expiresAt: string;
  authorizationSnapshot: unknown;
  contentProvenance: unknown;
  current: unknown;
  drift: unknown;
  reviewToken: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(value: unknown, ...path: string[]): Record<string, unknown> {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return {};
    current = current[key];
  }
  return isRecord(current) ? current : {};
}

function valueAt(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return current;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "—";
}

function isListRow(value: unknown): value is HeldListRow {
  if (!isRecord(value) || !isRecord(value.provenance)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.version === "number" &&
    typeof value.submissionId === "string" &&
    typeof value.campaignId === "string" &&
    typeof value.recipientRole === "string" &&
    typeof value.emailType === "string" &&
    typeof value.maskedRecipient === "string" &&
    typeof value.holdReason === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.heldAt === "string" &&
    typeof value.expiresAt === "string"
  );
}

function parseListResponse(value: unknown): {
  data: HeldListRow[];
  nextCursor: string | null;
} | null {
  if (!isRecord(value) || !Array.isArray(value.data)) return null;
  if (!value.data.every(isListRow)) return null;
  if (!(value.nextCursor === null || typeof value.nextCursor === "string")) {
    return null;
  }
  return { data: value.data, nextCursor: value.nextCursor };
}

function parseDetailResponse(value: unknown): HeldDetail | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const data = value.data;
  if (
    typeof data.id !== "string" ||
    typeof data.recipientEmail !== "string" ||
    typeof data.subject !== "string" ||
    typeof data.previewDocument !== "string" ||
    typeof data.version !== "number" ||
    typeof data.expiresAt !== "string" ||
    typeof data.reviewToken !== "string" ||
    !Object.prototype.hasOwnProperty.call(data, "authorizationSnapshot") ||
    !Object.prototype.hasOwnProperty.call(data, "current") ||
    !Object.prototype.hasOwnProperty.call(data, "drift")
  ) {
    return null;
  }
  return data as HeldDetail;
}

function isResolutionResponse(
  value: unknown,
  intentId: string,
  action: "release" | "cancel",
): boolean {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const data = value.data;
  return (
    data.intentId === intentId &&
    data.status === (action === "release" ? "HANDED_OFF" : "CANCELLED") &&
    typeof data.version === "number" &&
    (data.outboxId === null || typeof data.outboxId === "string") &&
    typeof data.existingOutboxWon === "boolean"
  );
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorCode(value: unknown): string | null {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : null;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function reasonLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function AssessmentEmailDeliveryHolds() {
  const [rows, setRows] = useState<HeldListRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HeldDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [staleReview, setStaleReview] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [cancellationReason, setCancellationReason] = useState(
    CANCELLATION_REASONS[0][0],
  );
  const [resolutionNotice, setResolutionNotice] = useState<string | null>(null);

  const loadList = useCallback(async (cursor?: string) => {
    setListLoading(true);
    setListError(null);
    try {
      const suffix = cursor
        ? `?${new URLSearchParams({ cursor }).toString()}`
        : "";
      const response = await fetch(
        `/api/admin/assessment-email-delivery-intents${suffix}`,
      );
      const body = await responseBody(response);
      const parsed = response.ok ? parseListResponse(body) : null;
      if (!parsed) throw new Error("LIST_UNAVAILABLE");
      setRows((existing) => (cursor ? [...existing, ...parsed.data] : parsed.data));
      setNextCursor(parsed.nextCursor);
    } catch {
      setListError("Held intents could not be loaded. Refresh the queue.");
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (intentId: string) => {
    setSelectedId(intentId);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setStaleReview(false);
    setResolutionNotice(null);
    try {
      const response = await fetch(
        `/api/admin/assessment-email-delivery-intents/${encodeURIComponent(intentId)}`,
      );
      const body = await responseBody(response);
      const parsed = response.ok ? parseDetailResponse(body) : null;
      if (!parsed) throw new Error("DETAIL_UNAVAILABLE");
      setDetail(parsed);
    } catch {
      setDetailError(
        "The audited held-intent detail could not be loaded. Try again.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const resolve = useCallback(
    async (action: "release" | "cancel") => {
      if (!detail || resolving || staleReview) return;
      setResolving(true);
      setDetailError(null);
      try {
        const payload =
          action === "release"
            ? {
                expectedVersion: detail.version,
                reasonCode: RELEASE_REASON,
                reviewToken: detail.reviewToken,
              }
            : {
                expectedVersion: detail.version,
                reasonCode: cancellationReason,
              };
        const response = await fetch(
          `/api/admin/assessment-email-delivery-intents/${encodeURIComponent(detail.id)}/${action}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const body = await responseBody(response);
        if (!response.ok) {
          const code = errorCode(body);
          if (code && STALE_REVIEW_ERRORS.has(code)) {
            setStaleReview(true);
            setDetailError(
              "This review is stale. Refresh the held intent before resolving it.",
            );
            return;
          }
          throw new Error("RESOLUTION_REJECTED");
        }
        if (!isResolutionResponse(body, detail.id, action)) {
          throw new Error("RESOLUTION_RESPONSE_INVALID");
        }
        setRows((existing) => existing.filter((row) => row.id !== detail.id));
        setSelectedId(null);
        setDetail(null);
        setResolutionNotice(
          action === "release"
            ? "Frozen payload released to the existing delivery queue."
            : "Held intent permanently cancelled.",
        );
      } catch {
        setDetailError(
          "The held intent was not resolved. Refresh its detail and try again.",
        );
      } finally {
        setResolving(false);
      }
    },
    [cancellationReason, detail, resolving, staleReview],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Assessment operations
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Delivery Holds
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Review frozen assessment emails whose authorization or delivery
            context changed after submission. Details are audited when opened.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadList()}
          disabled={listLoading}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${listLoading ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          Refresh queue
        </button>
      </header>

      {resolutionNotice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
          {resolutionNotice}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.6fr)]">
        <section
          aria-labelledby="held-queue-heading"
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2
                id="held-queue-heading"
                className="text-sm font-bold text-foreground"
              >
                Held queue
              </h2>
              <p className="text-xs text-muted-foreground">
                Oldest holds first · recipient masked
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold tabular-nums text-muted-foreground">
              {rows.length}
            </span>
          </div>

          {listError && (
            <p role="alert" className="px-4 py-6 text-sm text-destructive">
              {listError}
            </p>
          )}
          {!listError && !listLoading && rows.length === 0 && (
            <div className="px-4 py-10 text-center">
              <CheckCircle2
                aria-hidden="true"
                className="mx-auto h-6 w-6 text-success"
              />
              <p className="mt-2 text-sm font-semibold text-foreground">
                No held delivery intents
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                New holds will appear here without exposing payload content.
              </p>
            </div>
          )}
          {listLoading && rows.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading held intents…
            </p>
          )}

          <div className="divide-y divide-border">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                aria-label={`Review ${row.maskedRecipient}`}
                aria-pressed={selectedId === row.id}
                onClick={() => void loadDetail(row.id)}
                className={`block w-full px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  selectedId === row.id
                    ? "bg-primary/10"
                    : "hover:bg-muted/50"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-foreground">
                      {row.maskedRecipient}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.recipientRole} · {row.emailType}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-warning/15 px-2 py-1 text-[0.6875rem] font-bold text-warning-foreground">
                    HELD
                  </span>
                </span>
                <span className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <AlertTriangle
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-warning"
                  />
                  {reasonLabel(row.holdReason)}
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                  Expires {formatDate(row.expiresAt)}
                </span>
              </button>
            ))}
          </div>

          {nextCursor && (
            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={() => void loadList(nextCursor)}
                disabled={listLoading}
                className="w-full rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Load more holds
              </button>
            </div>
          )}
        </section>

        <section
          aria-labelledby="held-detail-heading"
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
        >
          {!selectedId && !detail && (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
              <ShieldAlert
                aria-hidden="true"
                className="h-7 w-7 text-muted-foreground"
              />
              <h2
                id="held-detail-heading"
                className="mt-3 text-base font-bold text-foreground"
              >
                Select a held intent
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Opening detail writes an audit record, then reveals the full
                recipient, subject, drift, and inert preview.
              </p>
            </div>
          )}

          {detailLoading && (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              Loading audited detail…
            </p>
          )}

          {detailError && (
            <div role="alert" className="border-b border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm font-semibold text-destructive">
                {detailError}
              </p>
              {staleReview && selectedId && (
                <button
                  type="button"
                  onClick={() => void loadDetail(selectedId)}
                  className="mt-3 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Refresh review
                </button>
              )}
            </div>
          )}

          {detail && (
            <div>
              <div className="sticky top-0 z-10 border-b border-warning/40 bg-warning/10 px-4 py-4 sm:px-6">
                <div className="flex items-start gap-3">
                  <ShieldAlert
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground"
                  />
                  <div>
                    <h2
                      id="held-detail-heading"
                      className="font-bold text-foreground"
                    >
                      Frozen payload — review only
                    </h2>
                    <p className="mt-1 text-sm leading-5 text-foreground/80">
                      Expires {formatDate(detail.expiresAt)}. Release sends the
                      exact stored payload; cancellation is permanent. Editing
                      or rerendering is not available.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-4 sm:p-6">
                <section aria-labelledby="frozen-envelope-heading">
                  <h3
                    id="frozen-envelope-heading"
                    className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    Audited frozen envelope
                  </h3>
                  <dl className="mt-3 grid gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2">
                    <Fact label="Recipient" value={detail.recipientEmail} />
                    <Fact label="Subject" value={detail.subject} />
                    <Fact
                      label="Held since"
                      value={formatDate(detail.heldAt)}
                    />
                    <Fact
                      label="Primary reason"
                      value={reasonLabel(detail.holdReason ?? "HELD")}
                    />
                  </dl>
                </section>

                <DriftComparison detail={detail} />

                <section aria-labelledby="preview-heading">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3
                        id="preview-heading"
                        className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
                      >
                        Inert frozen preview
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Navigation, scripts, forms, remote images, and external
                        loading are disabled.
                      </p>
                    </div>
                  </div>
                  <iframe
                    title="Frozen email preview"
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={detail.previewDocument}
                    className="mt-3 h-[30rem] w-full rounded-lg border border-border bg-white"
                  />
                </section>

                <section
                  aria-labelledby="resolution-heading"
                  className="grid gap-4 border-t border-border pt-6 lg:grid-cols-2"
                >
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <h3
                      id="resolution-heading"
                      className="text-sm font-bold text-foreground"
                    >
                      Release exact frozen payload
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Rechecks the global pause, duplicate ownership, payload
                      integrity, and reviewed context before handoff.
                    </p>
                    <button
                      type="button"
                      onClick={() => void resolve("release")}
                      disabled={resolving || staleReview}
                      className="mt-4 w-full rounded-md bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      Release frozen payload
                    </button>
                  </div>

                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <h3 className="text-sm font-bold text-foreground">
                      Cancel permanently
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Purges the held payload and cannot be undone.
                    </p>
                    <label
                      htmlFor="cancellation-reason"
                      className="mt-3 block text-xs font-semibold text-foreground"
                    >
                      Cancellation reason
                    </label>
                    <select
                      id="cancellation-reason"
                      value={cancellationReason}
                      onChange={(event) =>
                        setCancellationReason(event.target.value)
                      }
                      disabled={resolving || staleReview}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      {CANCELLATION_REASONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void resolve("cancel")}
                      disabled={resolving || staleReview}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-destructive px-3 py-2.5 text-sm font-bold text-destructive-foreground outline-none hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      <XCircle aria-hidden="true" className="h-4 w-4" />
                      Cancel permanently
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DriftComparison({ detail }: { detail: HeldDetail }) {
  const frozenCommon = recordAt(detail.authorizationSnapshot, "common");
  const frozenRespondent = recordAt(
    detail.authorizationSnapshot,
    "respondentResults",
  );
  const frozenCoach = recordAt(
    detail.authorizationSnapshot,
    "coachCompletion",
  );
  const currentCampaign = recordAt(detail.current, "campaign");
  const currentInvitation = recordAt(detail.current, "invitation");
  const currentRespondent = recordAt(detail.current, "respondent");
  const currentCoach = recordAt(detail.current, "coach");
  const currentTemplate = recordAt(detail.current, "template");
  const frozenMailbox =
    frozenRespondent.canonicalRecipientMailbox ??
    frozenCoach.canonicalRecipientMailbox;
  const currentMailbox =
    frozenCommon.recipientRole === "OWNING_COACH"
      ? currentCoach.canonicalMailbox
      : currentRespondent.canonicalMailbox;
  const driftReasons = valueAt(detail.drift, "reasons");

  const facts = [
    {
      label: "Campaign status",
      frozen: frozenCommon.campaignStatus,
      current: currentCampaign.status,
    },
    {
      label: "Campaign deadline",
      frozen: frozenCommon.closeAt,
      current: currentCampaign.closeAt,
    },
    {
      label: "Invitation status",
      frozen: frozenCommon.invitationStatus,
      current: currentInvitation.status,
    },
    {
      label: "Invitation expiry",
      frozen: frozenCommon.invitationExpiresAt,
      current: currentInvitation.expiresAt,
    },
    {
      label: "Recipient mailbox",
      frozen: frozenMailbox,
      current: currentMailbox,
    },
    {
      label: "Template alias",
      frozen: frozenCommon.templateAlias,
      current: currentTemplate.alias,
    },
    {
      label: "Template version",
      frozen: frozenCommon.versionId,
      current: currentCampaign.versionId,
    },
  ];

  return (
    <section aria-labelledby="drift-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="drift-heading"
          className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Submission snapshot vs current facts
        </h3>
        {Array.isArray(driftReasons) && (
          <span className="text-xs font-semibold text-warning-foreground">
            {driftReasons.length} drift{" "}
            {driftReasons.length === 1 ? "reason" : "reasons"}
          </span>
        )}
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Fact
              </th>
              <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Frozen
              </th>
              <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Current
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {facts.map((fact) => {
              const frozen = displayValue(fact.frozen);
              const current = displayValue(fact.current);
              const changed = frozen !== current;
              return (
                <tr key={fact.label} className={changed ? "bg-warning/5" : ""}>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-foreground">
                    {fact.label}
                  </th>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {frozen}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-xs font-semibold ${
                      changed ? "text-warning-foreground" : "text-foreground"
                    }`}
                  >
                    {current}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-foreground">
        {value}
      </dd>
    </div>
  );
}
