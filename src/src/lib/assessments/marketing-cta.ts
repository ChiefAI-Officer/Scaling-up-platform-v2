import { z } from "zod";

import { SCALING_UP_QUICK_PUBLIC_CAMPAIGN } from "@/lib/assessments/public-assessment-destinations";

export type MarketingCtaPresetOrigin =
  | "FULL_MARKETING"
  | "SCALING_UP_QUICK"
  | "BLANK";

export type LinkTarget =
  | { kind: "url"; href: string }
  | { kind: "mailto"; address: string }
  | { kind: "tel"; number: string }
  | { kind: "referringCoachOrDirectory" };

export type MarketingCtaBlock =
  | {
      id: string;
      type: "text";
      lead: string;
      body: string;
      align: "left" | "center";
    }
  | {
      id: string;
      type: "image";
      src: string;
      alt: string;
      link?: LinkTarget;
      width: "small" | "medium" | "large";
    }
  | {
      id: string;
      type: "button";
      label: string;
      target: LinkTarget;
      newTab: boolean;
      style: "primary" | "secondary";
    }
  | { id: string; type: "divider" };

export interface MarketingCtaConfigV1 {
  schemaVersion: 1;
  presetOrigin: MarketingCtaPresetOrigin;
  blocks: MarketingCtaBlock[];
  sanitizedHtml: string;
}

export interface MarketingCtaIssue {
  code:
    | "CTA_PRESET_REQUIRED"
    | "CTA_ACTION_REQUIRED"
    | "CTA_INVALID_DESTINATION"
    | "CTA_IMAGE_ALT_REQUIRED"
    | "CTA_UNSAFE_CONTENT";
  path: (string | number)[];
  message: string;
}

export const linkTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), href: z.string().max(2048) }).strict(),
  z
    .object({ kind: z.literal("mailto"), address: z.string().max(320) })
    .strict(),
  z.object({ kind: z.literal("tel"), number: z.string().max(64) }).strict(),
  z.object({ kind: z.literal("referringCoachOrDirectory") }).strict(),
]);

export const marketingCtaBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: z.string().min(1).max(120),
      type: z.literal("text"),
      lead: z.string().max(500),
      body: z.string().max(4000),
      align: z.enum(["left", "center"]),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(120),
      type: z.literal("image"),
      src: z.string().min(1).max(2048),
      alt: z.string().max(500),
      link: linkTargetSchema.optional(),
      width: z.enum(["small", "medium", "large"]),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(120),
      type: z.literal("button"),
      label: z.string().max(500),
      target: linkTargetSchema,
      newTab: z.boolean(),
      style: z.enum(["primary", "secondary"]),
    })
    .strict(),
  z
    .object({ id: z.string().min(1).max(120), type: z.literal("divider") })
    .strict(),
]);

export const marketingCtaConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    presetOrigin: z.enum(["FULL_MARKETING", "SCALING_UP_QUICK", "BLANK"]),
    blocks: z.array(marketingCtaBlockSchema).max(40),
    sanitizedHtml: z.string().max(100_000),
  })
  .strict();

export const publicMarketingReportConfigSchema = z
  .object({ marketingCta: marketingCtaConfigSchema.optional().nullable() })
  .passthrough();

const FULL_DESTINATIONS = {
  assessment: SCALING_UP_QUICK_PUBLIC_CAMPAIGN.href,
  followup:
    "https://coaches.scalingup.com/coach-match-after-assessment-form",
  books: "https://scalingup.com/book/",
} as const;

const FULL_BLOCKS: MarketingCtaBlock[] = [
  {
    id: "full-next-step",
    type: "text",
    lead: "Next step",
    body: "Take the comprehensive 32-question assessment or start with the Scaling Up books.",
    align: "left",
  },
  {
    id: "full-books-image",
    type: "image",
    src: "/brand/scaling-up-books.png",
    alt: "Mastering the Rockefeller Habits and Scaling Up books",
    width: "large",
  },
  {
    id: "full-assessment-button",
    type: "button",
    label: "Take the 32-question assessment",
    target: { kind: "url", href: FULL_DESTINATIONS.assessment },
    newTab: true,
    style: "primary",
  },
  {
    id: "full-followup-copy",
    type: "text",
    lead: "",
    body: "Or schedule a complimentary one-hour debrief with a Scaling Up coaching partner.",
    align: "left",
  },
  {
    id: "full-followup-button",
    type: "button",
    label: "Request a complimentary follow-up",
    target: { kind: "url", href: FULL_DESTINATIONS.followup },
    newTab: true,
    style: "primary",
  },
  {
    id: "full-books-button",
    type: "button",
    label: "Buy the books",
    target: { kind: "url", href: FULL_DESTINATIONS.books },
    newTab: true,
    style: "primary",
  },
];

