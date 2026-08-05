/**
 * Assessment v7.6 — New campaign wizard entry.
 * Server shell guards coach auth; hands off to the client wizard.
 */

import "@/styles/wireframes-scoped.css";
import { requireCoach } from "@/lib/auth/authorization";
import { CampaignWizard } from "@/components/assessments/CampaignWizard";
import {
  waveDCustomHtmlEmailEnabled,
  assessmentInviteBrandedCustomHtmlEnabled,
  waveDAutoSendEnabled,
  waveDResultsEmailEnabled,
  waveDCoachNotifyEnabled,
} from "@/lib/assessments/wave-d-feature-flags";
import { isCustomSlidesEnabled } from "@/lib/assessments/wave-m-flags";
import { isWaveQAdminControlsEnabled } from "@/lib/assessments/wave-q-flags";
import { isOnScreenResultsEnabled } from "@/lib/assessments/wave-osr-flags";

export default async function NewCampaignPage() {
  await requireCoach();
  const customHtmlEmailEnabled = waveDCustomHtmlEmailEnabled();
  const brandedCustomHtmlEnabled = assessmentInviteBrandedCustomHtmlEnabled();
  const autoSend = waveDAutoSendEnabled();
  const resultsEmailEnabled = waveDResultsEmailEnabled();
  const coachNotifyEnabled = waveDCoachNotifyEnabled();
  // Wave M (#19) — no campaign exists yet at create-time, so the gate is the
  // GLOBAL one (no id), matching the POST route's create-path gate exactly.
  const customSlidesEnabled = isCustomSlidesEnabled();
  // Wave Q (#1) — server-only env read; the wizard receives the flag as a
  // prop (mirroring resultsEmailEnabled) and derives the #15 checkbox default
  // from the picked template's sendResultsDefault when on.
  const waveQDefaultsEnabled = isWaveQAdminControlsEnabled();
  // Wave OSR (#71) — server-only env read, handed to the wizard as a prop so it
  // can show/hide the checkbox. The flag is ALSO enforced at disclosure time in
  // the submit route; this prop only governs the UI.
  const onScreenResultsEnabled = isOnScreenResultsEnabled();
  return (
    <div className="wf-scope max-w-3xl mx-auto">
      <CampaignWizard
        customHtmlEmailEnabled={customHtmlEmailEnabled}
        brandedCustomHtmlEnabled={brandedCustomHtmlEnabled}
        autoSend={autoSend}
        resultsEmailEnabled={resultsEmailEnabled}
        coachNotifyEnabled={coachNotifyEnabled}
        customSlidesEnabled={customSlidesEnabled}
        waveQDefaultsEnabled={waveQDefaultsEnabled}
        onScreenResultsEnabled={onScreenResultsEnabled}
      />
    </div>
  );
}
