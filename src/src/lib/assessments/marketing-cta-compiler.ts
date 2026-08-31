import sanitizeHtml from "sanitize-html";

import {
  getMarketingCtaStructuralIssues,
  marketingCtaConfigSchema,
  mergeMarketingCta,
  type LinkTarget,
  type MarketingCtaConfigV1,
  type MarketingCtaIssue,
} from "@/lib/assessments/marketing-cta";
import { TALK_TO_A_COACH_URL } from "@/lib/assessments/talk-to-a-coach";

const LEGACY_TALK_TO_A_COACH_URL = "https://scalingup.com/coaches";

function escapeText(value: string): string {
  return value
    .replace(/\bon[a-z]+\s*=/gi, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compileTarget(target: LinkTarget, talkToCoachUrl: string): {
  href: string;
  dynamicAttribute?: string;
} {
  if (target.kind === "referringCoachOrDirectory") {
    return {
      href: talkToCoachUrl,
      dynamicAttribute:
        ' data-dynamic-target="referring-coach-or-directory"',
    };
  }
  if (target.kind === "url") return { href: target.href };
  if (target.kind === "mailto") return { href: `mailto:${target.address}` };
  return { href: `tel:${target.number.replace(/[^+0-9]/g, "")}` };
}

function compileMarketingCtaHtmlWithCoachFallback(
  cta: MarketingCtaConfigV1,
  talkToCoachUrl: string,
): string {
  const parsed = marketingCtaConfigSchema.safeParse(cta);
  if (!parsed.success) throw new Error("Invalid Marketing CTA structure");
  const issues = getMarketingCtaStructuralIssues(parsed.data);
  if (issues.length > 0) throw new Error(issues[0].message);

  const blocks = parsed.data.blocks.map((block) => {
    if (block.type === "text") {
      const lead = block.lead.trim()
        ? `<strong>${escapeText(block.lead)}</strong>`
        : "";
      return `<div class="marketing-cta__text marketing-cta__text--${block.align}">${lead}<p>${escapeText(block.body)}</p></div>`;
    }
    if (block.type === "divider") {
      return '<hr class="marketing-cta__divider" />';
    }
    if (block.type === "image") {
      const image = `<img src="${escapeAttribute(block.src)}" alt="${escapeAttribute(block.alt)}" class="marketing-cta__image marketing-cta__image--${block.width}" />`;
      if (!block.link) return `<figure>${image}</figure>`;
      const target = compileTarget(block.link, talkToCoachUrl);
      return `<figure><a href="${escapeAttribute(target.href)}"${target.dynamicAttribute ?? ""}>${image}</a></figure>`;
    }
    const target = compileTarget(block.target, talkToCoachUrl);
    const tab = block.newTab
      ? ' target="_blank" rel="noopener noreferrer"'
      : "";
    return `<a class="marketing-cta__button marketing-cta__button--${block.style}" href="${escapeAttribute(target.href)}"${target.dynamicAttribute ?? ""}${tab}>${escapeText(block.label)}</a>`;
  });
  const compiled = `<section class="marketing-cta" data-schema-version="1">${blocks.join("")}</section>`;
  const sanitized = sanitizeHtml(compiled, {
    allowedTags: ["section", "div", "strong", "p", "hr", "figure", "img", "a"],
    allowedAttributes: {
      section: ["class", "data-schema-version"],
      div: ["class"],
      hr: ["class"],
      img: ["src", "alt", "class"],
      a: ["class", "href", "target", "rel", "data-dynamic-target"],
    },
    allowedSchemes: ["https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
  });
  if (sanitized !== compiled) {
    throw new Error("Marketing CTA compiler emitted content outside the allow-list");
  }
  return compiled;
}

export function compileMarketingCtaHtml(cta: MarketingCtaConfigV1): string {
  return compileMarketingCtaHtmlWithCoachFallback(cta, TALK_TO_A_COACH_URL);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function prepareMarketingCtaForStorage(
  reportConfig: unknown,
):
  | { ok: true; reportConfig: unknown }
  | { ok: false; issues: MarketingCtaIssue[] } {
  const root = asRecord(reportConfig);
  const publicMarketing = asRecord(root.publicMarketing);
  const rawCta = publicMarketing.marketingCta;
  if (rawCta === undefined || rawCta === null) {
    return { ok: true, reportConfig };
  }
  const parsed = marketingCtaConfigSchema.safeParse(rawCta);
  if (!parsed.success) {
    return {
      ok: false,
      issues: getMarketingCtaStructuralIssues(rawCta),
    };
  }
  const issues = getMarketingCtaStructuralIssues(parsed.data);
  if (issues.length > 0) return { ok: false, issues };
  try {
    const sanitizedHtml = compileMarketingCtaHtml(parsed.data);
    return {
      ok: true,
      reportConfig: mergeMarketingCta(reportConfig, {
        ...parsed.data,
        sanitizedHtml,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: "CTA_UNSAFE_CONTENT",
          path: ["publicMarketing", "marketingCta"],
          message:
            error instanceof Error ? error.message : "Marketing CTA is unsafe.",
        },
      ],
    };
  }
}

export function loadSafeMarketingCta(
  reportConfig: unknown,
): MarketingCtaConfigV1 | null {
  const raw = asRecord(asRecord(reportConfig).publicMarketing).marketingCta;
  const parsed = marketingCtaConfigSchema.safeParse(raw);
  if (!parsed.success) return null;
  try {
    const currentCompiled = compileMarketingCtaHtml(parsed.data);
    if (parsed.data.sanitizedHtml === currentCompiled) return parsed.data;

    const legacyCompiled = compileMarketingCtaHtmlWithCoachFallback(
      parsed.data,
      LEGACY_TALK_TO_A_COACH_URL,
    );
    return parsed.data.sanitizedHtml === legacyCompiled ? parsed.data : null;
  } catch {
    return null;
  }
}
