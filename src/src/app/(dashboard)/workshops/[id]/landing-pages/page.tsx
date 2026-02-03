"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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

const TEMPLATE_OPTIONS = [
  {
    value: "BIO_PAGE",
    label: "Bio Page",
    description: "Coach biography page with profile photo and credentials",
    icon: "👤",
  },
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
          <a href="/workshops" className="hover:text-gray-700">Workshops</a>
          <span>/</span>
          <a href={`/workshops/${workshopId}`} className="hover:text-gray-700">{workshop.title}</a>
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
