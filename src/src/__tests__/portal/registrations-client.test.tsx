import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RegistrationsClient, type CoachRegistrationView } from "@/app/(portal)/portal/registrations/registrations-client";

const baseRegistration: CoachRegistrationView = {
  id: "reg-1",
  workshopId: "ws-1",
  workshopTitle: "Scaling Up Workshop",
  workshopDate: "2026-04-30T00:00:00.000Z",
  firstName: "Alex",
  lastName: "Rivera",
  email: "alex@example.com",
  company: "Acme",
  paymentStatus: "COMPLETED",
  status: "REGISTERED",
  attended: false,
  registeredAt: "2026-03-08T00:00:00.000Z",
};

describe("RegistrationsClient", () => {
  const confirmSpy = jest.spyOn(window, "confirm");
  const fetchMock = jest.fn();

  beforeEach(() => {
    confirmSpy.mockReturnValue(true);
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    confirmSpy.mockRestore();
  });

  it("routes paid removals through admin review instead of direct delete", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: "Removal request submitted for admin review",
      }),
    });

    render(<RegistrationsClient registrations={[baseRegistration]} />);

    fireEvent.click(screen.getByRole("button", { name: /unregister/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/registrations/reg-1/removal-request",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    expect(await screen.findByText("Pending Removal")).toBeInTheDocument();
    expect(
      screen.getByText("Removal request submitted for admin review")
    ).toBeInTheDocument();
  });

  it("keeps direct delete for unpaid registrations", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: "Registration cancelled successfully",
      }),
    });

    render(
      <RegistrationsClient
        registrations={[
          {
            ...baseRegistration,
            id: "reg-2",
            paymentStatus: "FREE",
            email: "free@example.com",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /unregister/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/registrations/reg-2",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });

    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });
});
