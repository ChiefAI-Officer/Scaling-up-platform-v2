/**
 * Wave Q (#7, ADR-0018) — Admin Users card (invite-admin-section).
 *
 * Renders REAL live admin users (role chip, coach chip, Active) merged with
 * pending invites; skips ACCEPTED invites already shown as users; Remove
 * button only when waveQEnabled and never on self/canonical rows; confirm →
 * DELETE → refresh; 4xx surfaces via the existing destructive toast.
 */

import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { InviteAdminSection } from "@/components/admin/invite-admin-section";

const USERS = [
  {
    id: "u-self",
    email: "me@scalingup.com",
    name: "Me Admin",
    role: "ADMIN",
    hasCoachProfile: false,
    self: true,
    canonical: false,
  },
  {
    id: "u-canonical",
    email: "canonical@scalingup.com",
    name: "Canonical Admin",
    role: "ADMIN",
    hasCoachProfile: false,
    self: false,
    canonical: true,
  },
  {
    id: "u-hybrid",
    email: "hybrid@scalingup.com",
    name: "Hybrid Staff",
    role: "STAFF",
    hasCoachProfile: true,
    self: false,
    canonical: false,
  },
];

const INVITES = [
  {
    id: "inv-pending",
    email: "pending@scalingup.com",
    name: "Pending Person",
    acceptedAt: null,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    // Accepted AND present in the users list — must NOT render as its own row.
    id: "inv-accepted-dup",
    email: "hybrid@scalingup.com",
    name: "Hybrid Staff",
    acceptedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  },
];

function mockFetch(overrides: { deleteStatus?: number; deleteBody?: unknown } = {}) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/admin/admin-users") && init?.method === "DELETE") {
      const status = overrides.deleteStatus ?? 200;
      return {
        ok: status < 400,
        status,
        json: async () => overrides.deleteBody ?? { success: status < 400, error: "Cannot remove" },
      } as Response;
    }
    if (url.startsWith("/api/admin/admin-users")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: USERS }),
      } as Response;
    }
    if (url.startsWith("/api/admin/invite")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: INVITES }),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("InviteAdminSection — live admin users list", () => {
  it("renders real users with role chips, coach chip, and Active status", async () => {
    mockFetch();
    render(<InviteAdminSection waveQEnabled={false} />);

    await waitFor(() =>
      expect(screen.getByText("hybrid@scalingup.com")).toBeInTheDocument()
    );

    expect(screen.getByText("me@scalingup.com")).toBeInTheDocument();
    expect(screen.getByText("canonical@scalingup.com")).toBeInTheDocument();
    expect(screen.getAllByText("ADMIN").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("STAFF")).toBeInTheDocument();
    expect(screen.getByText("Coach")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(3);
  });

  it("still renders pending invites, but skips an ACCEPTED invite whose email is already a listed user", async () => {
    mockFetch();
    render(<InviteAdminSection waveQEnabled={false} />);

    await waitFor(() =>
      expect(screen.getByText("pending@scalingup.com")).toBeInTheDocument()
    );

    // hybrid@ appears exactly once (the user row), not again as an invite row.
    expect(screen.getAllByText("hybrid@scalingup.com")).toHaveLength(1);
  });

  it("renders NO Remove buttons when waveQEnabled is false (capability is flag-gated)", async () => {
    mockFetch();
    render(<InviteAdminSection waveQEnabled={false} />);

    await waitFor(() =>
      expect(screen.getByText("hybrid@scalingup.com")).toBeInTheDocument()
    );

    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("renders Remove only on non-self, non-canonical rows when waveQEnabled", async () => {
    mockFetch();
    render(<InviteAdminSection waveQEnabled />);

    await waitFor(() =>
      expect(screen.getByText("hybrid@scalingup.com")).toBeInTheDocument()
    );

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtons).toHaveLength(1);

    // The one Remove button belongs to the hybrid row.
    const hybridRow = screen.getByText("hybrid@scalingup.com").closest(
      "[data-testid='admin-user-row']"
    ) as HTMLElement;
    expect(within(hybridRow).getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("confirm → DELETE → refetches the lists", async () => {
    const fetchMock = mockFetch();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    render(<InviteAdminSection waveQEnabled />);
    await waitFor(() =>
      expect(screen.getByText("hybrid@scalingup.com")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("Remove hybrid@scalingup.com?")
    );
    expect(confirmSpy.mock.calls[0][0]).toMatch(/locked out immediately/i);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/re-invited/i);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/admin-users/u-hybrid",
        expect.objectContaining({ method: "DELETE" })
      )
    );

    // Refresh: the users list is fetched again after the delete.
    await waitFor(() => {
      const userListFetches = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url) === "/api/admin/admin-users" &&
          !(init as RequestInit | undefined)?.method
      );
      expect(userListFetches.length).toBeGreaterThanOrEqual(2);
    });

    confirmSpy.mockRestore();
  });

  it("does NOT call DELETE when the confirm is dismissed", async () => {
    const fetchMock = mockFetch();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    render(<InviteAdminSection waveQEnabled />);
    await waitFor(() =>
      expect(screen.getByText("hybrid@scalingup.com")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE"
      )
    ).toBe(false);

    confirmSpy.mockRestore();
  });

  it("surfaces a 4xx from DELETE via the destructive toast", async () => {
    mockFetch({ deleteStatus: 400, deleteBody: { success: false, error: "Cannot remove" } });
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    render(<InviteAdminSection waveQEnabled />);
    await waitFor(() =>
      expect(screen.getByText("hybrid@scalingup.com")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "Cannot remove",
        })
      )
    );

    confirmSpy.mockRestore();
  });

  it("sizes actual invite controls and stacks compact action rows only in responsive mode", async () => {
    mockFetch();
    const enabled = render(<InviteAdminSection waveQEnabled responsiveEnabled />);
    await screen.findByText("hybrid@scalingup.com");

    expect(screen.getByLabelText("Email")).toHaveClass("min-h-11");
    expect(screen.getByLabelText("Name (optional)")).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Send Invite" })).toHaveClass("min-h-11 w-full sm:w-auto");
    expect(screen.getByRole("button", { name: "Refresh admins" })).toHaveClass("min-h-11 min-w-11");
    expect(screen.getByRole("button", { name: "Remove" })).toHaveClass("min-h-11 w-full sm:w-auto");
    expect(screen.getByRole("button", { name: "Revoke invite for pending@scalingup.com" })).toHaveClass("min-h-11 min-w-11");
    expect(screen.getByText("hybrid@scalingup.com").closest("[data-testid='admin-user-row']")).toHaveClass("flex-col sm:flex-row");
    enabled.unmount();

    render(<InviteAdminSection waveQEnabled />);
    await screen.findByText("hybrid@scalingup.com");
    expect(screen.getByLabelText("Email")).not.toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Send Invite" })).not.toHaveClass("min-h-11");
    expect(screen.getByText("hybrid@scalingup.com").closest("[data-testid='admin-user-row']")).toHaveAttribute(
      "class",
      "flex items-center justify-between p-3 rounded-lg border border-border bg-background",
    );
  });
});
