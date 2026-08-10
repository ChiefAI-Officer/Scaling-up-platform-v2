import { z } from "zod";

export interface InvitedWelcomeConfigV1 {
  schemaVersion: 1;
  eyebrow: string;
  headingTemplate: string;
  ledeParagraphs: string[];
  sharingHeading: string;
  scoresHeading: string;
  scoresDescription: string;
  ctaLabel: string;
  finePrint: string | null;
}

export type InvitedWelcomeAuthoringInputV1 = Omit<
  InvitedWelcomeConfigV1,
  "schemaVersion" | "finePrint"
>;

export const RESUME_NOTE =
  "Answer in one sitting or come back later — your link stays active.";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const TEMPLATE_TOKEN = /{{[^{}]+}}/g;

function normalizedText(max: number) {
  return z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        .refine((value) => !CONTROL_CHARACTERS.test(value), {
          message: "Control characters are not allowed",
        }),
    );
}

const headingTemplateSchema = normalizedText(160).superRefine((value, ctx) => {
  const tokens: string[] = value.match(TEMPLATE_TOKEN) ?? [];
  if (!tokens.includes("{{campaignName}}")) {
    ctx.addIssue({ code: "custom", message: "Heading must contain {{campaignName}}" });
  }
  if (tokens.some((token) => token !== "{{campaignName}}")) {
    ctx.addIssue({ code: "custom", message: "Only {{campaignName}} is supported" });
  }
});

const ledeParagraphsSchema = z
  .array(normalizedText(1_000))
  .min(1)
  .max(4)
  .superRefine((paragraphs, ctx) => {
    if (paragraphs.reduce((total, paragraph) => total + paragraph.length, 0) > 2_500) {
      ctx.addIssue({ code: "custom", message: "Welcome message is limited to 2,500 characters" });
    }
  });

const authoringFieldsSchema = z.object({
  eyebrow: normalizedText(60),
  headingTemplate: headingTemplateSchema,
  ledeParagraphs: ledeParagraphsSchema,
  sharingHeading: normalizedText(120),
  scoresHeading: normalizedText(120),
  scoresDescription: normalizedText(400),
  ctaLabel: normalizedText(80),
});

export const invitedWelcomeAuthoringInputSchema = authoringFieldsSchema
  .passthrough()
  .superRefine((value, ctx) => {
    for (const key of ["schemaVersion", "finePrint"] as const) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is server-owned`,
        });
      }
    }
  })
  .transform((value): InvitedWelcomeAuthoringInputV1 => ({
    eyebrow: value.eyebrow,
    headingTemplate: value.headingTemplate,
    ledeParagraphs: value.ledeParagraphs,
    sharingHeading: value.sharingHeading,
    scoresHeading: value.scoresHeading,
    scoresDescription: value.scoresDescription,
    ctaLabel: value.ctaLabel,
  }));

export const invitedWelcomeConfigSchema = authoringFieldsSchema.extend({
  schemaVersion: z.literal(1),
  finePrint: normalizedText(1_000).nullable(),
});

const DEFAULT_WELCOME_LEDE: string[] = [
  "A quick check on how your team works together. You can answer in one sitting or come back later — your link stays active.",
];
Object.freeze(DEFAULT_WELCOME_LEDE);

export const LEGACY_WELCOME_LEDE_BY_ALIAS: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  "leadership-vision-alignment": Object.freeze([
    "The Leadership Vision Alignment Assessment lists all the leadership team members' views on the company's current status, its priorities and its future. Great for preparing your strategy sessions and priority making.",
  ]),
  "qsp-v2": Object.freeze([
    "This is your Quarterly Session Preparation Assessment. It lists all the leadership team members' views on the company's performance in the previous quarter and their ideas and wishes for the coming quarter. Great for preparing your new Quarterly Session and priority making.",
  ]),
  RockHabits: Object.freeze([
    "The checklist has been predominantly devised utilizing the Scaling Up / Rockefeller Habits 2.0 methodology, alongside academic growth models and organizational development theories. We have received input from many seasoned growth entrepreneurs, coaches, mentors and academics.",
    "We would highly recommend repeating this checklist annually, in order to keep track of your progress. In the questionnaire, each item is rated on a scale from 0 to 3, with four items in each habit.",
  ]),
  "five-dysfunctions": Object.freeze([
    "This is your Five Dysfunctions assessment. It lists all the team members' views on the five fundamentals of teamwork: trust, constructive conflict, commitment, accountability and results. Great for preparing your next team session.",
  ]),
  "scaling-up-full": Object.freeze([
    "The assessment has been predominantly devised utilizing the Scaling Up / Rockefeller Habits 2.0 methodology, alongside academic growth models and organizational development theories. We have received input from many seasoned growth entrepreneurs, coaches, mentors and academics.",
    "We hope and believe you will be positively surprised by the number of Scaling Up insights throughout your report. We would highly recommend repeating this assessment annually, in order to keep track of your progress.",
  ]),
});

export const GENERIC_INVITED_WELCOME_CONFIG: Readonly<InvitedWelcomeConfigV1> =
  Object.freeze({
    schemaVersion: 1,
    eyebrow: "You're invited",
    headingTemplate: "{{campaignName}}",
    ledeParagraphs: DEFAULT_WELCOME_LEDE,
    sharingHeading: "How your answers are shared",
    scoresHeading: "Your category scores",
    scoresDescription: "See where the team stands across each category.",
    ctaLabel: "Start the assessment",
    finePrint: null,
  });

function cloneConfig(config: Readonly<InvitedWelcomeConfigV1>): InvitedWelcomeConfigV1 {
  return { ...config, ledeParagraphs: [...config.ledeParagraphs] };
}

export function resolveLegacyInvitedWelcomeConfig(
  templateAlias: string | null | undefined,
): InvitedWelcomeConfigV1 {
  if (
    !templateAlias ||
    !Object.prototype.hasOwnProperty.call(LEGACY_WELCOME_LEDE_BY_ALIAS, templateAlias)
  ) {
    return cloneConfig(GENERIC_INVITED_WELCOME_CONFIG);
  }
  return {
    ...cloneConfig(GENERIC_INVITED_WELCOME_CONFIG),
    ledeParagraphs: [...LEGACY_WELCOME_LEDE_BY_ALIAS[templateAlias]],
    finePrint: RESUME_NOTE,
  };
}

export function buildInvitedWelcomeConfig(
  input: unknown,
  finePrint: string | null,
): InvitedWelcomeConfigV1 {
  const authoring = invitedWelcomeAuthoringInputSchema.parse(input);
  return invitedWelcomeConfigSchema.parse({
    schemaVersion: 1,
    ...authoring,
    finePrint,
  });
}

export function splitWelcomeMessage(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function interpolateWelcomeHeading(
  template: string,
  campaignName: string,
): string {
  return template.replaceAll("{{campaignName}}", campaignName);
}
