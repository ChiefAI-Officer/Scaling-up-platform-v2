import { z } from "zod";

import { loadSafeMarketingCta } from "@/lib/assessments/marketing-cta-compiler";
import type { MarketingCtaConfigV1 } from "@/lib/assessments/marketing-cta";

export const publicMarketingScoreBandSchema = z.object({
  min: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  label: z.string().min(1).max(100),
  headline: z.string().min(1).max(300),
  body: z.string().max(1000),
});

export type PublicMarketingScoreBand = z.infer<
  typeof publicMarketingScoreBandSchema
>;

export interface PublicMarketingResultConfig {
  scoreBands: PublicMarketingScoreBand[];
  marketingCta: MarketingCtaConfigV1;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function loadPublicMarketingResultConfig(
  reportConfig: unknown,
): PublicMarketingResultConfig | null {
  const cta = loadSafeMarketingCta(reportConfig);
  if (!cta) return null;
  const publicMarketing = asRecord(asRecord(reportConfig).publicMarketing);
  const bands = z.array(publicMarketingScoreBandSchema).max(12).safeParse(
    publicMarketing.scoreBands ?? [],
  );
  if (!bands.success) return null;
  return { scoreBands: bands.data, marketingCta: cta };
}
