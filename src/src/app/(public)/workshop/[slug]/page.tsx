import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { RegistrationForm } from "./registration-form";
import {
  buildGoogleCalendarUrl,
  parseDurationHours,
  buildLocationString,
} from "@/lib/ics-generator";

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
  ctaText?: string;
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
      description: content.heroSubtitle || content.description || "Workshop details and registration",
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
  const heroTitle = content.heroTitle || "";
  const heroSubtitle = content.heroSubtitle || "";
  const eventDay = content.eventDay || "";
  const eventDate = content.eventDate || "";
  const eventTime = content.eventTime || "";
  const eventTimezone = content.eventTimezone || "";
  const coachPhoto = content.coachPhoto || "";
  const coachName = content.coachName || "";
  const coachTitle = content.coachTitle || "";
  const aboutTitle = content.aboutTitle || `Join us for the ${heroTitle}`;
  const aboutDescription = content.aboutDescription || "";
  const partnerName = content.partnerName || "";
  const partnerTagline = content.partnerTagline || "";
  const partnerLogoUrl = content.partnerLogoUrl || "";
  const videoUrl = content.videoUrl || "";
  const benefits = content.benefits || [];
  const registrationUrl = content.registrationUrl || "#";
  const ctaText = content.ctaText || "Register";

  return (
    <div className="min-h-screen bg-card">
      <section className="bg-gradient-to-br from-purple-700 to-purple-900 text-white py-16 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="bg-orange-500 text-sm px-4 py-1 rounded-full uppercase font-semibold">
              Scaling Up
            </span>
            <h1 className="text-4xl font-bold mt-4 mb-3">{heroTitle}</h1>
            <p className="text-purple-200 text-lg mb-6">{heroSubtitle}</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span>📅</span>
                <span>{eventDay}, {eventDate}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>⏰</span>
                <span>{eventTime} {eventTimezone}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>📍</span>
                <span>Virtual Workshop</span>
              </div>
            </div>
          </div>
          <div className="text-center">
            {coachPhoto && (
              <img
                src={coachPhoto}
                alt={coachName}
                className="w-40 h-40 rounded-full object-cover mx-auto mb-4 border-4 border-white"
              />
            )}
            <div className="text-xl font-bold">{coachName}</div>
            <div className="text-purple-200">{coachTitle}</div>
            {partnerName || partnerTagline || partnerLogoUrl ? (
              <div className="mt-5 border-t border-white/20 pt-4">
                <div className="text-xs uppercase tracking-wide text-purple-200 mb-2">
                  In Partnership With
                </div>
                {partnerLogoUrl ? (
                  <img
                    src={partnerLogoUrl}
                    alt={partnerName || "Partner"}
                    className="mx-auto h-12 w-auto rounded bg-card p-1 object-contain"
                  />
                ) : null}
                {partnerName ? <div className="mt-2 text-sm font-semibold">{partnerName}</div> : null}
                {partnerTagline ? <div className="text-xs text-purple-200">{partnerTagline}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <main className="max-w-5xl mx-auto py-16 px-4 grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2">
          <h2 className="text-3xl font-bold mb-6">{aboutTitle}</h2>
          <p className="text-muted-foreground mb-8">{aboutDescription}</p>

          {videoUrl && (
            <div className="mb-8 rounded-xl overflow-hidden shadow-lg">
              <iframe src={videoUrl} className="w-full aspect-video" allowFullScreen />
            </div>
          )}

          <h3 className="text-xl font-bold text-purple-700 mb-4">What You&apos;ll Learn</h3>
          <ul className="space-y-3">
            {benefits.map((benefit, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-primary font-bold">✓</span>
                <span className="text-foreground">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:sticky md:top-8">
          <div className="bg-card border rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
              <h3 className="font-semibold uppercase text-sm">Register Now</h3>
            </div>
            <div className="p-6">
              <div className="bg-primary text-primary-foreground inline-block px-4 py-2 rounded mb-4 font-semibold">
                {eventDate}
              </div>
              <p className="font-semibold mb-2">{heroTitle} with {coachName}</p>
              <p className="text-2xl font-bold text-primary mb-6">
                {workshop.isFree ? "Free" : "$299"}
              </p>
              <a
                href={registrationUrl}
                className="block w-full bg-primary text-primary-foreground text-center py-4 rounded-lg font-semibold hover:bg-primary/90 transition"
              >
                {ctaText}
              </a>
            </div>
          </div>
        </div>
      </main>

      <section className="bg-muted py-12 px-4 text-center">
        <p className="max-w-2xl mx-auto text-muted-foreground italic">
          <strong>Secure your spot today</strong> and take the next step toward building a stronger, more valuable business.
        </p>
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
          <p className="text-muted-foreground mt-3">{workshop.isFree ? "Free" : "$299"}</p>
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
  const coachName = content.coachName || "";
  const coachTitle = content.coachTitle || "";
  const eventDate = content.eventDate || "";
  const eventTime = content.eventTime || "";
  const heroHeadline = content.heroHeadline || "";
  const heroDescription = content.heroDescription || "";
  const workshopTitle = content.workshopTitle || "";

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="bg-gradient-to-br from-purple-700 to-blue-600 text-white p-12 flex flex-col justify-center">
        <div className="bg-purple-600/50 rounded-xl p-6 mb-8">
          <div className="flex items-center gap-4 mb-4">
            {coachPhoto && (
              <img src={coachPhoto} alt={coachName} className="w-16 h-16 rounded-full object-cover border-2 border-white" />
            )}
            <div>
              <div className="font-semibold">{coachName}</div>
              <div className="text-purple-200 text-sm">{coachTitle}</div>
            </div>
          </div>
          <div className="space-y-1 text-purple-200 text-sm">
            <div>📅 {eventDate}</div>
            <div>⏰ {eventTime}</div>
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-4">{heroHeadline}</h1>
        <p className="text-purple-200">{heroDescription}</p>
      </div>

      <div className="bg-card p-12 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="border rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
              <div className="font-semibold">{workshopTitle}</div>
              <div className="text-purple-200 text-sm">with {coachName}</div>
            </div>
            <div className="p-6">
              <RegistrationForm workshopId={workshop.id} isFree={workshop.isFree} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThankYouTemplate({ content, workshop }: { content: ThankYouContent; workshop: WorkshopData }) {
  const headline = content.headline || "";
  const subheadline = content.subheadline || "";
  const videoUrl = content.videoUrl || "";
  const additionalMessage = content.additionalMessage || "";
  const calendarReminderText = content.calendarReminderText || "";
  const effectivePriceCents = workshop.earlyBirdPriceCents ?? workshop.priceCents ?? 0;
  const shouldTrackAffiliateSale = !workshop.isFree && effectivePriceCents > 0;
  const affiliateSaleAmount = (effectivePriceCents / 100).toFixed(2);
  const affiliateOrderNumber = workshop.title || workshop.id;
  const affiliateTrackingUrl = `https://scalingup.idevaffiliate.com/sale.php?profile=72198&idev_saleamt=${encodeURIComponent(
    affiliateSaleAmount
  )}&idev_ordernum=${encodeURIComponent(affiliateOrderNumber)}`;

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #6B21A8 0%, #7C3AED 50%, #6B21A8 100%)" }}
    >
      {shouldTrackAffiliateSale ? (
        <img
          src={affiliateTrackingUrl}
          style={{ height: "0px", width: "0px", border: "0px", position: "absolute" }}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <div className="text-white text-center px-4 max-w-2xl">
        <div className="font-bold text-2xl tracking-wider mb-12">SCALING UP</div>

        <h1 className="text-3xl font-serif mb-2">{headline}</h1>

        <p className="text-purple-200 italic mb-10">{subheadline}</p>

        {videoUrl && (
          <div className="mb-10">
            <div className="border-4 border-white rounded-lg overflow-hidden max-w-lg mx-auto">
              <iframe src={videoUrl} className="w-full aspect-video" allowFullScreen />
            </div>
          </div>
        )}

        {additionalMessage && <p className="text-purple-200 mb-8">{additionalMessage}</p>}

        <p className="text-purple-200 text-sm mb-4">{calendarReminderText}</p>

        <div className="flex gap-3 justify-center">
          <a
            href={buildGoogleCalendarUrl({
              uid: workshop.id,
              title: workshop.title || "Scaling Up Workshop",
              description: workshop.description,
              eventDate: workshop.eventDate,
              eventTime: workshop.eventTime,
              timezone: workshop.timezone,
              durationHours: parseDurationHours(workshop.duration),
              location: buildLocationString(workshop),
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-card/20 text-white px-4 py-2 rounded hover:bg-card/30 transition"
          >
            Add to Google Calendar
          </a>
          <a
            href={`/api/workshops/${workshop.id}/ics`}
            download
            className="bg-card/20 text-white px-4 py-2 rounded hover:bg-card/30 transition"
          >
            Download .ics (Outlook)
          </a>
        </div>
      </div>
    </div>
  );
}
