"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Shared types ────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
}

// ─── Denied variant props ─────────────────────────────────────────────────────

interface ResubmitWorkshopDeniedProps {
  variant?: "denied";
  workshopId: string;
  rejectionReason: string | null;
  title: string;
  description: string | null;
  eventDate: string;
  eventTime: string | null;
  venueName: string | null;
  // Extended fields (optional for backward compat)
  categoryId?: string | null;
  format?: string | null;
  timezone?: string | null;
  venueAddress?: string | null;
  virtualLink?: string | null;
  // Info-requested fields not used in denied variant
  approvalId?: never;
  adminMessage?: never;
  priceCents?: never;
  isFree?: never;
  pricingTierId?: never;
}

// ─── Info-requested variant props ─────────────────────────────────────────────

interface PricingTierOption {
  id: string;
  name: string;
  amountCents: number;
}

interface ResubmitWorkshopInfoRequestedProps {
  variant: "info_requested";
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
  // Pricing (editable — triggers CUSTOM_PRICING approval flow)
  priceCents?: number | null;
  isFree?: boolean;
  pricingTierId?: string | null;
  // Denial fields not used
  rejectionReason?: never;
}

type ResubmitWorkshopProps =
  | ResubmitWorkshopDeniedProps
  | ResubmitWorkshopInfoRequestedProps;

// ─── Component ─────────────────────────────────────────────────────────────────

