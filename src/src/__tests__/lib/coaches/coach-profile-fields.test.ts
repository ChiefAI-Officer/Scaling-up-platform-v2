import {
  DEFAULT_COACH_PROFESSIONAL_TITLE,
  resolveCoachProfessionalTitle,
} from "@/lib/coaches/coach-profile-fields";

describe("resolveCoachProfessionalTitle", () => {
  it("prefers the canonical professional title", () => {
    expect(resolveCoachProfessionalTitle({
      title: "  Master Coach  ",
      company: "A Step Above",
    })).toBe("Master Coach");
  });

  it("reads the legacy company value when title is blank", () => {
    expect(resolveCoachProfessionalTitle({ title: " ", company: " A Step Above " }))
      .toBe("A Step Above");
  });

  it("uses the product default when both values are blank", () => {
    expect(resolveCoachProfessionalTitle({ title: null, company: null }))
      .toBe(DEFAULT_COACH_PROFESSIONAL_TITLE);
  });
});
