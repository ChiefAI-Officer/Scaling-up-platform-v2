"use client";

import { formatCurrency } from "@/lib/utils";
import { stripPlaceholders } from "@/lib/templates/template-utils";

export interface SoloContent {
  heroTitle?: string;
  heroSubtitle?: string;
  eventDay?: string;
  eventDate?: string;
  eventTime?: string;
  eventTimezone?: string;
  coachPhoto?: string;
  coachName?: string;
  coachTitle?: string;
  aboutTitle?: string;
  aboutDescription?: string;
  partnerId?: string;
  partnerName?: string;
  partnerTagline?: string;
  partnerLogoUrl?: string;
  videoUrl?: string;
  benefits?: string[];
  registrationUrl?: string;
}

export interface SoloWorkshopData {
  id: string;
  title: string;
  isFree: boolean;
  priceCents?: number | null;
}

export const SAMPLE_WORKSHOP_SOLO: SoloWorkshopData = {
  id: "preview",
  title: "Sample: Scaling Up Masterclass",
  isFree: false,
  priceCents: 19900,
};


export function SoloLandingPageTemplate({
  content,
  workshop,
  isPreview = false,
}: {
  content: SoloContent;
  workshop: SoloWorkshopData;
  isPreview?: boolean;
}) {
  const heroTitle = stripPlaceholders(content.heroTitle);
  const eventDate = stripPlaceholders(content.eventDate);
  const eventTime = stripPlaceholders(content.eventTime);
  const coachPhoto = content.coachPhoto || "";
  const coachName = stripPlaceholders(content.coachName);
  const coachTitle = stripPlaceholders(content.coachTitle);
  const aboutTitle = stripPlaceholders(content.aboutTitle) || "About This Workshop";
  const aboutDescription = stripPlaceholders(content.aboutDescription);
  const partnerName = content.partnerName || "";
  const partnerTagline = content.partnerTagline || "";
  const partnerLogoUrl = content.partnerLogoUrl || "";
  const videoUrl = content.videoUrl || "";
  const benefits = (content.benefits || []).map(stripPlaceholders);
  const registrationUrl = content.registrationUrl || "#";

  const priceLabel = workshop.isFree ? "Free" : formatCurrency(workshop.priceCents ?? 0);

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Preview banner */}
      {isPreview && (
        <div className="bg-muted border-b px-4 py-1 text-center">
          <span className="text-xs text-muted-foreground">Preview — sample data shown</span>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-primary text-white">
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="grid lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-3 space-y-6">
              <div className="inline-flex items-center gap-2 bg-white/20 text-white text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Scaling Up Workshop
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                {heroTitle}
              </h1>
              <p className="text-white/80 text-lg sm:text-xl max-w-xl leading-relaxed">
                A hands-on session facilitated by {coachName}
              </p>
            </div>

            <div className="lg:col-span-2 flex justify-center lg:justify-end">
              <div className="bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center w-full max-w-xs">
                {coachPhoto && (
                  <img
                    src={coachPhoto}
                    alt={coachName}
                    className="w-28 h-28 rounded-2xl object-cover mx-auto mb-4 ring-2 ring-white/20"
                  />
                )}
                <div className="text-lg font-bold">{coachName}</div>
                <div className="text-white/60 text-sm mt-1">{coachTitle}</div>
                {(partnerName || partnerLogoUrl) && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
                      In Partnership With
                    </div>
                    {partnerLogoUrl ? (
                      <img
                        src={partnerLogoUrl}
                        alt={partnerName || "Partner"}
                        className="mx-auto h-8 w-auto object-contain"
                      />
                    ) : null}
                    {partnerName ? (
                      <div className="text-sm font-medium mt-1">{partnerName}</div>
                    ) : null}
                    {partnerTagline ? (
                      <div className="text-xs text-white/60">{partnerTagline}</div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-muted/50 to-transparent" />
      </section>

      {/* ── Main content ── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid lg:grid-cols-3 gap-10 lg:gap-14">
          <div className="lg:col-span-2 space-y-12">
            <section>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">{aboutTitle}</h2>
              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
                {aboutDescription}
              </p>
            </section>

            {benefits.length > 0 && (
              <section>
                <h3 className="text-xl font-bold text-foreground mb-6">
                  What You&apos;ll Walk Away With
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {benefits.map((benefit, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-sm text-foreground leading-snug">{benefit}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {videoUrl && (
              <div className="w-full max-w-2xl">
                <div className="rounded-2xl overflow-hidden shadow-xl border border-border">
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
          </div>

          {/* CTA sidebar */}
          <div className="lg:sticky lg:top-6 self-start">
            <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-primary p-6 text-center">
                <p className="text-white/80 text-sm font-medium uppercase tracking-wide mb-1">
                  {workshop.isFree ? "Free Event" : "Investment"}
                </p>
                <p className="text-white text-4xl font-extrabold tracking-tight">{priceLabel}</p>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-primary"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-foreground">{eventDate}</p>
                  </div>
                  {eventTime && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-primary"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-foreground">{eventTime}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-primary"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">Limited seats available</p>
                  </div>
                </div>

                {isPreview ? (
                  <button
                    type="button"
                    disabled
                    className="block w-full bg-primary text-white text-center py-4 rounded-xl font-semibold opacity-60 cursor-not-allowed text-base"
                  >
                    Register Now
                  </button>
                ) : (
                  <a
                    href={registrationUrl || `/workshop/${workshop.id}`}
                    className="block w-full bg-primary text-white text-center py-4 rounded-xl font-semibold hover:bg-primary/90 transition-all hover:shadow-lg text-base"
                  >
                    Register Now
                  </a>
                )}

                <p className="text-xs text-center text-muted-foreground">
                  Secure checkout &middot; Instant confirmation
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer CTA ── */}
      <section className="border-t border-border bg-card py-14 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-foreground mb-3">Ready to Scale?</h3>
          <p className="text-muted-foreground mb-6">
            Secure your spot today and take the next step toward building a stronger, more valuable
            business.
          </p>
          {isPreview ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-xl font-semibold opacity-60 cursor-not-allowed"
            >
              Register Now
            </button>
          ) : (
            <a
              href={registrationUrl || `/workshop/${workshop.id}`}
              className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-xl font-semibold hover:bg-primary/90 transition-all hover:shadow-lg"
            >
              Register Now
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
