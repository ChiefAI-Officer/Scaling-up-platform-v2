/**
 * Assessment v7.6 — PUBLIC quiz thank-you page.
 *
 * Generic confirmation shown after a successful PUBLIC submission. We do not
 * surface the score here for the MVP — auto-emailing results to respondents
 * (D3 policy) is deferred; results are delivered by the facilitator/coach.
 */

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false, follow: false },
};

export default function PublicQuizThankYouPage() {
  // WF16-invited / WF19 / WF Rev08 — thank-you hero card
  return (
    <div className="ty-page">
      <header className="ty-header">
        <span className="ty-brand">Scaling Up</span>
        <span>Submission received</span>
      </header>
      <main className="ty-body">
        <section className="ty-card" aria-labelledby="ty-title">
          <span className="hero-eyebrow">All done</span>
          <h1 className="ty-title" id="ty-title">
            Thank you!
          </h1>
          <p className="ty-lede">Your responses have been recorded.</p>
          <p className="ty-sub">
            Thanks for completing the assessment — your responses have been
            recorded. Your facilitator will follow up with the results.
          </p>
        </section>
      </main>
      <footer className="ty-footer">Powered by Scaling Up</footer>
    </div>
  );
}
