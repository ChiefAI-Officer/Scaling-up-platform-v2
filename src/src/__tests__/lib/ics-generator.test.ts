import { generateIcsContent, IcsEventData } from "@/lib/ics-generator";

describe("ics-generator", () => {
  const baseData: IcsEventData = {
    uid: "test-uid@example.com",
    title: "Test Workshop",
    eventDate: new Date("2026-06-15T00:00:00.000Z"),
    timezone: "America/New_York",
    durationHours: 8,
  };

  it("includes METHOD:REQUEST when method is REQUEST", () => {
    const content = generateIcsContent({ ...baseData, method: "REQUEST" });
    expect(content).toContain("METHOD:REQUEST");
    expect(content).not.toContain("METHOD:PUBLISH");
  });

  it("defaults to METHOD:PUBLISH when method is omitted", () => {
    const content = generateIcsContent(baseData);
    expect(content).toContain("METHOD:PUBLISH");
  });

  it("always emits SEQUENCE:0 regardless of method", () => {
    const withPublish = generateIcsContent(baseData);
    const withRequest = generateIcsContent({ ...baseData, method: "REQUEST" });
    expect(withPublish).toContain("SEQUENCE:0");
    expect(withRequest).toContain("SEQUENCE:0");
  });
});
