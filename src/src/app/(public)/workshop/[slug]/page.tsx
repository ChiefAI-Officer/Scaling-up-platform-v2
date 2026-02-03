import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
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

  if (!landingPage) {
    return { title: "Page Not Found" };
  }

  const content = JSON.parse(landingPage.content);
  
  return {
    title: content.heroTitle || content.workshopTitle || landingPage.workshop.title,
    description: content.heroSubtitle || content.description || landingPage.workshop.description,
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

  if (!landingPage || landingPage.status !== "PUBLISHED") {
    notFound();
  }

  const content = JSON.parse(landingPage.content);
  const { workshop } = landingPage;

  // Render based on template type
  switch (landingPage.template) {
    case "BIO_PAGE":
      return <BioPageTemplate content={content} workshop={workshop} />;
    case "SOLO_LANDING":
      return <SoloLandingTemplate content={content} workshop={workshop} />;
    case "DUO_LANDING":
      return <DuoLandingTemplate content={content} workshop={workshop} />;
    case "REGISTRATION":
      return <RegistrationTemplate content={content} workshop={workshop} />;
    case "THANK_YOU":
      return <ThankYouTemplate content={content} workshop={workshop} />;
    default:
      notFound();
  }
}

// Bio Page Template Component
function BioPageTemplate({ content }: { content: Record<string, unknown>; workshop: Record<string, unknown> }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        {/* Logo */}
        <div className="text-purple-700 font-bold text-xl tracking-wider mb-12">
          SCALING UP COACHES
        </div>

        {/* Profile Image */}
        {content.profileImageUrl && (
          <img
            src={content.profileImageUrl as string}
            alt={content.coachName as string}
            className="w-40 h-40 rounded-full object-cover mx-auto mb-6 border-4 border-purple-100"
          />
        )}

        {/* Name & Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {String(content.coachName || "")}
        </h1>
        <p className="text-gray-600 mb-8">
          {String(content.coachTitle || "")}
        </p>

        {/* Biography */}
        <div className="text-left text-gray-700 space-y-4 mb-10">
          {(content.biography as string)?.split("\n\n").map((para: string, i: number) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        {/* CTA Button */}
        {content.ctaButtonUrl && (
          <a
            href={String(content.ctaButtonUrl)}
            className="inline-block bg-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:bg-purple-700 transition"
          >
            {String(content.ctaButtonText || "Book a Call")}
          </a>
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t text-gray-500 text-sm">
          © {new Date().getFullYear()} Scaling Up Coach {String(content.coachName || "").split(" ")[0]}
        </div>
      </div>
    </div>
  );
}

// Solo Landing Template Component
function SoloLandingTemplate({ content, workshop }: { content: Record<string, unknown>; workshop: Record<string, unknown> }) {
  const benefits = (content.benefits as string[]) || [];
  
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-purple-700 to-purple-900 text-white py-16 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="bg-orange-500 text-sm px-4 py-1 rounded-full uppercase font-semibold">
              Scaling Up
            </span>
            <h1 className="text-4xl font-bold mt-4 mb-3">
              {String(content.heroTitle || "")}
            </h1>
            <p className="text-purple-200 text-lg mb-6">{String(content.heroSubtitle || "")}</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span>📅</span>
                <span>{String(content.eventDay || "")}, {String(content.eventDate || "")}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>⏰</span>
                <span>{String(content.eventTime || "")} {String(content.eventTimezone || "")}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>📍</span>
                <span>Virtual Workshop</span>
              </div>
            </div>
          </div>
          <div className="text-center">
            {content.coachPhoto && (
              <img
                src={content.coachPhoto as string}
                alt={content.coachName as string}
                className="w-40 h-40 rounded-full object-cover mx-auto mb-4 border-4 border-white"
              />
            )}
            <div className="text-xl font-bold">{String(content.coachName || "")}</div>
            <div className="text-purple-200">{String(content.coachTitle || "")}</div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto py-16 px-4 grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2">
          <h2 className="text-3xl font-bold mb-6">Join us for the {String(content.heroTitle || "")}</h2>
          <p className="text-gray-600 mb-8">{String(content.aboutDescription || "")}</p>

          {content.videoUrl && (
            <div className="mb-8 rounded-xl overflow-hidden shadow-lg">
              <iframe
                src={content.videoUrl as string}
                className="w-full aspect-video"
                allowFullScreen
              />
            </div>
          )}

          <h3 className="text-xl font-bold text-purple-700 mb-4">What You&apos;ll Learn</h3>
          <ul className="space-y-3">
            {benefits.map((benefit: string, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-blue-500 font-bold">✓</span>
                <span className="text-gray-700">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Registration Card */}
        <div className="md:sticky md:top-8">
          <div className="bg-white border rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
              <h3 className="font-semibold uppercase text-sm">Register Now</h3>
            </div>
            <div className="p-6">
              <div className="bg-blue-600 text-white inline-block px-4 py-2 rounded mb-4 font-semibold">
                {content.eventDate as string}
              </div>
              <p className="font-semibold mb-2">
                {content.heroTitle as string} with {content.coachName as string}
              </p>
              <p className="text-2xl font-bold text-purple-700 mb-6">
                {(workshop as { isFree?: boolean }).isFree ? "Free" : "$299"}
              </p>
              <a
                href={content.registrationUrl as string}
                className="block w-full bg-blue-600 text-white text-center py-4 rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                {content.ctaText as string}
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* CTA Banner */}
      <section className="bg-gray-100 py-12 px-4 text-center">
        <p className="max-w-2xl mx-auto text-gray-600 italic">
          <strong>Secure your spot today</strong> and take the next step toward building a stronger, more valuable business — one that gives you the freedom to finish strong, on your terms.
        </p>
      </section>
    </div>
  );
}

// Duo Landing Template Component
function DuoLandingTemplate({ content, workshop }: { content: Record<string, unknown>; workshop: Record<string, unknown> }) {
  const coach1 = content.coach1 as { name: string; photo: string; title: string } || {};
  const coach2 = content.coach2 as { name: string; photo: string; title: string } || {};
  const whatItIs = (content.whatItIs as string[]) || [];
  const whatItIsNot = (content.whatItIsNot as string[]) || [];
  const whoIsFor = (content.whoIsFor as string[]) || [];
  const whoShouldSkip = (content.whoShouldSkip as string[]) || [];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-purple-700 via-purple-600 to-blue-600 text-white py-16 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-5 gap-8 items-center">
          <div className="md:col-span-3">
            <span className="bg-white/20 text-sm px-4 py-1 rounded-full">Scaling Up</span>
            <h1 className="text-4xl font-bold mt-4 mb-3">{String(content.heroTitle || "")}</h1>
            <p className="text-purple-200 text-lg mb-6">{String(content.subtitle || "")}</p>
            <div className="space-y-2">
              <div>📅 {String(content.eventDate || "")}</div>
              <div>⏰ {String(content.eventTime || "")}</div>
              <div>📍 Live Virtual Event</div>
            </div>
          </div>
          <div className="md:col-span-2 flex gap-6 justify-center">
            {[coach1, coach2].map((coach, i) => (
              <div key={i} className="text-center">
                {coach.photo ? (
                  <img src={coach.photo} alt={coach.name} className="w-24 h-24 rounded-full object-cover mx-auto mb-2 border-4 border-white" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-purple-500 mx-auto mb-2" />
                )}
                <div className="font-medium">{String(coach.name || "")}</div>
                <div className="text-purple-200 text-sm">{String(coach.title || "")}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto py-16 px-4">
        <p className="text-gray-600 text-lg mb-12">{String(content.description || "")}</p>

        {/* What It Is / Isn't */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h3 className="font-bold text-green-700 mb-4">What This Workshop Is ✓</h3>
            <ul className="space-y-2">
              {whatItIs.map((item: string, i: number) => (
                <li key={i} className="flex items-center gap-2 text-gray-700">
                  <span className="text-green-500">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-red-700 mb-4">What This Workshop Is Not ✗</h3>
            <ul className="space-y-2">
              {whatItIsNot.map((item: string, i: number) => (
                <li key={i} className="flex items-center gap-2 text-gray-700">
                  <span className="text-red-500">✗</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Who For / Skip */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="font-bold mb-4">Who This Workshop Is For</h3>
            <ul className="space-y-2">
              {whoIsFor.map((item: string, i: number) => (
                <li key={i} className="text-gray-700">• {item}</li>
              ))}
            </ul>
          </div>
          <div className="bg-red-50 p-6 rounded-lg">
            <h3 className="font-bold mb-4">Who Should Skip This</h3>
            <ul className="space-y-2">
              {whoShouldSkip.map((item: string, i: number) => (
                <li key={i} className="text-gray-700">• {item}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Why Now */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-8 rounded-xl text-center mb-12">
          <h3 className="text-xl font-bold mb-4">Why This Matters Now</h3>
          <p className="text-purple-100">{String(content.whyNow || "")}</p>
        </div>

        {/* CTA */}
        <div className="text-center py-8">
          <a
            href={String(content.registrationUrl || "#")}
            className="inline-block bg-blue-600 text-white px-12 py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition"
          >
            {String(content.ctaText || "Register")}
          </a>
          <p className="text-gray-500 mt-3">
            {(workshop as { isFree?: boolean }).isFree ? "Free" : "$299"}
          </p>
        </div>
      </main>

      <footer className="text-center py-8 text-gray-500">
        © {new Date().getFullYear()} Scaling Up. All rights reserved.
      </footer>
    </div>
  );
}

// Registration Template Component
function RegistrationTemplate({ content, workshop }: { content: Record<string, unknown>; workshop: { id: string } }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left - Hero */}
      <div className="bg-gradient-to-br from-purple-700 to-blue-600 text-white p-12 flex flex-col justify-center">
        <div className="bg-purple-600/50 rounded-xl p-6 mb-8">
          <div className="flex items-center gap-4 mb-4">
            {content.coachPhoto && (
              <img
                src={content.coachPhoto as string}
                alt={content.coachName as string}
                className="w-16 h-16 rounded-full object-cover border-2 border-white"
              />
            )}
            <div>
              <div className="font-semibold">{String(content.coachName || "")}</div>
              <div className="text-purple-200 text-sm">{String(content.coachTitle || "")}</div>
            </div>
          </div>
          <div className="space-y-1 text-purple-200 text-sm">
            <div>📅 {String(content.eventDate || "")}</div>
            <div>⏰ {String(content.eventTime || "")}</div>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold mb-4">{String(content.heroHeadline || "")}</h1>
        <p className="text-purple-200">{String(content.heroDescription || "")}</p>
      </div>

      {/* Right - Form */}
      <div className="bg-white p-12 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="border rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
              <div className="font-semibold">{String(content.workshopTitle || "")}</div>
              <div className="text-purple-200 text-sm">with {String(content.coachName || "")}</div>
            </div>

            <form className="p-6 space-y-4" action={`/api/workshops/${workshop.id}/register`} method="POST">
              <div>
                <input
                  type="email"
                  name="email"
                  placeholder={String(content.emailPlaceholder || "Email")}
                  required
                  className="w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input type="checkbox" name="optIn" defaultChecked className="mt-1 rounded" />
                <span>{String(content.optInText || "")}</span>
              </label>

              <div>
                <input
                  type="text"
                  name="fullName"
                  placeholder={String(content.namePlaceholder || "Full name")}
                  required
                  className="w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-2">Additional information</div>
                <input
                  type="text"
                  name="company"
                  placeholder={String(content.companyPlaceholder || "Company")}
                  className="w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                {String(content.submitButtonText || "Register")}
              </button>

              <p className="text-center text-gray-400 text-xs">
                {String(content.privacyText || "")}
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// Thank You Template Component
function ThankYouTemplate({ content }: { content: Record<string, unknown>; workshop: Record<string, unknown> }) {
  return (
    <div 
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #6B21A8 0%, #7C3AED 50%, #6B21A8 100%)" }}
    >
      <div className="text-white text-center px-4 max-w-2xl">
        {/* Logo */}
        <div className="font-bold text-2xl tracking-wider mb-12">
          SCALING UP
        </div>

        {/* Headline */}
        <h1 className="text-3xl font-serif mb-2">
          {String(content.headline || "")}
        </h1>
        <h2 className="text-2xl font-serif font-bold mb-6">
          {String(content.workshopTitle || "")} Workshop
        </h2>

        {/* Sub-headline */}
        <p className="text-purple-200 italic mb-10">
          {String(content.subheadline || "")}
        </p>

        {/* Video */}
        {content.videoUrl && (
          <div className="mb-10">
            <div className="border-4 border-white rounded-lg overflow-hidden max-w-lg mx-auto">
              <iframe
                src={String(content.videoUrl)}
                className="w-full aspect-video"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Additional Message */}
        {content.additionalMessage && (
          <p className="text-purple-200 mb-8">
            {String(content.additionalMessage)}
          </p>
        )}

        {/* Calendar Reminder */}
        <p className="text-purple-200 text-sm mb-4">
          {String(content.calendarReminderText || "")}
        </p>

        <div className="flex gap-3 justify-center">
          <button className="bg-white/20 text-white px-4 py-2 rounded hover:bg-white/30 transition">
            Add to Google Calendar
          </button>
          <button className="bg-white/20 text-white px-4 py-2 rounded hover:bg-white/30 transition">
            Add to Outlook
          </button>
        </div>
      </div>
    </div>
  );
}
