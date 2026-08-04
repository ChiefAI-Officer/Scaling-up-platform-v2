# GH #233 Peer-Benchmark Auditability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `ADMIN`/`STAFF` Observability panel that truthfully reports the effective LVA peer-benchmark state, published-question prerequisites, and benchmark-key coverage without exposing environment inputs or benchmark values.

**Architecture:** A focused server-side audit service receives the already-derived effective Wave S gate, queries template/version/benchmark-key evidence with isolated failures, and returns a PII-free discriminated snapshot. A dedicated force-dynamic API route authorizes operators and a dedicated client panel fetches that snapshot independently of the existing dashboard and import-health surfaces.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma, Jest, React Testing Library, Tailwind CSS, existing Wave S flag/version/key helpers.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-08-04-gh-233-peer-benchmark-kill-visibility-design.md`; implementation must not broaden it.
- Do not return, log, display, or infer raw values for `WAVE_S_PEER_BENCHMARKS_KILL` or `WAVE_S_PEER_BENCHMARKS_ENABLED`.
- Derive only the effective runtime result through `isPeerBenchmarksEnabled()`, the same authority used by editor and report paths.
- Select only `metricKey` from `AssessmentBenchmark`; the diagnostic must never select or return `value`.
- The diagnostic is read-only: no audit rows, benchmark writes, schema changes, migrations, scheduled work, or stored status history.
- The surface lives only on `/admin/assessments/observability` and inherits its existing `ADMIN` plus `STAFF` authorization.
- Known zero, known missing, not applicable, and unknown are distinct. A failed read must never become off, empty, missing, or zero.
- A dark effective gate must not short-circuit template, active-version, rating-key, or stored-key evidence reads.
- The peer panel and endpoint fail independently; they must not break `ObservabilityDashboard` or `ImportHealthPanel`.
- No changes to `PeerBenchmarksPanel`, the benchmark `PUT` route, individual/group report joins, Wave S flags, or Production configuration.
- Do not touch GH #257 outbox-reconciliation or GH #256 Coach-image-host-policy files, documents, claims, or operations.
- No Production flag mutation, benchmark authoring, capability restoration, deployment, redeploy, or customer-data mutation is authorized.
- Before any code push, run targeted tests, the Wave S regression matrix, changed-file ESLint, and `CI=true npx next build --turbopack` from `src/`.
- Any implementation source-of-truth entry must say **implemented and locally verified only** until a separately authorized Production deployment is observed.

---

## File Structure

### Create

- `src/src/lib/assessments/peer-benchmark-audit.ts` — snapshot types, structural DB interface, isolated evidence reads, key-set comparison, sanitized logging, and readiness derivation.
- `src/src/__tests__/lib/assessments/peer-benchmark-audit.test.ts` — pure service classification, failure isolation, query-shape, privacy, and no-short-circuit coverage.
- `src/src/app/api/admin/assessments/peer-benchmark-status/route.ts` — privileged read-only route that derives the effective gate and delegates to the service.
- `src/src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts` — route authorization, derived-gate plumbing, partial-200, no-store, and 500 behavior.
- `src/src/components/admin/PeerBenchmarkStatusPanel.tsx` — independently refreshable status panel with no client-side derivation.
- `src/src/__tests__/components/peer-benchmark-status-panel.test.tsx` — loading, refresh, all readiness presentations, partial evidence, error isolation, and privacy copy.

### Modify

- `src/src/app/(dashboard)/admin/assessments/observability/page.tsx` — mount `PeerBenchmarkStatusPanel` after `ObservabilityDashboard` and before `ImportHealthPanel`.
- `CLAUDE.md` — update only the `LAST_UPDATED_ISO`/`LAST_UPDATED_SLUG` anchor and brief Project Context prose for the local-only implementation receipt.
- `plans/CHANGELOG.md` — prepend the detailed local-only implementation and verification entry; do not claim deployment or benchmark-row Production results.

### Explicitly Unchanged

- `src/src/lib/assessments/wave-s-flags.ts`
- `src/src/lib/assessments/peer-benchmarks.ts`
- `src/src/components/assessments/PeerBenchmarksPanel.tsx`
- `src/src/app/api/admin/assessment-templates/[id]/benchmarks/route.ts`
- all individual and group report loaders/renderers
- `src/prisma/schema.prisma` and `src/prisma/migrations/`

---

### Task 1: Build the read-only peer-benchmark audit service

**Files:**
- Create: `src/src/lib/assessments/peer-benchmark-audit.ts`
- Create: `src/src/__tests__/lib/assessments/peer-benchmark-audit.test.ts`
- Reference unchanged: `src/src/lib/assessments/active-version.ts`
- Reference unchanged: `src/src/lib/assessments/lva-report-display.ts`
- Reference unchanged: `src/src/lib/assessments/peer-benchmarks.ts`

**Interfaces:**
- Consumes: `LVA_TEMPLATE_ALIAS`, `DEFAULT_TEMPLATE_LANGUAGE`, `activePublishedWhere`, and `listRatingQuestionKeys(questions, alias)`.
- Produces:

```ts
export type EffectivePeerBenchmarkGate = "enabled" | "dark";
export type PeerBenchmarkReadiness =
  | "dark"
  | "blocked"
  | "noData"
  | "partialData"
  | "ready"
  | "unknown";

export type PeerBenchmarkEvidence<T> =
  | { state: "known"; value: T }
  | {
      state: "missing";
      reason: "template_not_found" | "active_version_not_found";
    }
  | {
      state: "notApplicable";
      reason: "template_missing" | "active_version_missing";
    }
  | {
      state: "unknown";
      reason: "query_failed" | "dependency_unknown";
    };

export interface PeerBenchmarkAuditSnapshot {
  generatedAt: string;
  targetAlias: typeof LVA_TEMPLATE_ALIAS;
  effectiveGate: PeerBenchmarkEvidence<EffectivePeerBenchmarkGate>;
  template: PeerBenchmarkEvidence<"present">;
  activeVersion: PeerBenchmarkEvidence<{
    versionNumber: number;
    language: string;
    publishedAt: string;
    ratingQuestionCount: number;
  }>;
  storedBenchmarks: PeerBenchmarkEvidence<{ storedRowCount: number }>;
  keyCoverage: PeerBenchmarkEvidence<{
    matchingRowCount: number;
    missingRatingQuestionCount: number;
    staleRowCount: number;
  }>;
  readiness: PeerBenchmarkReadiness;
}

export interface PeerBenchmarkAuditDb {
  assessmentTemplate: {
    findFirst(args: {
      where: { alias: string; deletedAt: null };
      select: { id: true; alias: true };
    }): Promise<{ id: string; alias: string } | null>;
  };
  assessmentTemplateVersion: {
    findFirst(args: {
      where: {
        templateId: string;
        language: string;
        publishedAt: { not: null };
        archivedAt: null;
      };
      orderBy: { versionNumber: "desc" };
      select: {
        versionNumber: true;
        language: true;
        publishedAt: true;
        questions: true;
      };
    }): Promise<{
      versionNumber: number;
      language: string;
      publishedAt: Date | null;
      questions: unknown;
    } | null>;
  };
  assessmentBenchmark: {
    findMany(args: {
      where: { templateId: string; metricKind: "QUESTION" };
      select: { metricKey: true };
    }): Promise<Array<{ metricKey: string }>>;
  };
}

