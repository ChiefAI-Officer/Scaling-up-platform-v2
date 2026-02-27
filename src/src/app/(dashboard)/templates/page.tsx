export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActiveTemplateToggle } from "@/components/templates/active-template-toggle";

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

async function getTemplateData() {
  const [workshops, pages] = await Promise.all([
    db.workshop.findMany({
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.landingPage.findMany({
      where: {
        template: {
          in: ["SOLO_LANDING", "DUO_LANDING", "REGISTRATION", "THANK_YOU"],
        },
      },
      select: {
        id: true,
        template: true,
        status: true,
        slug: true,
        isActiveTemplate: true,
        createdAt: true,
        workshopId: true,
        workshop: {
          select: { title: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { workshops, pages };
}

function labelForStatus(status: string): "default" | "secondary" | "outline" {
  if (status === "PUBLISHED") {
    return "default";
  }
  if (status === "DRAFT") {
    return "secondary";
  }
  return "outline";
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ workshopId?: string; template?: string }>;
}) {
  const { workshopId, template } = await searchParams;
  const { workshops, pages } = await getTemplateData();

  const selectedWorkshopId = workshopId || workshops[0]?.id || "";
  const selectedTemplate =
    template && TEMPLATE_OPTIONS.some((option) => option.value === template)
      ? template
      : TEMPLATE_OPTIONS[0]?.value;
  const selectedTemplateMeta =
    TEMPLATE_OPTIONS.find((option) => option.value === selectedTemplate) || null;

  const selectedPage = pages.find(
    (page) =>
      page.workshopId === selectedWorkshopId && page.template === selectedTemplateMeta?.value
  );

  const templateHref =
    selectedWorkshopId && selectedTemplateMeta
      ? `/workshops/${selectedWorkshopId}/landing-pages/${selectedTemplateMeta.route}`
      : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Templates</h1>
        <p className="text-muted-foreground">Select template to edit</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Template to Edit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-4">
            <div>
              <label htmlFor="workshopId" className="text-sm font-medium text-foreground">
                Workshop
              </label>
              <select
                id="workshopId"
                name="workshopId"
                defaultValue={selectedWorkshopId}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2"
              >
                {workshops.map((workshop) => (
                  <option key={workshop.id} value={workshop.id}>
                    {workshop.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="template" className="text-sm font-medium text-foreground">
                Landing Page Template
              </label>
              <select
                id="template"
                name="template"
                defaultValue={selectedTemplateMeta?.value}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2"
              >
                {TEMPLATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.icon} {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-200"
            >
              Refresh Selection
            </button>
          </form>

          {selectedTemplateMeta && (
            <div className="rounded-lg border p-4">
              <p className="font-medium text-foreground">
                {selectedTemplateMeta.icon} {selectedTemplateMeta.label}
              </p>
              <p className="text-sm text-muted-foreground">{selectedTemplateMeta.description}</p>
              <div className="mt-3 flex items-center gap-3">
                <Badge variant={selectedPage ? labelForStatus(selectedPage.status) : "outline"}>
                  {selectedPage ? selectedPage.status : "NOT_CREATED"}
                </Badge>
                {templateHref && (
                  <Link
                    href={templateHref}
                    className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Edit Template
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <p className="text-muted-foreground">No templates created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Template
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Workshop
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Create Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Auto-Build
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pages.map((page) => {
                    const templateMeta =
                      TEMPLATE_OPTIONS.find((option) => option.value === page.template) || null;
                    const editHref = templateMeta
                      ? `/workshops/${page.workshopId}/landing-pages/${templateMeta.route}`
                      : `/workshops/${page.workshopId}/landing-pages`;

                    return (
                      <tr key={page.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">
                            {templateMeta?.label || page.template}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{page.workshop.title}</td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {formatDate(page.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={labelForStatus(page.status)}>{page.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <ActiveTemplateToggle pageId={page.id} isActive={page.isActiveTemplate} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Link href={editHref} className="text-blue-600 hover:underline text-sm">
                              Edit
                            </Link>
                            <Link
                              href={`/workshop/${page.slug}`}
                              target="_blank"
                              className="text-blue-600 hover:underline text-sm"
                            >
                              Preview
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

