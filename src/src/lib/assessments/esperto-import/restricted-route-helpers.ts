/**
 * Esperto historical import — Wave O RESTRICTED (SU-Full) route helpers.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4 (restricted
 * shape), §6.2 (published-version preflight), §7 (crosswalk lock gate);
 * Wave O — per-round SU-Full historical import.
 *
 * Shared by BOTH `/api/assessments/import` (coach) and
 * `/api/admin/assessments/import` (admin) so the crosswalk/template/version
 * resolution pipeline for `kind:"restrictedResults"` is written ONCE. Mirrors
 * the inline resolution steps `handleResultsImport` already performs for the
 * QSP path in both routes — same template lookup shape, same published-
 * version preflight `select`, same `validateCrosswalkAgainstVersion` call —
 * but keyed by an EXPLICIT `templateAlias` ("scaling-up-full") rather than a
 * report's self-identifying `variant` (the restricted export carries no
 * `variant` field).
 *
 * `resolveRestrictedImportContext` does ONLY reads — no writes, no entitlement
 * check (the route layer runs `canCreateCampaign` separately, per §D.4 of the
 * wiring plan, so preview and commit both gate on it).
 *
 * `buildRealRestrictedCommitDb` bridges the shared Prisma `db` singleton (or a
 * `tx` transaction client) into the narrow `RestrictedCommitDb` interface
 * `commitRestrictedImport` expects, INCLUDING the `acquireRoundLock` Postgres
 * advisory-lock implementation. This mirrors `commit.ts`'s existing raw-SQL
 * convention (`tx.$executeRaw` tagged-template + `hashtext(...)`, NEVER
 * `$executeRawUnsafe`) and `campaign-live.ts`'s soft-delete convention
 * (`findFirst` + `deletedAt: null`, never `findUnique` on a non-unique-filtered
 * column) for the campaign-by-externalId lookup — `AssessmentCampaign.externalId`
 * carries only a PARTIAL unique index (`WHERE "externalId" IS NOT NULL`, not
 * scoped by `deletedAt`), so a soft-deleted (quarantined) campaign with the same
 * externalId must NOT be treated as "existing" by the reuse-detection in
 * `commitRestrictedImport` — it must look like a fresh create.
 */

import { liveCampaignWhere } from "../campaign-live";
import {
  getCrosswalkByTemplateAlias,
  validateCrosswalkAgainstVersion,
  type Crosswalk,
  type VersionQuestion,
} from "./crosswalks";
import type { RestrictedCommitDb } from "./restricted-commit";

/** The SU-Full template's crosswalk alias — the only alias this helper resolves. */
export const SU_FULL_TEMPLATE_ALIAS = "scaling-up-full";

// ────────────────────────────────────────────────────────────────────────
// Minimal DB surface this helper needs (accepts the real Prisma client
// or a `tx` transaction client — both are supersets of this interface).
// ────────────────────────────────────────────────────────────────────────

