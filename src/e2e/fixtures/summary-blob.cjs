/* eslint-disable @typescript-eslint/no-require-imports */
// Test-only transport for the REAL @vercel/blob SDK. No app modules are
// replaced. No real Blob credentials or outbound storage requests are allowed.
const { MockAgent, setGlobalDispatcher } = require("undici");
const { readFileSync, writeFileSync, unlinkSync } = require("node:fs");
const { join } = require("node:path");
const { randomBytes } = require("node:crypto");

const token = "vercel_blob_rw_summaryproof_000000000000000000000000000000";
const origin = "http://127.0.0.1:48999";
if (
  process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN !== token ||
  process.env.VERCEL_BLOB_API_URL !== origin ||
  !process.env.SUMMARY_PROOF_DIR?.match(/\/summary-proof-[\w-]+$/)
) throw new Error("Unsafe summary proof transport configuration");

const objects = join(process.env.SUMMARY_PROOF_DIR, "objects");
const pathPattern = /^summary-reports\/proof-[a-z-]+\/[a-f0-9-]+-[a-zA-Z0-9]{30}\.pdf$/;
function fileFor(pathname) {
  if (!pathPattern.test(pathname)) throw new Error("Unexpected proof object path");
  return join(objects, pathname.replaceAll("/", "_"));
}
function authenticated(headers) {
  const parsed = Array.isArray(headers)
    ? Object.fromEntries(Array.from({ length: headers.length / 2 }, (_, i) => [headers[i * 2].toLowerCase(), headers[i * 2 + 1]]))
    : headers;
  if (parsed.authorization !== `Bearer ${token}`) throw new Error("Unexpected proof token");
  return parsed;
}
const agent = new MockAgent();
agent.disableNetConnect();
agent.enableNetConnect((host) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host));
agent.get("https://summaryproof.public.blob.vercel-storage.com").intercept({ path: "/coach-profiles/synthetic.png", method: "GET" }).reply(() => ({
  statusCode: 200, data: readFileSync(join(process.env.SUMMARY_PROOF_DIR, "coach.png")),
  responseOptions: { headers: { "content-type": "image/png" } },
})).persist();
agent.get(origin).intercept({ path: /^\/\?pathname=/, method: "PUT" }).reply((options) => {
  const headers = authenticated(options.headers);
  if (headers["x-vercel-blob-access"] !== "private") throw new Error("Proof rejected public Blob upload");
  const requested = new URL(options.path, origin).searchParams.get("pathname");
  if (!/^summary-reports\/proof-[a-z-]+\/[a-f0-9-]+\.pdf$/.test(requested)) throw new Error("Unexpected upload path");
  const pathname = requested.replace(/\.pdf$/, `-${randomBytes(15).toString("hex")}.pdf`);
  writeFileSync(fileFor(pathname), Buffer.from(options.body));
  const url = `https://summaryproof.private.blob.vercel-storage.com/${pathname}`;
  return { statusCode: 200, data: JSON.stringify({ pathname, url, downloadUrl: url, contentType: "application/pdf", etag: "proof-etag" }), responseOptions: { headers: { "content-type": "application/json" } } };
}).persist();
agent.get(origin).intercept({ path: "/delete", method: "POST" }).reply((options) => {
  authenticated(options.headers);
  for (const pathname of JSON.parse(options.body).urls) {
    try { unlinkSync(fileFor(pathname)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return { statusCode: 200, data: "{}", responseOptions: { headers: { "content-type": "application/json" } } };
}).persist();
agent.get("https://summaryproof.private.blob.vercel-storage.com").intercept({ path: /^\/summary-reports\//, method: "GET" }).reply((options) => {
  authenticated(options.headers);
  let bytes;
  try { bytes = readFileSync(fileFor(options.path.slice(1))); }
  catch (error) { if (error.code === "ENOENT") return { statusCode: 404, data: "" }; throw error; }
  return { statusCode: 200, data: bytes, responseOptions: { headers: { "content-type": "application/pdf", "content-length": String(bytes.length), etag: "proof-etag" } } };
}).persist();
setGlobalDispatcher(agent);