export function ResubmitWorkshop(props: ResubmitWorkshopProps) {
  const {
    variant = "denied",
    workshopId,
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
  } = props;

  const isInfoRequested = variant === "info_requested";
  const approvalId = isInfoRequested ? props.approvalId : undefined;
  const adminMessage = isInfoRequested ? props.adminMessage : undefined;
  const rejectionReason = !isInfoRequested ? props.rejectionReason : undefined;
  const initialPriceCents = isInfoRequested ? (props.priceCents ?? null) : null;
  const initialIsFree = isInfoRequested ? (props.isFree ?? false) : false;
  const initialPricingTierId = isInfoRequested ? (props.pricingTierId ?? null) : null;

  // ── State ──
  const [isEditing, setIsEditing] = useState(isInfoRequested); // Auto-open for info_requested
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pricingTiers, setPricingTiers] = useState<PricingTierOption[]>([]);

  // Editable fields
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription || "");
  const [categoryId, setCategoryId] = useState(initialCategoryId || "");
  const [format, setFormat] = useState(initialFormat || "IN_PERSON");
  const [eventDate, setEventDate] = useState(initialEventDate.split("T")[0]);
  const [eventTime, setEventTime] = useState(initialEventTime || "");
  const [timezone, setTimezone] = useState(initialTimezone || "America/New_York");
  const [venueName, setVenueName] = useState(initialVenueName || "");
  const [venueAddress, setVenueAddress] = useState(initialVenueAddress || "");
  const [virtualLink, setVirtualLink] = useState(initialVirtualLink || "");

  // FIG-007: Pricing fields (info_requested only)
  const [pricingTierId, setPricingTierId] = useState(initialPricingTierId || "");
  const [customPricingNotes, setCustomPricingNotes] = useState("");

  // Fetch categories and pricing tiers for dropdowns
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data)) {
          setCategories(d.data as Category[]);
        }
      })
      .catch(() => {/* non-critical, silently ignore */});

    if (isInfoRequested) {
      fetch("/api/pricing-tiers")
        .then((r) => r.json())
        .then((d) => {
          if (d.success && Array.isArray(d.data)) {
            setPricingTiers(d.data as PricingTierOption[]);
          }
        })
        .catch(() => {/* non-critical, silently ignore */});
    }
  }, [isInfoRequested]);

  // ── Submit handler ──
  async function handleSaveAndResubmit() {
    setSubmitting(true);
    setFeedback(null);

    try {
      // Check whether the coach has changed pricing (only for info_requested)
      const hasPricingChange = isInfoRequested && (
        (pricingTierId && pricingTierId !== (initialPricingTierId || "")) ||
        false // priceCents changes only come through pricingTierId selection in this form
      );

      // FIG-007: If pricing changed, send a separate PATCH just for pricing
      // The server will intercept and return 202 + pendingApproval: true
      if (hasPricingChange) {
        const pricingPayload: Record<string, unknown> = {};
        if (pricingTierId) pricingPayload.pricingTierId = pricingTierId;
        if (customPricingNotes.trim()) pricingPayload.customPricingNotes = customPricingNotes.trim();

        const priceRes = await fetch(`/api/workshops/${workshopId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pricingPayload),
        });

        const priceData = await priceRes.json() as { success?: boolean; pendingApproval?: boolean; error?: string };

        if (priceRes.status === 202 && priceData.pendingApproval) {
          // Price change submitted — continue saving non-pricing fields below
          // but show the pending message after the full save
        } else if (!priceRes.ok) {
          throw new Error(priceData.error || "Failed to submit price change");
        }
      }

      // Always save non-pricing edits for info_requested; conditional for denied
      if (isInfoRequested || isEditing) {
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
          const data = await updateRes.json() as { error?: string };
          throw new Error(data.error || "Failed to update workshop");
        }
      }

      if (isInfoRequested && approvalId) {
        // For INFO_REQUESTED: call coach-response route to reset approval → PENDING
        const res = await fetch(`/api/approvals/${approvalId}/coach-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response: "Workshop details updated — please review the changes." }),
        });

        const data = await res.json() as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to submit response");
        }

        setFeedback({
          type: "success",
          message: hasPricingChange
            ? "Workshop updated and resubmitted for review. Your price change request is pending admin approval."
            : "Workshop updated and resubmitted for review. You'll be notified of the decision.",
        });
      } else {
        // Denied variant: call resubmit endpoint
        const res = await fetch(`/api/workshops/${workshopId}/resubmit`, {
          method: "POST",
        });

        const data = await res.json() as { success?: boolean; autoApproved?: boolean; error?: string };
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to resubmit");
        }

        setFeedback({
          type: "success",
          message: data.autoApproved
            ? "Workshop resubmitted and auto-approved! Refreshing..."
            : "Workshop resubmitted for review. You'll be notified of the decision.",
        });
      }

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

  // ── Styles: dynamic by variant ──
  const containerClass = isInfoRequested
    ? "rounded-xl border border-warning/40 bg-warning/5 p-5 space-y-4"
    : "rounded-xl border border-destructive/20 bg-destructive/10 p-5 space-y-4";

  const editPanelBorderClass = isInfoRequested
    ? "border-warning/30"
    : "border-destructive/20";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {isInfoRequested ? (
          <>
            <Badge variant="warning">Info Requested</Badge>
            <h2 className="text-sm font-semibold text-warning">Workshop Information Requested</h2>
          </>
        ) : (
          <>
            <Badge variant="destructive">Denied</Badge>
            <h2 className="text-sm font-semibold text-destructive">Workshop Requires Changes</h2>
          </>
        )}
      </div>

      {/* Admin question / rejection reason */}
      {isInfoRequested && adminMessage && (
        <div className="text-sm text-foreground bg-warning/10 rounded-lg p-3 border border-warning/30">
          <span className="font-medium">Admin&apos;s question: </span>
          {adminMessage}
        </div>
      )}
      {!isInfoRequested && rejectionReason && (
        <div className="text-sm text-destructive bg-white/60 rounded-lg p-3 border border-destructive/20">
          <span className="font-medium">Reason: </span>
          {rejectionReason}
        </div>
      )}

      {/* Feedback banner */}
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

      {/* Edit form */}
      {isEditing && (
        <div className={`space-y-3 bg-card rounded-lg p-4 border ${editPanelBorderClass}`}>
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          {/* Category + Format */}
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

          {/* Date + Time */}
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

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="America/New_York">Eastern (ET)</option>
              <option value="America/Chicago">Central (CT)</option>
              <option value="America/Denver">Mountain (MT)</option>
              <option value="America/Los_Angeles">Pacific (PT)</option>
              <option value="America/Anchorage">Alaska (AKT)</option>
              <option value="Pacific/Honolulu">Hawaii (HT)</option>
              <option value="Europe/London">London (GMT/BST)</option>
              <option value="Europe/Paris">Central Europe (CET)</option>
              <option value="Australia/Sydney">Sydney (AEDT)</option>
            </select>
          </div>

          {/* Venue fields (shown for non-virtual) */}
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

          {/* Virtual link (shown for virtual or hybrid) */}
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

          {/* FIG-007: Pricing (editable for info_requested — triggers CUSTOM_PRICING approval) */}
          {isInfoRequested && (
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
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        {!isInfoRequested && (
          <Button
            onClick={() => setIsEditing(!isEditing)}
            variant="outline"
            size="sm"
            disabled={submitting}
          >
            {isEditing ? "Cancel Edit" : "Edit Workshop"}
          </Button>
        )}
        <Button
          onClick={handleSaveAndResubmit}
          disabled={submitting}
          size="sm"
        >
          {submitting
            ? "Submitting..."
            : isInfoRequested
            ? "Submit Updated Workshop"
            : isEditing
            ? "Save & Resubmit"
            : "Resubmit for Approval"}
        </Button>
      </div>
    </div>
  );
}
