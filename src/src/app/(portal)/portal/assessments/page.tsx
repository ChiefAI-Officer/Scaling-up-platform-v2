/**
 * Assessment v7.6 — Coach assessments landing page.
 * Lists campaigns the coach created. Top-right CTA → wizard.
 */

import Link from "next/link";
import { ClipboardList, PlusCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { FadeUp } from "@/components/ui/animated";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  ACTIVE: "bg-success/10 text-success border-success/20",
  CLOSED: "bg-secondary/10 text-secondary-foreground border-border",
};

export default async function CoachAssessmentsPage() {
  const { coach } = await requireCoach();

  const campaigns = await db.assessmentCampaign.findMany({
    where: { createdByCoachId: coach.id },
    include: {
      organization: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Assessments</h1>
            <p className="text-muted-foreground">
              Run Rockefeller-style assessments for your organizations.
            </p>
          </div>
          <Link
            href="/portal/assessments/new"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <PlusCircle className="w-5 h-5" /> New Campaign
          </Link>
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        {campaigns.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No campaigns yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Click <span className="font-medium">+ New Campaign</span> to get
              started. You can pick a template, an organization, and the
              people who should participate.
            </p>
            <Link
              href="/portal/assessments/new"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              <PlusCircle className="w-5 h-5" /> New Campaign
            </Link>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Name</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Template</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Organization</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">Opens</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <Link
                        href={`/portal/assessments/${c.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{c.alias}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {c.template.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {c.organization.name}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded border ${STATUS_TONE[c.status] ?? "bg-muted text-muted-foreground border-border"}`}
                      >
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(c.openAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <Link
                        href={`/portal/assessments/${c.id}`}
                        className="text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FadeUp>
    </div>
  );
}
