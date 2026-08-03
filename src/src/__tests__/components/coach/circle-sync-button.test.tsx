import { fireEvent, render, screen, within } from "@testing-library/react";
import { CircleSyncButton } from "@/components/coach/circle-sync-button";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  global.fetch = originalFetch;
});

it("keeps success copy and renders a nonfatal warning separately", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      message: "Synced 2 field(s) from Circle.",
      warnings: [
        {
          code: "invalid-image-url",
          field: "profileImage",
          message: "Profile image skipped because Circle supplied an invalid URL.",
        },
      ],
    }),
  });

  render(<CircleSyncButton coachId="coach-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Sync from Circle" }));

  const success = await screen.findByText("Synced 2 field(s) from Circle.");
  expect(success).toHaveClass("text-success");
  const status = screen.getByRole("status");
  expect(status).toHaveClass("border-warning/20", "bg-warning/10");
  expect(status).toHaveTextContent(
    "Profile image skipped because Circle supplied an invalid URL.",
  );
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it("renders every successful warning", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      message: "Sync completed; no profile fields were updated.",
      warnings: [
        {
          code: "invalid-image-url",
          field: "profileImage",
          message: "Profile image skipped because Circle supplied an invalid URL.",
        },
        {
          code: "future-warning",
          field: "company",
          message: "A second nonfatal warning.",
        },
      ],
    }),
  });

  render(<CircleSyncButton coachId="coach-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Sync from Circle" }));

  const status = await screen.findByRole("status");
  expect(within(status).getAllByRole("listitem")).toHaveLength(2);
  expect(status).toHaveTextContent("A second nonfatal warning.");
  expect(
    screen.queryByText("Coach profile already up to date."),
  ).not.toBeInTheDocument();
});

it("retains destructive styling for a failed sync and renders no warning block", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({
      success: false,
      error: "Circle not configured",
    }),
  });

  render(<CircleSyncButton coachId="coach-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Sync from Circle" }));

  const error = await screen.findByText("Circle not configured");
  expect(error).toHaveClass("text-destructive");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(mockRefresh).not.toHaveBeenCalled();
});
