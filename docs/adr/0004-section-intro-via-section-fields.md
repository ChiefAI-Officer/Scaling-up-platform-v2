# Section intro slides reuse the section's own fields, not a new SECTION_INTRO question type

A **section intro slide** (heading + body shown before a section's questions, see [CONTEXT.md](../../CONTEXT.md)) renders the section's existing `name` and `description` fields. We do **not** introduce a `SECTION_INTRO` (or `INFO`) question type to carry intro copy.

## Context

The Esperto-style one-section-at-a-time flow needs a way to describe each section before its questions. The obvious-looking option — add a non-scored `SECTION_INTRO` question type to the question discriminated union — was the initial instinct (and is recorded in early session notes). On grilling it, the section already owns exactly the fields an intro needs: `name` (heading), `description` (body), `sortOrder`, `domain`. Once we also locked **one section per screen**, the intro is naturally a property *of the section*, not a pseudo-question sitting inside it.

## Considered options

- **New `SECTION_INTRO` question type** — rejected. It widens the question union that `scoreSubmission`, `questionByKey`, every publish/runtime refinement, and both render clients branch on; every one of those sites would need a "skip this, it's not a real question" guard (the same class of bug as the `SLIDER_LIKERT`-only scoring filter). It also creates a second, conflicting home for section copy (a section has a `description` AND an intro-question with body — which wins?). Higher blast radius, ongoing "is this a real question?" tax.
- **Section-level fields (chosen)** — the intro is `section.name` + `section.description`. Zero new question-union members, no scoring-path guards, one home for section copy. Cost: we must **fix the lossy sections serialization** (the admin editor currently drops `description`/`partLabel`/`domain` on save) and we cannot have *standalone* interstitials **unattached** to any section — acceptable, since v1 scopes intros to one-per-section.

**Reinforced by existing data (review, 2026-06-03):** the seeds already use **question-less sections** as welcome/closing slides — QSP v1 `S1_welcome`, LVA `S0_welcome` + `S7_completion` — and QSP v1 + LVA are **published in prod**. So a description-bearing section with **zero questions** is already a live, intentional pattern. The section-fields approach renders these for free; a `SECTION_INTRO` question type would have had nothing to attach to in these sections. This also means an "every section has ≥1 question" publish rule is **wrong** (it would reject live content) — the publish invariant is forward-only (every question resolves to a section), not reverse.

## Consequences

- No change to the question discriminated union; `scoreSubmission` and all publish/runtime refinements are untouched by intro slides.
- A **question-less section is first-class**: it renders as a pure intro/closing/interstitial slide (name + optional description + continue). The pager must handle zero-question sections without dead-ending. The publish invariant stays **forward-only** (every question resolves to a defined section) and explicitly does **not** require ≥1 question per section.
- The admin Sections editor must round-trip `description` (and `partLabel`/`domain`) — fixing a pre-existing serialization bug that silently discarded them. This is a multi-part change (widen the draft model + a raw passthrough preserving key order so the content hash stays stable), not a one-liner — see spec 10 §3.
- Only **unattached** interstitials (a slide bound to no section) are out of scope; if a future instrument needs them, revisit this decision (a dedicated `interstitials[]` array would then be on the table).
- A section with an empty `description` shows no intro copy — the pager goes straight to its questions (or, if it also has no questions, renders a minimal name-only slide).