export interface RestrictedContextDb {
  assessmentTemplate: {
    findFirst: (args: {
      where: { alias: string };
      select?: object;
    }) => Promise<{ id: string } | null>;
  };
  assessmentTemplateVersion: {
    findFirst: (args: {
      where: { templateId: string; publishedAt: { not: null } };
      orderBy: { versionNumber: "desc" };
      select?: object;
    }) => Promise<{
      id: string;
      language: string;
      questions: unknown;
      sections: unknown;
      scoringConfig: unknown;
    } | null>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Result type — discriminated success/error so the route never has to guess
// which HTTP status a given failure maps to.
// ────────────────────────────────────────────────────────────────────────

export interface ResolvedRestrictedImportContext {
  ok: true;
  template: { id: string };
  publishedVersion: {
    id: string;
    language: string;
    questions: unknown;
    sections: unknown;
    scoringConfig: unknown;
  };
  crosswalk: Crosswalk;
  versionQuestions: VersionQuestion[];
  /** Derived from the FULL question list's `isRequired` flag (scoring.ts's own gate) — NOT hardcoded to "all SLIDER_LIKERT". */
  scorableStableKeys: string[];
}

export type RestrictedImportContextError =
  | {
      ok: false;
      /** Crosswalk registry is missing the SU-Full stub entirely — a code bug, not a user-facing 400. Route should map this to 500. */
      code: "CROSSWALK_NOT_FOUND";
      status: 500;
      error: string;
    }
  | {
      ok: false;
      code: "TEMPLATE_NOT_FOUND";
      status: 400;
      error: string;
    }
  | {
      ok: false;
      code: "TEMPLATE_VERSION_NOT_PUBLISHED";
      status: 422;
      error: string;
      details: { templateId: string; alias: string };
    }
  | {
      ok: false;
      code: "CROSSWALK_INCOMPATIBLE_WITH_VERSION";
      status: 422;
      error: string;
      problems: string[];
    };

export type RestrictedImportContextResult =
  | ResolvedRestrictedImportContext
  | RestrictedImportContextError;

/**
 * A pinned-version question shape wide enough to read `isRequired` — the SAME
 * raw JSON `publishedVersion.questions` already carries (scoring.ts's
 * `SliderLikertQuestion`/qualitative schemas both require `isRequired`), read
 * here as a SEPARATE narrow view from `VersionQuestion` (which omits
 * `isRequired` — it only models what the crosswalk validator needs).
 */
interface RequiredFlagQuestion {
  stableKey: string;
  isRequired: boolean;
}

/**
 * Resolve the SU-Full crosswalk → template → published version → compat
 * check → scorableStableKeys, in the ONE place both import routes call it.
 * Pure reads only. Returns a discriminated error the route can map 1:1 to an
 * HTTP status (see `RestrictedImportContextError`).
 */
export async function resolveRestrictedImportContext(
  db: RestrictedContextDb,
): Promise<RestrictedImportContextResult> {
  // ── Crosswalk lookup. A null here means the registry is missing the
  //    SU-Full stub entirely — that can never legitimately happen (the stub
  //    always exists, `locked:false` or not), so it's a code bug → 500. ─────
  const crosswalk = getCrosswalkByTemplateAlias(SU_FULL_TEMPLATE_ALIAS);
  if (!crosswalk) {
    return {
      ok: false,
      code: "CROSSWALK_NOT_FOUND",
      status: 500,
      error: `No crosswalk registered for template alias "${SU_FULL_TEMPLATE_ALIAS}"`,
    };
  }

  // ── Template by the crosswalk's alias — same pattern as handleResultsImport. ─
  const template = await db.assessmentTemplate.findFirst({
    where: { alias: crosswalk.templateAlias },
    select: { id: true },
  });
  if (!template) {
    return {
      ok: false,
      code: "TEMPLATE_NOT_FOUND",
      status: 400,
      error: `Template "${crosswalk.templateAlias}" not found`,
    };
  }

  // ── PREFLIGHT: a published, crosswalk-compatible version must exist. Same
  //    inline pattern + `select` as handleResultsImport's QSP path. ─────────
  const publishedVersion = await db.assessmentTemplateVersion.findFirst({
    where: { templateId: template.id, publishedAt: { not: null } },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      language: true,
      questions: true,
      sections: true,
      scoringConfig: true,
    },
  });
  if (!publishedVersion) {
    return {
      ok: false,
      code: "TEMPLATE_VERSION_NOT_PUBLISHED",
      status: 422,
      error: "TEMPLATE_VERSION_NOT_PUBLISHED",
      details: { templateId: template.id, alias: crosswalk.templateAlias },
    };
  }

  const versionQuestions =
    (publishedVersion.questions as unknown as VersionQuestion[]) ?? [];
  const compat = validateCrosswalkAgainstVersion(crosswalk, versionQuestions);
  if (!compat.ok) {
    return {
      ok: false,
      code: "CROSSWALK_INCOMPATIBLE_WITH_VERSION",
      status: 422,
      error: "CROSSWALK_INCOMPATIBLE_WITH_VERSION",
      problems: compat.problems,
    };
  }

  // ── scorableStableKeys — derived from the FULL question list's `isRequired`
  //    flag (the authoritative gate scoring.ts itself uses), NOT hardcoded to
  //    "all SLIDER_LIKERT". Both SLIDER_LIKERT and qualitative question types
  //    carry `isRequired` in scoring.ts's schemas. ───────────────────────────
  const fullQuestions =
    (publishedVersion.questions as unknown as RequiredFlagQuestion[]) ?? [];
  const scorableStableKeys = fullQuestions
    .filter((q) => q.isRequired === true)
    .map((q) => q.stableKey);

  return {
    ok: true,
    template,
    publishedVersion,
    crosswalk,
    versionQuestions,
    scorableStableKeys,
  };
}

// ────────────────────────────────────────────────────────────────────────
// buildRealRestrictedCommitDb — bridges the shared Prisma `db`/`tx` into the
// narrow RestrictedCommitDb interface, including the acquireRoundLock advisory
// lock (raw SQL is otherwise disallowed by S1 in this module family).
// ────────────────────────────────────────────────────────────────────────

/**
 * Minimal Prisma-shaped surface this adapter needs from the underlying client
 * (the real `PrismaClient` and a `tx` transaction client are both supersets).
 */
export interface RestrictedCommitPrismaLike {
  $executeRaw: (
    template: TemplateStringsArray | string,
    ...values: unknown[]
  ) => Promise<number>;
  organization: {
    findUnique: (args: { where: { id: string }; select?: object }) => Promise<{
      id: string;
      espertoSuFullCid: string | null;
    } | null>;
    update: (args: {
      where: { id: string };
      data: { espertoSuFullCid: string };
    }) => Promise<unknown>;
  };
  assessmentCampaign: {
    // NOTE: `findFirst`, not `findUnique` — `externalId` carries only a PARTIAL
    // unique index (not scoped by `deletedAt`), so a `findUnique` on
    // `{externalId}` alone would be unable to also filter `deletedAt: null`.
    // `liveCampaignWhere` pins `deletedAt: null` last so a soft-deleted
    // (quarantined) campaign is never resurrected into the reuse path.
    findFirst: (args: { where: object; select?: object }) => Promise<{
      id: string;
      organizationId: string;
      templateId: string;
      versionId: string;
      importManifest: unknown;
    } | null>;
    create: (args: { data: object }) => Promise<{ id: string }>;
    update: (args: { where: { id: string }; data: object }) => Promise<unknown>;
  };
  assessmentTemplateVersion: {
    findUnique: (args: { where: { id: string }; select?: object }) => Promise<{
      id: string;
      questions: unknown;
      sections: unknown;
      scoringConfig: unknown;
    } | null>;
  };
  assessmentInvitation: {
    upsert: (args: {
      where: object;
      create: object;
      update: object;
      select?: object;
    }) => Promise<{ id: string }>;
  };
  assessmentSubmission: {
    create: (args: { data: object }) => Promise<unknown>;
    aggregate: (args: {
      where: object;
      _min: object;
      _max: object;
    }) => Promise<{ _min: { submittedAt: Date | null }; _max: { submittedAt: Date | null } }>;
  };
  auditLog: {
    create: (args: { data: object }) => Promise<unknown>;
  };
  $transaction: <T>(fn: (tx: RestrictedCommitPrismaLike) => Promise<T>) => Promise<T>;
}

/**
 * Adapt a Prisma-shaped client (`db` or a `tx` inside `db.$transaction`) into
 * the exact `RestrictedCommitDb` surface `commitRestrictedImport` expects.
 *
 * `acquireRoundLock` runs `pg_advisory_xact_lock(hashtext($1))` via a tagged-
 * template `$executeRaw` call — the SAME idiom `commit.ts` already uses for
 * its org-create lock (never `$executeRawUnsafe`; `hashtext` converts the
 * arbitrary string key into the int4 `pg_advisory_xact_lock` requires). The
 * lock auto-releases at transaction end (commit or rollback).
 *
 * `assessmentCampaign.findUnique` is backed by a `findFirst` call through
 * `liveCampaignWhere({externalId})`, so a soft-deleted campaign sharing the
 * incoming batch's externalId is invisible here — `commitRestrictedImport`'s
 * reuse-detection sees "not existing" and takes the CREATE path instead of
 * resurrecting quarantined data via the REUSE path.
 */
export function buildRealRestrictedCommitDb(
  prisma: RestrictedCommitPrismaLike,
): RestrictedCommitDb {
  const adapt = (client: RestrictedCommitPrismaLike): RestrictedCommitDb => ({
    organization: {
      findUnique: (args) => client.organization.findUnique(args),
      update: (args) => client.organization.update(args),
    },
    assessmentCampaign: {
      findUnique: (args) =>
        client.assessmentCampaign.findFirst({
          where: liveCampaignWhere({ externalId: args.where.externalId } as never),
          select: args.select,
        }),
      create: (args) => client.assessmentCampaign.create(args),
      update: (args) => client.assessmentCampaign.update(args),
    },
    assessmentTemplateVersion: {
      findUnique: (args) => client.assessmentTemplateVersion.findUnique(args),
    },
    assessmentInvitation: {
      upsert: (args) => client.assessmentInvitation.upsert(args),
    },
    assessmentSubmission: {
      create: (args) => client.assessmentSubmission.create(args),
      aggregate: (args) => client.assessmentSubmission.aggregate(args),
    },
    auditLog: {
      create: (args) => client.auditLog.create(args),
    },
    acquireRoundLock: async (key: string) => {
      await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    },
    $transaction: (fn) =>
      client.$transaction((tx) => fn(adapt(tx))),
  });

  return adapt(prisma);
}

// ────────────────────────────────────────────────────────────────────────
// resolveEspertoImportHashSalt — env-backed salt for restricted-plan.ts's
// provenance hashes (never a random default — that would make hashes
// non-reproducible across restarts, breaking the exact/superset/divergent
// re-import reconciliation in restricted-commit.ts, which compares salted
// hashes across separate commit calls).
//
// Mirrors `lib/files/file-access.ts`'s `getFileAccessSecret()` convention:
// lazy (call-time, not module-load-time) + throws in production/Vercel when
// unset + a LOUD, clearly-labeled fixed dev-only fallback otherwise (never a
// `crypto.randomBytes` default).
// ────────────────────────────────────────────────────────────────────────

/**
 * DEV-ONLY fallback salt. NEVER used in production (see the throw below) —
 * loud and clearly labeled so it can never be mistaken for a real secret.
 */
const DEV_ONLY_HASH_SALT = "local-dev-esperto-import-hash-salt-DO-NOT-USE-IN-PROD";

/**
 * Resolve the salt for `buildRestrictedImportPlan`'s provenance hashes from
 * `WAVE_O_ESPERTO_IMPORT_HASH_SALT`. Throws in production/Vercel when unset
 * (a missing salt there would either crash reproducibility or, worse, tempt a
 * random per-process default — silently breaking re-import reconciliation);
 * falls back to a fixed, loudly-labeled dev-only constant otherwise.
 */
export function resolveEspertoImportHashSalt(): string {
  const salt = process.env.WAVE_O_ESPERTO_IMPORT_HASH_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) {
      throw new Error(
        "WAVE_O_ESPERTO_IMPORT_HASH_SALT must be set in production. " +
          "Esperto restricted-import provenance hashes cannot be computed " +
          "reproducibly without a stable salt.",
      );
    }
    return DEV_ONLY_HASH_SALT;
  }
  return salt;
}

