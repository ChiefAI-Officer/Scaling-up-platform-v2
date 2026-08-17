# Public Marketing Results and Versioned CTA — Design Specification

**Date:** 2026-08-17

**Status:** Approved in visual and section-by-section design review; awaiting written-spec review

**Source:** August 13, 2026 Jeff meeting, ESPERTO verification, production code and data inspection, and the August 10–17 scoping session

## 1. Purpose

Public assessment results currently lack a reusable, template-authored way to reproduce the complete ESPERTO mini-assessment treatment. SunHub needs the legacy result presentation and books-oriented marketing content, while Scaling Up Quick must retain its shorter generic next steps. Future public assessments must be able to carry entirely different marketing content without custom development.

This design adds two explicit assessment-template delivery types, a public-only visual CTA editor, fixed starting presets, and version-pinned rendering. It also makes the public scored-result presentation reproduce the approved ESPERTO structure: overall score, all score bands, detailed answers, then the marketing CTA.

The central invariant is:

> Template type determines whether a marketing CTA is permitted; template identity determines which assessment it is; the pinned Template Version owns the exact public-result and CTA content that renders.

## 2. Evidence and meeting interpretation

Jeff's approved direction in the August 13 meeting was to:

- reproduce the complete ESPERTO public mini-assessment result treatment as closely as the Scaling Up platform permits;
- show the scored result and detailed answers before the marketing section;
- give admins one reusable CTA authoring surface during template setup;
- allow that CTA area to contain several offers, images, buttons, and links;
- support different marketing content for future public assessments without new custom code.

Jeff described the authoring surface as an HTML editor for flexibility. The approved production design preserves the flexible HTML output but does not expose raw HTML to production testers. Admins use a visual block editor; the platform validates and produces sanitized HTML behind the scenes.

Read-only production inspection established that there are currently exactly two active Public Campaign templates:

| Template alias | Current identity | Initial classification |
| --- | --- | --- |
| `scaling-up-quick` | Scaling Up 4 Decisions Assessment | Public marketing quiz |
| `sunhub-quick-quiz` | Scaling Up 4 Decisions 8 Question Quiz / SunHub | Public marketing quiz |

No third assessment type is needed. Scaling Up Quick and SunHub are template identities within the same public type.

## 3. Scope

### 3.1 In scope

- A required template-level delivery type:
  - **Public marketing quiz**
  - **Invited assessment**
- Type selection at Assessment Template creation.
- Permanent type lock after the template's first published version.
- Public-only Marketing CTA card in the Template Version Settings tab.
- Three v1 starting choices:
  - **Full marketing CTA**
  - **Scaling Up Quick**
  - **Start blank**
- A tester-friendly visual CTA block editor.
- Versioned public-result presentation and CTA content.
- Public-result preview before publication.
- Server-side validation, sanitization, compilation, and rendering gates.
- Forward-only classification and content migration for the two existing public templates.
- Public-result rendering after submission for newly created Public Campaigns pinned to the new version.
- Desktop and mobile public-result support.

### 3.2 Out of scope for v1

- Marketing CTA rendering in invited results.
- Results-email, PDF, print, or coach/admin report CTA changes.
- A reusable-preset management screen.
- Admin-created global presets.
- Campaign-level CTA overrides.
- Retroactive CTA changes to existing campaigns.
- Raw HTML editing in the normal admin workflow.
- Arbitrary JavaScript, embedded forms, iframes, tracking snippets, or third-party widgets.
- CRM stages, lead routing, consent changes, or follow-up automation.
- Changing the canonical scored or qualitative result stored for a submission.

## 4. Domain model and terminology

### 4.1 Template delivery type

`AssessmentTemplate` gains a required delivery-type enum with exactly two values:

- `PUBLIC_MARKETING_QUIZ`
- `INVITED_ASSESSMENT`

The production labels are deliberately plain-language labels shown during template creation. A **Public Campaign** remains the canonical campaign term and still means `AssessmentCampaign.accessMode = PUBLIC`.

The delivery type is template-level, not version-level. Once any version of the template has been published, the type is permanently immutable. Duplicating a Template Version does not unlock it. To change delivery purpose, an admin must create or duplicate the entire Assessment Template.

