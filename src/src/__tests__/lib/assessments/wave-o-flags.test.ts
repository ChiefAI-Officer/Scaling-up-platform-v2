/**
 * Wave O SU-Full import feature-flag tests.
 *
 * Mirrors the Wave N flag test suite: three levers (KILL > ENABLED > CANARY),
 * call-time env reads, org- OR template-scoped canary. Default-OFF.
 */
import { isEspertoSuFullImportEnabled } from "@/lib/assessments/wave-o-flags";

const ENABLED = "WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED";
const CANARY = "WAVE_O_ESPERTO_SUFULL_IMPORT_CANARY";
const KILL = "WAVE_O_ESPERTO_SUFULL_IMPORT_KILL";

const ORIGINAL = {
  enabled: process.env[ENABLED],
  canary: process.env[CANARY],
  kill: process.env[KILL],
};

function clear() {
  delete process.env[ENABLED];
  delete process.env[CANARY];
  delete process.env[KILL];
}

beforeEach(clear);
afterEach(clear);

afterAll(() => {
  if (ORIGINAL.enabled === undefined) delete process.env[ENABLED];
  else process.env[ENABLED] = ORIGINAL.enabled;
  if (ORIGINAL.canary === undefined) delete process.env[CANARY];
  else process.env[CANARY] = ORIGINAL.canary;
  if (ORIGINAL.kill === undefined) delete process.env[KILL];
  else process.env[KILL] = ORIGINAL.kill;
});

describe("isEspertoSuFullImportEnabled", () => {
  it("is OFF by default (no env set), with or without opts", () => {
    expect(isEspertoSuFullImportEnabled()).toBe(false);
    expect(isEspertoSuFullImportEnabled({})).toBe(false);
    expect(
      isEspertoSuFullImportEnabled({ organizationId: "org_1", templateId: "tpl_1" }),
    ).toBe(false);
  });

  describe("global ENABLED lever", () => {
    it.each(["1", "true", "TRUE", "yes"])(
      "enables globally when ENABLED=%s",
      (v) => {
        process.env[ENABLED] = v;
        expect(isEspertoSuFullImportEnabled()).toBe(true);
        expect(isEspertoSuFullImportEnabled({ organizationId: "anything" })).toBe(true);
      },
    );

    it.each(["0", "false", "", "off", "no"])(
      "stays OFF for falsy ENABLED=%s",
      (v) => {
        process.env[ENABLED] = v;
        expect(isEspertoSuFullImportEnabled({ organizationId: "org_1" })).toBe(false);
      },
    );
  });

  describe("KILL precedence", () => {
    it("overrides a global ENABLED", () => {
      process.env[ENABLED] = "1";
      process.env[KILL] = "1";
      expect(isEspertoSuFullImportEnabled({ organizationId: "org_1" })).toBe(false);
    });

    it("overrides a matching CANARY", () => {
      process.env[CANARY] = "org_1";
      process.env[KILL] = "1";
      expect(isEspertoSuFullImportEnabled({ organizationId: "org_1" })).toBe(false);
    });
  });

  describe("CANARY allowlist (org OR template scoped)", () => {
    it("enables when organizationId is in the allowlist", () => {
      process.env[CANARY] = "org_1";
      expect(isEspertoSuFullImportEnabled({ organizationId: "org_1" })).toBe(true);
      expect(isEspertoSuFullImportEnabled({ organizationId: "org_2" })).toBe(false);
    });

    it("enables when templateId is in the allowlist", () => {
      process.env[CANARY] = "tpl_sufull";
      expect(isEspertoSuFullImportEnabled({ templateId: "tpl_sufull" })).toBe(true);
      expect(isEspertoSuFullImportEnabled({ templateId: "tpl_other" })).toBe(false);
    });

    it("parses comma- and space-separated lists and trims entries", () => {
      process.env[CANARY] = " org_1 , org_2   tpl_x ";
      expect(isEspertoSuFullImportEnabled({ organizationId: "org_2" })).toBe(true);
      expect(isEspertoSuFullImportEnabled({ templateId: "tpl_x" })).toBe(true);
      expect(isEspertoSuFullImportEnabled({ organizationId: "org_3" })).toBe(false);
    });

    it("does not match when opts are empty/undefined", () => {
      process.env[CANARY] = "org_1";
      expect(isEspertoSuFullImportEnabled()).toBe(false);
      expect(isEspertoSuFullImportEnabled({})).toBe(false);
    });

    it("an empty allowlist matches nothing", () => {
      process.env[CANARY] = "   ";
      expect(isEspertoSuFullImportEnabled({ organizationId: "org_1" })).toBe(false);
    });

    it("does not treat an empty-string id as a match against empty allowlist entries", () => {
      process.env[CANARY] = "org_1,,org_2";
      expect(isEspertoSuFullImportEnabled({ organizationId: "" })).toBe(false);
    });
  });
});
