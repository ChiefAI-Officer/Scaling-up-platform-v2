export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";
import { PageTemplateToggle } from "@/components/templates/page-template-toggle";
import { DeletePageTemplateButton } from "@/components/templates/delete-page-template-button";

// Template type metadata — emoji, label, description
const TEMPLATE_TYPE_META: Record<
  string,
  { emoji: string; label: string; description: string }
> = {
  BIO_PAGE: {
    emoji: "👤",
    label: "Bio Page",
    description: "Coach biography and credentials page",
  },
  SOLO_LANDING: {
    emoji: "📄",
    label: "Solo Landing Page",
    description: "Single coach workshop landing page",
  },
  DUO_LANDING: {
    emoji: "👥",
    label: "Duo Workshop Landing Page",
    description: "Two-coach workshop landing page",
  },
  REGISTRATION: {
    emoji: "📝",
    label: "Registration Page",
    description: "Registration form sub-page",
  },
  THANK_YOU: {
    emoji: "🎉",
    label: "Thank You Page",
    description: "Post-registration confirmation",
  },
};

async function getPageTemplates() {
  return db.pageTemplate.findMany({
    include: {
      category: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ isActive: "desc" }, { templateType: "asc" }, { updatedAt: "desc" }],
  });
}

async function getCategories() {
  return db.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

interface TemplatesPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const params = await searchParams;
  const selectedTab = params.tab ?? "global";

  const [allTemplates, categories] = await Promise.all([
    getPageTemplates(),
    getCategories(),
  ]);

  // Split into global (categoryId = null) and per-category groups
  const globalTemplates = allTemplates.filter((t) => t.categoryId === null);
  const categoryTemplatesMap = new Map<string, typeof allTemplates>();
  for (const cat of categories) {
    categoryTemplatesMap.set(
      cat.id,
      allTemplates.filter((t) => t.categoryId === cat.id)
    );
  }

  // Determine which templates to show based on selected tab
  const isGlobalTab = selectedTab === "global";
  const selectedCategory = categories.find((c) => c.id === selectedTab) ?? null;
  const visibleTemplates = isGlobalTab
    ? globalTemplates
    : (categoryTemplatesMap.get(selectedTab) ?? []);

  const activeCount = visibleTemplates.filter((t) => t.isActive).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeUp>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Templates</h1>
            <p className="mt-1 text-muted-foreground max-w-2xl">
              Edit the page templates used when building workshop-specific pages.
              Filter by category to manage per-category templates (AI vs Exit &amp; Valuation).
            </p>
          </div>
          <Link
            href="/templates/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all hover:shadow-md shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            Create Template
          </Link>
        </div>
      </FadeUp>

      {/* Category filter tabs */}
      <FadeUp delay={0.05}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Filter by category:</span>
          <div className="flex items-center gap-2">
            <Link
              href="/templates"
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                isGlobalTab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              All
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/templates?tab=${cat.id}`}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  selectedTab === cat.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>
      </FadeUp>

      {/* Context note for category tab */}
      {!isGlobalTab && selectedCategory && (
        <FadeUp delay={0.08}>
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
            Showing templates for{" "}
            <span className="font-semibold">{selectedCategory.name}</span>.
            Category templates take priority over global templates during auto-build.
          </div>
        </FadeUp>
      )}

      {/* Template cards */}
      {visibleTemplates.length === 0 ? (
        <FadeUp delay={0.1}>
          <div className="rounded-xl border-2 border-dashed border-border bg-card px-6 py-16 text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-foreground font-medium mb-1">
              No templates{selectedCategory ? ` for ${selectedCategory.name}` : ""} yet
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Create a template to get started with auto-building workshop pages.
            </p>
            <Link
              href="/templates/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              Create Template
            </Link>
          </div>
        </FadeUp>
      ) : (
        <StaggerContainer className="space-y-4">
          {visibleTemplates.map((template) => {
            const meta = TEMPLATE_TYPE_META[template.templateType] ?? {
              emoji: "📃",
              label: template.templateType,
              description: "Page template",
            };

            return (
              <StaggerItem key={template.id}>
                <div className="group rounded-xl border border-border bg-card p-6 transition-all hover:shadow-md hover:border-border/80">
                  <div className="flex items-start gap-5">
                    {/* Emoji icon */}
                    <div className="text-3xl shrink-0 mt-0.5" aria-hidden="true">
                      {meta.emoji}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        {/* Left: template info */}
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-foreground">
                            {meta.label}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {meta.description}
                          </p>

                          {/* Status line */}
                          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                            {template.isActive ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                                <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
                                Active template
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                                Inactive
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground/60">|</span>
                            {template.category ? (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                                {template.category.name}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                                All Categories
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground/60">|</span>
                            <span className="text-xs text-muted-foreground">
                              Updated{" "}
                              {new Date(template.updatedAt).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Right: actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <PageTemplateToggle
                            templateId={template.id}
                            isActive={template.isActive}
                          />
                          <Link
                            href={`/templates/${template.id}/edit`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                          </Link>
                          <DeletePageTemplateButton
                            templateId={template.id}
                            templateName={template.name}
                            isActive={template.isActive}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      {/* Summary stats */}
      {visibleTemplates.length > 0 && (
        <FadeUp delay={0.2}>
          <p className="text-sm text-muted-foreground">
            {activeCount} active / {visibleTemplates.length} total template{visibleTemplates.length !== 1 ? "s" : ""}
            {isGlobalTab ? " (all categories)" : selectedCategory ? ` (${selectedCategory.name})` : ""}
          </p>
        </FadeUp>
      )}

      {/* How Templates Work */}
      <FadeUp delay={0.25}>
        <div className="rounded-xl border border-border bg-muted/30 p-6">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            How Templates Work
          </h3>
          <div className="text-sm text-muted-foreground space-y-2.5 leading-relaxed">
            <p>
              To set a global template, use the{" "}
              <strong className="text-foreground">Set Template</strong> button on the{" "}
              <strong className="text-foreground">All</strong> tab.
              To set a category-specific override, switch to that category tab and use{" "}
              <strong className="text-foreground">Set Override</strong> or{" "}
              <strong className="text-foreground">Set Template</strong>.
            </p>
            <p>
              Templates can be scoped to a category (AI or Exit &amp; Valuation).
              When auto-build runs, it picks the category-specific template first and falls back
              to the global template if no override exists. Templates on the{" "}
              <strong className="text-foreground">All</strong> tab have no category and apply to
              all workshops as a fallback.
            </p>
            <p>
              <strong className="text-foreground">Important:</strong>{" "}
              Exit &amp; Valuation templates are seeded but inactive by default.
              Activate them from this page only after verifying their content.
            </p>
          </div>
        </div>
      </FadeUp>
    </div>
  );
}