export async function buildPeerBenchmarkAuditSnapshot(input: {
  db: PeerBenchmarkAuditDb;
  now: Date;
  effectiveGate: PeerBenchmarkEvidence<EffectivePeerBenchmarkGate>;
}): Promise<PeerBenchmarkAuditSnapshot>;
```

- Later tasks import these exact public names. Do not rename them in route or component code.

- [ ] **Step 1: Write the failing happy-path and query-shape tests**

Create `src/src/__tests__/lib/assessments/peer-benchmark-audit.test.ts` with a narrow fake DB and exact query assertions:

```ts
import {
  buildPeerBenchmarkAuditSnapshot,
  type PeerBenchmarkAuditDb,
  type PeerBenchmarkEvidence,
} from "@/lib/assessments/peer-benchmark-audit";

const NOW = new Date("2026-08-04T06:00:00.000Z");
const QUESTIONS = [
  { stableKey: "S3_people", type: "SLIDER_LIKERT", label: "People" },
  { stableKey: "S3_strategy", type: "SLIDER_LIKERT", label: "Strategy" },
  { stableKey: "S1_revenue", type: "NUMBER", label: "Revenue" },
];

function knownGate(
  value: "enabled" | "dark",
): PeerBenchmarkEvidence<"enabled" | "dark"> {
  return { state: "known", value };
}

function makeDb(options: {
  template?: { id: string; alias: string } | null;
  version?: {
    versionNumber: number;
    language: string;
    publishedAt: Date;
    questions: unknown;
  } | null;
  metricKeys?: string[];
} = {}) {
  const template =
    "template" in options
      ? options.template
      : { id: "tpl_lva", alias: "leadership-vision-alignment" };
  const version =
    "version" in options
      ? options.version
      : {
          versionNumber: 3,
          language: "enUS",
          publishedAt: new Date("2026-07-02T16:20:09.782Z"),
          questions: QUESTIONS,
        };
  const assessmentTemplate = {
    findFirst: jest.fn().mockResolvedValue(template),
  };
  const assessmentTemplateVersion = {
    findFirst: jest.fn().mockResolvedValue(version),
  };
  const assessmentBenchmark = {
    findMany: jest
      .fn()
      .mockResolvedValue((options.metricKeys ?? []).map((metricKey) => ({ metricKey }))),
  };
  return {
    db: {
      assessmentTemplate,
      assessmentTemplateVersion,
      assessmentBenchmark,
    } as PeerBenchmarkAuditDb,
    assessmentTemplate,
    assessmentTemplateVersion,
    assessmentBenchmark,
  };
}

afterEach(() => jest.restoreAllMocks());

it("classifies full active-key coverage as ready without selecting values", async () => {
  const { db, assessmentTemplateVersion, assessmentBenchmark } = makeDb({
    metricKeys: ["S3_people", "S3_strategy"],
  });

  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });

  expect(snapshot).toMatchObject({
    generatedAt: NOW.toISOString(),
    targetAlias: "leadership-vision-alignment",
    effectiveGate: { state: "known", value: "enabled" },
    template: { state: "known", value: "present" },
    activeVersion: {
      state: "known",
      value: {
        versionNumber: 3,
        language: "enUS",
        publishedAt: "2026-07-02T16:20:09.782Z",
        ratingQuestionCount: 2,
      },
    },
    storedBenchmarks: { state: "known", value: { storedRowCount: 2 } },
    keyCoverage: {
      state: "known",
      value: {
        matchingRowCount: 2,
        missingRatingQuestionCount: 0,
        staleRowCount: 0,
      },
    },
    readiness: "ready",
  });
  expect(assessmentTemplateVersion.findFirst).toHaveBeenCalledWith({
    where: {
      templateId: "tpl_lva",
      language: "enUS",
      publishedAt: { not: null },
      archivedAt: null,
    },
    orderBy: { versionNumber: "desc" },
    select: {
      versionNumber: true,
      language: true,
      publishedAt: true,
      questions: true,
    },
  });
  expect(assessmentBenchmark.findMany).toHaveBeenCalledWith({
    where: { templateId: "tpl_lva", metricKind: "QUESTION" },
    select: { metricKey: true },
  });
  expect(JSON.stringify(snapshot)).not.toContain("value\":6");
  expect(JSON.stringify(snapshot)).not.toContain("WAVE_S_PEER_BENCHMARKS");
});

it("keeps reading prerequisites while the effective capability is dark", async () => {
  const { db, assessmentTemplateVersion, assessmentBenchmark } = makeDb();
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("dark"),
  });

  expect(snapshot.readiness).toBe("dark");
  expect(assessmentTemplateVersion.findFirst).toHaveBeenCalledTimes(1);
  expect(assessmentBenchmark.findMany).toHaveBeenCalledTimes(1);
  expect(snapshot.activeVersion.state).toBe("known");
  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 0 },
  });
});
```

- [ ] **Step 2: Run the service test to verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/lib/assessments/peer-benchmark-audit.test.ts --runInBand
```

Expected: FAIL because `@/lib/assessments/peer-benchmark-audit` does not exist.

- [ ] **Step 3: Add the snapshot types, structural DB interface, and known-state implementation**

Create `src/src/lib/assessments/peer-benchmark-audit.ts`. Use the public interfaces above and these internal boundaries:

```ts
import {
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "@/lib/assessments/active-version";
import { LVA_TEMPLATE_ALIAS } from "@/lib/assessments/lva-report-display";
import { listRatingQuestionKeys } from "@/lib/assessments/peer-benchmarks";

type LoadedTemplate = { id: string; alias: string };
type ActiveVersionLoad = {
  evidence: PeerBenchmarkAuditSnapshot["activeVersion"];
  ratingKeys: Set<string> | null;
};
type StoredKeysLoad = {
  evidence: PeerBenchmarkAuditSnapshot["storedBenchmarks"];
  storedKeys: Set<string> | null;
};

function known<T>(value: T): PeerBenchmarkEvidence<T> {
  return { state: "known", value };
}

function deriveCoverage(
  activeKeys: ReadonlySet<string>,
  storedKeys: ReadonlySet<string>,
): {
  matchingRowCount: number;
  missingRatingQuestionCount: number;
  staleRowCount: number;
} {
  let matchingRowCount = 0;
  let missingRatingQuestionCount = 0;
  let staleRowCount = 0;
  for (const key of activeKeys) {
    if (storedKeys.has(key)) matchingRowCount += 1;
    else missingRatingQuestionCount += 1;
  }
  for (const key of storedKeys) {
    if (!activeKeys.has(key)) staleRowCount += 1;
  }
  return { matchingRowCount, missingRatingQuestionCount, staleRowCount };
}

function deriveReadiness(input: {
  effectiveGate: PeerBenchmarkEvidence<EffectivePeerBenchmarkGate>;
  template: PeerBenchmarkEvidence<"present">;
  activeVersion: PeerBenchmarkAuditSnapshot["activeVersion"];
  keyCoverage: PeerBenchmarkAuditSnapshot["keyCoverage"];
}): PeerBenchmarkReadiness {
  if (
    input.effectiveGate.state === "known" &&
    input.effectiveGate.value === "dark"
  ) {
    return "dark";
  }
  if (input.effectiveGate.state !== "known") return "unknown";
  if (input.template.state === "missing") return "blocked";
  if (input.activeVersion.state === "missing") return "blocked";
  if (
    input.activeVersion.state === "known" &&
    input.activeVersion.value.ratingQuestionCount === 0
  ) {
    return "blocked";
  }
  if (
    input.activeVersion.state !== "known" ||
    input.keyCoverage.state !== "known"
  ) {
    return "unknown";
  }
  const { matchingRowCount, missingRatingQuestionCount } =
    input.keyCoverage.value;
  if (matchingRowCount === 0) return "noData";
  if (missingRatingQuestionCount > 0) return "partialData";
  return "ready";
}
```

