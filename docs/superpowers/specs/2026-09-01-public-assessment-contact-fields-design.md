# Public Assessment Contact Fields Design

**Origin:** GH #387 post-Phase-1 S1 / Handoff I; evidence comment `#387#issuecomment-5488248766`.

## Goal

Let each Public marketing quiz template select its own code-owned contact-field set while preserving the current front-loaded `intro -> info -> form` flow. The 32-question `scaling-up-quick` template collects the evidenced incumbent contact data; the 8-question `sunhub-quick-quiz` and every unmapped template retain the current first-name, last-name, and email form.

## Settled scope

- Configuration is versioned, field-agnostic, code-owned, and resolved by `AssessmentTemplate.alias` (`templateAlias`), never `AssessmentCampaign.alias`.
- `scaling-up-quick` renders First name, Last name, Email, Phone, Title, Company, Number of employees, City, State, and Country. State is optional; the other nine are required.
- Coach Email is not rendered. Referral attribution continues to come only from the optional link parameter and the server's active-Coach verification.
- Country is a native select with a `Select...` placeholder and stable ISO alpha-2 values. Number of employees remains free text.
- Every text/select value has an explicit maximum length. The existing limits stay `firstName=100`, `lastName=100`, and `email=320`; new limits are `phone=50`, `jobTitle=100`, `company=200`, `numberOfEmployees=100`, `city=100`, `state=100`, and `country=2`.
- The existing front-loaded ordering is unchanged. The prior end-loaded decision is reported as an unresolved product/conversion deviation, not implemented.
- No admin editor, `publicConfig` persistence/PATCH path, welcome-card wiring, downstream column/UI/HubSpot surfacing, schema migration, or `org-survey` change is included.

## Configuration contract

Create `src/src/lib/assessments/public-contact-config.ts`, mirroring the shape and safeguards of `invited-welcome-config.ts`:

- `PublicContactConfigV1` and `PublicContactConfig` expose a schema-versioned contract.
- A strict Zod schema validates field keys, labels, input kinds, requiredness, maximum lengths, autocomplete hints, and select options.
- `GENERIC_PUBLIC_CONTACT_CONFIG` owns the legacy three-field fallback.
- `LEGACY_PUBLIC_CONTACT_CONFIG_BY_ALIAS` owns only seeded aliases.
- `resolvePublicContactConfig(templateAlias)` uses `Object.prototype.hasOwnProperty.call` and returns a clone, so `constructor`, `__proto__`, and `toString` cannot resolve through the prototype chain or mutate shared defaults.
- `buildPublicContactConfig(input)` is the single validating builder for future code-owned changes and later authoring.
- A seed-declaration test imports the aliases exported by `seed-scaling-up-quick-assessment.ts` and `seed-sunhub-quick-quiz.ts` and proves every map key is declared by a seed.

The field key vocabulary is closed to `firstName`, `lastName`, `email`, `phone`, `jobTitle`, `company`, `numberOfEmployees`, `city`, `state`, and `country`. That makes persistence and validation field-agnostic without accepting arbitrary attacker-selected JSON keys.

## Render and submission flow

`PublicQuizClient` resolves the contact configuration from its existing `templateAlias` prop, stores values in one typed contact-value map, and renders each definition using the existing `survey-question`, `wf-label`, and `wf-input` classes. Text, email, and telephone fields use `<input>`; Country uses `<select>`. Browser `required` and `maxLength` attributes are usability aids only.

The client submits only fields present in the resolved configuration. First name, last name, and email continue to build the respondent display/report identity.

The submit route first validates the envelope, then loads the Campaign and resolves the trusted configuration from `campaign.template.alias`. A dynamic strict Zod object derived from that configuration trims values, lowercases email, rejects a missing configured-required field, accepts an absent configured-optional field, and strips no configured value before persistence. Unknown fields are rejected. Requiredness never comes from the client.

Idempotency identity includes all validated configured contact values in stable key order. This prevents reuse of an idempotency key with a changed phone/company/etc. from being mistaken for the original request. The complete validated object is persisted to the existing `AssessmentSubmission.publicTaker` JSON column; no migration is needed.

## Consent and compatibility

The About-you disclosure will say that the supplied contact information is used to deliver results and may be shared with authorized Scaling Up staff and the verified referring coach, with a Privacy Policy link covering retention. It will no longer claim that only name and email are collected.

Existing consumers remain intentionally narrow: report/email identity, the public-campaign submissions list, and the aggregate submissions CSV continue reading only first name, last name, and email. Tests add unrelated contact keys to persisted fixtures and prove today’s output is unchanged. New fields are captured but not surfaced downstream in this scope.

## Test seams

1. Config resolver/builder: real aliases, generic fallback, cloning, schema rejection, prototype-chain aliases, and seeded-alias coverage.
2. Public client: per-template rendering, native required/optional behavior, select/free-text distinction, explicit limits, consent copy, and full configured POST payload.
3. Public submit API: trusted `templateAlias` resolution, configured required/optional validation, unknown-key rejection, additive persistence, and idempotency identity.
4. Existing readers: report/email identity, admin submissions rows, and aggregate CSV output remain unchanged with additive keys present.

## Acceptance report

The implementation handoff must explicitly state:

- end-loaded ordering remains specified historically but the live front-loaded flow is unchanged;
- Coach Email is still derived/verified from the referral link and is not a form field;
- `org-survey` should inherit the same configuration only after its separate identity/contact contract is reviewed, and was not changed here;
- no admin authoring or downstream surfacing was added.
