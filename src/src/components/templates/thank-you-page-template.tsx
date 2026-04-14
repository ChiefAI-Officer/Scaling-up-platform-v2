"use client";

import { stripPlaceholders } from "@/lib/templates/template-utils";
import {
  buildGoogleCalendarUrl,
  parseDurationHours,
  buildLocationString,
} from "@/lib/ics-generator";

export interface ThankYouContent {
  headline?: string;
  subheadline?: string;
  videoUrl?: string;
  additionalMessage?: string;
  calendarReminderText?: string;
}

export interface ThankYouWorkshopData {
  id: string;
  title: string;
  description?: string | null;
  eventDate: Date | string;
  eventTime?: string | null;
  timezone: string;
  duration?: string | null;
  format: string;
  venueName?: string | null;
  venueAddress?: string | null;
  virtualLink?: string | null;
  isFree: boolean;
  priceCents?: number | null;
  earlyBirdPriceCents?: number | null;
}

interface ThankYouPageTemplateProps {
  content: ThankYouContent;
  workshop: ThankYouWorkshopData;
  isPreview?: boolean;
}


export const SAMPLE_WORKSHOP: ThankYouWorkshopData = {
  id: "preview",
  title: "Sample: Scaling Up Masterclass",
  eventDate: "2026-06-18",
  eventTime: "09:00 - 17:00",
  timezone: "America/New_York",
  format: "VIRTUAL",
  duration: "8",
  isFree: false,
  priceCents: 19900,
  description: "A transformative workshop experience.",
  virtualLink: undefined,
};

