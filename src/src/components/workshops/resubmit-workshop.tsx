"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { formatInZone, LEGACY_RESUBMIT_ZONE_OPTIONS } from "@/lib/time";
import { resolveEventStartMoment } from "@/lib/workflows/resolve-event-start-moment";

// CHG-01 (May 4 2026): the "denied" variant + /api/workshops/[id]/resubmit route
// were removed. Coaches re-submit a fresh workshop request via /portal/request,
// which keeps the original workshop's history intact for audit. Only the
// INFO_REQUESTED flow remains here — admin asks a question, coach edits inline
// and replies through /api/approvals/[id]/coach-response.

interface Category {
  id: string;
  name: string;
}

interface PricingTierOption {
  id: string;
  name: string;
  amountCents: number;
}

export interface ResubmitWorkshopProps {
  variant?: "info_requested";
  workshopId: string;
  approvalId: string;
  adminMessage: string | null;
  title: string;
  description: string | null;
  eventDate: string;
  eventTime: string | null;
  venueName: string | null;
  categoryId?: string | null;
  format?: string | null;
  timezone?: string | null;
  venueAddress?: string | null;
  virtualLink?: string | null;
  priceCents?: number | null;
  isFree?: boolean;
  pricingTierId?: string | null;
  registrationCount?: number;
  timezonePickerEnabled?: boolean;
}

