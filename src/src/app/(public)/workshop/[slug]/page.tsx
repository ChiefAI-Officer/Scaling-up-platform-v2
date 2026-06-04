import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { RegistrationForm } from "./registration-form";
import { formatCurrency, formatTimeWithZone } from "@/lib/utils";
import { ThankYouPageTemplate } from "@/components/templates/thank-you-page-template";
import { RegistrationPageTemplate } from "@/components/templates/registration-page-template";
import { BioPageTemplate, BioContent } from "@/components/templates/bio-page-template";
import { SoloLandingPageTemplate, SoloContent } from "@/components/templates/solo-landing-page-template";
import { DuoLandingPageTemplate, DuoContent } from "@/components/templates/duo-landing-page-template";
import { stripPlaceholders } from "@/lib/templates/template-utils";
import { formatVenueAddress, normalizeVideoUrl } from "@/lib/templates/landing-page-overlay";
import { resolveCustomCodeRenderer } from "@/lib/templates/resolve-custom-code-renderer";
import { isApprovedWorkshopStatus } from "@/lib/registration-service";

// CHG-03: paid thank-you path needs fresh data on every request. Stripe SDK
// uses native fetch; Next.js 16 caches SC fetches by default and stale
// payment_status: "unpaid" could be returned post-webhook. Force-dynamic
// guarantees the SC is re-rendered each time.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  // CHG-03: paid checkout redirects to /workshop/[slug]?session_id=cs_test_...
  // when a THANK_YOU LandingPage is published. The handler uses session_id
  // to look up the registration so <CustomCodeRenderer> can fire iDev with
  // real attribution data.
  searchParams?: Promise<{ session_id?: string }>;
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
  status: string;
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

export default async function LandingPageView({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : undefined;

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

    // Block registration before approval: if the underlying workshop is not in
    // an approved stage (PRE_EVENT / POST_EVENT / COMPLETED), render the clean
    // "not open" state INSTEAD of the customHtml / template / registration form.
    // HTTP 200, friendly message — not a 404.
    if (!isApprovedWorkshopStatus(landingPage.workshop.status)) {
      return <WorkshopNotOpenView status={landingPage.workshop.status} />;
    }

    // TEMPLATE-02: customHtml override. DOMPurify sanitized at save-time
    // (PATCH /api/page-templates/[id]); variables HTML-escaped + interpolated
    // at build-time (auto-build). Render is a trusted echo of the stored
    // already-sanitized + escaped string.
    if (landingPage.customHtml && landingPage.customHtml.trim().length > 0) {
      return (
        <div
          data-custom-html-render
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: landingPage.customHtml }}
        />
      );
    }

    const content = JSON.parse(landingPage.content);
    const workshop = landingPage.workshop;

    // Overlay live Workshop fields onto the frozen content snapshot so that
    // venue changes and Vimeo URLs are always current at render time.
    const mergedContent = {
      ...content,
      format: workshop.format ?? content.format ?? null,
      venueName: workshop.venueName ?? content.venueName ?? null,
      venueAddress:
        formatVenueAddress(workshop.venueAddress) || content.venueAddress || null,
      videoUrl: normalizeVideoUrl(content.videoUrl),
    };

    switch (landingPage.template) {
      case "BIO_PAGE":
        return <BioPageTemplate content={content as BioContent} isPreview={false} />;
      case "SOLO_LANDING":
        return <SoloLandingPageTemplate content={mergedContent as SoloContent} workshop={workshop} isPreview={false} />;
      case "DUO_LANDING":
        return <DuoLandingPageTemplate content={mergedContent as DuoContent} workshop={workshop} isPreview={false} />;
      case "REGISTRATION":
        return <RegistrationPageTemplate content={mergedContent} workshop={workshop} isPreview={false} />;
      case "THANK_YOU": {
        // CHG-03: when a paid registration just landed here (session_id in
        // the URL), resolve the registration + effective amount and render
        // the iDev pixel via <CustomCodeRenderer>.
        const renderer = await resolveCustomCodeRenderer({
          sessionId,
          workshopId: workshop.id,
          isFree: workshop.isFree ?? false,
          customCode: landingPage.customCode,
        });
        return (
          <>
            <ThankYouPageTemplate content={mergedContent} workshop={workshop} isPreview={false} />
            {renderer}
          </>
        );
      }
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

  // Same pre-approval guard on the no-landing-page fallback path: block the
  // default template + registration form until the workshop is approved.
  if (!isApprovedWorkshopStatus(workshop.status)) {
    return <WorkshopNotOpenView status={workshop.status} />;
  }

  return <DefaultWorkshopTemplate workshop={workshop} />;
}

/**
 * Clean, centered "not open" state shown when a workshop's landing page is
 * reached before the workshop has been approved for registration (or after it
 * was canceled). Returned with HTTP 200 — this is a friendly message, NOT a
 * 404. Approved workshops (PRE_EVENT / POST_EVENT / COMPLETED) never see this.
 */
function WorkshopNotOpenView({ status }: { status: string }) {
  const isCanceled = status === "CANCELED";
  const title = isCanceled ? "This workshop is no longer available." : "Registration isn't open yet";
  const subline = isCanceled
    ? "This workshop has been canceled."
    : "This workshop hasn't been approved for registration yet. Please check back soon.";

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-card rounded-xl shadow-sm border border-border p-8 text-center space-y-3">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Workshop</p>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{subline}</p>
      </div>
    </div>
  );
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
                {formatTimeWithZone(workshop.eventTime, workshop.eventDate, workshop.timezone)}
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

