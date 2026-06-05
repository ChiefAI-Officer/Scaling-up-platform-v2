/**
 * Import historical Esperto data — coach portal page.
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
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireCoach } from "@/lib/auth/authorization";
import { FadeUp } from "@/components/ui/animated";
import { EspertoImportClient } from "@/components/admin/esperto-import/EspertoImportClient";

export default async function CoachEspertoImportPage() {
  await requireCoach();

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
            Import historical Esperto data
          </h1>
          <p className="text-muted-foreground">
            Bring your past Esperto rosters and assessment results into the
            platform. Every import is staged: you preview a read-only plan
            first and only commit when it&apos;s clean. Nothing is emailed to
            anyone, and the roster lands in your companies&apos; Members &amp;
            Teams.
          </p>
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        <EspertoImportClient variant="coach" />
      </FadeUp>
    </div>
  );
}
