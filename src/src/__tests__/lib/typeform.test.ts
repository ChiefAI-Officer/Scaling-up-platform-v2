/**
 * Unit Tests: Typeform Integration
 * Tests survey URL generation and embed code generation.
 */

import {
    generateSurveyUrl,
    generateEmbedCode,
    generateIframeEmbed,
    createWorkshopSurveyConfig,
} from "@/lib/typeform";

describe("Typeform Integration", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        process.env.TYPEFORM_BASE_URL = "https://form.typeform.com/to";
        process.env.TYPEFORM_FEEDBACK_FORM_ID = "abc123";
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe("generateSurveyUrl", () => {
        it("should generate URL with hidden fields", () => {
            const url = generateSurveyUrl("ws-123", "reg-456", "test@example.com");

            expect(url).toContain("https://form.typeform.com/to/abc123");
            expect(url).toContain("workshop_id=ws-123");
            expect(url).toContain("registration_id=reg-456");
            expect(url).toContain("email=test%40example.com");
        });

        it("should use default form ID when not set", () => {
            delete process.env.TYPEFORM_FEEDBACK_FORM_ID;

            const url = generateSurveyUrl("ws-123", "reg-456", "test@example.com");

            expect(url).toContain("default-form-id");
        });
    });

    describe("generateEmbedCode", () => {
        it("should return Typeform embed widget HTML", () => {
            const html = generateEmbedCode({ formId: "xyz789" });

            expect(html).toContain('data-tf-live="xyz789"');
            expect(html).toContain("embed.typeform.com/next/embed.js");
        });

        it("should include hidden fields when provided", () => {
            const html = generateEmbedCode({
                formId: "xyz789",
                hiddenFields: { workshop_id: "ws-100" },
            });

            // Typeform embed widget uses data-tf-live attribute, not full URL
            // Hidden fields are passed via the Typeform JS SDK, not in the HTML
            expect(html).toContain('data-tf-live="xyz789"');
            expect(html).toContain("embed.typeform.com/next/embed.js");
        });
    });

    describe("generateIframeEmbed", () => {
        it("should return iframe HTML", () => {
            const html = generateIframeEmbed("formABC");

            expect(html).toContain("<iframe");
            expect(html).toContain("https://form.typeform.com/to/formABC");
            expect(html).toContain('width="100%"');
            expect(html).toContain('height="500"');
        });

        it("should append hidden fields as hash params", () => {
            const html = generateIframeEmbed("formABC", { coach_id: "c-1" });

            expect(html).toContain("formABC#coach_id=c-1");
        });
    });

    describe("createWorkshopSurveyConfig", () => {
        it("should create config with correct hidden fields", () => {
            const config = createWorkshopSurveyConfig("ws-1", "coach-1", "Test Workshop");

            expect(config.formId).toBe("abc123");
            expect(config.hiddenFields).toEqual({
                workshop_id: "ws-1",
                coach_id: "coach-1",
                workshop_title: "Test Workshop",
            });
        });
    });
});
