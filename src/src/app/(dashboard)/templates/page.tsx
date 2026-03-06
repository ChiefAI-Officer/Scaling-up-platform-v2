export const dynamic = "force-dynamic";

// MR-28: Show 4 global templates only (not workshop-specific)
// MR-27: Add delete page action

import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteLandingPageButton } from "@/components/templates/delete-landing-page-button";

const TEMPLATE_OPTIONS = [
  {
    value: "SOLO_LANDING",
    label: "Solo Landing Page",
    description: "Single coach workshop landing page for Exit & Valuation",
    route: "solo-landing",
    icon: "📄",
  },
  {
    value: "DUO_LANDING",
    label: "Duo Workshop Landing Page",
    description: "Two-coach AI workshop landing page",
    route: "duo-landing",
    icon: "👥",
  },
  {
    value: "REGISTRATION",
    label: "Registration Page",
    description: "Registration form sub-page",
    route: "registration",
    icon: "📝",
  },
  {
    value: "THANK_YOU",
    label: "Thank You Page",
    description: "Post-registration confirmation",
    route: "thank-you",
    icon: "🎉",
  },
] as const;

type TemplateValue = (typeof TEMPLATE_OPTIONS)[number]["value"];

async function getMasterTemplates() {
  // For each template type, find the page marked as active template (the "master")
  const pages = await db.landingPage.findMany({
    where: {
      isActiveTemplate: true,
      template: { in: ["SOLO_LANDING", "DUO_LANDING", "REGISTRATION", "THANK_YOU"] },
    },
    select: {
      id: true,
      template: true,
      status: true,
      slug: true,
      isActiveTemplate: true,
      createdAt: true,
      workshopId: true,
      workshop: { select: { title: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // One master per template type (latest updatedAt)
  const masterByType = new Map<string, typeof pages[number]>();
  for (const p of pages) {
    if (!masterByType.has(p.template)) {
      masterByType.set(p.template, p);
    }
  }
  return masterByType;
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "PUBLISHED") return "default";
  if (status === "DRAFT") return "secondary";
  return "outline";
}

export default async function TemplatesPage() {
  const masterByType = await getMasterTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Templates</h1>
        <p className="text-muted-foreground">
          Edit the 4 global page templates used when building workshop-specific pages.
          Mark a workshop landing page as "Auto-Build" to promote it as the master template.
        </p>
      </div>

      <div className="grid gap-4">
        {TEMPLATE_OPTIONS.map((option) => {
          const master = masterByType.get(option.value as TemplateValue);
          const editHref = master
            ? `/workshops/${master.workshopId}/landing-pages/${option.route}`
            : null;
          const previewHref = master ? `/workshop/${master.slug}` : null;

          return (
            <Card key={option.value}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{option.icon}</span>
                    <div>
                      <p className="font-semibold text-foreground">{option.label}</p>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                      {master ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={statusVariant(master.status)}>{master.status}</Badge>
                          <span>Based on: {master.workshop.title}</span>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-warning">
                          No master template set — mark a landing page as Auto-Build to promote it here.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {master && editHref && (
                      <>
                        {previewHref && (
                          <Link
                            href={previewHref}
                            target="_blank"
                            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                          >
                            Preview
                          </Link>
                        )}
                        <Link
                          href={editHref}
                          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Edit
                        </Link>
                        <DeleteLandingPageButton pageId={master.id} templateLabel={option.label} />
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How Templates Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Each workshop has its own set of landing pages. To promote a workshop page as the
            global master template, open the workshop landing page editor and toggle "Auto-Build" on.
          </p>
          <p>
            The master template's content and layout is used as the starting point when
            auto-generating pages for new approved workshops.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
