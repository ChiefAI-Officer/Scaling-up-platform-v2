/**
 * Wave ED10 — Preview/Settings tab flag (spec 19am-plan Task 1).
 *
 * KILL > ENABLED, call-time env reads, default OFF. The flag gates the
 * ED10 Metadata→Preview + Settings tab rebuild (TabbedShell/MetadataTab
 * PRESENTATION + an additive respondent `previewMode`) — no schema/API/data
 * changes ride on it. Kill/off means the editor + live survey render
 * byte-identical to today's ED9 shell.
 */
import { isPreviewSettingsEnabled } from "@/lib/assessments/wave-ed10-flags";

const ENABLED = "WAVE_ED10_PREVIEW_SETTINGS_ENABLED";
const KILL = "WAVE_ED10_PREVIEW_SETTINGS_KILL";

describe("isPreviewSettingsEnabled", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [ENABLED, KILL]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of [ENABLED, KILL]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults OFF when nothing is set", () => {
    expect(isPreviewSettingsEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables globally for %s", (v) => {
    process.env[ENABLED] = v;
    expect(isPreviewSettingsEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays OFF for non-truthy value %j",
    (v) => {
      process.env[ENABLED] = v;
      expect(isPreviewSettingsEnabled()).toBe(false);
    },
  );

  it("KILL overrides a global enable", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isPreviewSettingsEnabled()).toBe(false);
  });

  it("KILL alone keeps it off (no double-negative)", () => {
    process.env[KILL] = "1";
    expect(isPreviewSettingsEnabled()).toBe(false);
  });

  it("reads env at call time (flip without module reload)", () => {
    expect(isPreviewSettingsEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isPreviewSettingsEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isPreviewSettingsEnabled()).toBe(false);
  });
});
