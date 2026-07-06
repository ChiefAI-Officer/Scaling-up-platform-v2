/**
 * Wave V (V-2) — import-alerting flag matrix (KILL > ENABLED, default-OFF).
 */
import { isImportAlertingEnabled } from "@/lib/assessments/wave-v-flags";

const ENABLED = "WAVE_V_IMPORT_ALERTING_ENABLED";
const KILL = "WAVE_V_IMPORT_ALERTING_KILL";
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

it("default-OFF when everything is unset", () => {
  expect(isImportAlertingEnabled()).toBe(false);
});

it.each(["0", "false", ""])("OFF for ENABLED=%p", (v) => {
  process.env[ENABLED] = v;
  expect(isImportAlertingEnabled()).toBe(false);
});

it.each(["1", "true", "TRUE", "yes"])("ON for ENABLED=%p", (v) => {
  process.env[ENABLED] = v;
  expect(isImportAlertingEnabled()).toBe(true);
});

it("KILL beats ENABLED", () => {
  process.env[ENABLED] = "1";
  process.env[KILL] = "1";
  expect(isImportAlertingEnabled()).toBe(false);
});

it("env is read at call time (no caching)", () => {
  expect(isImportAlertingEnabled()).toBe(false);
  process.env[ENABLED] = "1";
  expect(isImportAlertingEnabled()).toBe(true);
  delete process.env[ENABLED];
  expect(isImportAlertingEnabled()).toBe(false);
});
