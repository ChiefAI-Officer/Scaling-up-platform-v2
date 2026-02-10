"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
          }));
        }

        const pageData = await pageRes.json();
        if (pageData.success && pageData.data) {
          // Override with saved landing page data
          const content = JSON.parse(pageData.data.content);
          setFormData((prev) => ({ ...prev, ...content }));
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
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/workshops" className="hover:text-gray-700">Workshops</Link>
          <span>/</span>
          <Link href={`/workshops/${workshopId}/landing-pages`} className="hover:text-gray-700">Landing Pages</Link>
          <span>/</span>
          <span className="text-gray-900">Bio Page</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Bio Page Editor</h1>
        <p className="text-gray-600">Edit the coach biography landing page</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
          Changes saved successfully!
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Editor Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
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
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter the coach's biography..."
                />
                <p className="text-sm text-gray-500 mt-1">
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
                  className="rounded border-gray-300"
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
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden bg-white">
                <div className="p-6 text-center">
                  {/* Logo */}
                  <div className="text-purple-700 font-bold text-xl mb-8">
                    SCALING UP COACHES
                  </div>

                  {/* Profile Image */}
                  {formData.profileImageUrl ? (
                    <img
                      src={formData.profileImageUrl}
                      alt={formData.coachName}
                      className="w-32 h-32 rounded-full object-cover mx-auto mb-4 border-4 border-purple-100"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gray-200 mx-auto mb-4 flex items-center justify-center">
                      <span className="text-gray-400">No Image</span>
                    </div>
                  )}

                  {/* Name & Title */}
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">
                    {formData.coachName || "Coach Name"}
                  </h1>
                  <p className="text-gray-600 mb-6">
                    {formData.coachTitle || "Scaling Up Certified Coach"}
                  </p>

                  {/* Biography */}
                  <div className="text-left text-sm text-gray-700 space-y-3 mb-6 max-h-48 overflow-y-auto">
                    {formData.biography ? (
                      formData.biography.split("\n\n").map((para, i) => (
                        <p key={i}>{para}</p>
                      ))
                    ) : (
                      <p className="text-gray-400 italic">Biography will appear here...</p>
                    )}
                  </div>

                  {/* CTA Button */}
                  {formData.showCtaButton && (
                    <button className="bg-purple-600 text-white px-6 py-3 rounded-full font-medium hover:bg-purple-700 transition">
                      {formData.ctaButtonText || "Book a Free Call"}
                    </button>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t px-6 py-4 text-center text-sm text-gray-500">
                  © {new Date().getFullYear()} Scaling Up Coach {formData.coachName?.split(" ")[0]}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
