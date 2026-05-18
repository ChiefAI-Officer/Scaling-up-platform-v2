# Service-Layer Rules — Assessment Tool v7.6

**Spec ref**: v7.6, locked May 15-16 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked. Future revisions land here, NOT in PLAN.md or another spec file.
**Cross-references**: [01-schema](./01-schema.md), [03-seed-rockefeller](./03-seed-rockefeller.md), [06-observability](./06-observability.md), [07-bootstrap-runbook](./07-bootstrap-runbook.md)

---

## Locked decisions implemented in this file

- **Decision 1** — Hierarchy flip: admins create coaches + assessments; coaches create orgs + participants. Implemented via `canAccessOrganization`, `canCreateCampaign`, ownership-transfer route.
- **Decision 2** — AccessGroups grant template access (no per-coach grant).
- **Decision 3** — `Organization.ownerCoachId` (single coach owner); `OrganizationMembership` dropped; admin-only ownership transfer flow.
- **Decision 6** — INTERSECTION RBAC (not union). Runtime feature flag `ACCESS_POLICY_VERSION` for canary / rollback.
- **Decision 7** — Self-signed coach lands with zero assessment access until admin adds them to an AccessGroup AND their `certificationStatus === "ACTIVE"`. Canonical constant `CERTIFIED_STATUS = "ACTIVE"`.

## Canonical certification constant (Round 3 H-2)

The existing platform uses `certificationStatus="ACTIVE"` for certified coaches (verified May 16 against `src/src/app/(dashboard)/coaches/page.tsx` filters + `src/src/services/hubspot.ts`). NOT `"CERTIFIED"`. Service rules and admin UI MUST use `"ACTIVE"` as the certified value. A canonical constant is introduced to prevent drift:

```ts
// src/src/lib/auth/coach-status.ts
export const CERTIFIED_STATUS = "ACTIVE" as const;
export const PENDING_STATUS = "PENDING" as const;
export const DEACTIVATED_STATUS = "DEACTIVATED" as const;  // proposed; not yet used by existing platform
export function isCertified(coach: { certificationStatus: string }) {
  return coach.certificationStatus === CERTIFIED_STATUS;
}
```

Wave 5 admin Users list filter chips and `canCreateCampaign` use `isCertified()`, never literal strings. Post-deploy verification (`verify-assessment-foundation.ts`) MUST add a count: `eligible coaches (certificationStatus="ACTIVE") vs coaches with at least one active AccessGroup membership` — if the gap exists, log "N certified coaches are not yet in any AccessGroup; bootstrap step missing" as a warning (non-blocking).

## Self-signed coach lifecycle (decision 7)

`/api/auth/coach-signup` stays as-is (creates User + Coach, marks `certificationStatus="PENDING"`, returns the new User/Coach payload — **the route does NOT currently send a welcome email; this addendum does not add one** — corrects Round 1 L-3 spec mismatch). The new coach can log in, view an empty dashboard, edit their bio — but **no template access, no campaign creation, no organizations** until admin adds them to at least one AccessGroup AND their `certificationStatus` transitions to `"ACTIVE"` (the certification gate from `canCreateCampaign` documented below). Group membership alone is insufficient; certification alone is insufficient; both required.

**Bootstrap policy for existing certified coaches (Round 1 H-6):** the v7.5 migration creates the `AccessGroup` / `AccessGroupCoach` / `AccessGroupTemplate` tables but ZERO rows. After deploy, every existing certified coach in the platform has zero group memberships and therefore zero template access. **This is intentional** (no implicit auto-grant), but it means admin must run a one-time bootstrap before coaches can use the assessment tool. See [07-bootstrap-runbook](./07-bootstrap-runbook.md).

**Future automation (deferred):** if Jeff wants new self-signed coaches auto-added to "Scaling Up Coaches" once they're certified, that's a v1.5 feature toggle. v1 stays manual to avoid accidental access grants.

## `canAccessTemplate` — INTERSECTION semantics (decision 6)

`canAccessTemplate(coachActor, templateId): boolean` = **INTERSECTION semantics**. For every `AccessGroupCoach` row this coach owns whose linked `AccessGroup.deletedAt IS NULL`, that AccessGroup MUST have an `AccessGroupTemplate` row for this template. If the coach has zero non-archived groups, returns false (no fallback). Admin/staff bypass.

