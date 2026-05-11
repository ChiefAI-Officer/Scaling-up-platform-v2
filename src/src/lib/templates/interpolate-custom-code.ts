/**
 * CHG-03 (May 4 2026): customCode (admin-pasted iDev pixel) is rendered
 * literally on THANK_YOU pages after a paid registration. Two layers
 * protect against XSS:
 *
 *   validateCustomCode(template) — parser-based allowlist (parse5). v1
 *     supports <img> pixels only. <script> is rejected (and would be inert
 *     via React inner-HTML rendering anyway per HTML spec). Host is pinned to
 *     scalingup.idevaffiliate.com.
 *
 *   interpolateCustomCode(template, registration) — fills {{saleAmount}},
 *     {{orderNumber}}, {{email}}, {{currency}} with URL-encoded then
 *     HTML-escaped token values so attribute breakout via single-quoted
 *     attrs is prevented.
 *
 * Validate at TWO layers (defense-in-depth): save-time at PATCH
 * /api/page-templates/[id] (admin sees inline 400), and render-time before
 * the renderer mounts the wrapper. If render-time validation fails, skip
 * the render — page still loads, no iDev pixel for that workshop.
 */

import { parse, defaultTreeAdapter } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

type Element = DefaultTreeAdapterMap["element"];
type Document = DefaultTreeAdapterMap["document"];
type ChildNode = DefaultTreeAdapterMap["childNode"];

export type ValidationResult = { valid: true } | { valid: false; error: string };

// ENH-MAY6-6: affiliate-pixel host allowlist is env-driven so swapping providers
// is a Vercel env change, not a code change. Comma-separated, whitespace-tolerant,
// lowercased. Falls back to the historical iDev host in both dev and prod when
// AFFILIATE_PIXEL_HOSTS is unset — logs a one-time `console.warn` in prod so the
// operator sees a deprecation breadcrumb (do NOT throw — would brick cold starts
// if the env var was pushed after the code deploy).
const DEFAULT_AFFILIATE_HOSTS = ["scalingup.idevaffiliate.com"];

let envFallbackWarned = false;

function getAllowedHosts(): Set<string> {
    const raw = process.env.AFFILIATE_PIXEL_HOSTS;
    if (!raw || raw.trim().length === 0) {
        if (process.env.NODE_ENV === "production" && !envFallbackWarned) {
            console.warn(
                "[affiliate] AFFILIATE_PIXEL_HOSTS unset in production; falling back to default host. Set the env var to swap providers."
            );
            envFallbackWarned = true;
        }
        return new Set(DEFAULT_AFFILIATE_HOSTS);
    }
    const parts = raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
    return new Set(parts.length > 0 ? parts : DEFAULT_AFFILIATE_HOSTS);
}

const ALLOWED_ATTRS = new Set<string>(["src", "width", "height", "alt"]);

function isElement(node: ChildNode): node is Element {
    return "tagName" in node;
}

function getChildNodes(node: Element | Document): ChildNode[] {
    return defaultTreeAdapter.getChildNodes(node) as ChildNode[];
}

function validateNode(node: ChildNode): ValidationResult {
    if (!isElement(node)) return { valid: true };

    const tag = node.tagName.toLowerCase();

    if (tag === "script") {
        return {
            valid: false,
            error:
                "<script> tags aren't supported (they cannot execute via this render path). Use an <img> pixel instead.",
        };
    }

    if (tag !== "img") {
        return {
            valid: false,
            error: `<${tag}> tags aren't allowed. Use an <img> pixel only.`,
        };
    }

    let hasSrc = false;
    for (const attr of node.attrs) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
            return {
                valid: false,
                error: "Inline event handlers (onerror, onclick, etc.) aren't allowed.",
            };
        }
        if (!ALLOWED_ATTRS.has(name)) {
            return {
                valid: false,
                error: `Attribute "${attr.name}" isn't allowed on <img>. Use src/width/height/alt only.`,
            };
        }
        if (name === "src") {
            hasSrc = true;
            const val = attr.value;
            if (val.startsWith("javascript:")) {
                return { valid: false, error: "javascript: URLs aren't allowed." };
            }
            if (val.startsWith("data:")) {
                return { valid: false, error: "data: URLs aren't allowed." };
            }
            if (val.startsWith("//")) {
                return {
                    valid: false,
                    error: "Protocol-relative URLs aren't allowed. Use a full https:// URL.",
                };
            }
            let url: URL;
            try {
                url = new URL(val);
            } catch {
                return {
                    valid: false,
                    error: "src must be a fully-qualified https:// URL.",
                };
            }
            if (url.protocol !== "https:") {
                return {
                    valid: false,
                    error: "src must use https:// (the production CSP and the page itself reject http://).",
                };
            }
            const allowedHosts = getAllowedHosts();
            if (!allowedHosts.has(url.host.toLowerCase())) {
                return {
                    valid: false,
                    error: `host "${url.host}" isn't on the affiliate allowlist.`,
                };
            }
        }
    }

    if (!hasSrc) {
        return { valid: false, error: "<img> requires a src attribute." };
    }

    return { valid: true };
}

// parse5 wraps user input in html > head > body; user content can land
// under either head (e.g. <script>) or body (e.g. <img>). Skip the implicit
// wrappers themselves but still walk into them so head-level user nodes
// like <script> get caught by the allowlist.
const WRAPPER_TAGS = new Set<string>(["html", "head", "body"]);

function walk(node: Element | Document): ValidationResult {
    for (const child of getChildNodes(node)) {
        if (isElement(child)) {
            const tag = child.tagName.toLowerCase();
            if (!WRAPPER_TAGS.has(tag)) {
                const ownResult = validateNode(child);
                if (!ownResult.valid) return ownResult;
            }
            const childResult = walk(child);
            if (!childResult.valid) return childResult;
        }
    }
    return { valid: true };
}

export function validateCustomCode(template: string): ValidationResult {
    if (!template || typeof template !== "string") {
        return { valid: false, error: "customCode must be a non-empty string." };
    }
    if (template.trim().length === 0) {
        return { valid: false, error: "customCode is empty." };
    }
    const document = parse(template);
    return walk(document as Document);
}

export type RegistrationForInterpolation = {
    amountPaidCents: number;
    id: string;
    stripeSessionId?: string | null;
    email: string;
};

function escapeForAttribute(value: string): string {
    // URL-encode handles most attribute-meaningful characters (&, ", <, >, +, @).
    // The HTML escape pass below covers the one thing encodeURIComponent doesn't:
    // single quotes (matter for single-quoted attribute syntax src='...').
    const urlEncoded = encodeURIComponent(value);
    return urlEncoded.replace(/'/g, "&#39;");
}

export function interpolateCustomCode(
    template: string,
    registration: RegistrationForInterpolation
): string {
    const orderNumber = registration.stripeSessionId ?? registration.id;
    const saleAmount = (registration.amountPaidCents / 100).toFixed(2);

    const tokens: Record<string, string> = {
        "{{saleAmount}}": escapeForAttribute(saleAmount),
        "{{orderNumber}}": escapeForAttribute(orderNumber),
        "{{email}}": escapeForAttribute(registration.email),
        "{{currency}}": escapeForAttribute("USD"),
    };

    let out = template;
    for (const [token, value] of Object.entries(tokens)) {
        out = out.split(token).join(value);
    }
    return out;
}
