/** @jest-environment node */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { loadSummaryCoachImage } from "@/lib/assessments/summary-reports/coach-image";

const url = "https://fixture.public.blob.vercel-storage.com/coach-profiles/synthetic.png";
const image = () => sharp({ create: { width: 64, height: 32, channels: 3, background: "#2299cc" } }).png().toBuffer();

describe("creation-time coach image boundary", () => {
  it("freezes decoded PNG bytes, dimensions and identity from a public Blob upload", async () => {
    const input = await image();
    const fetcher = jest.fn(async () => new Response(input, { headers: { "content-type": "image/png" } }));
    const result = await loadSummaryCoachImage(url, fetcher);
    expect(result).not.toBeNull();
    const bytes = Buffer.from(result!.base64, "base64");
    expect(await sharp(bytes).metadata()).toMatchObject({ format: "png", width: 64, height: 32 });
    expect(result).toMatchObject({ mediaType: "image/png", width: 64, height: 32, sha256: createHash("sha256").update(bytes).digest("hex") });
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error", credentials: "omit", signal: expect.any(AbortSignal) }));
  });

  it.each([null, "", "http://fixture.public.blob.vercel-storage.com/x", "https://example.com/x", "https://127.0.0.1/x", "https://[::1]/x", "https://localhost/x", "https://fixture.public.blob.vercel-storage.com:8443/x", "https://user:pass@fixture.public.blob.vercel-storage.com/x", "https://fixture.public.blob.vercel-storage.com.evil.example/x", "https://a.b.public.blob.vercel-storage.com/x", "data:image/png;base64,aaaa", "file:///tmp/image.png"])("rejects %s without a request", async (source) => {
    const fetcher = jest.fn();
    expect(await loadSummaryCoachImage(source, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["redirect", "unavailable", "invalid", "svg", "bytes", "pixels"])("falls back safely for %s assets", async (kind) => {
    let input = await image();
    if (kind === "invalid") input = Buffer.from("not an image");
    if (kind === "svg") input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
    if (kind === "bytes") input = Buffer.alloc(5 * 1024 * 1024 + 1);
    if (kind === "pixels") input = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "red" } }).png().toBuffer();
    const fetcher = jest.fn(async () => new Response(input, { status: kind === "redirect" ? 302 : kind === "unavailable" ? 503 : 200 }));
    expect(await loadSummaryCoachImage(url, fetcher)).toBeNull();
  });

  it("aborts a stalled request within the loader deadline", async () => {
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      const pending = loadSummaryCoachImage(url, fetcher);
      await jest.advanceTimersByTimeAsync(3001);
      expect(await pending).toBeNull();
    } finally { jest.useRealTimers(); }
  });

  it("aborts the transport when an excessive declared size is rejected before reading", async () => {
    const fetcher = jest.fn(async () => new Response("ignored", { headers: { "content-length": String(6 * 1024 * 1024) } }));
    expect(await loadSummaryCoachImage(url, fetcher)).toBeNull();
    const init = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    expect(init.signal?.aborted).toBe(true);
  });
});
