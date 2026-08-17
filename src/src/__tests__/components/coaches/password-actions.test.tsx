import React from "react";
import * as fs from "fs";
import * as path from "path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SetPasswordButton } from "@/components/coaches/set-password-button";
import { SendPasswordResetButton } from "@/components/coaches/send-password-reset-button";

function response(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function openSetPassword() {
  render(
    <SetPasswordButton
      coachId="coach-1"
      coachName="Casey Coach"
      coachEmail="coach@example.com"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Set Password" }));
}

function enterPassword(password = "StrongPass1!", confirmation = password) {
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirmation },
  });
}

beforeEach(() => {
  global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
});

afterEach(() => jest.restoreAllMocks());

describe("SetPasswordButton", () => {
  it("validates the two fields before showing the final confirmation gate", async () => {
    openSetPassword();
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Enter and confirm a new password",
    );

    enterPassword("StrongPass1!", "DifferentPass1!");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Passwords do not match",
    );

    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "StrongPass1!" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/immediately replaces.*current password/i)).toBeInTheDocument();
    expect(screen.getByText(/signs them out of active sessions/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set Password & Sign Out Coach" }),
    ).toBeInTheDocument();
  });

  it("submits once, clears the credential fields, and reports notification success", async () => {
    let resolveFetch!: (value: Response) => void;
    (global.fetch as jest.Mock).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    openSetPassword();
    await screen.findByRole("dialog");
    enterPassword();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const submit = screen.getByRole("button", {
      name: "Set Password & Sign Out Coach",
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch(
      response({
        success: true,
        passwordUpdated: true,
        notificationSent: true,
      }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Password set and coach notified",
    );
    expect(screen.queryByDisplayValue("StrongPass1!")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/coaches/coach-1/set-password",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a retry action after partial success and retries only notification", async () => {
    let resolveRetry!: (value: Response) => void;
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        response({
          success: true,
          passwordUpdated: true,
          notificationSent: false,
          warning: "Password updated, but notification failed.",
        }),
      )
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveRetry = resolve;
        }),
      );

    openSetPassword();
    await screen.findByRole("dialog");
    enterPassword();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Set Password & Sign Out Coach" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password updated, but notification failed",
    );
    expect(screen.queryByDisplayValue("StrongPass1!")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry Notification" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: "Sending Notification…" }),
    ).toBeDisabled();
    expect(global.fetch).toHaveBeenLastCalledWith(
      "/api/coaches/coach-1/password-set-notification",
      { method: "POST" },
    );
    resolveRetry(response({ success: true, notificationSent: true }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Coach notification sent",
      ),
    );
  });
});

describe("SendPasswordResetButton", () => {
  it("uses the enhanced 15-minute confirmation dialog when enabled", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ success: true }));
    render(
      <SendPasswordResetButton
        coachId="coach-1"
        coachEmail="coach@example.com"
        enhanced
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send Password Reset" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("expires in 15 minutes");
    expect(dialog).toHaveTextContent("current password remains active");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send Reset Email" }),
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("retains the legacy browser confirmation when enhanced mode is off", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <SendPasswordResetButton
        coachId="coach-1"
        coachEmail="coach@example.com"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send Password Reset" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("coach detail action structure", () => {
  it("gates Set Password to enabled admins and renders it before reset and edit", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/coaches/[id]/page.tsx"),
      "utf8",
    );

    expect(source).toContain("isAdmin && passwordActionsEnabled");
    expect(source).toContain("flex flex-wrap justify-end gap-2");
    expect(source.indexOf("<SetPasswordButton")).toBeLessThan(
      source.indexOf("<SendPasswordResetButton"),
    );
    expect(source.indexOf("<SendPasswordResetButton")).toBeLessThan(
      source.indexOf("Edit Coach"),
    );
  });
});
