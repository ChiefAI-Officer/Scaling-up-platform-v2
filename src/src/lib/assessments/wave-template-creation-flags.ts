import { isSingleColumnEnabled } from "@/lib/assessments/wave-ed6-flags";
import { isFormsBuildEnabled } from "@/lib/assessments/wave-ed9-flags";
import { isQuestionEditorUnlockEnabled } from "@/lib/assessments/wave-t-flags";

/**
 * Wave Template Creation — default-OFF release gate for the simplified
 * template-creation experience. Its kill switch takes precedence; all ED6,
 * ED9, and Wave T prerequisites must be enabled. Environment values are read
 * at call time. This gate protects the new-template page, create API, and
 * version-edit page.
 */
function isOn(value: string | undefined): boolean {
  return (
    value === "1" ||
    value === "true" ||
    value === "TRUE" ||
    value === "yes"
  );
}

export function isTemplateCreationSimplifiedEnabled(): boolean {
  if (isOn(process.env.WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL)) return false;
  return (
    isOn(process.env.WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED) &&
    isSingleColumnEnabled() &&
    isFormsBuildEnabled() &&
    isQuestionEditorUnlockEnabled()
  );
}
