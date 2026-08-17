import { render, screen } from "@testing-library/react";
import ChangePasswordForm from "@/components/auth/change-password-form";
import CoachRegistrationPage from "@/app/(public)/register/page";

describe("Password Hint Text", () => {
  describe("ChangePasswordForm", () => {
    it("should display '8 characters' in password hint, not '12'", () => {
      render(<ChangePasswordForm />);
      const hintText = screen.getByText(/Password must be at least 8 characters/);
      expect(hintText).toBeInTheDocument();
      expect(hintText.textContent).not.toContain("12 characters");
    });

    it("sizes its actual fields and stacked submit action only in responsive mode", () => {
      const enabled = render(<ChangePasswordForm responsiveEnabled />);
      for (const field of ["Current Password", "New Password", "Confirm New Password"]) {
        expect(screen.getByLabelText(field)).toHaveClass("min-h-11");
      }
      const submit = screen.getByRole("button", { name: "Update Password" });
      expect(submit).toHaveClass("min-h-11 w-full sm:w-auto");
      expect(submit.parentElement).toHaveClass("flex-col sm:flex-row");
      enabled.unmount();

      render(<ChangePasswordForm />);
      expect(screen.getByLabelText("Current Password")).not.toHaveClass("min-h-11");
      expect(screen.getByRole("button", { name: "Update Password" }).parentElement).toHaveAttribute(
        "class",
        "flex justify-end",
      );
    });
  });

  describe("CoachRegistrationPage", () => {
    it("should display '8 characters' in password hint, not '12'", () => {
      render(<CoachRegistrationPage />);
      const hintText = screen.getByText(/Password must be at least 8 characters/);
      expect(hintText).toBeInTheDocument();
      expect(hintText.textContent).not.toContain("12 characters");
    });
  });
});