export function ThankYouPageTemplate({
  content,
  workshop,
  isPreview = false,
}: ThankYouPageTemplateProps) {
  const headline = stripPlaceholders(content.headline);
  const subheadline = stripPlaceholders(content.subheadline);
  const videoUrl = content.videoUrl || "";
  const additionalMessage = stripPlaceholders(content.additionalMessage);
  const calendarReminderText = stripPlaceholders(content.calendarReminderText);

  const effectivePriceCents = workshop.earlyBirdPriceCents ?? workshop.priceCents ?? 0;
  const shouldTrackAffiliateSale = !isPreview && !workshop.isFree && effectivePriceCents > 0;
  const affiliateSaleAmount = (effectivePriceCents / 100).toFixed(2);
  const affiliateOrderNumber = workshop.title || workshop.id;
  const affiliateTrackingUrl = `https://scalingup.idevaffiliate.com/sale.php?profile=72198&idev_saleamt=${encodeURIComponent(
    affiliateSaleAmount
  )}&idev_ordernum=${encodeURIComponent(affiliateOrderNumber)}`;

  const eventDate = new Date(workshop.eventDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const locationLabel =
    workshop.format === "VIRTUAL"
      ? workshop.virtualLink
        ? "Virtual — link will be emailed"
        : "Virtual Workshop"
      : [workshop.venueName, workshop.venueAddress].filter(Boolean).join(", ") || "Location TBA";

  const calendarUrl = isPreview
    ? "#"
    : buildGoogleCalendarUrl({
        uid: workshop.id,
        title: workshop.title || "Scaling Up Workshop",
        description: workshop.description,
        eventDate: new Date(workshop.eventDate),
        eventTime: workshop.eventTime,
        timezone: workshop.timezone,
        durationHours: parseDurationHours(workshop.duration),
        location: buildLocationString(workshop),
      });

  return (
    <div className="min-h-screen bg-muted">
      {/* Affiliate tracking pixel */}
      {shouldTrackAffiliateSale ? (
        <img
          src={affiliateTrackingUrl}
          style={{ height: 0, width: 0, border: 0, position: "absolute" }}
          alt=""
          aria-hidden="true"
        />
      ) : null}

      {/* Preview banner */}
      {isPreview && (
        <div className="bg-muted border-b px-4 py-1 text-center">
          <span className="text-xs text-muted-foreground">Preview — sample data shown</span>
        </div>
      )}

      {/* Top accent bar */}
      <div className="h-2 bg-primary" />

      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-20">
        {/* Success card */}
        <div className="bg-card rounded-2xl shadow-lg border border-border overflow-hidden">
          {/* Header */}
          <div className="px-6 py-10 sm:px-10 sm:py-14 text-center text-white bg-primary">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
              {headline || "You\u2019re Registered!"}
            </h1>
            {subheadline && (
              <p className="text-white/80 text-lg max-w-md mx-auto">{subheadline}</p>
            )}
          </div>

          {/* Workshop details */}
          <div className="px-6 py-8 sm:px-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Workshop Details
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-foreground">{eventDate}</p>
                  <p className="text-sm text-muted-foreground">
                    {workshop.eventTime || "Time TBA"} {workshop.timezone}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {workshop.format === "VIRTUAL" ? "Virtual Workshop" : "In-Person"}
                  </p>
                  <p className="text-sm text-muted-foreground">{locationLabel}</p>
                </div>
              </div>

              {workshop.title && (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{workshop.title}</p>
                    <p className="text-sm text-muted-foreground">Scaling Up Workshop</p>
                  </div>
                </div>
              )}
            </div>

            {/* Video embed */}
            {videoUrl && (
              <div className="mt-8 w-full max-w-2xl">
                <div className="rounded-xl overflow-hidden border border-border">
                  <iframe
                    src={videoUrl}
                    className="w-full aspect-video"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {/* Additional message */}
            {additionalMessage && (
              <div className="mt-6 rounded-lg bg-muted px-4 py-3">
                <p className="text-sm text-muted-foreground leading-relaxed">{additionalMessage}</p>
              </div>
            )}
          </div>

          {/* Calendar actions */}
          <div className="px-6 pb-8 sm:px-10">
            <div className="border-t border-border pt-6">
              <p className="text-sm font-medium text-foreground mb-3">
                {calendarReminderText || "Add this event to your calendar"}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {isPreview ? (
                  <button
                    type="button"
                    disabled
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium opacity-60 cursor-not-allowed"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm5.568 8.16c-.18-.672-.72-1.152-1.392-1.152h-.048c-.384 0-.72.12-1.008.36-.288.24-.432.552-.432.936v6.384c0 .384.144.696.432.936.288.24.624.36 1.008.36h.048c.672 0 1.212-.48 1.392-1.152.18.672.72 1.152 1.392 1.152h.048c.384 0 .72-.12 1.008-.36.288-.24.432-.552.432-.936V8.304c0-.384-.144-.696-.432-.936a1.441 1.441 0 0 0-1.008-.36h-.048c-.672 0-1.212.48-1.392 1.152zM6.816 8.16c-.18-.672-.72-1.152-1.392-1.152h-.048c-.384 0-.72.12-1.008.36-.288.24-.432.552-.432.936v6.384c0 .384.144.696.432.936.288.24.624.36 1.008.36h.048c.672 0 1.212-.48 1.392-1.152.18.672.72 1.152 1.392 1.152h.048c.384 0 .72-.12 1.008-.36.288-.24.432-.552.432-.936V8.304c0-.384-.144-.696-.432-.936a1.441 1.441 0 0 0-1.008-.36h-.048c-.672 0-1.212.48-1.392 1.152z" />
                    </svg>
                    Google Calendar
                  </button>
                ) : (
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm5.568 8.16c-.18-.672-.72-1.152-1.392-1.152h-.048c-.384 0-.72.12-1.008.36-.288.24-.432.552-.432.936v6.384c0 .384.144.696.432.936.288.24.624.36 1.008.36h.048c.672 0 1.212-.48 1.392-1.152.18.672.72 1.152 1.392 1.152h.048c.384 0 .72-.12 1.008-.36.288-.24.432-.552.432-.936V8.304c0-.384-.144-.696-.432-.936a1.441 1.441 0 0 0-1.008-.36h-.048c-.672 0-1.212.48-1.392 1.152zM6.816 8.16c-.18-.672-.72-1.152-1.392-1.152h-.048c-.384 0-.72.12-1.008.36-.288.24-.432.552-.432.936v6.384c0 .384.144.696.432.936.288.24.624.36 1.008.36h.048c.672 0 1.212-.48 1.392-1.152.18.672.72 1.152 1.392 1.152h.048c.384 0 .72-.12 1.008-.36.288-.24.432-.552.432-.936V8.304c0-.384-.144-.696-.432-.936a1.441 1.441 0 0 0-1.008-.36h-.048c-.672 0-1.212.48-1.392 1.152z" />
                    </svg>
                    Google Calendar
                  </a>
                )}

                {isPreview ? (
                  <button
                    type="button"
                    disabled
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card text-foreground px-4 py-2.5 text-sm font-medium opacity-60 cursor-not-allowed"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download .ics
                  </button>
                ) : (
                  <a
                    href={`/api/workshops/${workshop.id}/ics`}
                    download
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card text-foreground px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download .ics
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          A confirmation email has been sent to your inbox.
        </p>
      </div>
    </div>
  );
}
