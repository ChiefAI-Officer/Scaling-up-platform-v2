import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { RegistrationForm } from "./registration-form";
import {
  buildGoogleCalendarUrl,
  parseDurationHours,
  buildLocationString,
} from "@/lib/ics-generator";
import { formatCurrency } from "@/lib/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Content type interfaces
interface BioContent {
  profileImageUrl?: string;
  coachName?: string;
  coachTitle?: string;
  biography?: string;
  showCtaButton?: boolean;
  ctaButtonUrl?: string;
  ctaButtonText?: string;
}

interface SoloContent {
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

interface DuoContent {
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

interface RegistrationContent {
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

interface ThankYouContent {
  headline?: string;
  subheadline?: string;
  videoUrl?: string;
  additionalMessage?: string;
  calendarReminderText?: string;
}

/** Strip any unresolved {{variable}} placeholders — safety net with logging */
function stripPlaceholders(text: string | undefined): string {
  if (!text) return "";
  if (/\{\{[^}]+\}\}/.test(text)) {
    console.warn(`[landing-page] Unresolved placeholder in rendered content: ${text.substring(0, 80)}`);
  }
  return text.replace(/\{\{[^}]+\}\}/g, "").replace(/\s{2,}/g, " ").trim();
}

interface WorkshopData {
  id: string;
  title: string;
  description?: string | null;
  eventDate: Date;
  eventTime?: string | null;
  timezone: string;
  duration?: string | null;
  format: string;
  venueName?: string | null;
  venueAddress?: string | null;
  virtualLink?: string | null;
  virtualPlatform?: string | null;
  isFree: boolean;
  priceCents: number | null;
  earlyBirdPriceCents: number | null;
}

interface WorkshopFallbackData {
  id: string;
  title: string;
  description: string | null;
  eventDate: Date;
  eventTime: string | null;
  timezone: string;
  format: string;
  venueName: string | null;
  venueAddress: string | null;
  isFree: boolean;
  priceCents: number | null;
  earlyBirdPriceCents: number | null;
  coach: {
    firstName: string;
    lastName: string;
  };
}

function parseVenueAddress(raw: string | null): { city?: string; state?: string } {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as { city?: string; state?: string };
    return parsed;
  } catch {
    return {};
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  
  const landingPage = await db.landingPage.findUnique({
    where: { slug },
    include: {
      workshop: {
        include: {
          coach: true,
        },
      },
    },
  });

  if (landingPage) {
    const content = JSON.parse(landingPage.content) as Record<string, string>;

    return {
      title: content.heroTitle || content.workshopTitle || landingPage.workshop.title,
      description: content.aboutDescription || content.description || "Workshop details and registration",
    };
  }

  const workshop = await db.workshop.findUnique({
    where: { landingPageSlug: slug },
  });

  if (!workshop) {
    return { title: "Page Not Found" };
  }

  return {
    title: workshop.title,
    description: "Workshop registration details",
  };
}

export default async function LandingPageView({ params }: PageProps) {
  const { slug } = await params;

  const landingPage = await db.landingPage.findUnique({
    where: { slug },
    include: {
      workshop: {
        include: {
          coach: true,
          workshopType: true,
        },
      },
    },
  });

  if (landingPage) {
    if (landingPage.status !== "PUBLISHED") {
      notFound();
    }

    const content = JSON.parse(landingPage.content);
    const workshop = landingPage.workshop;

    switch (landingPage.template) {
      case "BIO_PAGE":
        return <BioPageTemplate content={content as BioContent} />;
      case "SOLO_LANDING":
        return <SoloLandingTemplate content={content as SoloContent} workshop={workshop} />;
      case "DUO_LANDING":
        return <DuoLandingTemplate content={content as DuoContent} workshop={workshop} />;
      case "REGISTRATION":
        return <RegistrationTemplate content={content as RegistrationContent} workshop={workshop} />;
      case "THANK_YOU":
        return <ThankYouTemplate content={content as ThankYouContent} workshop={workshop} />;
      default:
        notFound();
    }
  }

  const workshop = await db.workshop.findUnique({
    where: { landingPageSlug: slug },
    include: {
      coach: true,
    },
  });

  if (!workshop) {
    notFound();
  }

  return <DefaultWorkshopTemplate workshop={workshop} />;
}

function DefaultWorkshopTemplate({ workshop }: { workshop: WorkshopFallbackData }) {
  const eventDate = new Date(workshop.eventDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const venueAddress = parseVenueAddress(workshop.venueAddress);
  const locationLabel =
    workshop.format === "VIRTUAL"
      ? "Virtual Workshop"
      : [
          workshop.venueName,
          [venueAddress.city, venueAddress.state].filter(Boolean).join(", "),
        ]
          .filter(Boolean)
          .join(" · ");
  const effectivePriceCents = workshop.earlyBirdPriceCents ?? workshop.priceCents ?? 0;
  const priceLabel = workshop.isFree
    ? "Free"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(effectivePriceCents / 100);

  return (
    <div className="min-h-screen bg-muted py-10 px-4">
      <div className="max-w-5xl mx-auto grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2 bg-card rounded-xl shadow-sm border border-border p-8 space-y-6">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">Workshop</p>
          <h1 className="text-3xl font-bold text-foreground">{workshop.title}</h1>
          <p className="text-muted-foreground">
            {"Join this workshop to learn practical frameworks you can apply immediately."}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</p>
              <p className="mt-1 text-sm text-foreground">{eventDate}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</p>
              <p className="mt-1 text-sm text-foreground">
                {workshop.eventTime || "TBD"} {workshop.timezone}
              </p>
            </div>
            <div className="sm:col-span-2 rounded-lg border border-border bg-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</p>
              <p className="mt-1 text-sm text-foreground">{locationLabel || "Location to be announced"}</p>
            </div>
          </div>
        </section>

        <aside className="bg-card rounded-xl shadow-sm border border-border p-6">
          <h2 className="text-xl font-semibold text-foreground">Register</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hosted by {workshop.coach.firstName} {workshop.coach.lastName}
          </p>
          <p className="mt-4 text-2xl font-bold text-primary">{priceLabel}</p>
          <div className="mt-6">
            <RegistrationForm workshopId={workshop.id} isFree={workshop.isFree} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function BioPageTemplate({ content }: { content: BioContent }) {
  const name = content.coachName || "";
  const title = content.coachTitle || "";
  const bio = content.biography || "";
  const profileImage = content.profileImageUrl || "";
  const showCtaButton = content.showCtaButton !== false;
  const ctaUrl = content.ctaButtonUrl || "";
  const ctaText = content.ctaButtonText || "Book a Call";

  return (
    <div className="min-h-screen bg-card">
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-purple-700 font-bold text-xl tracking-wider mb-12">
          SCALING UP COACHES
        </div>

        {profileImage && (
          <img
            src={profileImage}
            alt={name}
            className="w-40 h-40 rounded-full object-cover mx-auto mb-6 border-4 border-purple-100"
          />
        )}

        <h1 className="text-3xl font-bold text-foreground mb-2">{name}</h1>
        <p className="text-muted-foreground mb-8">{title}</p>

        <div className="text-left text-foreground space-y-4 mb-10">
          {bio.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        {showCtaButton && ctaUrl && (
          <a
            href={ctaUrl}
            className="inline-block bg-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:bg-purple-700 transition"
          >
            {ctaText}
          </a>
        )}

        <div className="mt-16 pt-8 border-t text-muted-foreground text-sm">
          © {new Date().getFullYear()} Scaling Up Coach {name.split(" ")[0]}
        </div>
      </div>
    </div>
  );
}

function SoloLandingTemplate({ content, workshop }: { content: SoloContent; workshop: WorkshopData }) {
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

  return (
    <div className="min-h-screen bg-muted/50">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-800 via-purple-700 to-purple-900 text-white">
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="grid lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-3 space-y-6">
              <div className="inline-flex items-center gap-2 bg-orange-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                Scaling Up Workshop
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                {heroTitle}
              </h1>
              <p className="text-purple-200 text-lg sm:text-xl max-w-xl leading-relaxed">
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
                <div className="text-purple-300 text-sm mt-1">{coachTitle}</div>
                {(partnerName || partnerLogoUrl) && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-widest text-purple-400 mb-2">In Partnership With</div>
                    {partnerLogoUrl ? (
                      <img src={partnerLogoUrl} alt={partnerName || "Partner"} className="mx-auto h-8 w-auto object-contain" />
                    ) : null}
                    {partnerName ? <div className="text-sm font-medium mt-1">{partnerName}</div> : null}
                    {partnerTagline ? <div className="text-xs text-purple-300">{partnerTagline}</div> : null}
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
              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">{aboutDescription}</p>
            </section>

            {videoUrl && (
              <div className="rounded-2xl overflow-hidden shadow-xl border border-border">
                <iframe src={videoUrl} className="w-full aspect-video" allowFullScreen />
              </div>
            )}

            {benefits.length > 0 && (
              <section>
                <h3 className="text-xl font-bold text-foreground mb-6">What You&apos;ll Walk Away With</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {benefits.map((benefit, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold dark:bg-purple-900/30 dark:text-purple-300">
                        {i + 1}
                      </span>
                      <span className="text-sm text-foreground leading-snug">{benefit}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* CTA sidebar */}
          <div className="lg:sticky lg:top-6 self-start">
            <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-6 text-center">
                <p className="text-white/80 text-sm font-medium uppercase tracking-wide mb-1">
                  {workshop.isFree ? "Free Event" : "Investment"}
                </p>
                <p className="text-white text-4xl font-extrabold tracking-tight">
                  {workshop.isFree ? "Free" : formatCurrency(workshop.priceCents ?? 0)}
                </p>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center dark:bg-purple-900/20">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    </div>
                    <p className="text-sm font-medium text-foreground">{eventDate}</p>
                  </div>
                  {eventTime && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center dark:bg-purple-900/20">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      </div>
                      <p className="text-sm font-medium text-foreground">{eventTime}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center dark:bg-purple-900/20">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    </div>
                    <p className="text-sm text-muted-foreground">Limited seats available</p>
                  </div>
                </div>

                <a
                  href={registrationUrl || `/workshop/${workshop.id}`}
                  className="block w-full bg-purple-600 text-white text-center py-4 rounded-xl font-semibold hover:bg-purple-700 transition-all hover:shadow-lg text-base"
                >
                  Register Now
                </a>

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
            Secure your spot today and take the next step toward building a stronger, more valuable business.
          </p>
          <a
            href={registrationUrl || `/workshop/${workshop.id}`}
            className="inline-flex items-center gap-2 bg-purple-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-all hover:shadow-lg"
          >
            Register Now
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </a>
        </div>
      </section>
    </div>
  );
}

function DuoLandingTemplate({ content, workshop }: { content: DuoContent; workshop: WorkshopData }) {
  const heroTitle = content.heroTitle || "";
  const subtitle = content.subtitle || "";
  const eventDate = content.eventDate || "";
  const eventTime = content.eventTime || "";
  const description = content.description || "";
  const coach1 = content.coach1 || { name: "", photo: "", title: "" };
  const coach2 = content.coach2 || { name: "", photo: "", title: "" };
  const whatItIs = content.whatItIs || [];
  const whatItIsNot = content.whatItIsNot || [];
  const whoIsFor = content.whoIsFor || [];
  const whoShouldSkip = content.whoShouldSkip || [];
  const whyNow = content.whyNow || "";
  const registrationUrl = content.registrationUrl || "#";
  const ctaText = content.ctaText || "Register";

  return (
    <div className="min-h-screen bg-card">
      <section className="bg-gradient-to-br from-purple-700 via-purple-600 to-blue-600 text-white py-16 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-5 gap-8 items-center">
          <div className="md:col-span-3">
            <span className="bg-card/20 text-sm px-4 py-1 rounded-full">Scaling Up</span>
            <h1 className="text-4xl font-bold mt-4 mb-3">{heroTitle}</h1>
            <p className="text-purple-200 text-lg mb-6">{subtitle}</p>
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
                  <img src={coach.photo} alt={coach.name || ""} className="w-24 h-24 rounded-full object-cover mx-auto mb-2 border-4 border-white" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-purple-500 mx-auto mb-2" />
                )}
                <div className="font-medium">{coach.name || ""}</div>
                <div className="text-purple-200 text-sm">{coach.title || ""}</div>
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

        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-8 rounded-xl text-center mb-12">
          <h3 className="text-xl font-bold mb-4">Why This Matters Now</h3>
          <p className="text-purple-100">{whyNow}</p>
        </div>

        <div className="text-center py-8">
          <a
            href={registrationUrl}
            className="inline-block bg-primary text-primary-foreground px-12 py-4 rounded-lg font-bold text-lg hover:bg-primary/90 transition"
          >
            {ctaText}
          </a>
          <p className="text-muted-foreground mt-3">{workshop.isFree ? "Free" : formatCurrency(workshop.priceCents ?? 0)}</p>
        </div>
      </main>

      <footer className="text-center py-8 text-muted-foreground">
        © {new Date().getFullYear()} Scaling Up. All rights reserved.
      </footer>
    </div>
  );
}

function RegistrationTemplate({ content, workshop }: { content: RegistrationContent; workshop: WorkshopData }) {
  const coachPhoto = content.coachPhoto || "";
  const coachName = stripPlaceholders(content.coachName);
  const coachTitle = stripPlaceholders(content.coachTitle);
  const eventDate = stripPlaceholders(content.eventDate);
  const eventTime = stripPlaceholders(content.eventTime);
  const heroHeadline = stripPlaceholders(content.heroHeadline);
  const workshopTitle = stripPlaceholders(content.workshopTitle);

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: purple panel with coach + event info */}
      <div
        className="relative overflow-hidden text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-center"
        style={{ background: "linear-gradient(135deg, #581c87 0%, #7c3aed 40%, #6d28d9 100%)" }}
      >
        {/* Grid texture matching solo landing */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative space-y-8">
          <div className="inline-flex items-center gap-2 bg-orange-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
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
                <div className="text-purple-300 text-sm">{coachTitle}</div>
              </div>
            </div>
          </div>

          {/* Event details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              </div>
              <span className="text-sm">{eventDate}</span>
            </div>
            {eventTime && (
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
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
          <RegistrationForm workshopId={workshop.id} isFree={workshop.isFree} />
          <p className="text-xs text-center text-muted-foreground mt-6">
            Secure checkout &middot; Instant confirmation
          </p>
        </div>
      </div>
    </div>
  );
}

function ThankYouTemplate({ content, workshop }: { content: ThankYouContent; workshop: WorkshopData }) {
  const headline = stripPlaceholders(content.headline);
  const subheadline = stripPlaceholders(content.subheadline);
  const videoUrl = content.videoUrl || "";
  const additionalMessage = stripPlaceholders(content.additionalMessage);
  const calendarReminderText = stripPlaceholders(content.calendarReminderText);
  const effectivePriceCents = workshop.earlyBirdPriceCents ?? workshop.priceCents ?? 0;
  const shouldTrackAffiliateSale = !workshop.isFree && effectivePriceCents > 0;
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

  const calendarUrl = buildGoogleCalendarUrl({
    uid: workshop.id,
    title: workshop.title || "Scaling Up Workshop",
    description: workshop.description,
    eventDate: workshop.eventDate,
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

      {/* Top accent bar */}
      <div
        className="h-2"
        style={{ background: "linear-gradient(90deg, #6B21A8, #7C3AED, #1D4ED8)" }}
      />

      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-20">
        {/* Success card */}
        <div className="bg-card rounded-2xl shadow-lg border border-border overflow-hidden">
          {/* Header with gradient accent */}
          <div
            className="px-6 py-10 sm:px-10 sm:py-14 text-center text-white"
            style={{ background: "linear-gradient(135deg, #6B21A8 0%, #7C3AED 60%, #1D4ED8 100%)" }}
          >
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
              <div className="mt-8">
                <div className="rounded-xl overflow-hidden border border-border">
                  <iframe src={videoUrl} className="w-full aspect-video" allowFullScreen />
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
