/**
 * E1.2 — Publish failure modal wiring on AssessmentTemplateDetail.
 *
 * Covers:
 *   - 422 with issues[] opens PublishFailureModal showing each issue's
 *     formatted path + message; generic toast does NOT fire.
 *   - 422 without a valid issues[] falls through to the generic
 *     "Could not publish" toast (no modal).
 *   - 409 surfaces the "Already published" toast (no modal).
 *   - 500 surfaces the generic "Could not publish" toast (no modal).
 *   - 200 fires the success toast and calls router.refresh() (no modal).
 *   - Clicking Close on the modal clears state (modal disappears).
 */

import React from "react";
import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";

import { AssessmentTemplateDetail } from "@/components/admin/AssessmentTemplateDetail";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const refreshMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: refreshMock }),
}));

// JSDOM doesn't implement window.confirm — stub to always confirm so the
// publish handler proceeds past the guard.
const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
});

beforeEach(() => {
  toastMock.mockClear();
  refreshMock.mockClear();
  (window.confirm as jest.Mock).mockClear?.();
});

afterEach(() => {
  cleanup();
});

function makeJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

const baseTemplate = {
  id: "tpl_1",
  name: "Test Template",
  alias: "test_template",
  description: null,
  invitationSubject: "Subject",
  invitationBodyMarkdown: "Body",
  aggregationMode: "FULL_VISIBILITY" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  versions: [
    {
      id: "ver_1",
      versionNumber: 1,
      language: "en",
      publishedAt: null,
      publishedBy: null,
      contentHash: "abcdef0123456789",
      createdAt: new Date().toISOString(),
    },
  ],
};

/**
 * Mount the component with a fetch mock that:
 *   - returns the base template detail on GET
 *   - returns the configured publish response on POST to the publish route
 */
function mountWithPublishResponse(publishResponse: Response) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (method === "GET" && url.includes("/api/admin/assessment-templates/tpl_1")) {
      return makeJsonResponse({ success: true, data: baseTemplate });
    }
    if (method === "POST" && url.includes("/publish")) {
      return publishResponse;
    }
    return makeJsonResponse({ success: true, data: {} });
  }) as unknown as typeof fetch;
}

async function renderAndWaitForLoad() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<AssessmentTemplateDetail templateId="tpl_1" />);
  });
  await waitFor(() => {
    expect(screen.queryByText(/Loading template/i)).not.toBeInTheDocument();
  });
  return result!;
}

async function clickPublish() {
  const btn = screen.getByTestId("publish-version-ver_1");
  await act(async () => {
    fireEvent.click(btn);
  });
}

