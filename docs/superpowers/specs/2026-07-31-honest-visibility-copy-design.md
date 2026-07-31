# Truthful Welcome-screen sharing copy (GH #224)

**Date:** 2026-07-31

**Issue:** [#224](https://github.com/ChiefAI-Officer/Scaling-up-platform-v2/issues/224)

**Branch:** `codex/224-honest-visibility-copy`

**Base:** `origin/main` at `bdda554c`

**Status:** Conversation-approved design; implementation has not started

## Goal

Replace the shared Welcome screen's unconditional **Honest & confidential**
claim with a direct, flow-specific explanation of how answers and results are
shared.

The current product does not provide a general anonymity guarantee. Invited
assessment reports may contain named individual answers, and public assessment
results are shared with Scaling Up and, when present, the referring coach. The
Welcome screen must describe those audiences plainly rather than imply privacy
the product does not enforce.

The correction applies to both participant entry flows while preserving the
existing Welcome layout, question-bank claims, stat chips, CTA, and paging.

## Current behavior

`WelcomeExpectations` in
`src/src/components/assessments/assessment-welcome.tsx` hardcodes a lock-icon
row:

> **Honest & confidential**

The component accepts only the row's subline as `confidentialSub`. Both callers
therefore inherit the same confidentiality headline even though their sharing
models differ:

- `OrgSurveyClient` says individual answers feed the team picture and its fine
  print says responses are shared with a facilitator or coach.
- `PublicQuizClient` says results appear immediately and its fine print says
  responses are shared with Scaling Up and a referring coach, if any, who
  receives the full report.

The shared headline overstates both contracts. The lock icon reinforces the
same unsupported implication.

## Approved user-visible contract

Replace the lock row with a people icon and flow-owned disclosure copy.

### Invited assessments

Icon: `👥` (decorative)

> **How your answers are shared**
> Your coach or facilitator and authorized Scaling Up staff can review your
> named individual answers.

### Public assessments

Icon: `👥` (decorative)

> **How your results are shared**
> You receive your results immediately. Authorized Scaling Up staff can review
> your full report; your referring coach can too, if you used their link.

The product-owned sharing row and supporting Welcome copy use none of the words
**confidential**, **anonymous**, or **private**. Those words must not be
inferred from template metadata.

### Default invited lede

Unkeyed invited templates currently render:

> A quick, confidential check on how your team works together. You can answer
> in one sitting or come back later — your link stays active.

That is a second unconditional confidentiality claim on the same screen.
Remove the unsupported adjective while preserving the rest byte-for-byte:

> A quick check on how your team works together. You can answer in one sitting
> or come back later — your link stays active.

Per-template ledes remain unchanged. None of the current keyed ledes makes a
confidentiality, anonymity, or privacy claim.

## Component contract

Replace the misleading `confidentialSub` prop on `WelcomeExpectations` with two
explicit props:

```ts
interface WelcomeExpectationsProps {
  timeLabel: string;
  expectationText: string;
  sharingLabel: string;
  sharingSub: string;
  scoresSub: string;
}
```

The shared component owns only the row structure and the decorative `👥` icon.
Each flow owns its exact sharing label and subline:

- `OrgSurveyClient` supplies the invited wording.
- `PublicQuizClient` supplies the public wording.

There are only two production call sites. No compatibility alias or fallback
copy is needed: making both new props required ensures a future caller must
choose an explicit disclosure rather than silently inherit a privacy claim.

The icon remains `aria-hidden="true"`. The full disclosure remains ordinary
visible text in the accessibility tree.

## Fine-print consolidation

The sharing row becomes the single home for recipient disclosure.

### Invited flow

Remove the duplicated sentence:

> Shared with your facilitator or coach to discuss as a team.

The existing resume note remains conditional. When the resume note is absent,
do not render an empty `su-welcome-fine` paragraph.

### Public flow

Retain only:

> Free to take — you'll get your results on screen and a copy by email.

Remove the now-duplicated recipient sentence from the fine print.

## Why copy does not branch on aggregation mode

`AssessmentTemplate.aggregationMode` currently has `FULL_VISIBILITY` and
`CEO_ONLY` values, but it is not an anonymity policy:

- the editor describes it as who sees individual answers;
- group reports are deliberately fully named and attributed;
- authorized report loaders permit the creator coach and privileged
  admin/staff viewers;
- the current per-respondent and group-report access gates do not branch on
  `aggregationMode`.

Mapping either value to **confidential**, **anonymous**, or **private** would
therefore create another promise the access layer does not guarantee.

GH #224 uses stable, flow-level recipient facts instead. Any future
mode-specific privacy promise must begin with an independently designed and
enforced authorization contract; it is not part of this copy fix.

## Data flow

This is a presentation-only correction:

1. the existing public and invited loaders continue returning their current
   payloads;
2. the invited default-lede constant drops its unsupported confidentiality
   adjective;
3. each client supplies static flow-appropriate sharing copy to
   `WelcomeExpectations`;
4. the shared component renders the supplied label and subline;
5. no result, response, or report data changes.

No `aggregationMode` plumbing, database migration, API change, additional
query, runtime flag, or template-specific branch is introduced.

## Scope boundaries

Included:

- the shared Welcome expectation-row contract;
- the default invited Welcome lede;
- invited Welcome sharing copy;
- public Welcome sharing copy;
- removal of duplicated Welcome fine print;
- prevention of an empty invited fine-print element;
- focused component and participant-flow tests.

Excluded:

- invitation-email confidentiality wording;
- changing `FULL_VISIBILITY` or `CEO_ONLY`;
- report authorization, report recipients, or report delivery;
- anonymization or pseudonymization;
- stored submissions and historical reports;
- broader Welcome layout or visual redesign;
- a feature flag.

Adjacent confidentiality claims outside the two Welcome flows should be
tracked separately rather than silently added to GH #224.

The user declined a visual mockup and approved the text and unchanged-layout
behavior directly.

## Testing

### Shared component

- renders a caller-supplied `sharingLabel`;
- renders a caller-supplied `sharingSub`;
- renders the decorative `👥` icon;
- does not contain **Honest & confidential** or any other hardcoded privacy
  label;
- preserves the time and category-score rows.

### Invited flow

- renders the exact invited label and recipient disclosure;
- product-owned fixed Welcome copy contains no **confidential**, **anonymous**,
  or **private** claim;
- the default invited lede removes **confidential** without changing its resume
  promise;
- removes the duplicated facilitator/coach fine-print sentence;
- renders the existing resume note when applicable;
- does not render an empty fine-print paragraph without a resume note;
- preserves the existing question-count, section-count, optional-scale, and
  CTA behavior.

### Public flow

- renders the exact public label and recipient disclosure;
- product-owned fixed Welcome copy contains no **confidential**, **anonymous**,
  or **private** claim;
- retains the free/on-screen/email-delivery fine print;
- removes the duplicated recipient sentence from the fine print;
- preserves the existing question-count, section-count, optional-scale, and
  CTA behavior.

Focused tests should update the current
`assessment-welcome.test.tsx`, `org-survey-pager.test.tsx`, and
`public-quiz-pager.test.tsx` coverage, plus the exact default-lede assertions in
`welcome-copy.test.ts` and `welcome-lede.test.tsx`. No broad snapshot rewrite is
required.

## Manual visual validation

Because the structure is unchanged, visual validation is limited to regression
checking both Welcome flows:

- desktop width;
- narrow/mobile width;
- label and subline wrapping;
- row alignment with the new icon;
- absence of extra vertical space when invited fine print is omitted.

The review does not authorize a CSS redesign. Any wrapping defect should be
fixed narrowly within the existing `.su-welcome-*` scope.

## Rollout and risk

This is a flagless correctness fix with no stored-data impact. Rollback is a
normal revert.

Primary risks:

- updating only one flow would leave the shared false claim partially live;
- updating the expectation row but not the default invited lede would leave a
  second false claim on unkeyed templates;
- retaining the old fine print would make the disclosure repetitive;
- using `aggregationMode` as a privacy switch would overstate current
  enforcement;
- removing invited fine print without making the element conditional could
  leave empty spacing.

Required props, exact flow tests, and conditional fine-print rendering address
those risks.

## Acceptance criteria

1. Neither public nor invited Welcome renders **Honest & confidential**.
2. The shared row uses the decorative `👥` icon.
3. Invited Welcome renders the approved named-answer recipient disclosure.
4. Public Welcome renders the approved full-report recipient disclosure.
5. The default invited lede no longer calls the assessment confidential and
   preserves its existing resume promise.
6. Sharing disclosure is not derived from `aggregationMode`.
7. The sharing sentence appears once per Welcome screen.
8. Invited Welcome renders no empty fine-print paragraph when no resume note is
   present.
9. Time, question-bank, score, stat-chip, CTA, paging, and submission behavior
   remain unchanged.
10. No schema, API, authorization, report, email-template, or feature-flag
   changes are introduced.
11. Focused automated tests and desktop/mobile visual checks pass.