Implement the successful query flow exactly as follows:

1. Query the non-deleted LVA template by `LVA_TEMPLATE_ALIAS`.
2. When present, start the active-version and `metricKey`-only reads without consulting the gate.
3. Use `DEFAULT_TEMPLATE_LANGUAGE`, `activePublishedWhere`, and descending `versionNumber`.
4. Convert `publishedAt` to ISO only after verifying it is a `Date`; a published row with an invalid/null timestamp becomes unknown version evidence rather than a fabricated timestamp.
5. Use `listRatingQuestionKeys(version.questions, LVA_TEMPLATE_ALIAS)` and retain only a local `Set<string>`.
6. Return only counts and approved metadata.

The successful loader and builder should have this concrete shape; Steps 5–6
add the catches and missing/unknown branches around it:

```ts
async function loadActiveVersion(
  db: PeerBenchmarkAuditDb,
  templateId: string,
): Promise<ActiveVersionLoad> {
  const row = await db.assessmentTemplateVersion.findFirst({
    where: {
      templateId,
      language: DEFAULT_TEMPLATE_LANGUAGE,
      ...activePublishedWhere,
    },
    orderBy: { versionNumber: "desc" },
    select: {
      versionNumber: true,
      language: true,
      publishedAt: true,
      questions: true,
    },
  });
  if (!row) {
    return {
      evidence: {
        state: "missing",
        reason: "active_version_not_found",
      },
      ratingKeys: null,
    };
  }
  if (!(row.publishedAt instanceof Date)) {
    throw new TypeError("Published version has no publishedAt timestamp");
  }
  const ratingKeys = new Set(
    listRatingQuestionKeys(row.questions, LVA_TEMPLATE_ALIAS).map(
      ({ stableKey }) => stableKey,
    ),
  );
  return {
    evidence: known({
      versionNumber: row.versionNumber,
      language: row.language,
      publishedAt: row.publishedAt.toISOString(),
      ratingQuestionCount: ratingKeys.size,
    }),
    ratingKeys,
  };
}

async function loadStoredKeys(
  db: PeerBenchmarkAuditDb,
  templateId: string,
): Promise<StoredKeysLoad> {
  const rows = await db.assessmentBenchmark.findMany({
    where: { templateId, metricKind: "QUESTION" },
    select: { metricKey: true },
  });
  return {
    evidence: known({ storedRowCount: rows.length }),
    storedKeys: new Set(rows.map(({ metricKey }) => metricKey)),
  };
}
```

- [ ] **Step 4: Run the happy-path tests to verify GREEN**

Run:

```bash
npx jest src/__tests__/lib/assessments/peer-benchmark-audit.test.ts --runInBand
```

Expected: PASS for the first two tests.

- [ ] **Step 5: Add failing classification and partial-failure tests**

Append these cases to the same test file:

```ts
it.each([
  {
    name: "zero matching rows",
    keys: [],
    readiness: "noData",
    coverage: {
      matchingRowCount: 0,
      missingRatingQuestionCount: 2,
      staleRowCount: 0,
    },
  },
  {
    name: "partial active coverage",
    keys: ["S3_people"],
    readiness: "partialData",
    coverage: {
      matchingRowCount: 1,
      missingRatingQuestionCount: 1,
      staleRowCount: 0,
    },
  },
  {
    name: "all active keys plus a stale row",
    keys: ["S3_people", "S3_strategy", "S3_retired"],
    readiness: "ready",
    coverage: {
      matchingRowCount: 2,
      missingRatingQuestionCount: 0,
      staleRowCount: 1,
    },
  },
])("$name", async ({ keys, readiness, coverage }) => {
  const { db } = makeDb({ metricKeys: keys });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.readiness).toBe(readiness);
  expect(snapshot.keyCoverage).toEqual({ state: "known", value: coverage });
});

it("known missing template blocks readiness and marks dependents not applicable", async () => {
  const { db, assessmentTemplateVersion, assessmentBenchmark } = makeDb({
    template: null,
  });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot).toMatchObject({
    template: { state: "missing", reason: "template_not_found" },
    activeVersion: { state: "notApplicable", reason: "template_missing" },
    storedBenchmarks: { state: "notApplicable", reason: "template_missing" },
    keyCoverage: { state: "notApplicable", reason: "template_missing" },
    readiness: "blocked",
  });
  expect(assessmentTemplateVersion.findFirst).not.toHaveBeenCalled();
  expect(assessmentBenchmark.findMany).not.toHaveBeenCalled();
});

it("known missing active version blocks but preserves stored-row count", async () => {
  const { db } = makeDb({
    version: null,
    metricKeys: ["S3_retired"],
  });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.activeVersion).toEqual({
    state: "missing",
    reason: "active_version_not_found",
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 1 },
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "notApplicable",
    reason: "active_version_missing",
  });
  expect(snapshot.readiness).toBe("blocked");
});

it("active-version failure preserves a successful stored-key count", async () => {
  const { db, assessmentTemplateVersion } = makeDb({
    metricKeys: ["S3_people"],
  });
  assessmentTemplateVersion.findFirst.mockRejectedValueOnce(
    new Error("version read failed"),
  );
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.activeVersion).toEqual({
    state: "unknown",
    reason: "query_failed",
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 1 },
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.readiness).toBe("unknown");
  expect(errorSpy).toHaveBeenCalledWith(
    "Peer benchmark audit read failed",
    expect.objectContaining({
      stage: "active_version",
      name: "Error",
      message: "version read failed",
    }),
  );
  errorSpy.mockRestore();
});

it("stored-key failure preserves active-version evidence", async () => {
  const { db, assessmentBenchmark } = makeDb();
  assessmentBenchmark.findMany.mockRejectedValueOnce(
    new Error("benchmark read failed"),
  );
  jest.spyOn(console, "error").mockImplementation(() => {});
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.activeVersion.state).toBe("known");
  expect(snapshot.storedBenchmarks).toEqual({
    state: "unknown",
    reason: "query_failed",
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.readiness).toBe("unknown");
});

it("template read failure is unknown, never missing or zero", async () => {
  const { db, assessmentTemplate } = makeDb();
  assessmentTemplate.findFirst.mockRejectedValueOnce(new Error("template down"));
  jest.spyOn(console, "error").mockImplementation(() => {});
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.template).toEqual({
    state: "unknown",
    reason: "query_failed",
  });
  expect(snapshot.activeVersion).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "unknown",
    reason: "dependency_unknown",
  });
  expect(snapshot.readiness).toBe("unknown");
});

it("unknown effective-gate evidence does not suppress database evidence", async () => {
  const { db, assessmentTemplateVersion, assessmentBenchmark } = makeDb({
    metricKeys: ["S3_people", "S3_strategy"],
  });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: { state: "unknown", reason: "query_failed" },
  });
  expect(snapshot.readiness).toBe("unknown");
  expect(snapshot.activeVersion.state).toBe("known");
  expect(snapshot.storedBenchmarks.state).toBe("known");
  expect(assessmentTemplateVersion.findFirst).toHaveBeenCalledTimes(1);
  expect(assessmentBenchmark.findMany).toHaveBeenCalledTimes(1);
});
```

