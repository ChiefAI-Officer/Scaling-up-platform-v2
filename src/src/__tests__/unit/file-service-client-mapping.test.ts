jest.mock("@vercel/blob", () => ({
  put: jest.fn(),
  del: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {},
}));

import { mapFileForClient } from "@/lib/files/file-service";

describe("mapFileForClient", () => {
  it("exposes the public Blob URL for an image", () => {
    expect(
      mapFileForClient({
        id: "image-1",
        filename: "workshop-banner.png",
        contentType: "image/png",
        blobUrl: "https://store.public.blob.vercel-storage.com/workshop-banner.png",
      }),
    ).toEqual({
      id: "image-1",
      filename: "workshop-banner.png",
      contentType: "image/png",
      downloadUrl: "/api/files/image-1/download",
      publicUrl: "https://store.public.blob.vercel-storage.com/workshop-banner.png",
    });
  });

  it("keeps the public Blob URL hidden for a document", () => {
    expect(
      mapFileForClient({
        id: "document-1",
        filename: "workshop-handout.pdf",
        contentType: "application/pdf",
        blobUrl: "https://store.public.blob.vercel-storage.com/workshop-handout.pdf",
      }),
    ).toEqual({
      id: "document-1",
      filename: "workshop-handout.pdf",
      contentType: "application/pdf",
      downloadUrl: "/api/files/document-1/download",
    });
  });
});
