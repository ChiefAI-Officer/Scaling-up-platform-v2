import { TextDecoder, TextEncoder } from "node:util";

export class RequestBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

/** Read and decode a request body while enforcing the cap on actual bytes. */
export async function readJsonBodyCapped(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }
  // Some test/runtime Request polyfills expose json() but not body. Preserve
  // the same byte contract after parsing in that compatibility lane; real
  // Fetch/Next requests take the streaming path below.
  if (!request.body) {
    const parsed = await request.json();
    if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes);
    }
    return parsed;
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text ? JSON.parse(text) : {};
}
