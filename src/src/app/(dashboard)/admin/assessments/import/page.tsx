/**
 * Esperto historical import — admin import UI shell (Slice 7c).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4/§5.
 *
 * Server-component shell. The parent (dashboard) layout already enforces
 * admin/staff; the underlying API (POST /api/admin/assessments/import) is
 * ADMIN-only and will 403 a STAFF actor, so this page is effectively
 * admin-only. Brand-neutral admin theme (NOT the participant purple — ADR-0005
 * scopes the SU brand to the participant assessment UI only).
 *
 * Staging-first by design: an operator PREVIEWS a parsed plan before any
 * COMMIT writes, and nothing here ever sends email (imported invitations are
 * born SUBMITTED). The client component drives the whole two-step workflow.
 *
 * Headline/copy (Wave O Part A): reworded from the prior "Import historical
 * Esperto data" — that overclaimed support for ALL historical Esperto data
 * when only Members (roster) + QSP-v2 (results) actually work today.
 * Names SU-Full only when the suFullImportEnabled flag below is true (Wave O
 * Phase 3c); still deliberately does NOT name Rockefeller/LVA, which remain
 * unsupported.
 */

export const dynamic = "force-dynamic";

import { EspertoImportClient } from "@/components/admin/esperto-import/EspertoImportClient";
import { isEspertoSuFullImportEnabled } from "@/lib/assessments/wave-o-flags";
import { isEspertoLvaRockImportEnabled } from "@/lib/assessments/wave-x-flags";
import { PageHeader } from "@/components/ui/page-header";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export default function AdminEspertoImportPage() {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  // Global-only check (no per-org opts) — a deliberate Phase-1 simplification.
  // Per-org canary visibility for the Phase 2+ pilot rollout is a deferred
  // follow-on; see docs/specs/v7.6/18o-ops-runbook.md §3.
  const suFullImportEnabled = isEspertoSuFullImportEnabled();
  const lvaRockImportEnabled = isEspertoLvaRockImportEnabled();
  const supportedToday = (
    <p className="text-sm text-muted-foreground">
      Supported today:{" "}
      <span className="font-medium text-foreground">Members rosters</span>
      {", "}
      <span className="font-medium text-foreground">QSP-v2 results</span>
      {suFullImportEnabled ? (
        <>
          {", "}
          <span className="font-medium text-foreground">
            Scaling Up Full (historical rounds)
          </span>
        </>
      ) : null}
      {lvaRockImportEnabled ? (
        <>
          {", "}
          <span className="font-medium text-foreground">
            Leadership Vision Alignment
          </span>{" "}
          and{" "}
          <span className="font-medium text-foreground">
            Rockefeller Habits Checklist
          </span>{" "}
          (historical rounds)
        </>
      ) : null}
      . Other Esperto assessment types aren&apos;t available for import yet.
      Historical rounds need the company&apos;s Members roster imported first.
    </p>
  );

  return (
    <div
      className={
        mobileResponsiveEnabled
          ? "mx-auto min-w-0 max-w-4xl space-y-6"
          : "mx-auto max-w-4xl space-y-6"
      }
    >
      {mobileResponsiveEnabled ? (
        <>
          <PageHeader
            responsiveEnabled
            title="Import from Esperto"
            description="Admin-only. Backfill people (rosters) and past answers (results) from raw Esperto export files. Preview a parsed plan before committing it. Nothing here sends email."
          />
          {supportedToday}
        </>
      ) : (
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            Import from Esperto
          </h1>
          <p className="text-sm text-muted-foreground">
            Admin-only. Backfill people (rosters) and past answers (results) from
            raw Esperto export files. This is staging-first: always{" "}
            <span className="font-medium text-foreground">Preview</span> a parsed
            plan before you <span className="font-medium text-foreground">Commit</span>{" "}
            it. Nothing here sends email — imported responses are recorded as
            already submitted.
          </p>
          {supportedToday}
        </header>
      )}

      <EspertoImportClient
        suFullImportEnabled={suFullImportEnabled}
        lvaRockImportEnabled={lvaRockImportEnabled}
      />
    </div>
  );
}
