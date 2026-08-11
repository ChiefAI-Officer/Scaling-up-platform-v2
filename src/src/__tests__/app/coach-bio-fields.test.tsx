import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/lib/db", () => ({
  db: { coach: { findMany: jest.fn() } },
}));
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "coach-1" }),
}));

import BioPageIndex from "@/app/(dashboard)/bio/page";
import CoachBioEditorPage from "@/app/(dashboard)/bio/[id]/page";
import { db } from "@/lib/db";

const coach = {
  id: "coach-1",
  firstName: "Lynne",
  lastName: "Verdun",
  email: "lynne@example.com",
  title: "Master Coach",
  company: "A Step Above",
  bio: "Everything all in one package",
  profileImage: null,
  circleId: "circle-1",
  updatedAt: new Date("2026-08-11T00:00:00.000Z"),
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Admin BIO field semantics", () => {
  it("shows professional title and company in separate columns", async () => {
    (db.coach.findMany as jest.Mock).mockResolvedValue([coach]);
    render(await BioPageIndex());

    expect(screen.getByRole("columnheader", { name: "Professional Title" }))
      .toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Company Name" }))
      .toBeInTheDocument();
    expect(screen.getByText("Master Coach")).toBeInTheDocument();
    expect(screen.getByText("A Step Above")).toBeInTheDocument();
  });

  it("edits both fields and preserves company when deleting the bio", async () => {
    const patchBodies: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_input, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patchBodies.push(JSON.parse(String(init.body)));
      }
      return new Response(JSON.stringify({ success: true, data: coach }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    jest.spyOn(window, "confirm").mockReturnValue(true);

    render(<CoachBioEditorPage />);
    expect(await screen.findByLabelText("Professional Title"))
      .toHaveValue("Master Coach");
    expect(screen.getByLabelText("Company Name")).toHaveValue("A Step Above");

    fireEvent.change(screen.getByLabelText("Professional Title"), {
      target: { value: "Certified Coach" },
    });
    fireEvent.change(screen.getByLabelText("Company Name"), {
      target: { value: "Growth Partners" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Bio" }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual(expect.objectContaining({
      title: "Certified Coach",
      company: "Growth Partners",
    }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save Bio" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Bio" }));
    await waitFor(() => expect(patchBodies).toHaveLength(2));

    expect(patchBodies[1]).toEqual({
      title: null,
      bio: "",
      profileImage: "",
      circleId: null,
    });
    expect(patchBodies[1]).not.toHaveProperty("company");
  });

  it.each([
    ["Professional Title", "Certified Coach"],
    ["Company Name", "Growth Partners"],
  ])("clears the saved status when %s is edited", async (fieldLabel, value) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: coach }),
    });

    render(<CoachBioEditorPage />);
    await screen.findByLabelText("Professional Title");

    fireEvent.click(screen.getByRole("button", { name: "Save Bio" }));
    expect(await screen.findByText("Coach bio profile saved.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(fieldLabel), { target: { value } });

    expect(screen.queryByText("Coach bio profile saved.")).not.toBeInTheDocument();
  });
});
