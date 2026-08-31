# Invited Welcome Sharing Explanation Design

**Status:** Approved for implementation by the item-4 request and the follow-up ESPERTO/co-validation direction

**Issue:** GH #387 item 4 / Handoff D

**Fixed point:** `c0c5b68e80128616c2fd7cce28912ef3a55eed1c`

## 1. Goal

Let ADMIN/STAFF author the explanation beneath the invited Welcome screen's
Sharing heading. The value must flow through assessment creation, draft
editing, respondent preview, future-campaign snapshot creation, and the live
invited Welcome card.

The existing sentence remains the default:

> Your coach or facilitator and authorized Scaling Up staff can review your
> named individual answers.

This change must not alter ADR-0033 campaign-snapshot immutability, rewrite
existing campaign JSON, change public-assessment Welcome screens, or couple
Welcome authoring to invitation-email content.

## 2. Evidence and Diagnosis

### 2.1 Confirmed product gap

`InvitedWelcomeConfigV1` has `sharingHeading`, `scoresHeading`, and
`scoresDescription`, but no Sharing description. `WelcomeScreenCard` therefore
offers a Sharing heading followed immediately by the two Scores fields. The
description beneath Sharing is hardcoded in `InvitedWelcomeCard` and in the
feature-off legacy branch of `org-survey-client.tsx`.

Jeff's annotation asks for the same heading-plus-explanation pairing already
available for Scores. That is the one implementation bug in this item.

### 2.2 ESPERTO read-only walkthrough

An authorized read-only walkthrough on 2026-08-31 used ESPERTO v2.0.6 with the
provided trainer account. No campaign, participant, mail, assessment, or other
record was saved or changed.

Observed behavior:

- campaign creation separates `Basic` from `Mail`;
- existing campaign editing places invitation and reminder selection under a
  dedicated `Mail` tab;
- the invitation preview is a standalone email artifact with its own heading,
  body, CTA, contact block, and `/c/...` destination;
- the trainer campaign editor does not present Welcome-screen copy as part of
  invitation-email customization; and
- the preview's synthetic `/c/test123` destination reaches the participant
  entry route, where the invalid preview token fails independently of the
  email preview.

The evidence supports keeping two explicit concepts: invitation email copy is
what a participant receives; Welcome copy is what the participant sees after
opening their assessment link. ESPERTO does not provide evidence for changing
our campaign snapshot lifecycle, so its behavior is not used to override
ADR-0033.

### 2.3 “Customization not working” diagnosis

The current Scaling Up Platform data flow is:

1. an ADMIN/STAFF save updates `AssessmentTemplate.invitedWelcomeDefault`;
2. a new INVITED campaign copies the resolved default into
   `AssessmentCampaign.invitedWelcomeSnapshot` in its creation transaction;
3. the participant `/me` route reads only that campaign snapshot; and
4. the database trigger rejects changes to an existing non-null snapshot.

Therefore:

| Observation | Verdict |
| --- | --- |
| An existing campaign keeps its earlier Welcome after a template edit | Correct ADR-0033 behavior |
| A campaign created after the save receives the edited Welcome | Required behavior; retain and test |
| An invitation email does not change after editing the Welcome card | Correct separation of surfaces |
| A new campaign created after the save still receives the old value | Genuine snapshot-copy bug; not currently evidenced |

Recommendation: preserve snapshot semantics. Explain to Jeff that the Welcome
card changes the first survey screen for future invited campaigns, not an
existing campaign and not its invitation email. The existing lifecycle banner
already says this; any additional explanatory affordance is a separately
approved copy/UI follow-up, not part of this bug fix.

## 3. Versioned Contract

### 3.1 Choose schema v2

Adding a required persisted field changes the JSON contract. Introduce
`InvitedWelcomeConfigV2` with `schemaVersion: 2` and required
`sharingDescription` rather than silently redefining v1 with an optional field.

Keep an explicit v1 schema for historical reads. One compatibility parser
accepts exact v1 or v2 storage and returns a normalized v2 runtime config:

