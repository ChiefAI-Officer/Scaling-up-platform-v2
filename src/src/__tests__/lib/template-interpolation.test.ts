import { interpolateContent, rewriteIdentityFields, templateHasPlaceholders, findRemainingPlaceholders, formatVenueAddress, formatWorkshopDate, formatWorkshopDay, formatWorkshopDateNoWeekday, buildWorkshopVariables } from "@/lib/templates/template-interpolation";
import { db } from "@/lib/db";

jest.mock("@/lib/db", () => ({
  db: {
    workshop: { findUnique: jest.fn() },
  },
}));

describe("interpolateContent", () => {
  it("replaces {{variable}} placeholders with values", () => {
    const content = '{"heading":"Register for {{workshop_title}}","coach":"{{coach_name}}"}';
    const variables = {
      workshop_title: "Scaling Up Workshop",
      coach_name: "John Smith",
    };

    const result = interpolateContent(content, variables);
    const parsed = JSON.parse(result);

    expect(parsed.heading).toBe("Register for Scaling Up Workshop");
    expect(parsed.coach).toBe("John Smith");
  });

  it("handles {{ variable }} with spaces around variable name", () => {
    const content = '{"name":"{{ coach_name }}"}';
    const result = interpolateContent(content, { coach_name: "Jane Doe" });

    expect(JSON.parse(result).name).toBe("Jane Doe");
  });

  it("replaces multiple occurrences of the same variable", () => {
    const content = '{"title":"{{title}}","repeat":"{{title}}"}';
    const result = interpolateContent(content, { title: "Test" });
    const parsed = JSON.parse(result);

    expect(parsed.title).toBe("Test");
    expect(parsed.repeat).toBe("Test");
  });

  it("leaves unmatched placeholders unchanged", () => {
    const content = '{"val":"{{unknown_var}}"}';
    const result = interpolateContent(content, { other_var: "value" });

    expect(JSON.parse(result).val).toBe("{{unknown_var}}");
  });

  it("handles empty variables map without errors", () => {
    const content = '{"heading":"Hello"}';
    const result = interpolateContent(content, {});

    expect(result).toBe(content);
  });
});

describe("rewriteIdentityFields", () => {
  it("replaces matching top-level fields in JSON content", () => {
    const content = JSON.stringify({
      coachName: "Michael Chen",
      coachPhoto: "/old-photo.jpg",
      workshopTitle: "Old Workshop Title",
      someOtherField: "untouched",
    });

    const targetFields = {
      coachName: "JC DS",
      coachPhoto: "/new-photo.jpg",
      workshopTitle: "New Workshop Title",
    };

    const result = rewriteIdentityFields(content, targetFields);
    const parsed = JSON.parse(result);

    expect(parsed.coachName).toBe("JC DS");
    expect(parsed.coachPhoto).toBe("/new-photo.jpg");
    expect(parsed.workshopTitle).toBe("New Workshop Title");
    expect(parsed.someOtherField).toBe("untouched");
  });

  it("does not add fields that do not exist in the original content", () => {
    const content = JSON.stringify({ coachName: "Michael Chen" });
    const targetFields = {
      coachName: "JC DS",
      nonExistentField: "should not appear",
    };

    const result = rewriteIdentityFields(content, targetFields);
    const parsed = JSON.parse(result);

    expect(parsed.coachName).toBe("JC DS");
    expect(parsed.nonExistentField).toBeUndefined();
  });

  it("handles empty target fields without modifying content", () => {
    const content = JSON.stringify({ coachName: "Michael Chen" });
    const result = rewriteIdentityFields(content, {});
    const parsed = JSON.parse(result);

    expect(parsed.coachName).toBe("Michael Chen");
  });

  it("preserves non-string field types in content", () => {
    const content = JSON.stringify({
      coachName: "Michael Chen",
      attendeeCount: 50,
      isPublished: true,
    });

    const result = rewriteIdentityFields(content, { coachName: "JC DS" });
    const parsed = JSON.parse(result);

    expect(parsed.coachName).toBe("JC DS");
    expect(parsed.attendeeCount).toBe(50);
    expect(parsed.isPublished).toBe(true);
  });

  it("handles the full set of camelCase identity fields", () => {
    const content = JSON.stringify({
      coachName: "Michael Chen",
      coachPhoto: "/michael.jpg",
      coachTitle: "Coaching Co",
      workshopTitle: "Old Title",
      eventDate: "Monday, January 1, 2026",
      eventTime: "9:00 AM",
    });

    const targetFields = {
      coachName: "JC DS",
      coachPhoto: "/jc.jpg",
      coachTitle: "Scaling Up Certified Coach",
      workshopTitle: "AI Strategy Breakdown",
      eventDate: "Friday, June 15, 2026",
      eventTime: "2:00 PM",
    };

    const result = rewriteIdentityFields(content, targetFields);
    const parsed = JSON.parse(result);

    expect(parsed.coachName).toBe("JC DS");
    expect(parsed.coachPhoto).toBe("/jc.jpg");
    expect(parsed.coachTitle).toBe("Scaling Up Certified Coach");
    expect(parsed.workshopTitle).toBe("AI Strategy Breakdown");
    expect(parsed.eventDate).toBe("Friday, June 15, 2026");
    expect(parsed.eventTime).toBe("2:00 PM");
  });
});

