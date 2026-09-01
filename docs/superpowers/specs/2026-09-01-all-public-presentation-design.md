# All Public Assessment Presentation Design

## Source request

Jeff Verdun reported that the saved Welcome screen worked for **JV New
Assessment Testing** but not for **Scaling Up 4 Decisions 8 Question Quiz**. He
asked for the behavior to work across every existing assessment and anything
created later. His second screenshot showed the same eight-question assessment's
individual report omitting the authored Preface and Closing/CTA stored in its
Reports tab.

This correction supersedes GH #387 S2 Option C. A schema-valid template Welcome
configuration is authored presentation even when it equals a code-owned seed or
backfill value. Public rendering must not infer author intent by comparing saved
data with a baseline.

## Confirmed root causes

### Public Welcome screen

`resolvePublicWelcomeConfig` normalizes the stored value and then returns `null`
when it canonically equals `resolveLegacyInvitedWelcomeConfig(templateAlias)`.
The eight-question template stores the generic normalized configuration shown in
the editor, so the resolver discards it and the Public page renders the anonymous
fallback. JV's edited template differs from the baseline and therefore works.

The editor's promise—"Public campaigns use these changes immediately"—cannot be
made consistent with baseline comparison. The persisted validated configuration
must be authoritative.

### Eight-question Preface and Closing/CTA

The browser/print individual-report renderers already consume safe `reportHtml`
from a Campaign's pinned Template Version. The Production campaign at
`/quiz/sunhub-quick-quiz` is still pinned to published v1
`cmsm0efu30005dlwfucrosxdm`, which has neither authored Introduction nor Closing.
Published Active v7 `cmtd124fz000413xies2p6bh8` owns both fragments.

A fresh read-only Production preflight on September 1, 2026 verified:

- source campaign `cmsm0jlxo0002lvi3lvb8u2gy` is ACTIVE;
- source alias is `sunhub-quick-quiz`;
- source version is v1 `cmsm0efu30005dlwfucrosxdm`;
- target is v7 `cmtd124fz000413xies2p6bh8`;
- source `updatedAt` is `2026-08-09T16:27:07.375Z`;
- the source has 15 completed submissions at this receipt;
- the connected Production host is
  `ep-falling-sound-aiilz991-pooler.c-4.us-east-1.aws.neon.tech`.

The guarded successor operation implemented in PR #405 is the approved repair.
The count and timestamp above are evidence only; every write must use values from
an immediately preceding dry-run.

## Approved behavior

### Welcome authority

For every Public Campaign, existing or future:

1. Parse `AssessmentTemplate.invitedWelcomeDefault` through
   `invitedWelcomeConfigSchema` so schema-v1 data normalizes to schema v2.
2. When parsing succeeds, render the complete normalized configuration on the
   existing `/quiz/[campaignAlias]` page.
3. Only absent or malformed stored data uses the anonymous Public fallback and
   Campaign description.
4. The Campaign's related `template` remains the data source. URL aliases and
   Campaign aliases never select Welcome content.
5. INVITED Campaigns retain immutable `invitedWelcomeSnapshot` semantics.

This intentionally changes untouched/backfilled Public templates from the
anonymous fallback to their stored Welcome configuration. It does not add a new
editor, schema, migration, feature flag, or contact field.

### Report content and history

The existing report contract remains version-pinned:

- Supported individual browser/print renderers consume the Preface and
  Closing/CTA from the Campaign's pinned Template Version.
- Existing v1 submissions and their reports remain attached to the retired v1
  Campaign and are not retroactively restyled.
- A deterministic v7 successor takes over `sunhub-quick-quiz`; new submissions
  use v7 and therefore receive the authored Preface and Closing/CTA.
- Group/aggregate reports and results-report email remain outside the custom HTML
  authoring contract. They are not changed by this correction.

Loading the latest Template Version at render time or repinning the existing
Campaign is rejected because either action would rewrite historical report
provenance.

## Production cutover

Use the existing `scripts/promote-sunhub-quick-quiz.ts` operation exactly as
designed:

1. Run an operator-bearing read-only dry-run.
2. Execute only its emitted `--quiesce` command. This compare-and-swap closes v1
   while it still owns the public alias and writes the quiescence receipt.
3. Keep the link closed for at least 15 minutes so requests that resolved v1 can
   drain.
4. Run a fresh operator-bearing dry-run after the drain and use its new
   submission count and quiesced `updatedAt`.
5. Execute only the emitted `--apply` command. In one serializable transaction it
   retires the v1 alias, creates deterministic v7 successor
   `item7-sunhub-quick-quiz-v7-successor` under `sunhub-quick-quiz`, and writes the
   promotion receipt.
6. Verify the complete source/successor manifests, unchanged historical
   relations, zero inherited successor relations, the public route, and the
   authored v7 fragments.

Every Production write requires `--i-know-this-is-prod`, the exact database host,
fresh timestamp/count compare-and-swap inputs, and the real operator identity.
Any drift aborts without mutation. There is no rollback to v1 after the successor
accepts submissions; correction is forward-only.

## Acceptance seams

### Automated seams

1. `resolvePublicWelcomeConfig` returns normalized schema-v1 and schema-v2 values,
   including generic and alias-specific seed/backfill configurations; it returns
   `null` only for absent or malformed input.
2. The Public Campaign server page passes that normalized configuration from the
   related Template into `PublicQuizClient` for generic, `sunhub-quick-quiz`, and
   `scaling-up-quick` cases.
3. `PublicQuizClient` renders all eight Welcome fields and resolves
   `{{campaignName}}` for Public Campaigns.
4. Existing INVITED snapshot regression tests remain unchanged and green.
5. The report-HTML matrix proves Introduction and Conclusion rendering across
   Classic scored, Classic qualitative, Executive Boardroom, Modern Dashboard,
   and Scaling Up Full browser/print renderers.
6. The successor-operation suite proves dry-run, quiesce, drain, apply,
   idempotency, provenance, and zero-relation inheritance.

### Production seams

1. The existing `sunhub-quick-quiz` URL returns to ACTIVE after the mandatory
   drain and resolves to the deterministic v7 successor.
2. The retired v1 Campaign retains all 15-or-later historical submissions.
3. The successor begins with zero inherited submissions, participants,
   invitations, reports, or delivery state.
4. The exact deployment and both canonical aliases return HTTP 200 with database
   `healthy` and auth posture `safe`.
5. Manual acceptance verifies the saved Welcome screen and one new v7 individual
   browser/print report. Creating a synthetic Production submission is not part of
   the automated release; Jeff or the user performs that final respondent action.

## Explicit non-goals

- Do not change contact collection or #409.
- Do not change `invitedWelcomeSnapshot` or invited lifecycle semantics.
- Do not change `org-survey/[campaignAlias]/me/route.ts`.
- Do not move lead capture, add Coach Email, or add an admin editor.
- Do not mutate an existing Campaign's `versionId` or existing submissions.
- Do not add latest-version report fallback behavior.
- Do not extend custom report HTML to group/aggregate reports or email.
- Do not create a schema migration, feature flag, or environment toggle.
