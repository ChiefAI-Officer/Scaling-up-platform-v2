import {
  canChangeTemplateDeliveryType,
  classifyExistingTemplateDeliveryType,
  isTemplateCompatibleWithAccessMode,
} from "@/lib/assessments/template-delivery-policy";

describe("template delivery policy", () => {
  it.each([
    ["PUBLIC_MARKETING_QUIZ", "PUBLIC", true],
    ["PUBLIC_MARKETING_QUIZ", "INVITED", false],
    ["INVITED_ASSESSMENT", "PUBLIC", false],
    ["INVITED_ASSESSMENT", "INVITED", true],
  ] as const)("maps %s to %s", (deliveryType, accessMode, expected) => {
    expect(
      isTemplateCompatibleWithAccessMode(deliveryType, accessMode),
    ).toBe(expected);
  });

  it("locks delivery type after the first version is published", () => {
    expect(canChangeTemplateDeliveryType(false)).toBe(true);
    expect(canChangeTemplateDeliveryType(true)).toBe(false);
  });

  it.each([
    ["scaling-up-quick", "PUBLIC_MARKETING_QUIZ"],
    ["sunhub-quick-quiz", "PUBLIC_MARKETING_QUIZ"],
    ["leadership-vision-alignment", "INVITED_ASSESSMENT"],
    ["SCALING-UP-QUICK", "INVITED_ASSESSMENT"],
    ["", "INVITED_ASSESSMENT"],
  ] as const)("classifies existing alias %j", (alias, expected) => {
    expect(classifyExistingTemplateDeliveryType(alias)).toBe(expected);
  });
});
