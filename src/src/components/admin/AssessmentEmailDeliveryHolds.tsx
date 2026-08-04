"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { z } from "zod";

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

const DRIFT_REASON_LABELS: Record<string, string> = {
  CAMPAIGN_DELETED: "Campaign deleted or missing",
  CAMPAIGN_STATUS_CHANGED: "Campaign status or access changed",
  CAMPAIGN_DEADLINE_CHANGED: "Campaign deadline changed",
  INVITATION_REVOKED: "Invitation revoked or status changed",
  INVITATION_EXPIRY_CHANGED: "Invitation expiry changed",
  IDENTITY_LINK_CHANGED: "Identity link changed",
  RESPONDENT_EMAIL_CHANGED: "Respondent email changed",
  COACH_OWNER_CHANGED: "Owning coach changed",
  COACH_EMAIL_CHANGED: "Owning coach email changed",
  TEMPLATE_CHANGED: "Assessment template changed",
  VERSION_CHANGED: "Assessment template version changed",
  APPROVAL_REVOKED: "Template email approval revoked",
  APPROVAL_HASH_CHANGED: "Approved content hash changed",
  FEATURE_DISABLED: "Feature gate disabled",
  PAYLOAD_INTEGRITY_FAILED: "Frozen payload integrity failed",
  SCHEMA_UNSUPPORTED: "Snapshot or renderer contract unsupported",
  RETRY_EXHAUSTED: "Automatic retry budget exhausted",
};

const holdReasonSchema = z.enum([
  "CAMPAIGN_DELETED",
  "CAMPAIGN_STATUS_CHANGED",
  "CAMPAIGN_DEADLINE_CHANGED",
  "INVITATION_REVOKED",
  "INVITATION_EXPIRY_CHANGED",
  "IDENTITY_LINK_CHANGED",
  "RESPONDENT_EMAIL_CHANGED",
  "COACH_OWNER_CHANGED",
  "COACH_EMAIL_CHANGED",
  "TEMPLATE_CHANGED",
  "VERSION_CHANGED",
  "APPROVAL_REVOKED",
  "APPROVAL_HASH_CHANGED",
  "FEATURE_DISABLED",
  "PAYLOAD_INTEGRITY_FAILED",
  "SCHEMA_UNSUPPORTED",
  "RETRY_EXHAUSTED",
]);
const requiredStringSchema = z.string().min(1);
const nullableStringSchema = requiredStringSchema.nullable();
const dateTimeSchema = z.string().datetime();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const frozenCommonBaseSchema = z
  .object({
    campaignId: requiredStringSchema,
    invitationId: requiredStringSchema,
    respondentId: requiredStringSchema,
    templateId: requiredStringSchema,
    templateAlias: requiredStringSchema,
    versionId: requiredStringSchema,
    accessMode: z.literal("INVITED"),
    campaignStatus: requiredStringSchema,
    campaignDeleted: z.boolean(),
    invitationStatus: z.literal("SUBMITTED"),
    invitationRevoked: z.boolean(),
    closeAt: dateTimeSchema.nullable(),
    invitationExpiresAt: dateTimeSchema,
    phase2Fingerprint: sha256Schema,
  })
  .strict();

const authorizationSnapshotSchema = z.union([
  z
    .object({
      schemaVersion: z.literal(1),
      common: frozenCommonBaseSchema.extend({
        recipientRole: z.literal("RESPONDENT"),
        emailType: z.literal("ASSESSMENT_RESULTS"),
      }),
      respondentResults: z
        .object({
          canonicalRecipientMailbox: requiredStringSchema,
          sendResultsToRespondent: z.literal(true),
          featureKey: z.literal("WAVE_D_RESULTS_EMAIL_ENABLED"),
          featureEnabled: z.literal(true),
          approved: z.literal(true),
          approvedContentHash: sha256Schema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      common: frozenCommonBaseSchema.extend({
        recipientRole: z.literal("OWNING_COACH"),
        emailType: z.literal("COACH_COMPLETION"),
      }),
      coachCompletion: z
        .object({
          canonicalRecipientMailbox: requiredStringSchema,
          notifyCoachOnCompletion: z.literal(true),
          featureKey: z.literal("WAVE_D_COACH_NOTIFY_ENABLED"),
          featureEnabled: z.literal(true),
          coachId: requiredStringSchema,
        })
        .strict(),
    })
    .strict(),
]);

const contentProvenanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateId: requiredStringSchema,
    versionId: requiredStringSchema,
    templateAlias: requiredStringSchema,
    reportType: requiredStringSchema,
    approvalHash: sha256Schema.nullable(),
    rendererContractVersion: z.literal(1),
    sourceCommit: requiredStringSchema,
    renderInputHash: sha256Schema,
  })
  .strict();