Also add one case where an active version has no `SLIDER_LIKERT` rows and assert
`ratingQuestionCount: 0`, `readiness: "blocked"`, and a known stored-row count:

```ts
it("blocks an active version with no rating questions without hiding stored rows", async () => {
  const { db } = makeDb({
    version: {
      versionNumber: 3,
      language: "enUS",
      publishedAt: new Date("2026-07-02T16:20:09.782Z"),
      questions: [
        { stableKey: "S1_revenue", type: "NUMBER", label: "Revenue" },
      ],
    },
    metricKeys: ["S3_retired"],
  });
  const snapshot = await buildPeerBenchmarkAuditSnapshot({
    db,
    now: NOW,
    effectiveGate: knownGate("enabled"),
  });
  expect(snapshot.activeVersion).toMatchObject({
    state: "known",
    value: { ratingQuestionCount: 0 },
  });
  expect(snapshot.storedBenchmarks).toEqual({
    state: "known",
    value: { storedRowCount: 1 },
  });
  expect(snapshot.keyCoverage).toEqual({
    state: "known",
    value: {
      matchingRowCount: 0,
      missingRatingQuestionCount: 0,
      staleRowCount: 1,
    },
  });
  expect(snapshot.readiness).toBe("blocked");
});
```

- [ ] **Step 6: Implement isolated evidence loading and sanitized logging**

Add these internal helpers to the service:

```ts
function logReadFailure(
  stage: "template" | "active_version" | "stored_benchmarks",
  error: unknown,
): void {
  console.error("Peer benchmark audit read failed", {
    stage,
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Non-Error thrown",
  });
}

const queryFailed = {
  state: "unknown",
  reason: "query_failed",
} as const;
const dependencyUnknown = {
  state: "unknown",
  reason: "dependency_unknown",
} as const;
const templateMissing = {
  state: "notApplicable",
  reason: "template_missing",
} as const;
const activeVersionMissing = {
  state: "notApplicable",
  reason: "active_version_missing",
} as const;
```

Use a `try/catch` for the template read. Once the template is known present, run
the active-version and stored-key loaders with `Promise.all`; each loader catches
and returns its own evidence instead of rejecting the combined promise.

Keep raw `Set<string>` values in the internal `ActiveVersionLoad` and
`StoredKeysLoad` results declared in Step 3 only.

Build `keyCoverage` only when both sets are non-null. Use
`dependencyUnknown` when a required read is unknown. Use `notApplicable` with
`template_missing` when the template is known absent, and `notApplicable` with
`active_version_missing` when the template exists but no active version exists.

Complete the builder with this branch structure:

```ts
export async function buildPeerBenchmarkAuditSnapshot({
  db,
  now,
  effectiveGate,
}: {
  db: PeerBenchmarkAuditDb;
  now: Date;
  effectiveGate: PeerBenchmarkEvidence<EffectivePeerBenchmarkGate>;
}): Promise<PeerBenchmarkAuditSnapshot> {
  const base = {
    generatedAt: now.toISOString(),
    targetAlias: LVA_TEMPLATE_ALIAS,
    effectiveGate,
  } as const;

  let templateRow: LoadedTemplate | null;
  try {
    templateRow = await db.assessmentTemplate.findFirst({
      where: { alias: LVA_TEMPLATE_ALIAS, deletedAt: null },
      select: { id: true, alias: true },
    });
  } catch (error) {
    logReadFailure("template", error);
    const snapshot: PeerBenchmarkAuditSnapshot = {
      ...base,
      template: queryFailed,
      activeVersion: dependencyUnknown,
      storedBenchmarks: dependencyUnknown,
      keyCoverage: dependencyUnknown,
      readiness: "unknown",
    };
    return snapshot;
  }

  if (!templateRow) {
    const template = {
      state: "missing",
      reason: "template_not_found",
    } as const;
    const snapshot: PeerBenchmarkAuditSnapshot = {
      ...base,
      template,
      activeVersion: templateMissing,
      storedBenchmarks: templateMissing,
      keyCoverage: templateMissing,
      readiness: deriveReadiness({
        effectiveGate,
        template,
        activeVersion: templateMissing,
        keyCoverage: templateMissing,
      }),
    };
    return snapshot;
  }

  const templateId = templateRow.id;
  const [active, stored] = await Promise.all([
    (async (): Promise<ActiveVersionLoad> => {
      try {
        return await loadActiveVersion(db, templateId);
      } catch (error) {
        logReadFailure("active_version", error);
        return { evidence: queryFailed, ratingKeys: null };
      }
    })(),
    (async (): Promise<StoredKeysLoad> => {
      try {
        return await loadStoredKeys(db, templateId);
      } catch (error) {
        logReadFailure("stored_benchmarks", error);
        return { evidence: queryFailed, storedKeys: null };
      }
    })(),
  ]);

  let keyCoverage: PeerBenchmarkAuditSnapshot["keyCoverage"];
  if (active.evidence.state === "missing") {
    keyCoverage = activeVersionMissing;
  } else if (active.ratingKeys && stored.storedKeys) {
    keyCoverage = known(deriveCoverage(active.ratingKeys, stored.storedKeys));
  } else {
    keyCoverage = dependencyUnknown;
  }

  const template = known<"present">("present");
  return {
    ...base,
    template,
    activeVersion: active.evidence,
    storedBenchmarks: stored.evidence,
    keyCoverage,
    readiness: deriveReadiness({
      effectiveGate,
      template,
      activeVersion: active.evidence,
      keyCoverage,
    }),
  };
}
```

- [ ] **Step 7: Run the complete service suite**

Run:

```bash
npx jest src/__tests__/lib/assessments/peer-benchmark-audit.test.ts --runInBand
```

Expected: PASS, including dark/no-data/partial/ready/stale/missing/unknown and
privacy assertions.

- [ ] **Step 8: Run focused lint**

Run:

```bash
npx eslint src/lib/assessments/peer-benchmark-audit.ts src/__tests__/lib/assessments/peer-benchmark-audit.test.ts
```

Expected: exit `0`.

- [ ] **Step 9: Commit the service slice**

```bash
git add src/src/lib/assessments/peer-benchmark-audit.ts \
  src/src/__tests__/lib/assessments/peer-benchmark-audit.test.ts
git commit -m "feat(assessments): derive peer benchmark audit status"
```

---

### Task 2: Add the privileged read-only status endpoint

**Files:**
- Create: `src/src/app/api/admin/assessments/peer-benchmark-status/route.ts`
- Create: `src/src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts`

**Interfaces:**
- Consumes:
  - `isPeerBenchmarksEnabled(): boolean`
  - `buildPeerBenchmarkAuditSnapshot({ db, now, effectiveGate })`
  - `PeerBenchmarkAuditDb`
