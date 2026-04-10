"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RegistrationPageTemplate, SAMPLE_WORKSHOP_REGISTRATION } from "@/components/templates/registration-page-template";

interface RegistrationPageData {
  coachName: string;
  coachPhoto: string;
  coachTitle: string;
  workshopTitle: string;
  eventDate: string;
  eventTime: string;
  heroHeadline: string;
  heroDescription: string;
  formTitle: string;
  emailPlaceholder: string;
  namePlaceholder: string;
  companyPlaceholder: string;
  optInText: string;
  submitButtonText: string;
  privacyText: string;
}

const DEFAULT_DATA: RegistrationPageData = {
  coachName: "",
  coachPhoto: "",
  coachTitle: "Scaling Up Certified Coach",
  workshopTitle: "Scaling Up to Finish Strong Virtual Workshop",
  eventDate: "",
  eventTime: "",
  heroHeadline: "Virtual Workshop",
  heroDescription: "Join us for a transformative session where you'll gain access to world-class tools and strategies.",
  formTitle: "Register for the Workshop",
  emailPlaceholder: "Email",
  namePlaceholder: "First and last name",
  companyPlaceholder: "Company",
  optInText: "Keep this box checked to receive future details for this event",
  submitButtonText: "Register Here",
  privacyText: "By registering, you agree to our privacy policy.",
};

export default function RegistrationPageEditor() {
  const params = useParams();
  const workshopId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<RegistrationPageData>(DEFAULT_DATA);

  useEffect(() => {
    async function loadData() {
      try {
        const [workshopRes, pageRes, bioPageRes] = await Promise.all([
          fetch(`/api/workshops/${workshopId}`),
          fetch(`/api/workshops/${workshopId}/landing-pages/REGISTRATION`),
          fetch(`/api/workshops/${workshopId}/landing-pages/BIO_PAGE`),
        ]);

        const workshopData = await workshopRes.json();
        const bioPageData = await bioPageRes.json();
        const bioPageContent = bioPageData.success && bioPageData.data
          ? JSON.parse(bioPageData.data.content)
          : null;

        const bioProfileImage =
          typeof bioPageContent?.profileImageUrl === "string"
            ? bioPageContent.profileImageUrl
            : "";

        if (workshopData.success) {
          const w = workshopData.data;
          const eventDate = new Date(w.eventDate);
          
          setFormData((prev) => ({
            ...prev,
            coachName: `${w.coach.firstName} ${w.coach.lastName}`,
            coachPhoto: bioProfileImage || w.coach.profileImage || "",
            workshopTitle: w.title,
            eventDate: eventDate.toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC"
            }),
            eventTime: w.eventTime || "",
          }));
        }

        const pageData = await pageRes.json();
        if (pageData.success && pageData.data) {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSuccess(false);
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(
        `/api/workshops/${workshopId}/landing-pages/REGISTRATION`,
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
      if (!response.ok || !data.success) {
        console.error("[landing-page save] error details:", data.details);
        throw new Error(`[${response.status}] ${data.error || "Failed to save"}`);
      }
      
      setSuccess(true);
      if (publish) window.open(`/workshop/${data.data.slug}`, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="text-muted-foreground">Loading...</div></div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/workshops" className="hover:text-foreground">Workshops</Link>
          <span>/</span>
          <Link href={`/workshops/${workshopId}/landing-pages`} className="hover:text-foreground">Workshop Editor</Link>
          <span>/</span>
          <span className="text-foreground">Registration Page</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Registration Page Editor</h1>
        <p className="text-muted-foreground">Sub-page shown when visitors click &ldquo;Register Here&rdquo;</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg mb-6">{error}</div>}
      {success && <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-lg mb-6">Changes saved!</div>}

      <div className="grid grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-6">
          <div className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            Coach information and workshop details are auto-mapped from the workshop and coach BIO profile.
          </div>

          <Card>
            <CardHeader><CardTitle>Hero Section</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="heroHeadline">Headline</Label>
                <Input id="heroHeadline" name="heroHeadline" value={formData.heroHeadline} onChange={handleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="heroDescription">Description</Label>
                <textarea id="heroDescription" name="heroDescription" value={formData.heroDescription} onChange={handleChange} rows={3} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Form Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="formTitle">Form Title</Label>
                <Input id="formTitle" name="formTitle" value={formData.formTitle} onChange={handleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="emailPlaceholder">Email Placeholder</Label>
                <Input id="emailPlaceholder" name="emailPlaceholder" value={formData.emailPlaceholder} onChange={handleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="namePlaceholder">Name Placeholder</Label>
                <Input id="namePlaceholder" name="namePlaceholder" value={formData.namePlaceholder} onChange={handleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="companyPlaceholder">Company Placeholder</Label>
                <Input id="companyPlaceholder" name="companyPlaceholder" value={formData.companyPlaceholder} onChange={handleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="optInText">Opt-in Checkbox Text</Label>
                <Input id="optInText" name="optInText" value={formData.optInText} onChange={handleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="submitButtonText">Submit Button Text</Label>
                <Input id="submitButtonText" name="submitButtonText" value={formData.submitButtonText} onChange={handleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="privacyText">Privacy Text</Label>
                <Input id="privacyText" name="privacyText" value={formData.privacyText} onChange={handleChange} className="mt-1" />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={() => handleSave(false)} variant="outline" disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Draft"}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving} className="flex-1">
              {saving ? "Publishing..." : "Save & Publish"}
            </Button>
          </div>
          <div className="mt-2 text-center">
            <Link href={`/workshops/${workshopId}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to Workshop
            </Link>
          </div>
        </div>

        {/* Preview */}
        <div className="sticky top-4">
          <Card className="overflow-hidden">
            <CardHeader className="bg-muted border-b py-2">
              <CardTitle className="text-sm font-medium">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <RegistrationPageTemplate
                content={formData}
                workshop={SAMPLE_WORKSHOP_REGISTRATION}
                isPreview={true}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
