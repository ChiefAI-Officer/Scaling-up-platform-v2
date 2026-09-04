import { fireEvent, render, screen } from "@testing-library/react";
import { FileManager } from "@/components/files/file-manager";

jest.mock("@vercel/blob/client", () => ({ upload: jest.fn() }));

const clipboardWrite = jest.fn().mockResolvedValue(undefined);

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: clipboardWrite },
});

const image = {
  id: "image-1",
  filename: "workshop-banner.png",
  downloadUrl: "/api/files/image-1/download",
  publicUrl: "https://store.public.blob.vercel-storage.com/workshop-banner.png",
  contentType: "image/png",
  sizeBytes: 2048,
  workshopId: null,
  workshopCode: null,
  workflowStepId: null,
  uploadedBy: "admin-1",
  category: null,
  createdAt: "2026-09-03T01:00:00.000Z",
  workshop: null,
  workflowStep: null,
};

describe("FileManager image URLs", () => {
  beforeEach(() => {
    clipboardWrite.mockClear();
  });

  it("copies an image's public URL from the desktop file table", async () => {
    render(<FileManager initialFiles={[image]} workshops={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy image URL" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Image URL copied");
    expect(clipboardWrite).toHaveBeenCalledWith(image.publicUrl);
  });

  it("replaces stale success feedback when copying fails", async () => {
    clipboardWrite
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("clipboard denied"));
    render(<FileManager initialFiles={[image]} workshops={[]} />);

    const copyButton = screen.getByRole("button", { name: "Copy image URL" });
    fireEvent.click(copyButton);
    expect(await screen.findByRole("status")).toHaveTextContent("Image URL copied");

    fireEvent.click(copyButton);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not copy image URL",
    );
    expect(screen.queryByText("Image URL copied")).not.toBeInTheDocument();
  });

  it("copies an image's public URL from the compact file card", async () => {
    render(
      <FileManager initialFiles={[image]} workshops={[]} responsiveEnabled />,
    );

    const compactList = screen.getByRole("list", { name: "Files" });
    fireEvent.keyDown(
      compactList.querySelector(
        'button[aria-label="More file actions"]',
      ) as HTMLButtonElement,
      { key: "ArrowDown" },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy image URL" }));

    expect(await screen.findByText("Image URL copied")).toBeInTheDocument();
    expect(clipboardWrite).toHaveBeenCalledWith(image.publicUrl);
  });

  it("does not offer a public URL action for a document", () => {
    render(
      <FileManager
        initialFiles={[
          {
            ...image,
            id: "document-1",
            filename: "workshop-handout.pdf",
            contentType: "application/pdf",
            downloadUrl: "/api/files/document-1/download",
          },
        ]}
        workshops={[]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Copy image URL" }),
    ).not.toBeInTheDocument();
  });
});
