"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SoloLandingData {
  coachPhoto: string;
  coachName: string;
  coachTitle: string;
  eventDay: string;
  eventDate: string;
  eventTime: string;
  eventTimezone: string;
  heroTitle: string;
  heroSubtitle: string;
  bodyContent: string;
  aboutTitle: string;
  aboutDescription: string;
  partnerId: string;
  partnerName: string;
  partnerTagline: string;
  partnerLogoUrl: string;
  benefits: string[];
  videoUrl: string;
  ctaText: string;
  registrationUrl: string;
}

interface Workshop {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string | null;
  timezone: string;
  coach: {
    firstName: string;
    lastName: string;
    bio: string | null;
    profileImage: string | null;
  };
}

interface PartnerProfile {
  id: string;
  name: string;
  tagline: string;
  logoUrl: string;
  isActive: boolean;
}

interface PartnerToggle {
  partnerId: string;
  workshopId: string;
  enabled: boolean;
}

interface PartnersResponse {
  success: boolean;
  data?: {
    partners: PartnerProfile[];
    toggles: PartnerToggle[];
  };
}

const DEFAULT_BENEFITS = [
  "Identify the 9 value drivers of enterprise value",
  "Strategize the next 90 days for your business goals",
  "Strengthen and scale your business today",
  "Your Dream Team - Who's on YOUR team to secure a successful exit",
];

