import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const mockRequireCoach = jest.fn();
const mockGetApiActor = jest.fn();
const mockCampaignFindFirst = jest.fn();
const mockCampaignFindMany = jest.fn();
const mockCoachFindUnique = jest.fn();
const mockIsReferredResultsEnabled = jest.fn<boolean, []>();
const mockNotFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: () => mockRequireCoach(),
  getApiActor: () => mockGetApiActor(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      findFirst: (...args: unknown[]) => mockCampaignFindFirst(...args),
      findMany: (...args: unknown[]) => mockCampaignFindMany(...args),
    },
    coach: {
      findUnique: (...args: unknown[]) => mockCoachFindUnique(...args),
    },
  },
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: () => mockIsReferredResultsEnabled(),
}));

jest.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

import { ReferredResultsList } from "@/components/assessments/ReferredResultsList";
import CoachAssessmentsPage from "@/app/(portal)/portal/assessments/page";
import ReferredResultsPage from "@/app/(portal)/portal/assessments/referred-results/page";
import { MAX_PUBLIC_REFERRAL_CURSOR_TRAIL } from "@/lib/assessments/referred-results-page-state";

const scoredItem = {
  submissionId: "sub-1",
  submittedAt: "2026-07-10T02:42:00.000Z",
  takerName: "Jordan Lee",
  takerEmail: "jordan@example.com",
  template: {
    id: "tpl-1",
    name: "Scaling Up 4 Decisions",
    alias: "scaling-up-quick",
  },
  summary: {
    kind: "scored" as const,
    overallScore: 7.4,
    tierLabel: "Accelerating",
    domains: [
      { key: "people", label: "People", score: 8.1 },
      { key: "strategy", label: "Strategy", score: 7.6 },
      { key: "execution", label: "Execution", score: 6.2 },
      { key: "cash", label: "Cash", score: 7.7 },
    ],
  },
};

const qualitativeItem = {
  submissionId: "sub-2",
  submittedAt: "2026-07-09T07:15:00.000Z",
  takerName: "Sam Rivera",
  takerEmail: "sam@example.com",
  template: {
    id: "tpl-2",
    name: "Leadership Qualitative Assessment",
    alias: "leadership-qualitative",
  },
  summary: {
    kind: "qualitative" as const,
    label: "Completed" as const,
  },
};

const degradedItem = {
  submissionId: "sub-3",
  submittedAt: "2026-07-08T01:00:00.000Z",
  takerName: "Taylor Chen",
  takerEmail: null,
  template: {
    id: "tpl-3",
    name: "Legacy Assessment",
    alias: "legacy",
  },
  summary: {
    kind: "degraded" as const,
    label: "Result unavailable" as const,
  },
};

function scoredItemAt(index: number) {
  return {
    ...scoredItem,
    submissionId: `sub-${index}`,
    takerName: `Leader ${index}`,
    takerEmail: `leader-${index}@example.com`,
  };
}

function apiResponse(
  items: unknown[] = [scoredItem],
  nextCursor: string | null = null,
  options = [
    { id: "tpl-1", name: "Scaling Up 4 Decisions" },
    { id: "tpl-2", name: "Leadership Qualitative Assessment" },
  ],
  totalCount = 18,
  ownedTotalCount = 18,
) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      items,
      nextCursor,
      assessmentOptions: options,
      totalCount,
      ownedTotalCount,
    }),
  } as Response;
}

const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(apiResponse());
  global.fetch = mockFetch;
  window.history.replaceState({}, "", "/portal/assessments/referred-results");
  mockIsReferredResultsEnabled.mockReturnValue(false);
  mockRequireCoach.mockResolvedValue({
    coach: {
      id: "coach-1",
      email: "alex@example.com",
      firstName: "Alex",
      lastName: "Morgan",
    },
    session: { user: { name: "Alex Morgan" } },
  });
  mockGetApiActor.mockResolvedValue({
    userId: "user-1",
    email: "session-address@example.com",
    role: "COACH",
    coachId: "coach-1",
  });
  mockCoachFindUnique.mockResolvedValue({
    id: "coach-1",
    email: "canonical-coach@example.com",
    firstName: "Alex",
    certificationStatus: "ACTIVE",
    certificationExpiry: null,
  });
  mockCampaignFindFirst.mockResolvedValue({ alias: "scaling-up-quick" });
  mockCampaignFindMany.mockResolvedValue([]);
});

