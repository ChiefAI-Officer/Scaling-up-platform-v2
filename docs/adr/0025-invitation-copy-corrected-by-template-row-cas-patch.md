# ADR-0025 — Live invitation-copy corrections patch the Template row via compare-and-swap; version hashes and coach overrides are left intact

**Status:** Accepted (2026-07-27) — design-phase decision for Jeff July-10 tracker item #69 (Rockefeller invitation email), generalising the one-off pattern from #61 (LVA). Implementation gated (no build until user sayso).

## Context

The **Invitation email copy** (subject + body) lives on the `AssessmentTemplate` row and is read
*live at send time* — `campaign.invitationBodyMarkdown ?? campaign.template.invitationBodyMarkdown`
([invite-send.ts:254-261](../../src/src/lib/assessments/invite-send.ts)) — exactly as CONTEXT.md
records. It is **not** pinned by a Template Version; only a per-campaign override shields a campaign
from template-level edits.

The per-type seed files (`prisma/seed-*-assessment.ts`) are the *factory default* for this copy, but
re-seeding an **already-seeded** template does **not** change the live row: `ensureTemplateVersionContent`
hashes the *stored* invitation values, and invitation copy is template-row data that a re-seed never
rewrites ([seed-template-version.ts:214-219](../../src/src/lib/assessments/seed-template-version.ts)).
So a seed edit alone looks shipped while production is unchanged. #61 (LVA) solved this with a one-off
prod-row patch script (`scripts/patch-lva-invitation-copy.ts`); #69 and the remaining invite-copy items
(#76 SU-Full/QSP, #80 Five Dysfunctions) need the same corrector — and a durable policy for it.

Pre-build review (grill + Codex) surfaced two hazards the naïve "edit the row" approach ignores:

1. **Version-hash staleness.** Every Template Version's `contentHash` *includes* the invitation copy
   ([schema.prisma](../../src/prisma/schema.prisma)). Patching the row leaves published version hashes
   describing content that no longer matches — and published versions are immutable, so their hashes
   cannot simply be repaired.
2. **Coach-authored overrides.** A campaign's `invitationBodyMarkdown` / `invitationSubject` /
   `invitationBodyHtml` (custom HTML replaces the whole shell) each bypass the template row, and that
   copy is deliberately coach-writable (the `isOwner` authoring path).

## Decision

**Correct live invitation copy by an atomic compare-and-swap (CAS) patch against the `AssessmentTemplate`
row — never by a seed re-run, a new Template Version, or an override clobber.**

- **CAS patch.** A single `updateMany({ where: { alias, deletedAt: null, invitationBodyMarkdown:
  EXPECTED_OLD }, data: { invitationBodyMarkdown: NEW } })`; require `count === 1`. On `count === 0`,
  re-read and classify: exact-new body → idempotent success; missing / soft-deleted / any other body →
  **hard fail** (non-zero exit). `EXPECTED_OLD` is sourced from the *live prod row* (which may differ
  from the seed), so the guard matches byte-for-byte. Emit old/new hashes + a receipt. This supersedes
  the read-then-update-by-id shape of `patch-lva-invitation-copy.ts` (a TOCTOU window that also exits 0
  on drift).
- **Seed in lockstep.** Edit the per-type seed file to the same new copy so the factory default and prod
  agree on intent — but treat the CAS patch, not the seed, as the thing that changes production.
- **Version hashes left stale-but-documented.** Do not rewrite a published version's hash. Realign only
  when a preflight finds the **latest** version is an *unpublished draft* that would fail-close an
  imminent re-seed; otherwise document the staleness in the patch script + SoT and move on. Send
  correctness is unaffected because send reads the row, not a version snapshot.
- **Overrides preserved, not clobbered.** Patch the template *default* only. Inventory Rockefeller
  campaigns for overrides / custom HTML and **report** them in the receipt; leave coach-authored copy
  intact. Those campaigns keep old copy until their coach updates it.

## Consequences

**Positive**
- Future sends of default campaigns get the corrected copy immediately (row is read live).
- Race-safe: the CAS guard cannot clobber a concurrent template edit; drift fails loudly.
- Coach authorship is a first-class writable path and is never silently overwritten.
- Reusable, drift-guarded pattern for #76/#80 (and any later invite-copy fix).

**Negative / accepted trade-offs**
- Stale version `contentHash`es are a documented **seeder-hygiene debt**, not a send bug — a re-seed on a
  latest-unpublished-draft template needs the named escalation path.
- Campaigns carrying overrides (esp. custom HTML) retain old copy until the coach edits them; the receipt
  makes that coverage gap explicit rather than hiding it. Already-sent emails never change.

## Alternatives considered

- **Publish a new Template Version to carry the copy** — rejected: invitation copy is not version-pinned
  at send, published versions are immutable, and it is far heavier than a row patch for a copy-only change.
- **Read-then-update-by-id (the original LVA script)** — rejected: TOCTOU window between read and write,
  and it exits 0 on missing/drifted rows, so a silent no-op reads as success.
- **Clobber all campaign overrides to enforce copy platform-wide** — rejected: destroys deliberate
  coach-authored copy; #69 is a default-template fix, not a mandate to overwrite customisations.

## Related

- CONTEXT.md — "the **Invitation email copy** … lives on the **Template** itself, read live at send time …
  only a per-campaign override shields a campaign."
- Generalises #61 (`scripts/patch-lva-invitation-copy.ts`); pattern for #76 / #80.
- Plan: `~/.claude/plans/floating-juggling-kitten.md` ("Next item: #69").
