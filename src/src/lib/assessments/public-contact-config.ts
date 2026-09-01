import { z } from "zod";
import countryLabels from "react-phone-number-input/locale/en.json";

export const PUBLIC_CONTACT_FIELD_KEYS = [
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
] as const;

export type PublicContactFieldKey = (typeof PUBLIC_CONTACT_FIELD_KEYS)[number];

export interface PublicContactSelectOption {
  value: string;
  label: string;
}

export interface PublicContactField {
  key: PublicContactFieldKey;
  label: string;
  inputType: "text" | "email" | "tel" | "select";
  required: boolean;
  maxLength: number;
  autoComplete: string;
  options?: PublicContactSelectOption[];
}

export interface PublicContactConfigV1 {
  schemaVersion: 1;
  fields: PublicContactField[];
}

export type PublicContactConfig = PublicContactConfigV1;
export type PublicContactValues = Partial<Record<PublicContactFieldKey, string>>;
export type ValidatedPublicContactValues = PublicContactValues & {
  firstName: string;
  lastName: string;
  email: string;
};

const selectOptionSchema = z.object({
  value: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(100),
}).strict();

const contactFieldSchema = z.object({
  key: z.enum(PUBLIC_CONTACT_FIELD_KEYS),
  label: z.string().trim().min(1).max(100),
  inputType: z.enum(["text", "email", "tel", "select"]),
  required: z.boolean(),
  maxLength: z.number().int().min(1).max(1_000),
  autoComplete: z.string().trim().min(1).max(100),
  options: z.array(selectOptionSchema).min(1).max(300).optional(),
}).strict().superRefine((field, ctx) => {
  if (field.inputType === "select" && !field.options) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: "Select fields require options",
    });
  }
  if (field.inputType !== "select" && field.options) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: "Only select fields may declare options",
    });
  }
});

const publicContactConfigV1Schema = z.object({
  schemaVersion: z.literal(1),
  fields: z.array(contactFieldSchema).min(1).max(PUBLIC_CONTACT_FIELD_KEYS.length),
}).strict().superRefine((config, ctx) => {
  const seen = new Set<PublicContactFieldKey>();
  config.fields.forEach((field, index) => {
    if (seen.has(field.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["fields", index, "key"],
        message: `Duplicate contact field: ${field.key}`,
      });
    }
    seen.add(field.key);
  });
  for (const identityKey of ["firstName", "lastName", "email"] as const) {
    const field = config.fields.find((candidate) => candidate.key === identityKey);
    if (!field?.required) {
      ctx.addIssue({
        code: "custom",
        path: ["fields"],
        message: `${identityKey} must be a required contact field`,
      });
    }
  }
});

const publicContactConfigSchema = z.discriminatedUnion("schemaVersion", [
  publicContactConfigV1Schema,
]);

const NON_ISO_REGION_CODES = new Set(["AC", "TA", "XA", "XK", "XO", "ZZ"]);

