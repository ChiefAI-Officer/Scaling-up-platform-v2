/**
 * Unit tests for Zod validation schemas
 */

import {
  createWorkshopSchema,
  updateWorkshopSchema,
  createCoachSchema,
  createRegistrationSchema,
  coachSignupSchema,
  changePasswordSchema,
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
        virtualPlatform: "zoom",
        isFree: false,
        priceCents: 49900,
        maxAttendees: 30,
      };
      const result = createWorkshopSchema.safeParse(fullWorkshop);
      expect(result.success).toBe(true);
    });

    it("should reject workshop without required workshopTypeId", () => {
        const { workshopTypeId: _, ...withoutTypeId } = validWorkshop; void _;
        const result = createWorkshopSchema.safeParse(withoutTypeId);
        expect(result.success).toBe(false);
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
      const formats = ["IN_PERSON", "VIRTUAL", "HYBRID"];
      formats.forEach((format) => {
        const result = createWorkshopSchema.safeParse({
          ...validWorkshop,
          format,
        });
        expect(result.success).toBe(true);
      });
    });

    it("should accept valid virtualPlatform options", () => {
      const platforms = ["zoom", "teams", "meet"];
      platforms.forEach((virtualPlatform) => {
        const result = createWorkshopSchema.safeParse({
          ...validWorkshop,
          virtualPlatform,
        });
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid virtualPlatform", () => {
      const result = createWorkshopSchema.safeParse({
        ...validWorkshop,
        virtualPlatform: "invalid-platform",
      });
      expect(result.success).toBe(false);
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
});

describe("Registration Validation Schema", () => {
  const validRegistration = {
    workshopId: "workshop-123",
    email: "attendee@example.com",
    firstName: "Jane",
    lastName: "Smith",
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
});
