/**
 * Assessment v7.6 — INVITED-mode survey page shell (Task D).
 *
 * Server component shell with no-store + no-referrer headers, delegating
 * the interactive flow (token exchange, form render, submit) to the
 * client component. The page reads no data server-side; everything goes
 * through the per-route handlers that already enforce lifecycle gates.
 */
import type { Metadata } from "next";
import { OrgSurveyClient } from "@/components/assessments/org-survey-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Assessment Survey",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  other: {
    "Cache-Control": "no-store",
  },
};

export default async function OrgSurveyPage({
  params,
}: {
  params: Promise<{ campaignAlias: string }>;
}) {
  const { campaignAlias } = await params;
  return <OrgSurveyClient campaignAlias={campaignAlias} />;
}