describe("Referred Results page ownership", () => {
  it("preserves the existing My Campaigns link card byte-path while the flag is off", async () => {
    render(await CoachAssessmentsPage());

    expect(
      screen.getByRole("heading", { name: "Your Quick Assessment link" }),
    ).toBeInTheDocument();
    expect(mockCampaignFindFirst).toHaveBeenCalledTimes(1);
  });

  it("removes the Quick Assessment link card from My Campaigns when enabled", async () => {
    mockIsReferredResultsEnabled.mockReturnValue(true);

    render(await CoachAssessmentsPage());

    expect(
      screen.queryByRole("heading", { name: "Your Quick Assessment link" }),
    ).not.toBeInTheDocument();
    expect(mockCampaignFindFirst).not.toHaveBeenCalled();
  });

  it("dark-404s the dedicated page before coach or campaign work while disabled", async () => {
    await expect(
      ReferredResultsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockRequireCoach).not.toHaveBeenCalled();
    expect(mockGetApiActor).not.toHaveBeenCalled();
    expect(mockCoachFindUnique).not.toHaveBeenCalled();
    expect(mockCampaignFindFirst).not.toHaveBeenCalled();
  });

  it("dark-404s a COACH without immutable coachId before Coach or campaign lookup", async () => {
    mockIsReferredResultsEnabled.mockReturnValue(true);
    mockGetApiActor.mockResolvedValue({
      userId: "legacy-user",
      email: "canonical-coach@example.com",
      role: "COACH",
      coachId: null,
    });

    await expect(
      ReferredResultsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockRequireCoach).not.toHaveBeenCalled();
    expect(mockCoachFindUnique).not.toHaveBeenCalled();
    expect(mockCampaignFindFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    [
      "inactive",
      {
        id: "coach-1",
        email: "canonical-coach@example.com",
        firstName: "Alex",
        certificationStatus: "DEACTIVATED",
        certificationExpiry: new Date("2027-07-30T00:00:00.000Z"),
      },
    ],
    [
      "expired",
      {
        id: "coach-1",
        email: "canonical-coach@example.com",
        firstName: "Alex",
        certificationStatus: "ACTIVE",
        certificationExpiry: new Date("2025-07-30T00:00:00.000Z"),
      },
    ],
  ])("dark-404s when the canonical Coach row is %s", async (_case, coach) => {
    mockIsReferredResultsEnabled.mockReturnValue(true);
    mockCoachFindUnique.mockResolvedValue(coach);

    await expect(
      ReferredResultsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockCampaignFindFirst).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("makes the enabled page the sole owner of the link card and forwards shareable filters", async () => {
    mockIsReferredResultsEnabled.mockReturnValue(true);

    render(
      await ReferredResultsPage({
        searchParams: Promise.resolve({
          query: "jordan",
          templateId: "tpl-1",
          cursor: ["sub-4", "sub-9"],
        }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Referred Results" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your Quick Assessment link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(
        /coach=canonical-coach%40example\.com/,
      ),
    ).toBeInTheDocument();
    expect(mockCoachFindUnique).toHaveBeenCalledWith({
      where: { id: "coach-1" },
      select: {
        id: true,
        email: true,
        firstName: true,
        certificationStatus: true,
        certificationExpiry: true,
      },
    });
    expect(mockRequireCoach).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "See the Quick Assessment results attributed to your coach link.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assessments/referred-results?query=jordan&templateId=tpl-1&cursor=sub-9&take=25",
        expect.objectContaining({ cache: "no-store" }),
      ),
    );
    expect(window.location.search).toBe(
      "?query=jordan&templateId=tpl-1&cursor=sub-4&cursor=sub-9",
    );
  });

  it("rejects a forged cursor trail before it can inflate page state", async () => {
    mockIsReferredResultsEnabled.mockReturnValue(true);

    render(
      await ReferredResultsPage({
        searchParams: Promise.resolve({
          cursor: Array.from(
            { length: MAX_PUBLIC_REFERRAL_CURSOR_TRAIL + 1 },
            (_, index) => `sub-${index}`,
          ),
        }),
      }),
    );

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assessments/referred-results?take=25",
        expect.objectContaining({ cache: "no-store" }),
      ),
    );
    expect(window.location.search).toBe("");
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("ReferredResultsList", () => {
  it("renders the approved link card and scored result treatment", async () => {
    render(
      <ReferredResultsList coachLink="https://example.test/quiz/quick?coach=a%40example.com" />,
    );

    expect(
      screen.getByRole("heading", { name: "Your Quick Assessment link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Share this link. Completed assessments will appear below."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(await screen.findByText("18")).toBeInTheDocument();
    expect(screen.getByText("18 results · newest first")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–1 of 18")).toBeInTheDocument();

    expect(screen.getAllByText("Jordan Lee")).not.toHaveLength(0);
    expect(screen.getAllByText("7.4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accelerating").length).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText("Four Decisions result").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "View report" })[0],
    ).toHaveAttribute(
      "href",
      "/assessments/public-submissions/sub-1/report",
    );
    expect(screen.getByRole("option", {
      name: "Leadership Qualitative Assessment",
    })).toHaveValue("tpl-2");
  });

  it("keeps the lifetime referral count stable while filters change the matching total", async () => {
    mockFetch.mockResolvedValue(
      apiResponse([scoredItem], null, undefined, 1, 18),
    );

    render(
      <ReferredResultsList
        coachLink="https://example.test/quiz/quick?coach=a%40example.com"
        initialQuery="Jordan"
      />,
    );

    expect(await screen.findByText("1 results · newest first")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–1 of 1")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("uses a keyboard-operable disclosure for supported Four Decisions domains only", async () => {
    mockFetch.mockResolvedValue(
      apiResponse([scoredItem, qualitativeItem, degradedItem]),
    );
    render(<ReferredResultsList coachLink={null} />);

    const details = await screen.findAllByRole("button", { name: "Details" });
    expect(details).toHaveLength(2);
    expect(details[0]).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(details[0], { key: "Enter" });
    fireEvent.click(details[0]);

    expect(details[0]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("People").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8.1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Result unavailable").length,
    ).toBeGreaterThan(0);
  });

  it("renders loading, empty, no-results, and enumeration-safe error states", async () => {
    mockFetch.mockImplementationOnce(() => new Promise(() => undefined));
    const loadingView = render(<ReferredResultsList coachLink={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading referred results",
    );
    loadingView.unmount();

    mockFetch.mockResolvedValueOnce(apiResponse([]));
    const emptyView = render(<ReferredResultsList coachLink={null} />);
    expect(
      await screen.findByText(
        /results will appear here after someone submits through your coach link/i,
      ),
    ).toBeInTheDocument();
    emptyView.unmount();

    mockFetch.mockResolvedValueOnce(apiResponse([]));
    const noResultsView = render(
      <ReferredResultsList coachLink={null} initialQuery="nobody" />,
    );
    expect(
      await screen.findByText(/no referred results match your search/i),
    ).toBeInTheDocument();
    noResultsView.unmount();

    mockFetch.mockRejectedValueOnce(new Error("database internals"));
    render(<ReferredResultsList coachLink={null} />);
    expect(
      await screen.findByText(
        "We couldn’t load referred results. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/database internals/i)).not.toBeInTheDocument();
  });

  it("sends deterministic server-backed search, filter, and cursor pagination", async () => {
    mockFetch
      .mockResolvedValueOnce(apiResponse([scoredItem], "sub-1"))
      .mockResolvedValueOnce(apiResponse([scoredItem], "sub-1", undefined, 1))
      .mockResolvedValueOnce(apiResponse([scoredItem], "sub-1", undefined, 1))
      .mockResolvedValueOnce(apiResponse([scoredItem], null, undefined, 1));

    render(<ReferredResultsList coachLink={null} />);
    await screen.findAllByText("Jordan Lee");

    const search = screen.getByRole("searchbox", {
      name: "Search referred results",
    });
    fireEvent.change(search, { target: { value: "  jordan  " } });
    fireEvent.submit(search.closest("form")!);

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assessments/referred-results?query=jordan&take=25",
        expect.objectContaining({ cache: "no-store" }),
      ),
    );
    expect(window.location.search).toBe("?query=jordan");
    expect(
      await screen.findByText("1 results · newest first"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Assessment"), {
      target: { value: "tpl-1" },
    });
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assessments/referred-results?query=jordan&templateId=tpl-1&take=25",
        expect.objectContaining({ cache: "no-store" }),
      ),
    );
    expect(
      await screen.findByText("1 results · newest first"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("cursor=sub-1"),
        expect.objectContaining({ cache: "no-store" }),
      ),
    );
    expect(
      await screen.findByText("1 results · newest first"),
    ).toBeInTheDocument();
  });

  it("does not let an older request overwrite a newer search result", async () => {
    let resolveInitial!: (response: Response) => void;
    mockFetch
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveInitial = resolve;
          }),
      )
      .mockResolvedValueOnce(
        apiResponse([qualitativeItem], null, undefined, 1, 18),
      );

    render(<ReferredResultsList coachLink={null} />);

    const search = screen.getByRole("searchbox", {
      name: "Search referred results",
    });
    fireEvent.change(search, { target: { value: "Sam" } });
    fireEvent.submit(search.closest("form")!);

    expect(await screen.findAllByText("Sam Rivera")).not.toHaveLength(0);
    expect(window.location.search).toBe("?query=Sam");

    await act(async () => {
      resolveInitial(apiResponse([scoredItem], null, undefined, 18, 18));
      await Promise.resolve();
    });

    expect(screen.getAllByText("Sam Rivera")).not.toHaveLength(0);
    expect(screen.queryByText("Jordan Lee")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?query=Sam");
  });

  it("reloads page three from a shareable cursor trail and walks back without skips or duplicate fetches", async () => {
    mockFetch
      .mockResolvedValueOnce(
        apiResponse(
          Array.from({ length: 10 }, (_, index) => scoredItemAt(index + 51)),
          null,
          undefined,
          60,
        ),
      )
      .mockResolvedValueOnce(
        apiResponse(
          Array.from({ length: 25 }, (_, index) => scoredItemAt(index + 26)),
          "sub-50",
          undefined,
          60,
        ),
      )
      .mockResolvedValueOnce(
        apiResponse(
          Array.from({ length: 25 }, (_, index) => scoredItemAt(index + 1)),
          "sub-25",
          undefined,
          60,
        ),
      );

    render(
      <ReferredResultsList
        coachLink={null}
        initialCursorTrail={["sub-25", "sub-50"]}
      />,
    );

    expect(await screen.findByText("Showing 51–60 of 60")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/assessments/referred-results?cursor=sub-50&take=25",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(window.location.search).toBe("?cursor=sub-25&cursor=sub-50");

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Showing 26–50 of 60")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/assessments/referred-results?cursor=sub-25&take=25",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(window.location.search).toBe("?cursor=sub-25");

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Showing 1–25 of 60")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/assessments/referred-results?take=25",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(window.location.search).toBe("");
  });

  it("provides desktop table and mobile card semantics without hiding content from assistive tech", async () => {
    render(<ReferredResultsList coachLink={null} />);
    await screen.findAllByText("Jordan Lee");

    const desktopTable = screen.getByRole("table", {
      name: "Referred results",
    });
    expect(desktopTable).toHaveClass("hidden");
    expect(desktopTable).toHaveClass("md:table");
    const mobileList = screen.getByTestId("referred-results-mobile");
    expect(mobileList).toHaveClass("md:hidden");
    expect(within(mobileList).getByText("Jordan Lee")).toBeInTheDocument();
  });
});
