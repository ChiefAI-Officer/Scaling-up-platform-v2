import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

const mockSignIn = jest.fn();

jest.mock("next-auth/react", () => ({
  getSession: jest.fn(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("framer-motion", () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
}));

import { LoginForm } from "@/app/(public)/login/login-form";

describe("login member panel", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    global.fetch = jest.fn();
  });

  it("keeps the staff form and hides the member panel when disabled", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByText("New coach?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
    expect(screen.queryByText("Taken an assessment?")).not.toBeInTheDocument();
  });

  it("shows the passwordless member entry beneath the staff form when enabled", () => {
    render(<LoginForm memberPortalEnabled />);

    expect(screen.getByText("Taken an assessment?")).toBeInTheDocument();
    expect(screen.getByText("We'll email you a link to your reports. No password needed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get a link to my reports →" })).toHaveAttribute("href", "/member/sign-in");
  });

  it("does not probe the member address on input or blur", () => {
    render(<LoginForm memberPortalEnabled />);

    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "member@example.com" } });
    fireEvent.blur(email);

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