- Produces:
  - `GET(): Promise<Response>`
  - Success body `{ success: true, data: PeerBenchmarkAuditSnapshot }`
  - Error bodies `{ success: false, error: string }`

- [ ] **Step 1: Write the failing route tests**

Create `src/src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts`:

```ts
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({ db: {} }));
jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));
jest.mock("@/lib/assessments/wave-s-flags", () => ({
  isPeerBenchmarksEnabled: jest.fn(),
}));
jest.mock("@/lib/assessments/peer-benchmark-audit", () => ({
  buildPeerBenchmarkAuditSnapshot: jest.fn(),
}));

import {
  dynamic,
  GET,
} from "@/app/api/admin/assessments/peer-benchmark-status/route";
import { getApiActor } from "@/lib/auth/authorization";
import { buildPeerBenchmarkAuditSnapshot } from "@/lib/assessments/peer-benchmark-audit";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";

const snapshot = {
  generatedAt: "2026-08-04T06:00:00.000Z",
  targetAlias: "leadership-vision-alignment",
  effectiveGate: { state: "known", value: "dark" },
  template: { state: "known", value: "present" },
  activeVersion: {
    state: "known",
    value: {
      versionNumber: 3,
      language: "enUS",
      publishedAt: "2026-07-02T16:20:09.782Z",
      ratingQuestionCount: 16,
    },
  },
  storedBenchmarks: { state: "known", value: { storedRowCount: 0 } },
  keyCoverage: {
    state: "known",
    value: {
      matchingRowCount: 0,
      missingRatingQuestionCount: 16,
      staleRowCount: 0,
    },
  },
  readiness: "dark",
} as const;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  (isPeerBenchmarksEnabled as jest.Mock).mockReturnValue(false);
  (buildPeerBenchmarkAuditSnapshot as jest.Mock).mockResolvedValue(snapshot);
});

it("is force-dynamic", () => {
  expect(dynamic).toBe("force-dynamic");
});

it("returns 401 without querying status when unauthenticated", async () => {
  (getApiActor as jest.Mock).mockResolvedValue(null);
  const response = await GET();
  expect(response.status).toBe(401);
  expect(buildPeerBenchmarkAuditSnapshot).not.toHaveBeenCalled();
});

it("returns 403 for a COACH", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    role: "COACH",
    userId: "coach",
    coachId: "c1",
    email: "coach@example.com",
  });
  const response = await GET();
  expect(response.status).toBe(403);
  expect(buildPeerBenchmarkAuditSnapshot).not.toHaveBeenCalled();
});

it.each(["ADMIN", "STAFF"])(
  "returns a no-store snapshot for %s",
  async (role) => {
    (getApiActor as jest.Mock).mockResolvedValue({
      role,
      userId: role.toLowerCase(),
      coachId: null,
      email: `${role.toLowerCase()}@example.com`,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true, data: snapshot });
    expect(buildPeerBenchmarkAuditSnapshot).toHaveBeenCalledWith({
      db: expect.anything(),
      now: expect.any(Date),
      effectiveGate: { state: "known", value: "dark" },
    });
  },
);

it("passes enabled without exposing the environment inputs", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    role: "ADMIN",
    userId: "a",
    coachId: null,
    email: "a@example.com",
  });
  (isPeerBenchmarksEnabled as jest.Mock).mockReturnValue(true);
  await GET();
  expect(buildPeerBenchmarkAuditSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      effectiveGate: { state: "known", value: "enabled" },
    }),
  );
});

it("returns 500 instead of throwing when the service fails unexpectedly", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    role: "STAFF",
    userId: "s",
    coachId: null,
    email: "s@example.com",
  });
  (buildPeerBenchmarkAuditSnapshot as jest.Mock).mockRejectedValueOnce(
    new Error("unexpected"),
  );
  jest.spyOn(console, "error").mockImplementation(() => {});
  const response = await GET();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    success: false,
    error: "Failed to build peer benchmark status",
  });
});
```

- [ ] **Step 2: Run the route test to verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts --runInBand
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route**

Create `src/src/app/api/admin/assessments/peer-benchmark-status/route.ts`:

```ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";
import {
  buildPeerBenchmarkAuditSnapshot,
  type PeerBenchmarkAuditDb,
} from "@/lib/assessments/peer-benchmark-audit";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const data = await buildPeerBenchmarkAuditSnapshot({
      db: db as unknown as PeerBenchmarkAuditDb,
      now: new Date(),
      effectiveGate: {
        state: "known",
        value: isPeerBenchmarksEnabled() ? "enabled" : "dark",
      },
    });
    return NextResponse.json(
      { success: true, data },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Error building peer benchmark status", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Non-Error thrown",
    });
    return NextResponse.json(
      { success: false, error: "Failed to build peer benchmark status" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
```

Do not read either Wave S environment variable in this file. The only flag
import is `isPeerBenchmarksEnabled`.

- [ ] **Step 4: Run the route suite to verify GREEN**

Run:

```bash
npx jest src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts --runInBand
```

Expected: PASS for `401`, `403`, `ADMIN`, `STAFF`, gate plumbing, no-store, and
unexpected `500`.

- [ ] **Step 5: Run service plus route tests together**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/peer-benchmark-audit.test.ts \
  src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts \
  --runInBand
```

Expected: both suites PASS.

- [ ] **Step 6: Run focused lint**

Run:

```bash
npx eslint \
  src/app/api/admin/assessments/peer-benchmark-status/route.ts \
  src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts
```

Expected: exit `0`.

- [ ] **Step 7: Commit the route slice**

```bash
git add \
  src/src/app/api/admin/assessments/peer-benchmark-status/route.ts \
  src/src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts
git commit -m "feat(admin): expose peer benchmark audit status"
```

---

### Task 3: Render the independent Observability panel

**Files:**
- Create: `src/src/components/admin/PeerBenchmarkStatusPanel.tsx`
- Create: `src/src/__tests__/components/peer-benchmark-status-panel.test.tsx`
- Modify: `src/src/app/(dashboard)/admin/assessments/observability/page.tsx:15-42`

**Interfaces:**
- Consumes:
  - `PeerBenchmarkAuditSnapshot`
  - `GET /api/admin/assessments/peer-benchmark-status`
- Produces:
  - `export function PeerBenchmarkStatusPanel(): React.JSX.Element`
  - Test IDs:
    - `peer-benchmark-status-panel`
    - `peer-benchmark-readiness`
    - `refresh-peer-benchmark-status`
    - `peer-benchmark-effective-gate`
    - `peer-benchmark-active-version`
    - `peer-benchmark-stored-count`
    - `peer-benchmark-coverage`

- [ ] **Step 1: Write the failing component tests**

Create `src/src/__tests__/components/peer-benchmark-status-panel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PeerBenchmarkStatusPanel } from "@/components/admin/PeerBenchmarkStatusPanel";
import type { PeerBenchmarkAuditSnapshot } from "@/lib/assessments/peer-benchmark-audit";

