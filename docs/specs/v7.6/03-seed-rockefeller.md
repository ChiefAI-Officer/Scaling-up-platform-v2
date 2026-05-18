# Seed (Rockefeller + AccessGroup) — Assessment Tool v7.6

**Spec ref**: v7.6, locked May 15-16 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked. Future revisions land here, NOT in PLAN.md or another spec file.
**Cross-references**: [01-schema](./01-schema.md), [02-service-layer-rules](./02-service-layer-rules.md), [04-deploy-runbook](./04-deploy-runbook.md), [07-bootstrap-runbook](./07-bootstrap-runbook.md)

---

## Locked decisions implemented in this file

- **Decision 2** — AccessGroups grant template access; the seed creates the default "Scaling Up Coaches" group AND its template link.
- **Decision 7** — Self-signed coach lands with zero assessment access until admin adds them. The seed creates the GROUP but adds ZERO coaches; bootstrap runbook covers admin bulk-add.

## Seed deltas

Update the FUTURE multi-template seed slice (not the May 14 Rockefeller seed by itself) to also seed two default Access Groups:
- **"Scaling Up Coaches"** — assigned to all 4 INVITED templates (Rockefeller + Vision Alignment + QSP v2 + Scaling Up Assessment) once they all exist.
- **"Chief AI Officer Coaches"** — assigned only to Scaling Up Assessment.

In the current Foundation Slice (today), only Rockefeller exists. The amended seed:
1. Creates "Scaling Up Coaches" AccessGroup (`upsert` keyed on name, advisory-locked).
2. Creates the link from "Scaling Up Coaches" → Rockefeller template (`upsert` keyed on `(accessGroupId, templateId)`).

Future template seeds append themselves to the appropriate groups using the same `upsert` pattern.

## `seed-rockefeller-assessment.ts` — runs `ensureAccessGroupAndTemplateLink()` on EVERY successful seed state (A/B/D) (Round 1 H-3)

NOT just A/D. Rationale: if a deployment shipped Rockefeller via state A before the AccessGroup amendment, a subsequent run lands in state B (contentHash matches) and would skip group linking entirely. The helper is idempotent and cheap, so running it on B is correct. States C/E/F still throw before reaching this helper.

**Canonical pseudocode lives in the System User Resolution section below** — that version passes `systemUser.id` correctly to both `resolveTemplateAndVersionState` and `ensureAccessGroupAndTemplateLink`.

## `ensureAccessGroupAndTemplateLink(tx, templateId, groupName, systemUserId)` (Round 3 L-2)

Signature now explicit; pseudocode calls below pass `systemUserId`.

Upserts the AccessGroup by name:
- Creates if missing.
- No-op if exists with `deletedAt IS NULL`.
- ERRORS if the group exists but is soft-deleted — explicit operator decision required to un-archive.

Then upserts the `AccessGroupTemplate` row keyed on `(accessGroupId, templateId)`. Both `createdBy` / `addedBy` set to the resolved `systemUserId`.

## Updated seed pseudocode (Round 3 L-2 fix)

```ts
await db.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('assessment-rockefeller-v1-seed'))`);
  const systemUser = await resolveSystemUser(tx);                                   // ← resolved FIRST
  const result = await resolveTemplateAndVersionState(tx, systemUser.id);           // pass for publishedBy
  await ensureAccessGroupAndTemplateLink(tx, result.templateId, "Scaling Up Coaches", systemUser.id);
  return result;
});
```

## System user resolution (Round 2 H-4 + Round 3 M-4)

`AccessGroup.createdBy`, `AccessGroupCoach.addedBy`, `AccessGroupTemplate.addedBy` are FKs to `User.id`. The string literal `"system-seed"` is NOT a valid User.id and would fail the FK constraint. Solution: the seed transaction calls a `resolveSystemUser(tx)` helper FIRST that ALWAYS returns the CANONICAL system user (no first-ADMIN fallback that would create a mismatch with the post-deploy gate):

```ts
async function resolveSystemUser(tx) {
  const SYSTEM_EMAIL = "system-seed@scalingup.platform";
  // Upsert: if missing, create. If present, return as-is. NEVER fall back to first ADMIN.
  // (Earlier draft included first-ADMIN fallback; rejected per Round 3 M-4 because the
  //  post-deploy verify-assessment-foundation.ts gate requires the canonical email AND
  //  matches createdBy / addedBy against this exact user, so any divergence fails the gate.)
  return tx.user.upsert({
    where: { email: SYSTEM_EMAIL },
    create: {
      email: SYSTEM_EMAIL,
      role: "STAFF",  // not ADMIN — system user shouldn't have full admin powers if leaked
      name: "System Seed",
      passwordHash: null,  // no interactive login; null hash means unfillable
    },
    update: {},  // idempotent
  });
}
```

The `publishedBy` field on `AssessmentTemplateVersion` ALSO needs this fix — it's a free-text string in the spec but should reference `User.id` for traceability. Change `publishedBy String?` to `publishedBy String?` with a documented convention: store the resolved `systemUserId` (NOT the literal "system-seed"). For seeds, that's the user resolved above. For human-published versions later, that's the admin's User.id. (The v7.5 schema didn't have a FK on `publishedBy` because templates predate the User schema in early drafts — keep it as a free-form String column to avoid a breaking migration, but document the convention.)

## Post-deploy gate check (`verify-assessment-foundation.ts`) MUST verify

1. System user exists with email `system-seed@scalingup.platform`.
2. "Scaling Up Coaches" AccessGroup exists with `createdBy = systemUser.id` AND `deletedAt IS NULL`.
3. `AccessGroupTemplate(accessGroupId=scalingUpCoaches.id, templateId=rockefeller.id)` exists with `addedBy = systemUser.id`.
4. **(Round 3 H-2):** count of `Coach` rows where `certificationStatus = "ACTIVE"` AND zero rows in `AccessGroupCoach` (eligible-but-unenrolled) — emitted as a WARNING (non-blocking) so on-call sees the bootstrap-runbook backlog.

Exits non-zero if items 1–3 fail. Logs warning + continues if item 4 has a non-zero count.

## Seed state machine (referenced by routing rules)

The seed has 6 named states (A–F). States A, B, D are SUCCESS states (group link is run on each); states C, E, F throw before reaching the group-link helper:

- A — template + version newly created
- B — template exists, content hash matches latest published version (idempotent no-op for template/version, but STILL runs `ensureAccessGroupAndTemplateLink`)
- C — template exists, content hash mismatches latest published version → error (requires human review)
- D — version superseded (new content version published)
- E — version conflict (concurrent publish race) → throw, retry
- F — invalid template payload (validation failed) → throw

(Detailed state-by-state semantics live in the original v7.5 EXECUTION PLAN in the archive; v7.6 only changes the policy that A/B/D ALL run `ensureAccessGroupAndTemplateLink`.)

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