const currentAuthorizationFactsSchema = z
  .object({
    submission: z
      .object({
        exists: z.boolean(),
        campaignId: nullableStringSchema,
        invitationId: nullableStringSchema,
        respondentId: nullableStringSchema,
      })
      .strict(),
    campaign: z
      .object({
        exists: z.boolean(),
        templateId: nullableStringSchema,
        versionId: nullableStringSchema,
        accessMode: nullableStringSchema,
        status: nullableStringSchema,
        deleted: z.boolean().nullable(),
        closeAt: dateTimeSchema.nullable(),
        sendResultsToRespondent: z.boolean().nullable(),
        notifyCoachOnCompletion: z.boolean().nullable(),
        createdByCoachId: nullableStringSchema,
      })
      .strict(),
    invitation: z
      .object({
        exists: z.boolean(),
        campaignId: nullableStringSchema,
        respondentId: nullableStringSchema,
        status: nullableStringSchema,
        revoked: z.boolean().nullable(),
        expiresAt: dateTimeSchema.nullable(),
      })
      .strict(),
    respondent: z
      .object({
        exists: z.boolean(),
        canonicalMailbox: nullableStringSchema,
      })
      .strict(),
    template: z
      .object({
        exists: z.boolean(),
        alias: nullableStringSchema,
        resultsEmailApproved: z.boolean().nullable(),
        storedApprovedContentHash: nullableStringSchema,
        liveContentHash: nullableStringSchema,
      })
      .strict(),
    version: z
      .object({
        exists: z.boolean(),
        templateId: nullableStringSchema,
      })
      .strict(),
    coach: z
      .object({
        exists: z.boolean(),
        id: nullableStringSchema,
        canonicalMailbox: nullableStringSchema,
      })
      .strict()
      .nullable(),
    features: z
      .object({
        resultsEmailEnabled: z.boolean(),
        coachNotifyEnabled: z.boolean(),
      })
      .strict(),
  })
  .strict();

const driftDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("AUTHORIZED") }).strict(),
  z
    .object({
      kind: z.literal("HELD"),
      primaryReason: holdReasonSchema,
      reasons: z.array(holdReasonSchema).min(1),
    })
    .strict()
    .superRefine((decision, context) => {
      if (!decision.reasons.includes(decision.primaryReason)) {
        context.addIssue({
          code: "custom",
          message: "The primary drift reason must appear in the reason list.",
        });
      }
    }),
]);

const heldDetailSchema = z
  .object({
    kind: z.literal("RELEASE_OR_CANCEL"),
    id: requiredStringSchema,
    submissionId: requiredStringSchema,
    campaignId: requiredStringSchema,
    invitationId: requiredStringSchema,
    respondentId: requiredStringSchema,
    recipientRole: z.enum(["RESPONDENT", "OWNING_COACH"]),
    emailType: z.enum(["ASSESSMENT_RESULTS", "COACH_COMPLETION"]),
    recipientEmail: requiredStringSchema,
    subject: z.string(),
    previewDocument: requiredStringSchema,
    payloadHash: sha256Schema,
    snapshotSchemaVersion: z.number().int().nonnegative(),
    rendererContractVersion: z.number().int().nonnegative(),
    authorizationSnapshot: authorizationSnapshotSchema,
    contentProvenance: contentProvenanceSchema,
    status: z.literal("HELD"),
    version: z.number().int().nonnegative(),
    holdReason: holdReasonSchema.nullable(),
    holdReasons: z.array(holdReasonSchema),
    heldAt: dateTimeSchema.nullable(),
    expiresAt: dateTimeSchema,
    current: currentAuthorizationFactsSchema,
    drift: driftDecisionSchema,
    reviewContextHash: sha256Schema,
    reviewToken: requiredStringSchema,
  })
  .strict()
  .superRefine((detail, context) => {
    const snapshot = detail.authorizationSnapshot;
    const common = snapshot.common;
    const expectedMailbox =
      "respondentResults" in snapshot
        ? snapshot.respondentResults.canonicalRecipientMailbox
        : snapshot.coachCompletion.canonicalRecipientMailbox;
    const approvalProvenanceMatches =
      "respondentResults" in snapshot
        ? detail.contentProvenance.approvalHash ===
          snapshot.respondentResults.approvedContentHash
        : detail.contentProvenance.approvalHash === null;
    const bindingsMatch =
      detail.campaignId === common.campaignId &&
      detail.invitationId === common.invitationId &&
      detail.respondentId === common.respondentId &&
      detail.recipientRole === common.recipientRole &&
      detail.emailType === common.emailType &&
      canonicalMailboxBinding(detail.recipientEmail) ===
        canonicalMailboxBinding(expectedMailbox) &&
      detail.contentProvenance.templateId === common.templateId &&
      detail.contentProvenance.versionId === common.versionId &&
      detail.contentProvenance.templateAlias === common.templateAlias &&
      detail.snapshotSchemaVersion === snapshot.schemaVersion &&
      detail.contentProvenance.schemaVersion === snapshot.schemaVersion &&
      detail.rendererContractVersion ===
        detail.contentProvenance.rendererContractVersion &&
      approvalProvenanceMatches;
    if (!bindingsMatch) {
      context.addIssue({
        code: "custom",
        message: "Held detail identity and role evidence must stay bound.",
      });
    }
  });