### 4.2 Three separate layers

1. **Delivery type:** Public marketing quiz or Invited assessment.
2. **Template identity:** SunHub, Scaling Up Quick, LVA, Rockefeller Habits, or another named instrument.
3. **Template Version content:** Questions, scoring, public-result presentation, and CTA content frozen for a specific campaign.

This separation prevents a specific template such as Scaling Up Quick from becoming a third delivery-type card.

### 4.3 CTA preset semantics

A preset is a starting-content snapshot. Selecting one copies blocks into the draft Template Version. The draft does not retain a live content dependency on the preset. Later preset changes cannot modify a draft, a published version, or a campaign.

The saved preset identifier is audit metadata only.

## 5. Admin creation flow

### 5.1 Required type selection

The existing **New Assessment Template** form gains a first card named **Assessment type** with two large radio-card choices:

- **Public marketing quiz** — anyone with the public link can participate; available to Public Campaigns; immediate public results; Marketing CTA editor enabled.
- **Invited assessment** — named respondents receive private invitation links; available to regular Campaigns; no Marketing CTA.

Neither choice is preselected. **Create Template** remains disabled until the admin chooses one and completes the existing required template details.

The template name and alias identify the specific assessment. They do not create additional delivery types.

### 5.2 Post-publication lock

Before first publication, the admin may correct the delivery type. At and after first publication:

- the field becomes read-only in the UI;
- template update APIs reject type changes;
- version duplication does not make it editable;
- bulk/import/admin paths enforce the same rule.

## 6. Public-only CTA authoring flow

### 6.1 Placement

For a Public marketing quiz draft, the Settings tab shows **Marketing call to action** immediately after **Language** and before **Invitation email**. Invited assessment templates do not render this card.

### 6.2 Initial state

The first draft of a newly created public template begins with no CTA preset selected. Publication is blocked until the admin deliberately selects a starting choice. A later draft produced by duplicating a published version inherits that version's CTA blocks and preset-origin audit value; it does not force the admin to start over.

The v1 choices are:

1. **Full marketing CTA**
   - legacy Scaling Up books treatment;
   - 32-question assessment offer;
   - complimentary follow-up offer;
   - books purchase offer.
2. **Scaling Up Quick**
   - the shorter current next-step treatment;
   - Learn More action;
   - Talk to a Coach action.
3. **Start blank**
   - an empty visual canvas for future public assessments;
   - cannot publish until it has at least one visible action with a valid destination.

There is no preset-management subsystem in v1.

### 6.3 Applying or switching a preset

Selecting a preset copies its structured blocks into the current draft. The admin can then change every copied text, image, button label, and supported destination.

Before unpublished customization, the admin may freely choose a different preset. Once CTA blocks have been edited, changing presets requires a confirmation that the current unpublished CTA blocks will be replaced. The operation affects only the current draft.

### 6.4 Visual editor

The first editor supports four block types:

- Text
- Image
- Button
- Divider

Admins can add, remove, and reorder blocks. Selecting a block opens plain-language fields appropriate to that block. Selecting a button exposes at least:

- Button text
- Link destination
- Open in new tab
- Move
- Remove

The normal workflow never exposes raw HTML.

### 6.5 Preview and publication

**Preview public result** opens a separate browser tab containing the complete public result using sample answers or a selected score-band sample. It records no Respondent, Public taker, submission, or email. It shows the score/result content, detailed answers, and CTA together so the admin can validate the final participant experience and test every destination.

Safe-to-Publish and the server publication endpoint use the same CTA validation. A public draft cannot publish until:

- a starting choice has been applied;
- at least one visible action exists;
- every visible action has a valid supported destination;
- required image alternative text exists;
- all blocks compile to safe output.

Publishing freezes the resulting content into that Template Version. Changing it later requires duplicating the Active version, editing the new draft, previewing, and publishing a successor.

## 7. Public result presentation

### 7.1 Shared order

The on-screen result for a supported scored Public marketing quiz renders in this order:

1. Semicircle overall-score gauge and numeric score.
2. Every configured score band, with the active band emphasized and the remaining bands visually subdued.
3. Detailed submitted answers.
4. The versioned Marketing CTA.

The CTA is a separate lower section; its preset does not define scoring behavior or score-band copy.

