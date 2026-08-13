import { fireEvent, render, screen } from "@testing-library/react";
import { FileManager } from "@/components/files/file-manager";
import { FileRecordCard } from "@/components/files/file-record-card";

jest.mock("@vercel/blob/client", () => ({ upload: jest.fn() }));

const file = {
  id: "file-1",
  filename: "leadership-handout.pdf",
  downloadUrl: "https://files.example.test/leadership-handout.pdf",
  blobUrl: null,
  contentType: "application/pdf",
  sizeBytes: 1536,
  workshopId: "workshop-1",
  workshopCode: "WS-101",
  workflowStepId: "step-1",
  uploadedBy: "admin@example.test",
  category: "handout",
  createdAt: "2026-08-12T15:30:00.000Z",
  workshop: {
    id: "workshop-1",
    title: "Scaling Up Leadership Intensive",
    workshopCode: "WS-101",
  },
  workflowStep: {
    id: "step-1",
    stepType: "PRE_EVENT_EMAIL",
    subject: "Your workshop materials",
  },
};

describe("FileRecordCard", () => {
  it("keeps file metadata and owner actions reachable", () => {
    render(
      <FileRecordCard
        file={file}
        deleting={false}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: file.filename })).toHaveAttribute(
      "href",
      file.downloadUrl,
    );
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();
    expect(screen.getByText("handout")).toBeInTheDocument();
    expect(screen.getByText(/WS-101/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(file.workshop.title))).toBeInTheDocument();
    expect(screen.getByText(file.uploadedBy)).toBeInTheDocument();
    expect(screen.getByText("Aug 12, 2026")).toBeInTheDocument();
    expect(screen.getByText("Your workshop materials")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: /more file actions/i }), {
      key: "ArrowDown",
    });
    expect(screen.getByRole("menuitem", { name: /download/i })).toHaveAttribute(
      "href",
      file.downloadUrl,
    );
    expect(screen.getByRole("menuitem", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });

  it("uses FileManager's existing confirmation before deleting from a compact card", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    const fetchSpy = jest.fn();
    Object.defineProperty(global, "fetch", { value: fetchSpy, configurable: true });

    render(
      <FileManager
        initialFiles={[file]}
        workshops={[
          { id: "workshop-1", title: file.workshop.title, workshopCode: "WS-101" },
        ]}
        responsiveEnabled
      />,
    );

    const compactList = screen.getByRole("list", { name: "Files" });
    fireEvent.keyDown(
      compactList.querySelector('button[aria-label="More file actions"]') as HTMLButtonElement,
      { key: "ArrowDown" },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete "leadership-handout.pdf"? This cannot be undone.',
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
