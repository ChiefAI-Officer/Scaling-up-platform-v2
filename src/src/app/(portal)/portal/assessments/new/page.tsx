/**
 * Assessment v7.6 — New campaign wizard entry.
 * Server shell guards coach auth; hands off to the client wizard.
 */

import "@/styles/wireframes-scoped.css";
import { requireCoach } from "@/lib/auth/authorization";
import { normalizeRole } from "@/lib/auth/access-control";
import type { ApiActor } from "@/lib/auth/access-control";
import { db } from "@/lib/db";
import {
  asAccessDb,
  canAccessOrganization,
  canAccessTemplate,
} from "@/lib/assessments/access-control";
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
import { isAdminOwnedAssessmentPresentationEnabled } from "@/lib/assessments/wave-admin-owned-assessment-presentation-flags";
import { getInvitationBannerAuthoringGate } from "@/lib/assessments/wave-invitation-banner-flags";

export default async function NewCampaignPage() {
  const { session, coach } = await requireCoach();
  const actor: ApiActor = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: normalizeRole(session.user.role ?? "COACH"),
    coachId: coach.id,
  };
  const accessDb = asAccessDb(db);
  const invitationBannerGate = await getInvitationBannerAuthoringGate(
    async (id) => {
      const [organizationVisible, templateVisible] = await Promise.all([
        canAccessOrganization(accessDb, actor, id),
        canAccessTemplate(accessDb, actor, id),
      ]);
      return organizationVisible || templateVisible;
    },
  );
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
  const adminOwnedPresentation =
    isAdminOwnedAssessmentPresentationEnabled();
  return (
    <div className="wf-scope max-w-3xl mx-auto">
      <CampaignWizard
        customHtmlEmailEnabled={customHtmlEmailEnabled}
        brandedCustomHtmlEnabled={brandedCustomHtmlEnabled}
        invitationBannerGate={invitationBannerGate}
        autoSend={autoSend}
        resultsEmailEnabled={resultsEmailEnabled}
        coachNotifyEnabled={coachNotifyEnabled}
        customSlidesEnabled={customSlidesEnabled}
        waveQDefaultsEnabled={waveQDefaultsEnabled}
        onScreenResultsEnabled={onScreenResultsEnabled}
        adminOwnedPresentation={adminOwnedPresentation}
      />
    </div>
  );
}
