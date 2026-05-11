/**
 * CHG-03: tests for the customCode validator + token interpolator that
 * gate iDev pixel rendering on the THANK_YOU page.
 */

import {
    validateCustomCode,
    interpolateCustomCode,
} from "@/lib/templates/interpolate-custom-code";

describe("validateCustomCode — accepts iDev img pixel", () => {
    it("accepts a valid iDev pixel hosted on scalingup.idevaffiliate.com", () => {
        const ok = validateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?profile=72198&idev_saleamt={{saleAmount}}&idev_ordernum={{orderNumber}}">`
        );
        expect(ok).toEqual({ valid: true });
    });

    it("accepts the same pixel with single-quoted attributes", () => {
        const ok = validateCustomCode(
            `<img src='https://scalingup.idevaffiliate.com/sale.php?profile=72198'>`
        );
        expect(ok.valid).toBe(true);
    });

    it("accepts width/height/alt attributes alongside src", () => {
        const ok = validateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?p=1" width="1" height="1" alt="">`
        );
        expect(ok.valid).toBe(true);
    });
});

describe("validateCustomCode — rejects unsafe input", () => {
    it("rejects <script> with src", () => {
        expect(validateCustomCode(`<script src="https://evil.example.com/x.js"></script>`).valid).toBe(false);
    });

    it("rejects inline <script>", () => {
        expect(validateCustomCode(`<script>alert(1)</script>`).valid).toBe(false);
    });

    it("rejects javascript: URL in img src", () => {
        expect(validateCustomCode(`<img src="javascript:alert(1)">`).valid).toBe(false);
    });

    it("rejects data: URL", () => {
        expect(validateCustomCode(`<img src="data:image/png;base64,abc">`).valid).toBe(false);
    });

    it("rejects protocol-relative URL", () => {
        expect(validateCustomCode(`<img src="//foo/bar.png">`).valid).toBe(false);
    });

    it("rejects http:// (must be https)", () => {
        expect(
            validateCustomCode(`<img src="http://scalingup.idevaffiliate.com/sale.php">`).valid
        ).toBe(false);
    });

    it("rejects onerror attribute", () => {
        expect(
            validateCustomCode(
                `<img src="https://scalingup.idevaffiliate.com/sale.php" onerror="alert(1)">`
            ).valid
        ).toBe(false);
    });

    it("rejects onclick attribute", () => {
        expect(
            validateCustomCode(
                `<img src="https://scalingup.idevaffiliate.com/sale.php" onclick="x()">`
            ).valid
        ).toBe(false);
    });

    it("rejects iframe", () => {
        expect(validateCustomCode(`<iframe src="https://example.com"></iframe>`).valid).toBe(false);
    });

    it("rejects anchor tags", () => {
        expect(validateCustomCode(`<a href="https://example.com">click</a>`).valid).toBe(false);
    });

    it("rejects mixed-case <Script>", () => {
        expect(validateCustomCode(`<sCriPt SrC="https://x"></sCriPt>`).valid).toBe(false);
    });

    it("rejects off-allowlist host (host pin is mandatory)", () => {
        expect(
            validateCustomCode(`<img src="https://example.com/x.png">`).valid
        ).toBe(false);
    });

    it("rejects style attribute (CSS url() can bypass src allowlist)", () => {
        expect(
            validateCustomCode(
                `<img src="https://scalingup.idevaffiliate.com/sale.php" style="background:url(javascript:alert(1))">`
            ).valid
        ).toBe(false);
    });
});

describe("interpolateCustomCode — token substitution", () => {
    const registration = {
        amountPaidCents: 19950,
        id: "reg-1",
        stripeSessionId: "cs_test_abc123",
        email: "user@example.com",
    };

    it("substitutes {{saleAmount}} with formatted dollars (no $ sign)", () => {
        const out = interpolateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?idev_saleamt={{saleAmount}}">`,
            registration
        );
        expect(out).toContain("idev_saleamt=199.50");
    });

    it("substitutes {{orderNumber}} with stripe session id", () => {
        const out = interpolateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?idev_ordernum={{orderNumber}}">`,
            registration
        );
        expect(out).toContain("idev_ordernum=cs_test_abc123");
    });

    it("falls back to registration.id when stripeSessionId is null", () => {
        const out = interpolateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?idev_ordernum={{orderNumber}}">`,
            { ...registration, stripeSessionId: null }
        );
        expect(out).toContain("idev_ordernum=reg-1");
    });

    it("substitutes {{email}} URL-encoded", () => {
        const out = interpolateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?email={{email}}">`,
            { ...registration, email: "a+b@example.com" }
        );
        expect(out).toContain("email=a%2Bb%40example.com");
    });

    it("substitutes {{currency}} with USD", () => {
        const out = interpolateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?cur={{currency}}">`,
            registration
        );
        expect(out).toContain("cur=USD");
    });

    it("escapes single quotes in token values to prevent attribute breakout", () => {
        const out = interpolateCustomCode(
            `<img src='https://scalingup.idevaffiliate.com/sale.php?email={{email}}'>`,
            { ...registration, email: "evil'>onerror='alert(1)" }
        );
        expect(out).not.toContain("onerror=");
    });
});

describe("validateCustomCode — AFFILIATE_PIXEL_HOSTS env var (ENH-MAY6-6)", () => {
    const ORIGINAL = process.env.AFFILIATE_PIXEL_HOSTS;

    afterEach(() => {
        jest.resetModules();
        if (ORIGINAL === undefined) {
            delete process.env.AFFILIATE_PIXEL_HOSTS;
        } else {
            process.env.AFFILIATE_PIXEL_HOSTS = ORIGINAL;
        }
    });

    function freshValidator() {
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require("@/lib/templates/interpolate-custom-code") as typeof import("@/lib/templates/interpolate-custom-code");
    }

    it("falls back to scalingup.idevaffiliate.com when env unset", () => {
        delete process.env.AFFILIATE_PIXEL_HOSTS;
        const { validateCustomCode } = freshValidator();
        const ok = validateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?profile=72198">`
        );
        expect(ok).toEqual({ valid: true });
    });

    it("uses single env host (rejects the old iDev host when overridden)", () => {
        process.env.AFFILIATE_PIXEL_HOSTS = "trackdesk.example.com";
        const { validateCustomCode } = freshValidator();
        const rejected = validateCustomCode(
            `<img src="https://scalingup.idevaffiliate.com/sale.php?profile=72198">`
        );
        expect(rejected).toMatchObject({ valid: false });
        const allowed = validateCustomCode(
            `<img src="https://trackdesk.example.com/track.png">`
        );
        expect(allowed).toEqual({ valid: true });
    });

    it("supports comma-separated multi-host list with whitespace tolerance", () => {
        process.env.AFFILIATE_PIXEL_HOSTS = "  a.example.com , b.example.com  ";
        const { validateCustomCode } = freshValidator();
        expect(validateCustomCode(`<img src="https://a.example.com/x.png">`)).toEqual({
            valid: true,
        });
        expect(validateCustomCode(`<img src="https://b.example.com/y.png">`)).toEqual({
            valid: true,
        });
        expect(validateCustomCode(`<img src="https://c.example.com/z.png">`)).toMatchObject({
            valid: false,
        });
    });

    it("is case-insensitive on host comparison", () => {
        process.env.AFFILIATE_PIXEL_HOSTS = "AFFILIATE.Example.COM";
        const { validateCustomCode } = freshValidator();
        expect(validateCustomCode(`<img src="https://affiliate.example.com/x">`)).toEqual({
            valid: true,
        });
    });
});
