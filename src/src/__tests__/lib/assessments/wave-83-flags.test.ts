import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";

const ENABLED = "WAVE_83_REFERRED_RESULTS_ENABLED";
const KILL = "WAVE_83_REFERRED_RESULTS_KILL";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of [ENABLED, KILL]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of [ENABLED, KILL]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

it("is default-off and the kill switch wins", () => {
  expect(isReferredResultsEnabled()).toBe(false);
  process.env[ENABLED] = "1";
  expect(isReferredResultsEnabled()).toBe(true);
  process.env[KILL] = "1";
  expect(isReferredResultsEnabled()).toBe(false);
});
