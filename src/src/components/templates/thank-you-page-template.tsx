"use client";

import "@/styles/su-public-brand.css";
import { stripPlaceholders } from "@/lib/templates/template-utils";
import { formatVenueAddress, formatTimeWithZone } from "@/lib/utils";
import { normalizeVideoUrl } from "@/lib/templates/landing-page-overlay";
import {
  buildGoogleCalendarUrl,
  parseDurationHoursFromEvent,
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

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export function ThankYouPageTemplate({
  content,
  workshop,
  isPreview = false,
}: ThankYouPageTemplateProps) {
  const headline = stripPlaceholders(content.headline);
  const subheadline = stripPlaceholders(content.subheadline);
  const videoUrl = normalizeVideoUrl(content.videoUrl);
  const additionalMessage = stripPlaceholders(content.additionalMessage);
  const calendarReminderText = stripPlaceholders(content.calendarReminderText);

  // CHG-03: hardcoded iDev pixel removed. <CustomCodeRenderer> at the page
  // handler renders it from LandingPage.customCode + the resolved Stripe amount.
  const eventDate = new Date(workshop.eventDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const isVirtual = workshop.format === "VIRTUAL";
  const formatLabel = isVirtual ? "Virtual Workshop" : "In-Person";
  const locationLabel = isVirtual
    ? workshop.virtualLink
      ? "Virtual — link will be emailed"
      : "Virtual Workshop"
    : [workshop.venueName, formatVenueAddress(workshop.venueAddress)].filter(Boolean).join(", ") || "Location TBA";
  // Avoid showing the same string twice (e.g. virtual-with-no-link).
  const showLocationLine = locationLabel !== formatLabel;
  const timeLabel = workshop.eventTime
    ? formatTimeWithZone(workshop.eventTime, workshop.eventDate, workshop.timezone)
    : "Time TBA";

  const calendarUrl = isPreview
    ? "#"
    : buildGoogleCalendarUrl({
        uid: workshop.id,
        title: workshop.title || "Scaling Up Workshop",
        description: workshop.description,
        eventDate: new Date(workshop.eventDate),
        eventTime: workshop.eventTime,
        timezone: workshop.timezone,
        durationHours: parseDurationHoursFromEvent(workshop.duration, workshop.eventTime),
        location: buildLocationString(workshop),
      });

  return (
    <div className="su-public-brand su-ty">
      {isPreview && (
        <div className="su-preview-banner">
          <span>Preview — sample data shown</span>
        </div>
      )}

      <div className="su-stripe-h" aria-hidden="true" />

      {/* Branded hero */}
      <section className="su-ty-hero">
        <span className="su-glow-tr" aria-hidden="true" />
        <span className="su-glow-bl" aria-hidden="true" />
        <div className="su-wrap">
          <div className="su-brandbar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="su-logo" src="/brand/su-logo-white.svg" alt="Scaling Up" width={180} height={24} />
          </div>
          <span className="su-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="#95c11f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h1 className="su-ty-h1">{headline || "You’re Registered!"}</h1>
          {subheadline && <p className="su-ty-sub">{subheadline}</p>}
        </div>
      </section>

      <div className="su-ty-body">
        {/* Details card (mirrors the landing logistics card) */}
        <aside className="su-logistics">
          <span className="su-format-pill">{isVirtual ? "Virtual" : "In Person"}</span>
          <h2 className="su-h2">The Details</h2>
          <div className="su-logistics-rule" />

          <div className="su-log-item">
            <span className="su-log-key">When</span>
            <span className="su-log-val">
              <b>{eventDate}</b>
              <br />
              <span>{timeLabel}</span>
            </span>
          </div>

          <div className="su-log-item">
            <span className="su-log-key">Where</span>
            <span className="su-log-val">
              <b>{formatLabel}</b>
              {showLocationLine && (
                <>
                  <br />
                  <span>{locationLabel}</span>
                </>
              )}
            </span>
          </div>

          {workshop.title && (
            <div className="su-log-item">
              <span className="su-log-key">Workshop</span>
              <span className="su-log-val">{workshop.title}</span>
            </div>
          )}
        </aside>

        {/* Video embed */}
        {videoUrl && (
          <div className="su-ty-video">
            <iframe
              src={videoUrl}
              title={`${workshop.title || "Workshop"} video`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        )}

        {/* Additional message */}
        {additionalMessage && <div className="su-ty-msg">{additionalMessage}</div>}

        {/* Calendar actions */}
        <p style={{ fontWeight: 600, color: "#1a1322", margin: "26px 0 0" }}>
          {calendarReminderText || "Add this event to your calendar"}
        </p>
        <div className="su-ty-actions">
          {isPreview ? (
            <button type="button" disabled className="su-cta" style={{ opacity: 0.6, cursor: "not-allowed" }}>
              <CalendarIcon /> Google Calendar
            </button>
          ) : (
            <a className="su-cta" href={calendarUrl} target="_blank" rel="noopener noreferrer">
              <CalendarIcon /> Google Calendar
            </a>
          )}

          {isPreview ? (
            <button type="button" disabled className="su-btn-outline" style={{ opacity: 0.6, cursor: "not-allowed" }}>
              <DownloadIcon /> Download .ics
            </button>
          ) : (
            <a className="su-btn-outline" href={`/api/workshops/${workshop.id}/ics`} download>
              <DownloadIcon /> Download .ics
            </a>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="su-foot su-ty-foot">
        <div className="su-wrap su-foot-row">
          <span className="su-foot-tag">Scaling Up · Growing Leaders — Growing Companies</span>
          <span className="su-foot-tag">{eventDate} · {formatLabel}</span>
        </div>
      </footer>
    </div>
  );
}
