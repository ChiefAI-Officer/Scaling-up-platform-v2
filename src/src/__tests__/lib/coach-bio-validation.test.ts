import { getCoachBioMissingFields } from "@/lib/validations";

describe("getCoachBioMissingFields", () => {
  const completeCoach = {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    title: "Scaling Up Certified Coach",
    linkedinUrl: "https://linkedin.com/in/jane-smith",
    bio: "Jane has 15 years of experience coaching executives.",
    profileImage: "https://example.com/photo.jpg",
  };

  it("returns empty array for complete profile", () => {
    expect(getCoachBioMissingFields(completeCoach)).toEqual([]);
  });

  it("returns missing fields for null values", () => {
    const incomplete = { ...completeCoach, title: null, bio: null, profileImage: null };
    const missing = getCoachBioMissingFields(incomplete);
    expect(missing.length).toBe(3);
    expect(missing).toContain("Professional title is required");
    expect(missing).toContain("Bio must be at least 10 characters");
    expect(missing).toContain("Profile photo is required");
  });

  it("returns missing fields for empty strings", () => {
    const incomplete = { ...completeCoach, firstName: "", linkedinUrl: "" };
    const missing = getCoachBioMissingFields(incomplete);
    expect(missing.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects bio shorter than 10 characters", () => {
    const shortBio = { ...completeCoach, bio: "Short" };
    const missing = getCoachBioMissingFields(shortBio);
    expect(missing).toContain("Bio must be at least 10 characters");
  });

  it("rejects invalid LinkedIn URL", () => {
    const badUrl = { ...completeCoach, linkedinUrl: "not-a-url" };
    const missing = getCoachBioMissingFields(badUrl);
    expect(missing).toContain("LinkedIn URL is required");
  });

  it("rejects invalid profileImage URL", () => {
    const badImg = { ...completeCoach, profileImage: "not-a-url" };
    const missing = getCoachBioMissingFields(badImg);
    expect(missing).toContain("Profile photo is required");
  });
});
