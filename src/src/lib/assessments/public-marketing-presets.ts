import { createMarketingCtaPreset } from "@/lib/assessments/marketing-cta";
import { prepareMarketingCtaForStorage } from "@/lib/assessments/marketing-cta-compiler";

const SUNHUB_SCORE_BANDS = [
  {
    min: 0,
    max: 24,
    label: "0–24%",
    headline: "Ouch! It’s been tough to scale easily. We can help.",
    body: "If action followed knowledge, we’d all have six packs.",
  },
  {
    min: 25,
    max: 49,
    label: "25–49%",
    headline: "Good start. Though wondering if there is an easier way to scale.",
    body: "Believe you can and you’re halfway there.",
  },
  {
    min: 50,
    max: 74,
    label: "50–74%",
    headline: "You’re close. With a little more finesse you can nail the scale.",
    body: "Professionals do it all; amateurs only do the fun parts.",
  },
  {
    min: 75,
    max: 100,
    label: "75–100%",
    headline: "You rock (or fib!). You’re ready. Keep moving; grab profit share!",
    body: "If everything seems in control, you’re just not going fast enough.",
  },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function build(
  base: unknown,
  preset: "FULL_MARKETING" | "SCALING_UP_QUICK",
  scoreBands?: typeof SUNHUB_SCORE_BANDS,
): unknown {
  const root = asRecord(base);
  const publicMarketing = asRecord(root.publicMarketing);
  const raw = {
    ...root,
    publicMarketing: {
      ...publicMarketing,
      ...(scoreBands ? { scoreBands: scoreBands.map((band) => ({ ...band })) } : {}),
      marketingCta: createMarketingCtaPreset(preset),
    },
  };
  const prepared = prepareMarketingCtaForStorage(raw);
  if (!prepared.ok) {
    throw new Error(`Could not build ${preset} Marketing CTA`);
  }
  return prepared.reportConfig;
}

export function buildScalingUpQuickSuccessorReportConfig(base: unknown): unknown {
  return build(base, "SCALING_UP_QUICK");
}

export function buildSunHubSuccessorReportConfig(base: unknown): unknown {
  return build(base, "FULL_MARKETING", SUNHUB_SCORE_BANDS);
}

export { SUNHUB_SCORE_BANDS };
