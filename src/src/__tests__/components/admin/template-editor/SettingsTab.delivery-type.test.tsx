import { fireEvent, render, screen } from "@testing-library/react";

import { SettingsTab } from "@/components/admin/template-editor/SettingsTab";

function renderSettings({
  deliveryType = "INVITED_ASSESSMENT",
  hasPublishedVersion = false,
  publicMarketingCtaEnabled = true,
  reportsActive = false,
}: {
  deliveryType?: "PUBLIC_MARKETING_QUIZ" | "INVITED_ASSESSMENT";
  hasPublishedVersion?: boolean;
  publicMarketingCtaEnabled?: boolean;
  reportsActive?: boolean;
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
      reportsActive={reportsActive}
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

  it.each(["PUBLIC_MARKETING_QUIZ", "INVITED_ASSESSMENT"] as const)(
    "does not render the structured CTA editor for legacy %s data in the Reports successor",
    (deliveryType) => {
      renderSettings({ deliveryType, reportsActive: true });

      expect(screen.queryByText("Marketing call to action")).not.toBeInTheDocument();
      expect(screen.queryByText("Full Marketing")).not.toBeInTheDocument();
      expect(screen.queryByText("Scaling Up Quick")).not.toBeInTheDocument();
      expect(screen.queryByText("Start blank")).not.toBeInTheDocument();
    },
  );

  it("keeps the public structured CTA editor available for exact rollback", () => {
    renderSettings({
      deliveryType: "PUBLIC_MARKETING_QUIZ",
      reportsActive: false,
    });

    expect(screen.getByText("Marketing call to action")).toBeInTheDocument();
    expect(screen.getByText("Full Marketing")).toBeInTheDocument();
    expect(screen.getByText("Scaling Up Quick")).toBeInTheDocument();
    expect(screen.getByText("Start blank")).toBeInTheDocument();
  });
});