export const COUNTRY_OPTIONS: readonly PublicContactSelectOption[] = Object.freeze(
  Object.entries(countryLabels)
    .filter(([code]) => /^[A-Z]{2}$/.test(code) && !NON_ISO_REGION_CODES.has(code))
    .map(([value, label]) => Object.freeze({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label)),
);

const LEGACY_FIELDS: PublicContactField[] = [
  {
    key: "firstName",
    label: "First name",
    inputType: "text",
    required: true,
    maxLength: 100,
    autoComplete: "given-name",
  },
  {
    key: "lastName",
    label: "Last name",
    inputType: "text",
    required: true,
    maxLength: 100,
    autoComplete: "family-name",
  },
  {
    key: "email",
    label: "Email",
    inputType: "email",
    required: true,
    maxLength: 320,
    autoComplete: "email",
  },
];

const FULL_ASSESSMENT_FIELDS: PublicContactField[] = [
  ...LEGACY_FIELDS,
  {
    key: "phone",
    label: "Phone",
    inputType: "tel",
    required: true,
    maxLength: 50,
    autoComplete: "tel",
  },
  {
    key: "jobTitle",
    label: "Title",
    inputType: "text",
    required: true,
    maxLength: 100,
    autoComplete: "organization-title",
  },
  {
    key: "company",
    label: "Company",
    inputType: "text",
    required: true,
    maxLength: 200,
    autoComplete: "organization",
  },
  {
    key: "numberOfEmployees",
    label: "Number of employees",
    inputType: "text",
    required: true,
    maxLength: 100,
    autoComplete: "off",
  },
  {
    key: "city",
    label: "City",
    inputType: "text",
    required: true,
    maxLength: 100,
    autoComplete: "address-level2",
  },
  {
    key: "state",
    label: "State",
    inputType: "text",
    required: false,
    maxLength: 100,
    autoComplete: "address-level1",
  },
  {
    key: "country",
    label: "Country",
    inputType: "select",
    required: true,
    maxLength: 2,
    autoComplete: "country",
    options: [...COUNTRY_OPTIONS],
  },
];

function cloneConfig(config: Readonly<PublicContactConfig>): PublicContactConfig {
  return {
    schemaVersion: config.schemaVersion,
    fields: config.fields.map((field) => ({
      ...field,
      ...(field.options
        ? { options: field.options.map((option) => ({ ...option })) }
        : {}),
    })),
  };
}

function freezeConfig(input: unknown): Readonly<PublicContactConfig> {
  const config = buildPublicContactConfig(input);
  for (const field of config.fields) {
    if (field.options) {
      for (const option of field.options) Object.freeze(option);
      Object.freeze(field.options);
    }
    Object.freeze(field);
  }
  Object.freeze(config.fields);
  return Object.freeze(config);
}

export function buildPublicContactConfig(input: unknown): PublicContactConfig {
  return publicContactConfigSchema.parse(input);
}

export const GENERIC_PUBLIC_CONTACT_CONFIG = freezeConfig({
  schemaVersion: 1,
  fields: LEGACY_FIELDS,
});

export const LEGACY_PUBLIC_CONTACT_CONFIG_BY_ALIAS: Readonly<
  Record<string, Readonly<PublicContactConfig>>
> = Object.freeze({
  "scaling-up-quick": freezeConfig({
    schemaVersion: 1,
    fields: FULL_ASSESSMENT_FIELDS,
  }),
  "sunhub-quick-quiz": freezeConfig({
    schemaVersion: 1,
    fields: LEGACY_FIELDS,
  }),
});

export function resolvePublicContactConfig(
  templateAlias: string | null | undefined,
): PublicContactConfig {
  if (
    !templateAlias ||
    !Object.prototype.hasOwnProperty.call(
      LEGACY_PUBLIC_CONTACT_CONFIG_BY_ALIAS,
      templateAlias,
    )
  ) {
    return cloneConfig(GENERIC_PUBLIC_CONTACT_CONFIG);
  }
  return cloneConfig(LEGACY_PUBLIC_CONTACT_CONFIG_BY_ALIAS[templateAlias]);
}

function valueSchemaFor(field: PublicContactField): z.ZodTypeAny {
  let schema = z.string().trim().max(field.maxLength);
  if (field.required) schema = schema.min(1);
  if (field.inputType === "email") {
    return schema.email().transform((value) => value.toLowerCase());
  }
  if (field.inputType === "select") {
    const allowed = new Set(field.options?.map((option) => option.value) ?? []);
    schema = schema.refine((value) => allowed.has(value), {
      message: `Invalid ${field.label}`,
    });
  }
  return field.required ? schema : schema.optional();
}

export function parsePublicContactValues(
  templateAlias: string | null | undefined,
  input: unknown,
): ValidatedPublicContactValues {
  const shape: Record<string, z.ZodTypeAny> = Object.create(null);
  for (const field of resolvePublicContactConfig(templateAlias).fields) {
    shape[field.key] = valueSchemaFor(field);
  }
  return z.object(shape).strict().parse(input) as ValidatedPublicContactValues;
}
