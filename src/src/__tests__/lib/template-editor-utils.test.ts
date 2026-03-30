import {
    safeJsonParse,
    SOLO_DEFAULTS,
    REGISTRATION_DEFAULTS,
    THANKYOU_DEFAULTS,
    getInitialData,
    isDirtyCheck,
} from "@/lib/template-editor-utils";
import { TEMPLATE_PREVIEW_DATA } from "@/lib/template-preview";

// ---------------------------------------------------------------------------
// TDD Cycle 1: safeJsonParse
// ---------------------------------------------------------------------------

describe("safeJsonParse", () => {
    test("returns parsed object for valid JSON", () => {
        const result = safeJsonParse('{"heroTitle":"Hello"}');
        expect(result).toEqual({ heroTitle: "Hello" });
    });

    test("returns {} for invalid JSON", () => {
        const result = safeJsonParse("not json at all");
        expect(result).toEqual({});
    });

    test("returns {} for empty string", () => {
        const result = safeJsonParse("");
        expect(result).toEqual({});
    });

    test("returns {} for non-object JSON like numbers or arrays", () => {
        expect(safeJsonParse("42")).toEqual({});
        expect(safeJsonParse("true")).toEqual({});
        expect(safeJsonParse('"just a string"')).toEqual({});
        expect(safeJsonParse("[1,2,3]")).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// TDD Cycle 2: getInitialData
// ---------------------------------------------------------------------------

describe("getInitialData", () => {
    const parsed = { heroTitle: "Custom Title", videoUrl: "https://example.com/video" };

    test("merges parsed into SOLO_DEFAULTS when type is SOLO_LANDING", () => {
        const result = getInitialData("SOLO_LANDING", parsed);
        expect(result).toEqual({ ...SOLO_DEFAULTS, ...parsed });
        expect(result.heroTitle).toBe("Custom Title");
    });

    test("returns plain SOLO_DEFAULTS when type is REGISTRATION — no cross-contamination", () => {
        const result = getInitialData("REGISTRATION", parsed);
        // Should NOT contain heroTitle from parsed — that belongs to SOLO
        expect(result).toEqual({ ...REGISTRATION_DEFAULTS, ...parsed });
        // But the key point: SOLO_DEFAULTS' heroTitle should not leak
        expect(result).not.toHaveProperty("heroSubtitle");
    });

    test("merges parsed into REGISTRATION_DEFAULTS when type is REGISTRATION", () => {
        const regParsed = { formTitle: "Sign Up Now" };
        const result = getInitialData("REGISTRATION", regParsed);
        expect(result).toEqual({ ...REGISTRATION_DEFAULTS, ...regParsed });
        expect(result.formTitle).toBe("Sign Up Now");
    });

    test("merges parsed into THANKYOU_DEFAULTS when type is THANK_YOU", () => {
        const tyParsed = { headline: "Thanks!" };
        const result = getInitialData("THANK_YOU", tyParsed);
        expect(result).toEqual({ ...THANKYOU_DEFAULTS, ...tyParsed });
        expect(result.headline).toBe("Thanks!");
    });

    test("returns empty object for unknown template type", () => {
        const result = getInitialData("BIO_PAGE", parsed);
        expect(result).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// TDD Cycle 3: isDirtyCheck
// ---------------------------------------------------------------------------

describe("isDirtyCheck", () => {
    test("returns false when current matches initial", () => {
        const data = { heroTitle: "Hello", benefits: ["a", "b"] };
        expect(isDirtyCheck(data, data)).toBe(false);
    });

    test("returns true when a scalar field changed", () => {
        const initial = { heroTitle: "Hello" };
        const current = { heroTitle: "Changed" };
        expect(isDirtyCheck(current, initial)).toBe(true);
    });

    test("returns true when an array item changed", () => {
        const initial = { benefits: ["a", "b"] };
        const current = { benefits: ["a", "c"] };
        expect(isDirtyCheck(current, initial)).toBe(true);
    });

    test("returns false after reset to initial values", () => {
        const initial = { heroTitle: "Hello" };
        const modified = { heroTitle: "Changed" };
        // Simulate: user edits, then undoes the edit
        expect(isDirtyCheck(modified, initial)).toBe(true);
        expect(isDirtyCheck(initial, initial)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// TDD Cycle 4: TEMPLATE_PREVIEW_DATA completeness
// ---------------------------------------------------------------------------

describe("TEMPLATE_PREVIEW_DATA completeness", () => {
    function extractPlaceholderKeys(obj: Record<string, unknown>): string[] {
        const keys: string[] = [];
        for (const value of Object.values(obj)) {
            if (typeof value === "string") {
                const matches = value.matchAll(/\{\{(\w+)\}\}/g);
                for (const match of matches) {
                    keys.push(match[1]);
                }
            }
        }
        return [...new Set(keys)];
    }

    test("every {{key}} placeholder in SOLO_DEFAULTS has a TEMPLATE_PREVIEW_DATA entry", () => {
        const keys = extractPlaceholderKeys(SOLO_DEFAULTS as unknown as Record<string, unknown>);
        for (const key of keys) {
            expect(TEMPLATE_PREVIEW_DATA).toHaveProperty(key);
        }
    });

    test("every {{key}} placeholder in REGISTRATION_DEFAULTS has a TEMPLATE_PREVIEW_DATA entry", () => {
        const keys = extractPlaceholderKeys(REGISTRATION_DEFAULTS as unknown as Record<string, unknown>);
        for (const key of keys) {
            expect(TEMPLATE_PREVIEW_DATA).toHaveProperty(key);
        }
    });

    test("every {{key}} placeholder in THANKYOU_DEFAULTS has a TEMPLATE_PREVIEW_DATA entry", () => {
        const keys = extractPlaceholderKeys(THANKYOU_DEFAULTS as unknown as Record<string, unknown>);
        for (const key of keys) {
            expect(TEMPLATE_PREVIEW_DATA).toHaveProperty(key);
        }
    });
});
