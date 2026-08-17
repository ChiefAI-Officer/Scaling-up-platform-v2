import type {
  AssessmentCampaignAccessMode,
  AssessmentTemplateDeliveryType,
} from "@prisma/client";

const EXISTING_PUBLIC_TEMPLATE_ALIASES = new Set([
  "scaling-up-quick",
  "sunhub-quick-quiz",
]);

export function isTemplateCompatibleWithAccessMode(
  deliveryType: AssessmentTemplateDeliveryType,
  accessMode: AssessmentCampaignAccessMode,
): boolean {
  return (
    (deliveryType === "PUBLIC_MARKETING_QUIZ" && accessMode === "PUBLIC") ||
    (deliveryType === "INVITED_ASSESSMENT" && accessMode === "INVITED")
  );
}

export function canChangeTemplateDeliveryType(
  hasPublishedVersion: boolean,
): boolean {
  return !hasPublishedVersion;
}

/**
 * Used only by migration/verification tooling. Runtime eligibility reads the
 * persisted deliveryType and never calls this alias classifier.
 */
export function classifyExistingTemplateDeliveryType(
  alias: string,
): AssessmentTemplateDeliveryType {
  return EXISTING_PUBLIC_TEMPLATE_ALIASES.has(alias)
    ? "PUBLIC_MARKETING_QUIZ"
    : "INVITED_ASSESSMENT";
}
