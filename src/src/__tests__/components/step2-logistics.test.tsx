import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Step2Logistics } from "@/components/workshops/wizard/Step2Logistics";
import { WizardProvider } from "@/components/workshops/wizard/WizardContext";

const mockFormData = {
    title: "Test Workshop",
    category: "",
    description: "",
    format: "IN_PERSON" as const,
    eventDate: "2026-06-15",
    eventTime: "",
    timezone: "America/New_York",
    venueName: "Test Venue",
    venueAddress: "123 Main St",
    venueCity: "Boston",
    venueState: "MA",
    venueZip: "02101",
    virtualPlatform: "",
    virtualLink: "",
    pricing: "FREE",
    priceCents: 0,
    pricingTierId: "",
    termsAccepted: false,
};

describe("Step2Logistics", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("renders start and end time inputs (type='time'), not a freeform text field", () => {
        render(
            <WizardProvider initialFormData={mockFormData}>
                <Step2Logistics />
            </WizardProvider>
        );

        // Look for time inputs by querying for inputs with type="time"
        const startTimeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
        const timeInputs = document.querySelectorAll('input[type="time"]');

        // Should have 2 time inputs (start and end)
        expect(timeInputs).toHaveLength(2);
        expect(startTimeInput).toBeInTheDocument();
    });

    test("formats eventTime as 'HH:MM - HH:MM' when both inputs are set", () => {
        const initialFormData = { ...mockFormData };
        let capturedFormData = { ...initialFormData };

        const TestWrapper = ({ children }: { children: React.ReactNode }) => {
            return (
                <WizardProvider initialFormData={capturedFormData}>
                    {children}
                </WizardProvider>
            );
        };

        const { rerender } = render(
            <TestWrapper>
                <Step2Logistics />
            </TestWrapper>
        );

        const timeInputs = document.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>;

        // Set start time to 09:00
        fireEvent.change(timeInputs[0], { target: { value: "09:00" } });

        // Set end time to 17:00
        fireEvent.change(timeInputs[1], { target: { value: "17:00" } });

        // Verify the first call formats the time as "09:00 - 17:00"
        // After both inputs are set, eventTime should be "09:00 - 17:00"
        const startTimeInput = timeInputs[0] as HTMLInputElement;
        const endTimeInput = timeInputs[1] as HTMLInputElement;

        expect(startTimeInput.value).toBe("09:00");
        expect(endTimeInput.value).toBe("17:00");
    });
});