describe("AssessmentTemplateDetail — publish failure handling", () => {
  it("422 with issues[] opens the modal with each issue's path and message", async () => {
    mountWithPublishResponse(
      makeJsonResponse(
        {
          success: false,
          error: "PUBLISH_VALIDATION_FAILED",
          issues: [
            {
              path: ["scoringConfig", "domains", 0, "tiers", 1, "minMetric"],
              code: "custom",
              message: "Tier 1 minMetric must equal previous tier maxMetric.",
            },
            {
              path: ["scoringConfig", "scaleUpScore"],
              code: "invalid_type",
              message: "scaleUpScore requires a 0-10 scale.",
            },
          ],
        },
        422,
      ),
    );
    await renderAndWaitForLoad();
    await clickPublish();

    await waitFor(() => {
      expect(screen.getByTestId("publish-failure-modal")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Cannot publish — validation issues/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /scoringConfig → domains\[0\] → tiers\[1\] → minMetric/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Tier 1 minMetric must equal previous tier maxMetric\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/scoringConfig → scaleUpScore/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/scaleUpScore requires a 0-10 scale\./),
    ).toBeInTheDocument();

    // No generic toast fires when the modal opens.
    const genericToasts = toastMock.mock.calls.filter(
      ([arg]) => arg?.title === "Could not publish",
    );
    expect(genericToasts.length).toBe(0);
  });

  it("422 without a valid issues[] falls through to the generic toast (no modal)", async () => {
    mountWithPublishResponse(
      makeJsonResponse(
        { success: false, error: "PUBLISH_VALIDATION_FAILED" },
        422,
      ),
    );
    await renderAndWaitForLoad();
    await clickPublish();

    await waitFor(() => {
      const calls = toastMock.mock.calls.filter(
        ([arg]) => arg?.title === "Could not publish",
      );
      expect(calls.length).toBe(1);
    });
    expect(screen.queryByTestId("publish-failure-modal")).not.toBeInTheDocument();
  });

  it("409 shows the Already published toast (no modal)", async () => {
    mountWithPublishResponse(
      makeJsonResponse(
        { success: false, error: "ALREADY_PUBLISHED" },
        409,
      ),
    );
    await renderAndWaitForLoad();
    await clickPublish();

    await waitFor(() => {
      const calls = toastMock.mock.calls.filter(
        ([arg]) => arg?.title === "Already published",
      );
      expect(calls.length).toBe(1);
    });
    expect(screen.queryByTestId("publish-failure-modal")).not.toBeInTheDocument();
  });

  it("500 shows the generic Could not publish toast (no modal)", async () => {
    mountWithPublishResponse(
      makeJsonResponse(
        { success: false, error: "Failed to publish version" },
        500,
      ),
    );
    await renderAndWaitForLoad();
    await clickPublish();

    await waitFor(() => {
      const calls = toastMock.mock.calls.filter(
        ([arg]) => arg?.title === "Could not publish",
      );
      expect(calls.length).toBe(1);
    });
    expect(screen.queryByTestId("publish-failure-modal")).not.toBeInTheDocument();
  });

  it("200 fires the success toast and calls router.refresh() (no modal)", async () => {
    mountWithPublishResponse(
      makeJsonResponse(
        { success: true, data: { publishedAt: new Date().toISOString() } },
        200,
      ),
    );
    await renderAndWaitForLoad();
    await clickPublish();

    await waitFor(() => {
      const calls = toastMock.mock.calls.filter(
        ([arg]) => arg?.title === "Version published",
      );
      expect(calls.length).toBe(1);
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("publish-failure-modal")).not.toBeInTheDocument();
  });

  it("clicking Close clears state and dismisses the modal", async () => {
    mountWithPublishResponse(
      makeJsonResponse(
        {
          success: false,
          error: "PUBLISH_VALIDATION_FAILED",
          issues: [
            {
              path: ["scoringConfig", "tiers", 0, "minMetric"],
              code: "custom",
              message: "First tier minMetric must equal anchorMin.",
            },
          ],
        },
        422,
      ),
    );
    await renderAndWaitForLoad();
    await clickPublish();

    await waitFor(() => {
      expect(screen.getByTestId("publish-failure-modal")).toBeInTheDocument();
    });

    const closeBtn = screen.getByTestId("publish-failure-modal-close");
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("publish-failure-modal"),
      ).not.toBeInTheDocument();
    });
  });

  // E1.2 follow-on (code-review Important): malformed 422 (issues array
  // present but elements lack `path` / `message`) must NOT open the
  // modal — it would crash render. Fall through to the generic toast.
  it("422 with malformed issues array falls through to the generic toast", async () => {
    mountWithPublishResponse(
      makeJsonResponse(
        {
          success: false,
          error: "PUBLISH_VALIDATION_FAILED",
          issues: [{ code: "custom" }, { message: "missing path" }],
        },
        422,
      ),
    );
    await renderAndWaitForLoad();
    await clickPublish();

    await waitFor(() => {
      const calls = toastMock.mock.calls.filter(
        ([arg]) => arg?.title === "Could not publish",
      );
      expect(calls.length).toBe(1);
    });
    expect(
      screen.queryByTestId("publish-failure-modal"),
    ).not.toBeInTheDocument();
  });
});