function snapshot(
  over: Partial<PeerBenchmarkAuditSnapshot> = {},
): PeerBenchmarkAuditSnapshot {
  return {
    generatedAt: "2026-08-04T06:00:00.000Z",
    targetAlias: "leadership-vision-alignment",
    effectiveGate: { state: "known", value: "dark" },
    template: { state: "known", value: "present" },
    activeVersion: {
      state: "known",
      value: {
        versionNumber: 3,
        language: "enUS",
        publishedAt: "2026-07-02T16:20:09.782Z",
        ratingQuestionCount: 16,
      },
    },
    storedBenchmarks: { state: "known", value: { storedRowCount: 0 } },
    keyCoverage: {
      state: "known",
      value: {
        matchingRowCount: 0,
        missingRatingQuestionCount: 16,
        staleRowCount: 0,
      },
    },
    readiness: "dark",
    ...over,
  };
}

function mockFetch(data: PeerBenchmarkAuditSnapshot, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => ({ success: ok, data }),
  }) as unknown as typeof fetch;
}

beforeEach(() => jest.restoreAllMocks());

it("renders dark neutrally while preserving prerequisite evidence", async () => {
  mockFetch(snapshot());
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-status-panel")).toBeInTheDocument(),
  );
  expect(screen.getByTestId("peer-benchmark-readiness")).toHaveTextContent(
    "Currently dark",
  );
  expect(screen.getByTestId("peer-benchmark-effective-gate")).toHaveTextContent(
    "Dark",
  );
  expect(screen.getByTestId("peer-benchmark-active-version")).toHaveTextContent(
    "v3",
  );
  expect(screen.getByText("16 rating questions")).toBeInTheDocument();
  expect(screen.getByTestId("peer-benchmark-stored-count")).toHaveTextContent(
    "0",
  );
  expect(screen.getByText(/does not identify which flag input caused it/i))
    .toBeInTheDocument();
});

it.each([
  ["noData", "No benchmark data"],
  ["partialData", "Partial benchmark data"],
  ["ready", "Ready"],
  ["blocked", "Blocked"],
  ["unknown", "Unknown"],
] as const)("renders %s readiness", async (readiness, label) => {
  mockFetch(snapshot({ readiness }));
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-readiness")).toHaveTextContent(
      label,
    ),
  );
});

it("shows known stored count beside unknown coverage", async () => {
  mockFetch(
    snapshot({
      activeVersion: { state: "unknown", reason: "query_failed" },
      storedBenchmarks: { state: "known", value: { storedRowCount: 4 } },
      keyCoverage: { state: "unknown", reason: "dependency_unknown" },
      readiness: "unknown",
    }),
  );
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-stored-count")).toHaveTextContent(
      "4",
    ),
  );
  expect(screen.getByTestId("peer-benchmark-active-version")).toHaveTextContent(
    "Unknown",
  );
  expect(screen.getByTestId("peer-benchmark-coverage")).toHaveTextContent(
    "Unknown",
  );
});

it("refreshes only its own endpoint", async () => {
  mockFetch(snapshot());
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByTestId("refresh-peer-benchmark-status"));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    "/api/admin/assessments/peer-benchmark-status",
    { cache: "no-store" },
  );
});

it("contains the permanent privacy note and no mutation controls", async () => {
  mockFetch(snapshot());
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(
      screen.getByText(
        "Underlying environment inputs and peer values are not displayed.",
      ),
    ).toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: /save|enable|disable|edit/i }))
    .not.toBeInTheDocument();
});

it("isolates an endpoint error inside the peer panel", async () => {
  mockFetch(snapshot(), false, 500);
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByText("Peer benchmark status failed: HTTP 500"))
      .toBeInTheDocument(),
  );
});
```

Append the remaining state and refresh-failure cases:

```tsx
it("shows stale rows without downgrading ready coverage", async () => {
  mockFetch(
    snapshot({
      effectiveGate: { state: "known", value: "enabled" },
      storedBenchmarks: { state: "known", value: { storedRowCount: 17 } },
      keyCoverage: {
        state: "known",
        value: {
          matchingRowCount: 16,
          missingRatingQuestionCount: 0,
          staleRowCount: 1,
        },
      },
      readiness: "ready",
    }),
  );
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-readiness")).toHaveTextContent(
      "Ready",
    ),
  );
  expect(screen.getByTestId("peer-benchmark-coverage")).toHaveTextContent(
    "1 stale",
  );
});

it("renders a known missing template as Missing, not Unknown", async () => {
  mockFetch(
    snapshot({
      template: { state: "missing", reason: "template_not_found" },
      activeVersion: {
        state: "notApplicable",
        reason: "template_missing",
      },
      storedBenchmarks: {
        state: "notApplicable",
        reason: "template_missing",
      },
      keyCoverage: {
        state: "notApplicable",
        reason: "template_missing",
      },
      readiness: "blocked",
    }),
  );
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() => expect(screen.getByText("Missing")).toBeInTheDocument());
  expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
});

it("renders known zero as 0 rather than an em dash", async () => {
  mockFetch(snapshot());
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-stored-count")).toHaveTextContent(
      "0",
    ),
  );
  expect(screen.getByTestId("peer-benchmark-stored-count")).not.toHaveTextContent(
    "—",
  );
});

it("keeps the last verified snapshot visible when refresh fails", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: snapshot() }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch;
  render(<PeerBenchmarkStatusPanel />);
  await waitFor(() =>
    expect(screen.getByTestId("peer-benchmark-active-version")).toHaveTextContent(
      "v3",
    ),
  );
  fireEvent.click(screen.getByTestId("refresh-peer-benchmark-status"));
  await waitFor(() =>
    expect(screen.getByText("Peer benchmark status failed: HTTP 500"))
      .toBeInTheDocument(),
  );
  expect(screen.getByTestId("peer-benchmark-active-version")).toHaveTextContent(
    "v3",
  );
  expect(screen.getByTestId("peer-benchmark-stored-count")).toHaveTextContent(
    "0",
  );
});
```

- [ ] **Step 2: Run the component test to verify RED**

Run from `src/`:

```bash
npx jest src/__tests__/components/peer-benchmark-status-panel.test.tsx --runInBand
```

Expected: FAIL because `PeerBenchmarkStatusPanel` does not exist.

- [ ] **Step 3: Implement fetch state and evidence-format helpers**

Create `src/src/components/admin/PeerBenchmarkStatusPanel.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  PeerBenchmarkAuditSnapshot,
  PeerBenchmarkEvidence,
  PeerBenchmarkReadiness,
} from "@/lib/assessments/peer-benchmark-audit";

const READINESS: Record<
  PeerBenchmarkReadiness,
  { label: string; className: string; explanation: string }
> = {
  dark: {
    label: "Currently dark",
    className: "bg-muted text-muted-foreground",
    explanation:
      "The effective runtime gate is dark. This does not identify which flag input caused it.",
  },
  blocked: {
    label: "Blocked",
    className: "bg-muted text-muted-foreground",
    explanation: "A required template or published-question prerequisite is absent.",
  },
  noData: {
    label: "No benchmark data",
    className: "bg-muted text-muted-foreground",
    explanation: "No stored benchmark rows match active rating questions.",
  },
  partialData: {
    label: "Partial benchmark data",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    explanation: "Only some active rating questions have stored benchmark rows.",
  },
  ready: {
    label: "Ready",
    className: "bg-success/10 text-success",
    explanation: "Every active rating question has a stored benchmark row.",
  },
  unknown: {
    label: "Unknown",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    explanation: "One or more required evidence sources could not be read.",
  },
};

