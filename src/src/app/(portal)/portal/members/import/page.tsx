/**
 * Import from Esperto — coach portal page.
 *
 * Server component: requireCoach() guards the lane (redirects non-coaches),
 * then renders the shared EspertoImportClient in its COACH variant. The owning
 * coach is the logged-in user (resolved server-side by the coach import route),
 * so there is no coach picker here and the request never sends an ownerCoachId.
 *
 * Staging-first: every import is previewed (read-only, no writes) before commit,
 * nothing emails anyone, and the roster lands in YOUR companies' Members & Teams.
 *
 * Pattern matches /portal/members/page.tsx (requireCoach + FadeUp + brand tokens).
 *
 * Headline/copy (Wave O Part A): reworded from the prior "Import historical
 * Esperto data" — that overclaimed support for ALL historical Esperto data
 * when only Members (roster) + QSP-v2 (results) actually work today.
 * Deliberately does NOT name SU-Full/Rockefeller/LVA — this line is scoped to
 * what unconditionally works, so it never drifts out of sync with the
 * suFullImportEnabled flag state below.
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireCoach } from "@/lib/auth/authorization";
import { FadeUp } from "@/components/ui/animated";
import { EspertoImportClient } from "@/components/admin/esperto-import/EspertoImportClient";
import { isEspertoSuFullImportEnabled } from "@/lib/assessments/wave-o-flags";

export default async function CoachEspertoImportPage() {
  await requireCoach();

  // Global-only check (no per-org opts) — a deliberate Phase-1 simplification.
  // Per-org canary visibility for the Phase 2+ pilot rollout is a deferred
  // follow-on; see docs/specs/v7.6/18o-ops-runbook.md §3.
  const suFullImportEnabled = isEspertoSuFullImportEnabled();

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="space-y-2">
          <Link
            href="/portal/members"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Members &amp; Teams
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            Bring in your Esperto history
          </h1>
          <p className="text-muted-foreground">
            Bring your past Esperto rosters and assessment results into the
            platform. Every import is staged: you preview a read-only plan
            first and only commit when it&apos;s clean. Nothing is emailed to
            anyone, and the roster lands in your companies&apos; Members &amp;
            Teams.
          </p>
          <p className="text-muted-foreground">
            Supported today: Members rosters and QSP-v2 results. Other Esperto
            assessment types aren&apos;t available for import yet.
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        <EspertoImportClient variant="coach" suFullImportEnabled={suFullImportEnabled} />
      </FadeUp>
    </div>
  );
}
