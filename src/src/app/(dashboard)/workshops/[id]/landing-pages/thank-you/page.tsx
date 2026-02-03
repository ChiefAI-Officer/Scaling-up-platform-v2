"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ThankYouPageData {
  workshopTitle: string;
  headline: string;
  subheadline: string;
  videoUrl: string;
  additionalMessage: string;
  showSocialLinks: boolean;
  calendarReminderText: string;
}

const DEFAULT_DATA: ThankYouPageData = {
  workshopTitle: "",
  headline: "Thank you for Registering for the",
  subheadline: "You'll receive an email shortly with instructions and details for the workshop.",
  videoUrl: "",
  additionalMessage: "",
  showSocialLinks: true,
  calendarReminderText: "Add this event to your calendar so you don't miss it!",
};

export default function ThankYouPageEditor() {
  const params = useParams();
  const workshopId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<ThankYouPageData>(DEFAULT_DATA);

  useEffect(() => {
    async function loadData() {
      try {
        const [workshopRes, pageRes] = await Promise.all([
          fetch(`/api/workshops/${workshopId}`),
          fetch(`/api/workshops/${workshopId}/landing-pages/THANK_YOU`),
        ]);

        const workshopData = await workshopRes.json();
        if (workshopData.success) {
          setFormData((prev) => ({
            ...prev,
            workshopTitle: workshopData.data.title,
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
    const { name, value, type } = e.target;
    const newValue = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: newValue }));
    setSuccess(false);
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(
        `/api/workshops/${workshopId}/landing-pages/THANK_YOU`,
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
      if (!data.success) throw new Error(data.error || "Failed to save");
      
      setSuccess(true);
      if (publish) window.open(`/workshop/${data.data.slug}`, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="text-gray-500">Loading...</div></div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <a href="/workshops" className="hover:text-gray-700">Workshops</a>
          <span>/</span>
          <a href={`/workshops/${workshopId}/landing-pages`} className="hover:text-gray-700">Landing Pages</a>
          <span>/</span>
          <span className="text-gray-900">Thank You Page</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Thank You Page Editor</h1>
        <p className="text-gray-600">Page shown after successful registration</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">Changes saved!</div>}

      <div className="grid grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Content</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="workshopTitle">Workshop Title</Label>
                <Input id="workshopTitle" name="workshopTitle" value={formData.workshopTitle} onChange={handleChange} className="mt-1" />
                <p className="text-xs text-gray-500 mt-1">This appears after the headline</p>
              </div>
              <div>
                <Label htmlFor="headline">Headline</Label>
                <Input id="headline" name="headline" value={formData.headline} onChange={handleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="subheadline">Sub-headline</Label>
                <textarea id="subheadline" name="subheadline" value={formData.subheadline} onChange={handleChange} rows={2} className="mt-1 w-full border rounded-md px-3 py-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Video</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="videoUrl">Video Embed URL</Label>
                <Input id="videoUrl" name="videoUrl" value={formData.videoUrl} onChange={handleChange} placeholder="https://player.vimeo.com/video/..." className="mt-1" />
                <p className="text-xs text-gray-500 mt-1">Vimeo or YouTube embed URL. Leave empty to hide video.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Additional Options</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="additionalMessage">Additional Message</Label>
                <textarea id="additionalMessage" name="additionalMessage" value={formData.additionalMessage} onChange={handleChange} rows={3} className="mt-1 w-full border rounded-md px-3 py-2" placeholder="Any additional instructions or message..." />
              </div>
              <div>
                <Label htmlFor="calendarReminderText">Calendar Reminder Text</Label>
                <Input id="calendarReminderText" name="calendarReminderText" value={formData.calendarReminderText} onChange={handleChange} className="mt-1" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="showSocialLinks" name="showSocialLinks" checked={formData.showSocialLinks} onChange={handleChange} className="rounded" />
                <Label htmlFor="showSocialLinks">Show social sharing links</Label>
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
        </div>

        {/* Preview */}
        <div className="sticky top-4">
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 border-b py-2">
              <CardTitle className="text-sm font-medium">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div 
                className="min-h-[500px] relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #6B21A8 0%, #7C3AED 50%, #6B21A8 100%)",
                }}
              >
                {/* Decorative patterns */}
                <div className="absolute left-4 top-1/4 opacity-20">
                  <svg width="60" height="200" viewBox="0 0 60 200" className="text-white">
                    <path d="M30 0 L30 40 M30 60 L30 100 M30 120 L30 160 M30 180 L30 200" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" fill="none" />
                    <circle cx="30" cy="50" r="5" fill="currentColor" />
                    <circle cx="30" cy="110" r="5" fill="currentColor" />
                    <circle cx="30" cy="170" r="5" fill="currentColor" />
                  </svg>
                </div>
                <div className="absolute right-4 top-1/4 opacity-20">
                  <svg width="60" height="200" viewBox="0 0 60 200" className="text-white">
                    <path d="M30 0 L30 40 M30 60 L30 100 M30 120 L30 160 M30 180 L30 200" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" fill="none" />
                    <circle cx="30" cy="50" r="5" fill="currentColor" />
                    <circle cx="30" cy="110" r="5" fill="currentColor" />
                    <circle cx="30" cy="170" r="5" fill="currentColor" />
                  </svg>
                </div>

                <div className="relative z-10 text-white text-center p-8">
                  {/* Logo */}
                  <div className="font-bold text-lg tracking-wider mb-8">
                    SCALING UP
                  </div>

                  {/* Headline */}
                  <h1 className="text-2xl font-serif mb-2">
                    {formData.headline}
                  </h1>
                  <h2 className="text-xl font-serif font-bold mb-4">
                    {formData.workshopTitle} Workshop
                  </h2>

                  {/* Sub-headline */}
                  <p className="text-purple-200 italic mb-8 max-w-md mx-auto text-sm">
                    {formData.subheadline}
                  </p>

                  {/* Video */}
                  {formData.videoUrl ? (
                    <div className="max-w-sm mx-auto mb-6">
                      <div className="border-4 border-white rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-2">
                            <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                          <span className="text-white text-xs">Video Preview</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-sm mx-auto mb-6 border-2 border-dashed border-purple-300 rounded-lg p-8 text-purple-200 text-sm">
                      No video configured
                    </div>
                  )}

                  {/* Additional Message */}
                  {formData.additionalMessage && (
                    <p className="text-purple-200 text-sm mb-6 max-w-md mx-auto">
                      {formData.additionalMessage}
                    </p>
                  )}

                  {/* Calendar Reminder */}
                  <p className="text-purple-200 text-xs mb-4">
                    {formData.calendarReminderText}
                  </p>

                  {/* Calendar buttons placeholder */}
                  <div className="flex gap-2 justify-center">
                    <button className="bg-white/20 text-white text-xs px-3 py-1.5 rounded hover:bg-white/30">
                      Google Calendar
                    </button>
                    <button className="bg-white/20 text-white text-xs px-3 py-1.5 rounded hover:bg-white/30">
                      Outlook
                    </button>
                  </div>

                  {/* Social Links */}
                  {formData.showSocialLinks && (
                    <div className="mt-6 flex gap-3 justify-center">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="text-xs">f</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="text-xs">in</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="text-xs">X</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