### 7.2 Score bands

Score bands come from versioned scoring/result configuration, not hard-coded template aliases and not the CTA preset. The public renderer lists all configured bands and highlights the band containing the result.

The initial SunHub successor version reproduces the four approved ESPERTO ranges:

- 0–24%
- 25–49%
- 50–74%
- 75–100%

Each range carries its versioned interpretation and supporting copy. The active result band is emphasized; the other three remain visible. This is what Jeff meant by showing the "other percentages" rather than displaying only the participant's matching result.

For future public templates, the renderer remains instrument-aware. Scored templates use their configured score presentation; qualitative templates keep their canonical qualitative result rather than fabricating a percentage. CTA eligibility is independent from score type.

### 7.3 Initial full marketing content

The SunHub successor draft starts from the complete legacy CTA treatment:

- “Next step” copy directing the participant toward the comprehensive 32-question assessment or the Scaling Up books;
- the actual *Mastering the Rockefeller Habits* and *Scaling Up* book artwork;
- **Take the 32-question assessment** → `https://scalinguptoolkit.com/s/ScaleUpQA`;
- explanatory copy for the complimentary one-hour debrief;
- **Request a complimentary follow-up** → `https://coaches.scalingup.com/coach-match-after-assessment-form`;
- **Buy the books** → `https://scalingup.com/book/`.

The implementation must use the approved production artwork and final approved copy, not placeholder book covers or invented marketing text from a low-fidelity mock.

### 7.4 Initial Scaling Up Quick content

The Scaling Up Quick successor draft starts from its current generic on-screen treatment:

- **Learn More** → `https://scalingup.com`;
- **Talk to a Coach** → the validated Referring coach contact when present, otherwise `https://scalingup.com/coaches`.

The editor must preserve this system-managed coach-destination behavior. A button destination may therefore be either a validated static URL/contact link or the supported **Referring coach or coach directory** destination. No general-purpose variable or template language is introduced in v1.

## 8. Persistence model

### 8.1 Template field

The required delivery type lives on `AssessmentTemplate`. It is the source of truth for editor eligibility and campaign-type filtering.

### 8.2 Versioned public-result configuration

The public-result and CTA document lives under the existing versioned report configuration on `AssessmentTemplateVersion`, whose published content is already immutable and content-hashed.

The logical v1 document contains:

```ts
interface MarketingCtaConfigV1 {
  schemaVersion: 1;
  presetOrigin: "FULL_MARKETING" | "SCALING_UP_QUICK" | "BLANK";
  blocks: MarketingCtaBlock[];
  sanitizedHtml: string;
}

type MarketingCtaBlock =
  | { id: string; type: "text"; richText: SupportedRichText }
  | { id: string; type: "image"; assetRef: string; alt: string; link?: LinkTarget }
  | { id: string; type: "button"; label: string; target: LinkTarget; newTab: boolean }
  | { id: string; type: "divider" };

type LinkTarget =
  | { kind: "url"; href: string }
  | { kind: "mailto"; address: string }
  | { kind: "tel"; number: string }
  | { kind: "referringCoachOrDirectory" };
```

Structured blocks are the authoring source of truth. The server deterministically validates and compiles them into a sanitized HTML snapshot for the published version. The compiler verifies that the HTML corresponds to the blocks before save and publication; clients cannot submit trusted HTML independently.

The exact property names may follow existing report-config conventions during implementation, but the ownership, versioning, validation, and no-live-preset semantics are normative.

### 8.3 Why not separate CTA or campaign storage

A dedicated CTA versioning subsystem is rejected for v1 because it duplicates Template Version lifecycle, content hashing, and campaign pinning. Campaign-level CTA storage is rejected because it would permit campaigns from the same Template Version to produce different report conclusions and would contradict the approved new-campaign-only behavior.

## 9. Runtime eligibility and data flow

The on-screen Marketing CTA renders only when all conditions are true:

1. `AssessmentTemplate.deliveryType === PUBLIC_MARKETING_QUIZ`.
2. `AssessmentCampaign.accessMode === PUBLIC`.
3. The campaign's pinned Template Version contains a valid published CTA document.
4. The viewer is on the interactive, on-screen public result reached after a public submission.

