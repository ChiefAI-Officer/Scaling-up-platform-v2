import { ALIAS as SCALING_UP_QUICK_ALIAS } from "../../../../prisma/seed-scaling-up-quick-assessment";
import { SUNHUB_QUICK_QUIZ_ALIAS } from "../../../../prisma/seed-sunhub-quick-quiz";
import {
  COUNTRY_OPTIONS,
  LEGACY_PUBLIC_CONTACT_CONFIG_BY_ALIAS,
  buildPublicContactConfig,
  parsePublicContactValues,
  resolvePublicContactConfig,
} from "@/lib/assessments/public-contact-config";

const LEGACY_KEYS = ["firstName", "lastName", "email"];
const FULL_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "jobTitle",
  "company",
  "numberOfEmployees",
  "city",
  "state",
  "country",
];

describe("public contact configuration", () => {
  it("resolves the evidenced full contact set from the template alias", () => {
    const config = resolvePublicContactConfig(SCALING_UP_QUICK_ALIAS);

    expect(config.fields.map((field) => field.key)).toEqual(FULL_KEYS);
    expect(config.fields.find((field) => field.key === "state")?.required).toBe(false);
    expect(config.fields.find((field) => field.key === "country")).toMatchObject({
      inputType: "select",
      required: true,
      maxLength: 2,
    });
    expect(config.fields.find((field) => field.key === "numberOfEmployees"))
      .toMatchObject({ inputType: "text" });
    expect(config.fields.some((field) => field.label.includes("Coach"))).toBe(false);
  });

  it.each([SUNHUB_QUICK_QUIZ_ALIAS, "unmapped-template", null, undefined])(
    "keeps the legacy three fields for %s",
    (alias) => {
      expect(resolvePublicContactConfig(alias).fields.map((field) => field.key))
        .toEqual(LEGACY_KEYS);
    },
  );

  it.each(["constructor", "__proto__", "toString"])(
    "treats prototype-chain key %s as an unmapped alias",
    (alias) => {
      const config = resolvePublicContactConfig(alias);
      expect(config.fields.map((field) => field.key)).toEqual(LEGACY_KEYS);
      expect(typeof config).toBe("object");
    },
  );

  it("returns clones instead of mutable shared configuration", () => {
    const first = resolvePublicContactConfig(SCALING_UP_QUICK_ALIAS);
    const second = resolvePublicContactConfig(SCALING_UP_QUICK_ALIAS);

    expect(first).not.toBe(second);
    expect(first.fields).not.toBe(second.fields);
    expect(first.fields[0]).not.toBe(second.fields[0]);
  });

  it("declares every configured alias in a repository seed", () => {
    expect(Object.keys(LEGACY_PUBLIC_CONTACT_CONFIG_BY_ALIAS).sort()).toEqual(
      [SCALING_UP_QUICK_ALIAS, SUNHUB_QUICK_QUIZ_ALIAS].sort(),
    );
  });

  it("exposes only ISO alpha-2 country values", () => {
    expect(COUNTRY_OPTIONS).toHaveLength(249);
    expect(COUNTRY_OPTIONS.map((option) => option.value)).not.toEqual(
      expect.arrayContaining(["AC", "TA", "XA", "XK", "XO", "ZZ"]),
    );
  });

  it("builder rejects duplicate field keys", () => {
    const legacy = resolvePublicContactConfig(undefined);
    expect(() => buildPublicContactConfig({
      ...legacy,
      fields: [...legacy.fields, legacy.fields[0]],
    })).toThrow();
  });
});

describe("parsePublicContactValues", () => {
  const fullValues = {
    firstName: " Ada ",
    lastName: " Lovelace ",
    email: " ADA@EXAMPLE.COM ",
    phone: "+44 20 7946 0958",
    jobTitle: "Founder",
    company: "Analytical Engines Ltd",
    numberOfEmployees: "42",
    city: "London",
    country: "GB",
  };

  it("normalizes and accepts the configured fields with optional State absent", () => {
    expect(parsePublicContactValues(SCALING_UP_QUICK_ALIAS, fullValues)).toEqual({
      ...fullValues,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    });
  });

  it("rejects a missing configured-required field", () => {
    const withoutPhone: Partial<typeof fullValues> = { ...fullValues };
    delete withoutPhone.phone;
    expect(() => parsePublicContactValues(SCALING_UP_QUICK_ALIAS, withoutPhone))
      .toThrow();
  });

  it("rejects fields not configured for the template", () => {
    expect(() => parsePublicContactValues(SUNHUB_QUICK_QUIZ_ALIAS, {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      company: "Unexpected",
    })).toThrow();
  });

  it("enforces explicit configured maximum lengths", () => {
    expect(() => parsePublicContactValues(SCALING_UP_QUICK_ALIAS, {
      ...fullValues,
      phone: "x".repeat(51),
    })).toThrow();
  });

  it("rejects non-ISO region codes from the country-label dependency", () => {
    expect(() => parsePublicContactValues(SCALING_UP_QUICK_ALIAS, {
      ...fullValues,
      country: "ZZ",
    })).toThrow();
  });
});
