import { fireEvent, render, screen } from "@testing-library/react";

import { SettingsTab } from "@/components/admin/template-editor/SettingsTab";

function renderSettings({
  deliveryType = "INVITED_ASSESSMENT",
  hasPublishedVersion = false,
  publicMarketingCtaEnabled = true,
}: {
  deliveryType?: "PUBLIC_MARKETING_QUIZ" | "INVITED_ASSESSMENT";
  hasPublishedVersion?: boolean;
  publicMarketingCtaEnabled?: boolean;
} = {}) {
  const handleTemplateRowSave = jest.fn().mockResolvedValue(undefined);
  render(
    <SettingsTab
      templateId="tpl-1"
      templateValues={{
        name: "Test",
        alias: "test",
        description: "",
        invitationSubject: "Invitation",
        invitationBodyMarkdown: "Body",
        resultsEmailSubject: null,
        resultsEmailBodyMarkdown: null,
        resultsEmailContentApproved: false,
        aggregationMode: "FULL_VISIBILITY",
      }}
      language="enUS"
      isReadOnly={false}
      onTemplateFieldChange={jest.fn()}
      onVersionFieldChange={jest.fn()}
      handleTemplateRowSave={handleTemplateRowSave}
      templateRowSaving={false}
      templateRowError={null}
      sendResultsDefault={false}
      onSendResultsDefaultChange={jest.fn()}
      savingSendResultsDefault={false}
      waveQEnabled={false}
      reportStylePreviewCapabilities={{
        reportType: "scored",
        hasMetrics: true,
        hasNarrativeResponses: false,
      }}
      deliveryType={deliveryType}
      hasPublishedVersion={hasPublishedVersion}
      publicMarketingCtaEnabled={publicMarketingCtaEnabled}
    />,
  );
  return { handleTemplateRowSave };
}

describe("Settings assessment delivery type", () => {
  it("lets an admin correct the type before first publication", () => {
    const { handleTemplateRowSave } = renderSettings();

    fireEvent.click(
      screen.getByRole("radio", { name: /public marketing quiz/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save assessment type" }));

    expect(handleTemplateRowSave).toHaveBeenCalledWith({
      deliveryType: "PUBLIC_MARKETING_QUIZ",
    });
  });

  it("shows a locked fact after first publication", () => {
    renderSettings({
      deliveryType: "PUBLIC_MARKETING_QUIZ",
      hasPublishedVersion: true,
    });

    expect(
      screen.queryByRole("radio", { name: /public marketing quiz/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Public marketing quiz")).toBeInTheDocument();
    expect(
      screen.getByText(/locked after this template's first published version/i),
    ).toBeInTheDocument();
  });

  it("keeps the current invited-only fact while the wave is off", () => {
    renderSettings({ publicMarketingCtaEnabled: false });

    expect(screen.getByText(/invited only/i)).toBeInTheDocument();
    expect(screen.queryByText("Assessment type")).not.toBeInTheDocument();
  });
});