const cancellationOnlyDetailSchema = z
  .object({
    kind: z.literal("CANCELLATION_ONLY"),
    id: requiredStringSchema,
    submissionId: requiredStringSchema,
    campaignId: requiredStringSchema,
    invitationId: requiredStringSchema,
    respondentId: requiredStringSchema,
    status: z.literal("HELD"),
    version: z.number().int().nonnegative(),
    holdReason: holdReasonSchema.nullable(),
    holdReasons: z.array(holdReasonSchema),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    heldAt: dateTimeSchema.nullable(),
    expiresAt: dateTimeSchema,
  })
  .strict();

const heldDetailResponseSchema = z
  .object({
    data: z.discriminatedUnion("kind", [
      heldDetailSchema,
      cancellationOnlyDetailSchema,
    ]),
  })
  .strict();

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
  } | null;
};

type HeldDetail = z.infer<typeof heldDetailSchema>;
type CancellationOnlyDetail = z.infer<typeof cancellationOnlyDetailSchema>;
type ReviewDetail = HeldDetail | CancellationOnlyDetail;
type ResolutionResponse = {
  intentId: string;
  status: "HANDED_OFF" | "CANCELLED";
  version: number;
  outboxId: string | null;
  existingOutboxWon: boolean;
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
  if (!isRecord(value)) return false;
  const provenance =
    value.provenance === null ||
    (isRecord(value.provenance) &&
      typeof value.provenance.templateId === "string" &&
      typeof value.provenance.versionId === "string" &&
      typeof value.provenance.templateAlias === "string" &&
      typeof value.provenance.reportType === "string" &&
      typeof value.provenance.rendererContractVersion === "number");
  return (
    provenance &&
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

function parseDetailResponse(
  value: unknown,
  requestedIntentId: string,
): ReviewDetail | null {
  const parsed = heldDetailResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.data.id !== requestedIntentId) return null;
  return parsed.data.data;
}

function parseResolutionResponse(
  value: unknown,
  intentId: string,
  action: "release" | "cancel",
): ResolutionResponse | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const data = value.data;
  if (
    data.intentId === intentId &&
    data.status === (action === "release" ? "HANDED_OFF" : "CANCELLED") &&
    typeof data.version === "number" &&
    (data.outboxId === null || typeof data.outboxId === "string") &&
    typeof data.existingOutboxWon === "boolean"
  ) {
    return data as ResolutionResponse;
  }
  return null;
}

