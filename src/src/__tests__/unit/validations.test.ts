/**
 * Unit tests for Zod validation schemas
 */

import {
  createWorkshopSchema,
  updateWorkshopSchema,
  createCoachSchema,
  updateCoachSchema,
  createRegistrationSchema,
  coachSignupSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validations";

describe("Workshop Validation Schemas", () => {
  describe("createWorkshopSchema", () => {
    const validWorkshop = {
      workshopTypeId: "type-456",
      coachId: "coach-123",
      title: "AI Workshop - Chicago",
      format: "IN_PERSON",
      eventDate: "2025-03-15",
    };

    it("should accept valid workshop data", () => {
      const result = createWorkshopSchema.safeParse(validWorkshop);
      expect(result.success).toBe(true);
    });

    it("should accept workshop with all optional fields", () => {
      const fullWorkshop = {
        ...validWorkshop,
        description: "An amazing workshop",
        eventTime: "9:00 AM",
        timezone: "America/Chicago",
        venueName: "Marriott Chicago",
        venueAddress: "540 N Michigan Ave, Chicago, IL 60611",
        venueInstructions: "Park in the west garage, enter through lobby",
        isFree: false,
        priceCents: 49900,
        maxAttendees: 30,
      };
      const result = createWorkshopSchema.safeParse(fullWorkshop);
      expect(result.success).toBe(true);
    });

    it("should accept workshop without workshopTypeId (migration compatibility)", () => {
        const { workshopTypeId: _, ...withoutTypeId } = validWorkshop; void _;
        const result = createWorkshopSchema.safeParse(withoutTypeId);
        expect(result.success).toBe(true);
    });

    it("should reject workshop without required title", () => {
        const { title: __, ...withoutTitle } = validWorkshop; void __;
        const result = createWorkshopSchema.safeParse(withoutTitle);
        expect(result.success).toBe(false);
    });

    it("should reject workshop with empty title", () => {
      const result = createWorkshopSchema.safeParse({
        ...validWorkshop,
        title: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject workshop with invalid format", () => {
      const result = createWorkshopSchema.safeParse({
        ...validWorkshop,
        format: "INVALID_FORMAT",
      });
      expect(result.success).toBe(false);
    });

    it("should accept all valid format options", () => {
      const formats = ["IN_PERSON", "VIRTUAL"];
      formats.forEach((format) => {
        const result = createWorkshopSchema.safeParse({
          ...validWorkshop,
          format,
        });
        expect(result.success).toBe(true);
      });
    });

    it("should accept HYBRID format (FIG-006: re-added to format selector)", () => {
      const result = createWorkshopSchema.safeParse({
        ...validWorkshop,
        format: "HYBRID",
      });
      expect(result.success).toBe(true);
    });

    it("should reject negative priceCents", () => {
      const result = createWorkshopSchema.safeParse({
        ...validWorkshop,
        priceCents: -100,
      });
      expect(result.success).toBe(false);
    });

    it("should reject negative maxAttendees", () => {
      const result = createWorkshopSchema.safeParse({
        ...validWorkshop,
        maxAttendees: -5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateWorkshopSchema", () => {
    it("should accept partial updates", () => {
      const result = updateWorkshopSchema.safeParse({
        title: "Updated Title",
      });
      expect(result.success).toBe(true);
    });

    it("should accept empty object for no updates", () => {
      const result = updateWorkshopSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should validate updated fields correctly", () => {
      const result = updateWorkshopSchema.safeParse({
        format: "INVALID",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Coach Validation Schema", () => {
  const validCoach = {
    email: "coach@example.com",
    firstName: "John",
    lastName: "Doe",
  };

  it("should accept valid coach data", () => {
    const result = createCoachSchema.safeParse(validCoach);
    expect(result.success).toBe(true);
  });

  it("should accept coach with all optional fields", () => {
    const fullCoach = {
      ...validCoach,
      phone: "+1 555-0100",
      company: "Coaching Co",
      bio: "Experienced coach",
      hubspotId: "hs-123",
      circleId: "circle-456",
    };
    const result = createCoachSchema.safeParse(fullCoach);
    expect(result.success).toBe(true);
  });

  it("accepts canonical title and legacy company when creating a coach", () => {
    expect(createCoachSchema.safeParse({
      ...validCoach,
      title: "Master Coach",
      company: "A Step Above",
    }).success).toBe(true);
  });

  it("accepts nullable professional fields and integration IDs when updating a coach", () => {
    expect(updateCoachSchema.safeParse({ title: null, company: null }).success).toBe(true);
    expect(updateCoachSchema.safeParse({ hubspotId: null, circleId: null }).success).toBe(true);
  });

  it("rejects non-string professional titles when updating a coach", () => {
    expect(updateCoachSchema.safeParse({ title: 42 }).success).toBe(false);
  });

  it("should reject invalid email", () => {
    const result = createCoachSchema.safeParse({
      ...validCoach,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty firstName", () => {
    const result = createCoachSchema.safeParse({
      ...validCoach,
      firstName: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty lastName", () => {
    const result = createCoachSchema.safeParse({
      ...validCoach,
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  /**
   * GH #229 — `profileImage` is rendered as an <img src> on reports that Wave OSR
   * (#71) shows to unauthenticated respondents. The render site is the load-bearing
   * guard; this is the write boundary.
   *
   * This DOES reach a UI: `updateCoachSchema` is `createCoachSchema.partial()`, and
   * the Bio editor PATCHes `profileImage` seeded from the stored value. So a stored
   * non-https value would 400 an unrelated save. Two writers bypass this schema and
   * could create one — the Blob upload route and `services/circle-sync.ts`. Scheme
   * gating here is deliberate; the HOST is not constrained (see #229).
   */
  describe("profileImage — https-only (GH #229)", () => {
    function parse(profileImage: unknown) {
      return createCoachSchema.safeParse({ ...validCoach, profileImage });
    }

    it("accepts an https URL", () => {
      expect(parse("https://blob.vercel-storage.com/coach-1.png").success).toBe(true);
    });

    it("still accepts absence — undefined and empty string, as callers already send", () => {
      expect(parse(undefined).success).toBe(true);
      expect(parse("").success).toBe(true);
    });

    it.each([
      ["http", "http://tracker.example.net/pixel.png"],
      ["protocol-relative", "//tracker.example.net/pixel.png"],
      ["javascript:", "javascript:alert(1)"],
      ["data:", "data:image/png;base64,iVBORw0KGgo="],
      ["bare filename", "coach.png"],
    ])("rejects %s", (_label, value) => {
      expect(parse(value).success).toBe(false);
    });
  });
});

describe("Registration Validation Schema", () => {
  const validRegistration = {
    workshopId: "workshop-123",
    email: "attendee@example.com",
    firstName: "Jane",
    lastName: "Smith",
    company: "Smith Corp",
    phone: "+1 555-0200",
  };

  it("should accept valid registration data", () => {
    const result = createRegistrationSchema.safeParse(validRegistration);
    expect(result.success).toBe(true);
  });

  it("should accept registration with all optional fields", () => {
    const fullRegistration = {
      ...validRegistration,
      company: "Smith Corp",
      jobTitle: "CEO",
      phone: "+1 555-0200",
    };
    const result = createRegistrationSchema.safeParse(fullRegistration);
    expect(result.success).toBe(true);
  });

  it("should reject invalid email", () => {
    const result = createRegistrationSchema.safeParse({
      ...validRegistration,
      email: "invalid-email",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing workshopId", () => {
      const { workshopId: ___, ...withoutWorkshopId } = validRegistration; void ___;
      const result = createRegistrationSchema.safeParse(withoutWorkshopId);
      expect(result.success).toBe(false);
  });
});

describe("Authentication Validation Schemas", () => {
  describe("coachSignupSchema", () => {
    const strongSecret = "SecurePass123!";
    const weakSecret = "weakpass";
    const differentSecret = "SecurePass123@";
    const validSignup = {
      email: "new.coach@example.com",
      firstName: "New",
      lastName: "Coach",
      password: strongSecret,
      confirmPassword: strongSecret,
    };

    it("should accept valid coach signup data", () => {
      const result = coachSignupSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
    });

    it("should reject weak password", () => {
      const result = coachSignupSchema.safeParse({
        ...validSignup,
        password: weakSecret,
        confirmPassword: weakSecret,
      });
      expect(result.success).toBe(false);
    });

    it("should reject mismatched passwords", () => {
      const result = coachSignupSchema.safeParse({
        ...validSignup,
        confirmPassword: differentSecret,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("changePasswordSchema", () => {
    const currentSecret = "CurrentPass123!";
    const nextSecret = "NewSecurePass123!";
    const wrongConfirmSecret = "WrongConfirm123!";
    const validPayload = {
      currentPassword: currentSecret,
      newPassword: nextSecret,
      confirmNewPassword: nextSecret,
    };

    it("should accept valid password change payload", () => {
      const result = changePasswordSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should reject mismatched new password confirmation", () => {
      const result = changePasswordSchema.safeParse({
        ...validPayload,
        confirmNewPassword: wrongConfirmSecret,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("forgotPasswordSchema", () => {
    it("should accept valid forgot password payload", () => {
      const result = forgotPasswordSchema.safeParse({
        email: "admin@scalingup.com",
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const result = forgotPasswordSchema.safeParse({
        email: "not-an-email",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("resetPasswordSchema", () => {
    const validPayload = {
      email: "admin@scalingup.com",
      token: "abc123",
      newPassword: "NewSecurePass123!",
      confirmNewPassword: "NewSecurePass123!",
    };

    it("should accept valid reset password payload", () => {
      const result = resetPasswordSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should reject mismatched password confirmation", () => {
      const result = resetPasswordSchema.safeParse({
        ...validPayload,
        confirmNewPassword: "WrongConfirm123!",
      });

      expect(result.success).toBe(false);
    });
  });
});
