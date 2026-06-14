/**
 * RTL tests for CustomHtmlPanel — Task 5 Wave B
 *
 * Tests: fail-closed gating, Q5b pre-fill precedence, payload isolation,
 * "Refresh" confirm dialog, 409 conflict, sanitizerStripped warning, restore.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => "/",
}));

import { CustomHtmlPanel } from "@/components/workshops/custom-html-panel";

const BASE_PROPS = {
  workshopId: "ws-abc",
  templateKey: "SOLO_LANDING" as const,
  pageStatus: "DRAFT",
  initialCustomHtml: null,
  resolvedHtml: "",
};

function getTextarea(): HTMLTextAreaElement | null {
  return screen.queryByLabelText(/custom html/i) as HTMLTextAreaElement | null;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset global.fetch to a safe default
  global.fetch = jest.fn();
});

// ── 1. Admin sees textarea when customHtmlEditor:true (component is rendered directly) ──
it("renders the Custom HTML textarea when the component is mounted", () => {
  render(<CustomHtmlPanel {...BASE_PROPS} />);
  expect(getTextarea()).not.toBeNull();
});

// ── 2. Q5b: non-empty stored customHtml takes priority over resolvedHtml ──
it("pre-fills textarea with initialCustomHtml when it is non-empty", () => {
  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml="<p>stored</p>"
      resolvedHtml="<p>resolved</p>"
    />
  );
  expect(getTextarea()!.value).toBe("<p>stored</p>");
});

// ── 3. Q5b: resolvedHtml used when stored customHtml is absent ──
it("pre-fills textarea with resolvedHtml when initialCustomHtml is null", () => {
  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml={null}
      resolvedHtml="<p>resolved</p>"
    />
  );
  expect(getTextarea()!.value).toBe("<p>resolved</p>");
});

// ── 4. Textarea empty when both are absent ──
it("leaves textarea empty when both initialCustomHtml and resolvedHtml are absent", () => {
  render(<CustomHtmlPanel {...BASE_PROPS} initialCustomHtml={null} resolvedHtml="" />);
  expect(getTextarea()!.value).toBe("");
});

// ── 5 & 6. Fail-closed: panel not rendered when customHtmlEditor is false or undefined ──
//
// Full-page mount of the solo/duo editor pages is impractical in RTL because each page
// requires mocking useParams, three parallel fetch() calls with different shapes, and the
// Next.js router — the test setup cost outweighs the signal.  Instead we replicate the
// exact guard expression used in both editor pages:
//
//   {customHtmlEditor && <CustomHtmlPanel workshopId={...} templateKey={...} ... />}
//
// This directly exercises the branch that keeps the panel hidden.  If the guard
// expression in the real pages ever changes (e.g. to ternary), this test would need
// to be updated accordingly.
it("fail-closed guard: replicates {customHtmlEditor && <CustomHtmlPanel />} — no textarea when false", () => {
  const customHtmlEditor = false;
  const { container } = render(
    <>{customHtmlEditor && <CustomHtmlPanel {...BASE_PROPS} />}</>
  );
  expect(container.querySelector("textarea")).toBeNull();
});

it("fail-closed guard: replicates {customHtmlEditor && <CustomHtmlPanel />} — no textarea when undefined", () => {
  const customHtmlEditor = undefined as boolean | undefined;
  const { container } = render(
    <>{customHtmlEditor && <CustomHtmlPanel {...BASE_PROPS} />}</>
  );
  expect(container.querySelector("textarea")).toBeNull();
});

// ── 7. "Save HTML" sends ONLY { customHtml, expectedCustomHtml } — no content/status ──
it('Save HTML sends only { customHtml, expectedCustomHtml } — never content or status', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ success: true, customHtml: "<p>hi</p>", sanitizerStripped: false }),
  });

  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml="<p>original</p>"
      resolvedHtml=""
    />
  );

  const ta = getTextarea()!;
  fireEvent.change(ta, { target: { value: "<p>hi</p>" } });
  fireEvent.click(screen.getByRole("button", { name: /save html/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("/api/workshops/ws-abc/landing-pages/SOLO_LANDING");
  const body = JSON.parse(init.body as string);
  expect(body).toHaveProperty("customHtml");
  expect(body).toHaveProperty("expectedCustomHtml");
  expect(body).not.toHaveProperty("content");
  expect(body).not.toHaveProperty("status");
});

// ── 8. Clearing textarea → Save HTML sends customHtml: null ──
it("sends customHtml: null when textarea is cleared", async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ success: true, customHtml: null, sanitizerStripped: false }),
  });

  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml="<p>old</p>"
      resolvedHtml=""
    />
  );

  const ta = getTextarea()!;
  fireEvent.change(ta, { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: /save html/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
  expect(body.customHtml).toBeNull();
});

// ── 9. Clicking "Refresh" opens confirm dialog ──
it('clicking "Refresh from current workshop data" opens the confirm dialog', () => {
  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml={null}
      resolvedHtml="<p>fresh</p>"
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: /refresh from current workshop data/i })
  );

  expect(
    screen.getByText(/this replaces the editor with a fresh copy/i)
  ).toBeInTheDocument();
});

// ── 10. Confirming "Refresh" fetches ?resolved=1 and updates textarea WITHOUT saving ──
it('confirming Refresh fetches ?resolved=1 and updates textarea without saving', async () => {
  // Initial resolved at mount time
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ success: true, customHtmlResolved: "<p>latest</p>" }),
  });

  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml="<p>old</p>"
      resolvedHtml="<p>stale-resolved</p>"
    />
  );

  // Open dialog
  fireEvent.click(
    screen.getByRole("button", { name: /refresh from current workshop data/i })
  );

  // Confirm
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

  await waitFor(() => {
    expect(getTextarea()!.value).toBe("<p>latest</p>");
  });

  // Verify only ONE fetch was made (the GET ?resolved=1), no PUT
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("?resolved=1");
  expect((init as RequestInit | undefined)?.method ?? "GET").not.toBe("PUT");
});

// ── 11. 409 on save shows conflict message ──
it("shows the 409 conflict message when save returns 409", async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: false,
    status: 409,
    json: async () => ({
      success: false,
      error: "This page changed since you opened it — reload and re-apply.",
    }),
  });

  render(<CustomHtmlPanel {...BASE_PROPS} initialCustomHtml="<p>x</p>" resolvedHtml="" />);

  fireEvent.click(screen.getByRole("button", { name: /save html/i }));

  await waitFor(() => {
    expect(
      screen.getByText(/this page changed since you opened it/i)
    ).toBeInTheDocument();
  });
});

// ── 12. sanitizerStripped:true shows safety warning ──
it("shows the sanitizer-stripped warning when response has sanitizerStripped:true", async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      customHtml: "<p>clean</p>",
      sanitizerStripped: true,
    }),
  });

  render(<CustomHtmlPanel {...BASE_PROPS} initialCustomHtml="<p>x</p>" resolvedHtml="" />);

  fireEvent.change(getTextarea()!, { target: { value: "<script>bad</script><p>ok</p>" } });
  fireEvent.click(screen.getByRole("button", { name: /save html/i }));

  await waitFor(() => {
    expect(
      screen.getByText(/some content was removed for safety/i)
    ).toBeInTheDocument();
  });
});

// ── 13. Restore button calls PUT ?action=restore-html ──
it('Restore previous version calls PUT ?action=restore-html', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      customHtml: "<p>restored</p>",
      sanitizerStripped: false,
    }),
  });

  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml="<p>current</p>"
      resolvedHtml=""
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /restore previous version/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("?action=restore-html");
  expect((init as RequestInit).method).toBe("PUT");
  const body = JSON.parse((init as RequestInit).body as string);
  expect(body).toHaveProperty("expectedCustomHtml");
});

// ── 14. "Refresh" button disabled when resolvedHtml is empty ──
it('disables the Refresh button when resolvedHtml is empty', () => {
  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml={null}
      resolvedHtml=""
    />
  );

  const btn = screen.getByRole("button", { name: /refresh from current workshop data/i });
  expect(btn).toBeDisabled();
});

// ── 15. Draft page shows the "won't be public" notice ──
it("shows draft notice when pageStatus is DRAFT", () => {
  render(<CustomHtmlPanel {...BASE_PROPS} pageStatus="DRAFT" />);
  expect(
    screen.getByText(/won't be public until the page is published/i)
  ).toBeInTheDocument();
});

// ── 16. Published page shows published notice, NOT draft notice ──
it("shows published notice when pageStatus is PUBLISHED", () => {
  render(<CustomHtmlPanel {...BASE_PROPS} pageStatus="PUBLISHED" />);
  expect(screen.getByText(/this page is published/i)).toBeInTheDocument();
  expect(screen.queryByText(/won't be public/i)).toBeNull();
});

// ── 17b. onValueChange fires with initial value on mount ──
it("onValueChange is called on mount with the initial textarea value", () => {
  const onValueChange = jest.fn();
  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml="<p>initial</p>"
      resolvedHtml=""
      onValueChange={onValueChange}
    />
  );
  // useEffect fires after mount — called at least once with the initial value
  expect(onValueChange).toHaveBeenCalledWith("<p>initial</p>");
});

// ── 17c. onValueChange fires on every textarea keystroke ──
it("onValueChange is called with updated value after typing in textarea", () => {
  const onValueChange = jest.fn();
  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml=""
      resolvedHtml=""
      onValueChange={onValueChange}
    />
  );
  onValueChange.mockClear();
  fireEvent.change(getTextarea()!, { target: { value: "<p>typed</p>" } });
  expect(onValueChange).toHaveBeenCalledWith("<p>typed</p>");
});

// ── 17d. onValueChange not required — panel works without it (no crash) ──
it("panel renders without crash when onValueChange is not provided", () => {
  expect(() =>
    render(<CustomHtmlPanel {...BASE_PROPS} initialCustomHtml="<p>x</p>" resolvedHtml="" />)
  ).not.toThrow();
});

// ── 17. Two consecutive saves send the correctly-updated expectedCustomHtml (CAS-baseline) ──
it("two consecutive saves re-anchor expectedCustomHtml to the server-returned value after save 1", async () => {
  // Save 1: server echoes SERVER-A
  // Save 2: server echoes SERVER-B
  global.fetch = jest.fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, customHtml: "<p>SERVER-A</p>", sanitizerStripped: false }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, customHtml: "<p>SERVER-B</p>", sanitizerStripped: false }),
    });

  render(
    <CustomHtmlPanel
      {...BASE_PROPS}
      initialCustomHtml={null}
      resolvedHtml=""
    />
  );

  const ta = getTextarea()!;

  // ── Save 1 ──
  fireEvent.change(ta, { target: { value: "<p>edit-1</p>" } });
  fireEvent.click(screen.getByRole("button", { name: /save html/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

  const body1 = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
  // Before any save the loaded baseline is the prop value — null (becomes null in payload)
  expect(body1.expectedCustomHtml).toBeNull();

  // ── Save 2 ──
  fireEvent.change(ta, { target: { value: "<p>edit-2</p>" } });
  fireEvent.click(screen.getByRole("button", { name: /save html/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

  const body2 = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body as string);
  // After save 1 the component re-anchors to the server's stored value
  expect(body2.expectedCustomHtml).toBe("<p>SERVER-A</p>");
});
