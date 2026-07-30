import {
  readJsonBodyCapped,
  RequestBodyTooLargeError,
} from "@/lib/http/read-json-body-capped";
import { ReadableStream } from "node:stream/web";
import { TextEncoder } from "node:util";

describe("readJsonBodyCapped", () => {
  it("parses a body below the actual-byte cap", async () => {
    const request = new Request("http://localhost/submit", {
      method: "POST",
      body: JSON.stringify({ value: "ok" }),
    });
    await expect(readJsonBodyCapped(request, 100)).resolves.toEqual({
      value: "ok",
    });
  });

  it("rejects a streamed body even when Content-Length is absent", async () => {
    const request = {
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":"'));
          controller.enqueue(new TextEncoder().encode("x".repeat(100)));
          controller.enqueue(new TextEncoder().encode('"}'));
          controller.close();
        },
      }),
    } as unknown as Request;

    await expect(readJsonBodyCapped(request, 40)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("uses Content-Length only as an early rejection hint", async () => {
    const request = {
      headers: new Headers({ "Content-Length": "1000" }),
      body: null,
      json: async () => ({}),
    } as unknown as Request;
    await expect(readJsonBodyCapped(request, 40)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});
