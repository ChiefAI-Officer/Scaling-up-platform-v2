---
status: accepted
---

# Public referral ownership is a frozen Coach identity

A verified public-assessment referral is owned by the active Coach resolved when the taker submits, not by the Public Campaign creator and not by whichever Coach currently has the supplied email address. The submission therefore stores a nullable Coach relationship alongside the existing email snapshot; coach access requires that frozen identity plus current active status, while ADMIN/STAFF retain oversight. This prevents email changes from transferring or orphaning named assessment results and separates immutable ownership from revocable viewing eligibility.

## Considered options

- **Match `referringCoachEmail` at read time:** rejected because changing or reusing an email could silently transfer access.
- **Use the Public Campaign creator or Organization owner:** rejected because public campaigns are admin-created and the referring coach does not own the campaign.
- **Leave email delivery as the only coach access:** rejected because it does not provide the persistent visibility requested in Jeff item #83.

## Consequences

- Historical ownership is backfilled only when a `REFERRING_COACH` outbox row proves the active-coach guard succeeded and its canonical recipient matches an existing Coach. A raw taker-supplied email is insufficient.
- Deactivation or certification expiry suspends coach access; reactivation of the same Coach restores it.
- A Coach referenced by a public submission cannot be hard-deleted. Deactivation is the offboarding path; privacy-driven taker-data deletion remains a separate explicit operation.
