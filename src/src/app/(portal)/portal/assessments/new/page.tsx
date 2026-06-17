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
} from "@/lib/assessments/wave-d-feature-flags";

export default async function NewCampaignPage() {
  await requireCoach();
  const customHtmlEmailEnabled = waveDCustomHtmlEmailEnabled();
  const autoSend = waveDAutoSendEnabled();
  return (
    <div className="wf-scope max-w-3xl mx-auto">
      <CampaignWizard
        customHtmlEmailEnabled={customHtmlEmailEnabled}
        autoSend={autoSend}
      />
    </div>
  );
}
