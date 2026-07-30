import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import {
  publicLeadRetentionCutoff,
  resolvePublicLeadsState,
} from "@/lib/assessments/public-leads-state";
import { PublicLeadExportButton } from "@/components/assessments/PublicLeadExportButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 25;

function dateBoundary(value: string | undefined, endExclusive: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function resultHeadline(value: unknown): string {
  if (!value || typeof value !== "object") return "Completed";
  const result = value as Record<string, unknown>;
  const tier = result.tier;
  if (tier && typeof tier === "object") {
    const label = (tier as Record<string, unknown>).label;
    if (typeof label === "string" && label.trim()) return label;
  }
  if (typeof result.overallScore === "number") {
    return `${Math.round(result.overallScore * 10) / 10} overall`;
  }
  return "Completed";
}

export default async function PublicLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coach } = await requireCoach();
  const state = resolvePublicLeadsState(process.env, { coachId: coach.id });
  if (
    !state.presentationEnabled ||
    coach.deletedAt !== null ||
    coach.certificationStatus !== "ACTIVE" ||
    (coach.certificationExpiry !== null &&
      coach.certificationExpiry <= new Date())
  ) {
    notFound();
  }

  const raw = await searchParams;
  const search =
    typeof raw.search === "string" ? raw.search.trim().toLowerCase() : "";
  const assessment =
    typeof raw.assessment === "string" ? raw.assessment.trim() : "";
  const cursor = typeof raw.cursor === "string" ? raw.cursor : null;
  const from = dateBoundary(
    typeof raw.from === "string" ? raw.from : undefined,
    false,
  );
  const to = dateBoundary(
    typeof raw.to === "string" ? raw.to : undefined,
    true,
  );
  const retentionCutoff = publicLeadRetentionCutoff(state);
  if (retentionCutoff === null) notFound();
  const effectiveFrom =
    from && from > retentionCutoff ? from : retentionCutoff;

  const where = {
    referringCoachId: coach.id,
    publicLeadDeletedAt: null,
    respondentId: null,
    ...(assessment
      ? { campaign: { templateId: assessment, deletedAt: null } }
      : { campaign: { deletedAt: null } }),
    submittedAt: {
      gte: effectiveFrom,
      ...(to ? { lt: to } : {}),
    },
    ...(search
      ? {
          OR: [
            { publicTakerNameNormalized: { startsWith: search } },
            { publicTakerEmailNormalized: { startsWith: search } },
          ],
        }
      : {}),
  };

  const leads = await db.assessmentSubmission.findMany({
    where,
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      submittedAt: true,
      publicTaker: true,
      result: true,
      campaign: {
        select: {
          template: { select: { id: true, name: true } },
        },
      },
    },
  });

  const templates = await db.assessmentTemplate.findMany({
    where: {
      campaigns: {
        some: {
          submissions: {
            some: {
              referringCoachId: coach.id,
              publicLeadDeletedAt: null,
            },
          },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const hasNext = leads.length > PAGE_SIZE;
  const visible = leads.slice(0, PAGE_SIZE);
  console.info(
    JSON.stringify({
      marker: "assessment.public_leads.list",
      state: state.mode,
      rowCount: visible.length,
      filtered: Boolean(search || assessment || from || to),
      hasNext,
    }),
  );
  const nextCursor = hasNext ? visible.at(-1)?.id : null;
  const persistentQuery = new URLSearchParams();
  for (const key of ["search", "assessment", "from", "to"] as const) {
    const value = raw[key];
    if (typeof value === "string" && value) persistentQuery.set(key, value);
  }
  if (nextCursor) persistentQuery.set("cursor", nextCursor);

  return (
    <div className="space-y-6">
      <Link
        href="/portal/assessments"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Assessments
      </Link>

      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Your referral activity
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Public leads</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              People who completed a public assessment from your share link.
            </p>
          </div>
          <PublicLeadExportButton
            filter={{
              ...(typeof raw.search === "string"
                ? { search: raw.search }
                : {}),
              ...(typeof raw.assessment === "string"
                ? { assessment: raw.assessment }
                : {}),
              ...(typeof raw.from === "string" ? { from: raw.from } : {}),
              ...(typeof raw.to === "string" ? { to: raw.to } : {}),
            }}
          />
        </div>
      </header>

      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(14rem,1fr)_minmax(12rem,0.7fr)_auto_auto_auto]">
        <label className="relative">
          <span className="sr-only">Search name or email prefix</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            name="search"
            defaultValue={typeof raw.search === "string" ? raw.search : ""}
            placeholder="Name or email starts with…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm"
          />
        </label>
        <select
          name="assessment"
          defaultValue={assessment}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">All assessments</option>
          {templates.map((template) => (
            <option value={template.id} key={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <input
          aria-label="From date"
          type="date"
          name="from"
          defaultValue={typeof raw.from === "string" ? raw.from : ""}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <input
          aria-label="Through date"
          type="date"
          name="to"
          defaultValue={typeof raw.to === "string" ? raw.to : ""}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <button className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
          Filter
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <h2 className="font-semibold">No matching public leads</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Share your assessment link or clear the current filters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((lead) => {
              const taker = (lead.publicTaker ?? {}) as {
                firstName?: string;
                lastName?: string;
                email?: string;
              };
              const name =
                `${taker.firstName ?? ""} ${taker.lastName ?? ""}`.trim() ||
                taker.email ||
                "Public taker";
              return (
                <article
                  key={lead.id}
                  className="grid gap-3 border-l-4 border-l-primary px-5 py-4 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(13rem,1.2fr)_minmax(12rem,1fr)_10rem_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{name}</h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {taker.email}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {lead.campaign.template.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {resultHeadline(lead.result)}
                    </p>
                  </div>
                  <time className="text-sm text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(lead.submittedAt)}
                  </time>
                  <Link
                    href={`/assessments/public-leads/${lead.id}/report`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    View report
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {nextCursor && (
        <div className="flex justify-end">
          <Link
            href={`?${persistentQuery.toString()}`}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Next page
          </Link>
        </div>
      )}
    </div>
  );
}