```ts
export interface InvitedWelcomeConfigV2 {
  schemaVersion: 2;
  eyebrow: string;
  headingTemplate: string;
  ledeParagraphs: string[];
  sharingHeading: string;
  sharingDescription: string;
  scoresHeading: string;
  scoresDescription: string;
  ctaLabel: string;
  finePrint: string | null;
}
```

When the parser reads v1, it supplies the exact existing default Sharing
sentence in memory. Malformed shapes and unknown future schema versions still
fail closed.

### 3.2 Persistence behavior

- Existing v1 campaign snapshots are never updated. Their raw JSON remains
  byte-for-byte unchanged behind the existing immutability trigger.
- `/me` normalizes a valid v1 snapshot to v2 in memory and emits the default
  sentence, preserving its visible behavior.
- Existing v1 template defaults normalize to v2 when loaded for authoring.
- An explicit template save writes v2.
- A newly created INVITED campaign always snapshots normalized v2, including
  when its template row still contains v1.
- PUBLIC campaigns continue to keep `invitedWelcomeSnapshot` null.
- No Prisma schema change or database migration is needed because both columns
  are JSONB and no stored row needs rewriting.

### 3.3 Backfill verifier

The historical verifier must accept both canonical v1 and canonical v2 rows.
It compares normalized parsed semantics with the alias-resolved canonical v2
config rather than comparing raw v1 JSON against v2 JSON. Null, malformed,
future-version, PUBLIC-snapshot, and genuinely mismatched values remain
failures.

## 4. Authoring and Rendering

Add `sharingDescription` to the shared authoring schema with the same required
normalized plain-text and 400-character limit as `scoresDescription`.

The fixed field order is:

1. Invitation label
2. Heading
3. Welcome message
4. Sharing heading
5. Sharing explanation
6. Scores heading
7. Scores explanation
8. Button label

`WelcomeScreenCard` remains the one component used by simplified assessment
creation and draft Build editing. Its preview continues to use
`InvitedWelcomeCard`, so the authored explanation appears immediately.

`InvitedWelcomeCard` passes `config.sharingDescription` to
`WelcomeExpectations`. The legacy feature-off JSX remains structurally
unchanged but uses the shared default constant instead of a second string
literal, preventing future drift without activating authoring in that path.

Server validation remains exact on simplified creation and rejects omitted,
unknown, overlong, control-character, or forged server-owned fields. The PATCH
path keeps its existing nested-payload compatibility policy (known fields are
selected and unknown fields are dropped), rejects forged server-owned fields,
and preserves server-owned `finePrint` while persisting v2.

## 5. Scope Boundaries

Included:

- v1/v2 config parsing and normalization;
- shared authoring validation and defaults;
- simplified-create and Build state/API wiring;
- preview and invited respondent rendering;
- new-campaign snapshot compatibility;
- verifier compatibility;
- focused regression tests and source-of-truth documentation.

Excluded:

- changing or removing the snapshot immutability trigger;
- editing an existing campaign snapshot;
- data migration/backfill or Production writes;
- invitation/reminder email copy or delivery;
- PUBLIC Welcome behavior;
- feature flags or environment variables;
- a new lifecycle-warning UI or per-campaign override.

## 6. Acceptance Tests

1. A v1 stored config parses to v2 with the exact legacy Sharing sentence.
2. A v2 stored config preserves an authored Sharing explanation.
3. Unknown future versions and malformed v1/v2 values fail closed.
4. The authoring schema requires and bounds `sharingDescription`.
5. Simplified creation and template PATCH persist schema v2 with the authored
   value while preserving server-owned fine print.
6. The shared Welcome editor renders `Sharing explanation`, validates it, and
   previews its current value.
7. `InvitedWelcomeCard` renders the authored explanation.
8. `/me` emits an authored v2 snapshot and upgrades a v1 snapshot without a
   database write.
9. Snapshot creation from a v1 template produces v2; a later template value
   does not change the already-returned snapshot object.
10. The verifier accepts canonical v1/v2 legacy rows and rejects actual drift.
11. The legacy feature-off screen still renders today's exact sentence.
12. Existing PUBLIC, invitation-email, snapshot-trigger, and campaign-update
    behavior remains unchanged.
