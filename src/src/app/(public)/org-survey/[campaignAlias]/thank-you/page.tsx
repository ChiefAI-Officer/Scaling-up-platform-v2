/**
 * Assessment v7.6 — INVITED-mode thank-you page (Task D).
 *
 * Intentionally minimal. v1 ships without "results emailed back" copy —
 * gated on Jeff sign-off + INVITED_RESULTS_EMAIL_COPY_APPROVED content flag.
 */
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
  return (
    <main className="max-w-xl mx-auto px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold text-slate-900 mb-3">
        Thank you for completing the survey.
      </h1>
      <p className="text-slate-700">
        Your coach will follow up with the results.
      </p>
    </main>
  );
}
