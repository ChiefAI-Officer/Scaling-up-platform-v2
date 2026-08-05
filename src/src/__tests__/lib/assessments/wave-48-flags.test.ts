import { isQspStoryGroupEnabled } from "@/lib/assessments/wave-48-flags";

const ENABLED = "WAVE_48_QSP_STORY_GROUP_ENABLED";
const KILL = "WAVE_48_QSP_STORY_GROUP_KILL";
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

it.each(["1", "true", "TRUE", "yes"])("enables for %s", (value) => {
  process.env[ENABLED] = value;
  expect(isQspStoryGroupEnabled()).toBe(true);
});

it.each([undefined, "", "0", "false", "Yes"])(
  "stays off for %s",
  (value) => {
    if (value !== undefined) process.env[ENABLED] = value;
    expect(isQspStoryGroupEnabled()).toBe(false);
  },
);

it("lets the kill switch override enablement", () => {
  process.env[ENABLED] = "1";
  process.env[KILL] = "1";
  expect(isQspStoryGroupEnabled()).toBe(false);
});