If any condition is false, no versioned Marketing CTA renders.

The end-to-end flow is:

```text
Create Public marketing template
  → create/edit draft Template Version
  → choose CTA preset
  → customize blocks and destinations
  → validate and preview public result
  → publish Template Version
  → create Public Campaign
  → campaign pins the Active published version
  → Public taker submits
  → canonical score and detailed answers render
  → pinned version's CTA renders below them
```

A campaign pins its version when the campaign is created. Therefore:

- campaigns created after the successor version is published use the new CTA;
- campaigns created earlier, including campaigns still in draft, retain their prior version and CTA behavior;
- publishing another version later never moves an existing campaign;
- a preset change never changes a campaign.

The regular Campaign wizard lists only Invited assessment templates. Public Campaign creation lists only Public marketing quiz templates. Both UI and API enforce this rule.

## 10. Migration and forward-only rollout

### 10.1 Classification backfill

The migration explicitly marks:

- `scaling-up-quick` as `PUBLIC_MARKETING_QUIZ`;
- `sunhub-quick-quiz` as `PUBLIC_MARKETING_QUIZ`;
- every other existing Assessment Template as `INVITED_ASSESSMENT`.

Runtime behavior must never infer type from an alias.

### 10.2 Content migration

Published Template Versions are not mutated. Forward-only successor drafts are created from the Active versions:

- Scaling Up Quick successor draft receives the Scaling Up Quick preset content.
- SunHub successor draft receives the four-band public result treatment and Full marketing CTA content.

An admin reviews and publishes each successor. Only Public Campaigns created after that publication pin the successor. Existing campaigns remain byte-for-byte tied to their current versions.

### 10.3 Feature-state contract

The implementation ships behind a default-off additive feature flag and kill switch, following the project's wave convention. Flag OFF preserves the current creation form, campaign selection, and result rendering. The schema additions and explicit classification may exist while presentation remains off.

The kill path must stop the new authoring and versioned renderer without corrupting stored drafts. Current production fallback actions remain available under the OFF contract until launch is approved.

## 11. Validation, sanitization, and failure behavior

### 11.1 Supported destinations

Visible actions may use:

- valid HTTPS URLs;
- `mailto:` destinations;
- `tel:` destinations;
- the system-managed Referring coach or coach-directory destination.

Invalid, incomplete, or unsupported destinations are shown beside the affected block and prevent publication.

### 11.2 Images

Images use a platform-managed asset reference or an approved HTTPS source. Published assets must remain available for the lifetime of any retained campaign pinned to the version. Every image requires meaningful alternative text unless it is explicitly decorative.

### 11.3 Prohibited content

The compiler strips or rejects:

- script elements;
- event-handler attributes;
- iframes;
- embedded forms;
- arbitrary style/script injection;
- executable or data URLs;
- unsupported embeds and tracking snippets.

The runtime does not trust client-supplied HTML. Server validation and compilation are authoritative.

### 11.4 Failure isolation

If malformed legacy or stored CTA data reaches the renderer:

- the score, bands, and detailed answers still render;
- the CTA is omitted safely;
- structured telemetry records the template, version, campaign, schema version, and failure class without participant response data;
- the participant never sees raw markup or a stack trace.

UI hiding is not treated as authorization. API operations reject invalid type/campaign combinations, post-publication type changes, and invalid CTA documents.

## 12. Logical components

The implementation should preserve these boundaries even if existing project naming changes the exact file layout:

| Unit | Responsibility |
| --- | --- |
| Template delivery-type policy | Creation requirement, post-publication lock, and campaign eligibility |
| CTA preset catalog | Two fixed system presets plus blank starting state |
| Visual CTA editor | Structured block authoring and accessible tester workflow |
| CTA validator/compiler | Server validation, sanitization, deterministic HTML generation |
| Public-result presentation model | Score gauge, bands, detailed answers, and CTA data from the pinned version |
| Public-result renderer | On-screen public presentation only |
| Campaign/template compatibility gate | Public-to-public and invited-to-invited enforcement |
| Migration/backfill routine | Explicit type classification and successor-draft creation |

No unit should need to infer template type from a name or alias, read CTA content from a live preset, or fetch a newer Template Version than the campaign pins.

