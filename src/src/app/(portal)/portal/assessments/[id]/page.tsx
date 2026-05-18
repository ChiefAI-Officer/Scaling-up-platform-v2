/**
 * Assessment v7.6 — Coach campaign detail (placeholder).
 * Minimal summary so wizard exits don't 404. Full detail/run controls
 * land in a future slice.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { redirect } from "next/navigation";

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { coach } = await requireCoach();
  const { id } = await params;

  const campaign = await db.assessmentCampaign.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      template: { select: { id: true, name: true, alias: true } },
      participants: {
        include: {
          respondent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!campaign || campaign.createdByCoachId !== coach.id) {
    redirect("/portal/assessments");
  }

  const ceoParticipant = campaign.participants.find((p) => p.isCEO);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link
          href="/portal/assessments"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Assessments
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">{campaign.alias}</p>
          </div>
          <span
            className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded border ${STATUS_TONE[campaign.status] ?? "bg-muted text-muted-foreground border-border"}`}
          >
            {STATUS_LABELS[campaign.status] ?? campaign.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm">
          <div>
            <div className="text-muted-foreground">Template</div>
            <div className="font-medium text-foreground">{campaign.template.name}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Organization</div>
            <div className="font-medium text-foreground">{campaign.organization.name}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Opens</div>
            <div className="font-medium text-foreground">{formatDateTime(campaign.openAt)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Closes</div>
            <div className="font-medium text-foreground">
              {campaign.endMode === "OPEN_END"
                ? "Open-ended"
                : formatDateTime(campaign.closeAt)}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Participants ({campaign.participants.length})
          </h2>
          {ceoParticipant && (
            <p className="text-sm text-muted-foreground mb-3">
              CEO: <span className="font-medium text-foreground">
                {ceoParticipant.respondent.firstName} {ceoParticipant.respondent.lastName}
              </span>
            </p>
          )}
          <ul className="divide-y divide-border border border-border rounded-lg">
            {campaign.participants.map((p) => (
              <li key={p.id} className="px-4 py-2 flex items-center justify-between text-sm">
                <span>
                  {p.respondent.firstName} {p.respondent.lastName}
                  {p.isCEO && (
                    <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      CEO
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">{p.respondent.email}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
