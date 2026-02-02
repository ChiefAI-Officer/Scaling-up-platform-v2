export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate, formatCurrency, parseJsonField, VenueAddress } from "@/lib/utils";
import { RegistrationForm } from "./registration-form";

interface WorkshopPageProps {
  params: Promise<{ slug: string }>;
}

export default async function WorkshopPage({ params }: WorkshopPageProps) {
  const { slug } = await params;

  const workshop = await db.workshop.findUnique({
    where: { landingPageSlug: slug },
    include: {
      coach: true,
      workshopType: true,
      _count: {
        select: { registrations: true },
      },
    },
  });

  if (!workshop) {
    notFound();
  }

  const isRegistrationOpen = ["REGISTRATION_OPEN", "MARKETING_ACTIVE"].includes(
    workshop.status
  );
  const spotsRemaining = workshop.maxAttendees - workshop._count.registrations;
  const isEarlyBird =
    workshop.earlyBirdDeadline && new Date() < workshop.earlyBirdDeadline;
  const currentPrice = isEarlyBird
    ? workshop.earlyBirdPriceCents
    : workshop.priceCents;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="mb-4">
            <span className="inline-block bg-white/20 rounded-full px-4 py-1 text-sm font-medium">
              {workshop.workshopType.name}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {workshop.title}
          </h1>
          <p className="text-xl text-blue-100 mb-8">
            Hosted by {workshop.coach.firstName} {workshop.coach.lastName}
            {workshop.coach.company && ` • ${workshop.coach.company}`}
          </p>

          <div className="flex flex-wrap gap-6 text-lg">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>{formatDate(workshop.eventDate)}</span>
            </div>
            {workshop.eventTime && (
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{workshop.eventTime}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>
                {workshop.format === "VIRTUAL"
                  ? "Virtual Event"
                  : workshop.venueName || "In-Person Event"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-8">
            {workshop.description && (
              <section>
                <h2 className="text-2xl font-bold mb-4">About This Workshop</h2>
                <div className="prose prose-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {workshop.description}
                  </p>
                </div>
              </section>
            )}

            {workshop.workshopType.description && (
              <section>
                <h2 className="text-2xl font-bold mb-4">What You&apos;ll Learn</h2>
                <div className="prose prose-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {workshop.workshopType.description}
                  </p>
                </div>
              </section>
            )}

            {workshop.format !== "VIRTUAL" && workshop.venueAddress && (() => {
              const address = parseJsonField<VenueAddress>(workshop.venueAddress);
              return (
                <section>
                  <h2 className="text-2xl font-bold mb-4">Location</h2>
                  <div className="bg-white rounded-lg border p-6">
                    <p className="font-semibold">{workshop.venueName}</p>
                    {address && (
                      <p className="text-gray-600">
                        {address.street && <>{address.street}<br /></>}
                        {address.city}, {address.state} {address.zip}
                      </p>
                    )}
                    {workshop.parkingInstructions && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm font-medium text-gray-900">
                          Parking Information
                        </p>
                        <p className="text-sm text-gray-600">
                          {workshop.parkingInstructions}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              );
            })()}

            {workshop.workshopType.preWorkshopInstructions && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Before You Arrive</h2>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <p className="text-gray-700">
                    {workshop.workshopType.preWorkshopInstructions}
                  </p>
                </div>
              </section>
            )}

            {/* Coach Bio */}
            {workshop.coach.bio && (
              <section>
                <h2 className="text-2xl font-bold mb-4">About Your Facilitator</h2>
                <div className="bg-white rounded-lg border p-6 flex gap-6">
                  <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl font-bold text-blue-600">
                      {workshop.coach.firstName[0]}
                      {workshop.coach.lastName[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-lg">
                      {workshop.coach.firstName} {workshop.coach.lastName}
                    </p>
                    {workshop.coach.company && (
                      <p className="text-gray-600">{workshop.coach.company}</p>
                    )}
                    <p className="mt-2 text-gray-700">{workshop.coach.bio}</p>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Registration Sidebar */}
          <div className="md:col-span-1">
            <div className="sticky top-8">
              <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
                <div className="p-6">
                  {/* Price */}
                  <div className="mb-6">
                    {workshop.isFree ? (
                      <p className="text-3xl font-bold text-green-600">Free</p>
                    ) : (
                      <div>
                        <p className="text-3xl font-bold">
                          {formatCurrency(currentPrice || 0)}
                        </p>
                        {isEarlyBird && workshop.earlyBirdDeadline && (
                          <p className="text-sm text-green-600 font-medium">
                            Early bird price until{" "}
                            {formatDate(workshop.earlyBirdDeadline)}
                          </p>
                        )}
                        {!isEarlyBird &&
                          workshop.earlyBirdPriceCents &&
                          workshop.priceCents && (
                            <p className="text-sm text-gray-500 line-through">
                              Was {formatCurrency(workshop.earlyBirdPriceCents)}
                            </p>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Spots */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          spotsRemaining > 10
                            ? "bg-green-500"
                            : spotsRemaining > 0
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                      />
                      <span className="text-gray-600">
                        {spotsRemaining > 0
                          ? `${spotsRemaining} spots remaining`
                          : "Sold out"}
                      </span>
                    </div>
                  </div>

                  {/* Registration Form or Status */}
                  {isRegistrationOpen && spotsRemaining > 0 ? (
                    <RegistrationForm
                      workshopId={workshop.id}
                      isFree={workshop.isFree}
                    />
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-gray-500">
                        {spotsRemaining <= 0
                          ? "This workshop is sold out"
                          : "Registration is not currently open"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