export function ResubmitWorkshop(props: ResubmitWorkshopProps) {
  const {
    workshopId,
    approvalId,
    adminMessage,
    title: initialTitle,
    description: initialDescription,
    eventDate: initialEventDate,
    eventTime: initialEventTime,
    venueName: initialVenueName,
    categoryId: initialCategoryId,
    format: initialFormat,
    timezone: initialTimezone,
    venueAddress: initialVenueAddress,
    virtualLink: initialVirtualLink,
    priceCents: initialPriceCents = null,
    isFree: initialIsFree = false,
    pricingTierId: initialPricingTierId = null,
    registrationCount = 0,
    timezonePickerEnabled = false,
  } = props;

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pricingTiers, setPricingTiers] = useState<PricingTierOption[]>([]);

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription || "");
  const [categoryId, setCategoryId] = useState(initialCategoryId || "");
  const [format, setFormat] = useState(initialFormat || "VIRTUAL");
  const [eventDate, setEventDate] = useState(initialEventDate.split("T")[0]);
  const [eventTime, setEventTime] = useState(initialEventTime || "");
  const [timezone, setTimezone] = useState(initialTimezone || "America/New_York");
  const [venueName, setVenueName] = useState(initialVenueName || "");
  const [venueAddress, setVenueAddress] = useState(initialVenueAddress || "");
  const [virtualLink, setVirtualLink] = useState(initialVirtualLink || "");
  const workshopStartPreview = (() => {
    if (!/^\d{1,2}:\d{2}/.test(eventTime)) return { instant: null, error: null };
    try {
      return {
        instant: resolveEventStartMoment({
          eventDate: new Date(`${eventDate}T00:00:00.000Z`),
          eventTime,
          timezone,
          strict: timezonePickerEnabled,
        }),
        error: null,
      };
    } catch {
      return { instant: null, error: "That local time does not exist in this timezone because the clock moves forward." };
    }
  })();
  const resolvedWorkshopStart = workshopStartPreview.instant;

  const [pricingTierId, setPricingTierId] = useState(initialPricingTierId || "");
  const [customPricingNotes, setCustomPricingNotes] = useState("");

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setCategories(d as Category[]);
        }
      })
      .catch(() => {/* non-critical, silently ignore */});

    fetch("/api/pricing-tiers")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setPricingTiers(d as PricingTierOption[]);
        }
      })
      .catch(() => {/* non-critical, silently ignore */});
  }, []);

  async function handleSaveAndResubmit() {
    setSubmitting(true);
    setFeedback(null);

    try {
      if (timezonePickerEnabled && workshopStartPreview.error) {
        throw new Error(workshopStartPreview.error);
      }
      const hasPricingChange = Boolean(
        pricingTierId && pricingTierId !== (initialPricingTierId || "")
      );

      // FIG-007: pricing change → server intercepts and creates CUSTOM_PRICING approval
      if (hasPricingChange) {
        const pricingPayload: Record<string, unknown> = {};
        if (pricingTierId) pricingPayload.pricingTierId = pricingTierId;
        if (customPricingNotes.trim()) pricingPayload.customPricingNotes = customPricingNotes.trim();

        const priceRes = await fetch(`/api/workshops/${workshopId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pricingPayload),
        });

        const priceData = (await priceRes.json()) as {
          success?: boolean;
          pendingApproval?: boolean;
          error?: string;
        };

        if (priceRes.status !== 202 && !priceRes.ok) {
          throw new Error(priceData.error || "Failed to submit price change");
        }
      }

      const updateRes = await fetch(`/api/workshops/${workshopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          categoryId: categoryId || null,
          format,
          eventDate: new Date(eventDate).toISOString(),
          eventTime: eventTime || null,
          timezone: timezone || null,
          venueName: venueName || null,
          venueAddress: venueAddress || null,
          virtualLink: virtualLink || null,
        }),
      });

      if (!updateRes.ok) {
        const data = (await updateRes.json()) as { error?: string };
        throw new Error(data.error || "Failed to update workshop");
      }

      const res = await fetch(`/api/approvals/${approvalId}/coach-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "INFO_RESPONSE",
          response: "Workshop details updated — please review the changes.",
        }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit response");
      }

      setFeedback({
        type: "success",
        message: hasPricingChange
          ? "Workshop updated and resubmitted for review. Your price change request is pending admin approval."
          : "Workshop updated and resubmitted for review. You'll be notified of the decision.",
      });

      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to resubmit",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Info Requested</Badge>
        <h2 className="text-sm font-semibold text-warning">Workshop Information Requested</h2>
      </div>

      {adminMessage && (
        <div className="text-sm text-foreground bg-warning/10 rounded-lg p-3 border border-warning/30">
          <span className="font-medium">Admin&apos;s question: </span>
          {adminMessage}
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-success/20 bg-success/10 text-success"
              : "border-destructive/20 bg-white text-destructive"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="space-y-3 bg-card rounded-lg p-4 border border-warning/30">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">— Select category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="IN_PERSON">In Person</option>
              <option value="VIRTUAL">Virtual</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Event Date</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Event Time</label>
            <input
              type="text"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              placeholder="e.g. 9:00 AM"
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Timezone</label>
          {timezonePickerEnabled ? (
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
              at={resolvedWorkshopStart ?? new Date()}
            />
          ) : (
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            >
              {LEGACY_RESUBMIT_ZONE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
          {timezonePickerEnabled && resolvedWorkshopStart && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatInZone(resolvedWorkshopStart, timezone)}
            </p>
          )}
          {timezonePickerEnabled && workshopStartPreview.error && (
            <p role="alert" className="mt-1 text-xs text-destructive">{workshopStartPreview.error}</p>
          )}
          {timezonePickerEnabled && registrationCount > 0 && timezone !== (initialTimezone || "America/New_York") && (
            <p role="alert" className="mt-2 text-xs text-warning">
              {registrationCount} registered attendee{registrationCount === 1 ? "" : "s"} will see the updated time zone. Existing emails are not resent automatically.
            </p>
          )}
        </div>

        {format !== "VIRTUAL" && (
          <>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Venue Name</label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Venue Address</label>
              <input
                type="text"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </>
        )}

        {(format === "VIRTUAL" || format === "HYBRID") && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Meeting / Virtual Link</label>
            <input
              type="url"
              value={virtualLink}
              onChange={(e) => setVirtualLink(e.target.value)}
              placeholder="https://zoom.us/j/..."
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        )}

        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-warning mb-1">
              Request Price Change (Optional)
            </p>
            <p className="text-xs text-muted-foreground">
              Current price:{" "}
              <strong>
                {initialIsFree
                  ? "Free"
                  : initialPriceCents != null && initialPriceCents > 0
                  ? `$${(initialPriceCents / 100).toFixed(2)}`
                  : "Not set"}
              </strong>
              {" "}— selecting a new tier will submit a price change request for admin approval.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Proposed Pricing Tier</label>
            <select
              value={pricingTierId}
              onChange={(e) => setPricingTierId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">— Keep current pricing —</option>
              {pricingTiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} — ${(tier.amountCents / 100).toFixed(0)}
                </option>
              ))}
            </select>
          </div>
          {pricingTierId && pricingTierId !== (initialPricingTierId || "") && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Reason for price change (optional)</label>
              <textarea
                value={customPricingNotes}
                onChange={(e) => setCustomPricingNotes(e.target.value)}
                rows={2}
                placeholder="Explain why you're requesting this price change..."
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSaveAndResubmit}
          disabled={submitting}
          size="sm"
        >
          {submitting ? "Submitting..." : "Submit Updated Workshop"}
        </Button>
      </div>
    </div>
  );
}