export default function SoloLandingEditor() {
  const params = useParams();
  const workshopId = params.id as string;

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [availablePartners, setAvailablePartners] = useState<PartnerProfile[]>([]);

  const [formData, setFormData] = useState<SoloLandingData>({
    coachPhoto: "",
    coachName: "",
    coachTitle: "Scaling Up Certified Coach",
    eventDay: "",
    eventDate: "",
    eventTime: "",
    eventTimezone: "EST",
    heroTitle: "Scaling Up to Finish Strong Virtual Workshop",
    heroSubtitle: "Build Value. Scale Up. Finish Strong.",
    bodyContent: "",
    aboutTitle: "Join us for the Scaling Up to Finish Strong Virtual Workshop",
    aboutDescription: "This free virtual, coach-led strategic workshop is designed for business owners who want to maximize the value of their company over the next 3-5 years.",
    partnerId: "",
    partnerName: "",
    partnerTagline: "",
    partnerLogoUrl: "",
    benefits: DEFAULT_BENEFITS,
    videoUrl: "",
    ctaText: "Register Here",
    registrationUrl: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [workshopRes, pageRes, partnersRes] = await Promise.all([
          fetch(`/api/workshops/${workshopId}`),
          fetch(`/api/workshops/${workshopId}/landing-pages/SOLO_LANDING`),
          fetch("/api/partners"),
        ]);

        const workshopData = await workshopRes.json();
        if (workshopData.success) {
          setWorkshop(workshopData.data);
          const w = workshopData.data;
          const eventDate = new Date(w.eventDate);
          
          setFormData((prev) => ({
            ...prev,
            coachName: `${w.coach.firstName} ${w.coach.lastName}`,
            coachPhoto: w.coach.profileImage || "",
            eventDay: eventDate.toLocaleDateString("en-US", { weekday: "long" }),
            eventDate: eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
            eventTime: w.eventTime || "12:00 PM - 1:00 PM",
            eventTimezone: w.timezone?.split("/")[1] || "EST",
            registrationUrl: `/workshop/${workshopId}/register`,
          }));
        }

        const pageData = await pageRes.json();
        if (pageData.success && pageData.data) {
          const content = JSON.parse(pageData.data.content);
          setFormData((prev) => ({ ...prev, ...content }));
        }

        const partnersData = (await partnersRes.json()) as PartnersResponse;
        if (partnersRes.ok && partnersData.success && partnersData.data) {
          const activePartners = partnersData.data.partners.filter((partner) => partner.isActive);
          const toggledPartnerIds = new Set(
            partnersData.data.toggles
              .filter((toggle) => toggle.workshopId === workshopId && toggle.enabled)
              .map((toggle) => toggle.partnerId)
          );

          const filteredPartners =
            toggledPartnerIds.size > 0
              ? activePartners.filter((partner) => toggledPartnerIds.has(partner.id))
              : activePartners;

          setAvailablePartners(filteredPartners);

          setFormData((prev) => {
            if (prev.partnerId) {
              const selectedPartner = filteredPartners.find((partner) => partner.id === prev.partnerId);
              if (selectedPartner) {
                return {
                  ...prev,
                  partnerName: selectedPartner.name,
                  partnerTagline: selectedPartner.tagline || "",
                  partnerLogoUrl: selectedPartner.logoUrl || "",
                };
              }
            }

            const firstPartner = filteredPartners[0];
            if (!firstPartner) {
              return prev;
            }

            return {
              ...prev,
              partnerId: firstPartner.id,
              partnerName: firstPartner.name,
              partnerTagline: firstPartner.tagline || "",
              partnerLogoUrl: firstPartner.logoUrl || "",
            };
          });
        } else {
          setAvailablePartners([]);
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
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSuccess(false);
  };

  const handlePartnerSelect = (partnerId: string) => {
    const selectedPartner = availablePartners.find((partner) => partner.id === partnerId);

    setFormData((prev) => ({
      ...prev,
      partnerId,
      partnerName: selectedPartner?.name || "",
      partnerTagline: selectedPartner?.tagline || "",
      partnerLogoUrl: selectedPartner?.logoUrl || "",
    }));
    setSuccess(false);
  };

  const handleBenefitChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      benefits: prev.benefits.map((b, i) => (i === index ? value : b)),
    }));
  };

  const addBenefit = () => {
    setFormData((prev) => ({
      ...prev,
      benefits: [...prev.benefits, ""],
    }));
  };

  const removeBenefit = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      benefits: prev.benefits.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(
        `/api/workshops/${workshopId}/landing-pages/SOLO_LANDING`,
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
        window.open(`/workshop/${data.data.slug}`, "_blank");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/workshops" className="hover:text-foreground">Workshops</Link>
          <span>/</span>
          <Link href={`/workshops/${workshopId}/landing-pages`} className="hover:text-foreground">Workshop Editor</Link>
          <span>/</span>
          <span className="text-foreground">Solo Landing Page</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Solo Landing Page</h1>
        <p className="text-muted-foreground">Exit & Valuation Workshop template with single coach</p>
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

      <div className="grid grid-cols-5 gap-6">
        {/* Editor Panel - 2 columns */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hero Section</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="heroTitle">Title</Label>
                <Input
                  id="heroTitle"
                  name="heroTitle"
                  value={formData.heroTitle}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="heroSubtitle">Subtitle</Label>
                <Input
                  id="heroSubtitle"
                  name="heroSubtitle"
                  value={formData.heroSubtitle}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="aboutTitle">About Section Title</Label>
                <Input
                  id="aboutTitle"
                  name="aboutTitle"
                  value={formData.aboutTitle}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="aboutDescription">About Description</Label>
                <textarea
                  id="aboutDescription"
                  name="aboutDescription"
                  value={formData.aboutDescription}
                  onChange={handleChange}
                  rows={4}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <Label htmlFor="partnerId">Partner (Optional)</Label>
                <select
                  id="partnerId"
                  value={formData.partnerId}
                  onChange={(e) => handlePartnerSelect(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2"
                >
                  <option value="">No partner</option>
                  {availablePartners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pulls partner logo and tagline from the Partners module.
                </p>
              </div>
              {formData.partnerId ? (
                <div className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
                  <p><span className="font-medium">Tagline:</span> {formData.partnerTagline || "No tagline"}</p>
                  <p className="truncate"><span className="font-medium">Logo URL:</span> {formData.partnerLogoUrl || "No logo URL"}</p>
                </div>
              ) : null}
              <div>
                <Label>Benefits (What You&rsquo;ll Learn)</Label>
                <div className="space-y-2 mt-2">
                  {formData.benefits.map((benefit, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={benefit}
                        onChange={(e) => handleBenefitChange(index, e.target.value)}
                        placeholder="Benefit point..."
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeBenefit(index)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addBenefit}>
                    + Add Benefit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Video & Registration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="videoUrl">Video Embed URL</Label>
                <Input
                  id="videoUrl"
                  name="videoUrl"
                  value={formData.videoUrl}
                  onChange={handleChange}
                  placeholder="https://player.vimeo.com/video/..."
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Vimeo or YouTube embed URL
                </p>
              </div>
              <div>
                <Label htmlFor="ctaText">CTA Button Text</Label>
                <Input
                  id="ctaText"
                  name="ctaText"
                  value={formData.ctaText}
                  onChange={handleChange}
                  className="mt-1"
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

        {/* Preview Panel - 3 columns */}
        <div className="col-span-3 sticky top-4">
          <Card className="overflow-hidden">
            <CardHeader className="bg-muted border-b">
              <CardTitle className="text-sm font-medium">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                {/* Hero */}
                <div className="bg-gradient-to-br from-purple-700 to-purple-900 text-white p-8">
                  <div className="grid grid-cols-2 gap-6 items-center">
                    <div>
                      <span className="bg-orange-500 text-xs px-3 py-1 rounded-full uppercase font-semibold">
                        Scaling Up
                      </span>
                      <h1 className="text-2xl font-bold mt-3 mb-2">
                        {formData.heroTitle}
                      </h1>
                      <p className="text-purple-200 mb-4">{formData.heroSubtitle}</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span>📅</span>
                          <span>{formData.eventDay}, {formData.eventDate}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>⏰</span>
                          <span>{formData.eventTime} {formData.eventTimezone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>📍</span>
                          <span>Virtual Workshop</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-center">
                      {formData.coachPhoto ? (
                        <img
                          src={formData.coachPhoto}
                          alt={formData.coachName}
                          className="w-28 h-28 rounded-full object-cover mx-auto mb-3 border-4 border-white"
                        />
                      ) : (
                        <div className="w-28 h-28 rounded-full bg-purple-600 mx-auto mb-3 flex items-center justify-center text-purple-300">
                          No Photo
                        </div>
                      )}
                      <div className="font-bold">{formData.coachName}</div>
                      <div className="text-purple-200 text-sm">{formData.coachTitle}</div>
                      {formData.partnerId && (formData.partnerName || formData.partnerLogoUrl || formData.partnerTagline) ? (
                        <div className="mt-4 border-t border-white/20 pt-4">
                          <div className="text-[10px] uppercase tracking-wide text-purple-200 mb-2">
                            In Partnership With
                          </div>
                          {formData.partnerLogoUrl ? (
                            <img
                              src={formData.partnerLogoUrl}
                              alt={formData.partnerName || "Partner"}
                              className="mx-auto h-10 w-auto object-contain rounded bg-card p-1"
                            />
                          ) : null}
                          {formData.partnerName ? (
                            <div className="mt-2 text-sm font-semibold text-white">{formData.partnerName}</div>
                          ) : null}
                          {formData.partnerTagline ? (
                            <div className="text-xs text-purple-200">{formData.partnerTagline}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 grid grid-cols-3 gap-6">
                  <div className="col-span-2">
                    <h2 className="text-xl font-bold mb-4">
                      {formData.aboutTitle || `Join us for the ${formData.heroTitle}`}
                    </h2>
                    <p className="text-muted-foreground mb-6">{formData.aboutDescription}</p>

                    {formData.videoUrl && (
                      <div className="bg-gray-200 aspect-video rounded-lg mb-6 flex items-center justify-center">
                        <span className="text-muted-foreground">Video: {formData.videoUrl}</span>
                      </div>
                    )}

                    <h3 className="font-bold text-purple-700 mb-3">What You&rsquo;ll Learn</h3>
                    <ul className="space-y-2 text-sm text-foreground">
                      {formData.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-blue-500">✓</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Registration Card */}
                  <div className="bg-card border rounded-lg p-4 shadow-sm">
                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-3 -m-4 mb-4 rounded-t-lg">
                      <div className="text-xs uppercase font-semibold">Register Now</div>
                    </div>
                    <div className="text-sm font-bold mb-1">{formData.eventDate}</div>
                    <div className="text-xs text-muted-foreground mb-3">with {formData.coachName}</div>
                    <div className="text-lg font-bold text-purple-700 mb-3">Free</div>
                    <button className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-semibold">
                      {formData.ctaText}
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
