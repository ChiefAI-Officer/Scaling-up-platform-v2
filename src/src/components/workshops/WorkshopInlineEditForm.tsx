"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
}

interface PricingTierDisplay {
  name: string;
  amountCents: number;
}

interface WorkshopInlineEditFormProps {
  workshopId: string;
  // Core fields
  title: string;
  description: string | null;
  categoryId: string | null;
  format: string;
  // Pricing — read-only in this sprint; editable in FIG-007
  pricingTier: PricingTierDisplay | null;
  // Logistics fields
  eventDate: string; // ISO string
  eventTime: string | null;
  timezone: string | null;
  virtualLink: string | null;
  venueName: string | null;
  venueAddress: string | null;
  // Data
  categories: Category[];
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
];

const FORMATS = [
  { value: "IN_PERSON", label: "In-Person" },
  { value: "VIRTUAL", label: "Virtual" },
  { value: "HYBRID", label: "Hybrid" },
];

export function WorkshopInlineEditForm({
  workshopId,
  title,
  description,
  categoryId,
  format,
  pricingTier,
  eventDate,
  eventTime,
  timezone,
  virtualLink,
  venueName,
  venueAddress,
  categories,
}: WorkshopInlineEditFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    title: title || "",
    description: description || "",
    categoryId: categoryId || "",
    format: format || "IN_PERSON",
    eventDate: eventDate.split("T")[0],
    eventTime: eventTime || "",
    timezone: timezone || "America/New_York",
    virtualLink: virtualLink || "",
    venueName: venueName || "",
    venueAddress: venueAddress || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/workshops/${workshopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title || undefined,
          description: form.description || undefined,
          categoryId: form.categoryId || undefined,
          format: form.format || undefined,
          eventDate: form.eventDate || undefined,
          eventTime: form.eventTime || undefined,
          timezone: form.timezone || undefined,
          virtualLink: form.virtualLink || undefined,
          venueName: form.venueName || undefined,
          venueAddress: form.venueAddress || undefined,
        }),
      });

      const data = await res.json() as { success: boolean; error?: string | { message: string }[] };

      if (!data.success) {
        const errMsg =
          typeof data.error === "string"
            ? data.error
            : Array.isArray(data.error)
              ? data.error[0]?.message
              : "Failed to update workshop";
        setError(errMsg || "Failed to update workshop");
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch {
      setError("Failed to update workshop. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="mt-2"
      >
        Edit Details
      </Button>
    );
  }

  return (
    <div className="mt-4 border border-border rounded-lg p-4 space-y-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Edit Workshop Details</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setSuccess(false); }}
          className="text-muted-foreground hover:text-foreground text-sm cursor-pointer"
        >
          Cancel
        </button>
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        Note: Email schedules are not automatically updated. Review workflow assignments if the date changed.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Section: Core Details */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Core Details</p>

          <div>
            <Label htmlFor="ie-title" className="text-xs">Title</Label>
            <Input
              id="ie-title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="mt-1 text-sm"
              required
              minLength={5}
            />
          </div>

          <div>
            <Label htmlFor="ie-description" className="text-xs">Description</Label>
            <textarea
              id="ie-description"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={4}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:ring-primary bg-background resize-y"
              placeholder="Describe the workshop..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ie-category" className="text-xs">Category</Label>
              <select
                id="ie-category"
                value={form.categoryId}
                onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:ring-primary bg-background"
              >
                <option value="">— No category —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="ie-format" className="text-xs">Format</Label>
              <select
                id="ie-format"
                value={form.format}
                onChange={(e) => setForm((p) => ({ ...p, format: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:ring-primary bg-background"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section: Pricing (read-only — editable in FIG-007) */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pricing</p>
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
            {pricingTier ? (
              <span className="text-foreground">
                {pricingTier.name} — {formatCurrency(pricingTier.amountCents)}
              </span>
            ) : (
              <span className="text-muted-foreground">No pricing tier assigned</span>
            )}
            <p className="text-xs text-muted-foreground mt-1">Pricing changes will be available in a future update.</p>
          </div>
        </div>

        {/* Section: Schedule & Location */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule &amp; Location</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ie-eventDate" className="text-xs">Event Date</Label>
              <Input
                id="ie-eventDate"
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm((p) => ({ ...p, eventDate: e.target.value }))}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="ie-eventTime" className="text-xs">Event Time</Label>
              <Input
                id="ie-eventTime"
                type="time"
                value={form.eventTime}
                onChange={(e) => setForm((p) => ({ ...p, eventTime: e.target.value }))}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="ie-timezone" className="text-xs">Timezone</Label>
              <select
                id="ie-timezone"
                value={form.timezone}
                onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:ring-primary bg-background"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ie-virtualLink" className="text-xs">Virtual Meeting Link</Label>
              <Input
                id="ie-virtualLink"
                type="url"
                value={form.virtualLink}
                onChange={(e) => setForm((p) => ({ ...p, virtualLink: e.target.value }))}
                placeholder="https://zoom.us/..."
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="ie-venueName" className="text-xs">Venue Name</Label>
              <Input
                id="ie-venueName"
                value={form.venueName}
                onChange={(e) => setForm((p) => ({ ...p, venueName: e.target.value }))}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="ie-venueAddress" className="text-xs">Venue Address</Label>
              <Input
                id="ie-venueAddress"
                value={form.venueAddress}
                onChange={(e) => setForm((p) => ({ ...p, venueAddress: e.target.value }))}
                placeholder="123 Main St, City, ST 12345"
                className="mt-1 text-sm"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {success && (
          <p className="text-sm text-success">Details updated successfully.</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setOpen(false); setError(null); setSuccess(false); }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