function evidenceText<T>(
  evidence: PeerBenchmarkEvidence<T>,
  known: (value: T) => string,
): string {
  if (evidence.state === "known") return known(evidence.value);
  if (evidence.state === "missing") return "Missing";
  if (evidence.state === "notApplicable") return "Not applicable";
  return "Unknown";
}
```

Use the same fetch lifecycle as `ImportHealthPanel`, but call:

```ts
const response = await fetch(
  "/api/admin/assessments/peer-benchmark-status",
  { cache: "no-store" },
);
```

Keep existing data visible during a refresh. Disable the refresh button while
loading. An initial failure renders only
`Peer benchmark status failed: HTTP 500` (or the actual caught message) inside
this component. A refresh failure preserves the last successful snapshot and
adds that error line above the existing cards; it must not clear verified
evidence merely because the refresh failed.

- [ ] **Step 4: Implement the approved panel layout**

Render:

1. Header: **LVA peer benchmark status**, generated time, Refresh button.
2. Readiness badge from `READINESS`.
3. Four evidence cards:
   - Effective capability — Enabled/Dark/Unknown.
   - Active version — `vN · language`, Missing, Not applicable, or Unknown.
   - Rating questions — known count or inherited evidence state.
   - Stored benchmark rows — known count or inherited evidence state.
4. Coverage line/table:
   - Matching active keys.
   - Missing active keys.
   - Stale stored keys.
5. Permanent note:
   `Underlying environment inputs and peer values are not displayed.`

Use the required test IDs in the Interfaces block. Do not render a form,
numeric input, save button, environment key name, or benchmark value.

The component body should follow this exact data flow and presentation shape:

```tsx
export function PeerBenchmarkStatusPanel() {
  const [data, setData] = useState<PeerBenchmarkAuditSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/admin/assessments/peer-benchmark-status",
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        success: boolean;
        data?: PeerBenchmarkAuditSnapshot;
      };
      if (!body.success || !body.data) throw new Error("Invalid response");
      setData(body.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        Loading LVA peer benchmark status…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="px-6 py-12 text-center text-sm text-destructive">
        Peer benchmark status failed: {error ?? "Failed to load"}
      </div>
    );
  }

  const readiness = READINESS[data.readiness];
  const gate = evidenceText(data.effectiveGate, (value) =>
    value === "enabled" ? "Enabled" : "Dark",
  );
  const template = evidenceText(data.template, () => "Present");
  const activeVersion = evidenceText(
    data.activeVersion,
    (value) => `v${value.versionNumber} · ${value.language}`,
  );
  const ratingQuestions = evidenceText(
    data.activeVersion,
    (value) => `${value.ratingQuestionCount} rating questions`,
  );
  const stored = evidenceText(
    data.storedBenchmarks,
    (value) => value.storedRowCount.toLocaleString(),
  );
  const coverage = evidenceText(
    data.keyCoverage,
    (value) =>
      `${value.matchingRowCount} matching · ` +
      `${value.missingRatingQuestionCount} missing · ` +
      `${value.staleRowCount} stale`,
  );

  return (
    <section
      className="space-y-4"
      data-testid="peer-benchmark-status-panel"
      aria-labelledby="peer-benchmark-status-heading"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2
            id="peer-benchmark-status-heading"
            className="text-lg font-bold text-foreground"
          >
            LVA peer benchmark status
          </h2>
          <p className="text-xs text-muted-foreground">
            Generated {new Date(data.generatedAt).toLocaleString()}.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          data-testid="refresh-peer-benchmark-status"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="status">
          Peer benchmark status failed: {error}
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${readiness.className}`}
          data-testid="peer-benchmark-readiness"
        >
          {readiness.label}
        </span>
        <p className="mt-2 text-sm text-muted-foreground">
          {readiness.explanation}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <EvidenceCard
          label="Effective capability"
          value={gate}
          testId="peer-benchmark-effective-gate"
        />
        <EvidenceCard label="LVA template" value={template} />
        <EvidenceCard
          label="Active version"
          value={activeVersion}
          testId="peer-benchmark-active-version"
        />
        <EvidenceCard label="Rating questions" value={ratingQuestions} />
        <EvidenceCard
          label="Stored benchmark rows"
          value={stored}
          testId="peer-benchmark-stored-count"
        />
      </div>

      <div
        className="rounded-lg border border-border bg-card/50 px-4 py-3 text-sm text-foreground"
        data-testid="peer-benchmark-coverage"
      >
        <span className="font-semibold">Active-key coverage:</span> {coverage}
      </div>

      {data.keyCoverage.state === "known" &&
        data.keyCoverage.value.staleRowCount > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {data.keyCoverage.value.staleRowCount.toLocaleString()} stale{" "}
            {data.keyCoverage.value.staleRowCount === 1 ? "row" : "rows"} does
            not match an active rating question.
          </p>
        )}

      <p className="text-xs text-muted-foreground">
        Underlying environment inputs and peer values are not displayed.
      </p>
    </section>
  );
}

function EvidenceCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card/50 px-4 py-3"
      data-testid={testId}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}
```

- [ ] **Step 5: Run the component suite to verify GREEN**

Run:

```bash
npx jest src/__tests__/components/peer-benchmark-status-panel.test.tsx --runInBand
```

Expected: PASS for all readiness, partial evidence, refresh, error, and privacy
cases.

- [ ] **Step 6: Mount the panel in the approved order**

Modify `src/src/app/(dashboard)/admin/assessments/observability/page.tsx`:

```tsx
import { ObservabilityDashboard } from "@/components/admin/ObservabilityDashboard";
import { PeerBenchmarkStatusPanel } from "@/components/admin/PeerBenchmarkStatusPanel";
import { ImportHealthPanel } from "@/components/admin/ImportHealthPanel";
```

Render:

```tsx
<ObservabilityDashboard />
<PeerBenchmarkStatusPanel />
<ImportHealthPanel />
```

Do not change the page authorization, navigation, header, or either existing
component.

- [ ] **Step 7: Run all new suites together**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/peer-benchmark-audit.test.ts \
  src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts \
  src/__tests__/components/peer-benchmark-status-panel.test.tsx \
  --runInBand
```

Expected: all three suites PASS.

- [ ] **Step 8: Run focused lint**

Run:

```bash
npx eslint \
  src/components/admin/PeerBenchmarkStatusPanel.tsx \
  'src/app/(dashboard)/admin/assessments/observability/page.tsx' \
  src/__tests__/components/peer-benchmark-status-panel.test.tsx
```

Expected: exit `0`.

- [ ] **Step 9: Commit the panel slice**

```bash
git add \
  src/src/components/admin/PeerBenchmarkStatusPanel.tsx \
  src/src/__tests__/components/peer-benchmark-status-panel.test.tsx \
  'src/src/app/(dashboard)/admin/assessments/observability/page.tsx'
git commit -m "feat(admin): show LVA peer benchmark audit status"
```

---

### Task 4: Run regressions and record the local-only implementation truthfully

**Files:**
- Modify: `plans/CHANGELOG.md:10`
- Modify: `CLAUDE.md:21`
- Test unchanged: `src/src/__tests__/lint/changelog-freshness.test.ts`

**Interfaces:**
- Consumes: completed service, route, and panel from Tasks 1–3.
- Produces: a locally verified implementation receipt that claims no Production deployment, flag state, or benchmark-row Production count.

- [ ] **Step 1: Run the complete Wave S regression matrix**

Run from `src/`:

```bash
npx jest \
  src/__tests__/lib/assessments/wave-s-flags.test.ts \
  src/__tests__/lib/assessments/peer-benchmarks.test.ts \
  src/__tests__/api/admin-template-benchmarks.test.ts \
  src/__tests__/components/peer-benchmarks-panel.test.tsx \
  src/__tests__/components/assessments/wave-s-peer-render.test.tsx \
  src/__tests__/lib/assessments/group-report-model.wave-s.test.ts \
  src/__tests__/lib/assessments/group-report.wave-s-loader.test.ts \
  src/__tests__/app/assessment-respondent-report-page.wave-s.test.tsx \
  src/__tests__/assessments/report-email.wave-s-guard.test.ts \
  --runInBand
```

Expected: all listed suites PASS without changing their expectations.

- [ ] **Step 2: Run the complete new-feature matrix**

Run:

```bash
npx jest \
  src/__tests__/lib/assessments/peer-benchmark-audit.test.ts \
  src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts \
  src/__tests__/components/peer-benchmark-status-panel.test.tsx \
  --runInBand
```

Expected: all three suites PASS.

- [ ] **Step 3: Run changed-file ESLint**

Run:

```bash
npx eslint \
  src/lib/assessments/peer-benchmark-audit.ts \
  src/app/api/admin/assessments/peer-benchmark-status/route.ts \
  src/components/admin/PeerBenchmarkStatusPanel.tsx \
  'src/app/(dashboard)/admin/assessments/observability/page.tsx' \
  src/__tests__/lib/assessments/peer-benchmark-audit.test.ts \
  src/__tests__/api/admin/assessments/peer-benchmark-status-route.test.ts \
  src/__tests__/components/peer-benchmark-status-panel.test.tsx
```

Expected: exit `0`.

- [ ] **Step 4: Run the production build**

Run:

```bash
CI=true npx next build --turbopack
```

Expected: exit `0`. Record the actual compile time and generated route count;
do not predict or fabricate them in the CHANGELOG.

- [ ] **Step 5: Prepend the exact local-only CHANGELOG entry**

Add the newest entry at the top of the entries section in
`plans/CHANGELOG.md`. Use this fixed title and slug:

```markdown
### 2026-08-04 — GH #233 peer-benchmark auditability implemented locally <!-- ENTRY_ISO:2026-08-04 ENTRY_SLUG:gh-233-peer-benchmark-auditability-local-only -->

**Status: IMPLEMENTED + LOCALLY VERIFIED ONLY; not merged, deployed, or Production-observed through the new diagnostic.** The ADMIN/STAFF Observability page now has an independently refreshable, read-only LVA peer-benchmark status panel backed by a dedicated endpoint and service. It derives the effective runtime result through the same Wave S authority as editor/report paths, independently reports the active published version, rating-question count, stored benchmark-key count, and matching/missing/stale coverage, and preserves known/missing/not-applicable/unknown distinctions. It never returns raw flag inputs or benchmark values and performs no writes.

**Current Production boundary.** The pre-implementation read-only browser observation remains the only live evidence: the effective capability was dark while active v3 and its 16 rating-question prerequisites were present. The current Production benchmark-row count remains unknown until a separately authorized deployment exposes the diagnostic or another authorized read-only audit establishes it. No flag, benchmark row, version, schema, customer data, or Production deployment was changed.

**Next gate.** Protected-branch review and any Production deployment remain separately authorized. A future read-only Production verification may record the diagnostic's derived state and counts, but must not disclose raw environment inputs or benchmark values. Capability restoration remains a different operation.
```

After inserting the three fixed paragraphs above, add a fourth paragraph
beginning `**Verification.**` that transcribes the actual suite/test counts,
ESLint exit result, build exit result, compile time, and generated route count
observed in Steps 1–4. Do not estimate counts and do not claim a command that
did not run to completion.

- [ ] **Step 6: Update the CLAUDE.md freshness anchor and brief prose**

Change only the Project Context row at `CLAUDE.md:21` to:

```markdown
| **Last Updated** | <!-- LAST_UPDATED_ISO:2026-08-04 LAST_UPDATED_SLUG:gh-233-peer-benchmark-auditability-local-only --> August 4, 2026 — **GH #233 peer-benchmark Production auditability is implemented and locally verified only.** The new ADMIN/STAFF Observability panel is read-only, exposes derived state and counts without raw flag inputs or peer values, and has not been merged or deployed. Full detail in CHANGELOG entry `gh-233-peer-benchmark-auditability-local-only`. |
```

- [ ] **Step 7: Run freshness and diff checks**

Run from `src/`:

```bash
npx jest src/__tests__/lint/changelog-freshness.test.ts --runInBand
```

Expected: PASS.

Run from the repository root:

```bash
git diff --check
git status --short --branch
git diff --name-only origin/main...HEAD
```

Expected:

- `git diff --check` exits `0`;
- only GH #233 service/route/panel/tests, the Observability page, the approved
  design/plan, `CLAUDE.md`, and `plans/CHANGELOG.md` appear;
- no GH #256/GH #257 files, flag files, schema, migrations, benchmark writer,
  editor, or report files appear.

- [ ] **Step 8: Commit the implementation receipt**

```bash
git add CLAUDE.md plans/CHANGELOG.md
git commit -m "docs(sot): record GH 233 auditability local verification"
```

- [ ] **Step 9: Stop before any external or Production action**

Report:

- commit hashes;
- exact test/build evidence;
- any pre-existing failures kept distinct from GH #233;
- the branch diff;
- that current Production benchmark-row count remains unknown; and
- that no flag, benchmark, version, schema, customer data, deployment, GitHub
  claim, or Production state was changed.

Do not push, open a PR, edit GH #233/#261, change Notion, merge, deploy, inspect
raw flag values, or run a Production operation without separate explicit
authorization.

---

## Final Acceptance Checklist

- [ ] Effective status uses `isPeerBenchmarksEnabled()` and never direct env reads.
- [ ] Dark state does not short-circuit prerequisite queries.
- [ ] LVA template query is non-deleted and alias-scoped.
- [ ] Active version uses `enUS`, `activePublishedWhere`, and descending version number.
- [ ] Benchmark query selects `metricKey` only.
- [ ] Stored-row count remains visible when active-version evidence is unknown.
- [ ] Active-version/rating count remains visible when stored-row evidence is unknown.
- [ ] Matching, missing, and stale counts are set-based and value-free.
- [ ] Known zero, missing, not applicable, and unknown render differently.
- [ ] `ADMIN` and `STAFF` receive `200`; unauthenticated receives `401`; other roles receive `403`.
- [ ] Route and client fetch are no-store.
- [ ] Peer panel failure cannot break existing Observability or import-health content.
- [ ] No mutation controls appear.
- [ ] Privacy note is always visible.
- [ ] No existing Wave S behavior or test expectation changes.
- [ ] No schema, migration, background task, history write, flag change, benchmark authoring, capability restoration, or Production operation occurs.
- [ ] Source-of-truth prose says local-only until a separately authorized deployment is verified.