(Round 2 L-1: join rows themselves are hard-deleted on remove — they don't carry `deletedAt`. Activeness is binary on join existence; soft-delete only applies at the AccessGroup level.)

**Reference test matrix:**
- Coach in group A (templates: T1, T2, T3, T4) + group B (templates: T1) → returns true for T1 only; false for T2, T3, T4.
- Coach in group A (templates: T1, T2) → returns true for T1, T2.
- Coach in zero non-archived groups → returns false for everything.
- Coach in one archived group (group.deletedAt IS NOT NULL) → that group is excluded; coach now has zero effective groups → returns false for everything (this is the "archive shrinks access to zero" case the access-change guard must intercept).
- Coach in zero groups (no `AccessGroupCoach` rows at all) → returns false for everything.
- Admin actor → returns true regardless of groups.

### Rollback safety: `ACCESS_POLICY_VERSION` (Round 1 H-1 + Round 3 H-3)

The rule is gated by a RUNTIME feature flag, NOT a code constant, so a wrong policy can be flipped without a code deploy. Env var `ACCESS_POLICY_VERSION` controls the active policy:
- `"intersection"` (default for v1) — current INTERSECTION semantics.
- `"union"` (emergency revert) — falls back to UNION semantics.
- `"shadow-union"` (canary) — runs INTERSECTION as the authoritative result BUT also computes UNION in parallel and emits a structured-log entry per evaluation when results differ (coach id, template id, intersection result, union result, group ids). No audit log spam.

Env var changes take effect immediately on the next request (Next.js reads `process.env` at request time; restart not required for serverless). Vercel env update + redeploy completes a flip in <2 minutes; for instant flip, set the env var via Vercel CLI without redeploy is also acceptable as long as cold-start regions re-read.

**Pre-flip diff report** stays MANDATORY: for every coach with 2+ groups, compute `intersection(coach.groups.templates)` and `union(coach.groups.templates)` and emit a CSV (coach email, groups, intersect set, union set, delta). Run via `npx dotenv-cli -e .env.production.local -- npx tsx scripts/access-policy-diff.ts > /tmp/access-policy-diff-<ts>.csv`. Operator reviews + ACKs (writes `OperatorAcknowledgement` row with reason + timestamp + actor) BEFORE the env-var flip. No silent reinterpretation of existing rows.

**Canary cohort path (recommended for any future flip):** flip `ACCESS_POLICY_VERSION="shadow-union"` first; collect 7 days of divergence logs; review counts of (intersection-blocks-but-union-allows) and (intersection-allows-but-union-blocks); only then decide whether to flip authoritatively or stay.

## `evaluateAccessChange` — transactional commit (Round 1 H-2 + Round 2 H-2 + Round 2 M-4 + Round 3 H-4)

`evaluateAccessChange(tx, coachId, proposedGroupIds)` + transactional commit. EVERY mutation that affects effective template access — `AccessGroupCoach` add/remove, `AccessGroupTemplate` add/remove, group archive/undelete/hard-delete (Round 2 H-3) — runs as ONE Prisma `$transaction` at `SERIALIZABLE` isolation level (Postgres `BEGIN ISOLATION LEVEL SERIALIZABLE`; failures with `40001` retry up to 3 times with exponential backoff):

1. Acquires TWO sets of advisory locks IN ALPHABETICAL ORDER of their key (deadlock-free convention):
   - `pg_advisory_xact_lock(hashtext('access-change:' || :coachId))` for each affected coach.
   - `pg_advisory_xact_lock(hashtext('access-group:' || :groupId))` for each affected group (prevents concurrent membership insertions during a group-wide mutation).
2. Issues `SELECT ... FOR UPDATE` on the affected `AccessGroup` row (locks the group's row state), every `AccessGroupCoach` row for the affected coach(es), AND every `AccessGroupTemplate` row in the affected group(s). Stale rows fail with serialization error → client retries.
3. Reads `before` effective access via `canAccessTemplate` for every template the coach currently uses in an active campaign.
4. Applies the proposed mutation (insert / delete / soft-delete on the join table or group row).
5. **Re-reads the affected-coach list inside the locked transaction** (addresses Round 3 H-4: a membership insert that appeared after the initial affected-coach list was computed must still be considered). Recompute `after` for ALL coaches now in the group, not just the initial set.
6. If any coach lands at `after.size === 0` AND the coach owns active campaigns or organizations → throws `BLOCKED_ZERO_ACCESS` UNLESS the request body passed `force=true`. The API returns 409.
7. Writes the `AuditLog` row in the same transaction (Round 2 M-4: audit failure aborts the mutation; no swallowed-error mode). Use Prisma's `tx.auditLog.create` directly, NOT `logAudit()` wrapper which swallows.
8. Commits.

Service tests: (a) ADD-only changes (no removal warning); (b) REMOVE that drops a template still in use by an ACTIVE campaign → 409 by default; (c) explicit `force=true` path writes audit row + commits; (d) two concurrent membership POSTs against the same coach serialize through the advisory lock and second-writer sees the first's outcome before its own validation; (e) audit write failure rolls back the mutation.

### Lifecycle mutations covered by the same guard (Round 2 H-3)

- `archiveAccessGroup(groupId)` → soft-delete the group; for EVERY coach in the group, run the guard with the proposed `coachGroupIds` minus this group. If any coach lands at zero effective access (and has active campaigns/orgs), block with 409 unless `force=true`. Same audit row written.
- `undeleteAccessGroup(groupId)` → un-soft-delete; for every coach previously in the group, run the guard. Under INTERSECTION semantics, undeleting can SHRINK access by adding a constraining group back into the intersection — surface the diff to admin via a confirmation modal.
- `hardDeleteAccessGroup(groupId)` → admin-only, requires confirmation; first archives (running the guard), then hard-deletes the group row (cascades via Round 2 L-2 fix).

## Campaign ownership and access revocation (Round 2 M-3, Round 1 H-8)

`AssessmentCampaign.createdByCoachId String?` is the role-specific ownership pointer (see [01-schema](./01-schema.md) for column).

`canManageCampaign(actor, campaignId)`:
- Admin/staff: always true.
- Coach actor matching `campaign.createdByCoachId`: true for READ ops always; true for WRITE ops only if the coach STILL has template access (per `canAccessTemplate`) AND the coach STILL owns the org (`org.ownerCoachId === actor.coachId`).
- When a coach loses template access via group changes: `canManageCampaign` returns true for READ only; the campaign banner explains the state; admin can transfer the campaign separately.
- `Organization.transfer` triggers a follow-on rule: all of the org's `AssessmentCampaign.createdByCoachId` rows transfer to the new owner ONLY IF the new owner has template access for each campaign's template (the transfer's pre-flight already requires this; the campaign update happens in the same transfer transaction).

**Revocation semantics for active campaigns (Round 1 H-8):** when a coach LOSES template access (via group removal or template removal from a group), their EXISTING campaigns using that template STAY ACTIVE and remain manageable by the original coach for read-only operations (view results, view aggregate, mark complete). They cannot CREATE new campaigns using that template, INVITE new respondents to an existing campaign, or REOPEN a closed campaign. The campaign detail page renders a banner "Access to this template has been revoked. You can view results but cannot invite new respondents." Admins can transfer the campaign's ownership to another coach who still has access if needed. Service tests cover: (a) revoke template access → existing campaign list call → 200 with banner flag; (b) revoke + POST /invite → 403 TEMPLATE_ACCESS_REVOKED; (c) revoke + GET /results → 200 unchanged.

## `canCreateCampaign` (Round 1 M-6 + Round 3 H-2)

`canCreateCampaign(coachActor, templateId): boolean` = `canAccessTemplate(coachActor, templateId)` AND `isCertified(coachActor)` (i.e., `certificationStatus === "ACTIVE"` per the canonical constant) AND coach is NOT in a deactivated state.

Round 3 M-6: the existing Coach model has no `deletedAt` column; v7.6 binds deactivation to `certificationStatus="DEACTIVATED"` as a NEW value distinct from PENDING/ACTIVE; admin UI can flip a coach to DEACTIVATED instead of hard-deleting.

Group membership alone does NOT unlock campaign creation; the existing platform certification gate stays in front. PENDING / DEACTIVATED / DENIED / EXPIRED fail this check.

**Test matrix:** (a) ACTIVE + in group with template → 200; (b) PENDING + in group → 403 NOT_CERTIFIED; (c) ACTIVE + no group → 403 NO_TEMPLATE_ACCESS; (d) DEACTIVATED + in group → 403 COACH_DEACTIVATED.

## Organization-level access

- `canAccessOrganization(actor, orgId): boolean` = `org.ownerCoachId === actor.coachId` OR admin/staff bypass.
- `canAccessAggregateReport(actor, templateId): boolean` = admin/staff only. Coach actors NEVER see the admin aggregate dashboard (Wave 5 wireframe 23).

## Ownership transfer flow (Round 1 H-5 + Round 2 M-2 + Round 3 H-5 + Round 3 M-7)

Admin-only operation. New route `POST /api/organizations/[id]/transfer` body `{ newOwnerCoachId: string, reason: string, includeClosedCampaigns: boolean }`. Runs as ONE Prisma `$transaction` at SERIALIZABLE isolation level:

1. Acquires advisory locks in alphabetical key order (deadlock-free):
   - `pg_advisory_xact_lock(hashtext('access-change:' || newOwnerCoachId))` — same lock the access-change guard uses for the new owner, so concurrent group changes on the new owner serialize against the transfer.
   - `pg_advisory_xact_lock(hashtext('org-transfer:' || :orgId))` — serializes concurrent transfers on the same org.
   Plus `pg_advisory_xact_lock(hashtext('access-group:' || groupId))` for EVERY group the new owner belongs to (acquired in sorted order). This blocks concurrent template-removal mutations on the new owner's groups during transfer.
2. `SELECT ... FOR UPDATE` on the `Organization` row.
3. `SELECT ... FOR UPDATE` on every `AssessmentCampaign` row with `organizationId = :orgId` (filter set depends on `includeClosedCampaigns`: if true, ALL campaigns; if false, only `status IN ('DRAFT','ACTIVE')`).
4. `SELECT ... FOR UPDATE` on every `AccessGroupCoach` row AND every `AccessGroupTemplate` row in the new owner's active groups (Round 3 H-5: previously only the AccessGroupCoach rows were locked, leaving AccessGroupTemplate removals racing against the transfer's access revalidation).
5. **Campaign creation conflict prevention (Round 3 H-5):** the regular `POST /api/assessment-campaigns` route MUST acquire the same `pg_advisory_xact_lock(hashtext('org-transfer:' || campaign.organizationId))` lock (as a TRY-lock with short timeout) BEFORE creating the campaign row. If the lock is held by an in-flight transfer, return 409 `ORG_TRANSFER_IN_PROGRESS`. This prevents the OLD owner from racing in a new campaign creation between the transfer's `FOR UPDATE` snapshot and commit.
6. Re-validates AT COMMIT TIME: (a) actor is ADMIN/STAFF; (b) `newOwnerCoachId` references a coach with `isCertified(coach)` true AND coach not in a deactivated state; (c) target coach has template access (via `canAccessTemplate` re-computed from the locked rows) to every template used by EVERY campaign in the locked set (per `includeClosedCampaigns`).
7. Updates `Organization.ownerCoachId`. Updates `AssessmentCampaign.createdByCoachId` per the locked set:
   - `includeClosedCampaigns=true` (recommended default): ALL campaigns transfer to new owner. Cleanest audit. Old coach loses read access to org's campaign history.
   - `includeClosedCampaigns=false`: only ACTIVE/DRAFT campaigns transfer. CLOSED campaigns retain `createdByCoachId = oldOwnerCoachId` — admin must acknowledge the retained-read exception via the transfer request body field `retainedClosedCampaignsAcknowledged: true` (otherwise 409). Each retained campaign gets an `OrganizationOwnershipEvent` row noting the explicit retention.
8. Writes `OrganizationOwnershipEvent` row(s) — one for the org transfer itself, plus one per retained closed campaign if applicable (Round 3 M-7).
9. Commits.

Failure modes (any → tx rolls back, no partial state): 403 not admin; 404 org or new coach not found; 409 target coach lacks template access for one or more campaigns (response body lists the offending campaign aliases); 409 ORG_TRANSFER_IN_PROGRESS if another transfer is in flight; 409 RETAINED_CLOSED_CAMPAIGNS_NOT_ACKNOWLEDGED if `includeClosedCampaigns=false` and admin didn't set the ack flag.

## Audit trail (Round 1 L-2 + Round 3 M-2)

Every MUTATION (`AccessGroupCoach` add/remove, `AccessGroupTemplate` add/remove, group archive/undelete/hard-delete, ownership transfer, force-zero-access override) writes an `AuditLog` row with `entityType="AccessGroupCoach"|"AccessGroupTemplate"|"AccessGroup"|"Organization"`, `entityId=<rowId>`, `action="ADDED"|"REMOVED"|"ARCHIVED"|"UNDELETED"|"HARD_DELETED"|"TRANSFERRED"|"FORCE_ZERO"`, `performedBy=<adminUserId>`, `metadata={accessGroupId, coachId|templateId, reason?, policyVersion}`. Audit writes are transactional (`tx.auditLog.create` direct, never the swallowing `logAudit()` wrapper).

**READ decisions are NOT audited** to AuditLog. The cost (one DB write per `canAccessTemplate` call across every admin list view, dashboard render, and API guard) buries real mutation events and creates an observability anti-pattern. Instead, READ decisions emit a low-cardinality structured log entry to stdout (Vercel captures): `{ level: "info", event: "access.evaluate", coachId, templateId, outcome, policyVersion, requestId, sampled: 0.05 }` with 5% sampling for normal traffic and 100% sampling on DENIED outcomes for two days following any policy flip. No DB write on reads. Soft-delete on the join row itself is NOT used (hard-delete + AuditLog is the audit-of-record).

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
