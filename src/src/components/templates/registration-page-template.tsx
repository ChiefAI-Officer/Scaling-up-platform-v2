"use client";

import { RegistrationForm } from "@/app/(public)/workshop/[slug]/registration-form";
import { stripPlaceholders } from "@/lib/template-utils";

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
  const workshopTitle = stripPlaceholders(content.workshopTitle);

  return (
    <div className="min-h-screen">
      {/* Preview banner */}
      {isPreview && (
        <div className="bg-muted border-b px-4 py-1 text-center">
          <span className="text-xs text-muted-foreground">Preview — sample data shown</span>
        </div>
      )}

      <div className="min-h-screen grid lg:grid-cols-2">
        {/* Left: primary panel with coach + event info */}
        <div className="relative overflow-hidden text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-center bg-primary">
          {/* Grid texture */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="relative space-y-8">
            <div className="inline-flex items-center gap-2 bg-white/20 text-white text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Scaling Up
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              {heroHeadline || `Register for ${workshopTitle}`}
            </h1>

            {/* Coach card */}
            <div className="bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-4">
                {coachPhoto && (
                  <img src={coachPhoto} alt={coachName} className="w-14 h-14 rounded-xl object-cover ring-2 ring-white/20" />
                )}
                <div>
                  <div className="font-semibold">{coachName}</div>
                  <div className="text-white/60 text-sm">{coachTitle}</div>
                </div>
              </div>
            </div>

            {/* Event details */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <span className="text-sm">{eventDate}</span>
              </div>
              {eventTime && (
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <span className="text-sm">{eventTime}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: form panel */}
        <div className="bg-card flex items-center justify-center p-8 sm:p-12 lg:p-16">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground">{workshopTitle}</h2>
              <p className="text-muted-foreground mt-1">Complete your registration below</p>
            </div>
            {isPreview ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-10 bg-muted/60 border border-border rounded-lg" />
                </div>
                <div className="space-y-1">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-10 bg-muted/60 border border-border rounded-lg" />
                </div>
                <div className="space-y-1">
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-10 bg-muted/60 border border-border rounded-lg" />
                </div>
                <button
                  type="button"
                  disabled
                  className="w-full h-11 bg-primary text-white rounded-lg font-semibold opacity-60 cursor-not-allowed"
                >
                  {content.submitButtonText || "Register Now"}
                </button>
              </div>
            ) : (
              <RegistrationForm workshopId={workshop.id} isFree={workshop.isFree} />
            )}
            <p className="text-xs text-center text-muted-foreground mt-6">
              Secure checkout &middot; Instant confirmation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
