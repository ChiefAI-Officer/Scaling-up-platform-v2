/**
 * BUG-MAY6-6: marketing opt-in checkbox on the public registration form
 * must render checked by default (Jeff May 7 standing meeting).
 */

import { render, screen } from "@testing-library/react";
import { RegistrationForm } from "@/app/(public)/workshop/[slug]/registration-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

describe("RegistrationForm marketing opt-in default (BUG-MAY6-6)", () => {
  it("renders the marketing opt-in checkbox checked on initial mount", () => {
    render(<RegistrationForm workshopId="ws-1" isFree={false} />);
    const checkbox = screen.getByLabelText(
      /future Scaling Up events and insights/i
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});
