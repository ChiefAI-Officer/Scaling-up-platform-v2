const CANONICAL_PUBLIC_APP_ORIGIN =
  "https://scaling-up-platform-v2.vercel.app";

const templateAlias = "scaling-up-quick";
const campaignAlias = "scaling_up_quick_pub_260610041810";

/**
 * Read-only verified ACTIVE PUBLIC campaign for the 32-question Four Decisions
 * assessment. Keep the campaign identity and derived destination together so
 * shipped CTA surfaces cannot drift to different assessment links.
 */
export const SCALING_UP_QUICK_PUBLIC_CAMPAIGN = Object.freeze({
  templateAlias,
  campaignAlias,
  href: new URL(
    `/quiz/${encodeURIComponent(campaignAlias)}`,
    CANONICAL_PUBLIC_APP_ORIGIN,
  ).toString(),
});
