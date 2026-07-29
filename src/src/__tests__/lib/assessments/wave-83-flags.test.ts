import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";

it("is default-off and the kill switch wins", () => {
  delete process.env.WAVE_83_REFERRED_RESULTS_ENABLED;
  delete process.env.WAVE_83_REFERRED_RESULTS_KILL;
  expect(isReferredResultsEnabled()).toBe(false);
  process.env.WAVE_83_REFERRED_RESULTS_ENABLED = "1";
  expect(isReferredResultsEnabled()).toBe(true);
  process.env.WAVE_83_REFERRED_RESULTS_KILL = "1";
  expect(isReferredResultsEnabled()).toBe(false);
});
