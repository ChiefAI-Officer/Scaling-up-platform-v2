import {
    createAssessmentCampaignSchema,
    createRegistrationSchema,
} from "@/lib/validations";

describe("phone validation accepts E.164 format", () => {
    it("accepts +12125551234 (US E.164)", () => {
        const result = createRegistrationSchema.shape.phone.safeParse("+12125551234");
        expect(result.success).toBe(true);
    });
    it("accepts +639171234567 (PH E.164)", () => {
        const result = createRegistrationSchema.shape.phone.safeParse("+639171234567");
        expect(result.success).toBe(true);
    });
    it("rejects empty string", () => {
        const result = createRegistrationSchema.shape.phone.safeParse("");
        expect(result.success).toBe(false);
    });
    it("rejects letters", () => {
        const result = createRegistrationSchema.shape.phone.safeParse("abc");
        expect(result.success).toBe(false);
    });
});

describe("assessment campaign validation", () => {
    it("keeps organizationId required for invited campaign creation", () => {
        const result = createAssessmentCampaignSchema.safeParse({
            name: "Invited campaign",
            templateId: "tpl-1",
            openAt: "2026-08-08T12:00:00.000Z",
            endMode: "OPEN_END",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ path: ["organizationId"] }),
                ]),
            );
        }
    });
});
