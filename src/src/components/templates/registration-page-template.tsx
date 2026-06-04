"use client";

import "@/styles/su-public-brand.css";
import { RegistrationForm } from "@/app/(public)/workshop/[slug]/registration-form";
import { stripPlaceholders } from "@/lib/templates/template-utils";
import { formatCurrency } from "@/lib/utils";

export interface RegistrationContent {
  coachPhoto?: string;
  coachName?: string;
  coachTitle?: string;
  eventDate?: string;
  eventTime?: string;
  heroHeadline?: string;
  heroDescription?: string;
  workshopTitle?: string;
  emailPlaceholder?: string;
  optInText?: string;
  namePlaceholder?: string;
  companyPlaceholder?: string;
  submitButtonText?: string;
  privacyText?: string;
  venueName?: string | null;
  venueAddress?: string | null;
  format?: string | null;
}

export interface RegistrationWorkshopData {
  id: string;
  title: string;
  isFree: boolean;
  priceCents?: number | null;
  format: string;
}

export const SAMPLE_WORKSHOP_REGISTRATION: RegistrationWorkshopData = {
  id: "preview",
  title: "Sample: Scaling Up Masterclass",
  isFree: false,
  priceCents: 19900,
  format: "VIRTUAL",
};

function formatLabel(format?: string | null): string {
  if (format === "VIRTUAL") return "Virtual";
  if (format === "IN_PERSON") return "In Person";
  return format || "";
}

export function RegistrationPageTemplate({
  content,
  workshop,
  isPreview = false,
}: {
  content: RegistrationContent;
  workshop: RegistrationWorkshopData;
  isPreview?: boolean;
}) {
  const coachPhoto = content.coachPhoto || "";
  const coachName = stripPlaceholders(content.coachName);
  const coachTitle = stripPlaceholders(content.coachTitle);
  const eventDate = stripPlaceholders(content.eventDate);
  const eventTime = stripPlaceholders(content.eventTime);
  const heroHeadline = stripPlaceholders(content.heroHeadline);
  const heroDescription = stripPlaceholders(content.heroDescription);
  const workshopTitle = stripPlaceholders(content.workshopTitle);
  const priceLabel = workshop.isFree
    ? "Free"
    : workshop.priceCents
      ? formatCurrency(workshop.priceCents)
      : null;

  return (
    <div className="su-public-brand">
      {isPreview && (
        <div className="su-preview-banner">
          <span>Preview — sample data shown</span>
        </div>
      )}

      <div className="su-reg">
        {/* Left: purple hero with brand + coach + event info */}
        <section className="su-reg-hero">
          <span className="su-stripe-v" aria-hidden="true" />
          <span className="su-glow-tr" aria-hidden="true" />
          <span className="su-glow-bl" aria-hidden="true" />

          <div className="su-brandbar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="su-logo" src="/brand/su-logo-white.svg" alt="Scaling Up" width={180} height={24} />
          </div>

          <h1 className="su-title">{heroHeadline || `Register for ${workshopTitle}`}</h1>
          {heroDescription && <p className="su-lede">{heroDescription}</p>}

          <div className="su-meta">
            {eventDate && (
              <div className="su-meta-item">
                <span className="su-meta-label">Date</span>
                <span className="su-meta-val">{eventDate}</span>
              </div>
            )}
            {eventTime && (
              <div className="su-meta-item">
                <span className="su-meta-label">Time</span>
                <span className="su-meta-val">{eventTime}</span>
              </div>
            )}
            <div className="su-meta-item">
              <span className="su-meta-label">Format</span>
              <span className="su-meta-val">{formatLabel(workshop.format)}</span>
            </div>
            {workshop.format === "IN_PERSON" && content.venueName && (
              <div className="su-meta-item">
                <span className="su-meta-label">Venue</span>
                <span className="su-meta-val">
                  {content.venueName}
                  {content.venueAddress && (
                    <span style={{ display: "block", fontWeight: 400, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                      {content.venueAddress}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          {(coachName || coachPhoto) && (
            <div className="su-reg-coach">
              {coachPhoto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coachPhoto} alt={coachName || "Workshop coach"} />
              )}
              <div>
                <span className="su-rc-ey">Your Coach</span>
                <div className="su-rc-nm">{coachName}</div>
                {coachTitle && <div className="su-rc-mt">{coachTitle}</div>}
              </div>
            </div>
          )}
        </section>

        {/* Right: white form panel */}
        <section className="su-reg-form-panel">
          <div className="su-form-card">
            {priceLabel && (
              <div className="su-priceline">
                <span className="su-pl-lbl">Investment</span>
                <span className="su-pl-amt">{priceLabel}</span>
              </div>
            )}
            <span className="su-form-eyebrow">Reserve your seat</span>
            <h2 className="su-form-title">{workshopTitle}</h2>
            <p className="su-form-sub">Complete your registration below.</p>

            {isPreview ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ height: 40, background: "#efecf3", border: "1px solid #d6d0de", borderRadius: 6 }} />
                <div style={{ height: 40, background: "#efecf3", border: "1px solid #d6d0de", borderRadius: 6 }} />
                <div style={{ height: 40, background: "#efecf3", border: "1px solid #d6d0de", borderRadius: 6 }} />
                <button
                  type="button"
                  disabled
                  className="su-cta"
                  style={{ width: "100%", opacity: 0.6, cursor: "not-allowed", marginTop: 4 }}
                >
                  {content.submitButtonText || "Register Now"}
                </button>
              </div>
            ) : (
              <RegistrationForm workshopId={workshop.id} isFree={workshop.isFree} />
            )}

            <p className="su-form-foot">Secure checkout · Instant confirmation</p>
          </div>
        </section>
      </div>
    </div>
  );
}
