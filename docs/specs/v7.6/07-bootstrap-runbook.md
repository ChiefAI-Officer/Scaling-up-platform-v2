# Bootstrap Runbook (admin first-time setup) — Assessment Tool v7.6

**Spec ref**: v7.6, locked May 15-16 2026 (Jeff impromptu meeting + 3 rounds of Codex adversarial review)
**Status**: Locked. Future revisions land here, NOT in PLAN.md or another spec file.
**Cross-references**: [02-service-layer-rules](./02-service-layer-rules.md), [03-seed-rockefeller](./03-seed-rockefeller.md), [04-deploy-runbook](./04-deploy-runbook.md), [05-wireframes-wave5](./05-wireframes-wave5.md), [06-observability](./06-observability.md)

---

## Locked decisions implemented in this file

- **Decision 7** — Self-signed coach lands with zero assessment access until admin adds them to an AccessGroup AND `certificationStatus === "ACTIVE"`. Bootstrap is the admin's first-time, post-deploy step to add the existing certified-coach population to the default group.

## Why this runbook exists (Round 1 H-6)

The v7.5 migration creates the `AccessGroup` / `AccessGroupCoach` / `AccessGroupTemplate` tables but ZERO rows. The Rockefeller seed (see [03-seed-rockefeller](./03-seed-rockefeller.md)) creates the "Scaling Up Coaches" AccessGroup AND links it to the Rockefeller template, but adds ZERO coaches.

After deploy, every existing certified coach in the platform has zero group memberships and therefore zero template access. **This is intentional** (no implicit auto-grant), but it means admin must run a one-time bootstrap before coaches can use the assessment tool.

Until this runbook completes, the assessment tool is invisible/unusable for coaches (their dashboard renders an empty templates list).

## Pre-conditions

Before running this runbook:
1. The full deploy sequence from [04-deploy-runbook](./04-deploy-runbook.md) has completed through step 6 (post-deploy gate `verify-assessment-foundation.ts` exited 0 except for the certified-coach-zero-group WARNING — see [03-seed-rockefeller](./03-seed-rockefeller.md)).
2. The admin is signed in with an `ADMIN` or `STAFF` role.

## Bootstrap steps

1. **Admin opens the new Access Groups list** (Wave 5 wireframe 21 — see [05-wireframes-wave5](./05-wireframes-wave5.md)).

2. **Admin verifies the "Scaling Up Coaches" group exists.** The Rockefeller seed creates it automatically; admin verifies + assigns additional templates if needed (only Rockefeller is linked by default in the foundation slice).

3. **Admin opens Access Group detail** (Wave 5 wireframe 22) for "Scaling Up Coaches" and **bulk-adds every coach** where `isCertified(coach)` returns true (`certificationStatus === "ACTIVE"`) via a **"Bulk add certified coaches"** affordance on the group detail page. The affordance runs the `evaluateAccessChange` guard once with all new memberships staged, surfacing any zero-access edge cases for admin review before commit.

4. **(Optional)** A separate "Chief AI Officer Coaches" group is created manually by admin if needed (no seed default; Jeff didn't name specific CAIO coaches by email).

## Post-bootstrap verification

Admin checks the Wave 5 admin Users list (W5-T11-revised; see [05-wireframes-wave5](./05-wireframes-wave5.md)) filter chips:
- **"Zero effective templates"** — should be empty (or only contain coaches whose intersection of multiple groups legitimately yields zero, e.g., a dual-role coach whose two groups don't overlap).
- **"No group memberships"** — should be empty (every certified coach now has at least the "Scaling Up Coaches" membership).

If the chips return unexpected entries, admin triages by adding/removing group memberships per the `evaluateAccessChange` guard rules (see [02-service-layer-rules](./02-service-layer-rules.md)).

## Observability gate (final check)

Per [06-observability](./06-observability.md), the deploy is NOT considered COMPLETE until:
- The `/admin/observability` dashboard renders all 7 metrics.
- `assessment.certified_zero_effective_template_count` shows `0` (or an explicitly acknowledged non-zero count for legitimately zero-access dual-role coaches).
- No alert gate is currently firing.

If the certified-zero-effective gauge stays non-zero past the bootstrap step, alert gate 5 (`assessment.certified_zero_effective_template_count > N` where `N = 0 after bootstrap step completes`) fires a paged warning to on-call.

## Future automation (deferred)

If Jeff wants new self-signed coaches auto-added to "Scaling Up Coaches" once they're certified, that's a v1.5 feature toggle. v1 stays manual to avoid accidental access grants.

---

**Decision provenance**: see `plans/history/v6-v7.5-archive.md` for the full Codex Round changelogs that produced this spec.
