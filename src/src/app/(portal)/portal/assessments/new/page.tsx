/**
 * Assessment v7.6 — New campaign wizard entry.
 * Server shell guards coach auth; hands off to the client wizard.
 */

import "@/styles/wireframes-scoped.css";
import { requireCoach } from "@/lib/auth/authorization";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";
import {
  waveDCustomHtmlEmailEnabled,
  waveDAutoSendEnabled,
  waveDResultsEmailEnabled,
  waveDCoachNotifyEnabled,
} from "@/lib/assessments/wave-d-feature-flags";
import { isCustomSlidesEnabled } from "@/lib/assessments/wave-m-flags";

export default async function NewCampaignPage() {
  await requireCoach();
  const customHtmlEmailEnabled = waveDCustomHtmlEmailEnabled();
  const autoSend = waveDAutoSendEnabled();
  const resultsEmailEnabled = waveDResultsEmailEnabled();
  const coachNotifyEnabled = waveDCoachNotifyEnabled();
  // Wave M (#19) — no campaign exists yet at create-time, so the gate is the
  // GLOBAL one (no id), matching the POST route's create-path gate exactly.
  const customSlidesEnabled = isCustomSlidesEnabled();
  return (
    <div className="wf-scope max-w-3xl mx-auto">
      <CampaignWizard
        customHtmlEmailEnabled={customHtmlEmailEnabled}
        autoSend={autoSend}
        resultsEmailEnabled={resultsEmailEnabled}
        coachNotifyEnabled={coachNotifyEnabled}
        customSlidesEnabled={customSlidesEnabled}
      />
    </div>
  );
}
