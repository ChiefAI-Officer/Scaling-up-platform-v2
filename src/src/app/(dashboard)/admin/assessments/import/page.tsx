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
 */

export const dynamic = "force-dynamic";

import { EspertoImportClient } from "@/components/admin/esperto-import/EspertoImportClient";

export default function AdminEspertoImportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">
          Import historical Esperto data
        </h1>
        <p className="text-sm text-muted-foreground">
          Admin-only. Backfill people (rosters) and past answers (results) from
          raw Esperto export files. This is staging-first: always{" "}
          <span className="font-medium text-foreground">Preview</span> a parsed
          plan before you <span className="font-medium text-foreground">Commit</span>{" "}
          it. Nothing here sends email — imported responses are recorded as
          already submitted.
        </p>
      </header>

      <EspertoImportClient />
    </div>
  );
}