const QUICK_BLOCKS: MarketingCtaBlock[] = [
  {
    id: "quick-resources-button",
    type: "button",
    label: "Explore Scaling Up resources",
    target: { kind: "url", href: "https://scalingup.com" },
    newTab: true,
    style: "primary",
  },
  {
    id: "quick-coach-button",
    type: "button",
    label: "Talk to a coach",
    target: { kind: "referringCoachOrDirectory" },
    newTab: true,
    style: "secondary",
  },
];

function cloneBlocks(blocks: MarketingCtaBlock[]): MarketingCtaBlock[] {
  return blocks.map((block) => {
    if (block.type === "button") {
      return { ...block, target: { ...block.target } };
    }
    if (block.type === "image") {
      return {
        ...block,
        ...(block.link ? { link: { ...block.link } } : {}),
      };
    }
    return { ...block };
  });
}

export function createMarketingCtaPreset(
  origin: MarketingCtaPresetOrigin,
): MarketingCtaConfigV1 {
  const blocks =
    origin === "FULL_MARKETING"
      ? FULL_BLOCKS
      : origin === "SCALING_UP_QUICK"
        ? QUICK_BLOCKS
        : [];
  return {
    schemaVersion: 1,
    presetOrigin: origin,
    blocks: cloneBlocks(blocks),
    sanitizedHtml: "",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function extractMarketingCta(
  reportConfig: unknown,
): MarketingCtaConfigV1 | null {
  const publicMarketing = asRecord(asRecord(reportConfig).publicMarketing);
  const parsed = marketingCtaConfigSchema.safeParse(publicMarketing.marketingCta);
  return parsed.success ? parsed.data : null;
}

export function mergeMarketingCta(
  reportConfig: unknown,
  cta: MarketingCtaConfigV1 | null,
): unknown {
  const root = asRecord(reportConfig);
  const publicMarketing = asRecord(root.publicMarketing);
  return {
    ...root,
    publicMarketing: {
      ...publicMarketing,
      marketingCta: cta,
    },
  };
}

export function isValidLinkTarget(target: LinkTarget): boolean {
  if (target.kind === "referringCoachOrDirectory") return true;
  if (target.kind === "url") {
    try {
      const parsed = new URL(target.href);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }
  if (target.kind === "mailto") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.address);
  }
  return /^\+?[0-9().\s-]{5,32}$/.test(target.number);
}

function validImageSource(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const parsed = new URL(src);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function getMarketingCtaStructuralIssues(
  input: unknown,
): MarketingCtaIssue[] {
  const parsed = marketingCtaConfigSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: "CTA_UNSAFE_CONTENT" as const,
      path: issue.path.map(String),
      message: issue.message,
    }));
  }
  const issues: MarketingCtaIssue[] = [];
  parsed.data.blocks.forEach((block, index) => {
    if (block.type === "button" && !isValidLinkTarget(block.target)) {
      issues.push({
        code: "CTA_INVALID_DESTINATION",
        path: ["blocks", index, "target"],
        message: "Use HTTPS, a valid email address, a valid phone number, or the referring coach option.",
      });
    }
    if (block.type === "image") {
      if (!block.alt.trim()) {
        issues.push({
          code: "CTA_IMAGE_ALT_REQUIRED",
          path: ["blocks", index, "alt"],
          message: "Describe this image for people using assistive technology.",
        });
      }
      if (!validImageSource(block.src)) {
        issues.push({
          code: "CTA_INVALID_DESTINATION",
          path: ["blocks", index, "src"],
          message: "Use a managed image path or an HTTPS image URL.",
        });
      }
      if (block.link && !isValidLinkTarget(block.link)) {
        issues.push({
          code: "CTA_INVALID_DESTINATION",
          path: ["blocks", index, "link"],
          message: "Use a safe destination for this image.",
        });
      }
    }
  });
  return issues;
}

export function getMarketingCtaPublishIssues(
  cta: MarketingCtaConfigV1 | null,
): MarketingCtaIssue[] {
  if (!cta) {
    return [
      {
        code: "CTA_PRESET_REQUIRED",
        path: ["publicMarketing", "marketingCta"],
        message: "Choose a Marketing CTA preset before publishing.",
      },
    ];
  }
  const issues = getMarketingCtaStructuralIssues(cta);
  if (!cta.blocks.some((block) => block.type === "button")) {
    issues.push({
      code: "CTA_ACTION_REQUIRED",
      path: ["blocks"],
      message: "Add at least one button before publishing.",
    });
  }
  return issues;
}
