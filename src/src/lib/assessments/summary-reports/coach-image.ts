import sharp from "sharp";
import { sha256Hex, type FrozenCoachImage } from "./canonical";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;

/** Public profile uploads only. Other legacy/Circle hosts deliberately fall back. */
export async function loadSummaryCoachImage(
  source: string | null | undefined,
  fetchImage?: typeof fetch,
): Promise<FrozenCoachImage | null> {
  if (!source) return null;
  let url: URL;
  try { url = new URL(source); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    // Reject ALL redirects; a trusted initial host must not redirect into SSRF.
    const response = await (fetchImage ?? fetch)(url.href, {
      redirect: "error", credentials: "omit", signal: controller.signal,
    });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); return null; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const input = Buffer.concat(chunks);
    // Raster signatures only, before invoking a decoder (never SVG/PDF).
    const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
    const webp = input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP";
    if (!png && !jpeg && !webp) return null;
    const decoder = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).timeout({ seconds: 2 });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS || (metadata.pages ?? 1) > 1) return null;
    const { data, info } = await decoder.rotate().resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    if (data.length > 512 * 1024) return null;
    return { mediaType: "image/png", base64: data.toString("base64"), sha256: sha256Hex(data), width: info.width, height: info.height };
  } catch {
    // Optional attribution asset: never log profile URLs or response bytes.
    return null;
  } finally {
    // Also close bodies rejected before reading (status/declared size).
    controller.abort();
    clearTimeout(timer);
  }
}
