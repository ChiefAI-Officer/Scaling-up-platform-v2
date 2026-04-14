"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BioPageTemplate } from "@/components/templates/bio-page-template";

interface BioPageData {
  coachName: string;
  coachTitle: string;
  biography: string;
  profileImageUrl: string;
  showCtaButton: boolean;
  ctaButtonText: string;
  ctaButtonUrl: string;
}

interface Workshop {
  id: string;
  title: string;
  coach: {
    id: string;
    firstName: string;
    lastName: string;
    bio: string | null;
    profileImage: string | null;
    bookCallUrl: string | null;
  };
}

export default function BioPageEditor() {
  const params = useParams();
  const router = useRouter();
  const workshopId = params.id as string;

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState<BioPageData>({
    coachName: "",
    coachTitle: "Scaling Up Certified Coach",
    biography: "",
    profileImageUrl: "",
    showCtaButton: true,
    ctaButtonText: "Book a Free Call",
    ctaButtonUrl: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [workshopRes, pageRes] = await Promise.all([
          fetch(`/api/workshops/${workshopId}`),
          fetch(`/api/workshops/${workshopId}/landing-pages/BIO_PAGE`),
        ]);

        const workshopData = await workshopRes.json();
        if (workshopData.success) {
          setWorkshop(workshopData.data);

          // Pre-fill from coach data
          const coach = workshopData.data.coach;
          setFormData((prev) => ({
            ...prev,
            coachName: `${coach.firstName} ${coach.lastName}`,
            biography: coach.bio || "",
            profileImageUrl: coach.profileImage || "",
            ctaButtonText: `Book a Free Call with ${coach.firstName}`,
            ctaButtonUrl: coach.bookCallUrl || "",
          }));
        }

        const pageData = await pageRes.json();
        if (pageData.success && pageData.data) {
          // Override with saved landing page data; fall back to coach.bookCallUrl if not explicitly set
          const content = JSON.parse(pageData.data.content);
          const coachBookCallUrl = workshopData.success ? workshopData.data.coach?.bookCallUrl : null;
          setFormData((prev) => ({
            ...prev,
            ...content,
            ctaButtonUrl: content.ctaButtonUrl || coachBookCallUrl || prev.ctaButtonUrl || "",
          }));
        }
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [workshopId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const nextValue =
      type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
    setSuccess(false);
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(
        `/api/workshops/${workshopId}/landing-pages/BIO_PAGE`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: formData,
            status: publish ? "PUBLISHED" : "DRAFT",
          }),
        }
      );

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to save");
      }

      setSuccess(true);
      if (publish) {
        // Open preview in new tab
        window.open(`/workshop/${data.data.slug}`, "_blank");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formDataUpload = new FormData();
    formDataUpload.append("file", file);
    formDataUpload.append("type", "profile");

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formDataUpload,
      });
      const data = await response.json();
      if (data.success) {
        setFormData((prev) => ({ ...prev, profileImageUrl: data.url }));
      }
    } catch {
      setError("Failed to upload image");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/workshops" className="hover:text-foreground">Workshops</Link>
          <span>/</span>
          <Link href={`/workshops/${workshopId}/landing-pages`} className="hover:text-foreground">Workshop Editor</Link>
          <span>/</span>
          <span className="text-foreground">Bio Page</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Bio Page Editor</h1>
        <p className="text-muted-foreground">Edit the coach biography landing page</p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-lg mb-6">
          Changes saved successfully!
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Editor Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Coach Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="coachName">Coach Name</Label>
                <Input
                  id="coachName"
                  name="coachName"
                  value={formData.coachName}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="coachTitle">Title / Credentials</Label>
                <Input
                  id="coachTitle"
                  name="coachTitle"
                  value={formData.coachTitle}
                  onChange={handleChange}
                  placeholder="Scaling Up Certified Coach"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="profileImage">Profile Picture</Label>
                <div className="mt-1 flex items-center gap-4">
                  {formData.profileImageUrl && (
                    <img
                      src={formData.profileImageUrl}
                      alt="Profile"
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <Input
                      id="profileImageUrl"
                      name="profileImageUrl"
                      value={formData.profileImageUrl}
                      onChange={handleChange}
                      placeholder="Image URL"
                      className="mb-2"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Biography</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="biography">Biography Text</Label>
                <textarea
                  id="biography"
                  name="biography"
                  value={formData.biography}
                  onChange={handleChange}
                  rows={10}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
                  placeholder="Enter the coach's biography..."
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Use double line breaks to create paragraphs
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Call to Action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  id="showCtaButton"
                  name="showCtaButton"
                  type="checkbox"
                  checked={formData.showCtaButton}
                  onChange={handleChange}
                  className="rounded border-border"
                />
                <Label htmlFor="showCtaButton">Show CTA button on bio page</Label>
              </div>
              <div>
                <Label htmlFor="ctaButtonText">Button Text</Label>
                <Input
                  id="ctaButtonText"
                  name="ctaButtonText"
                  value={formData.ctaButtonText}
                  onChange={handleChange}
                  placeholder="Book a Free Call with [Name]"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ctaButtonUrl">Button Link URL</Label>
                <Input
                  id="ctaButtonUrl"
                  name="ctaButtonUrl"
                  value={formData.ctaButtonUrl}
                  onChange={handleChange}
                  placeholder="https://calendly.com/..."
                  className="mt-1"
                  disabled={!formData.showCtaButton}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={() => handleSave(false)}
              variant="outline"
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Saving..." : "Save Draft"}
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Publishing..." : "Save & Publish"}
            </Button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="sticky top-4">
          <Card className="overflow-hidden">
            <CardHeader className="bg-muted border-b py-2">
              <CardTitle className="text-sm font-medium">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <BioPageTemplate content={formData} isPreview={true} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
