/**
 * ENH-MAY6-2: Admin Notes editor — render + save behavior.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AdminNotesEditor } from "@/components/workshops/admin-notes-editor";

describe("AdminNotesEditor", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders the textarea pre-filled with initialBody", () => {
        render(<AdminNotesEditor workshopId="w1" initialBody="prior note" />);
        const ta = screen.getByPlaceholderText(/internal notes about this workshop/i) as HTMLTextAreaElement;
        expect(ta.value).toBe("prior note");
    });

    it("renders the privacy disclaimer", () => {
        render(<AdminNotesEditor workshopId="w1" initialBody="" />);
        expect(screen.getByText(/admin\/staff only\. not visible to the coach/i)).toBeInTheDocument();
    });

    it("PATCHes /api/workshops/[id]/admin-notes when Save is clicked", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        render(<AdminNotesEditor workshopId="w1" initialBody="" />);
        const ta = screen.getByPlaceholderText(/internal notes about this workshop/i);
        fireEvent.change(ta, { target: { value: "new note" } });
        fireEvent.click(screen.getByRole("button", { name: /save notes/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/workshops/w1/admin-notes",
                expect.objectContaining({
                    method: "PATCH",
                    body: JSON.stringify({ body: "new note" }),
                })
            );
        });
        await waitFor(() => {
            expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
        });
    });

    it("surfaces server error message on non-ok response", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: false,
            status: 403,
            json: async () => ({ error: "Forbidden" }),
        });

        render(<AdminNotesEditor workshopId="w1" initialBody="" />);
        fireEvent.click(screen.getByRole("button", { name: /save notes/i }));

        await waitFor(() => {
            expect(screen.getByText(/error: forbidden/i)).toBeInTheDocument();
        });
    });
});