function canonicalMailboxBinding(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
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
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [staleReview, setStaleReview] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [cancellationReason, setCancellationReason] = useState<string>(
    CANCELLATION_REASONS[0][0],
  );
  const [resolutionNotice, setResolutionNotice] = useState<string | null>(null);
  const detailRequestGeneration = useRef(0);

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
    const generation = detailRequestGeneration.current + 1;
    detailRequestGeneration.current = generation;
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
      const parsed = response.ok ? parseDetailResponse(body, intentId) : null;
      if (!parsed) throw new Error("DETAIL_UNAVAILABLE");
      if (generation !== detailRequestGeneration.current) return;
      setDetail(parsed);
    } catch {
      if (generation !== detailRequestGeneration.current) return;
      setDetailError(
        "The audited held-intent detail could not be loaded. Try again.",
      );
    } finally {
      if (generation === detailRequestGeneration.current) {
        setDetailLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const resolve = useCallback(
    async (action: "release" | "cancel") => {
      if (!detail || resolving || staleReview) return;
      if (action === "release" && detail.kind !== "RELEASE_OR_CANCEL") {
        return;
      }
      setResolving(true);
      setDetailError(null);
      try {
        const payload =
          action === "release"
            ? {
                expectedVersion: detail.version,
                reasonCode: RELEASE_REASON,
                reviewToken:
                  detail.kind === "RELEASE_OR_CANCEL"
                    ? detail.reviewToken
                    : "",
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
        const resolution = parseResolutionResponse(body, detail.id, action);
        if (!resolution) {
          throw new Error("RESOLUTION_RESPONSE_INVALID");
        }
        setRows((existing) => existing.filter((row) => row.id !== detail.id));
        setSelectedId(null);
        setDetail(null);
        setResolutionNotice(
          action === "release"
            ? resolution.existingOutboxWon
              ? "Existing outbox remained authoritative; no new delivery was enqueued."
              : "Frozen payload queued for delivery."
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

          {detail?.kind === "CANCELLATION_ONLY" && (
            <div>
              <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-4 sm:px-6">
                <div className="flex items-start gap-3">
                  <ShieldAlert
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                  />
                  <div>
                    <h2
                      id="held-detail-heading"
                      className="font-bold text-foreground"
                    >
                      Cancellation-only review
                    </h2>
                    <p className="mt-1 text-sm leading-5 text-foreground/80">
                      Release evidence could not be validated, so no payload
                      content is shown and release is unavailable. Permanent,
                      audited cancellation remains available until expiry.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-4 sm:p-6">
                <section aria-labelledby="safe-hold-evidence-heading">
                  <h3
                    id="safe-hold-evidence-heading"
                    className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    Safe hold evidence
                  </h3>
                  <dl className="mt-3 grid gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2">
                    <Fact label="Intent ID" value={detail.id} />
                    <Fact label="Submission ID" value={detail.submissionId} />
                    <Fact label="Campaign ID" value={detail.campaignId} />
                    <Fact
                      label="Primary reason"
                      value={reasonLabel(detail.holdReason ?? "HELD")}
                    />
                    <Fact
                      label="Held since"
                      value={formatDate(detail.heldAt)}
                    />
                    <Fact
                      label="Expires"
                      value={formatDate(detail.expiresAt)}
                    />
                  </dl>
                </section>

                <section
                  aria-labelledby="cancellation-only-resolution-heading"
                  className="border-t border-border pt-6"
                >
                  <div className="max-w-xl rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <h3
                      id="cancellation-only-resolution-heading"
                      className="text-sm font-bold text-foreground"
                    >
                      Cancel permanently
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Purges the held payload and cannot be undone.
                    </p>
                    <label
                      htmlFor="cancellation-only-reason"
                      className="mt-3 block text-xs font-semibold text-foreground"
                    >
                      Cancellation reason
                    </label>
                    <select
                      id="cancellation-only-reason"
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

          {detail?.kind === "RELEASE_OR_CANCEL" && (
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
  const currentSubmission = recordAt(detail.current, "submission");
  const currentCampaign = recordAt(detail.current, "campaign");
  const currentInvitation = recordAt(detail.current, "invitation");
  const currentRespondent = recordAt(detail.current, "respondent");
  const currentCoach = recordAt(detail.current, "coach");
  const currentTemplate = recordAt(detail.current, "template");
  const currentVersion = recordAt(detail.current, "version");
  const currentFeatures = recordAt(detail.current, "features");
  const frozenMailbox =
    frozenRespondent.canonicalRecipientMailbox ??
    frozenCoach.canonicalRecipientMailbox;
  const currentMailbox =
    frozenCommon.recipientRole === "OWNING_COACH"
      ? currentCoach.canonicalMailbox
      : currentRespondent.canonicalMailbox;
  const driftReasons =
    detail.drift.kind === "HELD" ? detail.drift.reasons : [];
  const storedHoldReasons = detail.holdReasons;
  const reviewReasons = Array.from(
    new Set([
      ...(detail.holdReason ? [detail.holdReason] : []),
      ...storedHoldReasons,
      ...driftReasons,
    ]),
  );
  const isRespondent = frozenCommon.recipientRole === "RESPONDENT";
  const isCoach = frozenCommon.recipientRole === "OWNING_COACH";

  const facts: Array<{
    group: string;
    label: string;
    frozen: unknown;
    current?: unknown;
    evidenceOnly?: boolean;
  }> = [
    {
      group: "Identity links",
      label: "Submission exists",
      frozen: true,
      current: currentSubmission.exists,
    },
    {
      group: "Identity links",
      label: "Submission campaign ID",
      frozen: frozenCommon.campaignId,
      current: currentSubmission.campaignId,
    },
    {
      group: "Identity links",
      label: "Submission invitation ID",
      frozen: frozenCommon.invitationId,
      current: currentSubmission.invitationId,
    },
    {
      group: "Identity links",
      label: "Submission respondent ID",
      frozen: frozenCommon.respondentId,
      current: currentSubmission.respondentId,
    },
    {
      group: "Campaign",
      label: "Campaign exists",
      frozen: true,
      current: currentCampaign.exists,
    },
    {
      group: "Campaign",
      label: "Campaign access mode",
      frozen: frozenCommon.accessMode,
      current: currentCampaign.accessMode,
    },
    {
      group: "Campaign",
      label: "Campaign status",
      frozen: frozenCommon.campaignStatus,
      current: currentCampaign.status,
    },
    {
      group: "Campaign",
      label: "Campaign deleted",
      frozen: frozenCommon.campaignDeleted,
      current: currentCampaign.deleted,
    },
    {
      group: "Campaign",
      label: "Campaign deadline",
      frozen: frozenCommon.closeAt,
      current: currentCampaign.closeAt,
    },
    {
      group: "Campaign",
      label: "Campaign template ID",
      frozen: frozenCommon.templateId,
      current: currentCampaign.templateId,
    },
    {
      group: "Campaign",
      label: "Campaign version ID",
      frozen: frozenCommon.versionId,
      current: currentCampaign.versionId,
    },
    {
      group: "Campaign",
      label: "Send results to respondent",
      frozen: isRespondent
        ? frozenRespondent.sendResultsToRespondent
        : "Not applicable",
      current: isRespondent
        ? currentCampaign.sendResultsToRespondent
        : "Not applicable",
    },
    {
      group: "Campaign",
      label: "Notify owning coach",
      frozen: isCoach
        ? frozenCoach.notifyCoachOnCompletion
        : "Not applicable",
      current: isCoach
        ? currentCampaign.notifyCoachOnCompletion
        : "Not applicable",
    },
    {
      group: "Campaign",
      label: "Campaign owner coach ID",
      frozen: isCoach ? frozenCoach.coachId : "Not applicable",
      current: isCoach
        ? currentCampaign.createdByCoachId
        : "Not applicable",
    },
    {
      group: "Invitation",
      label: "Invitation exists",
      frozen: true,
      current: currentInvitation.exists,
    },
    {
      group: "Invitation",
      label: "Invitation campaign ID",
      frozen: frozenCommon.campaignId,
      current: currentInvitation.campaignId,
    },
    {
      group: "Invitation",
      label: "Invitation respondent ID",
      frozen: frozenCommon.respondentId,
      current: currentInvitation.respondentId,
    },
    {
      group: "Invitation",
      label: "Invitation status",
      frozen: frozenCommon.invitationStatus,
      current: currentInvitation.status,
    },
    {
      group: "Invitation",
      label: "Invitation revoked",
      frozen: frozenCommon.invitationRevoked,
      current: currentInvitation.revoked,
    },
    {
      group: "Invitation",
      label: "Invitation expiry",
      frozen: frozenCommon.invitationExpiresAt,
      current: currentInvitation.expiresAt,
    },
    {
      group: "Recipient",
      label: "Respondent exists",
      frozen: true,
      current: currentRespondent.exists,
    },
    {
      group: "Recipient",
      label: "Recipient mailbox",
      frozen: frozenMailbox,
      current: currentMailbox,
    },
    {
      group: "Template",
      label: "Template exists",
      frozen: true,
      current: currentTemplate.exists,
    },
    {
      group: "Template",
      label: "Template alias",
      frozen: frozenCommon.templateAlias,
      current: currentTemplate.alias,
    },
    {
      group: "Template",
      label: "Template approved",
      frozen: isRespondent ? frozenRespondent.approved : "Not applicable",
      current: isRespondent
        ? currentTemplate.resultsEmailApproved
        : "Not applicable",
    },
    {
      group: "Template",
      label: "Stored approved content hash",
      frozen: isRespondent
        ? frozenRespondent.approvedContentHash
        : "Not applicable",
      current: isRespondent
        ? currentTemplate.storedApprovedContentHash
        : "Not applicable",
    },
    {
      group: "Template",
      label: "Live approved content hash",
      frozen: isRespondent
        ? frozenRespondent.approvedContentHash
        : "Not applicable",
      current: isRespondent
        ? currentTemplate.liveContentHash
        : "Not applicable",
    },
    {
      group: "Version",
      label: "Version exists",
      frozen: true,
      current: currentVersion.exists,
    },
    {
      group: "Version",
      label: "Version template ID",
      frozen: frozenCommon.templateId,
      current: currentVersion.templateId,
    },
    {
      group: "Owning coach",
      label: "Owning coach exists",
      frozen: isCoach ? true : "Not applicable",
      current: isCoach ? currentCoach.exists : "Not applicable",
    },
    {
      group: "Owning coach",
      label: "Owning coach ID",
      frozen: isCoach ? frozenCoach.coachId : "Not applicable",
      current: isCoach ? currentCoach.id : "Not applicable",
    },
    {
      group: "Owning coach",
      label: "Owning coach mailbox",
      frozen: isCoach
        ? frozenCoach.canonicalRecipientMailbox
        : "Not applicable",
      current: isCoach ? currentCoach.canonicalMailbox : "Not applicable",
    },
    {
      group: "Feature gates",
      label: "Results email feature",
      frozen: isRespondent
        ? frozenRespondent.featureEnabled
        : "Not applicable",
      current: isRespondent
        ? currentFeatures.resultsEmailEnabled
        : "Not applicable",
    },
    {
      group: "Feature gates",
      label: "Coach notification feature",
      frozen: isCoach ? frozenCoach.featureEnabled : "Not applicable",
      current: isCoach
        ? currentFeatures.coachNotifyEnabled
        : "Not applicable",
    },
    {
      group: "Feature gates",
      label: "Feature key",
      frozen: isRespondent
        ? frozenRespondent.featureKey
        : frozenCoach.featureKey,
      evidenceOnly: true,
    },
    {
      group: "Contract",
      label: "Snapshot schema version",
      frozen: valueAt(detail.authorizationSnapshot, "schemaVersion"),
      current: detail.snapshotSchemaVersion,
    },
    {
      group: "Contract",
      label: "Renderer contract version",
      frozen: valueAt(
        detail.contentProvenance,
        "rendererContractVersion",
      ),
      current: detail.rendererContractVersion,
    },
    {
      group: "Contract",
      label: "Frozen payload integrity",
      frozen: `Verified before review · ${detail.payloadHash}`,
      evidenceOnly: true,
    },
    {
      group: "Contract",
      label: "Recipient role",
      frozen: frozenCommon.recipientRole,
      current: detail.recipientEmail ? detail.recipientRole : "—",
    },
    {
      group: "Contract",
      label: "Email type",
      frozen: frozenCommon.emailType,
      current: detail.emailType,
    },
    {
      group: "Contract",
      label: "Phase 2 fingerprint",
      frozen: frozenCommon.phase2Fingerprint,
      evidenceOnly: true,
    },
    {
      group: "Version",
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
        {reviewReasons.length > 0 && (
          <span className="text-xs font-semibold text-warning-foreground">
            {reviewReasons.length} review{" "}
            {reviewReasons.length === 1 ? "reason" : "reasons"}
          </span>
        )}
      </div>
      {reviewReasons.length > 0 && (
        <ul
          aria-label="Hold and drift reasons"
          className="mt-3 grid gap-2 sm:grid-cols-2"
        >
          {reviewReasons.map((reason) => (
            <li
              key={reason}
              className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2"
            >
              <code className="block break-all text-[0.6875rem] font-bold text-warning-foreground">
                {reason}
              </code>
              <span className="mt-0.5 block text-xs text-foreground">
                {DRIFT_REASON_LABELS[reason] ?? reasonLabel(reason)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Scope
              </th>
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
              const current = fact.evidenceOnly
                ? null
                : displayValue(fact.current);
              const changed =
                fact.evidenceOnly !== true && frozen !== current;
              return (
                <tr key={fact.label} className={changed ? "bg-warning/5" : ""}>
                  <td className="px-3 py-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground">
                    {fact.group}
                  </td>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-foreground">
                    {fact.label}
                  </th>
                  {fact.evidenceOnly ? (
                    <td
                      colSpan={2}
                      className="px-3 py-2.5 text-xs text-foreground"
                    >
                      <span className="break-all font-semibold">{frozen}</span>
                      <span className="ml-2 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-muted-foreground">
                        Evidence only
                      </span>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {frozen}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-xs font-semibold ${
                          changed
                            ? "text-warning-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {current}
                      </td>
                    </>
                  )}
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
