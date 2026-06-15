/**
 * Wave D feature-flag readers — TDD test suite.
 *
 * Mirrors the Wave-B flag pattern (`WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED`)
 * in `/api/workshops/[id]/landing-pages/[template]/route.ts`:
 *   - Default-OFF (false) when unset / "" / "0" / "false"
 *   - ON (true) only for "1" / "true" / "TRUE" / "yes"
 *
 * `assessmentSendsPaused()` follows the same truthiness rules but its
 * semantic is inverted: true means "sends are PAUSED".
 */

import {
  waveDAutoSendEnabled,
  waveDResultsEmailEnabled,
  waveDCoachNotifyEnabled,
  waveDCustomHtmlEmailEnabled,
  assessmentSendsPaused,
} from "@/lib/assessments/wave-d-feature-flags";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Save + restore a single env var around each test. */
function withEnv(key: string, value: string | undefined, fn: () => void) {
  const prior = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
}

// ─── shared matrix ──────────────────────────────────────────────────────────

const OFF_VALUES: Array<string | undefined> = [undefined, "", "0", "false", "FALSE", "no"];
const ON_VALUES: Array<string> = ["1", "true", "TRUE", "yes"];

// Each tuple: [envVar, reader]
const ENABLE_FLAGS: Array<[string, () => boolean]> = [
  ["WAVE_D_AUTO_SEND_ENABLED", waveDAutoSendEnabled],
  ["WAVE_D_RESULTS_EMAIL_ENABLED", waveDResultsEmailEnabled],
  ["WAVE_D_COACH_NOTIFY_ENABLED", waveDCoachNotifyEnabled],
  ["WAVE_D_CUSTOM_HTML_EMAIL_ENABLED", waveDCustomHtmlEmailEnabled],
];

// ─── enable flags ───────────────────────────────────────────────────────────

describe.each(ENABLE_FLAGS)("%s", (envVar, reader) => {
  it.each(OFF_VALUES)(
    "returns false when env var is %p",
    (value) => {
      withEnv(envVar, value, () => {
        expect(reader()).toBe(false);
      });
    }
  );

  it.each(ON_VALUES)(
    "returns true when env var is %p",
    (value) => {
      withEnv(envVar, value, () => {
        expect(reader()).toBe(true);
      });
    }
  );
});

// ─── kill switch ────────────────────────────────────────────────────────────

describe("ASSESSMENT_SENDS_PAUSED / assessmentSendsPaused()", () => {
  it.each(OFF_VALUES)(
    "returns false (sends NOT paused) when env var is %p",
    (value) => {
      withEnv("ASSESSMENT_SENDS_PAUSED", value, () => {
        expect(assessmentSendsPaused()).toBe(false);
      });
    }
  );

  it.each(ON_VALUES)(
    "returns true (sends ARE paused) when env var is %p",
    (value) => {
      withEnv("ASSESSMENT_SENDS_PAUSED", value, () => {
        expect(assessmentSendsPaused()).toBe(true);
      });
    }
  );
});
