/**
 * Assessment v7.6 — PUBLIC quiz thank-you page.
 *
 * Generic confirmation shown after a successful PUBLIC submission. We do not
 * surface the score here for the MVP — public results delivery via a
 * resultsToken email is a follow-on slice.
 */

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false, follow: false },
};

export default function PublicQuizThankYouPage() {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
          <h1 className="text-2xl font-bold text-foreground">Thanks — we got it.</h1>
          <p className="text-sm text-muted-foreground">
            Your responses have been recorded. We&apos;ll send your results to
            the email you provided.
          </p>
        </div>
      </div>
    </div>
  );
}
