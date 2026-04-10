import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { RegistrationForm } from "./registration-form";
import { formatCurrency } from "@/lib/utils";
import { ThankYouPageTemplate } from "@/components/templates/thank-you-page-template";
import { RegistrationPageTemplate } from "@/components/templates/registration-page-template";
import { BioPageTemplate, BioContent } from "@/components/templates/bio-page-template";
import { SoloLandingPageTemplate, SoloContent } from "@/components/templates/solo-landing-page-template";
import { DuoLandingPageTemplate, DuoContent } from "@/components/templates/duo-landing-page-template";
import { stripPlaceholders } from "@/lib/templates/template-utils";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Content type interfaces

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
        return <BioPageTemplate content={content as BioContent} isPreview={false} />;
      case "SOLO_LANDING":
        return <SoloLandingPageTemplate content={content as SoloContent} workshop={workshop} isPreview={false} />;
      case "DUO_LANDING":
        return <DuoLandingPageTemplate content={content as DuoContent} workshop={workshop} isPreview={false} />;
      case "REGISTRATION":
        return <RegistrationPageTemplate content={content} workshop={workshop} isPreview={false} />;
      case "THANK_YOU":
        return <ThankYouPageTemplate content={content} workshop={workshop} isPreview={false} />;
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

