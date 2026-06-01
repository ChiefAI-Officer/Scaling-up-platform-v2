/**
 * TEMPLATE-02: Custom HTML override section in TemplateContentEditor.
 * Only renders for SOLO_LANDING + DUO_LANDING. Hidden entirely otherwise.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    useSearchParams: () => ({ get: jest.fn() }),
    usePathname: () => "/",
}));

import { TemplateContentEditor } from "@/components/templates/template-content-editor";

const baseProps = {
    templateId: "tpl-1",
    templateName: "Test Template",
    categoryName: "Test Category",
    isActive: false,
    initialContent: "{}",
    initialCustomCode: null,
};

function getCustomHtmlTextarea(): HTMLTextAreaElement | null {
    return screen.queryByLabelText(/custom html/i) as HTMLTextAreaElement | null;
}

describe("TemplateContentEditor — Custom HTML section", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders the Custom HTML textarea for SOLO_LANDING", () => {
        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="SOLO_LANDING"
                initialCustomHtml="<p>x</p>"
            />
        );
        const ta = getCustomHtmlTextarea();
        expect(ta).not.toBeNull();
        expect(ta!.value).toBe("<p>x</p>");
    });

    it("renders the Custom HTML textarea for DUO_LANDING", () => {
        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="DUO_LANDING"
                initialCustomHtml="<p>duo</p>"
            />
        );
        const ta = getCustomHtmlTextarea();
        expect(ta).not.toBeNull();
        expect(ta!.value).toBe("<p>duo</p>");
    });

    it("hides the Custom HTML textarea for REGISTRATION", () => {
        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="REGISTRATION"
                initialCustomHtml=""
            />
        );
        expect(getCustomHtmlTextarea()).toBeNull();
    });

    it("hides the Custom HTML textarea for THANK_YOU", () => {
        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="THANK_YOU"
                initialCustomHtml=""
            />
        );
        expect(getCustomHtmlTextarea()).toBeNull();
    });

    it("hides the Custom HTML textarea for BIO_PAGE", () => {
        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="BIO_PAGE"
                initialCustomHtml=""
            />
        );
        expect(getCustomHtmlTextarea()).toBeNull();
    });

    it("toggles the status pill between Empty and Active as content changes", () => {
        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="SOLO_LANDING"
                initialCustomHtml=""
            />
        );
        expect(
            screen.getByText(/empty\s*[—-]\s*fields below render/i)
        ).toBeInTheDocument();

        const ta = getCustomHtmlTextarea()!;
        fireEvent.change(ta, { target: { value: "<p>hello</p>" } });

        expect(
            screen.getByText(/active\s*[·•]\s*overrides fields below/i)
        ).toBeInTheDocument();
    });

    it("POSTs customHtml in the save payload when Save is clicked", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, customHtmlSanitized: false }),
        });

        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="SOLO_LANDING"
                initialCustomHtml=""
            />
        );

        const ta = getCustomHtmlTextarea()!;
        fireEvent.change(ta, { target: { value: "<p>hi</p>" } });
        fireEvent.click(screen.getByRole("button", { name: /save template/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
        });
        const call = (global.fetch as jest.Mock).mock.calls[0];
        expect(call[0]).toBe("/api/page-templates/tpl-1");
        const body = JSON.parse(call[1].body);
        expect(body.customHtml).toBe("<p>hi</p>");
    });

    it("sends customHtml as null when only whitespace is entered", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, customHtmlSanitized: false }),
        });

        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="SOLO_LANDING"
                initialCustomHtml=""
            />
        );

        const ta = getCustomHtmlTextarea()!;
        fireEvent.change(ta, { target: { value: "   \n  " } });
        fireEvent.click(screen.getByRole("button", { name: /save template/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
        });
        const call = (global.fetch as jest.Mock).mock.calls[0];
        const body = JSON.parse(call[1].body);
        expect(body.customHtml).toBeNull();
    });

    it("shows the sanitized notice when response returns customHtmlSanitized: true", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, customHtmlSanitized: true }),
        });

        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="SOLO_LANDING"
                initialCustomHtml=""
            />
        );

        const ta = getCustomHtmlTextarea()!;
        fireEvent.change(ta, { target: { value: "<p><script>x</script></p>" } });
        fireEvent.click(screen.getByRole("button", { name: /save template/i }));

        await waitFor(() => {
            expect(
                screen.getByText(/some html was sanitized for safety/i)
            ).toBeInTheDocument();
        });
    });

    it("clears the sanitized notice on a subsequent clean save", async () => {
        const fetchMock = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, customHtmlSanitized: true }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, customHtmlSanitized: false }),
            });
        global.fetch = fetchMock;

        render(
            <TemplateContentEditor
                {...baseProps}
                templateType="SOLO_LANDING"
                initialCustomHtml=""
            />
        );

        const ta = getCustomHtmlTextarea()!;
        fireEvent.change(ta, { target: { value: "<script>x</script>" } });
        fireEvent.click(screen.getByRole("button", { name: /save template/i }));

        await waitFor(() => {
            expect(
                screen.getByText(/some html was sanitized for safety/i)
            ).toBeInTheDocument();
        });

        fireEvent.change(ta, { target: { value: "<p>clean</p>" } });
        fireEvent.click(screen.getByRole("button", { name: /save template/i }));

        await waitFor(() => {
            expect(
                screen.queryByText(/some html was sanitized for safety/i)
            ).toBeNull();
        });
    });
});
