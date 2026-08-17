import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CancelWorkshopDialog } from "@/components/workshops/cancel-workshop-dialog";
import { DeleteWorkshopDialog } from "@/components/workshops/delete-workshop-dialog";

const refresh = jest.fn();
const push = jest.fn();
const toast = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

beforeEach(() => {
  global.fetch = jest.fn();
  refresh.mockClear();
  push.mockClear();
  toast.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("responsive workshop dialogs", () => {
  test("responsive delete request locks only delete and leaves confirmation and cancel available", async () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<DeleteWorkshopDialog workshopId="workshop-0" workshopTitle="Live" responsiveEnabled />);
    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    const confirmation = screen.getByLabelText(/type the workshop title/i);
    fireEvent.change(confirmation, { target: { value: "Live" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete Permanently" }));
    expect(await screen.findByRole("button", { name: "Deleting..." })).toBeDisabled();
    expect(confirmation).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  });

  test("responsive cancel request locks only cancellation and leaves keep/dismiss available", async () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<CancelWorkshopDialog workshopId="workshop-0" workshopTitle="Live" eventDate="2099-01-01T00:00:00.000Z" responsiveEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel Workshop" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Workshop" }));
    expect(await screen.findByRole("button", { name: "Canceling..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep Workshop" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  });

  test("delete failure keeps confirmation and actions available for retry", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Delete service unavailable" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    render(
      <DeleteWorkshopDialog
        workshopId="workshop-1"
        workshopTitle="Scaling Up Live"
        responsiveEnabled
      />
    );

    const trigger = screen.getByRole("button", { name: /delete permanently/i });
    expect(trigger).toHaveClass("min-h-11");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-responsive-dialog");
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "min-h-11 min-w-11"
    );

    const confirmation = screen.getByLabelText(/type the workshop title/i);
    fireEvent.change(confirmation, { target: { value: "Scaling Up Live" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete Permanently" }));

    const summary = await screen.findByRole("alert", {
      name: /delete workshop error summary/i,
    });
    expect(summary).toHaveTextContent("Delete service unavailable");
    expect(confirmation).toHaveValue("Scaling Up Live");

    const retry = screen.getByRole("button", { name: "Delete Permanently" });
    expect(retry).toBeEnabled();
    expect(retry).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.click(retry);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/workshops"));
  });

  test("cancel dialog consumes the shared responsive dialog contract", () => {
    render(
      <CancelWorkshopDialog
        workshopId="workshop-2"
        workshopTitle="Quarterly Planning"
        eventDate="2099-01-01T00:00:00.000Z"
        responsiveEnabled
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel Workshop" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-responsive-dialog");
    expect(screen.getByRole("button", { name: "Keep Workshop" })).toHaveClass(
      "min-h-11"
    );
  });

  test("flag-off delete keeps the legacy overlay markup", () => {
    render(
      <DeleteWorkshopDialog
        workshopId="workshop-3"
        workshopTitle="Legacy Workshop"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getByText("Permanently Delete Workshop").parentElement).toHaveClass(
      "w-full max-w-md rounded-xl bg-card p-6 shadow-xl"
    );
  });
});
