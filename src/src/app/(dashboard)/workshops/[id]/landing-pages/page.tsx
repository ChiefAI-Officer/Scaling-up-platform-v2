"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Workshop {
  id: string;
  title: string;
  category: "AI" | "EXIT_AND_VALUATION";
  coach: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    bio: string | null;
    profileImage: string | null;
  };
  landingPages: Array<{
    id: string;
    template: string;
    status: string;
    slug: string;
  }>;
}

interface TemplateLibraryItem {
  id: string;
  template: "SOLO_LANDING" | "DUO_LANDING" | "REGISTRATION";
  status: string;
  slug: string;
  createdAt: string;
  workshopId: string;
  workshopTitle: string;
  editPath: string;
}

const TEMPLATE_OPTIONS = [
  {
    value: "SOLO_LANDING",
    label: "Solo Landing Page",
    description: "Single coach workshop landing page for Exit & Valuation",
    icon: "📄",
  },
  {
    value: "DUO_LANDING",
    label: "Duo Workshop Landing Page",
    description: "Two-coach AI Workshop landing page",
    icon: "👥",
  },
  {
    value: "REGISTRATION",
    label: "Registration Page",
    description: "Registration form sub-page (linked from landing pages)",
    icon: "📝",
  },
  {
    value: "THANK_YOU",
    label: "Thank You Page",
    description: "Post-registration confirmation with video",
    icon: "🎉",
  },
];