## 13. Testing and acceptance coverage

### 13.1 Template type

- Creation requires an explicit Public or Invited choice.
- Neither choice is preselected.
- The server rejects creation without a type.
- Before first publication, type correction works.
- After first publication, UI and every API reject type changes.
- Version duplication does not unlock the type.

### 13.2 Authoring and presets

- The CTA card appears for public drafts and never for invited drafts.
- The first draft of a new public template begins with no preset selected; a draft duplicated from a published version inherits its CTA.
- Publication is blocked until a preset is deliberately selected.
- Full marketing and Scaling Up Quick presets load their exact approved initial blocks and destinations.
- Start blank cannot publish without a visible valid action.
- Switching an edited draft's preset requires confirmation and replaces only that draft's CTA blocks.
- Button fields, image alt text, block reordering and removal, and preview operate without raw HTML.

### 13.3 Security and failure handling

- Invalid URLs and unsafe schemes are rejected.
- Scripts, event handlers, iframes, forms, executable URLs, and unsupported markup are rejected server-side.
- Client-submitted `sanitizedHtml` that does not match deterministic compilation is rejected or overwritten by authoritative compilation.
- A malformed stored CTA cannot break the score and answer result.
- Published assets remain available to older pinned campaigns.

### 13.4 Version and campaign behavior

- Public Campaign creation lists only public templates.
- Regular Campaign creation lists only invited templates.
- APIs reject incompatible template/campaign combinations.
- A campaign created after publication pins the new Active version.
- A campaign created before publication, including a draft campaign, remains on its previous version.
- Duplicating and publishing a successor changes only campaigns created afterward.

### 13.5 Result rendering

- All four initial SunHub score bands render; exactly one is emphasized for boundary and interior scores.
- Boundary coverage includes 0, 24, 25, 49, 50, 74, 75, and 100.
- Score, detailed answers, and CTA render in the approved order.
- The Full marketing CTA renders the actual books and all three valid actions.
- The Scaling Up Quick CTA preserves Referring coach or directory destination behavior.
- Invited on-screen results, results email, PDF, print, and coach/admin reports receive no new CTA.
- Desktop and mobile visual regression receipts cover every public result section.

### 13.6 Migration and production smoke

- Migration tests classify exactly the two verified public aliases as public and all others as invited.
- Migration is idempotent and never mutates an existing published version.
- Successor drafts contain the correct independent CTA content.
- Production smoke creates a disposable public draft and invited draft, verifies editor visibility and publish validation, previews each fixed preset, and archives or removes the disposable records through approved recoverable operations.

## 14. Acceptance criteria

The feature is ready for launch only when:

1. Admins cannot create a template without deliberately choosing Public or Invited.
2. A published template's delivery type cannot change.
3. Only public drafts expose CTA authoring.
4. Public drafts cannot publish without a deliberately selected and valid CTA.
5. Testers can reproduce both current public CTA treatments and entirely new content without writing HTML.
6. SunHub's successor result reproduces the approved score-band and books treatment.
7. Scaling Up Quick retains its distinct regular CTA behavior.
8. Existing campaigns remain on their prior Template Versions.
9. Only Public Campaigns created after successor publication receive the new versioned content.
10. Email, PDF, print, invited, and privileged report surfaces remain unchanged.
11. Targeted tests, ESLint, migration-safety gate, Turbopack build, visual receipts, and production smoke pass under the project's normal launch gates.

## 15. Rejected alternatives

### Separate CTA versioning subsystem

Rejected because it duplicates Template Version immutability, active-version selection, campaign pinning, and content hashing without a v1 requirement that justifies the additional lifecycle.

### Campaign-level CTA selection

Rejected because two campaigns using the same Template Version could display different report content, it would move authoring into campaign launch, and it contradicts the approved template-version ownership model.

### Live template-level CTA

Rejected because editing a hyperlink would retroactively alter already-launched campaigns.

### Raw HTML editor

Rejected as the normal tester workflow because production testers are not assumed to know HTML. The visual editor retains flexible HTML output without exposing unsafe or technical authoring.

### Third type for Scaling Up Quick

Rejected because Scaling Up Quick is a specific public template, not a delivery mode. This would fail to scale as more public assessment templates are introduced.
