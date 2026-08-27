import { createHash } from "crypto";

import type { GroupReportProvenance } from "@/lib/assessments/group-report";
import type { CampaignGroupReport } from "@/lib/assessments/group-report-model";

import type { SummaryReportSourceRole } from "./types";
import type { ScalingCeoFullPeerBenchmark } from "./scaling-ceo-full-peer-benchmarks";

export type SnapshotJsonValue =
  | null
  | boolean
  | number
  | string
  | SnapshotJsonValue[]
  | { [key: string]: SnapshotJsonValue };

/** Compile-time shape produced by the immutable snapshot serialization boundary. */
export type JsonSafe<T> = unknown extends T
  ? SnapshotJsonValue
  : T extends Date
    ? string
    : T extends ReadonlyMap<string, infer TValue>
      ? Record<string, JsonSafe<TValue>>
      : T extends readonly (infer TEntry)[]
        ? JsonSafe<TEntry>[]
        : T extends null | boolean | number | string
          ? T
          : T extends object
            ? { [TKey in keyof T]: JsonSafe<T[TKey]> }
            : never;

export type FrozenCampaignGroupReport = JsonSafe<CampaignGroupReport>;

export type ScalingCeoFullProvenance = Omit<
  JsonSafe<GroupReportProvenance>,
  "ceoParticipantId"
> & {
  /** Canonical respondent selected for the explicit CEO source role. */
  ceoRespondentId: string;
};

export interface SelectedSummarySource {
  submissionId: string;
  sourceCampaignId: string;
  role: SummaryReportSourceRole;
  position: number;
}

export interface ScalingCeoFullSnapshot {
  schemaVersion: 1;
  reportType: "SCALING_CEO_FULL";
  destination: {
    campaignId: string;
    campaignName: string;
    organizationId: string;
    organizationName: string;
    templateId: string;
    templateAlias: "scaling-up-full";
    versionId: string;
    versionNumber: number;
    language: string;
  };
  createdAt: string;
  sources: Array<{
    submissionId: string;
    sourceCampaignId: string;
    role: "CEO" | "TEAM";
    position: number;
    submittedAt: string;
    respondent: { id: string; displayName: string; jobTitle: string | null };
    answers: SnapshotJsonValue;
    result: SnapshotJsonValue;
  }>;
  /** Summary-report-owned peer values frozen at immutable creation time. */
  peerBenchmark: JsonSafe<ScalingCeoFullPeerBenchmark>;
  reportModel: FrozenCampaignGroupReport;
  provenance: ScalingCeoFullProvenance;
}

export class SnapshotCanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotCanonicalizationError";
  }
}

function unsupported(path: string, type: string): never {
  throw new SnapshotCanonicalizationError(
    `Cannot canonicalize ${type} at ${path}`,
  );
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) unsupported(path, "non-finite number");
      return JSON.stringify(value);
    case "undefined":
      return unsupported(path, "undefined");
    case "bigint":
      return unsupported(path, "BigInt");
    case "function":
      return unsupported(path, "function");
    case "symbol":
      return unsupported(path, "symbol");
    case "object":
      break;
    default:
      return unsupported(path, typeof value);
  }

  if (value instanceof Date) return unsupported(path, "Date");
  if (ancestors.has(value)) {
    throw new SnapshotCanonicalizationError(
      "Cannot canonicalize cyclic object",
    );
  }

  ancestors.add(value);
  try {
    if (Object.getOwnPropertySymbols(value).length > 0)
      return unsupported(path, "symbol key");

    if (Array.isArray(value)) {
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          return unsupported(`${path}[${index}]`, "undefined");
        }
        entries.push(
          canonicalize(value[index], `${path}[${index}]`, ancestors),
        );
      }
      return `[${entries.join(",")}]`;
    }

    if (!isPlainObject(value)) return unsupported(path, "non-plain object");

    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`, ancestors)}`,
      )
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Produces a deterministic JSON representation suitable for immutable snapshots. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value, "$", new Set());
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
