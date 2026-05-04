/**
 * CHG-03 (May 4 2026): renders an admin-pasted iDev pixel from
 * LandingPage.customCode after a paid registration. Used at BOTH paid-success
 * destinations: /workshop/[slug] (THANK_YOU LandingPage) and
 * /registration/success (fallback).
 *
 * The renderer is the only place that injects customCode into the DOM —
 * keeping it co-located ensures both call sites enforce the same gate,
 * validation, and interpolation. Trust boundary: customCode is editable
 * only by ADMIN/STAFF via the page-template editor; coach-accessible
 * routes never accept it from request bodies.
 */

import {
    interpolateCustomCode,
    validateCustomCode,
} from "@/lib/templates/interpolate-custom-code";

export type CustomCodeRendererProps = {
    landingPage: { customCode: string | null } | null;
    registration: { id: string; stripeSessionId: string | null; email: string };
    workshop: { isFree: boolean };
    /** Resolved at the call site (DB - Stripe Session fallback - null). */
    effectiveAmountCents: number | null;
};

export function CustomCodeRenderer(props: CustomCodeRendererProps) {
    const { landingPage, registration, workshop, effectiveAmountCents } = props;

    if (!landingPage?.customCode) return null;
    if (workshop.isFree) return null;
    if (!effectiveAmountCents || effectiveAmountCents <= 0) return null;

    const validation = validateCustomCode(landingPage.customCode);
    if (!validation.valid) {
        // Log + skip - the page itself still loads. No iDev pixel for this view.
        console.warn(
            `[customCode] validation failed at render time: ${validation.error}`
        );
        return null;
    }

    const html = interpolateCustomCode(landingPage.customCode, {
        amountPaidCents: effectiveAmountCents,
        id: registration.id,
        stripeSessionId: registration.stripeSessionId,
        email: registration.email,
    });

    return (
        <div
            data-customcode-renderer
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
