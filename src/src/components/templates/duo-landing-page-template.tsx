"use client";

import { formatCurrency } from "@/lib/utils";

export interface DuoContent {
  heroTitle?: string;
  subtitle?: string;
  eventDate?: string;
  eventTime?: string;
  description?: string;
  coach1?: { name?: string; photo?: string; title?: string };
  coach2?: { name?: string; photo?: string; title?: string };
  whatItIs?: string[];
  whatItIsNot?: string[];
  whoIsFor?: string[];
  whoShouldSkip?: string[];
  whyNow?: string;
  registrationUrl?: string;
  ctaText?: string;
}

export interface DuoWorkshopData {
  id: string;
  title: string;
  isFree: boolean;
  priceCents?: number | null;
}

function stripPlaceholders(text: string | undefined): string {
  if (!text) return "";
  if (/\{\{[^}]+\}\}/.test(text)) {
    console.warn(`[duo-landing-template] Unresolved placeholder: ${text.substring(0, 80)}`);
  }
  return text.replace(/\{\{[^}]+\}\}/g, "").replace(/\s{2,}/g, " ").trim();
}

export const SAMPLE_WORKSHOP_DUO: DuoWorkshopData = {
  id: "preview",
  title: "Sample: Scaling Up Together",
  isFree: false,
  priceCents: 29900,
};

export function DuoLandingPageTemplate({
  content,
  workshop,
  isPreview = false,
}: {
  content: DuoContent;
  workshop: DuoWorkshopData;
  isPreview?: boolean;
}) {
  const heroTitle = stripPlaceholders(content.heroTitle);
  const subtitle = stripPlaceholders(content.subtitle);
  const eventDate = stripPlaceholders(content.eventDate);
  const eventTime = stripPlaceholders(content.eventTime);
  const description = stripPlaceholders(content.description);
  const coach1 = content.coach1 || { name: "", photo: "", title: "" };
  const coach2 = content.coach2 || { name: "", photo: "", title: "" };
  const whatItIs = (content.whatItIs || []).map(stripPlaceholders);
  const whatItIsNot = (content.whatItIsNot || []).map(stripPlaceholders);
  const whoIsFor = (content.whoIsFor || []).map(stripPlaceholders);
  const whoShouldSkip = (content.whoShouldSkip || []).map(stripPlaceholders);
  const whyNow = stripPlaceholders(content.whyNow);
  const registrationUrl = content.registrationUrl || "#";
  const ctaText = stripPlaceholders(content.ctaText) || "Register";

  const priceLabel = workshop.isFree ? "Free" : formatCurrency(workshop.priceCents ?? 0);

  return (
    <div className="min-h-screen bg-card">
      {/* Preview banner */}
      {isPreview && (
        <div className="bg-muted border-b px-4 py-1 text-center">
          <span className="text-xs text-muted-foreground">Preview — sample data shown</span>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="bg-primary text-white py-16 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-5 gap-8 items-center">
          <div className="md:col-span-3">
            <span className="bg-white/20 text-sm px-4 py-1 rounded-full">Scaling Up</span>
            <h1 className="text-4xl font-bold mt-4 mb-3">{heroTitle}</h1>
            <p className="text-white/80 text-lg mb-6">{subtitle}</p>
            <div className="space-y-2">
              <div>📅 {eventDate}</div>
              <div>⏰ {eventTime}</div>
              <div>📍 Live Virtual Event</div>
            </div>
          </div>
          <div className="md:col-span-2 flex gap-6 justify-center">
            {[coach1, coach2].map((coach, i) => (
              <div key={i} className="text-center">
                {coach.photo ? (
                  <img
                    src={coach.photo}
                    alt={coach.name || ""}
                    className="w-24 h-24 rounded-full object-cover mx-auto mb-2 border-4 border-white"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-white/20 mx-auto mb-2" />
                )}
                <div className="font-medium">{coach.name || ""}</div>
                <div className="text-white/60 text-sm">{coach.title || ""}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="max-w-4xl mx-auto py-16 px-4">
        <p className="text-muted-foreground text-lg mb-12">{description}</p>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h3 className="font-bold text-success mb-4">What This Workshop Is ✓</h3>
            <ul className="space-y-2">
              {whatItIs.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-foreground">
                  <span className="text-success">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-destructive mb-4">What This Workshop Is Not ✗</h3>
            <ul className="space-y-2">
              {whatItIsNot.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-foreground">
                  <span className="text-destructive">✗</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-muted p-6 rounded-lg">
            <h3 className="font-bold mb-4">Who This Workshop Is For</h3>
            <ul className="space-y-2">
              {whoIsFor.map((item, i) => (
                <li key={i} className="text-foreground">• {item}</li>
              ))}
            </ul>
          </div>
          <div className="bg-destructive/10 p-6 rounded-lg">
            <h3 className="font-bold mb-4">Who Should Skip This</h3>
            <ul className="space-y-2">
              {whoShouldSkip.map((item, i) => (
                <li key={i} className="text-foreground">• {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-primary text-white p-8 rounded-xl text-center mb-12">
          <h3 className="text-xl font-bold mb-4">Why This Matters Now</h3>
          <p className="text-white/80">{whyNow}</p>
        </div>

        <div className="text-center py-8">
          {isPreview ? (
            <button
              type="button"
              disabled
              className="inline-block bg-primary text-white px-12 py-4 rounded-lg font-bold text-lg opacity-60 cursor-not-allowed"
            >
              {ctaText}
            </button>
          ) : (
            <a
              href={registrationUrl}
              className="inline-block bg-primary text-white px-12 py-4 rounded-lg font-bold text-lg hover:bg-primary/90 transition"
            >
              {ctaText}
            </a>
          )}
          <p className="text-muted-foreground mt-3">{priceLabel}</p>
        </div>
      </main>

      <footer className="text-center py-8 text-muted-foreground">
        © {new Date().getFullYear()} Scaling Up. All rights reserved.
      </footer>
    </div>
  );
}
