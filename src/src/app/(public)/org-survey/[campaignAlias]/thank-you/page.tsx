/**
 * Assessment v7.6 — INVITED-mode thank-you page (Task D).
 *
 * Wave D Task 6b: adaptive copy based on `?results=1` query param.
 * The org-survey-client appends `?results=1` when the campaign has
 * `sendResultsToRespondent=true` so the respondent sees confirming copy.
 * When the param is absent (or not "1"), the default "coach will review"
 * copy is shown.
 */
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false, follow: false },
};

export default async function ThankYouPage({
  searchParams,
}: {
  params?: Promise<{ campaignAlias: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const resultsEmailSent = sp["results"] === "1";

  return (
    <main className="max-w-xl mx-auto px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold text-slate-900 mb-3">
        Thank you for completing the survey.
      </h1>
      <p className="text-slate-700">
        {resultsEmailSent
          ? "We are sending you your results."
          : "Thank you — your coach will review your results with you."}
      </p>
    </main>
  );
}