describe("templateHasPlaceholders", () => {
    it("returns true when content has placeholders", () => {
        expect(templateHasPlaceholders('{"title":"{{workshop_title}}"}')).toBe(true);
    });
    it("returns false when content has no placeholders", () => {
        expect(templateHasPlaceholders('{"title":"Real Workshop Name"}')).toBe(false);
    });
    it("returns false for empty string", () => {
        expect(templateHasPlaceholders("")).toBe(false);
    });
});

describe("findRemainingPlaceholders", () => {
    it("returns placeholder names when present", () => {
        expect(findRemainingPlaceholders('{"a":"{{x}}","b":"{{y_z}}"}')).toEqual(["x", "y_z"]);
    });
    it("returns empty array when no placeholders", () => {
        expect(findRemainingPlaceholders('{"a":"done"}')).toEqual([]);
    });
    it("returns empty array for empty string", () => {
        expect(findRemainingPlaceholders("")).toEqual([]);
    });
});

describe("date formatting with UTC timezone", () => {
    const julyFirst = new Date("2026-07-01T00:00:00.000Z");

    it("formatWorkshopDate includes weekday and uses UTC", () => {
        expect(formatWorkshopDate(julyFirst)).toBe("Wednesday, July 1, 2026");
    });

    it("formatWorkshopDay returns weekday only in UTC", () => {
        expect(formatWorkshopDay(julyFirst)).toBe("Wednesday");
    });

    it("formatWorkshopDateNoWeekday returns date without weekday in UTC", () => {
        expect(formatWorkshopDateNoWeekday(julyFirst)).toBe("July 1, 2026");
    });
});

describe("buildWorkshopVariables — event_time / timezone wiring", () => {
    const findUnique = db.workshop.findUnique as jest.Mock;

    function mockWorkshop(overrides: Record<string, unknown> = {}) {
        return {
            id: "ws-1",
            title: "Scaling Up Workshop",
            description: "A great workshop",
            workshopCode: "WS-2026-TEST",
            // June 15 2026 in America/Chicago is CDT
            eventDate: new Date("2026-06-15T00:00:00.000Z"),
            eventTime: "9:00 AM",
            timezone: "America/Chicago",
            format: "IN_PERSON",
            venueName: null,
            venueAddress: null,
            venueInstructions: null,
            virtualLink: null,
            isFree: false,
            priceCents: null,
            landingPageSlug: "scaling-up",
            coach: {
                firstName: "John",
                lastName: "Smith",
                bio: null,
                profileImage: null,
                company: null,
                title: null,
            },
            workshopCategory: null,
            pricingTier: null,
            ...overrides,
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("emits an event_time key carrying the DST-aware zone abbreviation", async () => {
        findUnique.mockResolvedValue(mockWorkshop());
        const vars = await buildWorkshopVariables("ws-1");
        expect(vars).not.toBeNull();
        expect(vars!.event_time).toMatch(/CDT|CST/);
        expect(vars!.event_time).toContain("9:00 AM");
    });

    it("sets workshop_time and eventTime to the same zoned value as event_time", async () => {
        findUnique.mockResolvedValue(mockWorkshop());
        const vars = await buildWorkshopVariables("ws-1");
        expect(vars!.workshop_time).toBe(vars!.event_time);
        expect(vars!.eventTime).toBe(vars!.event_time);
    });

    it("emits workshop_timezone as the bare zone abbreviation", async () => {
        findUnique.mockResolvedValue(mockWorkshop());
        const vars = await buildWorkshopVariables("ws-1");
        expect(vars!.workshop_timezone).toMatch(/^(CDT|CST)$/);
    });

    it("resolves a literal {{event_time}} token in content to the zoned time (not left literal)", async () => {
        findUnique.mockResolvedValue(mockWorkshop());
        const vars = await buildWorkshopVariables("ws-1");
        const content = '{"time":"{{event_time}}"}';
        const result = interpolateContent(content, vars!);
        const parsed = JSON.parse(result);
        expect(parsed.time).not.toBe("{{event_time}}");
        expect(parsed.time).toMatch(/CDT|CST/);
    });

    it("returns null when the workshop is not found", async () => {
        findUnique.mockResolvedValue(null);
        const vars = await buildWorkshopVariables("missing");
        expect(vars).toBeNull();
    });
});

describe("formatVenueAddress", () => {
    it("parses JSON venue address into readable string", () => {
        const json = JSON.stringify({ street: "123 Main St", city: "Dallas", state: "TX", zip: "75201" });
        expect(formatVenueAddress(json)).toBe("123 Main St, Dallas, TX, 75201");
    });
    it("handles partial address fields", () => {
        const json = JSON.stringify({ city: "Austin", state: "TX" });
        expect(formatVenueAddress(json)).toBe("Austin, TX");
    });
    it("returns empty string for null", () => {
        expect(formatVenueAddress(null)).toBe("");
    });
    it("returns raw string for non-JSON input", () => {
        expect(formatVenueAddress("123 Main St, Dallas, TX")).toBe("123 Main St, Dallas, TX");
    });
    it("returns empty string for empty JSON object", () => {
        expect(formatVenueAddress("{}")).toBe("");
    });
});
