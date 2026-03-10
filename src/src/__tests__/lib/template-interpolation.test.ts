import { interpolateContent, rewriteIdentityFields } from "@/lib/template-interpolation";

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
