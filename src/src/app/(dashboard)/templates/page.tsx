export const dynamic = "force-dynamic";

// MR-28: Show 4 global templates only (not workshop-specific)
// MR-27: Add delete page action
// FIG-005: Per-category landing page templates — category filter dropdown added

import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteLandingPageButton } from "@/components/templates/delete-landing-page-button";

const TEMPLATE_OPTIONS = [
  {
    value: "SOLO_LANDING",
    label: "Solo Landing Page",
    description: "Single coach workshop landing page",
    route: "solo-landing",
    icon: "📄",
  },
  {
    value: "DUO_LANDING",
    label: "Duo Workshop Landing Page",
    description: "Two-coach workshop landing page",
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

async function getMasterTemplates(categoryId: string | null) {
  // FIG-005: Filter templates by category. "null" means global (no categoryId filter).
  const categoryWhere = categoryId
    ? { categoryId }
    : {}; // no filter → show all active templates (original behaviour when "All" is selected)

  const pages = await db.landingPage.findMany({
    where: {
      isActiveTemplate: true,
      template: { in: ["SOLO_LANDING", "DUO_LANDING", "REGISTRATION", "THANK_YOU"] },
      ...categoryWhere,
    },
    select: {
      id: true,
      template: true,
      status: true,
      slug: true,
      isActiveTemplate: true,
      createdAt: true,
      workshopId: true,
      categoryId: true,
      workshop: { select: { title: true } },
      category: { select: { id: true, name: true } },
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

async function getCategories() {
  return db.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "PUBLISHED") return "default";
  if (status === "DRAFT") return "secondary";
  return "outline";
}

interface TemplatesPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const params = await searchParams;
  const selectedCategoryId = params.category ?? null;

  const [masterByType, categories] = await Promise.all([
    getMasterTemplates(selectedCategoryId),
    getCategories(),
  ]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Templates</h1>
        <p className="text-muted-foreground">
          Edit the page templates used when building workshop-specific pages.
          Filter by category to manage per-category templates (AI vs Exit &amp; Valuation).
        </p>
      </div>

      {/* FIG-005: Category filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Filter by category:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/templates"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !selectedCategoryId
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            All
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/templates?category=${cat.id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                selectedCategoryId === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      </div>

      {selectedCategory && (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          Showing templates for <span className="font-semibold text-foreground">{selectedCategory.name}</span>.
          Templates with no category (global) are <span className="font-semibold">not</span> shown — use &quot;All&quot; to see them.
        </div>
      )}

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
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{option.label}</p>
                        {master?.category && (
                          <Badge variant="outline" className="text-xs">
                            {master.category.name}
                          </Badge>
                        )}
                        {master && !master.category && (
                          <Badge variant="secondary" className="text-xs">
                            Global
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                      {master ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={statusVariant(master.status)}>{master.status}</Badge>
                          <span>Based on: {master.workshop.title}</span>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-warning">
                          No master template set{selectedCategory ? ` for ${selectedCategory.name}` : ""} — mark a landing page as Auto-Build to promote it here.
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
            master template, open the workshop landing page editor and toggle &quot;Auto-Build&quot; on.
          </p>
          <p>
            Templates can be scoped to a category (AI or Exit &amp; Valuation). When auto-build runs,
            it picks templates matching the workshop&apos;s category first. Templates with no category
            are &quot;global&quot; and apply to all workshops as a fallback.
          </p>
          <p>
            <strong>Important:</strong> Exit &amp; Valuation templates are seeded but inactive by default.
            Activate them from the workshop landing page editor only after verifying their content.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
