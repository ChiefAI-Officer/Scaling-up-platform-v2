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
