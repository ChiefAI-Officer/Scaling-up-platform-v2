"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThankYouPageTemplate, SAMPLE_WORKSHOP } from "@/components/templates/thank-you-page-template";

interface ThankYouPageData {
  headline: string;
  subheadline: string;
  videoUrl: string;
  additionalMessage: string;
  calendarReminderText: string;
}

const DEFAULT_DATA: ThankYouPageData = {
  headline: "Thank you for Registering for the",
  subheadline: "You'll receive an email shortly with instructions and details for the workshop.",
  videoUrl: "",
  additionalMessage: "",
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
  // ENH-MAY6-5: per-workshop affiliate/tracking code (admin-only via route gate).
  const [customCode, setCustomCode] = useState<string>("");

  useEffect(() => {
    async function loadData() {
      try {
        const pageRes = await fetch(`/api/workshops/${workshopId}/landing-pages/THANK_YOU`);

        const pageData = await pageRes.json();
        if (pageData.success && pageData.data) {
          const content = JSON.parse(pageData.data.content);
          setFormData((prev) => ({ ...prev, ...content }));
          setCustomCode(pageData.data.customCode ?? "");
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
        `/api/workshops/${workshopId}/landing-pages/THANK_YOU`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: formData,
            status: publish ? "PUBLISHED" : "DRAFT",
            // ENH-MAY6-5: persist per-workshop affiliate code. Empty string
            // → null (clear). Server runs parse5 validation again.
            customCode: customCode.trim().length > 0 ? customCode : null,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.details) console.error("[landing-page save] error details:", data.details);
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
          <span className="text-foreground">Thank You Page</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Thank You Page Editor</h1>
        <p className="text-muted-foreground">Page shown after successful registration</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg mb-6">{error}</div>}
      {success && <div className="bg-success/10 border border-success/20 text-success px-4 py-3 rounded-lg mb-6">Changes saved!</div>}

      <div className="grid grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Content</CardTitle></CardHeader>
            <CardContent className="space-y-4">
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
                <p className="text-xs text-muted-foreground mt-1">Vimeo or YouTube embed URL. Leave empty to hide video.</p>
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
              <div className="rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
                iDevAffiliate tracking fires automatically on this Thank You page for paid workshops only
                using the hidden image tag format (sale amount + workshop title order number).
              </div>
            </CardContent>
          </Card>

          {/* ENH-MAY6-5: per-workshop affiliate / tracking code (admin-only via route gate) */}
          <Card>
            <CardHeader><CardTitle>Affiliate / Tracking Code</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="customCode">
                Per-workshop override
                <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="customCode"
                rows={6}
                value={customCode}
                onChange={(e) => { setCustomCode(e.target.value); setSuccess(false); }}
                placeholder={`<img src="https://scalingup.idevaffiliate.com/sale.php?profile=72198&idev_saleamt={{saleAmount}}&idev_ordernum={{orderNumber}}">`}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Renders on this workshop&apos;s THANK_YOU page after paid registration.
                Tokens: <code>{"{{saleAmount}}"}</code>, <code>{"{{orderNumber}}"}</code>,
                <code>{"{{email}}"}</code>, <code>{"{{currency}}"}</code>.{" "}
                <code>&lt;img&gt;</code> pixel only — <code>&lt;script&gt;</code> rejected. Empty clears.
              </p>
            </CardContent>
          </Card>

          <div className="flex gap-3 sticky bottom-0 bg-card py-3">
            <Button onClick={() => handleSave(false)} variant="outline" disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Draft"}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving} className="flex-1">
              {saving ? "Publishing..." : "Save & Publish"}
            </Button>
            <div className="text-center">
              <Link href={`/workshops/${workshopId}`} className="text-sm text-muted-foreground hover:text-foreground">
                ← Back to Workshop
              </Link>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="sticky top-4">
          <Card className="overflow-hidden">
            <CardHeader className="bg-muted border-b py-2">
              <CardTitle className="text-sm font-medium">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-hidden rounded-b-lg">
                <ThankYouPageTemplate
                  content={formData}
                  workshop={SAMPLE_WORKSHOP}
                  isPreview={true}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