// ────────────────────────────────────────────────────────────────────────
// emitEspertoImportMetric — structured observability marker (R3-M2)
//
// Mirrors `report-metrics.ts`'s `emitReportMetric` convention
// (`console.info(JSON.stringify({ marker, surface, ...fields }))`, wrapped in
// a try/catch so a logging failure never breaks the request path) rather than
// `access-control.ts`'s older `{level, event}` shape — this is the more
// actively-extended convention in `lib/assessments/**` (respondent + group
// report metrics both route through it). Wave O gets its OWN surface/marker
// namespace (`assessment.esperto_import.*`) since it isn't a report-viewing
// surface.
//
// PII CONTRACT: callers must pass ONLY low-cardinality, non-PII fields —
// organizationId, templateAlias, counts, reasons/codes, flagState, latencyMs.
// NEVER raw mid/reportid/cid/email/name. There is no defensive key-strip here
// (unlike report-metrics.ts) because this module's callers construct the
// fields object explicitly from counts/enums, never from raw Esperto rows —
// but future callers must keep to that discipline.
// ────────────────────────────────────────────────────────────────────────

export type EspertoImportMetricEvent =
  | "preview"
  | "commit_attempt"
  | "commit_result"
  | "commit_conflict";

/** Emit one `assessment.esperto_import.<event>` structured marker. Never throws. */
export function emitEspertoImportMetric(
  event: EspertoImportMetricEvent,
  fields: Record<string, unknown> = {},
): void {
  try {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      safe[key] = value;
    }
    console.info(
      JSON.stringify({
        marker: `assessment.esperto_import.${event}`,
        surface: "esperto_import",
        ...safe,
      }),
    );
  } catch {
    // Instrumentation is best-effort — never let a logging failure surface.
  }
}
