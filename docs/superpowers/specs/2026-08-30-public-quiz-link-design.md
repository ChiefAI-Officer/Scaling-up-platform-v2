# Public Mini-Quiz Assessment Link Design

**Date:** 2026-08-30

**Status:** Approved by the user's instruction to implement Handoff C item 2

**Source:** `tmp/handoffs/HANDOFF-C-item2-quiz-link.md`, GitHub #387 item 2, `CONTEXT.md`, and a read-only Production audit

## Goal

Send takers of the eight-question SunHub public quiz to Scaling Up's own public 32-question Four Decisions assessment instead of ESPERTO's `scalinguptoolkit.com` assessment.

## Design

Create one assessment-destination configuration module that identifies the verified Production campaign for the `scaling-up-quick` template. The module owns the canonical public app origin, the campaign alias, and the derived absolute quiz URL. Both the SunHub `publicResultActions` entry and the `FULL_MARKETING` preset consume that exported URL, so the internal destination is declared once rather than copied as two literals.

The destination remains an absolute HTTPS URL because Marketing CTA publication validates static HTTPS targets and freezes them into a Template Version. A runtime database lookup is deliberately excluded from result rendering: result pages must remain deterministic, and the campaign-pinned Marketing CTA is immutable version content. If the canonical 32-question PUBLIC campaign ever changes, operators update this single configuration seam and publish successor CTA versions as required.

## Verified target

The read-only Production audit found exactly one ACTIVE PUBLIC campaign for template alias `scaling-up-quick`:

- Campaign ID: `cmq7k63060002tlro1balnv48`
- Campaign alias: `scaling_up_quick_pub_260610041810`
- Pinned version: v1, `cmq7k2fl60005dgfy362dy4eo`
- Public URL: `https://scaling-up-platform-v2.vercel.app/quiz/scaling_up_quick_pub_260610041810`
- HTTP verification on 2026-08-30: `200`

## Frozen-snapshot blast radius

Production contains five published `sunhub-quick-quiz` Template Versions whose frozen `reportConfig` includes `scalinguptoolkit.com`: v3, v4, v5, v6, and v7. None of those versions has any campaign pinned to it, and therefore none has a live PUBLIC campaign pinned to it.

The sole ACTIVE PUBLIC SunHub campaign is alias `sunhub-quick-quiz`, pinned to v1. Its frozen report configuration does not contain the ESPERTO destination. Its bad link comes from the alias-level `publicResultActions` constant, so the application-code correction changes that live result action without a data write.

No Production correction is required now. The five unpinned historical snapshots remain immutable evidence. If a campaign is later found pinned to a frozen vendor CTA, the operator must choose one separately authorized path: publish a corrected successor and create a new campaign against it, or approve an ADR-0025-style atomic compare-and-swap correction with an explicit audit receipt. This implementation performs neither.

## Scope

In scope:

- one canonical internal assessment-destination configuration;
- the SunHub source-owned public result action;
- the Full Marketing preset used for future snapshots;
- regression coverage that inspects shipped result actions and presets and rejects `scalinguptoolkit.com`;
- source-of-truth documentation of the audit and forward-only limitation.

Out of scope:

- Production data, Template Version, campaign, publication, response, or email writes;
- environment-variable or feature-flag changes;
- repinning an existing campaign;
- rewriting published Template Versions;
- changing the follow-up or books destinations;
- adding a database lookup to report rendering.

## Acceptance criteria

1. No shipped CTA preset or alias-level public result action points to `scalinguptoolkit.com`.
2. SunHub's “Take the 32-question assessment” action points to the verified internal PUBLIC campaign URL.
3. Full Marketing snapshots created after this change use the same internal URL.
4. A regression test fails if the vendor host reappears in either shipped surface.
5. The frozen-version and live-campaign audit is reported without mutating Production.
