import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, parseJsonField, VenueAddress } from "@/lib/utils";

interface SuccessPageProps {
  searchParams: Promise<{ id?: string; session_id?: string }>;
}

async function SuccessContent({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const { id, session_id } = params;

  let registration = null;

  if (id) {
    registration = await db.registration.findUnique({
      where: { id },
      include: {
        workshop: {
          include: {
            workshopType: true,
            coach: true,
          },
        },
      },
    });
  } else if (session_id) {
    registration = await db.registration.findFirst({
      where: { stripeSessionId: session_id },
      include: {
        workshop: {
          include: {
            workshopType: true,
            coach: true,
          },
        },
      },
    });
  }

  if (!registration) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Registration Not Found
          </h1>
          <p className="text-gray-600 mb-6">
            We couldn&apos;t find your registration. Please check your email for
            confirmation.
          </p>
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Success Header */}
          <div className="bg-green-500 px-6 py-8 text-white text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Registration Confirmed!</h1>
            <p className="mt-2 text-green-100">
              You&apos;re all set for the workshop
            </p>
          </div>

          {/* Details */}
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {registration.workshop.title}
              </h2>
              <p className="text-gray-600">
                {registration.workshop.workshopType.name}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Date</p>
                <p className="text-gray-900">
                  {formatDate(registration.workshop.eventDate)}
                </p>
              </div>
              {registration.workshop.eventTime && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Time</p>
                  <p className="text-gray-900">
                    {registration.workshop.eventTime}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-500">Format</p>
                <p className="text-gray-900">
                  {registration.workshop.format === "VIRTUAL"
                    ? "Virtual"
                    : "In-Person"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Facilitator</p>
                <p className="text-gray-900">
                  {registration.workshop.coach.firstName}{" "}
                  {registration.workshop.coach.lastName}
                </p>
              </div>
            </div>

            {registration.workshop.format !== "VIRTUAL" &&
              registration.workshop.venueName && (() => {
                const address = parseJsonField<VenueAddress>(registration.workshop.venueAddress);
                return (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-500 mb-1">
                      Location
                    </p>
                    <p className="font-medium text-gray-900">
                      {registration.workshop.venueName}
                    </p>
                    {address && (
                      <p className="text-gray-600 text-sm">
                        {address.street && (
                          <>
                            {address.street}
                            <br />
                          </>
                        )}
                        {address.city}, {address.state} {address.zip}
                      </p>
                    )}
                  </div>
                );
              })()}

            <div className="border-t pt-6">
              <h3 className="font-semibold text-gray-900 mb-2">
                What&apos;s Next?
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-green-500 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span>
                    Check your email ({registration.email}) for confirmation and
                    additional details
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-green-500 mt-0.5"
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
                  <span>Add this event to your calendar</span>
                </li>
                {registration.workshop.workshopType.preWorkshopInstructions && (
                  <li className="flex items-start gap-2">
                    <svg
                      className="w-5 h-5 text-green-500 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    <span>
                      {registration.workshop.workshopType.preWorkshopInstructions}
                    </span>
                  </li>
                )}
              </ul>
            </div>

            <div className="text-center pt-4">
              <Link
                href="/"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Return to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage(props: SuccessPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <SuccessContent {...props} />
    </Suspense>
  );
}