export default function LandingPagesPage() {
  const params = useParams();
  const router = useRouter();
  const workshopId = params.id as string;

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [libraryItems, setLibraryItems] = useState<TemplateLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState("");
  const [copyingTemplate, setCopyingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkshop() {
      try {
        const res = await fetch(`/api/workshops/${workshopId}`);
        const data = await res.json();
        if (data.success) {
          setWorkshop(data.data);
        } else {
          setError(data.error || "Failed to load workshop");
        }
      } catch {
        setError("Failed to load workshop");
      } finally {
        setLoading(false);
      }
    }
    loadWorkshop();
  }, [workshopId]);

  const getTemplateStatus = (templateValue: string) => {
    const page = workshop?.landingPages?.find(
      (p) => p.template === templateValue
    );
    if (!page) return { status: "NOT_CREATED", label: "Not Created", variant: "secondary" as const };
    if (page.status === "PUBLISHED") return { status: "PUBLISHED", label: "Published", variant: "default" as const };
    return { status: "DRAFT", label: "Draft", variant: "outline" as const };
  };

  const handleEditTemplate = () => {
    if (selectedTemplate) {
      router.push(`/workshops/${workshopId}/landing-pages/${selectedTemplate.toLowerCase().replace("_", "-")}`);
    }
  };

  const selectedTemplateSupportsLibrary = ["SOLO_LANDING", "DUO_LANDING", "REGISTRATION"].includes(selectedTemplate);

  useEffect(() => {
    async function loadTemplateLibrary() {
      if (!selectedTemplateSupportsLibrary) {
        setLibraryItems([]);
        setSelectedLibraryItemId("");
        return;
      }

      try {
        setLibraryLoading(true);
        setTemplateError(null);
        setTemplateMessage(null);

        const res = await fetch(`/api/landing-pages/library?template=${selectedTemplate}`);
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to load template library");
        }

        const items = (data.data || []) as TemplateLibraryItem[];
        setLibraryItems(items);
        setSelectedLibraryItemId(items[0]?.id || "");
      } catch (loadError) {
        setTemplateError(loadError instanceof Error ? loadError.message : "Failed to load template library");
      } finally {
        setLibraryLoading(false);
      }
    }

    void loadTemplateLibrary();
  }, [selectedTemplate, selectedTemplateSupportsLibrary]);

  const handleApplyTemplate = async () => {
    if (!selectedTemplateSupportsLibrary || !selectedLibraryItemId) {
      return;
    }

    try {
      setCopyingTemplate(true);
      setTemplateError(null);
      setTemplateMessage(null);

      const res = await fetch("/api/landing-pages/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetWorkshopId: workshopId,
          targetTemplate: selectedTemplate,
          sourceLandingPageId: selectedLibraryItemId,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to apply template");
      }

      setTemplateMessage("Template content copied. You can now edit this workshop page.");
      setWorkshop((prev) => {
        if (!prev) {
          return prev;
        }

        const existing = prev.landingPages.find((page) => page.template === selectedTemplate);
        if (existing) {
          return {
            ...prev,
            landingPages: prev.landingPages.map((page) =>
              page.template === selectedTemplate ? { ...page, status: "DRAFT" } : page
            ),
          };
        }

        return {
          ...prev,
          landingPages: [
            ...prev.landingPages,
            {
              id: data.data.id,
              template: selectedTemplate,
              status: "DRAFT",
              slug: data.data.slug || "",
            },
          ],
        };
      });
    } catch (copyError) {
      setTemplateError(copyError instanceof Error ? copyError.message : "Failed to apply template");
    } finally {
      setCopyingTemplate(false);
    }
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !workshop) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || "Workshop not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/workshops" className="hover:text-gray-700">Workshops</Link>
          <span>/</span>
          <Link href={`/workshops/${workshopId}`} className="hover:text-gray-700">{workshop.title}</Link>
          <span>/</span>
          <span className="text-gray-900">Landing Pages</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Landing Page Editor</h1>
        <p className="text-gray-600">
          Create and manage landing pages for {workshop.title}
        </p>
      </div>

      {/* Workshop Summary Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Workshop Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Coach:</span>{" "}
              <span className="font-medium">{workshop.coach.firstName} {workshop.coach.lastName}</span>
            </div>
            <div>
              <span className="text-gray-500">Category:</span>{" "}
              <Badge variant="outline">
                {workshop.category === "AI" ? "AI Workshop" : "Exit & Valuation"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Template Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Select Template to Edit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="template">Landing Page Template</Label>
            <select
              id="template"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select a template...</option>
              {TEMPLATE_OPTIONS.map((option) => {
                const status = getTemplateStatus(option.value);
                return (
                  <option key={option.value} value={option.value}>
                    {option.icon} {option.label} ({status.label})
                  </option>
                );
              })}
            </select>
          </div>

          {selectedTemplate && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">
                  {TEMPLATE_OPTIONS.find((o) => o.value === selectedTemplate)?.icon}
                </span>
                <div>
                  <h3 className="font-medium">
                    {TEMPLATE_OPTIONS.find((o) => o.value === selectedTemplate)?.label}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {TEMPLATE_OPTIONS.find((o) => o.value === selectedTemplate)?.description}
                  </p>
                  <div className="mt-2">
                    <Badge variant={getTemplateStatus(selectedTemplate).variant}>
                      {getTemplateStatus(selectedTemplate).label}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedTemplateSupportsLibrary && (
            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <div>
                <Label htmlFor="sourceTemplate">Use Existing Page as Template</Label>
                <select
                  id="sourceTemplate"
                  value={selectedLibraryItemId}
                  onChange={(event) => setSelectedLibraryItemId(event.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  disabled={libraryLoading || libraryItems.length === 0}
                >
                  <option value="">
                    {libraryLoading ? "Loading templates..." : "Select a template source..."}
                  </option>
                  {libraryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.workshopTitle} ({formatDate(item.createdAt)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedLibraryItemId || copyingTemplate}
                  onClick={handleApplyTemplate}
                >
                  {copyingTemplate ? "Applying..." : "Use Selected Template"}
                </Button>
              </div>

              {templateError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {templateError}
                </div>
              ) : null}
              {templateMessage ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  {templateMessage}
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-md border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        Name
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        Created Date
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        Edit Link
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {libraryItems.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-sm text-gray-500">
                          {libraryLoading
                            ? "Loading pages..."
                            : "No template pages found yet for this type."}
                        </td>
                      </tr>
                    ) : (
                      libraryItems.map((item) => (
                        <tr key={item.id} className={item.id === selectedLibraryItemId ? "bg-blue-50" : ""}>
                          <td className="px-3 py-2 text-sm text-gray-900">{item.workshopTitle}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">{formatDate(item.createdAt)}</td>
                          <td className="px-3 py-2 text-sm">
                            <Link
                              href={item.editPath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Edit
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleEditTemplate}
              disabled={!selectedTemplate}
              className="flex-1"
            >
              Edit Template
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/workshops/${workshopId}`)}
            >
              Back to Workshop
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* All Templates Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {TEMPLATE_OPTIONS.map((option) => {
              const status = getTemplateStatus(option.value);
              const page = workshop.landingPages?.find(
                (p) => p.template === option.value
              );
              return (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedTemplate(option.value)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{option.icon}</span>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-gray-500">{option.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {page && (
                      <a
                        href={`/workshop/${page.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Preview
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
