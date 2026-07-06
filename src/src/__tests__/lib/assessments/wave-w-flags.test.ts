/**
 * Wave W — conditional-authoring flag matrix (KILL > ENABLED, default-OFF).
 */
import { isConditionalAuthoringEnabled } from "@/lib/assessments/wave-w-flags";

const ENABLED = "WAVE_W_CONDITIONAL_AUTHORING_ENABLED";
const KILL = "WAVE_W_CONDITIONAL_AUTHORING_KILL";
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
  expect(isConditionalAuthoringEnabled()).toBe(false);
});

it.each(["0", "false", ""])("OFF for ENABLED=%p", (v) => {
  process.env[ENABLED] = v;
  expect(isConditionalAuthoringEnabled()).toBe(false);
});

it.each(["1", "true", "TRUE", "yes"])("ON for ENABLED=%p", (v) => {
  process.env[ENABLED] = v;
  expect(isConditionalAuthoringEnabled()).toBe(true);
});

it("KILL beats ENABLED", () => {
  process.env[ENABLED] = "1";
  process.env[KILL] = "1";
  expect(isConditionalAuthoringEnabled()).toBe(false);
});

it("reads env at CALL time (never cached)", () => {
  expect(isConditionalAuthoringEnabled()).toBe(false);
  process.env[ENABLED] = "1";
  expect(isConditionalAuthoringEnabled()).toBe(true);
  delete process.env[ENABLED];
  expect(isConditionalAuthoringEnabled()).toBe(false);
});
